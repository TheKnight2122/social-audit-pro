import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret, hashToken } from "./security.js";

export function createAuthToken(database, {
  userId,
  organizationId = null,
  purpose,
  ttlMinutes,
  metadata = {}
}) {
  const token = randomBytes(32).toString("base64url");
  database.prepare(
    `INSERT INTO auth_tokens
      (user_id, organization_id, purpose, token_hash, metadata_json, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  ).run(
    userId,
    organizationId,
    purpose,
    hashToken(token),
    JSON.stringify(metadata),
    "+" + Number(ttlMinutes) + " minutes"
  );
  return token;
}

export function readAuthToken(database, token, purpose) {
  return database.prepare(
    `SELECT id, user_id AS userId, organization_id AS organizationId,
            metadata_json AS metadataJson
     FROM auth_tokens
     WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP`
  ).get(hashToken(token), purpose);
}

export function consumeAuthToken(database, id) {
  return database.prepare(
    `UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP
     WHERE id = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
  ).run(id).changes === 1;
}

export function invalidateAuthTokens(database, userId, purpose) {
  database.prepare(
    `UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`
  ).run(userId, purpose);
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
