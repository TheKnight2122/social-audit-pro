import { Router } from "express";
import { logActivity } from "../database.js";
import { requireAuth, requireCsrf, requirePermission } from "../middleware.js";
import { createOrganization } from "../organizations.js";

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role,
    status: row.status
  };
}

export function createOrganizationsRouter({ database }) {
  const router = Router();

  router.get("/", requireAuth, (request, response) => {
    const organizations = database.prepare(
      `SELECT o.id, o.name, o.slug, m.role_slug AS role, m.status
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
       ORDER BY o.name`
    ).all(request.user.id).map(serialize);
    response.json({ organizations, activeOrganizationId: request.user.organizationId });
  });

  router.post("/", requirePermission("users:manage"), requireCsrf, (request, response) => {
    const name = String(request.body.name || "").trim();
    if (name.length < 2 || name.length > 100) {
      return response.status(400).json({
        error: "validation_error",
        message: "El nombre de la organizacion debe tener entre 2 y 100 caracteres."
      });
    }
    const organization = database.transaction(() => createOrganization(database, {
      name,
      userId: request.user.id,
      role: "admin"
    }))();
    logActivity(database, {
      userId: request.user.id,
      organizationId: organization.id,
      action: "organizations.created",
      entityType: "organization",
      entityId: organization.id,
      metadata: { slug: organization.slug },
      ipAddress: request.ip
    });
    return response.status(201).json({ organization });
  });

  router.post("/:id/select", requireAuth, requireCsrf, (request, response) => {
    const organizationId = Number(request.params.id);
    const membership = database.prepare(
      `SELECT o.id, o.name, o.slug, m.role_slug AS role, m.status
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.organization_id = ?
         AND m.status = 'active' AND o.status = 'active'`
    ).get(request.user.id, organizationId);
    if (!membership) {
      return response.status(404).json({
        error: "organization_not_found",
        message: "La organizacion no esta disponible para este usuario."
      });
    }
    database.transaction(() => {
      database.prepare(
        "UPDATE sessions SET organization_id = ? WHERE token_hash = ?"
      ).run(organizationId, request.session.tokenHash);
      database.prepare(
        "UPDATE users SET default_organization_id = ? WHERE id = ?"
      ).run(organizationId, request.user.id);
    })();
    logActivity(database, {
      userId: request.user.id,
      organizationId,
      action: "organizations.selected",
      entityType: "organization",
      entityId: organizationId,
      ipAddress: request.ip
    });
    return response.json({ organization: serialize(membership) });
  });

  return router;
}
