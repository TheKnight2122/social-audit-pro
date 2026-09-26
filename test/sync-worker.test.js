import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/server/database.js";
import { persistOAuthSync } from "../src/server/integrations/oauth-storage.js";
import { createSyncWorker } from "../src/server/sync-worker.js";

function payload(value, syncedAt) {
  return {
    account: {
      externalId: "scheduled-channel",
      name: "Canal programado",
      handle: "@programado",
      metadata: {}
    },
    metrics: [{ key: "analytics_views", value, recordedAt: syncedAt }],
    posts: [],
    tokens: {
      access_token: "updated-access-token",
      refresh_token: "refresh-token",
      token_type: "Bearer",
      expiry_date: Date.now() + 3600000,
      scope: "youtube.readonly"
    },
    syncedAt
  };
}

test("el trabajador reclama y ejecuta sincronizaciones programadas una sola vez", async () => {
  const database = openDatabase(":memory:");
  const encryptionSecret = "worker-test-encryption-secret";
  const user = database.prepare(
    `INSERT INTO users (display_name, email, password_hash, role_slug)
     VALUES ('Worker', 'worker@example.test', 'test', 'admin')`
  ).run();
  const userId = Number(user.lastInsertRowid);
  const organization = database.prepare(
    "INSERT INTO organizations (name, slug) VALUES ('Empresa', 'empresa')"
  ).run();
  const organizationId = Number(organization.lastInsertRowid);
  database.prepare(
    `INSERT INTO organization_members (organization_id, user_id, role_slug)
     VALUES (?, ?, 'admin')`
  ).run(organizationId, userId);
  database.prepare(
    "UPDATE users SET default_organization_id = ? WHERE id = ?"
  ).run(organizationId, userId);

  const initial = payload(10, "2026-09-24T10:00:00.000Z");
  const persisted = persistOAuthSync({
    database,
    encryptionSecret,
    userId,
    organizationId,
    platform: "youtube",
    data: initial,
    tokens: initial.tokens
  });
  database.prepare(
    "UPDATE sync_schedules SET next_run_at = datetime('now', '-1 minute') WHERE connection_id = ?"
  ).run(persisted.connectionId);

  let calls = 0;
  const provider = {
    configured: true,
    async fetchData() {
      calls += 1;
      return payload(25, "2026-09-25T10:00:00.000Z");
    }
  };
  const firstWorker = createSyncWorker({
    database,
    encryptionSecret,
    providers: { youtube: provider },
    workerId: "worker-a"
  });
  const secondWorker = createSyncWorker({
    database,
    encryptionSecret,
    providers: { youtube: provider },
    workerId: "worker-b"
  });

  const [firstResult, secondResult] = await Promise.all([
    firstWorker.runOnce(),
    secondWorker.runOnce()
  ]);
  assert.equal(calls, 1);
  assert.equal(firstResult.length + secondResult.length, 1);

  const schedule = database.prepare(
    `SELECT lease_owner AS leaseOwner, lease_expires_at AS leaseExpiresAt,
            last_completed_at AS lastCompletedAt, last_error AS lastError
     FROM sync_schedules WHERE connection_id = ?`
  ).get(persisted.connectionId);
  assert.equal(schedule.leaseOwner, null);
  assert.equal(schedule.leaseExpiresAt, null);
  assert.ok(schedule.lastCompletedAt);
  assert.equal(schedule.lastError, null);

  const latest = database.prepare(
    `SELECT metric_value AS value FROM metric_snapshots
     WHERE metric_key = 'analytics_views'
     ORDER BY recorded_at DESC LIMIT 1`
  ).get();
  assert.equal(latest.value, 25);
  database.close();
});
