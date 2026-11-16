"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/server/auth/permissions";

const PermissionsContext = createContext<ReadonlySet<Permission>>(new Set());

export function PermissionsProvider({ permissions, children }: { permissions: Permission[]; children: React.ReactNode }) {
  return <PermissionsContext value={new Set(permissions)}>{children}</PermissionsContext>;
}

/** UI hint only. The server checks every permission again. */
export function useCan() {
  const set = useContext(PermissionsContext);
  return (p: Permission) => set.has(p);
}
