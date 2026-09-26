import { createSessionCredentials } from "../../src/server/security.js";
import { createOrganization } from "../../src/server/organizations.js";
import { persistOAuthSync } from "../../src/server/integrations/oauth-storage.js";

export const fixtureSecret = "disposable-validation-key-not-for-production";

export function socialPayload(id, value = 10) {
  return {
    account: { externalId: id, name: id, handle: "@" + id, metadata: {} },
    metrics: [{ key: "subscribers", value, recordedAt: "2026-09-26T00:00:00.000Z" }],
    posts: [{ externalId: id + "-post", publishedAt: "2026-09-26T00:00:00.000Z",
      contentType: "video", description: id, metrics: { views: value }, raw: {} }],
    tokens: { access_token: "fixture-access", refresh_token: "fixture-refresh", scope: "youtube.readonly" },
    syncedAt: "2026-09-26T00:00:00.000Z"
  };
}

export function seedTenant(database, suffix, role = "admin") {
  const userId = Number(database.prepare(
    "INSERT INTO users (display_name, email, password_hash, role_slug) VALUES (?, ?, 'unusable-test-hash', ?)"
  ).run("Fixture " + suffix, suffix + "@example.test", role).lastInsertRowid);
  const organization = createOrganization(database, { name: "Fixture " + suffix, userId, role });
  const credentials = createSessionCredentials();
  database.prepare(
    `INSERT INTO sessions (token_hash, user_id, organization_id, csrf_token, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', '+1 hour'))`
  ).run(credentials.tokenHash, userId, organization.id, credentials.csrfToken);
  const data = socialPayload(suffix);
  const persisted = persistOAuthSync({ database, encryptionSecret: fixtureSecret, userId,
    organizationId: organization.id, platform: "youtube", data, tokens: data.tokens });
  return { userId, organizationId: organization.id, ...persisted,
    csrf: credentials.csrfToken, sessionHash: credentials.tokenHash, cookie: "sap_session=" + credentials.token };
}
