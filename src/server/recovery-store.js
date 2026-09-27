import { withPostgresTransaction } from "./postgres-pool.js";

const purposes = new Set(["verify_email", "password_reset", "mfa_login"]);
function validateToken({ purpose, ttlMinutes, tokenHash }) {
  if (!purposes.has(purpose) || !Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 1440 ||
      !/^[a-f0-9]{64}$/.test(tokenHash)) throw new Error("Configuracion del enlace invalida.");
}

export function createSqliteRecoveryStore(database) {
  const invalidate = (userId, purpose) => database.prepare(`UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`).run(userId, purpose);
  const read = (tokenHash, purpose) => database.prepare(`SELECT t.id, t.user_id AS userId,
    t.organization_id AS organizationId, t.metadata_json AS metadataJson
    FROM auth_tokens t JOIN users u ON u.id = t.user_id AND u.status = 'active'
    WHERE t.token_hash = ? AND t.purpose = ? AND t.consumed_at IS NULL
      AND datetime(t.expires_at) > CURRENT_TIMESTAMP`).get(tokenHash, purpose);
  const replace = database.transaction((input) => {
    const { userId, organizationId = null, purpose, ttlMinutes, tokenHash, metadataJson = "{}" } = input;
    if (!database.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").get(userId)) return false;
    invalidate(userId, purpose);
    database.prepare(`INSERT INTO auth_tokens (user_id, organization_id, purpose, token_hash, metadata_json, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+' || ? || ' minutes'))`)
      .run(userId, organizationId, purpose, tokenHash, metadataJson, ttlMinutes);
    return true;
  });
  const complete = database.transaction((tokenHash, purpose, passwordHash) => {
    const token = read(tokenHash, purpose);
    if (!token) return undefined;
    invalidate(token.userId, purpose);
    if (purpose === "verify_email") {
      database.prepare("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(token.userId);
    } else {
      database.prepare(`UPDATE users SET password_hash = ?, mfa_pending_secret_encrypted = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(passwordHash, token.userId);
      database.prepare("DELETE FROM sessions WHERE user_id = ?").run(token.userId);
      invalidate(token.userId, "mfa_login");
    }
    return token;
  });
  return {
    async findUserByEmail(email) {
      return database.prepare(`SELECT id, email, email_verified_at AS emailVerifiedAt,
        default_organization_id AS organizationId FROM users WHERE email = ? AND status = 'active'`).get(email);
    },
    async findUserById(id) {
      return database.prepare(`SELECT id, email, email_verified_at AS emailVerifiedAt,
        default_organization_id AS organizationId FROM users WHERE id = ? AND status = 'active'`).get(id);
    },
    async replaceToken(input) { validateToken(input); return replace.immediate(input); },
    async readToken(hash, purpose) { return read(hash, purpose); },
    async consumeToken(id) {
      return database.prepare(`UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?
        AND consumed_at IS NULL AND datetime(expires_at) > CURRENT_TIMESTAMP
        AND EXISTS (SELECT 1 FROM users WHERE id = auth_tokens.user_id AND status = 'active')`).run(id).changes === 1;
    },
    async invalidateTokens(userId, purpose) { invalidate(userId, purpose); },
    async confirmEmail(hash) { return complete.immediate(hash, "verify_email"); },
    async resetPassword(hash, passwordHash) { return complete.immediate(hash, "password_reset", passwordHash); },
    async recordActivity({ userId, organizationId = null, action, ipAddress = null }) {
      database.prepare(`INSERT INTO activity_logs (user_id, organization_id, action, entity_type, entity_id, ip_address)
        VALUES (?, ?, ?, 'user', ?, ?)`).run(userId, organizationId, action, String(userId), ipAddress);
    }
  };
}

const now = "to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";
const readSql = `SELECT t.id, t.user_id AS "userId", t.organization_id AS "organizationId",
  t.metadata_json AS "metadataJson" FROM social_audit.auth_tokens t
  JOIN social_audit.users u ON u.id = t.user_id AND u.status = 'active'
  WHERE t.token_hash = $1 AND t.purpose = $2 AND t.consumed_at IS NULL
    AND t.expires_at::timestamptz > statement_timestamp()`;

export function createPostgresRecoveryStore(pool) {
  const invalidate = (client, userId, purpose) => client.query(`UPDATE social_audit.auth_tokens
    SET consumed_at = ${now} WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`, [userId, purpose]);
  // Serialize issuance and consumption for a user before reading the current token state.
  const lockUser = async (client, id) => (await client.query(
    "SELECT id FROM social_audit.users WHERE id = $1 AND status = 'active' FOR UPDATE", [id])).rows[0];
  const complete = (hash, purpose, passwordHash) => withPostgresTransaction(pool, async (client) => {
    const candidate = (await client.query(readSql, [hash, purpose])).rows[0];
    if (!candidate || !await lockUser(client, candidate.userId)) return undefined;
    const token = (await client.query(readSql, [hash, purpose])).rows[0];
    if (!token) return undefined;
    await invalidate(client, token.userId, purpose);
    if (purpose === "verify_email") {
      await client.query(`UPDATE social_audit.users SET email_verified_at = ${now}, updated_at = ${now}
        WHERE id = $1`, [token.userId]);
    } else {
      await client.query(`UPDATE social_audit.users SET password_hash = $1,
        mfa_pending_secret_encrypted = NULL, updated_at = ${now} WHERE id = $2`, [passwordHash, token.userId]);
      await client.query("DELETE FROM social_audit.sessions WHERE user_id = $1", [token.userId]);
      await invalidate(client, token.userId, "mfa_login");
    }
    return token;
  });
  return {
    async findUserByEmail(email) {
      return (await pool.query(`SELECT id, email, email_verified_at AS "emailVerifiedAt",
        default_organization_id AS "organizationId" FROM social_audit.users
        WHERE lower(email COLLATE "C") = lower($1 COLLATE "C") AND status = 'active'`, [email])).rows[0];
    },
    async findUserById(id) {
      return (await pool.query(`SELECT id, email, email_verified_at AS "emailVerifiedAt",
        default_organization_id AS "organizationId" FROM social_audit.users WHERE id = $1 AND status = 'active'`, [id])).rows[0];
    },
    async replaceToken(input) {
      validateToken(input);
      const { userId, organizationId = null, purpose, ttlMinutes, tokenHash, metadataJson = "{}" } = input;
      return withPostgresTransaction(pool, async (client) => {
        if (!await lockUser(client, userId)) return false;
        await invalidate(client, userId, purpose);
        await client.query(`INSERT INTO social_audit.auth_tokens
          (user_id, organization_id, purpose, token_hash, metadata_json, expires_at)
          VALUES ($1, $2, $3, $4, $5, to_char((statement_timestamp() + $6 * interval '1 minute')
            AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))`,
        [userId, organizationId, purpose, tokenHash, metadataJson, ttlMinutes]);
        return true;
      });
    },
    async readToken(hash, purpose) { return (await pool.query(readSql, [hash, purpose])).rows[0]; },
    async consumeToken(id) {
      return withPostgresTransaction(pool, async (client) => {
        const candidate = (await client.query("SELECT user_id FROM social_audit.auth_tokens WHERE id = $1", [id])).rows[0];
        if (!candidate || !await lockUser(client, candidate.user_id)) return false;
        const result = await client.query(`UPDATE social_audit.auth_tokens SET consumed_at = ${now}
          WHERE id = $1 AND consumed_at IS NULL AND expires_at::timestamptz > statement_timestamp()`, [id]);
        return result.rowCount === 1;
      });
    },
    async invalidateTokens(userId, purpose) {
      await withPostgresTransaction(pool, async (client) => {
        if (await lockUser(client, userId)) await invalidate(client, userId, purpose);
      });
    },
    async confirmEmail(hash) { return complete(hash, "verify_email"); },
    async resetPassword(hash, passwordHash) { return complete(hash, "password_reset", passwordHash); },
    async recordActivity({ userId, organizationId = null, action, ipAddress = null }) {
      await pool.query(`INSERT INTO social_audit.activity_logs
        (user_id, organization_id, action, entity_type, entity_id, ip_address)
        VALUES ($1, $2, $3, 'user', $4, $5)`, [userId, organizationId, action, String(userId), ipAddress]);
    }
  };
}
