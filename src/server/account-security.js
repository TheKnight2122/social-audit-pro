import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret, hashToken } from "./security.js";

export async function createAuthToken(store, {
  userId,
  organizationId = null,
  purpose,
  ttlMinutes,
  metadata = {}
}) {
  const token = randomBytes(32).toString("base64url");
  const created = await store.replaceToken({ userId, organizationId, purpose, ttlMinutes,
    tokenHash: hashToken(token), metadataJson: JSON.stringify(metadata) });
  if (!created) throw Object.assign(new Error("La cuenta no esta disponible."), { statusCode: 403 });
  return token;
}

export async function readAuthToken(store, token, purpose) {
  return store.readToken(hashToken(token), purpose);
}

export async function consumeAuthToken(store, id) {
  return store.consumeToken(id);
}

export async function invalidateAuthTokens(store, userId, purpose) {
  return store.invalidateTokens(userId, purpose);
}

export async function createMfaSetup(email, encryptionSecret) {
  const secret = generateSecret();
  const uri = generateURI({ issuer: "Social Audit Pro", label: email, secret });
  return {
    secret,
    encryptedSecret: encryptSecret(secret, encryptionSecret),
    uri,
    qrCodeDataUrl: await QRCode.toDataURL(uri, { width: 240, margin: 1 })
  };
}

function normalizedRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = randomBytes(6).toString("hex").toUpperCase();
    return value.slice(0, 6) + "-" + value.slice(6);
  });
}

export function hashRecoveryCode(value) {
  return hashToken(normalizedRecoveryCode(value));
}

export async function verifyMfaCode({ database, user, code, encryptionSecret }) {
  const supplied = String(code || "").trim();
  if (/^\d{6}$/.test(supplied)) {
    try {
      const secret = decryptSecret(user.mfaSecretEncrypted, encryptionSecret);
      const result = await verify({ secret, token: supplied });
      if (result.valid) return { valid: true, recoveryCode: false };
    } catch {
      return { valid: false, recoveryCode: false };
    }
  }

  return database.transaction(() => {
    const current = database.prepare(
      "SELECT mfa_recovery_codes_json AS codes FROM users WHERE id = ? AND mfa_enabled = 1"
    ).get(user.id);
    const hashes = JSON.parse(current?.codes || "[]");
    const index = hashes.indexOf(hashRecoveryCode(supplied));
    if (index < 0) return { valid: false, recoveryCode: false };
    hashes.splice(index, 1);
    database.prepare(
      "UPDATE users SET mfa_recovery_codes_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(JSON.stringify(hashes), user.id);
    return { valid: true, recoveryCode: true };
  })();
}
