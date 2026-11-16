import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { listCategories } from "@/server/products";
import { getSettings } from "@/server/settings";
import { AccountSettings, CategoriesSettings, SystemSettings } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const admin = can(user.role, "settings.manage");
  const [settings, categories] = admin ? await Promise.all([getSettings(db), listCategories(db, false)]) : [null, []];
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" description={admin ? "Your account and workspace settings." : "Your account settings."} />
      <AccountSettings name={user.name} email={user.email} />
      {admin && settings && (
        <>
          <SystemSettings
            defaults={{
              brandName: settings.brandName,
              brandTagline: settings.brandTagline,
              currencySymbol: settings.currencySymbol,
              lowStockThreshold: settings.lowStockThreshold,
              reservationPolicy: settings.reservationPolicy,
              pendingOrderExpiryHours: settings.pendingOrderExpiryHours,
              autoPublishProducts: settings.autoPublishProducts,
              maxOrderQuantity: settings.maxOrderQuantity,
            }}
          />
          <CategoriesSettings categories={categories} />
        </>
      )}
    </div>
  );
}
