import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createAuthToken, readAuthToken } from "../../src/server/account-security.js";
import { createRecoveryRouter } from "../../src/server/routes/recovery.js";
import { createEmailService } from "../../src/server/email.js";
import { sessionLoader } from "../../src/server/middleware.js";
import { createLoginLimiter } from "../../src/server/login-limiter.js";
import { hashToken, verifyPassword } from "../../src/server/security.js";

function tokenOptions(first, purpose = "password_reset") {
  return { userId: first.userId, organizationId: first.organizationId, purpose, ttlMinutes: 30 };
}

export async function recoveryHttpContract({ store, emailStore, accessStore, query, prefix, first, second }) {
  const messages = [];
  const emailService = createEmailService({ store: emailStore, environment: "production",
    transport: { async sendMail(message) { messages.push(message); } } });
  const app = express();
  app.use(express.json());
  app.use(sessionLoader(accessStore));
  app.use(createRecoveryRouter({ store, emailService, appBaseUrl: "https://pilot.example.test",
    loginLimiter: createLoginLimiter(accessStore, { maxAttempts: 50 }), secureCookies: true }));
  app.use((_error, _req, res, _next) => res.status(500).json({ error: "internal_error" }));
  await request(app).post("/email-verification/request").expect(401);
  await request(app).post("/email-verification/request").set("Cookie", first.cookie).expect(403);
  await request(app).post("/email-verification/request").set("Cookie", first.cookie)
    .set("x-csrf-token", first.csrf).expect(202);
  const verification = new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).searchParams.get("verifyEmail");
  await request(app).post("/password/reset").send({ token: verification, password: "NewPassword123" }).expect(400);
  const verified = await Promise.all(Array.from({ length: 2 }, () =>
    request(app).post("/email-verification/confirm").send({ token: verification })));
  assert.deepEqual(verified.map(r => r.status).sort(), [200, 400]);
  assert.ok((await store.findUserById(first.userId)).emailVerifiedAt);
  const email = (await store.findUserById(first.userId)).email;
  const forgot = await request(app).post("/password/forgot").send({ email: email.toUpperCase() }).expect(202);
  const absent = await request(app).post("/password/forgot").send({ email: "absent@example.test" }).expect(202);
  assert.deepEqual(forgot.body, absent.body);
  assert.equal(messages.length, 2);
  const reset = new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).searchParams.get("resetPassword");
  await query(`UPDATE ${prefix}users SET mfa_enabled = 1, mfa_secret_encrypted = 'fixture-encrypted',
    mfa_pending_secret_encrypted = 'fixture-pending' WHERE id = $1`, [first.userId]);
  const challenge = await createAuthToken(store, tokenOptions(first, "mfa_login"));
  const resetResults = await Promise.all(Array.from({ length: 2 }, () =>
    request(app).post("/password/reset").send({ token: reset, password: "NewPassword123" })));
  assert.deepEqual(resetResults.map(r => r.status).sort(), [200, 400]);
  assert.match(resetResults.find(r => r.status === 200).headers["set-cookie"][0], /Secure/);
  assert.equal(await accessStore.loadSession(first.sessionHash), undefined);
  assert.ok(await accessStore.loadSession(second.sessionHash));
  assert.equal(await readAuthToken(store, challenge, "mfa_login"), undefined);
  const user = (await query(`SELECT password_hash, mfa_enabled, mfa_secret_encrypted,
    mfa_pending_secret_encrypted FROM ${prefix}users WHERE id = $1`, [first.userId])).rows[0];
  assert.equal(await verifyPassword("NewPassword123", user.password_hash), true);
  assert.equal(user.mfa_enabled, 1);
  assert.equal(user.mfa_secret_encrypted, "fixture-encrypted");
  assert.equal(user.mfa_pending_secret_encrypted, null);
  assert.equal((await query(`SELECT password_hash FROM ${prefix}users WHERE id = $1`, [second.userId])).rows[0].password_hash,
    "unusable-test-hash");
  const outbox = (await query(`SELECT status, attempts, payload_json, last_error FROM ${prefix}email_outbox`)).rows;
  assert.equal(outbox.length, 2);
  assert.ok(outbox.every(row => row.status === "sent" && row.attempts === 1));
  const persisted = JSON.stringify([outbox, (await query(`SELECT * FROM ${prefix}auth_tokens`)).rows,
    (await query(`SELECT * FROM ${prefix}activity_logs`)).rows]);
  for (const secret of [verification, reset, challenge, "NewPassword123"]) assert.ok(!persisted.includes(secret));
}

export async function recoveryTokenContract({ store, query, prefix, first, second }) {
  const old = await createAuthToken(store, tokenOptions(first));
  const other = await createAuthToken(store, tokenOptions(second));
  const current = await createAuthToken(store, tokenOptions(first));
  assert.equal(await readAuthToken(store, old, "password_reset"), undefined);
  assert.ok(await readAuthToken(store, other, "password_reset"));
  assert.equal(await store.confirmEmail(hashToken(current)), undefined);
  assert.equal(await readAuthToken(store, "x'); DELETE FROM users; --", "password_reset"), undefined);
  for (const minutes of [-5, 5]) {
    const date = new Date(Date.now() + minutes * 60000);
    for (const expiry of [date.toISOString(), date.toISOString().slice(0, 19).replace("T", " "),
      new Date(date.getTime() + 7200000).toISOString().replace("Z", "+02:00")]) {
      await query(`UPDATE ${prefix}auth_tokens SET expires_at = $1 WHERE token_hash = $2`, [expiry, hashToken(current)]);
      assert.equal(Boolean(await readAuthToken(store, current, "password_reset")), minutes > 0);
      if (minutes < 0) {
        assert.equal(await store.resetPassword(hashToken(current), "must-not-be-written"), undefined);
        const id = (await query(`SELECT id FROM ${prefix}auth_tokens WHERE token_hash = $1`, [hashToken(current)])).rows[0].id;
        assert.equal(await store.consumeToken(id), false);
      }
    }
  }
  await query(`UPDATE ${prefix}users SET status = 'disabled' WHERE id = $1`, [first.userId]);
  assert.equal(await readAuthToken(store, current, "password_reset"), undefined);
  assert.equal(await store.resetPassword(hashToken(current), "must-not-be-written"), undefined);
  await assert.rejects(() => createAuthToken(store, tokenOptions(first)), { statusCode: 403 });
  await query(`UPDATE ${prefix}users SET status = 'active' WHERE id = $1`, [first.userId]);
  await assert.rejects(() => createAuthToken(store, { ...tokenOptions(first), ttlMinutes: 0 }));
  const issued = await Promise.all(Array.from({ length: 8 }, () => createAuthToken(store, tokenOptions(first))));
  const valid = await Promise.all(issued.map(token => readAuthToken(store, token, "password_reset")));
  assert.equal(valid.filter(Boolean).length, 1);
  const token = valid.find(Boolean);
  const consumed = await Promise.all(Array.from({ length: 8 }, () => store.consumeToken(token.id)));
  assert.equal(consumed.filter(Boolean).length, 1);
}

export async function recoveryRollbackContract({ store, accessStore, query, prefix, first }) {
  const token = await createAuthToken(store, tokenOptions(first));
  const before = (await query(`SELECT password_hash FROM ${prefix}users WHERE id = $1`, [first.userId])).rows[0].password_hash;
  // Violating NOT NULL occurs after token invalidation inside the transaction.
  await assert.rejects(() => store.resetPassword(hashToken(token), null));
  assert.ok(await readAuthToken(store, token, "password_reset"));
  assert.equal((await query(`SELECT password_hash FROM ${prefix}users WHERE id = $1`, [first.userId])).rows[0].password_hash, before);
  assert.ok(await accessStore.loadSession(first.sessionHash));
}

export async function emailFailureContract({ emailStore, query, prefix, first }) {
  const service = createEmailService({ store: emailStore, environment: "production",
    transport: { async sendMail() { throw new Error("fixture-provider-secret"); } } });
  const message = { userId: first.userId, organizationId: first.organizationId, to: "recipient@example.test",
    template: "password_reset", subject: "Fixture", text: "private-reset-token", html: "private-reset-token" };
  assert.equal((await service.send(message)).reason, "delivery_failed");
  const pending = createEmailService({ store: emailStore, transport: null, environment: "production" });
  assert.equal((await pending.send(message)).reason, "email_not_configured");
  const rows = (await query(`SELECT status, attempts, payload_json, last_error FROM ${prefix}email_outbox ORDER BY id`)).rows;
  assert.deepEqual(rows.map(row => [row.status, row.attempts]), [["failed", 1], ["pending", 0]]);
  assert.doesNotMatch(JSON.stringify(rows), /fixture-provider-secret|private-reset-token/);
}
