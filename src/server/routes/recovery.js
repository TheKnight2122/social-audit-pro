import { Router } from "express";
import { createAuthToken, readAuthToken } from "../account-security.js";
import { requireAuth, requireCsrf } from "../middleware.js";
import { clearSessionCookie, hashPassword, hashToken, normalizeEmail, validatePassword } from "../security.js";

function accountUrl(appBaseUrl, parameter, token) {
  const url = new URL(appBaseUrl);
  url.searchParams.set(parameter, token);
  url.hash = "/cuenta";
  return url.toString();
}

export function previewPayload(emailService, key, value) {
  return emailService.previewEnabled ? { [key]: value } : {};
}

export async function queueVerification({ store, emailService, appBaseUrl, user, organizationId }) {
  const token = await createAuthToken(store, {
    userId: user.id, organizationId, purpose: "verify_email", ttlMinutes: 1440
  });
  const url = accountUrl(appBaseUrl, "verifyEmail", token);
  const delivery = await emailService.send({
    organizationId, userId: user.id, to: user.email, template: "verify_email",
    subject: "Verifica tu correo en Social Audit Pro",
    text: "Verifica tu correo abriendo este enlace: " + url,
    html: '<p>Verifica tu correo para proteger tu cuenta.</p><p><a href="' + url + '">Verificar correo</a></p>'
  });
  return { delivery, url };
}

async function queuePasswordReset({ store, emailService, appBaseUrl, user }) {
  const token = await createAuthToken(store, {
    userId: user.id, organizationId: user.organizationId, purpose: "password_reset", ttlMinutes: 30
  });
  const url = accountUrl(appBaseUrl, "resetPassword", token);
  const delivery = await emailService.send({
    organizationId: user.organizationId, userId: user.id, to: user.email, template: "password_reset",
    subject: "Restablece tu contrasena de Social Audit Pro",
    text: "Restablece tu contrasena abriendo este enlace. Caduca en 30 minutos: " + url,
    html: '<p>Recibimos una solicitud para restablecer tu contrasena.</p><p><a href="' + url + '">Crear una contrasena nueva</a></p><p>El enlace caduca en 30 minutos.</p>'
  });
  return { delivery, url };
}

export function createRecoveryRouter({ store, emailService, appBaseUrl, loginLimiter, secureCookies = false }) {
  const router = Router();
  router.post("/email-verification/request", requireAuth, requireCsrf, async (request, response) => {
    const user = await store.findUserById(request.user.id);
    if (!user) return response.status(401).json({ error: "authentication_required" });
    if (user.emailVerifiedAt) return response.json({ verified: true });
    const verification = await queueVerification({ store, emailService, appBaseUrl, user, organizationId: request.user.organizationId });
    await store.recordActivity({ userId: user.id, organizationId: request.user.organizationId,
      action: "auth.email_verification_requested", ipAddress: request.ip });
    return response.status(202).json({ verified: false, deliveryConfigured: emailService.configured,
      ...previewPayload(emailService, "previewVerificationUrl", verification.url) });
  });

  router.post("/email-verification/confirm", async (request, response) => {
    const token = await store.confirmEmail(hashToken(request.body.token));
    if (!token) return response.status(400).json({ error: "invalid_token", message: "El enlace de verificacion caduco o no es valido." });
    await store.recordActivity({ userId: token.userId, organizationId: token.organizationId,
      action: "auth.email_verified", ipAddress: request.ip });
    return response.json({ verified: true });
  });

  router.post("/password/forgot", loginLimiter, async (request, response) => {
    const user = await store.findUserByEmail(normalizeEmail(request.body.email));
    let reset;
    if (user) {
      reset = await queuePasswordReset({ store, emailService, appBaseUrl, user });
      await store.recordActivity({ userId: user.id, organizationId: user.organizationId,
        action: "auth.password_reset_requested", ipAddress: request.ip });
    }
    return response.status(202).json({ message: "Si el correo esta registrado, recibira un enlace de recuperacion.",
      ...(reset ? previewPayload(emailService, "previewResetUrl", reset.url) : {}) });
  });

  router.post("/password/reset", async (request, response) => {
    const password = String(request.body.password || "");
    const errors = validatePassword(password);
    if (errors.length) return response.status(400).json({ error: "validation_error", details: errors });
    // Validate before scrypt, then revalidate atomically after its asynchronous work.
    const candidate = await readAuthToken(store, request.body.token, "password_reset");
    if (!candidate) return response.status(400).json({ error: "invalid_token", message: "El enlace de recuperacion caduco o no es valido." });
    const token = await store.resetPassword(hashToken(request.body.token), await hashPassword(password));
    if (!token) return response.status(400).json({ error: "invalid_token", message: "El enlace de recuperacion caduco o no es valido." });
    await store.recordActivity({ userId: token.userId, organizationId: token.organizationId,
      action: "auth.password_reset_completed", ipAddress: request.ip });
    response.setHeader("Set-Cookie", clearSessionCookie({ secure: secureCookies }));
    return response.json({ reset: true });
  });
  return router;
}
