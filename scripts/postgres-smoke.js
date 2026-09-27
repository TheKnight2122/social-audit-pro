import assert from "node:assert/strict";
import pg from "pg";
import { openDatabase } from "../src/server/database.js";
import { preparePostgresTransfer, applyPostgresTransfer, postgresTransferConfig } from "../src/server/postgres-transfer.js";
import { seedTenant } from "./lib/validation-fixture.js";
import { createPostgresPool, withPostgresTransaction } from "../src/server/postgres-pool.js";
import { createPostgresAccessStore } from "../src/server/access-store.js";

// Only a disposable, empty PostgreSQL database on loopback is admitted by this test.
const url = process.env.POSTGRES_TEST_URL;
const config = postgresTransferConfig(url, true);
const client = new pg.Client(config);
client.on("error", () => {});
const competitor = new pg.Client(config);
competitor.on("error", () => {});
const source = openDatabase(":memory:");
const pools = [];
let plan;
try {
  const first = seedTenant(source, "postgres-fixture-a");
  const second = seedTenant(source, "postgres-fixture-b");
  plan = preparePostgresTransfer(source);
  await client.connect();
  await competitor.connect();
  await competitor.query("BEGIN");
  await competitor.query("SELECT pg_advisory_xact_lock(1935765553, 1)");
  await assert.rejects(() => applyPostgresTransfer(client, plan), { code: "target_busy" });
  await competitor.query("ROLLBACK");
  const broken = { query: (sql, values) => {
    if (sql.startsWith('INSERT INTO "posts"')) throw new Error("injected failure");
    return client.query(sql, values);
  } };
  await assert.rejects(() => applyPostgresTransfer(broken, plan), { code: "transfer_failed" });
  assert.equal((await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'social_audit'")).rows.length, 0);
  const result = await applyPostgresTransfer(client, plan);
  assert.equal(result.verified, true);
  assert.equal(result.counts.organizations, 2);
  await assert.rejects(() => applyPostgresTransfer(client, plan), { code: "target_not_empty" });
  const records = await client.query("SELECT count(*)::int AS n FROM social_audit.posts");
  assert.equal(records.rows[0].n, 2);
  for (let index = 0; index < 2; index++) pools.push(createPostgresPool({ connectionString: url, allowLocalPlaintext: true, max: 3 }));
  const stores = pools.map(createPostgresAccessStore);
  for (const pool of pools) {
    assert.equal((await pool.query("SHOW timezone")).rows[0].TimeZone, "UTC");
    assert.equal((await pool.query("SHOW search_path")).rows[0].search_path, "pg_catalog");
    await withPostgresTransaction(pool, async (connection) => {
      assert.equal((await connection.query("SHOW transaction_isolation")).rows[0].transaction_isolation, "read committed");
    });
  }
  await client.query(`INSERT INTO social_audit.sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
    VALUES ($1, $2, $3, $4, $5)`, [first.sessionHash, first.userId, first.organizationId, first.csrf, new Date(Date.now() + 3600000).toISOString()]);
  assert.equal((await stores[0].loadSession(first.sessionHash)).organizationId, first.organizationId);
  await client.query("UPDATE social_audit.organization_members SET role_slug = 'client' WHERE user_id = $1", [first.userId]);
  assert.equal((await stores[1].loadSession(first.sessionHash)).role, "client");
  await client.query("UPDATE social_audit.sessions SET organization_id = $1 WHERE token_hash = $2", [second.organizationId, first.sessionHash]);
  assert.equal(await stores[0].loadSession(first.sessionHash), undefined);
  await client.query("UPDATE social_audit.sessions SET organization_id = $1, expires_at = $2 WHERE token_hash = $3",
    [first.organizationId, new Date(Date.now() - 60000).toISOString(), first.sessionHash]);
  assert.equal(await stores[1].loadSession(first.sessionHash), undefined);
  const options = { windowSeconds: 900, maxAttempts: 5 };
  const attempts = await Promise.all(Array.from({ length: 30 }, (_, index) =>
    stores[index % 2].consumeLoginAttempt("same-fixture-address", options)));
  assert.equal(attempts.filter(Boolean).length, 5);
  const saved = await client.query("SELECT count(*)::int AS count FROM social_audit.login_attempts WHERE attempt_key = $1", ["same-fixture-address"]);
  assert.equal(saved.rows[0].count, 5);
  assert.equal(await stores[1].consumeLoginAttempt("other-fixture-address", options), true);
  await client.query("UPDATE social_audit.login_attempts SET attempted_at = '2000-01-01T00:00:00.000Z'");
  assert.equal(await stores[0].consumeLoginAttempt("same-fixture-address", options), true);
  console.log("PostgreSQL: traslado, rollback, sesiones, permisos, UTC y limite atomico entre dos pools verificados.");
} catch {
  console.error("Fallo de prueba PostgreSQL. Usar exclusivamente una base desechable vacia en loopback.");
  process.exitCode = 1;
} finally {
  plan?.close(); source.close();
  for (const pool of pools) await pool.end().catch(() => {});
  await competitor.end().catch(() => {}); await client.end().catch(() => {});
}
