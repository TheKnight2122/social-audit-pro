import "dotenv/config";
import { createApp } from "./src/server/app.js";
import { openDatabase } from "./src/server/database.js";
import { createProviderRegistry } from "./src/server/integrations/providers.js";
import { createSyncWorker } from "./src/server/sync-worker.js";

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;
  const secret = String(process.env.TOKEN_ENCRYPTION_KEY || "");
  if (secret.length < 32 || secret === "replace-with-a-long-random-secret") {
    throw new Error("TOKEN_ENCRYPTION_KEY debe ser un secreto de al menos 32 caracteres en produccion.");
  }
  const baseUrl = new URL(process.env.APP_BASE_URL || "http://127.0.0.1:4173");
  if (baseUrl.protocol !== "https:" && process.env.ALLOW_INSECURE_HTTP !== "true") {
    throw new Error("APP_BASE_URL debe usar HTTPS en produccion.");
  }
}

validateProductionEnvironment();

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const database = openDatabase();
const providers = createProviderRegistry();
let ready = true;
const app = createApp({
  database,
  providers,
  youtubeProvider: providers.youtube,
  readiness: () => ready
});
const syncWorker = createSyncWorker({
  database,
  encryptionSecret: process.env.TOKEN_ENCRYPTION_KEY,
  providers
});
const server = app.listen(port, host, async (error) => {
  if (error) {
    ready = false;
    console.error("No se pudo iniciar Social Audit Pro:", error.message);
    await syncWorker.stop();
    database.close();
    process.exitCode = 1;
    return;
  }
  if (process.env.SYNC_WORKER_ENABLED !== "false") syncWorker.start();
  console.log("Social Audit Pro disponible en http://" + host + ":" + port);
});
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000);
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 66000);

function shutdown(signal) {
  if (!ready) return;
  console.log("\nCerrando servidor por " + signal + "...");
  ready = false;
  const workerStopped = syncWorker.stop();
  server.close(async () => {
    await workerStopped;
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
