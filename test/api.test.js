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
  const app = createApp({
    database,
    encryptionSecret: "test-encryption-secret-value",
    secureCookies: false,
    loginLimit: { maxAttempts: 20 }
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
