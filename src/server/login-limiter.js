export function createLoginLimiter(accessStore, { windowMs = 15 * 60 * 1000, maxAttempts = 5 } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0 || windowMs > 86400000 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10000) {
    throw new Error("Configuracion del limite de acceso invalida.");
  }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  return async function loginLimiter(request, response, next) {
    const accepted = await accessStore.consumeLoginAttempt(request.ip || "unknown", { windowSeconds, maxAttempts });
    if (accepted) return next();
    response.setHeader("Retry-After", windowSeconds);
    return response.status(429).json({
      error: "rate_limited",
      message: "Demasiados intentos. Intenta nuevamente mas tarde."
    });
  };
}
