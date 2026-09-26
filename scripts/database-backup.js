import "dotenv/config";
import Database from "better-sqlite3";
import { createBackup, restoreBackup, verifyBackup } from "../src/server/backups.js";

const [command, ...args] = process.argv.slice(2);
const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
let database;
try {
  let result;
  if (command === "create" && args.length <= 1) {
    database = new Database(process.env.DATABASE_PATH || "data/social-audit-pro.sqlite", {
      readonly: true, fileMustExist: true
    });
    result = await createBackup({
      database, directory: args[0] || process.env.BACKUP_DIRECTORY || "backups", encryptionKey
    });
  } else if (command === "verify" && args.length === 1) {
    result = await verifyBackup({ directory: args[0], encryptionKey });
  } else if (command === "restore" && args.length === 2) {
    result = await restoreBackup({ directory: args[0], target: args[1], encryptionKey });
  } else {
    throw new Error("Uso: create [carpeta] | verify <copia> | restore <copia> <archivo-nuevo.sqlite>");
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Operacion de respaldo fallida: " + error.message);
  process.exitCode = 1;
} finally {
  database?.close();
}
