import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { logActivity } from "../database.js";
import { requireAuth, requireCsrf, requirePermission } from "../middleware.js";
import { decryptSecret, encryptSecret, hashToken } from "../security.js";
import { hasPermission } from "../permissions.js";
import { hasOrganizationPermission } from "../organizations.js";
import { claimSync, executeSync } from "../sync-service.js";
import {
  getOrganizationConnection,
  persistOAuthSync
} from "../integrations/oauth-storage.js";

const MAX_IMPORT_ITEMS = 500;

export function createIntegrationsRouter({
  database,
  encryptionSecret,
  youtubeProvider,
  providers = {},
  appBaseUrl = "http://127.0.0.1:4173"
}) {
  const router = Router();
  const providerRegistry = { ...providers };
  if (youtubeProvider) providerRegistry.youtube = youtubeProvider;

  function callbackRedirect(platform, status, reason) {
    const url = new URL(appBaseUrl);
    url.searchParams.set("oauth", platform);
    url.searchParams.set("status", status);
    if (reason) url.searchParams.set("reason", reason);
    url.hash = "/integraciones";
    return url.toString();
  }

  function providerFor(platform) {
    return providerRegistry[String(platform || "").toLowerCase()];
  }

  function codeChallenge(verifier) {
    return createHash("sha256").update(verifier).digest("base64url");
  }

  router.get("/", requireAuth, (request, response) => {
    const integrations = database.prepare(
      `SELECT p.slug AS platform, p.name,
              COALESCE(i.status, 'not_configured') AS status,
              i.display_name AS displayName, i.client_id IS NOT NULL AS hasClientId,
              i.client_secret_encrypted IS NOT NULL AS hasClientSecret,
              i.last_sync_at AS lastSyncAt,
              0 AS accountCount
       FROM social_platforms p
       LEFT JOIN organization_integrations i
         ON i.platform_slug = p.slug AND i.organization_id = ?
       GROUP BY p.slug, p.name, i.id
       ORDER BY p.name`
    ).all(request.user.organizationId).map((integration) => {
      const connection = getOrganizationConnection(database, request.user.organizationId, integration.platform);
      return {
        ...integration,
        status: connection?.status || integration.status,
        oauthAvailable: Boolean(providerFor(integration.platform)?.configured),
        connectionId: connection?.id || null,
        connectedAccount: connection?.displayName || null,
        lastSyncAt: connection?.lastSyncAt || integration.lastSyncAt,
        accountCount: connection ? 1 : 0,
        scheduleEnabled: Boolean(connection?.scheduleEnabled),
        scheduleIntervalMinutes: connection?.scheduleIntervalMinutes || null,
        nextSyncAt: connection?.nextSyncAt || null,
        scheduleLastError: connection?.scheduleLastError || null
      };
    });
    response.json({ integrations });
  });

  router.get("/:platform/oauth/start", requirePermission("integrations:write"), (request, response) => {
    const platform = String(request.params.platform || "").toLowerCase();
    const provider = providerFor(platform);
    const supported = database.prepare("SELECT slug FROM social_platforms WHERE slug = ?").get(platform);
    if (!supported) {
      return response.status(404).json({ error: "platform_not_found", message: "Plataforma no soportada." });
    }
    if (!provider?.configured) {
      return response.status(503).json({
        error: "provider_not_configured",
        message: "Configura las credenciales OAuth de " + platform + " en el servidor."
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
    const codeVerifier = provider.pkce ? randomBytes(48).toString("base64url") : null;
    database.prepare(
      `INSERT INTO oauth_states
        (state_hash, user_id, organization_id, platform_slug,
         code_verifier_encrypted, expires_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+10 minutes'))`
    ).run(
      hashToken(state),
      request.user.id,
      request.user.organizationId,
      platform,
      codeVerifier ? encryptSecret(codeVerifier, encryptionSecret) : null
    );
    return response.json({
      authorizationUrl: provider.getAuthorizationUrl(state, {
        codeChallenge: codeVerifier ? codeChallenge(codeVerifier) : undefined
      })
    });
  });

  router.get("/:platform/oauth/callback", async (request, response) => {
    const platform = String(request.params.platform || "").toLowerCase();
    const provider = providerFor(platform);
    const state = String(request.query.state || "");
    const stateHash = hashToken(state);
    const oauthState = database.transaction(() => {
      const row = database.prepare(
        `SELECT s.user_id AS userId, s.organization_id AS organizationId,
                s.code_verifier_encrypted AS codeVerifierEncrypted, m.role_slug AS role
         FROM oauth_states s
         JOIN users u ON u.id = s.user_id AND u.status = 'active'
         JOIN organization_members m ON m.user_id = s.user_id
           AND m.organization_id = s.organization_id AND m.status = 'active'
         JOIN organizations o ON o.id = s.organization_id AND o.status = 'active'
         WHERE s.state_hash = ? AND s.platform_slug = ?
           AND s.expires_at > CURRENT_TIMESTAMP`
      ).get(stateHash, platform);
      database.prepare("DELETE FROM oauth_states WHERE state_hash = ?").run(stateHash);
      return row;
    }).immediate();

    if (!provider?.configured) return response.redirect(callbackRedirect(platform, "error", "provider_not_configured"));
    if (!oauthState || !hasPermission(oauthState, "integrations:write")) return response.redirect(callbackRedirect(platform, "error", "invalid_state"));
    if (request.query.error) return response.redirect(callbackRedirect(platform, "error", "authorization_denied"));
    const code = String(request.query.code || "");
    if (!code) return response.redirect(callbackRedirect(platform, "error", "missing_code"));

    try {
      const codeVerifier = oauthState.codeVerifierEncrypted
        ? decryptSecret(oauthState.codeVerifierEncrypted, encryptionSecret)
        : undefined;
      const exchangedTokens = await provider.exchangeCode(code, { codeVerifier });
      const data = await provider.fetchData(exchangedTokens);
      const outcome = database.transaction(() => {
        if (!hasOrganizationPermission(database, oauthState.userId, oauthState.organizationId, "integrations:write")) {
          return "invalid_state";
        }
        const busy = database.prepare(
          `SELECT 1 FROM oauth_connections c JOIN sync_schedules s ON s.connection_id = c.id
           WHERE c.organization_id = ? AND c.platform_slug = ? AND c.external_account_id = ?
             AND s.lease_expires_at > CURRENT_TIMESTAMP`
        ).get(oauthState.organizationId, platform, data.account.externalId);
        if (busy) return "sync_in_progress";
        const result = persistOAuthSync({
          database,
          encryptionSecret,
          userId: oauthState.userId,
          organizationId: oauthState.organizationId,
          platform,
          data,
          tokens: data.tokens
        });
        logActivity(database, {
          userId: oauthState.userId,
          organizationId: oauthState.organizationId,
          action: "oauth." + platform + "_connected",
          entityType: "oauth_connection",
          entityId: result.connectionId,
          metadata: { accountId: result.accountId, recordsImported: result.recordsImported },
          ipAddress: request.ip
        });
        return null;
      }).immediate();
      if (outcome) return response.redirect(callbackRedirect(platform, "error", outcome));
      return response.redirect(callbackRedirect(platform, "success"));
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) {
        console.error(JSON.stringify({ event: "oauth.callback_failed", platform }));
      }
      return response.redirect(callbackRedirect(platform, "error", "provider_error"));
    }
  });

  router.post("/:platform/sync", requirePermission("sync:run"), requireCsrf, async (request, response, next) => {
    const platform = String(request.params.platform || "").toLowerCase();
    const provider = providerFor(platform);
    const connection = getOrganizationConnection(database, request.user.organizationId, platform);
    if (!connection) {
      return response.status(404).json({ error: "connection_not_found", message: "Conecta primero una cuenta de " + platform + "." });
    }
    if (!provider?.configured) {
      return response.status(503).json({ error: "provider_not_configured", message: "El proveedor no esta configurado." });
    }
    try {
      const claim = claimSync(database, { connectionId: connection.id, organizationId: request.user.organizationId });
      if (!claim) return response.status(409).json({ error: "sync_in_progress", message: "La conexion no esta disponible o ya se esta sincronizando." });
      const result = await executeSync({
        database, encryptionSecret, claim, provider,
        actor: { userId: request.user.id, sessionHash: request.session.tokenHash }
      });
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:platform/schedule", requirePermission("sync:run"), requireCsrf, (request, response) => {
    const platform = String(request.params.platform || "").toLowerCase();
    const connection = getOrganizationConnection(database, request.user.organizationId, platform);
    if (!connection) {
      return response.status(404).json({ error: "connection_not_found", message: "Conecta primero una cuenta de " + platform + "." });
    }
    const enabled = request.body.enabled !== false;
    const intervalMinutes = Number(request.body.intervalMinutes || connection.scheduleIntervalMinutes || 360);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) {
      return response.status(400).json({
        error: "validation_error",
        message: "El intervalo debe estar entre 15 y 10080 minutos."
      });
    }
    database.prepare(
      `INSERT INTO sync_schedules
        (organization_id, connection_id, enabled, interval_minutes, next_run_at)
       VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'))
       ON CONFLICT(connection_id) DO UPDATE SET
         enabled = excluded.enabled,
         interval_minutes = excluded.interval_minutes,
         next_run_at = CASE
           WHEN excluded.enabled = 1 THEN excluded.next_run_at
           ELSE sync_schedules.next_run_at
         END,
         updated_at = CURRENT_TIMESTAMP`
    ).run(request.user.organizationId, connection.id, enabled ? 1 : 0, intervalMinutes, intervalMinutes);
    logActivity(database, {
      userId: request.user.id,
      organizationId: request.user.organizationId,
      action: "sync.schedule_updated",
      entityType: "oauth_connection",
      entityId: connection.id,
      metadata: { platform, enabled, intervalMinutes },
      ipAddress: request.ip
    });
    return response.json({ platform, enabled, intervalMinutes });
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
      `INSERT INTO organization_integrations
        (organization_id, platform_slug, display_name, client_id,
         client_secret_encrypted, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'configured', ?)
       ON CONFLICT(organization_id, platform_slug) DO UPDATE SET
         display_name = excluded.display_name,
         client_id = excluded.client_id,
         client_secret_encrypted = excluded.client_secret_encrypted,
         status = 'configured',
         updated_at = CURRENT_TIMESTAMP`
    ).run(
      request.user.organizationId,
      platform,
      displayName,
      clientId,
      encryptedSecret,
      request.user.id
    );
    logActivity(database, {
      userId: request.user.id,
      organizationId: request.user.organizationId,
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
            `INSERT INTO integrations
              (organization_id, platform_slug, display_name, status, created_by)
             VALUES (?, ?, ?, 'connected', ?)`
          ).run(request.user.organizationId, platform, platform + " import", request.user.id);
          integration = { id: Number(inserted.lastInsertRowid) };
        }

        const syncRun = database.prepare(
          "INSERT INTO sync_runs (integration_id, status) VALUES (?, 'running')"
        ).run(integration.id);
        const conflictingAccount = database.prepare(
          `SELECT id, organization_id AS organizationId
           FROM social_accounts WHERE integration_id = ? AND external_id = ?`
        ).get(integration.id, String(account.externalId));
        if (conflictingAccount && conflictingAccount.organizationId !== request.user.organizationId) {
          throw Object.assign(
            new Error("Esta cuenta social ya pertenece a otra organizacion."),
            { statusCode: 409 }
          );
        }
        database.prepare(
          `INSERT INTO social_accounts
            (organization_id, integration_id, external_id, name, handle, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(integration_id, external_id) DO UPDATE SET
             name = excluded.name, handle = excluded.handle,
             metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP`
        ).run(
          request.user.organizationId,
          integration.id,
          String(account.externalId),
          String(account.name),
          account.handle || null,
          JSON.stringify(account.metadata || {})
        );
        const socialAccount = database.prepare(
          `SELECT id FROM social_accounts
           WHERE organization_id = ? AND integration_id = ? AND external_id = ?`
        ).get(request.user.organizationId, integration.id, String(account.externalId));

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
        database.prepare(
          `INSERT INTO organization_integrations
            (organization_id, platform_slug, display_name, status, last_sync_at, created_by)
           VALUES (?, ?, ?, 'connected', CURRENT_TIMESTAMP, ?)
           ON CONFLICT(organization_id, platform_slug) DO UPDATE SET
             status = 'connected', last_sync_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP`
        ).run(request.user.organizationId, platform, platform + " import", request.user.id);
        return { syncRunId: Number(syncRun.lastInsertRowid), accountId: socialAccount.id, imported };
      })();

      logActivity(database, {
        userId: request.user.id,
        organizationId: request.user.organizationId,
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
