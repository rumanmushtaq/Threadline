import { can, type Permission, type Role } from "./auth/permissions";

const NAV: { key: string; href: string; label: string; permission: Permission | null; group: "main" | "sales" | "admin" }[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", permission: "dashboard.view", group: "main" },
  { key: "products", href: "/products", label: "Products", permission: "product.view", group: "main" },
  { key: "create", href: "/products/new", label: "Create Product", permission: "product.create", group: "main" },
  { key: "inventory", href: "/inventory", label: "Inventory", permission: "inventory.view", group: "main" },
  { key: "ai", href: "/ai-images", label: "AI Product Images", permission: "ai.view", group: "main" },
  { key: "links", href: "/links", label: "Public Product Links", permission: "link.view", group: "main" },
  { key: "sales", href: "/sales", label: "Sales", permission: "sale.view", group: "sales" },
  { key: "expenses", href: "/expenses", label: "Expenses", permission: "expense.view", group: "sales" },
  { key: "orders", href: "/orders", label: "Orders", permission: "order.view", group: "sales" },
  { key: "customers", href: "/customers", label: "Customers", permission: "customer.view", group: "sales" },
  { key: "activity", href: "/activity", label: "Activity Logs", permission: "activity.view", group: "admin" },
  { key: "users", href: "/users", label: "Users", permission: "user.manage", group: "admin" },
  { key: "settings", href: "/settings", label: "Settings", permission: null, group: "admin" },
];

export type NavItem = Omit<(typeof NAV)[number], "permission">;

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => !n.permission || can(role, n.permission)).map((n) => ({ key: n.key, href: n.href, label: n.label, group: n.group }));
}
