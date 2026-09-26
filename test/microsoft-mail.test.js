import test from "node:test";
import assert from "node:assert/strict";
import { createMicrosoftMailTransport } from "../src/server/microsoft-mail.js";
import { createEmailService, emailTransportFromEnvironment } from "../src/server/email.js";
import { openDatabase } from "../src/server/database.js";
import { seedTenant } from "../scripts/lib/validation-fixture.js";

const settings = { tenantId: "00000000-0000-0000-0000-000000000001",
  clientId: "00000000-0000-0000-0000-000000000002", clientSecret: "fixture-secret", sender: "sender@example.test" };
const message = { to: "recipient@example.test", subject: "Verificacion", text: "Enlace privado", html: "<p>Enlace privado</p>" };
const tokenResponse = () => Response.json({ access_token: "fixture-token", expires_in: 3600 });

test("Graph obtiene token app-only y envia desde el unico buzon configurado", async () => {
  const calls = [];
  const transport = createMicrosoftMailTransport({ ...settings, async fetchImpl(url, options) {
    calls.push({ url, options });
    return calls.length === 1 ? tokenResponse() : new Response(null, { status: 202 });
  } });
  await transport.sendMail({ ...message, from: "ignored@example.test" });
  assert.equal(calls[0].url, "https://login.microsoftonline.com/" + settings.tenantId + "/oauth2/v2.0/token");
  assert.equal(calls[0].options.body.get("grant_type"), "client_credentials");
  assert.equal(calls[0].options.body.get("scope"), "https://graph.microsoft.com/.default");
  assert.equal(calls[0].options.body.get("client_secret"), settings.clientSecret);
  assert.equal(calls[1].url, "https://graph.microsoft.com/v1.0/users/sender%40example.test/sendMail");
  assert.equal(calls[1].options.headers.Authorization, "Bearer fixture-token");
  assert.equal(calls[1].options.redirect, "error");
  assert.ok(calls[1].options.signal instanceof AbortSignal);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.message.body.contentType, "HTML");
  assert.equal(body.message.toRecipients[0].emailAddress.address, message.to);
  assert.equal(body.message.from, undefined);
});

test("Graph comparte token concurrente y lo renueva antes de caducar", async () => {
  let time = 0;
  let tokens = 0;
  let sends = 0;
  const transport = createMicrosoftMailTransport({ ...settings, now: () => time,
    async fetchImpl(url) {
      if (url.includes("/token")) { tokens++; return tokenResponse(); }
      sends++;
      return new Response(null, { status: 202 });
    } });
  await Promise.all([transport.sendMail(message), transport.sendMail(message)]);
  assert.equal(tokens, 1);
  assert.equal(sends, 2);
  time = 3600000;
  await transport.sendMail(message);
  assert.equal(tokens, 2);
});

test("Graph invalida token rechazado pero no reintenta automaticamente el correo", async () => {
  let tokens = 0;
  let sends = 0;
  const transport = createMicrosoftMailTransport({ ...settings, async fetchImpl(url) {
    if (url.includes("/token")) { tokens++; return tokenResponse(); }
    sends++;
    return new Response(null, { status: sends === 1 ? 401 : 202 });
  } });
  await assert.rejects(transport.sendMail(message), { code: "microsoft_mail_failed" });
  assert.equal(sends, 1);
  await transport.sendMail(message);
  assert.equal(tokens, 2);
});

test("Graph rechaza configuracion incompleta y destinatarios multiples sin consultar", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("must not run"); };
  assert.equal(createMicrosoftMailTransport({ ...settings, tenantId: "../common", fetchImpl }), null);
  assert.equal(createMicrosoftMailTransport({ ...settings, clientSecret: "", fetchImpl }), null);
  const transport = createMicrosoftMailTransport({ ...settings, fetchImpl });
  await assert.rejects(transport.sendMail({ ...message, to: "one@example.test,two@example.test" }));
  assert.equal(calls, 0);
});

test("Graph no expone errores del proveedor ni considera 200 una aceptacion sendMail", async () => {
  for (const status of [200, 403, 429, 503]) {
    let sends = 0;
    const transport = createMicrosoftMailTransport({ ...settings, async fetchImpl(url) {
      if (url.includes("/token")) return tokenResponse();
      sends++;
      return new Response("fixture-secret sensitive-recipient", { status });
    } });
    await assert.rejects(transport.sendMail(message), error => {
      assert.ok(!error.message.includes("fixture-secret"));
      return error.code === "microsoft_mail_failed";
    });
    assert.equal(sends, 1);
  }
});

test("fallo al pedir token no intenta enviar y no filtra errores de red", async () => {
  let calls = 0;
  const transport = createMicrosoftMailTransport({ ...settings, async fetchImpl() {
    calls++;
    throw new Error("fixture-secret");
  } });
  await assert.rejects(transport.sendMail(message), error => !error.message.includes("fixture-secret"));
  assert.equal(calls, 1);
});

test("seleccionar Microsoft 365 sin configuracion no recurre a SMTP", () => {
  const names = ["EMAIL_PROVIDER", "M365_CLIENT_SECRET", "SMTP_HOST"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.EMAIL_PROVIDER = "microsoft365";
    process.env.M365_CLIENT_SECRET = "";
    process.env.SMTP_HOST = "smtp.example.test";
    assert.equal(emailTransportFromEnvironment(), null);
    process.env.EMAIL_PROVIDER = "unknown";
    assert.equal(emailTransportFromEnvironment(), null);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});

test("bandeja registra aceptacion o fallo sin guardar cuerpos ni secretos", async t => {
  const database = openDatabase(":memory:");
  t.after(() => database.close());
  const tenant = seedTenant(database, "mail-test");
  const transport = createMicrosoftMailTransport({ ...settings, async fetchImpl(url) {
    return url.includes("/token") ? tokenResponse() : new Response(null, { status: 202 });
  } });
  const email = createEmailService({ database, transport, environment: "production" });
  const payload = { ...message, userId: tenant.userId, organizationId: tenant.organizationId, template: "verify_email" };
  assert.equal((await email.send(payload)).delivered, true);
  const failing = createEmailService({ database, transport: { async sendMail() { throw new Error("fixture-secret"); } } });
  assert.equal((await failing.send(payload)).delivered, false);
  const rows = database.prepare("SELECT status, last_error, payload_json FROM email_outbox ORDER BY id").all();
  assert.deepEqual(rows.map(row => row.status), ["sent", "failed"]);
  assert.ok(!JSON.stringify(rows).includes("fixture-secret"));
  assert.ok(!JSON.stringify(rows).includes("Enlace privado"));
  assert.equal(email.previewEnabled, false);
});
