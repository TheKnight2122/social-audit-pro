import nodemailer from "nodemailer";
import { createMicrosoftMailTransport } from "./microsoft-mail.js";
import { createSqliteEmailStore } from "./email-store.js";

export function emailTransportFromEnvironment() {
  const provider = process.env.EMAIL_PROVIDER || "smtp";
  if (provider === "microsoft365") return createMicrosoftMailTransport();
  if (provider === "smtp") return smtpTransportFromEnvironment();
  return null;
}

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
  store = createSqliteEmailStore(database),
  transport = emailTransportFromEnvironment(),
  from = process.env.EMAIL_FROM || "Social Audit Pro <no-reply@localhost>",
  environment = process.env.NODE_ENV || "development"
}) {
  return {
    previewEnabled: environment === "test" ||
      (environment === "development" && process.env.EMAIL_PREVIEW_ENABLED === "true"),
    configured: Boolean(transport),
    async send({ organizationId = null, userId, to, template, subject, text, html }) {
      const outboxId = await store.enqueue({ organizationId, userId, to, template, subject });

      if (!transport) {
        return { delivered: false, outboxId, reason: "email_not_configured" };
      }

      try {
        await transport.sendMail({ from, to, subject, text, html });
      } catch {
        await store.markFailed(outboxId);
        return { delivered: false, outboxId, reason: "delivery_failed" };
      }
      // A persistence failure after provider acceptance must not be labelled as a send failure.
      await store.markSent(outboxId);
      return { delivered: true, outboxId };
    }
  };
}
