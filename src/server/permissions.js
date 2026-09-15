export const ROLE_PERMISSIONS = {
  admin: [
    "analytics:read",
    "reports:read",
    "reports:write",
    "integrations:read",
    "integrations:write",
    "sync:run",
    "users:manage",
    "activity:read"
  ],
  analyst: [
    "analytics:read",
    "reports:read",
    "reports:write",
    "integrations:read",
    "integrations:write",
    "sync:run"
  ],
  client: [
    "analytics:read",
    "reports:read",
    "integrations:read"
  ]
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(user, permission) {
  return Boolean(user && permissionsFor(user.role).includes(permission));
}
