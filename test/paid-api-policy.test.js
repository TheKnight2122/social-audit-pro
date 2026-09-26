import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createXProvider } from "../src/server/integrations/x.js";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";
import { createSyncWorker } from "../src/server/sync-worker.js";
import { persistOAuthSync } from "../src/server/integrations/oauth-storage.js";
import { seedTenant, socialPayload, fixtureSecret } from "../scripts/lib/validation-fixture.js";

test("X bloquea OAuth tokens y lectura por defecto aun con credenciales", async () => {
  let calls = 0;
  const provider = createXProvider({ clientId: "fixture-client", clientSecret: "fixture-secret",
    redirectUri: "https://example.test/callback", async fetchImpl() { calls++; throw new Error("must not run"); } });
  assert.equal(provider.configured, false);
  assert.equal(provider.disabledReason, "cost_not_approved");
  assert.throws(() => provider.getAuthorizationUrl("state"));
  await assert.rejects(provider.exchangeCode("code"));
  await assert.rejects(provider.fetchData({ access_token: "fixture-token" }));
  assert.equal(calls, 0);
});

test("X desactivado no consulta desde rutas ni tareas pendientes existentes", async t => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  const tenant = seedTenant(database, "cost-policy");
  const data = socialPayload("x-account");
  const connected = persistOAuthSync({ database, encryptionSecret: fixtureSecret, userId: tenant.userId,
    organizationId: tenant.organizationId, platform: "x", data, tokens: data.tokens });
  let calls = 0;
  const provider = createXProvider({ clientId: "fixture-client", clientSecret: "fixture-secret",
    redirectUri: "https://example.test/callback", async fetchImpl() { calls++; throw new Error("must not run"); } });
  const app = createApp({ database, providers: { x: provider }, youtubeProvider: { configured: false },
    encryptionSecret: fixtureSecret, operationsToken: "", requestLog: () => {} });
  await request(app).get("/api/v1/integrations/x/oauth/start").set("Cookie", tenant.cookie).expect(503);
  await request(app).post("/api/v1/integrations/x/sync").set("Cookie", tenant.cookie)
    .set("X-CSRF-Token", tenant.csrf).send({}).expect(503);
  const refresh = await request(app).post("/api/v1/analytics/dashboard/refresh").set("Cookie", tenant.cookie)
    .set("X-CSRF-Token", tenant.csrf).send({}).expect(200);
  assert.equal(refresh.body.results.find(item => item.platform === "x").status, "not_configured");
  database.prepare("UPDATE sync_schedules SET next_run_at = datetime('now', '-1 minute') WHERE connection_id = ?").run(connected.connectionId);
  const worker = createSyncWorker({ database, encryptionSecret: fixtureSecret, providers: { x: provider } });
  assert.equal((await worker.runOnce())[0].status, "skipped");
  assert.equal(calls, 0);
});
