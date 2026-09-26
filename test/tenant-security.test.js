import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";
import { createSyncWorker } from "../src/server/sync-worker.js";
import { fixtureSecret, seedTenant, socialPayload } from "../scripts/lib/validation-fixture.js";

function fixture(context, youtubeProvider = { configured: false }) {
  const database = openDatabase(":memory:");
  context.after(() => database.close());
  const first = seedTenant(database, "first");
  const second = seedTenant(database, "second");
  const app = createApp({ database, encryptionSecret: fixtureSecret, requestLog: () => {},
    operationsToken: "", youtubeProvider, emailService: { configured: false, previewEnabled: false } });
  return { database, first, second, app };
}

test("reportes historicos publicaciones usuarios y actividad no cruzan organizaciones", async (context) => {
  const { app, database, first, second } = fixture(context);
  const report = await request(app).post("/api/v1/reports").set("Cookie", second.cookie)
    .set("X-CSRF-Token", second.csrf).send({ title: "Private second report", content: { secret: "only-second" } }).expect(201);
  for (const path of ["/reports/" + report.body.id,
    "/analytics/history?accountId=" + second.accountId + "&metric=subscribers",
    "/analytics/posts?accountId=" + second.accountId]) {
    await request(app).get("/api/v1" + path).set("Cookie", first.cookie).expect(404);
  }
  await request(app).patch("/api/v1/users/" + second.userId).set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({ role: "client" }).expect(404);
  await request(app).post("/api/v1/organizations/" + second.organizationId + "/select").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({}).expect(404);
  for (const path of ["/reports", "/activity", "/users", "/analytics/accounts", "/analytics/posts", "/analytics/dashboard"]) {
    const result = await request(app).get("/api/v1" + path).set("Cookie", first.cookie).expect(200);
    assert.ok(!JSON.stringify(result.body).includes("second"), path);
  }
  assert.equal(database.prepare("SELECT role_slug FROM organization_members WHERE user_id = ?").get(second.userId).role_slug, "admin");
});

test("identificadores de organizacion del cliente no sustituyen el contexto de sesion", async (context) => {
  const { app, database, first, second } = fixture(context);
  const result = await request(app).post("/api/v1/reports").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({ organizationId: second.organizationId,
      title: "Scoped report", content: {} }).expect(201);
  assert.equal(database.prepare("SELECT organization_id FROM reports WHERE id = ?").get(result.body.id).organization_id, first.organizationId);
  await request(app).post("/api/v1/reports").set("Cookie", first.cookie)
    .set("X-CSRF-Token", second.csrf).send({ title: "Invalid csrf", content: {} }).expect(403);
  await request(app).post("/api/v1/reports").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).set("Origin", "https://untrusted.example.test")
    .send({ title: "Invalid origin", content: {} }).expect(403);
});

test("roles y desactivacion se aplican a sesiones existentes en cada solicitud", async (context) => {
  const { app, database, first } = fixture(context);
  database.prepare("UPDATE organization_members SET role_slug = 'client' WHERE user_id = ?").run(first.userId);
  await request(app).get("/api/v1/users").set("Cookie", first.cookie).expect(403);
  await request(app).post("/api/v1/integrations/youtube/sync").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({}).expect(403);
  await request(app).get("/api/v1/analytics/accounts").set("Cookie", first.cookie).expect(200);
  database.prepare("UPDATE organization_members SET status = 'disabled' WHERE user_id = ?").run(first.userId);
  await request(app).get("/api/v1/analytics/accounts").set("Cookie", first.cookie).expect(401);
});

test("callback OAuth rechaza permisos retirados mientras consulta el proveedor", async (context) => {
  let database;
  let first;
  const provider = { configured: true, getAuthorizationUrl: (state) => "https://example.test/oauth?state=" + state,
    exchangeCode: async () => socialPayload("new-account").tokens,
    async fetchData() {
      database.prepare("UPDATE organization_members SET role_slug = 'client' WHERE user_id = ?").run(first.userId);
      return socialPayload("new-account");
    } };
  const fixtureData = fixture(context, provider);
  ({ database, first } = fixtureData);
  const start = await request(fixtureData.app).get("/api/v1/integrations/youtube/oauth/start").set("Cookie", first.cookie).expect(200);
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  const result = await request(fixtureData.app).get("/api/v1/integrations/youtube/oauth/callback")
    .query({ state, code: "fixture-code" }).expect(302);
  assert.equal(new URL(result.headers.location).searchParams.get("reason"), "invalid_state");
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM oauth_connections").get().n, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM oauth_states").get().n, 0);
  const replay = await request(fixtureData.app).get("/api/v1/integrations/youtube/oauth/callback")
    .query({ state, code: "fixture-code" }).expect(302);
  assert.equal(new URL(replay.headers.location).searchParams.get("reason"), "invalid_state");
});

test("reconexion OAuth no sobrescribe una cuenta con sincronizacion activa", async (context) => {
  const provider = { configured: true, getAuthorizationUrl: (state) => "https://example.test/oauth?state=" + state,
    exchangeCode: async () => socialPayload("first").tokens, fetchData: async () => socialPayload("first", 999) };
  const { app, database, first } = fixture(context, provider);
  const start = await request(app).get("/api/v1/integrations/youtube/oauth/start").set("Cookie", first.cookie).expect(200);
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  database.prepare("UPDATE sync_schedules SET lease_owner = 'active-job', lease_expires_at = datetime('now', '+10 minutes') WHERE connection_id = ?")
    .run(first.connectionId);
  const result = await request(app).get("/api/v1/integrations/youtube/oauth/callback").query({ state, code: "fixture-code" }).expect(302);
  assert.equal(new URL(result.headers.location).searchParams.get("reason"), "sync_in_progress");
  assert.equal(database.prepare("SELECT metric_value FROM metric_snapshots WHERE account_id = ?").get(first.accountId).metric_value, 10);
});

test("HTTP manual y trabajador comparten bloqueo y rechazan una segunda ejecucion", async (context) => {
  let release;
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const provider = { configured: true, fetchData: () => { ready(); return new Promise((r) => { release = r; }); } };
  const { app, database, first } = fixture(context, provider);
  database.prepare("UPDATE sync_schedules SET next_run_at = datetime('now', '-1 minute') WHERE connection_id = ?").run(first.connectionId);
  const active = request(app).post("/api/v1/integrations/youtube/sync").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({}).then((result) => result);
  await started;
  await request(app).post("/api/v1/integrations/youtube/sync").set("Cookie", first.cookie)
    .set("X-CSRF-Token", first.csrf).send({}).expect(409);
  const worker = createSyncWorker({ database, encryptionSecret: fixtureSecret, providers: { youtube: provider } });
  assert.deepEqual(await worker.runOnce(), []);
  release(socialPayload("first", 99));
  assert.equal((await active).status, 200);
});

test("dashboard falla cerrado ante asociaciones incoherentes y no comparte ultima sincronizacion", async (context) => {
  const { app, database, first, second } = fixture(context);
  database.prepare("UPDATE integrations SET last_sync_at = '2099-01-01T00:00:00Z'").run();
  const accounts = await request(app).get("/api/v1/analytics/accounts").set("Cookie", first.cookie).expect(200);
  assert.equal(accounts.body.accounts[0].lastSyncAt, "2026-09-26T00:00:00.000Z");
  database.prepare("UPDATE social_accounts SET oauth_connection_id = ? WHERE id = ?").run(first.connectionId, second.accountId);
  const result = await request(app).get("/api/v1/analytics/dashboard").set("Cookie", first.cookie).expect(200);
  assert.ok(!JSON.stringify(result.body).includes("second"));
  assert.equal(result.body.accounts.length, 1);
});
