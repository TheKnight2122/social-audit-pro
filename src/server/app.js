import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthRouter } from "./routes/auth.js";
import { createUsersRouter } from "./routes/users.js";
import { createIntegrationsRouter } from "./routes/integrations.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createReportsRouter } from "./routes/reports.js";
import { createOrganizationsRouter } from "./routes/organizations.js";
import { createYouTubeProvider } from "./integrations/youtube.js";
import { createEmailService } from "./email.js";
import { createObservability } from "./observability.js";
import {
  sameOrigin,
  securityHeaders,
  sessionLoader,
  requirePermission
} from "./middleware.js";

const projectRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));

function createLoginLimiter(database, { windowMs = 15 * 60 * 1000, maxAttempts = 5 } = {}) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return function loginLimiter(request, response, next) {
    const key = request.ip || "unknown";
    database.prepare(
      "DELETE FROM login_attempts WHERE attempted_at <= datetime('now', '-' || ? || ' seconds')"
    ).run(windowSeconds);
    const active = database.prepare(
      `SELECT COUNT(*) AS count FROM login_attempts
       WHERE attempt_key = ?
         AND attempted_at > datetime('now', '-' || ? || ' seconds')`
    ).get(key, windowSeconds).count;
    if (active >= maxAttempts) {
      response.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return response.status(429).json({
        error: "rate_limited",
        message: "Demasiados intentos. Intenta nuevamente mas tarde."
      });
    }
    database.prepare("INSERT INTO login_attempts (attempt_key) VALUES (?)").run(key);
    return next();
  };
}

export function createApp({
  database,
  encryptionSecret = process.env.TOKEN_ENCRYPTION_KEY,
  secureCookies = process.env.NODE_ENV === "production",
  loginLimit,
  appBaseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:4173",
  youtubeProvider = createYouTubeProvider({
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI
  }),
  emailTransport,
  emailService,
  providers = {},
  operationsToken = process.env.OPERATIONS_METRICS_TOKEN || "",
  requestLog,
  readiness = () => true,
  trustProxy = process.env.TRUST_PROXY === "true" ? 1 : false
}) {
  if (!database) throw new Error("La aplicacion necesita una base de datos.");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  const observability = createObservability({ token: operationsToken, log: requestLog });
  app.use(observability.middleware);
  app.use(securityHeaders);
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/v1/operations/metrics", observability.metrics);
  app.use(express.json({ limit: "256kb" }));
  app.use(sameOrigin);
  app.use(sessionLoader(database));
  const accountEmailService = emailService || createEmailService({
    database,
    transport: emailTransport
  });

  app.get("/api/v1/health/live", (_request, response) => {
    response.json({
      status: "ok",
      service: "social-audit-pro",
      timestamp: new Date().toISOString()
    });
  });

  function readinessHandler(_request, response) {
    try {
      database.prepare("SELECT 1 AS ok").get();
      if (!readiness()) throw new Error("El servicio se esta cerrando.");
      response.json({
        status: "ok",
        service: "social-audit-pro",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch {
      response.status(503).json({
        status: "unavailable",
        service: "social-audit-pro",
        database: "disconnected",
        timestamp: new Date().toISOString()
      });
    }
  }

  app.get("/api/v1/health", readinessHandler);
  app.get("/api/v1/health/ready", readinessHandler);

  app.use("/api/v1/auth", createAuthRouter({
    database,
    secureCookies,
    loginLimiter: createLoginLimiter(database, loginLimit),
    encryptionSecret,
    emailService: accountEmailService,
    appBaseUrl
  }));
  app.use("/api/v1/users", createUsersRouter({ database }));
  app.use("/api/v1/organizations", createOrganizationsRouter({ database }));
  app.use("/api/v1/integrations", createIntegrationsRouter({
    database,
    encryptionSecret,
    providers,
    youtubeProvider,
    appBaseUrl
  }));
  app.use("/api/v1/analytics", createAnalyticsRouter({ database, encryptionSecret,
    providers: { ...providers, youtube: youtubeProvider } }));
  app.use("/api/v1/reports", createReportsRouter({ database }));

  app.get("/api/v1/activity", requirePermission("activity:read"), (request, response) => {
    const activity = database.prepare(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
              a.metadata_json AS metadataJson, a.created_at AS createdAt,
              u.display_name AS userName
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.organization_id = ?
       ORDER BY a.created_at DESC LIMIT 200`
    ).all(request.user.organizationId);
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
  const publicFiles = ["index.html", "src/app.js", "src/analytics.js", "src/styles.css", "src/data/sampleData.js"];
  for (const file of publicFiles) {
    app.get("/" + file, (_request, response) => response.sendFile(resolve(projectRoot, file)));
  }
  app.get("/", (_request, response) => response.sendFile(resolve(projectRoot, "index.html")));
  app.use((_request, response) => response.status(404).end());

  app.use((error, _request, response, _next) => {
    if (response.headersSent) return response.destroy();
    const candidate = Number(error.statusCode || error.status || 500);
    const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
    response.status(status).json({
      error: status >= 500 ? "internal_error" : "request_error",
      message: status >= 500 ? "Ocurrio un error interno." :
        error.type === "entity.parse.failed" ? "El cuerpo JSON no es valido." : error.message
    });
  });

  return app;
}
