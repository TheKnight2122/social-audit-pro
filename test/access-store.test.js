import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { openDatabase } from "../src/server/database.js";
import { preparePostgresTransfer, applyPostgresTransfer } from "../src/server/postgres-transfer.js";
import { createSqliteAccessStore, createPostgresAccessStore } from "../src/server/access-store.js";
import { createLoginLimiter } from "../src/server/login-limiter.js";
import { sessionLoader, requireAuth, requireCsrf, requirePermission } from "../src/server/middleware.js";
import { seedTenant } from "../scripts/lib/validation-fixture.js";
import { createPglitePool } from "../scripts/lib/pglite-pool.js";

async function fixture(engine) {
  const database = openDatabase(":memory:");
  const first = seedTenant(database, "access-admin");
  const second = seedTenant(database, "access-client", "client");
  let pg;
  try {
    let store;
    let query;
    let prefix = "";
    if (engine === "SQLite") {
      store = createSqliteAccessStore(database);
      query = async (sql, values = []) => {
        const statement = database.prepare(sql);
        const parameters = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
        return statement.reader ? { rows: statement.all(parameters) } : { rowCount: statement.run(parameters).changes };
      };
    } else {
      pg = new PGlite();
      const pool = createPglitePool(pg);
      // Match the real pool's explicit startup timezone, independent of this PC's locale.
      await pool.query("SET TIME ZONE 'UTC'");
      const plan = preparePostgresTransfer(database);
      try { await applyPostgresTransfer(pool, plan); } finally { plan.close(); }
      for (const session of database.prepare("SELECT * FROM sessions").all()) {
        await pool.query(`INSERT INTO social_audit.sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
          VALUES ($1, $2, $3, $4, $5)`,
        [session.token_hash, session.user_id, session.organization_id, session.csrf_token, session.expires_at]);
      }
      prefix = "social_audit.";
      store = createPostgresAccessStore(pool);
      query = pool.query;
    }
    return { first, second, store, query, prefix, async close() { database.close(); if (pg) await pg.close(); } };
  } catch (error) { database.close(); if (pg) await pg.close(); throw error; }
}

for (const engine of ["SQLite", "PostgreSQL"]) {
  test(engine + ": sesiones reflejan roles y empresas vigentes sin devolver secretos de cuenta", async () => {
    const { first, second, store, query, prefix, close } = await fixture(engine);
    try {
      const session = await store.loadSession(first.sessionHash);
      assert.equal(session.id, first.userId);
      assert.equal(session.organizationId, first.organizationId);
      assert.equal(session.csrfToken, first.csrf);
      assert.equal(session.role, "admin");
      assert.equal(Object.keys(session).length, 13);
      assert.doesNotMatch(JSON.stringify(session), /passwordHash|encrypted|recovery_codes/);
      assert.equal(await store.loadSession("invalid"), undefined);
      assert.equal(await store.loadSession("0".repeat(64)), undefined);
      await query(`UPDATE ${prefix}organization_members SET role_slug = 'client' WHERE user_id = $1`, [first.userId]);
      assert.equal((await store.loadSession(first.sessionHash)).role, "client");
      await query(`UPDATE ${prefix}sessions SET organization_id = $1 WHERE token_hash = $2`, [second.organizationId, first.sessionHash]);
      assert.equal(await store.loadSession(first.sessionHash), undefined);
      await query(`UPDATE ${prefix}sessions SET organization_id = $1 WHERE token_hash = $2`, [first.organizationId, first.sessionHash]);
      for (const [table, idColumn, id] of [["users", "id", first.userId],
        ["organizations", "id", first.organizationId], ["organization_members", "user_id", first.userId]]) {
        await query(`UPDATE ${prefix}${table} SET status = 'disabled' WHERE ${idColumn} = $1`, [id]);
        assert.equal(await store.loadSession(first.sessionHash), undefined);
        await query(`UPDATE ${prefix}${table} SET status = 'active' WHERE ${idColumn} = $1`, [id]);
      }
      await query(`DELETE FROM ${prefix}sessions WHERE token_hash = $1`, [first.sessionHash]);
      assert.equal(await store.loadSession(first.sessionHash), undefined);
    } finally { await close(); }
  });

  test(engine + ": expiracion interpreta fechas UTC SQL ISO y desplazamientos horarios", async () => {
    const { first, store, query, prefix, close } = await fixture(engine);
    try {
      for (const minutes of [-5, 5]) {
        const expires = new Date(Date.now() + minutes * 60000);
        const dates = [expires.toISOString(), expires.toISOString().slice(0, 19).replace("T", " "),
          new Date(expires.getTime() + 7200000).toISOString().replace("Z", "+02:00")];
        for (const value of dates) {
          await query(`UPDATE ${prefix}sessions SET expires_at = $1, last_seen_at = '2000-01-01 00:00:00' WHERE token_hash = $2`, [value, first.sessionHash]);
          assert.equal(Boolean(await store.loadSession(first.sessionHash)), minutes > 0, value);
          const last = (await query(`SELECT last_seen_at FROM ${prefix}sessions WHERE token_hash = $1`, [first.sessionHash])).rows[0].last_seen_at;
          assert.equal(last === "2000-01-01 00:00:00", minutes < 0);
        }
      }
    } finally { await close(); }
  });

  test(engine + ": limite compartido atomico admite cinco intentos y mantiene ventanas independientes", async () => {
    const { store, query, prefix, close } = await fixture(engine);
    try {
      const options = { windowSeconds: 900, maxAttempts: 5 };
      const results = await Promise.all(Array.from({ length: 20 }, () => store.consumeLoginAttempt("same-address", options)));
      assert.equal(results.filter(Boolean).length, 5);
      assert.equal(await store.consumeLoginAttempt("second-address", options), true);
      const result = await query(`SELECT count(*) AS count FROM ${prefix}login_attempts WHERE attempt_key = $1`, ["same-address"]);
      assert.equal(Number(result.rows[0].count), 5);
      await query(`UPDATE ${prefix}login_attempts SET attempted_at = '2000-01-01T00:00:00.000Z'`);
      assert.equal(await store.consumeLoginAttempt("same-address", options), true);
      const injection = "x'); DELETE FROM users; --";
      assert.equal(await store.consumeLoginAttempt(injection, { ...options, maxAttempts: 1 }), true);
      assert.equal(await store.consumeLoginAttempt(injection, { ...options, maxAttempts: 1 }), false);
      assert.equal(Number((await query(`SELECT count(*) AS count FROM ${prefix}users`)).rows[0].count), 2);
      await assert.rejects(() => store.consumeLoginAttempt("x", { windowSeconds: 0, maxAttempts: 5 }));
      await assert.rejects(() => store.consumeLoginAttempt("x", { windowSeconds: 900, maxAttempts: 0 }));
    } finally { await close(); }
  });

  test(engine + ": middleware HTTP conserva identidad CSRF permisos y limite de acceso", async () => {
    const { first, second, store, close } = await fixture(engine);
    const app = express();
    app.use(sessionLoader(store));
    app.get("/session", requireAuth, (req, res) => res.json({ id: req.user.id, organizationId: req.user.organizationId }));
    app.post("/admin", requirePermission("users:manage"), requireCsrf, (_req, res) => res.sendStatus(204));
    app.post("/login", createLoginLimiter(store, { maxAttempts: 2 }), (_req, res) => res.sendStatus(204));
    try {
      await request(app).get("/session").expect(401);
      const response = await request(app).get("/session?organizationId=" + second.organizationId).set("Cookie", first.cookie).expect(200);
      assert.deepEqual(response.body, { id: first.userId, organizationId: first.organizationId });
      await request(app).post("/admin").set("Cookie", first.cookie).expect(403);
      await request(app).post("/admin").set("Cookie", first.cookie).set("x-csrf-token", first.csrf).expect(204);
      await request(app).post("/admin").set("Cookie", second.cookie).set("x-csrf-token", second.csrf).expect(403);
      await request(app).post("/login").expect(204);
      await request(app).post("/login").expect(204);
      const limited = await request(app).post("/login").expect(429);
      assert.equal(limited.headers["retry-after"], "900");
      assert.equal(limited.body.error, "rate_limited");
    } finally { await close(); }
  });
}

test("fallos asincronos de base no autorizan ni llegan al controlador protegido", async () => {
  const failure = new Error("driver-secret-fixture");
  const store = { async loadSession() { throw failure; }, async consumeLoginAttempt() { throw failure; } };
  const app = express();
  let handled = false;
  app.use(sessionLoader(store));
  app.get("/private", requireAuth, (_req, res) => { handled = true; res.sendStatus(204); });
  app.post("/login", createLoginLimiter(store), (_req, res) => { handled = true; res.sendStatus(204); });
  app.use((_error, _req, res, _next) => res.status(503).json({ error: "database_unavailable" }));
  const response = await request(app).get("/private").set("Cookie", "sap_session=fixture").expect(503);
  assert.doesNotMatch(JSON.stringify(response.body), /driver-secret-fixture/);
  await request(app).post("/login").expect(503);
  assert.equal(handled, false);
  for (const options of [{ windowMs: NaN }, { maxAttempts: -1 }, { windowMs: 0 }]) {
    assert.throws(() => createLoginLimiter(store, options));
  }
});
