export function numeric(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function expiryFromSeconds(seconds) {
  const value = numeric(seconds);
  return value == null ? undefined : Date.now() + value * 1000;
}

export function scopesAsString(value) {
  if (Array.isArray(value)) return value.join(" ");
  return String(value || "").replaceAll(",", " ").split(/\s+/).filter(Boolean).join(" ");
}

export async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => ({}));
  const providerError = payload.error && (typeof payload.error === "string" ||
    (payload.error.code != null && !["ok", 0].includes(payload.error.code)));
  if (!response.ok || providerError) {
    const message = payload.error_description
      || payload.error?.message
      || payload.error?.message_description
      || payload.message
      || "El proveedor rechazo la solicitud.";
    throw Object.assign(new Error(String(message)), {
      statusCode: response.status >= 500 ? 502 : 400,
      providerStatus: response.status,
      providerPayload: payload
    });
  }
  return payload;
}

export function bearerHeaders(accessToken, extra = {}) {
  return { Authorization: "Bearer " + accessToken, ...extra };
}

export function isExpiring(tokens, marginMs = 60000) {
  return Boolean(tokens.expiry_date && Number(tokens.expiry_date) <= Date.now() + marginMs);
}
