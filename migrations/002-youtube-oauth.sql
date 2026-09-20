CREATE TABLE IF NOT EXISTS oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform_slug TEXT NOT NULL REFERENCES social_platforms(slug),
  external_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_type TEXT,
  token_expires_at TEXT,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'error', 'revoked')),
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, platform_slug, external_account_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform_slug TEXT NOT NULL REFERENCES social_platforms(slug),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  records_imported INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

ALTER TABLE social_accounts ADD COLUMN oauth_connection_id INTEGER
  REFERENCES oauth_connections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_oauth_connections_user
  ON oauth_connections(user_id, platform_slug, status);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_sync_connection
  ON oauth_sync_runs(connection_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_accounts_oauth
  ON social_accounts(oauth_connection_id);
