import { randomUUID } from "node:crypto";
import { logActivity } from "./database.js";
import { hasOrganizationPermission } from "./organizations.js";
import { markConnectionError, persistOAuthSync, readConnectionTokens } from "./integrations/oauth-storage.js";

function failure(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function claimSync(database, { connectionId, organizationId, scheduled = false, leaseSeconds = 600 }) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 3600) throw new Error("Arrendamiento invalido.");
  return database.transaction(() => {
    const row = database.prepare(
      `SELECT s.id, s.connection_id AS connectionId, s.organization_id AS organizationId, c.platform_slug AS platform
       FROM sync_schedules s
       JOIN oauth_connections c ON c.id = s.connection_id AND c.organization_id = s.organization_id
       JOIN organizations o ON o.id = s.organization_id AND o.status = 'active'
       WHERE c.status != 'revoked'
         AND (? IS NULL OR c.id = ?) AND (? IS NULL OR s.organization_id = ?)
         AND (? = 0 OR (s.enabled = 1 AND s.next_run_at <= CURRENT_TIMESTAMP))
         AND (s.lease_expires_at IS NULL OR s.lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY s.next_run_at, s.id LIMIT 1`
    ).get(connectionId ?? null, connectionId ?? null, organizationId ?? null, organizationId ?? null, scheduled ? 1 : 0);
    if (!row) return null;
    const owner = randomUUID();
    database.prepare(
      `UPDATE sync_schedules SET lease_owner = ?, lease_expires_at = datetime('now', '+' || ? || ' seconds'),
         last_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(owner, leaseSeconds, row.id);
    return { ...row, owner, scheduled, leaseSeconds };
  }).immediate();
}

export async function executeSync({ database, claim, provider, encryptionSecret, actor, timeoutMs = 120000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error("Tiempo de sincronizacion invalido.");
  let heartbeat;
  let deadline;
  let lost = false;
  const controller = new AbortController();
  function currentConnection() {
    if (lost) return null;
    return database.prepare(
      `SELECT c.id, c.user_id AS userId, c.organization_id AS organizationId,
              c.platform_slug AS platform, c.external_account_id AS externalAccountId,
              c.access_token_encrypted AS accessTokenEncrypted, c.refresh_token_encrypted AS refreshTokenEncrypted,
              c.token_type AS tokenType, c.token_expires_at AS tokenExpiresAt, c.granted_scopes_json AS grantedScopesJson
       FROM sync_schedules s
       JOIN oauth_connections c ON c.id = s.connection_id AND c.organization_id = s.organization_id
       JOIN organizations o ON o.id = c.organization_id AND o.status = 'active'
       WHERE s.id = ? AND s.lease_owner = ? AND s.lease_expires_at > CURRENT_TIMESTAMP
         AND c.id = ? AND c.organization_id = ? AND c.status != 'revoked'
         AND (? = 0 OR s.enabled = 1)`
    ).get(claim.id, claim.owner, claim.connectionId, claim.organizationId, claim.scheduled ? 1 : 0);
  }
  function authorize() {
    if (!actor) return;
    const session = database.prepare(
      `SELECT 1 FROM sessions WHERE token_hash = ? AND user_id = ? AND organization_id = ?
         AND expires_at > CURRENT_TIMESTAMP`
    ).get(actor.sessionHash, actor.userId, claim.organizationId);
    if (!session || !hasOrganizationPermission(database, actor.userId, claim.organizationId, "sync:run")) {
      throw failure("sync_access_changed", "El acceso cambio durante la sincronizacion.", 403);
    }
  }
  try {
    const connection = currentConnection();
    if (!connection) throw failure("sync_lease_lost", "La sincronizacion ya no tiene un bloqueo valido.");
    authorize();
    if (!provider?.configured) throw failure("provider_not_configured", "Proveedor no configurado.", 503);
    heartbeat = setInterval(() => {
      try {
        if (!currentConnection()) throw new Error("lease lost");
        database.prepare(
          `UPDATE sync_schedules SET lease_expires_at = datetime('now', '+' || ? || ' seconds')
           WHERE id = ? AND lease_owner = ? AND lease_expires_at > CURRENT_TIMESTAMP`
        ).run(claim.leaseSeconds, claim.id, claim.owner);
      } catch { lost = true; controller.abort(); }
    }, Math.floor(claim.leaseSeconds * 1000 / 3));
    heartbeat.unref?.();
    const data = await Promise.race([
      Promise.resolve().then(() => provider.fetchData(readConnectionTokens(connection, encryptionSecret), { signal: controller.signal })),
      new Promise((_, reject) => {
        deadline = setTimeout(() => {
          controller.abort();
          reject(failure("sync_timeout", "La sincronizacion supero el tiempo permitido.", 504));
        }, timeoutMs);
      })
    ]);
    return database.transaction(() => {
      // Fence writes inside the transaction so an expired owner cannot persist late results.
      const current = currentConnection();
      if (!current) throw failure("sync_lease_lost", "La sincronizacion ya no tiene un bloqueo valido.");
      authorize();
      if (String(data?.account?.externalId) !== String(current.externalAccountId)) {
        throw failure("sync_account_changed", "El proveedor devolvio otra cuenta social.", 502);
      }
      const result = persistOAuthSync({ database, encryptionSecret, userId: actor?.userId || current.userId,
        organizationId: claim.organizationId, platform: current.platform, data, tokens: data.tokens });
      database.prepare(
        `UPDATE sync_schedules SET next_run_at = datetime('now', '+' || interval_minutes || ' minutes'),
           lease_owner = NULL, lease_expires_at = NULL, last_completed_at = CURRENT_TIMESTAMP,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`
      ).run(claim.id, claim.owner);
      logActivity(database, { userId: actor?.userId || current.userId, organizationId: claim.organizationId,
        action: claim.scheduled ? "sync.automatic_completed" : "sync." + current.platform + "_completed",
        entityType: "oauth_connection", entityId: current.id,
        metadata: { platform: current.platform, recordsImported: result.recordsImported } });
      return result;
    }).immediate();
  } catch (error) {
    const known = ["sync_timeout", "sync_access_changed", "sync_lease_lost", "sync_account_changed", "provider_not_configured"];
    const safeError = known.includes(error.code) ? error : failure("sync_provider_failed", "No se pudo sincronizar con el proveedor.", 502);
    database.transaction(() => {
      const connection = currentConnection();
      if (!connection || safeError.code === "sync_access_changed") return;
      markConnectionError(database, connection.id, safeError);
      database.prepare(
        `UPDATE sync_schedules SET next_run_at = datetime('now', '+30 minutes'), last_error = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND lease_owner = ?`
      ).run(safeError.message, claim.id, claim.owner);
      logActivity(database, { userId: actor?.userId || connection.userId, organizationId: claim.organizationId,
        action: "sync.failed", entityType: "oauth_connection", entityId: connection.id,
        metadata: { platform: connection.platform, code: safeError.code } });
    }).immediate();
    throw safeError;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
    database.prepare("UPDATE sync_schedules SET lease_owner = NULL, lease_expires_at = NULL WHERE id = ? AND lease_owner = ?")
      .run(claim.id, claim.owner);
  }
}
