import { Router } from "express";
import { verify } from "otplib";
import {
  consumeAuthToken,
  createAuthToken,
  createMfaSetup,
  createRecoveryCodes,
  hashRecoveryCode,
  invalidateAuthTokens,
  readAuthToken,
  verifyMfaCode
} from "../account-security.js";
import { logActivity } from "../database.js";
import {
  addOrganizationMember,
  createOrganization,
  findLoginMembership
} from "../organizations.js";
import { permissionsFor } from "../permissions.js";
import { requireAuth, requireCsrf } from "../middleware.js";
import {
  clearSessionCookie,
  createSessionCredentials,
  decryptSecret,
  hashPassword,
  normalizeEmail,
  sessionCookie,
  validatePassword,
  verifyPassword
} from "../security.js";

const SESSION_HOURS = 8;

function publicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    mfaEnabled: Boolean(user.mfaEnabled),
    organization: user.organization || {
      id: user.organizationId,
      name: user.organizationName,
      slug: user.organizationSlug
    },
    permissions: permissionsFor(user.role)
  };
}

function createSession(database, userId, organizationId) {
  const credentials = createSessionCredentials();
  database.prepare(
    `INSERT INTO sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).run(credentials.tokenHash, userId, organizationId, credentials.csrfToken, "+" + SESSION_HOURS + " hours");
  return credentials;
}

function validateIdentity(body) {
  const displayName = String(body.displayName || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const errors = validatePassword(password);
  if (displayName.length < 2 || displayName.length > 80) errors.push("El nombre debe tener entre 2 y 80 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("El correo no es valido.");
  return { displayName, email, password, errors };
}

function accountUrl(appBaseUrl, parameter, token) {
  const url = new URL(appBaseUrl);
  url.searchParams.set(parameter, token);
  url.hash = "/cuenta";
  return url.toString();
}

function previewPayload(emailService, key, value) {
  return emailService.previewEnabled ? { [key]: value } : {};
}

function findSecurityUser(database, userId) {
  return database.prepare(
    `SELECT id, display_name AS displayName, email, password_hash AS passwordHash,
            status, email_verified_at AS emailVerifiedAt, mfa_enabled AS mfaEnabled,
            mfa_secret_encrypted AS mfaSecretEncrypted,
            mfa_pending_secret_encrypted AS mfaPendingSecretEncrypted,
            mfa_recovery_codes_json AS mfaRecoveryCodesJson
     FROM users WHERE id = ?`
  ).get(userId);
}

async function queueVerification({ database, emailService, appBaseUrl, user, organizationId }) {
  invalidateAuthTokens(database, user.id, "verify_email");
  const token = createAuthToken(database, {
    userId: user.id,
    organizationId,
    purpose: "verify_email",
    ttlMinutes: 24 * 60
  });
  const url = accountUrl(appBaseUrl, "verifyEmail", token);
  const delivery = await emailService.send({
    organizationId,
    userId: user.id,
    to: user.email,
    template: "verify_email",
    subject: "Verifica tu correo en Social Audit Pro",
    text: "Verifica tu correo abriendo este enlace: " + url,
    html: '<p>Verifica tu correo para proteger tu cuenta.</p><p><a href="' + url + '">Verificar correo</a></p>'
  });
  return { delivery, url };
}

async function queuePasswordReset({ database, emailService, appBaseUrl, user }) {
  invalidateAuthTokens(database, user.id, "password_reset");
  const token = createAuthToken(database, {
    userId: user.id,
    organizationId: user.organizationId,
    purpose: "password_reset",
    ttlMinutes: 30
  });
  const url = accountUrl(appBaseUrl, "resetPassword", token);
  const delivery = await emailService.send({
    organizationId: user.organizationId,
    userId: user.id,
    to: user.email,
    template: "password_reset",
    subject: "Restablece tu contrasena de Social Audit Pro",
    text: "Restablece tu contrasena abriendo este enlace. Caduca en 30 minutos: " + url,
    html: '<p>Recibimos una solicitud para restablecer tu contrasena.</p><p><a href="' + url + '">Crear una contrasena nueva</a></p><p>El enlace caduca en 30 minutos.</p>'
  });
  return { delivery, url };
}

export function createAuthRouter({
  database,
  secureCookies = false,
  loginLimiter,
  encryptionSecret,
  emailService,
  appBaseUrl
}) {
  const router = Router();

  router.get("/setup", (_request, response) => {
    const userCount = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    response.json({ needsInitialAdmin: userCount === 0 });
  });

  router.post("/register", async (request, response, next) => {
    try {
      const userCount = database.prepare("SELECT COUNT(*) AS count FROM users").get().count;
      if (userCount > 0) {
        if (!request.user || request.user.role !== "admin") {
          return response.status(403).json({ error: "registration_closed", message: "Solo un administrador puede crear usuarios." });
        }
        if (!request.session || request.get("x-csrf-token") !== request.session.csrfToken) {
          return response.status(403).json({ error: "invalid_csrf", message: "Token CSRF invalido o ausente." });
        }
      }

      const identity = validateIdentity(request.body);
      if (identity.errors.length) {
        return response.status(400).json({ error: "validation_error", details: identity.errors });
      }

      const requestedRole = String(request.body.role || "client");
      const role = userCount === 0 ? "admin" : ["admin", "analyst", "client"].includes(requestedRole) ? requestedRole : "client";
      const passwordHash = await hashPassword(identity.password);
      let created;
      try {
        created = database.transaction(() => {
          if (userCount === 0 && database.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0) {
            throw Object.assign(new Error("La instalacion inicial ya se completo."), { statusCode: 409 });
          }
          const result = database.prepare(
            `INSERT INTO users (display_name, email, password_hash, role_slug)
             VALUES (?, ?, ?, ?)`
          ).run(identity.displayName, identity.email, passwordHash, role);
          const userId = Number(result.lastInsertRowid);
          const organization = userCount === 0
            ? createOrganization(database, {
                name: String(request.body.organizationName || "Organizacion principal"),
                userId,
                role: "admin"
              })
            : request.user.organization;
          if (userCount > 0) {
            addOrganizationMember(database, {
              organizationId: request.user.organizationId,
              userId,
              role
            });
          }
          return { userId, organization };
        })();
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          return response.status(409).json({ error: "email_exists", message: "Ya existe un usuario con ese correo." });
        }
        throw error;
      }

      const { userId, organization } = created;
      const registeredUser = {
        id: userId,
        displayName: identity.displayName,
        email: identity.email,
        role,
        status: "active",
        emailVerifiedAt: null,
        mfaEnabled: 0,
        organization
      };
      const verification = await queueVerification({
        database,
        emailService,
        appBaseUrl,
        user: registeredUser,
        organizationId: organization.id
      });
      logActivity(database, {
        userId: request.user?.id || userId,
        organizationId: organization.id,
        action: userCount === 0 ? "auth.initial_admin_created" : "users.created",
        entityType: "user",
        entityId: userId,
        metadata: { role },
        ipAddress: request.ip
      });

      const payload = {
        user: publicUser(registeredUser),
        verificationEmailQueued: true,
        ...previewPayload(emailService, "previewVerificationUrl", verification.url)
      };
      if (userCount === 0) {
        const session = createSession(database, userId, organization.id);
        response.setHeader("Set-Cookie", sessionCookie(session.token, { secure: secureCookies }));
        return response.status(201).json({ ...payload, csrfToken: session.csrfToken });
      }
      return response.status(201).json(payload);
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login", loginLimiter, async (request, response, next) => {
    try {
      const email = normalizeEmail(request.body.email);
      const user = findLoginMembership(database, email);
      const valid = user && user.status === "active" && await verifyPassword(String(request.body.password || ""), user.passwordHash);
      if (!valid) {
        logActivity(database, {
          action: "auth.login_failed",
          entityType: "user",
          metadata: { email },
          ipAddress: request.ip
        });
        return response.status(401).json({ error: "invalid_credentials", message: "Correo o contrasena incorrectos." });
      }

      if (!user.emailVerifiedAt) {
        const verification = await queueVerification({
          database, emailService, appBaseUrl, user, organizationId: user.organizationId
        });
        logActivity(database, {
          userId: user.id,
          organizationId: user.organizationId,
          action: "auth.login_blocked_unverified",
          entityType: "user",
          entityId: user.id,
          ipAddress: request.ip
        });
        return response.status(403).json({
          error: "email_unverified",
          message: verification.delivery.delivered
            ? "Verifica tu correo antes de iniciar sesion. Te enviamos un nuevo enlace."
            : "Verifica tu correo antes de iniciar sesion. El administrador debe configurar el envio de correo.",
          ...previewPayload(emailService, "previewVerificationUrl", verification.url)
        });
      }

      if (user.mfaEnabled) {
        invalidateAuthTokens(database, user.id, "mfa_login");
        const challengeToken = createAuthToken(database, {
          userId: user.id,
          organizationId: user.organizationId,
          purpose: "mfa_login",
          ttlMinutes: 5,
          metadata: { ipAddress: request.ip }
        });
        logActivity(database, {
          userId: user.id,
          organizationId: user.organizationId,
          action: "auth.mfa_challenge_created",
          entityType: "user",
          entityId: user.id,
          ipAddress: request.ip
        });
        return response.status(202).json({ mfaRequired: true, challengeToken });
      }

      database.prepare("DELETE FROM sessions WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP").run(user.id);
      const session = createSession(database, user.id, user.organizationId);
      database.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
      logActivity(database, {
        userId: user.id,
        organizationId: user.organizationId,
        action: "auth.login_succeeded",
        entityType: "user",
        entityId: user.id,
        ipAddress: request.ip
      });
      response.setHeader("Set-Cookie", sessionCookie(session.token, { secure: secureCookies }));
      return response.json({ user: publicUser(user), csrfToken: session.csrfToken });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login/2fa", loginLimiter, async (request, response, next) => {
    try {
      const challenge = readAuthToken(database, request.body.challengeToken, "mfa_login");
      if (!challenge) {
        return response.status(400).json({ error: "invalid_challenge", message: "El desafio de acceso caduco o no es valido." });
      }
      const user = findSecurityUser(database, challenge.userId);
      const membership = database.prepare(
        `SELECT m.role_slug AS role, o.id AS organizationId,
                o.name AS organizationName, o.slug AS organizationSlug
         FROM organization_members m
         JOIN organizations o ON o.id = m.organization_id
         WHERE m.user_id = ? AND m.organization_id = ?
           AND m.status = 'active' AND o.status = 'active'`
      ).get(challenge.userId, challenge.organizationId);
      if (!user || user.status !== "active" || !user.mfaEnabled || !membership) {
        return response.status(400).json({ error: "invalid_challenge", message: "El desafio de acceso caduco o no es valido." });
      }
      const result = await verifyMfaCode({ database, user, code: request.body.code, encryptionSecret });
      if (!result.valid || !consumeAuthToken(database, challenge.id)) {
        return response.status(401).json({ error: "invalid_mfa_code", message: "El codigo de seguridad no es valido." });
      }

      database.prepare("DELETE FROM sessions WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP").run(user.id);
      const session = createSession(database, user.id, membership.organizationId);
      database.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
      const sessionUser = { ...user, ...membership };
      logActivity(database, {
        userId: user.id,
        organizationId: membership.organizationId,
        action: "auth.login_succeeded_2fa",
        entityType: "user",
        entityId: user.id,
        metadata: { recoveryCode: result.recoveryCode },
        ipAddress: request.ip
      });
      response.setHeader("Set-Cookie", sessionCookie(session.token, { secure: secureCookies }));
      return response.json({ user: publicUser(sessionUser), csrfToken: session.csrfToken });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/email-verification/request", requireAuth, requireCsrf, async (request, response, next) => {
    try {
      const user = findSecurityUser(database, request.user.id);
      if (user.emailVerifiedAt) return response.json({ verified: true });
      const verification = await queueVerification({ database, emailService, appBaseUrl, user, organizationId: request.user.organizationId });
      logActivity(database, {
        userId: user.id,
        organizationId: request.user.organizationId,
        action: "auth.email_verification_requested",
        entityType: "user",
        entityId: user.id,
        ipAddress: request.ip
      });
      return response.status(202).json({
        verified: false,
        deliveryConfigured: emailService.configured,
        ...previewPayload(emailService, "previewVerificationUrl", verification.url)
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/email-verification/confirm", async (request, response, next) => {
    try {
      const token = readAuthToken(database, request.body.token, "verify_email");
      if (!token) {
        return response.status(400).json({ error: "invalid_token", message: "El enlace de verificacion caduco o no es valido." });
      }
      const updated = database.transaction(() => {
        if (!consumeAuthToken(database, token.id)) return false;
        database.prepare(
          "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(token.userId);
        invalidateAuthTokens(database, token.userId, "verify_email");
        return true;
      })();
      if (!updated) {
        return response.status(400).json({ error: "invalid_token", message: "El enlace de verificacion caduco o no es valido." });
      }
      logActivity(database, {
        userId: token.userId,
        organizationId: token.organizationId,
        action: "auth.email_verified",
        entityType: "user",
        entityId: token.userId,
        ipAddress: request.ip
      });
      return response.json({ verified: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/password/forgot", loginLimiter, async (request, response, next) => {
    try {
      const email = normalizeEmail(request.body.email);
      const user = database.prepare(
        `SELECT u.id, u.email, u.default_organization_id AS organizationId
         FROM users u WHERE u.email = ? AND u.status = 'active'`
      ).get(email);
      let reset;
      if (user) {
        reset = await queuePasswordReset({ database, emailService, appBaseUrl, user });
        logActivity(database, {
          userId: user.id,
          organizationId: user.organizationId,
          action: "auth.password_reset_requested",
          entityType: "user",
          entityId: user.id,
          ipAddress: request.ip
        });
      }
      return response.status(202).json({
        message: "Si el correo esta registrado, recibira un enlace de recuperacion.",
        ...(reset ? previewPayload(emailService, "previewResetUrl", reset.url) : {})
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/password/reset", async (request, response, next) => {
    try {
      const errors = validatePassword(String(request.body.password || ""));
      if (errors.length) return response.status(400).json({ error: "validation_error", details: errors });
      const token = readAuthToken(database, request.body.token, "password_reset");
      if (!token) {
        return response.status(400).json({ error: "invalid_token", message: "El enlace de recuperacion caduco o no es valido." });
      }
      const passwordHash = await hashPassword(request.body.password);
      const updated = database.transaction(() => {
        if (!consumeAuthToken(database, token.id)) return false;
        database.prepare(
          "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(passwordHash, token.userId);
        database.prepare("DELETE FROM sessions WHERE user_id = ?").run(token.userId);
        invalidateAuthTokens(database, token.userId, "password_reset");
        invalidateAuthTokens(database, token.userId, "mfa_login");
        return true;
      })();
      if (!updated) {
        return response.status(400).json({ error: "invalid_token", message: "El enlace de recuperacion caduco o no es valido." });
      }
      logActivity(database, {
        userId: token.userId,
        organizationId: token.organizationId,
        action: "auth.password_reset_completed",
        entityType: "user",
        entityId: token.userId,
        ipAddress: request.ip
      });
      response.setHeader("Set-Cookie", clearSessionCookie({ secure: secureCookies }));
      return response.json({ reset: true });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/mfa/setup", requireAuth, requireCsrf, async (request, response, next) => {
    try {
      if (!encryptionSecret) {
        return response.status(503).json({ error: "mfa_unavailable", message: "El cifrado de 2FA no esta configurado." });
      }
      const user = findSecurityUser(database, request.user.id);
      if (user.mfaEnabled) {
        return response.status(409).json({ error: "mfa_enabled", message: "El segundo factor ya esta activo." });
      }
      const setup = await createMfaSetup(user.email, encryptionSecret);
      database.prepare(
        `UPDATE users SET mfa_pending_secret_encrypted = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(setup.encryptedSecret, user.id);
      return response.json({ secret: setup.secret, uri: setup.uri, qrCodeDataUrl: setup.qrCodeDataUrl });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/mfa/confirm", requireAuth, requireCsrf, async (request, response, next) => {
    try {
      const user = findSecurityUser(database, request.user.id);
      if (!user.mfaPendingSecretEncrypted || !encryptionSecret) {
        return response.status(400).json({ error: "mfa_setup_missing", message: "Primero inicia la configuracion de 2FA." });
      }
      const secret = decryptSecret(user.mfaPendingSecretEncrypted, encryptionSecret);
      const result = await verify({ secret, token: String(request.body.code || "").trim() });
      if (!result.valid) {
        return response.status(400).json({ error: "invalid_mfa_code", message: "El codigo de la aplicacion no es valido." });
      }
      const recoveryCodes = createRecoveryCodes();
      database.prepare(
        `UPDATE users SET mfa_enabled = 1,
             mfa_secret_encrypted = mfa_pending_secret_encrypted,
             mfa_pending_secret_encrypted = NULL,
             mfa_recovery_codes_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(JSON.stringify(recoveryCodes.map(hashRecoveryCode)), user.id);
      logActivity(database, {
        userId: user.id,
        organizationId: request.user.organizationId,
        action: "auth.mfa_enabled",
        entityType: "user",
        entityId: user.id,
        ipAddress: request.ip
      });
      return response.json({ enabled: true, recoveryCodes });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/mfa/recovery-codes", requireAuth, requireCsrf, async (request, response, next) => {
    try {
      const user = findSecurityUser(database, request.user.id);
      const passwordValid = await verifyPassword(String(request.body.password || ""), user.passwordHash);
      const secondFactor = passwordValid && await verifyMfaCode({ database, user, code: request.body.code, encryptionSecret });
      if (!passwordValid || !secondFactor.valid) {
        return response.status(401).json({ error: "invalid_confirmation", message: "La contrasena o el codigo no es valido." });
      }
      const recoveryCodes = createRecoveryCodes();
      database.prepare(
        "UPDATE users SET mfa_recovery_codes_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(JSON.stringify(recoveryCodes.map(hashRecoveryCode)), user.id);
      return response.json({ recoveryCodes });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/mfa/disable", requireAuth, requireCsrf, async (request, response, next) => {
    try {
      const user = findSecurityUser(database, request.user.id);
      const passwordValid = await verifyPassword(String(request.body.password || ""), user.passwordHash);
      const secondFactor = passwordValid && user.mfaEnabled && await verifyMfaCode({ database, user, code: request.body.code, encryptionSecret });
      if (!passwordValid || !secondFactor.valid) {
        return response.status(401).json({ error: "invalid_confirmation", message: "La contrasena o el codigo no es valido." });
      }
      database.prepare(
        `UPDATE users SET mfa_enabled = 0, mfa_secret_encrypted = NULL,
             mfa_pending_secret_encrypted = NULL, mfa_recovery_codes_json = '[]',
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(user.id);
      invalidateAuthTokens(database, user.id, "mfa_login");
      logActivity(database, {
        userId: user.id,
        organizationId: request.user.organizationId,
        action: "auth.mfa_disabled",
        entityType: "user",
        entityId: user.id,
        ipAddress: request.ip
      });
      return response.json({ enabled: false });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/me", requireAuth, (request, response) => {
    response.json({ user: publicUser(request.user), csrfToken: request.session.csrfToken });
  });

  router.post("/logout", requireAuth, requireCsrf, (request, response) => {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(request.session.tokenHash);
    logActivity(database, {
      userId: request.user.id,
      organizationId: request.user.organizationId,
      action: "auth.logout",
      entityType: "user",
      entityId: request.user.id,
      ipAddress: request.ip
    });
    response.setHeader("Set-Cookie", clearSessionCookie({ secure: secureCookies }));
    response.status(204).end();
  });

  return router;
}
