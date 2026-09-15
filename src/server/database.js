import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(new URL("../../migrations/001-initial.sql", import.meta.url));

export function openDatabase(databasePath = process.env.DATABASE_PATH || "data/social-audit-pro.sqlite") {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(readFileSync(migrationPath, "utf8"));
  return database;
}

export function logActivity(database, {
  userId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = {},
  ipAddress = null
}) {
  database.prepare(
    `INSERT INTO activity_logs
      (user_id, action, entity_type, entity_id, metadata_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(metadata), ipAddress);
}
