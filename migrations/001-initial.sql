PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role_slug TEXT NOT NULL REFERENCES roles(slug),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_platforms (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  oauth_supported INTEGER NOT NULL DEFAULT 1 CHECK (oauth_supported IN (0, 1))
);

CREATE TABLE IF NOT EXISTS integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_slug TEXT NOT NULL UNIQUE REFERENCES social_platforms(slug),
  display_name TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'connected', 'expired', 'error')),
  last_sync_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (integration_id, external_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  content_type TEXT,
  topic TEXT,
  campaign TEXT,
  description TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, external_id)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'import',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, metric_key, recorded_at)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  records_imported INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'executive',
  period_start TEXT,
  period_end TEXT,
  content_json TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_slug);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_accounts_integration ON social_accounts(integration_id);
CREATE INDEX IF NOT EXISTS idx_posts_account_date ON posts(account_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_account_key_date ON metric_snapshots(account_id, metric_key, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_integration_date ON sync_runs(integration_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_creator_date ON reports(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user_date ON activity_logs(user_id, created_at DESC);

INSERT OR IGNORE INTO roles (slug, name) VALUES
  ('admin', 'Administrador'),
  ('analyst', 'Analista'),
  ('client', 'Cliente');

INSERT OR IGNORE INTO social_platforms (slug, name) VALUES
  ('facebook', 'Facebook'),
  ('instagram', 'Instagram'),
  ('tiktok', 'TikTok'),
  ('linkedin', 'LinkedIn'),
  ('youtube', 'YouTube'),
  ('x', 'X / Twitter');
