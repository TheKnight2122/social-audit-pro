// Test-only pool facade: PGlite has one connection, so checkouts must be serialized.
export function createPglitePool(database) {
  let available = Promise.resolve();
  const pool = {
    async connect() {
      const previous = available;
      let unlock;
      available = new Promise((resolve) => { unlock = resolve; });
      await previous;
      let released = false;
      return {
        query: (sql, values) => values ? database.query(sql, values)
          : database.exec(sql).then((results) => results.at(-1) || { rows: [] }),
        release() {
          if (released) throw new Error("Conexion liberada dos veces.");
          released = true;
          unlock();
        }
      };
    },
    async query(sql, values) {
      const client = await pool.connect();
      try { return await client.query(sql, values); } finally { client.release(); }
    }
  };
  return pool;
}
