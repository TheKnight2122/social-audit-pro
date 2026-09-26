import { randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";

const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const limits = [50, 100, 250, 500, 1000, 2500, 5000];

export function createObservability({
  token = "",
  log = (event) => console.log(JSON.stringify(event)),
  now = () => performance.now()
} = {}) {
  if (token && (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token))) {
    throw new Error("OPERATIONS_METRICS_TOKEN debe contener 64 caracteres hexadecimales aleatorios.");
  }
  const expected = Buffer.from("Bearer " + token);
  const started = now();
  let active = 0;
  let completed = 0;
  let aborted = 0;
  let durationSum = 0;
  let durationMax = 0;
  const statuses = { "1xx": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  const buckets = limits.map((leMs) => ({ leMs, count: 0 }));

  function middleware(request, response, next) {
    const requestId = randomUUID();
    const beginning = now();
    const method = methods.has(request.method) ? request.method : "OTHER";
    let recorded = false;
    response.setHeader("X-Request-Id", requestId);
    active += 1;

    function record(finished) {
      if (recorded) return;
      recorded = true;
      response.removeListener("finish", finish);
      response.removeListener("close", close);
      active -= 1;
      const durationMs = Math.max(0, now() - beginning);
      const status = finished ? response.statusCode : null;
      if (finished) {
        completed += 1;
        durationSum += durationMs;
        durationMax = Math.max(durationMax, durationMs);
        statuses[Math.floor(status / 100) + "xx"] += 1;
        for (const bucket of buckets) if (durationMs <= bucket.leMs) bucket.count += 1;
      } else {
        aborted += 1;
      }
      // A fixed field list excludes URLs, OAuth codes, bodies, cookies and user data.
      try {
        log({
          event: finished ? "http.completed" : "http.aborted",
          timestamp: new Date().toISOString(),
          level: !finished || status >= 500 ? "error" : "info",
          requestId, method, status, durationMs: Number(durationMs.toFixed(3))
        });
      } catch { /* A failing log sink must not interrupt HTTP requests. */ }
    }
    function finish() { record(true); }
    function close() { record(response.writableFinished); }
    response.once("finish", finish);
    response.once("close", close);
    next();
  }

  function snapshot() {
    return {
      scope: "process",
      uptimeSeconds: Math.max(0, now() - started) / 1000,
      memoryRssBytes: process.memoryUsage().rss,
      http: {
        active, completed, aborted,
        statuses: { ...statuses },
        durationMs: {
          sum: durationSum, max: durationMax,
          mean: completed ? durationSum / completed : 0,
          cumulativeBuckets: [...buckets.map((bucket) => ({ ...bucket })), { leMs: null, count: completed }]
        }
      }
    };
  }

  function metrics(request, response) {
    response.setHeader("Cache-Control", "no-store");
    if (!token) return response.status(404).json({ error: "api_not_found" });
    const supplied = Buffer.from(request.get("authorization") || "");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.setHeader("WWW-Authenticate", "Bearer");
      return response.status(401).json({ error: "operations_authentication_required" });
    }
    return response.json(snapshot());
  }

  return { middleware, metrics, snapshot };
}
