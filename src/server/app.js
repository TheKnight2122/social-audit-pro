import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthRouter } from "./routes/auth.js";
import { createUsersRouter } from "./routes/users.js";
import { createIntegrationsRouter } from "./routes/integrations.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createReportsRouter } from "./routes/reports.js";
import {
  sameOrigin,
  securityHeaders,
  sessionLoader,
  requirePermission
} from "./middleware.js";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function createLoginLimiter({ windowMs = 15 * 60 * 1000, maxAttempts = 5 } = {}) {
  const attempts = new Map();
  return function loginLimiter(request, response, next) {
    const now = Date.now();
    const key = request.ip || "unknown";
    const active = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (active.length >= maxAttempts) {
      response.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return response.status(429).json({
        error: "rate_limited",
        message: "Demasiados intentos. Intenta nuevamente mas tarde."
      });
    }
    active.push(now);
    attempts.set(key, active);
    return next();
  };
}

export function createApp({
  database,
  encryptionSecret = process.env.TOKEN_ENCRYPTION_KEY,
  secureCookies = process.env.NODE_ENV === "production",
  loginLimit
}) {
  if (!database) throw new Error("La aplicacion necesita una base de datos.");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use(securityHeaders);
  app.use(express.json({ limit: "256kb" }));
  app.use(sameOrigin);
  app.use(sessionLoader(database));

  app.get("/api/v1/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "social-audit-pro",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/v1/auth", createAuthRouter({
    database,
    secureCookies,
    loginLimiter: createLoginLimiter(loginLimit)
  }));
  app.use("/api/v1/users", createUsersRouter({ database }));
  app.use("/api/v1/integrations", createIntegrationsRouter({ database, encryptionSecret }));
  app.use("/api/v1/analytics", createAnalyticsRouter({ database }));
  app.use("/api/v1/reports", createReportsRouter({ database }));

  app.get("/api/v1/activity", requirePermission("activity:read"), (_request, response) => {
    const activity = database.prepare(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
              a.metadata_json AS metadataJson, a.created_at AS createdAt,
              u.display_name AS userName
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 200`
    ).all();
    response.json({
      activity: activity.map((item) => ({
        ...item,
        metadata: JSON.parse(item.metadataJson),
        metadataJson: undefined
      }))
    });
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "api_not_found", message: "Endpoint no encontrado." });
  });
  app.use(express.static(projectRoot, {
    index: "index.html",
    extensions: ["html"],
    etag: true,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
  }));
  app.get("*path", (_request, response) => {
    response.sendFile(resolve(projectRoot, "index.html"));
  });

  app.use((error, _request, response, _next) => {
    const status = Number(error.statusCode || 500);
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: status >= 500 ? "internal_error" : "request_error",
      message: status >= 500 ? "Ocurrio un error interno." : error.message
    });
  });

  return app;
}
