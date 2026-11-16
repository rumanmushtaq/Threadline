// The only place permissions are defined. The client receives the computed list.
export const PERMISSIONS = [
  "dashboard.view",
  "product.view",
  "product.create",
  "product.edit",
  "product.archive",
  "product.publish",
  "inventory.view",
  "inventory.stock_in",
  "inventory.adjust",
  "inventory.stock_out",
  "ai.view",
  "ai.regenerate",
  "link.view",
  "order.view",
  "order.manage",
  "customer.view",
  "activity.view",
  "user.manage",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = "admin" | "staff";

const STAFF: readonly Permission[] = [
  "dashboard.view",
  "product.view",
  "product.create",
  "inventory.view",
  "inventory.stock_in",
  "ai.view",
  "link.view",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS),
  staff: new Set(STAFF),
};

export function can(role: Role, permission: Permission) {
  return MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}
