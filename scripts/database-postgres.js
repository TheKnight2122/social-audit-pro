import "dotenv/config";
import Database from "better-sqlite3";
import pg from "pg";
import { preparePostgresTransfer, applyPostgresTransfer, postgresTransferConfig } from "../src/server/postgres-transfer.js";

const [command, sourcePath, confirmation, ...extra] = process.argv.slice(2);
let source;
let plan;
let client;
try {
  if (!["check", "apply"].includes(command) || !sourcePath || extra.length ||
      (command === "check" && confirmation) || (command === "apply" && confirmation !== "--confirm-empty-target")) {
    throw new Error("Uso: npm run db:postgres -- check RUTA_SQLITE | apply RUTA_SQLITE --confirm-empty-target");
  }
  source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  plan = preparePostgresTransfer(source);
  source.close();
  source = null;
  if (command === "check") {
    console.log(JSON.stringify(plan.summary, null, 2));
  } else {
    client = new pg.Client(postgresTransferConfig(process.env.MIGRATION_DATABASE_URL,
      process.env.MIGRATION_ALLOW_LOCAL_PLAINTEXT === "true"));
    client.on("error", () => {});
    await client.connect();
    console.log(JSON.stringify(await applyPostgresTransfer(client, plan), null, 2));
  }
} catch {
  // Driver errors may include credentials, row contents or connection details.
  console.error("No se confirmo el traslado. Consulta docs/34-traslado-postgresql.md y revisa origen y destino. No se modifico SQLite.");
  process.exitCode = 1;
} finally {
  plan?.close();
  source?.close();
  if (client) { try { await client.end(); } catch { /* No private driver details on stderr. */ } }
}
