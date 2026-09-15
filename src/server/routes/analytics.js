import { Router } from "express";
import { requirePermission } from "../middleware.js";

export function createAnalyticsRouter({ database }) {
  const router = Router();
  router.use(requirePermission("analytics:read"));

  router.get("/accounts", (_request, response) => {
    const accounts = database.prepare(
      `SELECT a.id, a.external_id AS externalId, a.name, a.handle,
              p.slug AS platform, p.name AS platformName,
              i.last_sync_at AS lastSyncAt
       FROM social_accounts a
       JOIN integrations i ON i.id = a.integration_id
       JOIN social_platforms p ON p.slug = i.platform_slug
       ORDER BY p.name, a.name`
    ).all();
    response.json({ accounts });
  });

  router.get("/history", (request, response) => {
    const accountId = Number(request.query.accountId);
    const metric = String(request.query.metric || "");
    if (!Number.isInteger(accountId) || !metric) {
      return response.status(400).json({ error: "validation_error", message: "accountId y metric son obligatorios." });
    }
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
    const rows = Number.isInteger(accountId)
      ? database.prepare(
          `SELECT id, external_id AS externalId, published_at AS publishedAt,
                  content_type AS contentType, topic, campaign, description, metrics_json AS metricsJson
           FROM posts WHERE account_id = ? ORDER BY published_at DESC LIMIT 500`
        ).all(accountId)
      : database.prepare(
          `SELECT id, external_id AS externalId, published_at AS publishedAt,
                  content_type AS contentType, topic, campaign, description, metrics_json AS metricsJson
           FROM posts ORDER BY published_at DESC LIMIT 500`
        ).all();
    response.json({
      posts: rows.map((row) => ({ ...row, metrics: JSON.parse(row.metricsJson), metricsJson: undefined }))
    });
  });

  return router;
}
