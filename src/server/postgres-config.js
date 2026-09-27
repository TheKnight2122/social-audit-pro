export function postgresConnectionConfig(value, allowLocalPlaintext = false) {
  const invalid = (message) => Object.assign(new Error(message), { code: "target_config" });
  if (typeof allowLocalPlaintext !== "boolean") throw invalid("La excepcion local debe ser un valor booleano.");
  let url;
  try { url = new URL(value); } catch { throw invalid("La URL PostgreSQL no es valida."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username ||
      url.pathname.length < 2 || url.hash || url.search) {
    throw invalid("Usa una URL PostgreSQL sin parametros; TLS se valida automaticamente.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (allowLocalPlaintext && !local) throw invalid("La excepcion sin TLS solo se permite en loopback.");
  return { connectionString: value, ssl: allowLocalPlaintext ? false : { rejectUnauthorized: true } };
}
