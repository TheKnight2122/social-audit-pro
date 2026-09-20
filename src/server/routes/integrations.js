import { Router } from "express";
import { randomBytes } from "node:crypto";
import { logActivity } from "../database.js";
import { requireAuth, requireCsrf, requirePermission } from "../middleware.js";
import { encryptSecret, hashToken } from "../security.js";
import {
  getUserConnection,
  markConnectionError,
  persistOAuthSync,
  readConnectionTokens
} from "../integrations/oauth-storage.js";

const MAX_IMPORT_ITEMS = 500;

export function createIntegrationsRouter({
  database,
  encryptionSecret,
  youtubeProvider,
  appBaseUrl = "http://127.0.0.1:4173"
}) {
  const router = Router();

  function callbackRedirect(status, reason) {
    const url = new URL(appBaseUrl);
    url.searchParams.set("oauth", "youtube");
    url.searchParams.set("status", status);
    if (reason) url.searchParams.set("reason", reason);
    url.hash = "/integraciones";
    return url.toString();
  }

  router.get("/", requireAuth, (request, response) => {
    const integrations = database.prepare(
      `SELECT p.slug AS platform, p.name,
              COALESCE(i.status, 'not_configured') AS status,
              i.display_name AS displayName, i.client_id IS NOT NULL AS hasClientId,
              i.client_secret_encrypted IS NOT NULL AS hasClientSecret,
              i.last_sync_at AS lastSyncAt,
              COUNT(a.id) AS accountCount
       FROM social_platforms p
       LEFT JOIN integrations i ON i.platform_slug = p.slug
       LEFT JOIN social_accounts a ON a.integration_id = i.id
       GROUP BY p.slug, p.name, i.id
       ORDER BY p.name`
    ).all().map((integration) => {
      const connection = getUserConnection(database, request.user.id, integration.platform);
      return {
        ...integration,
        status: connection?.status || integration.status,
        oauthAvailable: integration.platform === "youtube" && Boolean(youtubeProvider?.configured),
        connectionId: connection?.id || null,
        connectedAccount: connection?.displayName || null,
        lastSyncAt: connection?.lastSyncAt || integration.lastSyncAt,
        accountCount: connection ? 1 : 0
      };
    });
    response.json({ integrations });
  });

  router.get("/youtube/oauth/start", requirePermission("integrations:write"), (request, response) => {
    if (!youtubeProvider?.configured) {
      return response.status(503).json({
        error: "youtube_not_configured",
        message: "Configura las credenciales OAuth de YouTube en el servidor."
      });
    }
    if (!encryptionSecret) {
      return response.status(503).json({
        error: "encryption_not_configured",
        message: "Configura TOKEN_ENCRYPTION_KEY antes de conectar una cuenta."
      });
    }

    database.prepare("DELETE FROM oauth_states WHERE expires_at <= CURRENT_TIMESTAMP").run();
    const state = randomBytes(32).toString("base64url");
    database.prepare(
      `INSERT INTO oauth_states (state_hash, user_id, platform_slug, expires_at)
       VALUES (?, ?, 'youtube', datetime('now', '+10 minutes'))`
    ).run(hashToken(state), request.user.id);
    return response.json({ authorizationUrl: youtubeProvider.getAuthorizationUrl(state) });
  });

  router.get("/youtube/oauth/callback", async (request, response) => {
    const state = String(request.query.state || "");
    const stateHash = hashToken(state);
    const oauthState = database.prepare(
      `SELECT s.user_id AS userId
       FROM oauth_states s
       JOIN users u ON u.id = s.user_id AND u.status = 'active'
       WHERE s.state_hash = ? AND s.platform_slug = 'youtube'
         AND s.expires_at > CURRENT_TIMESTAMP`
    ).get(stateHash);
    database.prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(stateHash);

    if (!oauthState) return response.redirect(callbackRedirect("error", "invalid_state"));
    if (request.query.error) return response.redirect(callbackRedirect("error", "authorization_denied"));
    const code = String(request.query.code || "");
    if (!code) return response.redirect(callbackRedirect("error", "missing_code"));

    try {
      const exchangedTokens = await youtubeProvider.exchangeCode(code);
      const data = await youtubeProvider.fetchData(exchangedTokens);
      const result = persistOAuthSync({
        database,
        encryptionSecret,
        userId: oauthState.userId,
        platform: "youtube",
        data,
        tokens: data.tokens
      });
      logActivity(database, {
        userId: oauthState.userId,
        action: "oauth.youtube_connected",
        entityType: "oauth_connection",
        entityId: result.connectionId,
        metadata: { accountId: result.accountId, recordsImported: result.recordsImported },
        ipAddress: request.ip
      });
      return response.redirect(callbackRedirect("success"));
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) {
        console.error("No se pudo completar OAuth de YouTube:", error.message);
      }
      return response.redirect(callbackRedirect("error", "provider_error"));
    }
  });

  router.post("/youtube/sync", requirePermission("sync:run"), requireCsrf, async (request, response, next) => {
    const connection = getUserConnection(database, request.user.id, "youtube");
    if (!connection) {
      return response.status(404).json({ error: "connection_not_found", message: "Conecta primero una cuenta de YouTube." });
    }
    try {
      const tokens = readConnectionTokens(connection, encryptionSecret);
      const data = await youtubeProvider.fetchData(tokens);
      const result = persistOAuthSync({
        database,
        encryptionSecret,
        userId: request.user.id,
        platform: "youtube",
        data,
        tokens: data.tokens
      });
      logActivity(database, {
        userId: request.user.id,
        action: "sync.youtube_completed",
        entityType: "oauth_connection",
        entityId: connection.id,
        metadata: { recordsImported: result.recordsImported },
        ipAddress: request.ip
      });
      return response.json(result);
    } catch (error) {
      markConnectionError(database, connection.id, error);
      return next(error);
    }
  });

  router.post("/:platform/configure", requirePermission("integrations:write"), requireCsrf, (request, response) => {
    const platform = String(request.params.platform).toLowerCase();
    const supported = database.prepare("SELECT slug FROM social_platforms WHERE slug = ?").get(platform);
    if (!supported) return response.status(404).json({ error: "platform_not_found", message: "Plataforma no soportada." });
    if (!encryptionSecret) {
      return response.status(503).json({
        error: "encryption_not_configured",
        message: "Configura TOKEN_ENCRYPTION_KEY antes de almacenar credenciales."
      });
    }

    const displayName = String(request.body.displayName || "").trim();
    const clientId = String(request.body.clientId || "").trim();
    const clientSecret = String(request.body.clientSecret || "");
    if (!displayName || !clientId || clientSecret.length < 8) {
      return response.status(400).json({ error: "validation_error", message: "Nombre, client ID y client secret son obligatorios." });
    }

    const encryptedSecret = encryptSecret(clientSecret, encryptionSecret);
    database.prepare(
      `INSERT INTO integrations
        (platform_slug, display_name, client_id, client_secret_encrypted, status, created_by)
       VALUES (?, ?, ?, ?, 'configured', ?)
       ON CONFLICT(platform_slug) DO UPDATE SET
         display_name = excluded.display_name,
         client_id = excluded.client_id,
         client_secret_encrypted = excluded.client_secret_encrypted,
         status = 'configured',
         updated_at = CURRENT_TIMESTAMP`
    ).run(platform, displayName, clientId, encryptedSecret, request.user.id);
    logActivity(database, {
      userId: request.user.id,
      action: "integrations.configured",
      entityType: "integration",
      entityId: platform,
      metadata: { platform },
      ipAddress: request.ip
    });
    return response.status(201).json({ platform, displayName, status: "configured" });
  });

  router.post("/:platform/import", requirePermission("sync:run"), requireCsrf, (request, response, next) => {
    const platform = String(request.params.platform).toLowerCase();
    const account = request.body.account || {};
    const metrics = Array.isArray(request.body.metrics) ? request.body.metrics : [];
    const posts = Array.isArray(request.body.posts) ? request.body.posts : [];
    if (!account.externalId || !account.name) {
      return response.status(400).json({ error: "validation_error", message: "La cuenta importada necesita externalId y name." });
    }
    if (metrics.length > MAX_IMPORT_ITEMS || posts.length > MAX_IMPORT_ITEMS) {
      return response.status(413).json({ error: "import_too_large", message: "Cada importacion admite hasta 500 metricas y 500 publicaciones." });
    }

    try {
      const result = database.transaction(() => {
        let integration = database.prepare("SELECT id FROM integrations WHERE platform_slug = ?").get(platform);
        if (!integration) {
          const exists = database.prepare("SELECT slug FROM social_platforms WHERE slug = ?").get(platform);
          if (!exists) throw Object.assign(new Error("Plataforma no soportada."), { statusCode: 404 });
          const inserted = database.prepare(
            `INSERT INTO integrations (platform_slug, display_name, status, created_by)
             VALUES (?, ?, 'connected', ?)`
          ).run(platform, platform + " import", request.user.id);
          integration = { id: Number(inserted.lastInsertRowid) };
        }

        const syncRun = database.prepare(
          "INSERT INTO sync_runs (integration_id, status) VALUES (?, 'running')"
        ).run(integration.id);
        database.prepare(
          `INSERT INTO social_accounts (integration_id, external_id, name, handle, metadata_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(integration_id, external_id) DO UPDATE SET
             name = excluded.name, handle = excluded.handle,
             metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP`
        ).run(integration.id, String(account.externalId), String(account.name), account.handle || null, JSON.stringify(account.metadata || {}));
        const socialAccount = database.prepare(
          "SELECT id FROM social_accounts WHERE integration_id = ? AND external_id = ?"
        ).get(integration.id, String(account.externalId));

        const insertMetric = database.prepare(
          `INSERT INTO metric_snapshots (account_id, metric_key, metric_value, recorded_at, source)
           VALUES (?, ?, ?, ?, 'import')
           ON CONFLICT(account_id, metric_key, recorded_at) DO UPDATE SET metric_value = excluded.metric_value`
        );
        for (const metric of metrics) {
          const value = Number(metric.value);
          if (!metric.key || !Number.isFinite(value) || !metric.recordedAt) {
            throw Object.assign(new Error("Metrica importada invalida."), { statusCode: 400 });
          }
          insertMetric.run(socialAccount.id, String(metric.key), value, String(metric.recordedAt));
        }

        const insertPost = database.prepare(
          `INSERT INTO posts
            (account_id, external_id, published_at, content_type, topic, campaign, description, metrics_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(account_id, external_id) DO UPDATE SET
             published_at = excluded.published_at, content_type = excluded.content_type,
             topic = excluded.topic, campaign = excluded.campaign,
             description = excluded.description, metrics_json = excluded.metrics_json,
             updated_at = CURRENT_TIMESTAMP`
        );
        for (const post of posts) {
          if (!post.externalId || !post.publishedAt) {
            throw Object.assign(new Error("Publicacion importada invalida."), { statusCode: 400 });
          }
          insertPost.run(
            socialAccount.id,
            String(post.externalId),
            String(post.publishedAt),
            post.contentType || null,
            post.topic || null,
            post.campaign || null,
            post.description || null,
            JSON.stringify(post.metrics || {})
          );
        }

        const imported = metrics.length + posts.length;
        database.prepare(
          `UPDATE sync_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
             records_imported = ? WHERE id = ?`
        ).run(imported, syncRun.lastInsertRowid);
        database.prepare(
          `UPDATE integrations SET status = 'connected', last_sync_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(integration.id);
        return { syncRunId: Number(syncRun.lastInsertRowid), accountId: socialAccount.id, imported };
      })();

      logActivity(database, {
        userId: request.user.id,
        action: "sync.import_completed",
        entityType: "sync_run",
        entityId: result.syncRunId,
        metadata: { platform, recordsImported: result.imported },
        ipAddress: request.ip
      });
      return response.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
