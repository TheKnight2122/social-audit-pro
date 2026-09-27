import pg from "pg";
import { postgresConnectionConfig } from "./postgres-config.js";

export function createPostgresPool({ connectionString, allowLocalPlaintext = false, max = 5, log = () => {} }) {
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error("El pool admite de 1 a 20 conexiones.");
  const pool = new pg.Pool({
    ...postgresConnectionConfig(connectionString, allowLocalPlaintext),
    max,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    maxLifetimeSeconds: 600,
    statement_timeout: 10000,
    lock_timeout: 3000,
    idle_in_transaction_session_timeout: 15000,
    query_timeout: 15000,
    options: "-c timezone=UTC -c search_path=pg_catalog",
    application_name: "social-audit-pro-backend"
  });
  pool.on("error", () => {
    try { log({ event: "database.pool_error", level: "error" }); } catch { /* Logging must not crash the pool. */ }
  });
  return pool;
}

export async function withPostgresTransaction(pool, callback) {
  const client = await pool.connect();
  let state = "starting";
  let discard = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    state = "transaction";
    const result = await callback(client);
    state = "committing";
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A lost COMMIT response is ambiguous. Never retry or return that client to the pool.
    discard = state !== "transaction";
    if (state === "transaction") {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
    }
    throw error;
  } finally {
    client.release(discard ? new Error("Conexion descartada tras un fallo de transaccion.") : undefined);
  }
}
