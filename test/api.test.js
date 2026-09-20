import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";

function binaryParser(response, callback) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

test("flujo de API, autenticacion, roles, persistencia e integraciones", async (context) => {
  const database = openDatabase(":memory:");
  const youtubeProvider = {
    configured: true,
    getAuthorizationUrl(state) {
      return "https://accounts.example.test/oauth?state=" + encodeURIComponent(state);
    },
    async exchangeCode(code) {
      assert.equal(code, "valid-code");
      return {
        access_token: "youtube-access-token",
        refresh_token: "youtube-refresh-token",
        token_type: "Bearer",
        expiry_date: Date.now() + 3600000,
        scope: "youtube.readonly yt-analytics.readonly"
      };
    },
    async fetchData(tokens) {
      assert.equal(tokens.access_token, "youtube-access-token");
      return {
        account: {
          externalId: "youtube-channel-1",
          name: "Canal de prueba",
          handle: "@canal_prueba",
          metadata: { description: "Canal oficial", thumbnail: "https://example.test/channel.jpg" }
        },
        metrics: [
          { key: "subscribers", value: 2400, recordedAt: "2026-09-20T10:00:00.000Z" },
          { key: "analytics_views", value: 750, recordedAt: "2026-09-19T00:00:00.000Z" }
        ],
        posts: [{
          externalId: "youtube-video-1",
          publishedAt: "2026-09-19T12:00:00.000Z",
          contentType: "video",
          description: "Video obtenido de la API",
          metrics: { views: 750, likes: 80, comments: 12, reach: null, impressions: null },
          raw: { id: "youtube-video-1" }
        }],
        tokens,
        syncedAt: "2026-09-20T10:00:00.000Z"
      };
    }
  };
  const app = createApp({
    database,
    encryptionSecret: "test-encryption-secret-value",
    secureCookies: false,
    loginLimit: { maxAttempts: 20 },
    appBaseUrl: "http://127.0.0.1:4173",
    youtubeProvider
  });
  const admin = request.agent(app);
  const client = request.agent(app);
  let adminCsrf;

  context.after(() => database.close());

  await context.test("expone salud y cabeceras de seguridad", async () => {
    const response = await request(app).get("/api/v1/health").expect(200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.database, "connected");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.match(response.headers["content-security-policy"], /default-src 'self'/);
    assert.equal(response.headers["x-powered-by"], undefined);
  });

  await context.test("permite crear un unico administrador inicial", async () => {
    const setup = await request(app).get("/api/v1/auth/setup").expect(200);
    assert.equal(setup.body.needsInitialAdmin, true);

    await request(app).post("/api/v1/auth/register").send({
      displayName: "Admin",
      email: "admin@example.test",
      password: "corta"
    }).expect(400);

    const response = await admin.post("/api/v1/auth/register").send({
      displayName: "Administrador Demo",
      email: "admin@example.test",
      password: "ClaveSegura123"
    }).expect(201);
    assert.equal(response.body.user.role, "admin");
    assert.ok(response.headers["set-cookie"][0].includes("HttpOnly"));
    assert.ok(response.headers["set-cookie"][0].includes("SameSite=Strict"));
    adminCsrf = response.body.csrfToken;

    const afterSetup = await request(app).get("/api/v1/auth/setup").expect(200);
    assert.equal(afterSetup.body.needsInitialAdmin, false);
  });

  await context.test("protege endpoints y administra usuarios por rol", async () => {
    await request(app).get("/api/v1/users").expect(401);
    const me = await admin.get("/api/v1/auth/me").expect(200);
    assert.equal(me.body.user.email, "admin@example.test");
    assert.ok(me.body.user.permissions.includes("users:manage"));

    await admin.post("/api/v1/auth/register").send({
      displayName: "Cliente Demo",
      email: "client@example.test",
      password: "ClienteSeguro123",
      role: "client"
    }).expect(403);

    await admin.post("/api/v1/auth/register")
      .set("x-csrf-token", adminCsrf)
      .send({
        displayName: "Cliente Demo",
        email: "client@example.test",
        password: "ClienteSeguro123",
        role: "client"
      })
      .expect(201);

    const users = await admin.get("/api/v1/users").expect(200);
    assert.equal(users.body.users.length, 2);
    assert.equal(users.body.users.some((user) => "passwordHash" in user), false);
    const clientUser = users.body.users.find((user) => user.email === "client@example.test");

    await admin.patch("/api/v1/users/" + clientUser.id)
      .set("x-csrf-token", adminCsrf)
      .send({ role: "analyst", status: "active" })
      .expect(200);

    const login = await client.post("/api/v1/auth/login").send({
      email: "client@example.test",
      password: "ClienteSeguro123"
    }).expect(200);
    assert.equal(login.body.user.role, "analyst");
    await client.get("/api/v1/users").expect(403);

    await admin.patch("/api/v1/users/" + me.body.user.id)
      .set("x-csrf-token", adminCsrf)
      .send({ role: "client", status: "active" })
      .expect(400);
  });

  await context.test("cifra configuracion e importa historicos persistentes", async () => {
    await admin.post("/api/v1/integrations/instagram/configure")
      .set("x-csrf-token", adminCsrf)
      .send({
        displayName: "Instagram Empresa",
        clientId: "public-client-id",
        clientSecret: "private-client-secret"
      })
      .expect(201);

    const stored = database.prepare(
      "SELECT client_secret_encrypted AS secret FROM integrations WHERE platform_slug = 'instagram'"
    ).get();
    assert.notEqual(stored.secret, "private-client-secret");
    assert.equal(stored.secret.includes("private-client-secret"), false);

    const imported = await admin.post("/api/v1/integrations/instagram/import")
      .set("x-csrf-token", adminCsrf)
      .send({
        account: {
          externalId: "ig-account-1",
          name: "Cuenta de prueba",
          handle: "@cuenta_prueba"
        },
        metrics: [
          { key: "followers", value: 1200, recordedAt: "2026-09-14T00:00:00Z" },
          { key: "followers", value: 1250, recordedAt: "2026-09-15T00:00:00Z" }
        ],
        posts: [
          {
            externalId: "post-1",
            publishedAt: "2026-09-15T10:00:00Z",
            contentType: "video",
            description: "Publicacion importada",
            metrics: { reach: 5000, likes: 400 }
          }
        ]
      })
      .expect(201);
    assert.equal(imported.body.imported, 3);

    const history = await admin.get(
      "/api/v1/analytics/history?accountId=" + imported.body.accountId + "&metric=followers"
    ).expect(200);
    assert.deepEqual(history.body.history.map((point) => point.value), [1200, 1250]);

    const posts = await admin.get(
      "/api/v1/analytics/posts?accountId=" + imported.body.accountId
    ).expect(200);
    assert.equal(posts.body.posts[0].metrics.reach, 5000);
  });

  await context.test("conecta YouTube por OAuth, cifra tokens y aisla los datos por usuario", async () => {
    const integrations = await admin.get("/api/v1/integrations").expect(200);
    const youtube = integrations.body.integrations.find((item) => item.platform === "youtube");
    assert.equal(youtube.oauthAvailable, true);
    assert.equal(youtube.connectionId, null);

    const start = await admin.get("/api/v1/integrations/youtube/oauth/start").expect(200);
    const authorizationUrl = new URL(start.body.authorizationUrl);
    const oauthState = authorizationUrl.searchParams.get("state");
    assert.ok(oauthState);

    const callback = await request(app)
      .get("/api/v1/integrations/youtube/oauth/callback")
      .query({ code: "valid-code", state: oauthState })
      .expect(302);
    assert.match(callback.headers.location, /oauth=youtube/);
    assert.match(callback.headers.location, /status=success/);

    const stored = database.prepare(
      `SELECT access_token_encrypted AS accessToken,
              refresh_token_encrypted AS refreshToken
       FROM oauth_connections WHERE platform_slug = 'youtube'`
    ).get();
    assert.notEqual(stored.accessToken, "youtube-access-token");
    assert.equal(stored.accessToken.includes("youtube-access-token"), false);
    assert.notEqual(stored.refreshToken, "youtube-refresh-token");

    const replay = await request(app)
      .get("/api/v1/integrations/youtube/oauth/callback")
      .query({ code: "valid-code", state: oauthState })
      .expect(302);
    assert.match(replay.headers.location, /status=error/);
    assert.match(replay.headers.location, /reason=invalid_state/);

    const dashboard = await admin.get("/api/v1/analytics/dashboard").expect(200);
    assert.equal(dashboard.body.source, "official");
    assert.equal(dashboard.body.accounts[0].handle, "@canal_prueba");
    assert.equal(dashboard.body.posts[0].views, 750);
    assert.equal(dashboard.body.posts[0].reach, null);

    const isolatedDashboard = await client.get("/api/v1/analytics/dashboard").expect(200);
    assert.deepEqual(isolatedDashboard.body.accounts, []);
    assert.deepEqual(isolatedDashboard.body.posts, []);

    const secondStart = await client.get("/api/v1/integrations/youtube/oauth/start").expect(200);
    const secondState = new URL(secondStart.body.authorizationUrl).searchParams.get("state");
    const ownershipConflict = await request(app)
      .get("/api/v1/integrations/youtube/oauth/callback")
      .query({ code: "valid-code", state: secondState })
      .expect(302);
    assert.match(ownershipConflict.headers.location, /status=error/);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM oauth_connections").get().count, 1);

    const synced = await admin.post("/api/v1/integrations/youtube/sync")
      .set("x-csrf-token", adminCsrf)
      .expect(200);
    assert.equal(synced.body.recordsImported, 3);

    const refreshed = await admin.get("/api/v1/integrations").expect(200);
    const connected = refreshed.body.integrations.find((item) => item.platform === "youtube");
    assert.equal(connected.status, "connected");
    assert.equal(connected.connectedAccount, "Canal de prueba");
    assert.equal(connected.accountCount, 1);
  });

  await context.test("guarda reportes y registra actividad", async () => {
    const created = await admin.post("/api/v1/reports")
      .set("x-csrf-token", adminCsrf)
      .send({
        title: "Reporte de septiembre",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-15",
        content: { score: 82, conclusion: "Crecimiento positivo" }
      })
      .expect(201);
    assert.ok(created.body.id);

    const reports = await admin.get("/api/v1/reports").expect(200);
    assert.equal(reports.body.reports.length, 1);
    const activity = await admin.get("/api/v1/activity").expect(200);
    assert.ok(activity.body.activity.some((item) => item.action === "reports.created"));

    const pdf = await admin.post("/api/v1/reports/export-pdf")
      .set("x-csrf-token", adminCsrf)
      .send({
        title: "Reporte de prueba",
        platform: "Instagram",
        periodDays: 30,
        content: {
          kpis: { followers: 1200, reach: 8000, impressions: 11000, engagement: 7.25 },
          audit: {
            totalScore: 82,
            label: "Muy bueno",
            dimensions: [{ name: "Engagement", score: 82 }]
          },
          anomalies: [{ type: "Alcance", evidence: "Crecimiento de prueba." }],
          recommendations: [{ priority: "Media", action: "Mantener seguimiento." }]
        }
      })
      .buffer(true)
      .parse(binaryParser)
      .expect("Content-Type", /application\/pdf/)
      .expect(200);
    assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  });

  await context.test("exige CSRF para cerrar sesion", async () => {
    await admin.post("/api/v1/auth/logout").expect(403);
    await admin.post("/api/v1/auth/logout")
      .set("x-csrf-token", adminCsrf)
      .expect(204);
    await admin.get("/api/v1/auth/me").expect(401);
  });
});
