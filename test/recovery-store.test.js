import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { openDatabase } from "../src/server/database.js";
import { seedTenant } from "../scripts/lib/validation-fixture.js";
import { preparePostgresTransfer, applyPostgresTransfer } from "../src/server/postgres-transfer.js";
import { createPglitePool } from "../scripts/lib/pglite-pool.js";
import { createSqliteRecoveryStore, createPostgresRecoveryStore } from "../src/server/recovery-store.js";
import { createSqliteEmailStore, createPostgresEmailStore } from "../src/server/email-store.js";
import { createSqliteAccessStore, createPostgresAccessStore } from "../src/server/access-store.js";
import { createEmailService } from "../src/server/email.js";
import { recoveryHttpContract, recoveryTokenContract, recoveryRollbackContract, emailFailureContract } from "../scripts/lib/recovery-contract.js";

async function fixture(engine) {
  const database = openDatabase(":memory:");
  const first = seedTenant(database, "recovery-a");
  const second = seedTenant(database, "recovery-b");
  let pg;
  try {
    let options;
    if (engine === "SQLite") {
      options = { prefix: "", store: createSqliteRecoveryStore(database), emailStore: createSqliteEmailStore(database),
        accessStore: createSqliteAccessStore(database), async query(sql, values = []) {
          const statement = database.prepare(sql);
          const parameters = Object.fromEntries(values.map((value, index) => [String(index + 1), value]));
          return statement.reader ? { rows: statement.all(parameters) } : { rowCount: statement.run(parameters).changes };
        } };
    } else {
      pg = new PGlite();
      const pool = createPglitePool(pg);
      await pool.query("SET TIME ZONE 'UTC'");
      const plan = preparePostgresTransfer(database);
      try { await applyPostgresTransfer(pool, plan); } finally { plan.close(); }
      for (const session of database.prepare("SELECT * FROM sessions").all()) {
        await pool.query(`INSERT INTO social_audit.sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
          VALUES ($1, $2, $3, $4, $5)`, [session.token_hash, session.user_id, session.organization_id, session.csrf_token, session.expires_at]);
      }
      options = { prefix: "social_audit.", store: createPostgresRecoveryStore(pool), emailStore: createPostgresEmailStore(pool),
        accessStore: createPostgresAccessStore(pool), query: pool.query };
    }
    return { ...options, first, second, async close() { database.close(); if (pg) await pg.close(); } };
  } catch (error) { database.close(); if (pg) await pg.close(); throw error; }
}

for (const engine of ["SQLite", "PostgreSQL"]) {
  for (const [description, contract] of [
    ["recuperacion y verificacion HTTP sin revelar cuentas ni secretos", recoveryHttpContract],
    ["enlaces vigentes de un solo uso y reemplazo atomico", recoveryTokenContract],
    ["rollback conserva enlaces contrasenas y sesiones", recoveryRollbackContract],
    ["correo pendiente o fallido no persiste contenido ni errores originales", emailFailureContract]
  ]) {
    test(engine + ": " + description, async () => {
      const options = await fixture(engine);
      try { await contract(options); } finally { await options.close(); }
    });
  }
}

test("fallo al persistir la aceptacion de correo no marca fallo del proveedor ni reenvia", async () => {
  let sends = 0;
  let failures = 0;
  const service = createEmailService({ environment: "production",
    store: { async enqueue() { return 1; }, async markSent() { throw new Error("fixture-database-down"); },
      async markFailed() { failures++; } }, transport: { async sendMail() { sends++; } } });
  await assert.rejects(() => service.send({ to: "fixture@example.test" }), /fixture-database-down/);
  assert.equal(sends, 1);
  assert.equal(failures, 0);
});
