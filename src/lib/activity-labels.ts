// Human-readable text for activity log actions.
const LABELS: Record<string, string> = {
  "user.login": "signed in",
  "user.logout": "signed out",
  "user.created": "created an account",
  "user.updated": "updated an account",
  "user.activated": "activated an account",
  "user.deactivated": "deactivated an account",
  "user.password_reset": "reset a password",
  "user.password_changed": "changed their password",
  "user.password_recovered": "set a new password from an email link",
  "product.created": "created a product",
  "product.updated": "updated a product",
  "product.archived": "archived a product",
  "product.restored": "restored a product",
  "product.published": "published a product",
  "product.unpublished": "unpublished a product",
  "stock.added": "added stock",
  "stock.adjusted": "adjusted stock",
  "stock.removed": "recorded stock out",
  "ai.regenerate_requested": "requested new AI images",

  "ai.failed": "failed to generate AI images",
  "photo.added": "added a product photo",
  "photo.approved": "approved a product photo",
  "photo.hidden": "hid a product photo",
  "photo.deleted": "deleted a product photo",
  "sale.recorded": "recorded a shop sale",
  "sale.cancelled": "cancelled a shop sale",
  "order.received": "placed an order",
  "order.confirmed": "confirmed an order",
  "order.processing": "moved an order to processing",
  "order.dispatched": "dispatched an order",
  "order.delivered": "marked an order delivered",
  "order.cancelled": "cancelled an order",
  "ai.generated": "generated AI images",
  "settings.updated": "updated settings",
  "storage.swept": "removed unused image files",
  "category.created": "added a category",
  "category.updated": "updated a category",
};

export function activityLabel(action: string) {
  return LABELS[action] ?? action.replace(/[._]/g, " ");
}

export function activitySubject(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  const m = metadata as Record<string, string | undefined>;
  return m.orderNumber ?? m.saleNumber ?? m.sku ?? m.email ?? null;
}
