import { Router } from "express";
import { requirePermission } from "../middleware.js";

export function createAnalyticsRouter({ database }) {
  const router = Router();
  router.use(requirePermission("analytics:read"));

  router.get("/dashboard", (request, response) => {
    const rows = database.prepare(
      `SELECT a.id, a.name, a.handle, a.metadata_json AS metadataJson,
              p.name AS platform, c.last_sync_at AS lastSyncAt,
              (SELECT metric_value FROM metric_snapshots m
               WHERE m.account_id = a.id AND m.metric_key = 'subscribers'
               ORDER BY m.recorded_at DESC LIMIT 1) AS followers,
              (SELECT metric_value FROM metric_snapshots m
               WHERE m.account_id = a.id AND m.metric_key = 'subscribers'
               ORDER BY m.recorded_at DESC LIMIT 1 OFFSET 1) AS previousFollowers
       FROM social_accounts a
       JOIN oauth_connections c ON c.id = a.oauth_connection_id
       JOIN social_platforms p ON p.slug = c.platform_slug
       WHERE c.user_id = ? AND c.status = 'connected'
       ORDER BY p.name, a.name`
    ).all(request.user.id);

    const accounts = rows.map((row) => {
      const metadata = JSON.parse(row.metadataJson || "{}");
      const profileFields = [row.name, row.handle, metadata.description, metadata.thumbnail];
      return {
        id: "live-" + row.id,
        platform: row.platform,
        handle: row.handle || row.name,
        followers: row.followers == null ? null : Number(row.followers),
        previousFollowers: row.previousFollowers == null ? null : Number(row.previousFollowers),
        hasPreviousFollowers: row.previousFollowers != null,
        profileCompleteness: Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100),
        status: "connected",
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
           WHERE c.user_id = ? AND c.status = 'connected'
           ORDER BY po.published_at DESC LIMIT 500`
        ).all(request.user.id).map((row) => {
          const metrics = JSON.parse(row.metricsJson || "{}");
          const published = new Date(row.publishedAt);
          return {
            id: row.platform.toLowerCase() + "-" + row.externalId,
            accountId: accountIds.get(row.accountId),
            date: row.publishedAt.slice(0, 10),
            hour: Number.isNaN(published.getTime()) ? 0 : published.getHours(),
            platform: row.platform,
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
       WHERE c.user_id = ? AND c.status = 'connected'
         AND m.metric_key = 'analytics_views'
       GROUP BY substr(m.recorded_at, 1, 10)
       ORDER BY day DESC LIMIT 28`
    ).all(request.user.id).reverse();
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
              i.last_sync_at AS lastSyncAt
       FROM social_accounts a
       JOIN integrations i ON i.id = a.integration_id
       JOIN social_platforms p ON p.slug = i.platform_slug
       LEFT JOIN oauth_connections c ON c.id = a.oauth_connection_id
       WHERE a.oauth_connection_id IS NULL OR c.user_id = ?
       ORDER BY p.name, a.name`
    ).all(request.user.id);
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
       LEFT JOIN oauth_connections c ON c.id = a.oauth_connection_id
       WHERE a.id = ? AND (a.oauth_connection_id IS NULL OR c.user_id = ?)`
    ).get(accountId, request.user.id);
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
         LEFT JOIN oauth_connections c ON c.id = a.oauth_connection_id
         WHERE a.id = ? AND (a.oauth_connection_id IS NULL OR c.user_id = ?)`
      ).get(accountId, request.user.id);
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
           LEFT JOIN oauth_connections c ON c.id = a.oauth_connection_id
           WHERE a.oauth_connection_id IS NULL OR c.user_id = ?
           ORDER BY po.published_at DESC LIMIT 500`
        ).all(request.user.id);
    response.json({
      posts: rows.map((row) => ({ ...row, metrics: JSON.parse(row.metricsJson), metricsJson: undefined }))
    });
  });

  return router;
}
