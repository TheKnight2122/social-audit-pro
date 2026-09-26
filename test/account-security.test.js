import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "otplib";
import request from "supertest";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";
import { createEmailService } from "../src/server/email.js";

test("verificacion, recuperacion de contrasena y 2FA protegen la cuenta", async (context) => {
  const database = openDatabase(":memory:");
  const sentMessages = [];
  const emailTransport = {
    async sendMail(message) {
      sentMessages.push(message);
      return { messageId: "test-message-" + sentMessages.length };
    }
  };
  const app = createApp({
    database,
    encryptionSecret: "test-account-security-encryption-key",
    secureCookies: false,
    loginLimit: { maxAttempts: 50 },
    appBaseUrl: "http://127.0.0.1:4173",
    emailService: createEmailService({ database, transport: emailTransport, environment: "test" }),
    youtubeProvider: { configured: false }
  });
  const agent = request.agent(app);
  context.after(() => database.close());

  const registered = await agent.post("/api/v1/auth/register").send({
    displayName: "Cuenta Segura",
    organizationName: "Empresa Uno",
    email: "security@example.test",
    password: "ClaveInicial123"
  }).expect(201);
  let csrfToken = registered.body.csrfToken;
  assert.equal(registered.body.user.emailVerified, false);
  assert.equal(sentMessages.length, 1);

  const unverifiedLogin = await request(app).post("/api/v1/auth/login").send({
    email: "security@example.test",
    password: "ClaveInicial123"
  }).expect(403);

  const verificationToken = new URL(unverifiedLogin.body.previewVerificationUrl)
    .searchParams.get("verifyEmail");
  await request(app).post("/api/v1/auth/email-verification/confirm")
    .send({ token: verificationToken })
    .expect(200);
  await request(app).post("/api/v1/auth/email-verification/confirm")
    .send({ token: verificationToken })
    .expect(400);
  const verified = await agent.get("/api/v1/auth/me").expect(200);
  assert.equal(verified.body.user.emailVerified, true);

  const forgotten = await request(app).post("/api/v1/auth/password/forgot").send({
    email: "security@example.test"
  }).expect(202);
  assert.equal(sentMessages.length, 3);
  const resetToken = new URL(forgotten.body.previewResetUrl)
    .searchParams.get("resetPassword");
  await request(app).post("/api/v1/auth/password/reset").send({
    token: resetToken,
    password: "ClaveRenovada456"
  }).expect(200);
  await request(app).post("/api/v1/auth/password/reset").send({
    token: resetToken,
    password: "OtraClaveSegura789"
  }).expect(400);
  await agent.get("/api/v1/auth/me").expect(401);

  const loggedIn = await agent.post("/api/v1/auth/login").send({
    email: "security@example.test",
    password: "ClaveRenovada456"
  }).expect(200);
  csrfToken = loggedIn.body.csrfToken;

  const setup = await agent.post("/api/v1/auth/mfa/setup")
    .set("x-csrf-token", csrfToken)
    .expect(200);
  assert.match(setup.body.qrCodeDataUrl, /^data:image\/png;base64,/);
  const encrypted = database.prepare(
    "SELECT mfa_pending_secret_encrypted AS value FROM users WHERE email = ?"
  ).get("security@example.test").value;
  assert.notEqual(encrypted, setup.body.secret);
  assert.equal(encrypted.includes(setup.body.secret), false);

  const confirmationCode = await generate({ secret: setup.body.secret });
  const confirmed = await agent.post("/api/v1/auth/mfa/confirm")
    .set("x-csrf-token", csrfToken)
    .send({ code: confirmationCode })
    .expect(200);
  assert.equal(confirmed.body.recoveryCodes.length, 10);
  const recoveryCode = confirmed.body.recoveryCodes[0];

  await agent.post("/api/v1/auth/logout")
    .set("x-csrf-token", csrfToken)
    .expect(204);
  const challenge = await agent.post("/api/v1/auth/login").send({
    email: "security@example.test",
    password: "ClaveRenovada456"
  }).expect(202);
  assert.equal(challenge.body.mfaRequired, true);
  const loginCode = await generate({ secret: setup.body.secret });
  const secondFactor = await agent.post("/api/v1/auth/login/2fa").send({
    challengeToken: challenge.body.challengeToken,
    code: loginCode
  }).expect(200);
  csrfToken = secondFactor.body.csrfToken;
  assert.equal(secondFactor.body.user.mfaEnabled, true);

  await agent.post("/api/v1/auth/logout")
    .set("x-csrf-token", csrfToken)
    .expect(204);
  const recoveryChallenge = await agent.post("/api/v1/auth/login").send({
    email: "security@example.test",
    password: "ClaveRenovada456"
  }).expect(202);
  await agent.post("/api/v1/auth/login/2fa").send({
    challengeToken: recoveryChallenge.body.challengeToken,
    code: recoveryCode
  }).expect(200);
  const replayChallenge = await request(app).post("/api/v1/auth/login").send({
    email: "security@example.test",
    password: "ClaveRenovada456"
  }).expect(202);
  await request(app).post("/api/v1/auth/login/2fa").send({
    challengeToken: replayChallenge.body.challengeToken,
    code: recoveryCode
  }).expect(401);

  const storedOutbox = database.prepare(
    "SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status"
  ).all();
  assert.deepEqual(storedOutbox, [{ status: "sent", count: 3 }]);
  assert.equal(createEmailService({ database, transport: null, environment: "production" }).previewEnabled, false);
});
