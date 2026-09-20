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

export function persistOAuthSync({ database, encryptionSecret, userId, platform, data, tokens }) {
  if (!encryptionSecret) throw Object.assign(new Error("TOKEN_ENCRYPTION_KEY no esta configurada."), { code: "encryption_not_configured" });
  if (!tokens?.access_token) throw Object.assign(new Error("El proveedor no devolvio un access token valido."), { code: "access_token_missing" });

  return database.transaction(() => {
    const integration = database.prepare("SELECT id FROM integrations WHERE platform_slug = ?").get(platform);
    let integrationId = integration?.id;
    if (!integrationId) {
      const inserted = database.prepare(
        `INSERT INTO integrations (platform_slug, display_name, status, created_by)
         VALUES (?, ?, 'connected', ?)`
      ).run(platform, platform + " OAuth", userId);
      integrationId = Number(inserted.lastInsertRowid);
    }

    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    database.prepare(
      `INSERT INTO oauth_connections
        (user_id, platform_slug, external_account_id, display_name,
         access_token_encrypted, refresh_token_encrypted, token_type,
         token_expires_at, granted_scopes_json, metadata_json, status, last_sync_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?)
       ON CONFLICT(user_id, platform_slug, external_account_id) DO UPDATE SET
         display_name = excluded.display_name,
         access_token_encrypted = excluded.access_token_encrypted,
         refresh_token_encrypted = COALESCE(excluded.refresh_token_encrypted, oauth_connections.refresh_token_encrypted),
         token_type = excluded.token_type,
         token_expires_at = excluded.token_expires_at,
         granted_scopes_json = excluded.granted_scopes_json,
         metadata_json = excluded.metadata_json,
         status = 'connected', last_sync_at = excluded.last_sync_at,
         updated_at = CURRENT_TIMESTAMP`
    ).run(
      userId,
      platform,
      data.account.externalId,
      data.account.name,
      encryptSecret(tokens.access_token, encryptionSecret),
      encryptedOrNull(tokens.refresh_token, encryptionSecret),
      tokens.token_type || "Bearer",
      expiresAt(tokens),
      JSON.stringify(scopes),
      JSON.stringify(data.account.metadata || {}),
      data.syncedAt
    );

    const connection = database.prepare(
      `SELECT id FROM oauth_connections
       WHERE user_id = ? AND platform_slug = ? AND external_account_id = ?`
    ).get(userId, platform, data.account.externalId);
    const syncRun = database.prepare(
      "INSERT INTO oauth_sync_runs (connection_id, status) VALUES (?, 'running')"
    ).run(connection.id);

    const existingAccount = database.prepare(
      `SELECT a.oauth_connection_id AS connectionId, c.user_id AS ownerId
       FROM social_accounts a
       LEFT JOIN oauth_connections c ON c.id = a.oauth_connection_id
       WHERE a.integration_id = ? AND a.external_id = ?`
    ).get(integrationId, data.account.externalId);
    if (existingAccount && existingAccount.ownerId !== userId) {
      throw Object.assign(
        new Error("Esta cuenta social ya esta registrada y no puede reasignarse a otro usuario."),
        { statusCode: 409, code: "social_account_already_registered" }
      );
    }

    database.prepare(
      `INSERT INTO social_accounts
        (integration_id, oauth_connection_id, external_id, name, handle, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(integration_id, external_id) DO UPDATE SET
         oauth_connection_id = excluded.oauth_connection_id,
         name = excluded.name, handle = excluded.handle,
         metadata_json = excluded.metadata_json, updated_at = CURRENT_TIMESTAMP`
    ).run(
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
