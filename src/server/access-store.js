import { withPostgresTransaction } from "./postgres-pool.js";

function validateAttempt(key, windowSeconds, maxAttempts) {
  if (typeof key !== "string" || !key.length || key.length > 128 ||
      !Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400 ||
      !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10000) {
    throw new Error("Configuracion del limite de acceso invalida.");
  }
}

export function createSqliteAccessStore(database) {
  const find = database.prepare(`SELECT s.token_hash AS tokenHash, s.csrf_token AS csrfToken,
    s.expires_at AS expiresAt, u.id, u.display_name AS displayName, u.email,
    u.email_verified_at AS emailVerifiedAt, u.mfa_enabled AS mfaEnabled,
    m.role_slug AS role, u.status, o.id AS organizationId,
    o.name AS organizationName, o.slug AS organizationSlug
    FROM sessions s JOIN users u ON u.id = s.user_id
    JOIN organization_members m ON m.user_id = u.id AND m.organization_id = s.organization_id
    JOIN organizations o ON o.id = m.organization_id
    WHERE s.token_hash = ? AND datetime(s.expires_at) > CURRENT_TIMESTAMP
      AND u.status = 'active' AND m.status = 'active' AND o.status = 'active'`);
  const touch = database.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?");
  const load = database.transaction((tokenHash) => {
    const session = find.get(tokenHash);
    if (session) touch.run(tokenHash);
    return session;
  });
  const consume = database.transaction((key, windowSeconds, maxAttempts) => {
    database.prepare("DELETE FROM login_attempts WHERE datetime(attempted_at) <= datetime('now', '-' || ? || ' seconds')")
      .run(windowSeconds);
    const { count } = database.prepare(`SELECT COUNT(*) AS count FROM login_attempts WHERE attempt_key = ?
      AND datetime(attempted_at) > datetime('now', '-' || ? || ' seconds')`).get(key, windowSeconds);
    if (count >= maxAttempts) return false;
    database.prepare("INSERT INTO login_attempts (attempt_key) VALUES (?)").run(key);
    return true;
  });
  return {
    async loadSession(tokenHash) {
      if (!/^[a-f0-9]{64}$/.test(tokenHash)) return undefined;
      return load.immediate(tokenHash);
    },
    async consumeLoginAttempt(key, { windowSeconds, maxAttempts }) {
      validateAttempt(key, windowSeconds, maxAttempts);
      return consume.immediate(key, windowSeconds, maxAttempts);
    }
  };
}

export function createPostgresAccessStore(pool) {
  return {
    async loadSession(tokenHash) {
      if (!/^[a-f0-9]{64}$/.test(tokenHash)) return undefined;
      const result = await pool.query(`WITH valid AS (
        SELECT s.token_hash AS "tokenHash", s.csrf_token AS "csrfToken", s.expires_at AS "expiresAt",
          u.id, u.display_name AS "displayName", u.email, u.email_verified_at AS "emailVerifiedAt",
          u.mfa_enabled AS "mfaEnabled", m.role_slug AS role, u.status,
          o.id AS "organizationId", o.name AS "organizationName", o.slug AS "organizationSlug"
        FROM social_audit.sessions s JOIN social_audit.users u ON u.id = s.user_id
        JOIN social_audit.organization_members m ON m.user_id = u.id AND m.organization_id = s.organization_id
        JOIN social_audit.organizations o ON o.id = m.organization_id
        WHERE s.token_hash = $1 AND s.expires_at::timestamptz > statement_timestamp()
          AND u.status = 'active' AND m.status = 'active' AND o.status = 'active'
      ), touched AS (
        UPDATE social_audit.sessions s
        SET last_seen_at = to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        FROM valid v WHERE s.token_hash = v."tokenHash" RETURNING s.token_hash
      ) SELECT v.* FROM valid v JOIN touched t ON t.token_hash = v."tokenHash"`, [tokenHash]);
      return result.rows[0];
    },
    async consumeLoginAttempt(key, { windowSeconds, maxAttempts }) {
      validateAttempt(key, windowSeconds, maxAttempts);
      // Global cleanup runs outside the per-key transaction to avoid cross-key row-lock cycles.
      await pool.query(`DELETE FROM social_audit.login_attempts
        WHERE attempted_at::timestamptz <= statement_timestamp() - $1 * interval '1 second'`, [windowSeconds]);
      return withPostgresTransaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(1935765554, hashtext($1))", [key]);
        const { rows } = await client.query(`SELECT count(*)::int AS count FROM social_audit.login_attempts
          WHERE attempt_key = $1 AND attempted_at::timestamptz > statement_timestamp() - $2 * interval '1 second'`,
        [key, windowSeconds]);
        if (rows[0].count >= maxAttempts) return false;
        await client.query(`INSERT INTO social_audit.login_attempts (attempt_key, attempted_at)
          VALUES ($1, to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))`, [key]);
        return true;
      });
    }
  };
}
