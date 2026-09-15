import "dotenv/config";
import { createApp } from "./src/server/app.js";
import { openDatabase } from "./src/server/database.js";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const database = openDatabase();
const app = createApp({ database });
const server = app.listen(port, host, () => {
  console.log("Social Audit Pro disponible en http://" + host + ":" + port);
});

function shutdown(signal) {
  console.log("\nCerrando servidor por " + signal + "...");
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
