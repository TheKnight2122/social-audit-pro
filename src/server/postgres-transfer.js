import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { openDatabase } from "./database.js";
import { postgresConnectionConfig } from "./postgres-config.js";

export const transferTables = Object.freeze([
  "roles", "social_platforms", "organizations", "users", "organization_members",
  "sessions", "integrations", "organization_integrations", "oauth_connections", "oauth_states",
  "social_accounts", "posts", "metric_snapshots", "sync_runs", "oauth_sync_runs", "reports",
  "activity_logs", "sync_schedules", "login_attempts", "auth_tokens", "email_outbox"
]);
const baselineName = "001-baseline.sql";
const baseline = readFileSync(new URL("../../migrations/postgresql/001-baseline.sql", import.meta.url), "utf8");
const maxSnapshotBytes = 256 * 1024 * 1024;
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const safeError = (code, message) => Object.assign(new Error(message), { code });

function schema(database) {
  return database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
}

function tableInfo(database, table) {
  const columns = database.pragma(`table_info(${quote(table)})`);
  const keys = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
  return { columns, names: columns.map((column) => column.name), keys };
}

function orderBy(keys, postgres = false) {
  return keys.map((key) => quote(key.name) + (key.type === "TEXT" && postgres ? ' COLLATE "C"' : "")).join(", ");
}

function checkSource(database) {
  const expected = openDatabase(":memory:");
  try {
    if (JSON.stringify(schema(database)) !== JSON.stringify(schema(expected)) ||
        JSON.stringify(database.prepare("SELECT name FROM schema_migrations ORDER BY name").all()) !==
        JSON.stringify(expected.prepare("SELECT name FROM schema_migrations ORDER BY name").all())) {
      throw safeError("source_schema", "El esquema SQLite no coincide con esta version.");
    }
  } finally { expected.close(); }
  const integrity = database.pragma("integrity_check");
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok" || database.pragma("foreign_key_check").length) {
    throw safeError("source_integrity", "SQLite contiene datos o referencias invalidas.");
  }
  for (const table of ["oauth_connections", "social_accounts", "reports"]) {
    if (database.prepare(`SELECT 1 FROM ${quote(table)} WHERE organization_id IS NULL LIMIT 1`).get()) {
      throw safeError("source_organization", "Hay registros sin empresa asignada. Revisar antes del traslado.");
    }
  }
  for (const [table, key] of [["social_accounts", "oauth_connection_id"], ["sync_schedules", "connection_id"]]) {
    if (database.prepare(`SELECT 1 FROM ${quote(table)} a JOIN oauth_connections c ON c.id = a.${key}
      WHERE a.organization_id != c.organization_id LIMIT 1`).get()) {
      throw safeError("source_organization", "Hay relaciones entre empresas distintas. Revisar antes del traslado.");
    }
  }
  for (const table of transferTables) {
    const { columns } = tableInfo(database, table);
    if (columns.some((column) => column.pk && column.name === "id")) {
      const sequence = database.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table)?.seq || 0;
      if (!Number.isInteger(sequence) || sequence < 0 || sequence >= 2147483647) {
        throw safeError("source_sequence", "Secuencia fuera del rango admitido.");
      }
    }
    for (const row of database.prepare(`SELECT * FROM ${quote(table)}`).iterate()) {
      for (const column of columns) {
        const value = row[column.name];
        if (value === null) continue;
        const invalid = column.type === "INTEGER"
          ? !Number.isInteger(value) || value < -2147483648 || value > 2147483647
          : column.type === "REAL" ? typeof value !== "number" || !Number.isFinite(value)
            : typeof value !== "string" || value.includes("\0");
        if (invalid) throw safeError("source_value", "Hay valores incompatibles con PostgreSQL.");
      }
    }
  }
}

// Work exclusively on a private in-memory snapshot, including committed WAL pages.
export function preparePostgresTransfer(source) {
  const bytes = source.pragma("page_count", { simple: true }) * source.pragma("page_size", { simple: true });
  if (bytes > maxSnapshotBytes) throw safeError("source_size", "El piloto admite instantaneas de hasta 256 MiB.");
  const serialized = source.serialize();
  if (serialized.length > maxSnapshotBytes) throw safeError("source_size", "El piloto admite instantaneas de hasta 256 MiB.");
  // sqlite3_deserialize requires rollback mode in the snapshot header, never on the source.
  // https://www.sqlite.org/c3ref/deserialize.html
  serialized[18] = 1;
  serialized[19] = 1;
  const database = new Database(serialized);
  try {
    database.pragma("trusted_schema = OFF");
    database.pragma("foreign_keys = ON");
    checkSource(database);
    const revoked = Object.fromEntries(["sessions", "auth_tokens", "oauth_states"].map((table) =>
      [table, database.prepare(`SELECT count(*) AS count FROM ${quote(table)}`).get().count]));
    database.transaction(() => {
      database.exec(`DELETE FROM sessions; DELETE FROM auth_tokens; DELETE FROM oauth_states;
        UPDATE users SET mfa_pending_secret_encrypted = NULL, mfa_recovery_codes_json = '[]';
        UPDATE sync_schedules SET enabled = 0, lease_owner = NULL, lease_expires_at = NULL;
        UPDATE sync_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
          error_message = 'Interrumpida por traslado' WHERE status = 'running';
        UPDATE oauth_sync_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
          error_message = 'Interrumpida por traslado' WHERE status = 'running';
        UPDATE email_outbox SET status = 'failed', last_error = 'Envio pausado por traslado'
          WHERE status = 'pending';`);
      database.prepare("INSERT INTO activity_logs (action, entity_type, metadata_json) VALUES (?, ?, ?)")
        .run("system.postgresql_transfer", "database", JSON.stringify({ schedulesPaused: true, sessionsRevoked: true }));
    })();
    const counts = Object.fromEntries(transferTables.map((table) =>
      [table, database.prepare(`SELECT count(*) AS count FROM ${quote(table)}`).get().count]));
    return { database, summary: { sourceValidated: true, targetWritten: false, counts, revoked,
      schedulesPaused: true, recoveryCodesReset: true, pendingMailPaused: true }, close: () => database.close() };
  } catch (error) { database.close(); throw error; }
}

function rowDigest(hash, row, names) {
  hash.update(JSON.stringify(names.map((name) => row[name])) + "\n");
}

export async function applyPostgresTransfer(client, plan) {
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(1935765553, 1) AS acquired");
    if (!lock.rows[0].acquired) throw safeError("target_busy", "Otro traslado esta en curso.");
    const occupied = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp_%'
      UNION ALL SELECT 1 FROM pg_namespace WHERE nspname = 'social_audit' LIMIT 1`);
    if (occupied.rows.length) throw safeError("target_not_empty", "El destino no esta vacio. No se sobrescribio.");
    await client.query("CREATE SCHEMA social_audit");
    await client.query("REVOKE ALL ON SCHEMA social_audit FROM PUBLIC");
    await client.query("SET LOCAL search_path TO social_audit, pg_catalog");
    await client.query(baseline);
    for (const table of transferTables) {
      const { names, keys } = tableInfo(plan.database, table);
      const digest = createHash("sha256");
      const columns = names.map(quote).join(", ");
      const insertBatch = async (rows) => {
        const values = rows.flatMap((row) => names.map((name) => row[name]));
        const tuples = rows.map((_, index) => "(" + names.map((_name, offset) => "$" + (index * names.length + offset + 1)).join(", ") + ")");
        await client.query(`INSERT INTO ${quote(table)} (${columns}) VALUES ${tuples.join(", ")}`, values);
      };
      let batch = [];
      let count = 0;
      for (const row of plan.database.prepare(`SELECT ${columns} FROM ${quote(table)} ORDER BY ${orderBy(keys)}`).iterate()) {
        rowDigest(digest, row, names);
        batch.push(row);
        count++;
        if (batch.length === 100) { await insertBatch(batch); batch = []; }
      }
      if (batch.length) await insertBatch(batch);
      const verified = createHash("sha256");
      let read = 0;
      for (;;) {
        const result = await client.query(`SELECT ${columns} FROM ${quote(table)} ORDER BY ${orderBy(keys, true)} LIMIT 100 OFFSET $1`, [read]);
        if (!result.rows.length) break;
        for (const row of result.rows) rowDigest(verified, row, names);
        read += result.rows.length;
      }
      if (read !== count || digest.digest("hex") !== verified.digest("hex")) {
        throw safeError("target_verification", "El destino no coincide con la instantanea. Traslado cancelado.");
      }
      if (keys.length === 1 && keys[0].name === "id") {
        const maximum = plan.database.prepare(`SELECT max(id) AS id FROM ${quote(table)}`).get().id;
        // Respect SQLite AUTOINCREMENT high-water marks, including previously deleted IDs.
        const sequence = plan.database.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table)?.seq || 0;
        const nextBase = Math.max(maximum || 0, sequence);
        if (!Number.isInteger(nextBase) || nextBase >= 2147483647) throw safeError("source_sequence", "Secuencia fuera del rango admitido.");
        await client.query("SELECT setval(pg_get_serial_sequence($1, 'id'), $2, $3)",
          ["social_audit." + table, Math.max(nextBase, 1), nextBase > 0]);
      }
    }
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [baselineName]);
    await client.query("COMMIT");
    return { ...plan.summary, targetWritten: true, verified: true, schema: "social_audit" };
  } catch (error) {
    if (began) { try { await client.query("ROLLBACK"); } catch { /* A disconnected transaction cannot be reused. */ } }
    if (["target_busy", "target_not_empty", "target_verification", "source_sequence"].includes(error.code)) throw error;
    throw safeError("transfer_failed", "Traslado no confirmado. Revisar el destino antes de reintentar; no se muestran detalles privados.");
  }
}

export function postgresTransferConfig(value, allowLocalPlaintext = false) {
  return { ...postgresConnectionConfig(value, allowLocalPlaintext),
    connectionTimeoutMillis: 10000, query_timeout: 45000, application_name: "social-audit-pro-transfer" };
}
