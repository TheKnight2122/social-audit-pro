import { Router } from "express";
import { logActivity } from "../database.js";
import { permissionsFor } from "../permissions.js";
import { requireAuth, requireCsrf } from "../middleware.js";
import {
  clearSessionCookie,
  createSessionCredentials,
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
    permissions: permissionsFor(user.role)
  };
}

function createSession(database, userId) {
  const credentials = createSessionCredentials();
  database.prepare(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at)
     VALUES (?, ?, ?, datetime('now', ?))`
  ).run(credentials.tokenHash, userId, credentials.csrfToken, "+" + SESSION_HOURS + " hours");
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

export function createAuthRouter({ database, secureCookies = false, loginLimiter }) {
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
      let result;
      try {
        result = database.prepare(
          `INSERT INTO users (display_name, email, password_hash, role_slug)
           VALUES (?, ?, ?, ?)`
        ).run(identity.displayName, identity.email, passwordHash, role);
      } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
          return response.status(409).json({ error: "email_exists", message: "Ya existe un usuario con ese correo." });
        }
        throw error;
      }

      const userId = Number(result.lastInsertRowid);
      logActivity(database, {
        userId: request.user?.id || userId,
        action: userCount === 0 ? "auth.initial_admin_created" : "users.created",
        entityType: "user",
        entityId: userId,
        metadata: { role },
        ipAddress: request.ip
      });

      if (userCount === 0) {
        const session = createSession(database, userId);
        response.setHeader("Set-Cookie", sessionCookie(session.token, { secure: secureCookies }));
        return response.status(201).json({
          user: publicUser({ id: userId, displayName: identity.displayName, email: identity.email, role, status: "active" }),
          csrfToken: session.csrfToken
        });
      }

      return response.status(201).json({
        user: publicUser({ id: userId, displayName: identity.displayName, email: identity.email, role, status: "active" })
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login", loginLimiter, async (request, response, next) => {
    try {
      const email = normalizeEmail(request.body.email);
      const user = database.prepare(
        `SELECT id, display_name AS displayName, email, password_hash AS passwordHash,
                role_slug AS role, status
         FROM users WHERE email = ?`
      ).get(email);
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

      database.prepare("DELETE FROM sessions WHERE user_id = ? OR expires_at <= CURRENT_TIMESTAMP").run(user.id);
      const session = createSession(database, user.id);
      database.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);
      logActivity(database, {
        userId: user.id,
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

  router.get("/me", requireAuth, (request, response) => {
    response.json({ user: publicUser(request.user), csrfToken: request.session.csrfToken });
  });

  router.post("/logout", requireAuth, requireCsrf, (request, response) => {
    database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(request.session.tokenHash);
    logActivity(database, {
      userId: request.user.id,
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
