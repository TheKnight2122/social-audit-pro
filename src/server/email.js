import nodemailer from "nodemailer";

function smtpTransportFromEnvironment() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

export function createEmailService({
  database,
  transport = smtpTransportFromEnvironment(),
  from = process.env.EMAIL_FROM || "Social Audit Pro <no-reply@localhost>",
  environment = process.env.NODE_ENV || "development"
}) {
  return {
    previewEnabled: environment === "test" ||
      (environment === "development" && process.env.EMAIL_PREVIEW_ENABLED === "true"),
    configured: Boolean(transport),
    async send({ organizationId = null, userId, to, template, subject, text, html }) {
      const queued = database.prepare(
        `INSERT INTO email_outbox
          (organization_id, user_id, recipient, template, payload_json)
         VALUES (?, ?, ?, ?, ?)`
      ).run(organizationId, userId, to, template, JSON.stringify({ subject }));
      const outboxId = Number(queued.lastInsertRowid);

      if (!transport) {
        return { delivered: false, outboxId, reason: "smtp_not_configured" };
      }

      try {
        await transport.sendMail({ from, to, subject, text, html });
        database.prepare(
          `UPDATE email_outbox
           SET status = 'sent', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(outboxId);
        return { delivered: true, outboxId };
      } catch (error) {
        database.prepare(
          `UPDATE email_outbox
           SET status = 'failed', attempts = attempts + 1, last_error = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(String(error.message || error).slice(0, 500), outboxId);
        return { delivered: false, outboxId, reason: "delivery_failed" };
      }
    }
  };
}
