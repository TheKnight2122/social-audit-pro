import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir, platform, arch } from "node:os";
import { performance } from "node:perf_hooks";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";
import { fixtureSecret, seedTenant } from "./lib/validation-fixture.js";

const total = Number(process.argv[2] || 500);
const concurrency = Number(process.argv[3] || 10);
const output = process.argv[4];
if (!Number.isInteger(total) || total < 1 || total > 5000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error("Uso: npm run test:load -- [1-5000 solicitudes] [1-32 concurrentes] [salida.json]");
}
// This command owns its target: it cannot accept a URL or use the user's database.
const root = await mkdtemp(join(tmpdir(), "sap-load-"));
const database = openDatabase(join(root, "fixture.sqlite"));
let server;
try {
  const tenant = seedTenant(database, "load");
  const app = createApp({ database, encryptionSecret: fixtureSecret, requestLog: () => {}, operationsToken: "",
    secureCookies: false, trustProxy: false, youtubeProvider: { configured: false },
    emailService: { configured: false, previewEnabled: false } });
  server = await new Promise((accept, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => accept(instance));
    instance.once("error", reject);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const paths = ["/analytics/dashboard", "/analytics/accounts", "/analytics/posts",
    "/analytics/history?accountId=" + tenant.accountId + "&metric=subscribers", "/reports"];
  const durations = [];
  let next = 0;
  let failures = 0;
  const statuses = {};
  const started = performance.now();
  async function worker() {
    while (next < total) {
      const index = next++;
      const begin = performance.now();
      try {
        const write = index % 10 === 0;
        const result = await fetch(base + "/api/v1" + (write ? "/reports" : paths[index % paths.length]), {
          method: write ? "POST" : "GET",
          headers: { Cookie: tenant.cookie, "X-CSRF-Token": tenant.csrf, "Content-Type": "application/json" },
          body: write ? JSON.stringify({ title: "Carga desechable " + index, content: { fixture: true } }) : undefined,
          signal: AbortSignal.timeout(10000)
        });
        const body = await result.json();
        statuses[result.status] = (statuses[result.status] || 0) + 1;
        if (result.status !== (write ? 201 : 200) || (write && !body.id)) failures += 1;
      } catch { failures += 1; }
      durations.push(performance.now() - begin);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = performance.now() - started;
  durations.sort((a, b) => a - b);
  const percentile = (p) => Number(durations[Math.max(0, Math.ceil(total * p) - 1)].toFixed(2));
  const reports = database.prepare("SELECT COUNT(*) AS n FROM reports").get().n;
  const expectedReports = Math.ceil(total / 10);
  const report = { timestamp: new Date().toISOString(), runtime: process.version, platform: platform() + "-" + arch(),
    scope: "loopback-disposable-sqlite", requests: total, concurrency, failures, statuses,
    elapsedMs: Math.round(elapsed), requestsPerSecond: Number((total / elapsed * 1000).toFixed(2)),
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99),
    reports, expectedReports, passed: failures === 0 && reports === expectedReports };
  if (output) {
    const path = resolve(output);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  database.close();
  await rm(root, { recursive: true, force: true });
}
