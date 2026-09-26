const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ADDRESS = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;

function mailError() {
  return Object.assign(new Error("Microsoft 365 no acepto el envio. Revisar configuracion y permisos."), {
    code: "microsoft_mail_failed"
  });
}

export function createMicrosoftMailTransport({
  tenantId = process.env.M365_TENANT_ID || "",
  clientId = process.env.M365_CLIENT_ID || "",
  clientSecret = process.env.M365_CLIENT_SECRET || "",
  sender = process.env.M365_SENDER || "",
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  if (!GUID.test(tenantId) || !GUID.test(clientId) || !clientSecret || !ADDRESS.test(sender)) return null;
  let cachedToken;
  let expiresAt = 0;
  let pendingToken;

  async function accessToken() {
    if (cachedToken && now() < expiresAt) return cachedToken;
    if (!pendingToken) {
      pendingToken = (async () => {
        const response = await fetchImpl("https://login.microsoftonline.com/" + tenantId + "/oauth2/v2.0/token", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
            scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
        });
        if (!response.ok) throw mailError();
        const token = await response.json();
        if (typeof token.access_token !== "string" || !token.access_token ||
            !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) <= 0) throw mailError();
        cachedToken = token.access_token;
        expiresAt = now() + Math.max(0, Math.min(Number(token.expires_in), 86400) - 60) * 1000;
        return cachedToken;
      })().finally(() => { pendingToken = null; });
    }
    return pendingToken;
  }

  return {
    async sendMail({ to, subject, text, html }) {
      try {
        if (typeof to !== "string" || !ADDRESS.test(to)) throw mailError();
        const token = await accessToken();
        const response = await fetchImpl("https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(sender) + "/sendMail", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { subject: String(subject || ""),
            body: { contentType: html ? "HTML" : "Text", content: String(html || text || "") },
            toRecipients: [{ emailAddress: { address: to } }] } })
        });
        if (response.status === 401) { cachedToken = null; expiresAt = 0; }
        // Do not retry sendMail automatically: a network failure can occur after acceptance.
        if (response.status !== 202) throw mailError();
        return { accepted: [to], provider: "microsoft365" };
      } catch {
        throw mailError();
      }
    }
  };
}
