import { hashToken, parseCookies } from "./security.js";
import { hasPermission } from "./permissions.js";

export function securityHeaders(_request, response, next) {
  response.set({
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  next();
}

export function sameOrigin(request, response, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const origin = request.get("origin");
  if (!origin) return next();
  const expected = request.protocol + "://" + request.get("host");
  if (origin !== expected) {
    return response.status(403).json({ error: "origin_not_allowed", message: "Origen no permitido." });
  }
  return next();
}

export function sessionLoader(database) {
  const findSession = database.prepare(
    `SELECT
       s.token_hash AS tokenHash,
       s.csrf_token AS csrfToken,
       s.expires_at AS expiresAt,
       u.id,
       u.display_name AS displayName,
       u.email,
       u.role_slug AS role,
       u.status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`
  );
  const touchSession = database.prepare(
    "UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?"
  );

  return function loadSession(request, _response, next) {
    const token = parseCookies(request.headers.cookie).sap_session;
    if (!token) return next();
    const session = findSession.get(hashToken(token));
    if (session && session.status === "active") {
      request.user = {
        id: session.id,
        displayName: session.displayName,
        email: session.email,
        role: session.role
      };
      request.session = session;
      touchSession.run(session.tokenHash);
    }
    return next();
  };
}

export function requireAuth(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: "authentication_required", message: "Debes iniciar sesion." });
  }
  return next();
}

export function requirePermission(permission) {
  return function permissionGuard(request, response, next) {
    if (!request.user) return requireAuth(request, response, next);
    if (!hasPermission(request.user, permission)) {
      return response.status(403).json({ error: "forbidden", message: "Tu rol no permite esta accion." });
    }
    return next();
  };
}

export function requireCsrf(request, response, next) {
  const supplied = request.get("x-csrf-token");
  if (!request.session || !supplied || supplied !== request.session.csrfToken) {
    return response.status(403).json({ error: "invalid_csrf", message: "Token CSRF invalido o ausente." });
  }
  return next();
}
