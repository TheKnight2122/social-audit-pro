import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function validatePassword(password) {
  const value = String(password || "");
  const errors = [];
  if (value.length < 12) errors.push("La contrasena debe tener al menos 12 caracteres.");
  if (!/[a-z]/.test(value)) errors.push("La contrasena debe incluir una minuscula.");
  if (!/[A-Z]/.test(value)) errors.push("La contrasena debe incluir una mayuscula.");
  if (!/\d/.test(value)) errors.push("La contrasena debe incluir un numero.");
  return errors;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PASSWORD_KEY_LENGTH);
  return ["scrypt", salt.toString("base64"), Buffer.from(derived).toString("base64")].join("$");
}

export async function verifyPassword(password, encoded) {
  const [algorithm, saltValue, hashValue] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64");
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, "base64"), expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionCredentials() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    csrfToken: randomBytes(24).toString("base64url")
  };
}

export function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function sessionCookie(token, { secure = false, maxAgeSeconds = 28800 } = {}) {
  const parts = [
    "sap_session=" + encodeURIComponent(token),
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    "Max-Age=" + maxAgeSeconds
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie({ secure = false } = {}) {
  return sessionCookie("", { secure, maxAgeSeconds: 0 });
}

function encryptionKey(secret) {
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY no esta configurada.");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(payload, secret) {
  const [ivValue, tagValue, encryptedValue] = String(payload || "").split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Secreto cifrado invalido.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
