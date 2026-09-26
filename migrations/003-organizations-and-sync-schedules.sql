CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_slug TEXT NOT NULL REFERENCES roles(slug),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE users ADD COLUMN default_organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE sessions ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE integrations ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE oauth_connections ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE oauth_states ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE social_accounts ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE activity_logs ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

INSERT INTO organizations (name, slug)
SELECT 'Organizacion principal', 'organizacion-principal'
WHERE EXISTS (SELECT 1 FROM users)
  AND NOT EXISTS (SELECT 1 FROM organizations);

INSERT OR IGNORE INTO organization_members (organization_id, user_id, role_slug)
SELECT (SELECT id FROM organizations ORDER BY id LIMIT 1), id, role_slug
FROM users
WHERE EXISTS (SELECT 1 FROM organizations);

UPDATE users
SET default_organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
WHERE default_organization_id IS NULL AND EXISTS (SELECT 1 FROM organizations);

UPDATE sessions
SET organization_id = (SELECT default_organization_id FROM users WHERE users.id = sessions.user_id)
WHERE organization_id IS NULL;

UPDATE integrations
SET organization_id = (
  SELECT default_organization_id FROM users WHERE users.id = integrations.created_by
)
WHERE organization_id IS NULL;

UPDATE oauth_connections
SET organization_id = (
  SELECT default_organization_id FROM users WHERE users.id = oauth_connections.user_id
)
WHERE organization_id IS NULL;

UPDATE oauth_states
SET organization_id = (
  SELECT default_organization_id FROM users WHERE users.id = oauth_states.user_id
)
WHERE organization_id IS NULL;

UPDATE social_accounts
SET organization_id = COALESCE(
  (SELECT organization_id FROM oauth_connections WHERE oauth_connections.id = social_accounts.oauth_connection_id),
  (SELECT organization_id FROM integrations WHERE integrations.id = social_accounts.integration_id)
)
WHERE organization_id IS NULL;

UPDATE reports
SET organization_id = (
  SELECT default_organization_id FROM users WHERE users.id = reports.created_by
)
WHERE organization_id IS NULL;

UPDATE activity_logs
SET organization_id = (
  SELECT default_organization_id FROM users WHERE users.id = activity_logs.user_id
)
WHERE organization_id IS NULL;

CREATE TABLE IF NOT EXISTS sync_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id INTEGER NOT NULL UNIQUE REFERENCES oauth_connections(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK (interval_minutes BETWEEN 15 AND 10080),
  next_run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_started_at TEXT,
  last_completed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sync_schedules (organization_id, connection_id, next_run_at)
SELECT organization_id, id, datetime('now', '+6 hours')
FROM oauth_connections
WHERE organization_id IS NOT NULL AND status = 'connected';

CREATE INDEX IF NOT EXISTS idx_members_user ON organization_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_organization ON sessions(organization_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_integrations_organization ON integrations(organization_id, platform_slug);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_organization
  ON oauth_connections(organization_id, platform_slug, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_connection_org_account
  ON oauth_connections(organization_id, platform_slug, external_account_id)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_organization ON social_accounts(organization_id, id);
CREATE INDEX IF NOT EXISTS idx_reports_organization ON reports(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_organization ON activity_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_schedules_due
  ON sync_schedules(enabled, next_run_at, lease_expires_at);
