import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../src/server/database.js";
import { claimSync, executeSync } from "../src/server/sync-service.js";
import { createSyncWorker } from "../src/server/sync-worker.js";
import { fixtureSecret, seedTenant, socialPayload } from "../scripts/lib/validation-fixture.js";

function fixture(context) {
  const database = openDatabase(":memory:");
  context.after(() => database.close());
  const tenant = seedTenant(database, "sync-fixture");
  database.prepare("UPDATE sync_schedules SET next_run_at = datetime('now', '-1 minute')").run();
  const claim = claimSync(database, { connectionId: tenant.connectionId, organizationId: tenant.organizationId });
  const options = { database, claim, encryptionSecret: fixtureSecret };
  return { database, tenant, claim, options };
}

function delayedProvider() {
  let resolve;
  let ready;
  const started = new Promise((r) => { ready = r; });
  const provider = { configured: true, fetchData: () => { ready(); return new Promise((r) => { resolve = r; }); } };
  return { provider, started, finish: (data = socialPayload("sync-fixture", 99)) => resolve(data) };
}

test("conexion SQLite independiente no puede reclamar un bloqueo manual vigente", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "sap-sync-test-"));
  const path = join(root, "test.sqlite");
  const first = openDatabase(path);
  const second = openDatabase(path);
  context.after(async () => { second.close(); first.close(); await rm(root, { recursive: true, force: true }); });
  const tenant = seedTenant(first, "separate-db");
  first.prepare("UPDATE sync_schedules SET next_run_at = datetime('now', '-1 minute')").run();
  assert.ok(claimSync(first, { connectionId: tenant.connectionId, organizationId: tenant.organizationId }));
  assert.equal(claimSync(second, { scheduled: true }), null);
  assert.equal(claimSync(second, { connectionId: tenant.connectionId, organizationId: tenant.organizationId }), null);
});

test("resultado tardio no escribe ni libera el bloqueo del nuevo propietario", async (context) => {
  const { database, tenant, options } = fixture(context);
  const delayed = delayedProvider();
  const running = executeSync({ ...options, provider: delayed.provider });
  await delayed.started;
  database.prepare("UPDATE sync_schedules SET lease_expires_at = datetime('now', '-1 second')").run();
  const replacement = claimSync(database, { scheduled: true });
  delayed.finish();
  await assert.rejects(running, { code: "sync_lease_lost" });
  assert.equal(database.prepare("SELECT lease_owner FROM sync_schedules").get().lease_owner, replacement.owner);
  assert.equal(database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(tenant.accountId).metric_value, 10);
});

test("revocacion o desactivacion durante una consulta impiden persistir resultados", async (context) => {
  for (const change of ["UPDATE oauth_connections SET status = 'revoked'", "UPDATE organizations SET status = 'disabled'"]) {
    const { database, options } = fixture(context);
    const delayed = delayedProvider();
    const running = executeSync({ ...options, provider: delayed.provider });
    await delayed.started;
    database.exec(change);
    delayed.finish();
    await assert.rejects(running, { code: "sync_lease_lost" });
    assert.equal(database.prepare("SELECT metric_value FROM metric_snapshots").get().metric_value, 10);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM oauth_sync_runs WHERE status = 'failed'").get().n, 0);
  }
});

test("cambio de permisos o cierre de sesion invalida una sincronizacion manual en curso", async (context) => {
  for (const change of ["UPDATE organization_members SET role_slug = 'client'", "DELETE FROM sessions"]) {
    const { database, tenant, options } = fixture(context);
    const delayed = delayedProvider();
    const running = executeSync({ ...options, provider: delayed.provider,
      actor: { userId: tenant.userId, sessionHash: tenant.sessionHash } });
    await delayed.started;
    database.exec(change);
    delayed.finish();
    await assert.rejects(running, { code: "sync_access_changed" });
    assert.equal(database.prepare("SELECT metric_value FROM metric_snapshots").get().metric_value, 10);
  }
});

test("una tarea pausada descarta el resultado programado pero permite una ejecucion manual posterior", async (context) => {
  const { database, options } = fixture(context);
  options.claim.scheduled = true;
  const delayed = delayedProvider();
  const running = executeSync({ ...options, provider: delayed.provider });
  await delayed.started;
  database.exec("UPDATE sync_schedules SET enabled = 0");
  delayed.finish();
  await assert.rejects(running, { code: "sync_lease_lost" });
  assert.equal(claimSync(database, { scheduled: true }), null);
  const claim = claimSync(database, { connectionId: options.claim.connectionId });
  assert.ok(claim);
  await executeSync({ ...options, claim, provider: { configured: true, fetchData: async () => socialPayload("sync-fixture", 50) } });
  assert.equal(database.prepare("SELECT enabled FROM sync_schedules").get().enabled, 0);
});

test("renueva bloqueo vigente durante la consulta y limpia timers al terminar", async (context) => {
  context.mock.timers.enable({ apis: ["setInterval"] });
  const { database, options } = fixture(context);
  options.claim.leaseSeconds = 12;
  database.exec("UPDATE sync_schedules SET lease_expires_at = datetime('now', '+2 seconds')");
  const before = database.prepare("SELECT lease_expires_at AS value FROM sync_schedules").get().value;
  const delayed = delayedProvider();
  const running = executeSync({ ...options, provider: delayed.provider });
  await delayed.started;
  context.mock.timers.tick(4000);
  assert.ok(database.prepare("SELECT lease_expires_at AS value FROM sync_schedules").get().value > before);
  delayed.finish();
  await running;
  context.mock.timers.tick(4000);
  assert.equal(database.prepare("SELECT lease_owner FROM sync_schedules").get().lease_owner, null);
});

test("timeout limita la tarea y un resultado posterior no modifica la base", async (context) => {
  const { database, options } = fixture(context);
  const delayed = delayedProvider();
  const running = executeSync({ ...options, provider: delayed.provider, timeoutMs: 30 });
  const rejected = assert.rejects(running, { code: "sync_timeout" });
  await delayed.started;
  await rejected;
  delayed.finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(database.prepare("SELECT metric_value FROM metric_snapshots").get().metric_value, 10);
  assert.equal(database.prepare("SELECT lease_owner FROM sync_schedules").get().lease_owner, null);
  assert.equal(database.prepare("SELECT next_run_at > CURRENT_TIMESTAMP AS future FROM sync_schedules").get().future, 1);
});

test("errores de proveedor no guardan secretos y una cuenta inesperada es rechazada", async (context) => {
  for (const mode of ["secret", "wrong-account"]) {
    const { database, options } = fixture(context);
    const provider = { configured: true, async fetchData() {
      if (mode === "secret") throw new Error("sensitive-provider-token");
      return socialPayload("different-account", 99);
    } };
    await assert.rejects(executeSync({ ...options, provider }));
    const stored = JSON.stringify(database.prepare("SELECT error_message FROM oauth_sync_runs").all())
      + JSON.stringify(database.prepare("SELECT metadata_json FROM activity_logs").all());
    assert.ok(!stored.includes("sensitive-provider-token"));
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM social_accounts").get().n, 1);
  }
});

test("apagado espera la tarea activa sin reclamar nuevos trabajos", async (context) => {
  const { database, claim, options } = fixture(context);
  database.prepare("UPDATE sync_schedules SET lease_owner = NULL, lease_expires_at = NULL WHERE id = ?").run(claim.id);
  const delayed = delayedProvider();
  const worker = createSyncWorker({ database, encryptionSecret: fixtureSecret, providers: { youtube: delayed.provider } });
  const running = worker.runOnce();
  await delayed.started;
  let stopped = false;
  const stop = worker.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  delayed.finish();
  await running;
  await stop;
  assert.equal(stopped, true);
  assert.deepEqual(await worker.runOnce(), []);
});
