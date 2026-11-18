import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { PublicHeader } from "../public-header";

/** Centred card under the shop header, for the shopper sign-in pages. */
export async function AccountShell({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  const s = await getSettings(db);
  return (
    <>
      <PublicHeader brand={s.brandName} tagline={s.brandTagline} customer={null} />
      <main className="flex justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2">
            <h1 className="font-display text-3xl">{title}</h1>
            <div className="text-sm text-muted-foreground">{description}</div>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
