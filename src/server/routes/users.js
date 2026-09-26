import { Router } from "express";
import { logActivity } from "../database.js";
import { requireCsrf, requirePermission } from "../middleware.js";
import { permissionsFor } from "../permissions.js";

function serializeUser(row) {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
    roleName: row.roleName,
    status: row.status,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
    permissions: permissionsFor(row.role)
  };
}

export function createUsersRouter({ database }) {
  const router = Router();
  router.use(requirePermission("users:manage"));

  router.get("/", (request, response) => {
    const users = database.prepare(
      `SELECT u.id, u.display_name AS displayName, u.email, m.role_slug AS role,
              r.name AS roleName, m.status, u.created_at AS createdAt,
              u.last_login_at AS lastLoginAt
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.slug = m.role_slug
       WHERE m.organization_id = ?
       ORDER BY u.created_at DESC`
    ).all(request.user.organizationId);
    response.json({ users: users.map(serializeUser) });
  });

  router.patch("/:id", requireCsrf, (request, response) => {
    const userId = Number(request.params.id);
    const existing = database.prepare(
      `SELECT u.id, m.role_slug AS role, m.status
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ? AND m.user_id = ?`
    ).get(request.user.organizationId, userId);
    if (!existing) return response.status(404).json({ error: "user_not_found", message: "Usuario no encontrado." });

    const role = request.body.role == null ? existing.role : String(request.body.role);
    const status = request.body.status == null ? existing.status : String(request.body.status);
    if (!["admin", "analyst", "client"].includes(role) || !["active", "disabled"].includes(status)) {
      return response.status(400).json({ error: "validation_error", message: "Rol o estado invalido." });
    }
    if (request.user.id === userId && (role !== "admin" || status !== "active")) {
      return response.status(400).json({ error: "self_lockout", message: "No puedes quitarte el acceso de administrador." });
    }

    database.transaction(() => {
      database.prepare(
        `UPDATE organization_members
         SET role_slug = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = ? AND user_id = ?`
      ).run(role, status, request.user.organizationId, userId);
      database.prepare(
        `UPDATE users SET role_slug = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND default_organization_id = ?`
      ).run(role, userId, request.user.organizationId);
      if (status === "disabled") {
        database.prepare(
          "DELETE FROM sessions WHERE user_id = ? AND organization_id = ?"
        ).run(userId, request.user.organizationId);
      }
    })();
    logActivity(database, {
      userId: request.user.id,
      organizationId: request.user.organizationId,
      action: "users.updated",
      entityType: "user",
      entityId: userId,
      metadata: { role, status },
      ipAddress: request.ip
    });
    const updated = database.prepare(
      `SELECT u.id, u.display_name AS displayName, u.email, m.role_slug AS role,
              r.name AS roleName, m.status, u.created_at AS createdAt,
              u.last_login_at AS lastLoginAt
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.slug = m.role_slug
       WHERE m.organization_id = ? AND u.id = ?`
    ).get(request.user.organizationId, userId);
    return response.json({ user: serializeUser(updated) });
  });

  return router;
}
