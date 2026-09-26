import { hasPermission } from "./permissions.js";

export function hasOrganizationPermission(database, userId, organizationId, permission) {
  const member = database.prepare(
    `SELECT m.role_slug AS role FROM organization_members m
     JOIN users u ON u.id = m.user_id AND u.status = 'active'
     JOIN organizations o ON o.id = m.organization_id AND o.status = 'active'
     WHERE m.user_id = ? AND m.organization_id = ? AND m.status = 'active'`
  ).get(userId, organizationId);
  return hasPermission(member, permission);
}

function baseSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "organizacion";
}

export function createOrganization(database, { name, userId, role = "admin" }) {
  const normalizedName = String(name || "Organizacion principal").trim().slice(0, 100);
  const root = baseSlug(normalizedName);
  let slug = root;
  let suffix = 2;
  while (database.prepare("SELECT 1 FROM organizations WHERE slug = ?").get(slug)) {
    slug = (root.slice(0, 54) + "-" + suffix).slice(0, 60);
    suffix += 1;
  }

  const result = database.prepare(
    "INSERT INTO organizations (name, slug) VALUES (?, ?)"
  ).run(normalizedName, slug);
  const organizationId = Number(result.lastInsertRowid);
  database.prepare(
    `INSERT INTO organization_members (organization_id, user_id, role_slug)
     VALUES (?, ?, ?)`
  ).run(organizationId, userId, role);
  database.prepare(
    "UPDATE users SET default_organization_id = ? WHERE id = ?"
  ).run(organizationId, userId);
  return { id: organizationId, name: normalizedName, slug, role, status: "active" };
}

export function addOrganizationMember(database, { organizationId, userId, role }) {
  database.prepare(
    `INSERT INTO organization_members (organization_id, user_id, role_slug)
     VALUES (?, ?, ?)
     ON CONFLICT(organization_id, user_id) DO UPDATE SET
       role_slug = excluded.role_slug, status = 'active', updated_at = CURRENT_TIMESTAMP`
  ).run(organizationId, userId, role);
  database.prepare(
    `UPDATE users SET default_organization_id = COALESCE(default_organization_id, ?)
     WHERE id = ?`
  ).run(organizationId, userId);
}

export function findLoginMembership(database, email) {
  return database.prepare(
    `SELECT u.id, u.display_name AS displayName, u.email,
            u.password_hash AS passwordHash, u.status,
            u.email_verified_at AS emailVerifiedAt,
            u.mfa_enabled AS mfaEnabled,
            u.mfa_secret_encrypted AS mfaSecretEncrypted,
            u.mfa_recovery_codes_json AS mfaRecoveryCodesJson,
            m.role_slug AS role, m.organization_id AS organizationId,
            o.name AS organizationName, o.slug AS organizationSlug
     FROM users u
     JOIN organization_members m ON m.user_id = u.id AND m.status = 'active'
     JOIN organizations o ON o.id = m.organization_id AND o.status = 'active'
     WHERE u.email = ?
     ORDER BY (m.organization_id = u.default_organization_id) DESC, m.created_at ASC
     LIMIT 1`
  ).get(email);
}
