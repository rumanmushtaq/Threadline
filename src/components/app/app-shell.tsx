"use client";

import {
  Banknote,
  Fuel,
  Activity,
  Boxes,
  LayoutDashboard,
  Link2,
  LogOut,
  Moon,
  PlusCircle,
  Settings,
  Shirt,
  ShoppingBag,
  Sparkles,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { logoutAction } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Permission } from "@/server/auth/permissions";
import type { NavItem } from "@/server/nav";
import { NotificationBell } from "./notification-bell";
import { PermissionsProvider } from "./permissions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  products: Shirt,
  create: PlusCircle,
  inventory: Boxes,
  ai: Sparkles,
  links: Link2,
  sales: Banknote,
  expenses: Fuel,
  orders: ShoppingBag,
  customers: Users,
  activity: Activity,
  users: UserCog,
  settings: Settings,
};

const GROUP_LABEL = { main: "Catalog", sales: "Sales", admin: "Workspace" } as const;

type ShellUser = { name: string; email: string; role: "admin" | "staff" };

export function AppShell({
  user,
  nav,
  permissions,
  children,
}: {
  user: ShellUser;
  nav: NavItem[];
  permissions: Permission[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/products" ? pathname === "/products" || /^\/products\/(?!new)/.test(pathname) : pathname.startsWith(href);

  return (
    <PermissionsProvider permissions={permissions}>
      <SidebarProvider>
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader>
            <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
              <span className="shrink-0">
                <LogoMark size={32} />
              </span>
              <span className="truncate font-display text-lg group-data-[collapsible=icon]:hidden">Threadline</span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            {(["main", "sales", "admin"] as const).map((group) => {
              const items = nav.filter((n) => n.group === group);
              if (!items.length) return null;
              return (
                <SidebarGroup key={group}>
                  <SidebarGroupLabel>{GROUP_LABEL[group]}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {items.map((item) => {
                        const Icon = ICONS[item.key] ?? Shirt;
                        return (
                          <SidebarMenuItem key={item.key}>
                            <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                              <Link href={item.href}>
                                <Icon />
                                <span>{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
          </SidebarContent>
          <SidebarFooter>
            <UserMenu user={user} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur md:rounded-t-xl">
            <SidebarTrigger className="-ml-1" />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <NotificationBell />
            </div>
          </header>
          <div className="flex-1 px-4 py-6 md:px-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionsProvider>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground capitalize">{user.role}</span>
          </div>
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
