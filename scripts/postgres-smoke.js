import assert from "node:assert/strict";
import pg from "pg";
import { openDatabase } from "../src/server/database.js";
import { preparePostgresTransfer, applyPostgresTransfer, postgresTransferConfig } from "../src/server/postgres-transfer.js";
import { seedTenant } from "./lib/validation-fixture.js";

// Only a disposable, empty PostgreSQL database on loopback is admitted by this test.
const url = process.env.POSTGRES_TEST_URL;
const config = postgresTransferConfig(url, true);
const client = new pg.Client(config);
client.on("error", () => {});
const competitor = new pg.Client(config);
competitor.on("error", () => {});
const source = openDatabase(":memory:");
let plan;
try {
  seedTenant(source, "postgres-fixture-a");
  seedTenant(source, "postgres-fixture-b");
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
  console.log("PostgreSQL: traslado de dos empresas, rollback, bloqueo entre conexiones y destino existente verificados.");
} catch {
  console.error("Fallo de prueba PostgreSQL. Usar exclusivamente una base desechable vacia en loopback.");
  process.exitCode = 1;
} finally { plan?.close(); source.close(); await competitor.end().catch(() => {}); await client.end().catch(() => {}); }
