import { decryptSecret, encryptSecret } from "../security.js";

function encryptedOrNull(value, encryptionSecret) {
  return value ? encryptSecret(value, encryptionSecret) : null;
}

function expiresAt(tokens) {
  return tokens.expiry_date ? new Date(Number(tokens.expiry_date)).toISOString() : null;
}

export function readConnectionTokens(connection, encryptionSecret) {
  return {
    access_token: decryptSecret(connection.accessTokenEncrypted, encryptionSecret),
    refresh_token: connection.refreshTokenEncrypted
      ? decryptSecret(connection.refreshTokenEncrypted, encryptionSecret)
      : undefined,
    expiry_date: connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : undefined,
    token_type: connection.tokenType || "Bearer",
    scope: JSON.parse(connection.grantedScopesJson || "[]").join(" ")
  };
}

export function getUserConnection(database, userId, platform) {
  return database.prepare(
    `SELECT id, user_id AS userId, platform_slug AS platform,
            external_account_id AS externalAccountId, display_name AS displayName,
            access_token_encrypted AS accessTokenEncrypted,
            refresh_token_encrypted AS refreshTokenEncrypted,
            token_type AS tokenType, token_expires_at AS tokenExpiresAt,
            granted_scopes_json AS grantedScopesJson, status,
            last_sync_at AS lastSyncAt
     FROM oauth_connections
     WHERE user_id = ? AND platform_slug = ? AND status != 'revoked'
     ORDER BY updated_at DESC LIMIT 1`
  ).get(userId, platform);
}

export function getOrganizationConnection(database, organizationId, platform) {
  return database.prepare(
    `SELECT c.id, c.user_id AS userId, c.organization_id AS organizationId,
            c.platform_slug AS platform, c.external_account_id AS externalAccountId,
            c.display_name AS displayName,
            c.access_token_encrypted AS accessTokenEncrypted,
            c.refresh_token_encrypted AS refreshTokenEncrypted,
            c.token_type AS tokenType, c.token_expires_at AS tokenExpiresAt,
            c.granted_scopes_json AS grantedScopesJson, c.status,
            c.last_sync_at AS lastSyncAt,
            s.enabled AS scheduleEnabled,
            s.interval_minutes AS scheduleIntervalMinutes,
            s.next_run_at AS nextSyncAt,
            s.last_error AS scheduleLastError
     FROM oauth_connections c
     LEFT JOIN sync_schedules s ON s.connection_id = c.id
     WHERE c.organization_id = ? AND c.platform_slug = ? AND c.status != 'revoked'
     ORDER BY c.updated_at DESC LIMIT 1`
  ).get(organizationId, platform);
}

export function persistOAuthSync({ database, encryptionSecret, userId, organizationId, platform, data, tokens }) {
  if (!encryptionSecret) throw Object.assign(new Error("TOKEN_ENCRYPTION_KEY no esta configurada."), { code: "encryption_not_configured" });
  if (!tokens?.access_token) throw Object.assign(new Error("El proveedor no devolvio un access token valido."), { code: "access_token_missing" });

  return database.transaction(() => {
    const integration = database.prepare("SELECT id FROM integrations WHERE platform_slug = ?").get(platform);
    let integrationId = integration?.id;
    if (!integrationId) {
      const inserted = database.prepare(
        `INSERT INTO integrations (organization_id, platform_slug, display_name, status, created_by)
         VALUES (?, ?, ?, 'connected', ?)`
      ).run(organizationId, platform, platform + " OAuth", userId);
      integrationId = Number(inserted.lastInsertRowid);
    }

    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    const existingConnection = database.prepare(
      `SELECT id, refresh_token_encrypted AS refreshTokenEncrypted
       FROM oauth_connections
       WHERE organization_id = ? AND platform_slug = ? AND external_account_id = ?`
    ).get(organizationId, platform, data.account.externalId);
    const accessTokenEncrypted = encryptSecret(tokens.access_token, encryptionSecret);
    const refreshTokenEncrypted = encryptedOrNull(tokens.refresh_token, encryptionSecret)
      || existingConnection?.refreshTokenEncrypted
      || null;
    let connectionId = existingConnection?.id;
    if (connectionId) {
      database.prepare(
        `UPDATE oauth_connections SET
           user_id = ?, display_name = ?, access_token_encrypted = ?,
           refresh_token_encrypted = ?, token_type = ?, token_expires_at = ?,
           granted_scopes_json = ?, metadata_json = ?, status = 'connected',
           last_sync_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        userId,
        data.account.name,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokens.token_type || "Bearer",
        expiresAt(tokens),
        JSON.stringify(scopes),
        JSON.stringify(data.account.metadata || {}),
        data.syncedAt,
        connectionId
      );
    } else {
      const insertedConnection = database.prepare(
        `INSERT INTO oauth_connections
          (organization_id, user_id, platform_slug, external_account_id, display_name,
           access_token_encrypted, refresh_token_encrypted, token_type,
           token_expires_at, granted_scopes_json, metadata_json, status, last_sync_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?)`
      ).run(
        organizationId,
        userId,
        platform,
        data.account.externalId,
        data.account.name,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        tokens.token_type || "Bearer",
        expiresAt(tokens),
        JSON.stringify(scopes),
        JSON.stringify(data.account.metadata || {}),
        data.syncedAt
      );
      connectionId = Number(insertedConnection.lastInsertRowid);
    }

    const connection = { id: connectionId };
    const syncRun = database.prepare(
      "INSERT INTO oauth_sync_runs (connection_id, status) VALUES (?, 'running')"
    ).run(connection.id);

    const existingAccount = database.prepare(
      `SELECT a.oauth_connection_id AS connectionId,
              a.organization_id AS organizationId
       FROM social_accounts a
       WHERE a.integration_id = ? AND a.external_id = ?`
    ).get(integrationId, data.account.externalId);
    if (existingAccount && existingAccount.organizationId !== organizationId) {
      throw Object.assign(
        new Error("Esta cuenta social ya esta registrada y no puede reasignarse a otro usuario."),
        { statusCode: 409, code: "social_account_already_registered" }
      );
    }

    database.prepare(
      `INSERT INTO social_accounts
        (organization_id, integration_id, oauth_connection_id, external_id, name, handle, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(integration_id, external_id) DO UPDATE SET
         oauth_connection_id = excluded.oauth_connection_id,
         organization_id = excluded.organization_id,
         name = excluded.name, handle = excluded.handle,
         metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP`
    ).run(
      organizationId,
      integrationId,
      connection.id,
      data.account.externalId,
      data.account.name,
      data.account.handle || null,
      JSON.stringify(data.account.metadata || {})
    );
    const account = database.prepare(
      "SELECT id FROM social_accounts WHERE integration_id = ? AND external_id = ?"
    ).get(integrationId, data.account.externalId);

    const insertMetric = database.prepare(
      `INSERT INTO metric_snapshots (account_id, metric_key, metric_value, recorded_at, source)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, metric_key, recorded_at) DO UPDATE SET
         metric_value = excluded.metric_value, source = excluded.source`
    );
    for (const metric of data.metrics) {
      insertMetric.run(account.id, metric.key, metric.value, metric.recordedAt, platform + "_api");
    }

    const insertPost = database.prepare(
      `INSERT INTO posts
        (account_id, external_id, published_at, content_type, description, metrics_json, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, external_id) DO UPDATE SET
         published_at = excluded.published_at, content_type = excluded.content_type,
         description = excluded.description, metrics_json = excluded.metrics_json,
         raw_json = excluded.raw_json, updated_at = CURRENT_TIMESTAMP`
    );
    for (const post of data.posts) {
      insertPost.run(
        account.id,
        post.externalId,
        post.publishedAt,
        post.contentType || null,
        post.description || null,
        JSON.stringify(post.metrics || {}),
        JSON.stringify(post.raw || {})
      );
    }

    const recordsImported = data.metrics.length + data.posts.length;
    database.prepare(
      `UPDATE oauth_sync_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
         records_imported = ? WHERE id = ?`
    ).run(recordsImported, syncRun.lastInsertRowid);
    database.prepare(
      `UPDATE integrations SET status = 'connected', last_sync_at = ?,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(data.syncedAt, integrationId);
    database.prepare(
      `INSERT INTO organization_integrations
        (organization_id, platform_slug, display_name, status, last_sync_at, created_by)
       VALUES (?, ?, ?, 'connected', ?, ?)
       ON CONFLICT(organization_id, platform_slug) DO UPDATE SET
         status = 'connected', last_sync_at = excluded.last_sync_at,
         updated_at = CURRENT_TIMESTAMP`
    ).run(organizationId, platform, platform + " OAuth", data.syncedAt, userId);
    const scheduleMinutes = Math.max(15, Math.min(10080, Number(process.env.SYNC_INTERVAL_MINUTES || 360)));
    database.prepare(
      `INSERT INTO sync_schedules
        (organization_id, connection_id, enabled, interval_minutes, next_run_at)
       VALUES (?, ?, 1, ?, datetime('now', '+' || ? || ' minutes'))
       ON CONFLICT(connection_id) DO UPDATE SET
         organization_id = excluded.organization_id,
         updated_at = CURRENT_TIMESTAMP`
    ).run(organizationId, connection.id, scheduleMinutes, scheduleMinutes);

    return {
      connectionId: connection.id,
      accountId: account.id,
      recordsImported,
      syncedAt: data.syncedAt
    };
  })();
}

export function markConnectionError(database, connectionId, error) {
  database.prepare(
    "UPDATE oauth_connections SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(connectionId);
  database.prepare(
    `INSERT INTO oauth_sync_runs
      (connection_id, status, completed_at, error_message)
     VALUES (?, 'failed', CURRENT_TIMESTAMP, ?)`
  ).run(connectionId, String(error?.message || "Error de sincronizacion").slice(0, 500));
}
