import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import request from "supertest";
import { createObservability } from "../src/server/observability.js";
import { createApp } from "../src/server/app.js";
import { openDatabase } from "../src/server/database.js";

const token = "ab".repeat(32);
function fixture(context, options = {}) {
  const database = openDatabase(":memory:");
  context.after(() => database.close());
  const logs = [];
  const app = createApp({ database, operationsToken: token, requestLog: (event) => logs.push(event), ...options });
  return { database, logs, app };
}

test("metricas operativas desactivadas sin clave y configuracion invalida rechazada", async (context) => {
  const { app } = fixture(context, { operationsToken: "" });
  await request(app).get("/api/v1/operations/metrics").set("Authorization", "Bearer " + token).expect(404);
  for (const value of ["short", "z".repeat(64), " " + token, 123]) {
    assert.throws(() => createObservability({ token: value }), /OPERATIONS_METRICS_TOKEN/);
  }
});

test("metricas exigen clave de operador en cabecera y no aceptan cookies ni parametros", async (context) => {
  const { app } = fixture(context);
  for (const authorization of ["", "Bearer wrong", "Bearer " + "cd".repeat(32), "Basic " + token]) {
    const result = await request(app).get("/api/v1/operations/metrics?token=" + token)
      .set("Authorization", authorization).set("Cookie", "sap_session=" + token).expect(401);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["www-authenticate"], "Bearer");
    assert.equal(result.body.http, undefined);
  }
  const result = await request(app).get("/api/v1/operations/metrics").set("Authorization", "Bearer " + token).expect(200);
  assert.equal(result.body.scope, "process");
  assert.equal(result.body.http.completed, 4);
  assert.equal(result.body.http.statuses["4xx"], 4);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.ok(result.body.memoryRssBytes > 0);
});

test("registra identificadores propios sin filtrar rutas secretos ni datos de usuarios", async (context) => {
  const { app, logs } = fixture(context);
  const secret = "sensitive-test-value";
  const result = await request(app).get("/api/v1/" + secret + "?code=" + secret)
    .set("X-Request-Id", secret).set("Authorization", "Bearer " + secret)
    .set("Cookie", "sap_session=" + secret).set("User-Agent", secret).expect(404);
  assert.match(result.headers["x-request-id"], /^[0-9a-f-]{36}$/);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].requestId, result.headers["x-request-id"]);
  assert.deepEqual(Object.keys(logs[0]).sort(), ["durationMs", "event", "level", "method", "requestId", "status", "timestamp"]);
  assert.ok(!JSON.stringify(logs).includes(secret));
  const second = await request(app).get("/api/v1/health").expect(200);
  assert.notEqual(second.headers["x-request-id"], result.headers["x-request-id"]);
});

test("errores JSON y limites de cuerpo conservan monitoreo sin exponer contenido", async (context) => {
  const { app, logs } = fixture(context);
  const secret = "private-json-content";
  const invalid = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json")
    .send('{"password":"' + secret + '"').expect(400);
  assert.equal(invalid.body.message, "El cuerpo JSON no es valido.");
  await request(app).post("/api/v1/auth/login").send({ password: "x".repeat(270000) }).expect(413);
  assert.deepEqual(logs.map((event) => event.status), [400, 413]);
  assert.ok(!JSON.stringify(logs).includes(secret));
});

test("errores internos tienen correlacion sin imprimir mensajes internos", async (context) => {
  const { database, app, logs } = fixture(context);
  const prepare = database.prepare.bind(database);
  database.prepare = () => { throw new Error("private-database-details"); };
  context.after(() => { database.prepare = prepare; });
  const result = await request(app).post("/api/v1/auth/login").send({ email: "test@example.test", password: "test" }).expect(500);
  assert.equal(result.body.error, "internal_error");
  assert.equal(logs[0].level, "error");
  assert.equal(logs[0].requestId, result.headers["x-request-id"]);
  assert.ok(!JSON.stringify(logs).includes("private-database-details"));
});

test("contadores latencias y abortos se registran una vez con memoria acotada", () => {
  let time = 0;
  const logs = [];
  const monitor = createObservability({ now: () => time, log: (event) => logs.push(event) });
  function begin(method, statusCode) {
    const response = Object.assign(new EventEmitter(), { setHeader() {}, statusCode, writableFinished: false });
    monitor.middleware({ method }, response, () => {});
    return response;
  }
  const ok = begin("GET", 200);
  const aborted = begin("UNRECOGNIZED", 200);
  assert.equal(monitor.snapshot().http.active, 2);
  time = 75;
  ok.emit("finish");
  ok.emit("close");
  time = 100;
  aborted.emit("close");
  aborted.emit("finish");
  const failed = begin("POST", 503);
  time = 225;
  failed.emit("finish");
  const data = monitor.snapshot().http;
  assert.equal(data.active, 0);
  assert.equal(data.completed, 2);
  assert.equal(data.aborted, 1);
  assert.equal(data.durationMs.sum, 200);
  assert.equal(data.durationMs.mean, 100);
  assert.equal(data.durationMs.max, 125);
  assert.deepEqual(data.durationMs.cumulativeBuckets.map((b) => b.count), [0, 1, 2, 2, 2, 2, 2, 2]);
  assert.equal(logs.length, 3);
  assert.equal(logs[1].event, "http.aborted");
  assert.equal(logs[1].status, null);
  assert.equal(logs[1].method, "OTHER");
  data.statuses["2xx"] = 10000;
  data.durationMs.cumulativeBuckets[0].count = 10000;
  assert.equal(monitor.snapshot().http.statuses["2xx"], 1);
  assert.equal(monitor.snapshot().http.durationMs.cumulativeBuckets[0].count, 0);
  assert.equal(createObservability().snapshot().http.completed, 0);
});

test("un fallo del destino de logs no interrumpe las respuestas", async (context) => {
  const { app } = fixture(context, { requestLog: () => { throw new Error("logger unavailable"); } });
  await request(app).get("/api/v1/health").expect(200);
  const result = await request(app).get("/api/v1/operations/metrics").set("Authorization", "Bearer " + token).expect(200);
  assert.equal(result.body.http.completed, 1);
});

test("la metrica operativa no depende de sesiones ni revela filas de SQLite", async (context) => {
  const { database, app } = fixture(context);
  database.prepare = () => { throw new Error("database unavailable"); };
  const result = await request(app).get("/api/v1/operations/metrics").set("Authorization", "Bearer " + token)
    .set("Cookie", "sap_session=stale").expect(200);
  assert.deepEqual(Object.keys(result.body).sort(), ["http", "memoryRssBytes", "scope", "uptimeSeconds"]);
});
