import { Router } from "express";
import { requireCsrf, requirePermission } from "../middleware.js";
import { claimSync, executeSync } from "../sync-service.js";

export function createAnalyticsRouter({ database, providers = {}, encryptionSecret }) {
  const router = Router();
  router.use(requirePermission("analytics:read"));

  router.post("/dashboard/refresh", requireCsrf, async (request, response, next) => {
    try {
      const connections = database.prepare(
        `SELECT id, platform_slug AS platform FROM oauth_connections
         WHERE organization_id = ? AND status != 'revoked' ORDER BY id`
      ).all(request.user.organizationId);
      // Clients may refresh their organization, but cannot configure or force a provider sync.
      const results = await Promise.all(connections.map(async (connection) => {
        const provider = providers[connection.platform];
        if (!provider?.configured) return { platform: connection.platform, status: "not_configured" };
        const claim = claimSync(database, { connectionId: connection.id,
          organizationId: request.user.organizationId, freshnessSeconds: 900 });
        if (!claim) return { platform: connection.platform, status: "recent_or_busy" };
        try {
          await executeSync({ database, encryptionSecret, claim, provider, timeoutMs: 20000,
            actor: { userId: request.user.id, sessionHash: request.session.tokenHash, permission: "analytics:read" } });
          return { platform: connection.platform, status: "updated" };
        } catch {
          return { platform: connection.platform, status: "failed" };
        }
      }));
      response.json({ results, minimumIntervalMinutes: 15 });
    } catch (error) { next(error); }
  });

  router.get("/dashboard", (request, response) => {
    const rows = database.prepare(
      `SELECT a.id, a.name, a.handle, a.metadata_json AS metadataJson,
              p.name AS platform, c.last_sync_at AS lastSyncAt, c.status AS connectionStatus,
              (SELECT metric_value FROM metric_snapshots m
               WHERE m.account_id = a.id AND m.metric_key = CASE WHEN c.platform_slug = 'youtube' THEN 'subscribers' ELSE 'followers' END
               ORDER BY m.recorded_at DESC LIMIT 1) AS followers,
              (SELECT metric_value FROM metric_snapshots m
               WHERE m.account_id = a.id AND m.metric_key = CASE WHEN c.platform_slug = 'youtube' THEN 'subscribers' ELSE 'followers' END
               ORDER BY m.recorded_at DESC LIMIT 1 OFFSET 1) AS previousFollowers
       FROM social_accounts a
       JOIN oauth_connections c ON c.id = a.oauth_connection_id
       JOIN social_platforms p ON p.slug = c.platform_slug
       WHERE c.organization_id = ? AND a.organization_id = c.organization_id AND c.status IN ('connected', 'error')
       ORDER BY p.name, a.name`
    ).all(request.user.organizationId);

    const accounts = rows.map((row) => {
      const metadata = JSON.parse(row.metadataJson || "{}");
      const profileFields = [row.name, row.handle, metadata.description || metadata.biography || metadata.bio, metadata.thumbnail || metadata.avatar];
      return {
        id: "live-" + row.id,
        platform: row.platform === "X / Twitter" ? "X" : row.platform,
        handle: row.handle || row.name,
        followers: row.followers == null ? null : Number(row.followers),
        previousFollowers: row.previousFollowers == null ? null : Number(row.previousFollowers),
        hasPreviousFollowers: row.previousFollowers != null,
        profileCompleteness: Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100),
        status: row.connectionStatus,
        lastSync: row.lastSyncAt,
        source: "official"
      };
    });
    const accountIds = new Map(rows.map((row) => [row.id, "live-" + row.id]));
    const posts = rows.length
      ? database.prepare(
          `SELECT po.account_id AS accountId, po.external_id AS externalId,
                  po.published_at AS publishedAt, po.content_type AS contentType,
                  po.topic, po.campaign, po.description,
                  po.metrics_json AS metricsJson, p.name AS platform
           FROM posts po
           JOIN social_accounts a ON a.id = po.account_id
           JOIN oauth_connections c ON c.id = a.oauth_connection_id
           JOIN social_platforms p ON p.slug = c.platform_slug
           WHERE c.organization_id = ? AND a.organization_id = c.organization_id AND c.status IN ('connected', 'error')
           ORDER BY po.published_at DESC LIMIT 500`
        ).all(request.user.organizationId).map((row) => {
          const metrics = JSON.parse(row.metricsJson || "{}");
          const published = new Date(row.publishedAt);
          return {
            id: row.platform.toLowerCase() + "-" + row.externalId,
            accountId: accountIds.get(row.accountId),
            date: row.publishedAt.slice(0, 10),
            hour: Number.isNaN(published.getTime()) ? 0 : published.getHours(),
            platform: row.platform === "X / Twitter" ? "X" : row.platform,
            format: row.contentType === "video" ? "Video" : (row.contentType || "Sin clasificar"),
            topic: row.topic || "Sin clasificar",
            campaign: row.campaign || "Organico",
            description: row.description || "Publicacion sin titulo",
            reach: metrics.reach ?? null,
            impressions: metrics.impressions ?? null,
            likes: metrics.likes ?? null,
            comments: metrics.comments ?? null,
            shares: metrics.shares ?? null,
            saves: metrics.saves ?? null,
            clicks: metrics.clicks ?? null,
            views: metrics.views ?? null,
            previousReach: metrics.previousReach ?? null,
            engagementBase: row.platform === "YouTube" ? "views" : "reach",
            source: "official"
          };
        })
      : [];

    const dailyViews = database.prepare(
      `SELECT substr(m.recorded_at, 1, 10) AS day, SUM(m.metric_value) AS value
       FROM metric_snapshots m
       JOIN social_accounts a ON a.id = m.account_id
       JOIN oauth_connections c ON c.id = a.oauth_connection_id
       WHERE c.organization_id = ? AND a.organization_id = c.organization_id AND c.status IN ('connected', 'error')
         AND m.metric_key = 'analytics_views'
       GROUP BY substr(m.recorded_at, 1, 10)
       ORDER BY day DESC LIMIT 28`
    ).all(request.user.organizationId).reverse();
    const trend = [];
    for (let index = 0; index < dailyViews.length; index += 7) {
      trend.push({
        label: "Sem " + (trend.length + 1),
        value: dailyViews.slice(index, index + 7).reduce((total, point) => total + Number(point.value || 0), 0)
      });
    }

    const lastSync = accounts.map((account) => account.lastSync).filter(Boolean).sort().at(-1) || null;
    return response.json({ source: "official", accounts, posts, trend, lastSync });
  });

  router.get("/accounts", (request, response) => {
    const accounts = database.prepare(
      `SELECT a.id, a.external_id AS externalId, a.name, a.handle,
              p.slug AS platform, p.name AS platformName,
              oi.last_sync_at AS lastSyncAt
       FROM social_accounts a
       JOIN integrations i ON i.id = a.integration_id
       JOIN social_platforms p ON p.slug = i.platform_slug
       LEFT JOIN organization_integrations oi ON oi.organization_id = a.organization_id AND oi.platform_slug = i.platform_slug
       WHERE a.organization_id = ?
       ORDER BY p.name, a.name`
    ).all(request.user.organizationId);
    response.json({ accounts });
  });

  router.get("/history", (request, response) => {
    const accountId = Number(request.query.accountId);
    const metric = String(request.query.metric || "");
    if (!Number.isInteger(accountId) || !metric) {
      return response.status(400).json({ error: "validation_error", message: "accountId y metric son obligatorios." });
    }
    const allowed = database.prepare(
      `SELECT a.id FROM social_accounts a
       WHERE a.id = ? AND a.organization_id = ?`
    ).get(accountId, request.user.organizationId);
    if (!allowed) return response.status(404).json({ error: "account_not_found", message: "Cuenta no encontrada." });
    const history = database.prepare(
      `SELECT metric_key AS metric, metric_value AS value,
              recorded_at AS recordedAt, source
       FROM metric_snapshots
       WHERE account_id = ? AND metric_key = ?
       ORDER BY recorded_at ASC LIMIT 1000`
    ).all(accountId, metric);
    return response.json({ accountId, metric, history });
  });

  router.get("/posts", (request, response) => {
    const accountId = Number(request.query.accountId);
    if (Number.isInteger(accountId)) {
      const allowed = database.prepare(
        `SELECT a.id FROM social_accounts a
         WHERE a.id = ? AND a.organization_id = ?`
      ).get(accountId, request.user.organizationId);
      if (!allowed) return response.status(404).json({ error: "account_not_found", message: "Cuenta no encontrada." });
    }
    const rows = Number.isInteger(accountId)
      ? database.prepare(
          `SELECT id, external_id AS externalId, published_at AS publishedAt,
                  content_type AS contentType, topic, campaign, description, metrics_json AS metricsJson
           FROM posts WHERE account_id = ? ORDER BY published_at DESC LIMIT 500`
        ).all(accountId)
      : database.prepare(
          `SELECT po.id, po.external_id AS externalId, po.published_at AS publishedAt,
                  po.content_type AS contentType, po.topic, po.campaign,
                  po.description, po.metrics_json AS metricsJson
           FROM posts po
           JOIN social_accounts a ON a.id = po.account_id
           WHERE a.organization_id = ?
           ORDER BY po.published_at DESC LIMIT 500`
        ).all(request.user.organizationId);
    response.json({
      posts: rows.map((row) => ({ ...row, metrics: JSON.parse(row.metricsJson), metricsJson: undefined }))
    });
  });

  return router;
}
