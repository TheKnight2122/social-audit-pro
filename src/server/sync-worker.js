import { randomUUID } from "node:crypto";
import { claimSync, executeSync } from "./sync-service.js";

export function createSyncWorker({ database, encryptionSecret, providers,
  pollIntervalMs = Number(process.env.SYNC_WORKER_POLL_MS || 60000),
  leaseMinutes = 10, workerId = randomUUID(),
  log = (event) => console.log(JSON.stringify(event))
}) {
  let timer = null;
  let running = false;
  let stopping = false;
  let idle = Promise.resolve();

  async function runOnce({ maxJobs = 10 } = {}) {
    if (running || stopping) return [];
    if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) throw new Error("maxJobs invalido.");
    running = true;
    let finish;
    idle = new Promise((resolve) => { finish = resolve; });
    const results = [];
    try {
      for (let index = 0; index < maxJobs && !stopping; index += 1) {
        const claim = claimSync(database, { scheduled: true, leaseSeconds: leaseMinutes * 60 });
        if (!claim) break;
        try {
          const result = await executeSync({ database, claim, encryptionSecret, provider: providers[claim.platform] });
          results.push({ status: "completed", scheduleId: claim.id, result });
        } catch (error) {
          results.push({ status: error.code === "provider_not_configured" ? "skipped" : "failed", scheduleId: claim.id, error });
          if (error.code === "sync_lease_lost") break;
        }
      }
      return results;
    } finally {
      running = false;
      finish();
    }
  }

  function tick() {
    runOnce().catch(() => {
      try { log({ event: "sync.worker_failed", timestamp: new Date().toISOString() }); } catch { /* Keep the worker alive. */ }
    });
  }
  function start() {
    if (timer) return;
    stopping = false;
    timer = setInterval(tick, Math.max(5000, pollIntervalMs));
    timer.unref?.();
    tick();
  }
  function stop() {
    stopping = true;
    if (timer) clearInterval(timer);
    timer = null;
    return idle;
  }
  return { workerId, runOnce, start, stop };
}
