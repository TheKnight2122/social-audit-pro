import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");

rmSync(output, { recursive: true, force: true });
mkdirSync(resolve(output, "src", "data"), { recursive: true });

cpSync(resolve(root, "index.html"), resolve(output, "index.html"));
cpSync(resolve(root, "src", "app.js"), resolve(output, "src", "app.js"));
cpSync(resolve(root, "src", "analytics.js"), resolve(output, "src", "analytics.js"));
cpSync(resolve(root, "src", "styles.css"), resolve(output, "src", "styles.css"));
cpSync(resolve(root, "src", "data", "sampleData.js"), resolve(output, "src", "data", "sampleData.js"));

console.log("Demostracion estatica generada en dist/.");
