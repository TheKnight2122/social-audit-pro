import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";
import { claimSync } from "../src/server/sync-service.js";
import { fixtureSecret, seedTenant, socialPayload } from "../scripts/lib/validation-fixture.js";

const endpoint = "/api/v1/analytics/dashboard/refresh";
function setup(t, provider) {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  const client = seedTenant(database, "dashboard-client", "client");
  const other = seedTenant(database, "other-company");
  const app = createApp({ database, encryptionSecret: fixtureSecret, requestLog: () => {},
    youtubeProvider: provider, operationsToken: "", emailService: { configured: false, previewEnabled: false } });
  function refresh(body = {}) {
    return request(app).post(endpoint).set("Cookie", client.cookie).set("X-CSRF-Token", client.csrf).send(body);
  }
  return { database, client, other, app, refresh };
}

test("cliente actualiza solamente su organizacion y no obtiene permisos administrativos", async (t) => {
  let calls = 0;
  const f = setup(t, { configured: true, async fetchData() { calls++; return socialPayload("dashboard-client", 42); } });
  const result = await f.refresh({ organizationId: f.other.organizationId }).expect(200);
  assert.deepEqual(result.body.results, [{ platform: "youtube", status: "updated" }]);
  assert.equal(calls, 1);
  assert.equal(f.database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(f.client.accountId).metric_value, 42);
  assert.equal(f.database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(f.other.accountId).metric_value, 10);
  await request(f.app).post("/api/v1/integrations/youtube/sync").set("Cookie", f.client.cookie)
    .set("X-CSRF-Token", f.client.csrf).send({}).expect(403);
  await request(f.app).get("/api/v1/users").set("Cookie", f.client.cookie).expect(403);
});

test("recargas comparten intervalo persistente de quince minutos", async (t) => {
  let calls = 0;
  const f = setup(t, { configured: true, async fetchData() { calls++; return socialPayload("dashboard-client"); } });
  await f.refresh().expect(200);
  const second = await f.refresh().expect(200);
  assert.equal(second.body.results[0].status, "recent_or_busy");
  assert.equal(calls, 1);
  f.database.prepare("UPDATE sync_schedules SET last_started_at = datetime('now', '-16 minutes'), last_completed_at = datetime('now', '-16 minutes')").run();
  await f.refresh().expect(200);
  assert.equal(calls, 2);
});

test("actualizacion requiere sesion CSRF y origen permitido", async (t) => {
  const f = setup(t, { configured: false });
  await request(f.app).post(endpoint).send({}).expect(401);
  await request(f.app).post(endpoint).set("Cookie", f.client.cookie).send({}).expect(403);
  await request(f.app).post(endpoint).set("Cookie", f.client.cookie).set("X-CSRF-Token", f.client.csrf)
    .set("Origin", "https://untrusted.example.test").send({}).expect(403);
});

test("conexion revocada o proveedor sin configurar no disparan consultas", async (t) => {
  const f = setup(t, { configured: false, fetchData() { throw new Error("must not run"); } });
  assert.equal((await f.refresh().expect(200)).body.results[0].status, "not_configured");
  f.database.prepare("UPDATE oauth_connections SET status = 'revoked' WHERE id = ?").run(f.client.connectionId);
  assert.deepEqual((await f.refresh().expect(200)).body.results, []);
});

test("error de proveedor conserva historicos y respeta reintento sin filtrar secretos", async (t) => {
  let calls = 0;
  const f = setup(t, { configured: true, async fetchData() { calls++; throw new Error("private-provider-token"); } });
  const result = await f.refresh().expect(200);
  assert.equal(result.body.results[0].status, "failed");
  assert.ok(!JSON.stringify(result.body).includes("private-provider-token"));
  const dashboard = await request(f.app).get("/api/v1/analytics/dashboard").set("Cookie", f.client.cookie).expect(200);
  assert.equal(dashboard.body.accounts[0].status, "error");
  assert.equal(dashboard.body.posts[0].views, 10);
  f.database.prepare("UPDATE sync_schedules SET last_started_at = datetime('now', '-16 minutes')").run();
  assert.equal((await f.refresh().expect(200)).body.results[0].status, "recent_or_busy");
  assert.equal(calls, 1);
  assert.equal(f.database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(f.client.accountId).metric_value, 10);
});

test("la actualizacion comparte bloqueo con sincronizacion manual y programada", async (t) => {
  const f = setup(t, { configured: true, fetchData() { throw new Error("must not run"); } });
  assert.ok(claimSync(f.database, { connectionId: f.client.connectionId, organizationId: f.client.organizationId }));
  assert.equal((await f.refresh().expect(200)).body.results[0].status, "recent_or_busy");
});

test("salir de la organizacion mientras se consulta impide guardar resultados", async (t) => {
  let f;
  f = setup(t, { configured: true, async fetchData() {
    f.database.prepare("UPDATE sessions SET organization_id = ? WHERE token_hash = ?").run(f.other.organizationId, f.client.sessionHash);
    return socialPayload("dashboard-client", 99);
  } });
  assert.equal((await f.refresh().expect(200)).body.results[0].status, "failed");
  assert.equal(f.database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(f.client.accountId).metric_value, 10);
});

test("desactivar membresia durante actualizacion de cliente impide la escritura", async (t) => {
  let f;
  f = setup(t, { configured: true, async fetchData() {
    f.database.prepare("UPDATE organization_members SET status = 'disabled' WHERE user_id = ?").run(f.client.userId);
    return socialPayload("dashboard-client", 99);
  } });
  assert.equal((await f.refresh().expect(200)).body.results[0].status, "failed");
  assert.equal(f.database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(f.client.accountId).metric_value, 10);
});
