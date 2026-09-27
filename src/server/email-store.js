const failureMessage = "El proveedor no confirmo la aceptacion del correo.";

export function createSqliteEmailStore(database) {
  return {
    async enqueue({ organizationId, userId, to, template, subject }) {
      const result = database.prepare(`INSERT INTO email_outbox
        (organization_id, user_id, recipient, template, payload_json) VALUES (?, ?, ?, ?, ?)`)
        .run(organizationId, userId, to, template, JSON.stringify({ subject }));
      return Number(result.lastInsertRowid);
    },
    async markSent(id) {
      database.prepare(`UPDATE email_outbox SET status = 'sent', attempts = attempts + 1,
        sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    },
    async markFailed(id) {
      database.prepare(`UPDATE email_outbox SET status = 'failed', attempts = attempts + 1,
        last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(failureMessage, id);
    }
  };
}

export function createPostgresEmailStore(pool) {
  const now = "to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
  return {
    async enqueue({ organizationId, userId, to, template, subject }) {
      return (await pool.query(`INSERT INTO social_audit.email_outbox
        (organization_id, user_id, recipient, template, payload_json) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [organizationId, userId, to, template, JSON.stringify({ subject })])).rows[0].id;
    },
    async markSent(id) {
      await pool.query(`UPDATE social_audit.email_outbox SET status = 'sent', attempts = attempts + 1,
        sent_at = ${now}, updated_at = ${now} WHERE id = $1`, [id]);
    },
    async markFailed(id) {
      await pool.query(`UPDATE social_audit.email_outbox SET status = 'failed', attempts = attempts + 1,
        last_error = $1, updated_at = ${now} WHERE id = $2`, [failureMessage, id]);
    }
  };
}
