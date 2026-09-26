CREATE TABLE IF NOT EXISTS organization_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform_slug TEXT NOT NULL REFERENCES social_platforms(slug),
  display_name TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'connected', 'expired', 'error')),
  last_sync_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, platform_slug)
);

INSERT OR IGNORE INTO organization_integrations
  (organization_id, platform_slug, display_name, client_id,
   client_secret_encrypted, status, last_sync_at, created_by, created_at, updated_at)
SELECT organization_id, platform_slug, display_name, client_id,
       client_secret_encrypted, status, last_sync_at, created_by, created_at, updated_at
FROM integrations
WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_key TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organization_integrations_platform
  ON organization_integrations(organization_id, platform_slug);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time
  ON login_attempts(attempt_key, attempted_at);
