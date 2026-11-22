import { ArrowDownToLine, Globe, HandCoins, Package, Receipt, Scale, Store, TrendingUp } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/format";
import type { MoneyInRange } from "@/server/dashboard";
import { Kpi } from "./kpi";

const count = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

/** The eight money cards for a date range, shared by the dashboard and the sales page. */
export function MoneyCards({ m, currency: cur, salesHref }: { m: MoneyInRange; currency: string; salesHref?: (channel: "shop" | "website") => string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi icon={ArrowDownToLine} label="Total purchases" value={formatMoney(m.purchases, cur)} note={`${count(m.piecesBought, "piece")} bought`} />
      <Kpi icon={HandCoins} label="Total sales" value={formatMoney(m.sales, cur)} note="shop + website" />
      <Kpi
        icon={TrendingUp}
        label="Total profit"
        value={formatMoney(m.profit, cur)}
        note="sales minus the cost of the sold pieces"
        tone={m.profit < 0 ? "bad" : undefined}
        accent
      />
      <Kpi icon={Scale} label="Sales minus purchases" value={formatMoney(m.net, cur)} note="money in minus money spent" tone={m.net < 0 ? "bad" : undefined} />
      <Kpi
        icon={Store}
        label="Shop sales (in person)"
        value={formatMoney(m.shop.sales, cur)}
        note={`${count(m.shop.count, "sale")} · ${count(m.shop.pieces, "piece")} · profit ${formatMoney(m.shop.profit, cur)}`}
        href={salesHref?.("shop")}
      />
      <Kpi
        icon={Globe}
        label="Website sales"
        value={formatMoney(m.website.sales, cur)}
        note={`${count(m.website.count, "delivered order")} · profit ${formatMoney(m.website.profit, cur)}`}
        href={salesHref?.("website")}
      />
      <Kpi icon={Receipt} label="Cost of sold pieces" value={formatMoney(m.costOfSold, cur)} note="what the sold pieces cost you" />
      <Kpi icon={Package} label="Pieces sold" value={formatNumber(m.piecesSold)} note={`${count(m.orders, "website order")} placed in these dates`} />
    </div>
  );
}
