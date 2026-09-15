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

  router.get("/", (_request, response) => {
    const users = database.prepare(
      `SELECT u.id, u.display_name AS displayName, u.email, u.role_slug AS role,
              r.name AS roleName, u.status, u.created_at AS createdAt,
              u.last_login_at AS lastLoginAt
       FROM users u JOIN roles r ON r.slug = u.role_slug
       ORDER BY u.created_at DESC`
    ).all();
    response.json({ users: users.map(serializeUser) });
  });

  router.patch("/:id", requireCsrf, (request, response) => {
    const userId = Number(request.params.id);
    const existing = database.prepare("SELECT id, role_slug AS role, status FROM users WHERE id = ?").get(userId);
    if (!existing) return response.status(404).json({ error: "user_not_found", message: "Usuario no encontrado." });

    const role = request.body.role == null ? existing.role : String(request.body.role);
    const status = request.body.status == null ? existing.status : String(request.body.status);
    if (!["admin", "analyst", "client"].includes(role) || !["active", "disabled"].includes(status)) {
      return response.status(400).json({ error: "validation_error", message: "Rol o estado invalido." });
    }
    if (request.user.id === userId && (role !== "admin" || status !== "active")) {
      return response.status(400).json({ error: "self_lockout", message: "No puedes quitarte el acceso de administrador." });
    }

    database.prepare(
      "UPDATE users SET role_slug = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(role, status, userId);
    if (status === "disabled") database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    logActivity(database, {
      userId: request.user.id,
      action: "users.updated",
      entityType: "user",
      entityId: userId,
      metadata: { role, status },
      ipAddress: request.ip
    });
    const updated = database.prepare(
      `SELECT u.id, u.display_name AS displayName, u.email, u.role_slug AS role,
              r.name AS roleName, u.status, u.created_at AS createdAt,
              u.last_login_at AS lastLoginAt
       FROM users u JOIN roles r ON r.slug = u.role_slug WHERE u.id = ?`
    ).get(userId);
    return response.json({ user: serializeUser(updated) });
  });

  return router;
}
