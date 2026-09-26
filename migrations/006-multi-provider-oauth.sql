ALTER TABLE oauth_states ADD COLUMN code_verifier_encrypted TEXT;

CREATE INDEX IF NOT EXISTS idx_oauth_states_platform_expiry
  ON oauth_states(platform_slug, expires_at);
