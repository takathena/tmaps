export const PERMISSION_RESOURCES = [
  "catalog",
  "devices",
  "cables",
  "monitoring",
  "notifications",
  "users",
  "roles",
] as const;

export const PERMISSION_ACTIONS = ["read", "write", "delete"] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/**
 * Struktur permission final (Keputusan #4): resource -> action -> boolean.
 * Action yang tidak ada / bukan `true` dianggap tidak diizinkan.
 */
export type RolePermissions = Partial<
  Record<PermissionResource, Partial<Record<PermissionAction, boolean>>>
>;

export function hasPermission(
  permissions: RolePermissions | null | undefined,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return permissions?.[resource]?.[action] === true;
}

export function buildPermissions(
  matrix: Partial<Record<PermissionResource, PermissionAction[]>>,
): RolePermissions {
  const permissions: RolePermissions = {};

  for (const resource of PERMISSION_RESOURCES) {
    const actions = matrix[resource];
    if (!actions) continue;

    permissions[resource] = {};
    for (const action of actions) {
      permissions[resource]![action] = true;
    }
  }

  return permissions;
}

export const ADMIN_PERMISSIONS: RolePermissions = buildPermissions({
  catalog: ["read", "write", "delete"],
  devices: ["read", "write", "delete"],
  cables: ["read", "write", "delete"],
  monitoring: ["read", "write", "delete"],
  notifications: ["read", "write", "delete"],
  users: ["read", "write", "delete"],
  roles: ["read", "write", "delete"],
});

export const TEKNISI_PERMISSIONS: RolePermissions = buildPermissions({
  catalog: ["read"],
  devices: ["read", "write", "delete"],
  cables: ["read", "write", "delete"],
  monitoring: ["read", "write"],
  notifications: ["read", "write"],
});

export const VIEWER_PERMISSIONS: RolePermissions = buildPermissions({
  catalog: ["read"],
  devices: ["read"],
  cables: ["read"],
  monitoring: ["read"],
  notifications: ["read"],
});
