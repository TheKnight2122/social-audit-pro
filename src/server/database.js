import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsPath = fileURLToPath(new URL("../../migrations/", import.meta.url));

function runMigrations(database) {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
  const applied = database.prepare("SELECT name FROM schema_migrations WHERE name = ?");
  const record = database.prepare("INSERT INTO schema_migrations (name) VALUES (?)");
  const applyMigration = database.transaction((name, sql) => {
    database.exec(sql);
    record.run(name);
  });

  for (const name of readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort()) {
    if (applied.get(name)) continue;
    applyMigration(name, readFileSync(resolve(migrationsPath, name), "utf8"));
  }
}

export function openDatabase(databasePath = process.env.DATABASE_PATH || "data/social-audit-pro.sqlite") {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  return database;
}

export function logActivity(database, {
  userId = null,
  organizationId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = {},
  ipAddress = null
}) {
  const resolvedOrganizationId = organizationId || (userId
    ? database.prepare("SELECT default_organization_id AS id FROM users WHERE id = ?").get(userId)?.id
    : null);
  database.prepare(
    `INSERT INTO activity_logs
      (organization_id, user_id, action, entity_type, entity_id, metadata_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    resolvedOrganizationId,
    userId,
    action,
    entityType,
    entityId == null ? null : String(entityId),
    JSON.stringify(metadata),
    ipAddress
  );
}
