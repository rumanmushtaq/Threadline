import { AppShell } from "@/components/app/app-shell";
import { RegisterServiceWorker } from "@/components/app/register-sw";
import { teamAppMetadata, teamAppViewport } from "@/lib/team-app";
import { requirePageUser } from "@/server/auth/current";
import { permissionsFor } from "@/server/auth/permissions";
import { navFor } from "@/server/nav";

export const metadata = teamAppMetadata;
export const viewport = teamAppViewport;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <AppShell
      user={{ name: user.name, email: user.email, role: user.role }}
      nav={navFor(user.role)}
      permissions={permissionsFor(user.role)}
    >
      <RegisterServiceWorker />
      {children}
    </AppShell>
  );
}
