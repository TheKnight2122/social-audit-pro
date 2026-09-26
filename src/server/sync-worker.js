import { randomUUID } from "node:crypto";
import { logActivity } from "./database.js";
import {
  markConnectionError,
  persistOAuthSync,
  readConnectionTokens
} from "./integrations/oauth-storage.js";

function connectionById(database, connectionId) {
  return database.prepare(
    `SELECT id, user_id AS userId, organization_id AS organizationId,
            platform_slug AS platform, external_account_id AS externalAccountId,
            display_name AS displayName,
            access_token_encrypted AS accessTokenEncrypted,
            refresh_token_encrypted AS refreshTokenEncrypted,
            token_type AS tokenType, token_expires_at AS tokenExpiresAt,
            granted_scopes_json AS grantedScopesJson, status,
            last_sync_at AS lastSyncAt
     FROM oauth_connections WHERE id = ?`
  ).get(connectionId);
}

export function createSyncWorker({
  database,
  encryptionSecret,
  providers,
  pollIntervalMs = Number(process.env.SYNC_WORKER_POLL_MS || 60000),
  leaseMinutes = 10,
  workerId = randomUUID()
}) {
  let timer = null;
  let running = false;
  let stopping = false;
  let finishRun = null;
  let idle = Promise.resolve();

  const claimNext = database.transaction(() => {
    const schedule = database.prepare(
      `SELECT s.id, s.connection_id AS connectionId,
              s.organization_id AS organizationId,
              s.interval_minutes AS intervalMinutes,
              c.platform_slug AS platform
       FROM sync_schedules s
       JOIN oauth_connections c ON c.id = s.connection_id
       WHERE s.enabled = 1
         AND s.next_run_at <= CURRENT_TIMESTAMP
         AND (s.lease_expires_at IS NULL OR s.lease_expires_at <= CURRENT_TIMESTAMP)
         AND c.status != 'revoked'
       ORDER BY s.next_run_at, s.id
       LIMIT 1`
    ).get();
    if (!schedule) return null;
    const claimed = database.prepare(
      `UPDATE sync_schedules SET
         lease_owner = ?,
         lease_expires_at = datetime('now', '+' || ? || ' minutes'),
         last_started_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP)`
    ).run(workerId, leaseMinutes, schedule.id);
    return claimed.changes === 1 ? schedule : null;
  });

  async function processSchedule(schedule) {
    const connection = connectionById(database, schedule.connectionId);
    const provider = providers[connection?.platform];
    if (!connection || !provider?.configured) {
      database.prepare(
        `UPDATE sync_schedules SET
           next_run_at = datetime('now', '+30 minutes'),
           lease_owner = NULL, lease_expires_at = NULL,
           last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lease_owner = ?`
      ).run("Proveedor no configurado.", schedule.id, workerId);
      return { status: "skipped", scheduleId: schedule.id };
    }

    try {
      const tokens = readConnectionTokens(connection, encryptionSecret);
      const data = await provider.fetchData(tokens);
      const result = persistOAuthSync({
        database,
        encryptionSecret,
        userId: connection.userId,
        organizationId: connection.organizationId,
        platform: connection.platform,
        data,
        tokens: data.tokens
      });
      database.prepare(
        `UPDATE sync_schedules SET
           next_run_at = datetime('now', '+' || interval_minutes || ' minutes'),
           lease_owner = NULL, lease_expires_at = NULL,
           last_completed_at = CURRENT_TIMESTAMP,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lease_owner = ?`
      ).run(schedule.id, workerId);
      logActivity(database, {
        userId: connection.userId,
        organizationId: connection.organizationId,
        action: "sync.automatic_completed",
        entityType: "oauth_connection",
        entityId: connection.id,
        metadata: { platform: connection.platform, recordsImported: result.recordsImported }
      });
      return { status: "completed", scheduleId: schedule.id, result };
    } catch (error) {
      markConnectionError(database, schedule.connectionId, error);
      database.prepare(
        `UPDATE sync_schedules SET
           next_run_at = datetime('now', '+30 minutes'),
           lease_owner = NULL, lease_expires_at = NULL,
           last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lease_owner = ?`
      ).run(String(error?.message || "Error de sincronizacion").slice(0, 500), schedule.id, workerId);
      logActivity(database, {
        userId: connection.userId,
        organizationId: connection.organizationId,
        action: "sync.automatic_failed",
        entityType: "oauth_connection",
        entityId: connection.id,
        metadata: { platform: connection.platform, error: String(error?.message || "unknown") }
      });
      return { status: "failed", scheduleId: schedule.id, error };
    }
  }

  async function runOnce({ maxJobs = 10 } = {}) {
    if (running || stopping) return [];
    running = true;
    idle = new Promise((resolve) => { finishRun = resolve; });
    const results = [];
    try {
      for (let index = 0; index < maxJobs; index += 1) {
        if (stopping) break;
        const schedule = claimNext();
        if (!schedule) break;
        results.push(await processSchedule(schedule));
      }
      return results;
    } finally {
      running = false;
      finishRun();
    }
  }

  function start() {
    if (timer) return;
    stopping = false;
    timer = setInterval(() => {
      runOnce().catch((error) => console.error("Fallo el trabajador de sincronizacion:", error));
    }, Math.max(5000, pollIntervalMs));
    timer.unref?.();
    runOnce().catch((error) => console.error("Fallo la sincronizacion inicial:", error));
  }

  function stop() {
    stopping = true;
    if (timer) clearInterval(timer);
    timer = null;
    return idle;
  }

  return { workerId, runOnce, start, stop };
}
