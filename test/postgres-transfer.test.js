import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { openDatabase } from "../src/server/database.js";
import { seedTenant } from "../scripts/lib/validation-fixture.js";
import { applyPostgresTransfer, preparePostgresTransfer, postgresTransferConfig, transferTables } from "../src/server/postgres-transfer.js";

function fixture() {
  const source = openDatabase(":memory:");
  const first = seedTenant(source, "transfer-a");
  const second = seedTenant(source, "transfer-b");
  source.prepare("INSERT INTO reports (id, title, content_json, created_by, organization_id) VALUES (90, ?, ?, ?, ?)")
    .run("Informe ' privado", JSON.stringify({ summary: "Prueba", metric: 12.5 }), first.userId, first.organizationId);
  source.prepare("INSERT INTO reports (id, title, content_json, created_by, organization_id) VALUES (120, 'eliminado', '{}', ?, ?)")
    .run(first.userId, first.organizationId);
  source.prepare("DELETE FROM reports WHERE id = 120").run();
  source.prepare("UPDATE users SET mfa_recovery_codes_json = '[\"hash-fixture\"]', mfa_pending_secret_encrypted = 'pending-fixture'").run();
  source.prepare("INSERT INTO email_outbox (recipient, template, payload_json) VALUES ('test@example.test', 'verify', '{}')").run();
  source.prepare("INSERT INTO oauth_sync_runs (connection_id, status) VALUES (?, 'running')").run(first.connectionId);
  source.prepare("INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'password_reset', 'hash-fixture', '2030-01-01')").run(first.userId);
  source.prepare("INSERT INTO oauth_states (state_hash, user_id, platform_slug, expires_at) VALUES ('state-fixture', ?, 'youtube', '2030-01-01')").run(first.userId);
  return { source, first, second };
}

function adapter(database) {
  return { query: async (text, values) => values ? database.query(text, values)
    : (await database.exec(text)).at(-1) || { rows: [] } };
}

test("PostgreSQL transfer preserves content, tenant relationships, ciphertext and sequence high-water marks", async () => {
  const { source, first, second } = fixture();
  const plan = preparePostgresTransfer(source);
  const pg = new PGlite();
  try {
    const result = await applyPostgresTransfer(adapter(pg), plan);
    assert.equal(result.verified, true);
    assert.equal(result.counts.organizations, 2);
    assert.equal(result.counts.posts, 2);
    assert.equal(source.prepare("SELECT count(*) AS n FROM sessions").get().n, 2);
    assert.equal(source.prepare("SELECT enabled FROM sync_schedules LIMIT 1").get().enabled, 1);
    for (const table of transferTables) {
      const sqliteColumns = source.pragma(`table_info(${table})`).map((column) => column.name).sort();
      const pgColumns = (await pg.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'social_audit' AND table_name = $1", [table]))
        .rows.map((row) => row.column_name).sort();
      assert.deepEqual(pgColumns, sqliteColumns, table);
    }
    const connections = (await pg.query("SELECT id, access_token_encrypted FROM social_audit.oauth_connections ORDER BY id")).rows;
    assert.deepEqual(connections, source.prepare("SELECT id, access_token_encrypted FROM oauth_connections ORDER BY id").all());
    assert.deepEqual((await pg.query("SELECT organization_id FROM social_audit.social_accounts ORDER BY id")).rows,
      [{ organization_id: first.organizationId }, { organization_id: second.organizationId }]);
    for (const table of ["sessions", "auth_tokens", "oauth_states"]) {
      assert.equal((await pg.query(`SELECT count(*)::int AS n FROM social_audit.${table}`)).rows[0].n, 0);
    }
    assert.equal((await pg.query("SELECT mfa_recovery_codes_json FROM social_audit.users LIMIT 1")).rows[0].mfa_recovery_codes_json, "[]");
    assert.equal((await pg.query("SELECT enabled FROM social_audit.sync_schedules LIMIT 1")).rows[0].enabled, 0);
    assert.equal((await pg.query("SELECT status FROM social_audit.email_outbox LIMIT 1")).rows[0].status, "failed");
    const report = await pg.query("INSERT INTO social_audit.reports (title, content_json, created_by, organization_id) VALUES ('nuevo', '{}', $1, $2) RETURNING id", [first.userId, first.organizationId]);
    assert.equal(report.rows[0].id, 121);
    const baseline = (await pg.query("SELECT name FROM social_audit.schema_migrations")).rows;
    assert.deepEqual(baseline, [{ name: "001-baseline.sql" }]);
    await assert.rejects(() => pg.query("UPDATE social_audit.social_accounts SET organization_id = $1 WHERE oauth_connection_id = $2", [second.organizationId, first.connectionId]), /foreign key/);
    await assert.rejects(() => pg.query("UPDATE social_audit.sync_schedules SET organization_id = $1 WHERE connection_id = $2", [second.organizationId, first.connectionId]), /foreign key/);
    await assert.rejects(() => pg.query("INSERT INTO social_audit.users (display_name, email, password_hash, role_slug) VALUES ('duplicate', 'TRANSFER-A@EXAMPLE.TEST', 'hash', 'admin')"), /unique/);
    await assert.rejects(() => applyPostgresTransfer(adapter(pg), plan), { code: "target_not_empty" });
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM social_audit.reports")).rows[0].n, 2);
  } finally { plan.close(); source.close(); await pg.close(); }
});

test("PostgreSQL transfer rolls back DDL and records if an insert or verification fails", async () => {
  const { source } = fixture();
  const plan = preparePostgresTransfer(source);
  const pg = new PGlite();
  try {
    const base = adapter(pg);
    for (const corruptVerification of [false, true]) {
      const broken = { query: async (sql, values) => {
        if (!corruptVerification && sql.startsWith('INSERT INTO "posts"')) throw new Error("secret fixture password");
        const result = await base.query(sql, values);
        if (corruptVerification && sql.startsWith('SELECT "id", "title"') && result.rows.length) result.rows[0].title = "altered";
        return result;
      } };
      await assert.rejects(() => applyPostgresTransfer(broken, plan), (error) => {
        assert.doesNotMatch(error.message, /secret fixture/);
        assert.equal(error.code, corruptVerification ? "target_verification" : "transfer_failed");
        return true;
      });
      assert.equal((await pg.query("SELECT 1 FROM pg_namespace WHERE nspname = 'social_audit'")).rows.length, 0);
    }
    assert.equal((await applyPostgresTransfer(base, plan)).verified, true);
  } finally { plan.close(); source.close(); await pg.close(); }
});

test("PostgreSQL transfer rejects occupied databases and concurrent transfers without changes", async () => {
  const source = openDatabase(":memory:");
  const plan = preparePostgresTransfer(source);
  const pg = new PGlite();
  try {
    const base = adapter(pg);
    await pg.exec("CREATE TABLE public.existing (value TEXT); INSERT INTO public.existing VALUES ('keep')");
    await assert.rejects(() => applyPostgresTransfer(base, plan), { code: "target_not_empty" });
    assert.equal((await pg.query("SELECT value FROM public.existing")).rows[0].value, "keep");
    const busy = { query: (sql, values) => sql.includes("pg_try_advisory") ? { rows: [{ acquired: false }] } : base.query(sql, values) };
    await assert.rejects(() => applyPostgresTransfer(busy, plan), { code: "target_busy" });
  } finally { plan.close(); source.close(); await pg.close(); }
});

test("PostgreSQL preflight rejects changed schemas, null bytes, invalid types and tenant mismatches", () => {
  const changes = [
    ["ALTER TABLE users ADD COLUMN unexpected TEXT", "source_schema"],
    ["DELETE FROM schema_migrations WHERE name = '006-multi-provider-oauth.sql'", "source_schema"],
    ["UPDATE reports SET title = char(0)", "source_value"],
    ["UPDATE metric_snapshots SET metric_value = 'invalid'", "source_value"],
    ["UPDATE sqlite_sequence SET seq = 2147483647 WHERE name = 'users'", "source_sequence"],
    ["UPDATE social_accounts SET organization_id = NULL", "source_organization"],
    ["UPDATE social_accounts SET organization_id = (SELECT max(id) FROM organizations) WHERE id = 1", "source_organization"],
    ["UPDATE sync_schedules SET organization_id = (SELECT max(id) FROM organizations) WHERE id = 1", "source_organization"]
  ];
  for (const [sql, code] of changes) {
    const { source } = fixture();
    try { source.exec(sql); assert.throws(() => preparePostgresTransfer(source), { code }); }
    finally { source.close(); }
  }
});

test("PostgreSQL transfer includes committed WAL and verifies multiple batches", async () => {
  const directory = mkdtempSync(join(tmpdir(), "sap-pg-wal-"));
  const source = openDatabase(join(directory, "fixture.sqlite"));
  const pg = new PGlite();
  let plan;
  try {
    const tenant = seedTenant(source, "wal-fixture");
    const insert = source.prepare("INSERT INTO posts (account_id, external_id, published_at, description) VALUES (?, ?, '2026-09-26', ?)");
    source.transaction(() => {
      for (let index = 0; index < 205; index++) insert.run(tenant.accountId, String(index), "Publicacion " + index);
    })();
    plan = preparePostgresTransfer(source);
    source.prepare("DELETE FROM posts").run();
    const result = await applyPostgresTransfer(adapter(pg), plan);
    assert.equal(result.counts.posts, 206);
    assert.equal((await pg.query("SELECT count(*)::int AS n FROM social_audit.posts")).rows[0].n, 206);
  } finally { plan?.close(); source.close(); await pg.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("PostgreSQL preflight refuses broken foreign keys without changing the source", () => {
  const { source } = fixture();
  try {
    source.pragma("foreign_keys = OFF");
    source.prepare("UPDATE posts SET account_id = 999999").run();
    assert.throws(() => preparePostgresTransfer(source), { code: "source_integrity" });
    assert.equal(source.prepare("SELECT count(*) AS n FROM sessions").get().n, 2);
  } finally { source.close(); }
});

test("PostgreSQL CLI check is offline, preserves SQLite and does not print secrets", () => {
  const directory = mkdtempSync(join(tmpdir(), "sap-pg-cli-"));
  const path = join(directory, "fixture.sqlite");
  const source = openDatabase(path);
  seedTenant(source, "cli-fixture");
  source.close();
  try {
    const before = readFileSync(path);
    const env = { ...process.env, MIGRATION_DATABASE_URL: "invalid-private-fixture-secret" };
    const check = spawnSync(process.execPath, ["scripts/database-postgres.js", "check", path], { encoding: "utf8", env });
    assert.equal(check.status, 0, check.stderr);
    const summary = JSON.parse(check.stdout);
    assert.equal(summary.targetWritten, false);
    assert.equal(summary.counts.organizations, 1);
    const failed = spawnSync(process.execPath, ["scripts/database-postgres.js", "apply", path, "--confirm-empty-target"], { encoding: "utf8", env });
    assert.equal(failed.status, 1);
    assert.doesNotMatch(check.stdout + check.stderr + failed.stdout + failed.stderr, /cli-fixture|invalid-private-fixture-secret|encrypted|password_hash/);
    assert.deepEqual(readFileSync(path), before);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("PostgreSQL connection requires verified TLS and explicit loopback exception", () => {
  assert.deepEqual(postgresTransferConfig("postgresql://user:secret@db.example.test/pilot").ssl, { rejectUnauthorized: true });
  assert.equal(postgresTransferConfig("postgres://user:secret@127.0.0.1/pilot", true).ssl, false);
  for (const url of ["invalid", "https://user@db.example.test/pilot", "postgres://user@db.example.test/",
    "postgres://user@db.example.test/pilot?sslmode=no-verify", "postgres://user@db.example.test/pilot?options=x"]) {
    assert.throws(() => postgresTransferConfig(url), { code: "target_config" });
  }
  assert.throws(() => postgresTransferConfig("postgres://user:secret@db.example.test/pilot", true), { code: "target_config" });
});
