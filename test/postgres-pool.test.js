import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresPool, withPostgresTransaction } from "../src/server/postgres-pool.js";

test("pool PostgreSQL limita recursos exige TLS y no registra errores originales", async () => {
  const logs = [];
  const pool = createPostgresPool({ connectionString: "postgres://fixture:private@db.example.test/pilot", log: (value) => logs.push(value) });
  try {
    assert.deepEqual(pool.options.ssl, { rejectUnauthorized: true });
    assert.equal(pool.options.max, 5);
    assert.equal(pool.options.statement_timeout, 10000);
    assert.equal(pool.options.connectionTimeoutMillis, 10000);
    assert.match(pool.options.options, /timezone=UTC/);
    pool.emit("error", new Error("secret-fixture-provider-error"));
    assert.deepEqual(logs, [{ event: "database.pool_error", level: "error" }]);
    assert.throws(() => createPostgresPool({ connectionString: "postgres://u@db.example.test/pilot", max: 0 }));
    assert.throws(() => createPostgresPool({ connectionString: "postgres://u@db.example.test/pilot", allowLocalPlaintext: true }));
    assert.throws(() => createPostgresPool({ connectionString: "postgres://u@127.0.0.1/pilot", allowLocalPlaintext: "false" }));
  } finally { await pool.end(); }
});

test("transaccion PostgreSQL usa un solo cliente libera y confirma una vez", async () => {
  const calls = [];
  let released = 0;
  const client = { async query(sql) { calls.push(sql); }, release(error) { assert.equal(error, undefined); released++; } };
  const pool = { async connect() { return client; }, query() { assert.fail("No usar pool.query dentro de una transaccion."); } };
  const result = await withPostgresTransaction(pool, async (connection) => {
    assert.equal(connection, client);
    await connection.query("SELECT 1");
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(calls, ["BEGIN ISOLATION LEVEL READ COMMITTED", "SELECT 1", "COMMIT"]);
  assert.equal(released, 1);
});

test("transaccion PostgreSQL hace rollback y descarta conexiones ambiguas sin reintentar", async () => {
  for (const failedStep of ["connect", "begin", "body", "rollback", "commit"]) {
    const calls = [];
    const releases = [];
    const client = {
      async query(sql) {
        calls.push(sql);
        if ((failedStep === "begin" && sql.startsWith("BEGIN")) ||
            (failedStep === "rollback" && sql === "ROLLBACK") || (failedStep === "commit" && sql === "COMMIT")) throw new Error("fixture failure");
      },
      release(error) { releases.push(error); }
    };
    const pool = { async connect() { if (failedStep === "connect") throw new Error("connect failure"); return client; } };
    let attempts = 0;
    await assert.rejects(() => withPostgresTransaction(pool, async () => {
      attempts++;
      if (["body", "rollback"].includes(failedStep)) throw new Error("body failure");
    }));
    assert.equal(releases.length, failedStep === "connect" ? 0 : 1);
    assert.ok(attempts <= 1);
    if (failedStep === "body") {
      assert.equal(releases[0], undefined);
      assert.equal(calls.at(-1), "ROLLBACK");
    } else if (failedStep !== "connect") assert.ok(releases[0] instanceof Error);
  }
});
