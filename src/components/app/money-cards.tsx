import { ArrowDownToLine, Globe, HandCoins, Landmark, Receipt, Scale, Store, TrendingUp } from "lucide-react";
import { formatMoney, formatNumber } from "@/lib/format";
import type { MoneyInRange } from "@/server/dashboard";
import { Kpi } from "./kpi";

const count = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;

/** The eight money cards for a date range, shared by the dashboard, sales and expenses pages. */
export function MoneyCards({
  m,
  currency: cur,
  salesHref,
  expensesHref,
}: {
  m: MoneyInRange;
  currency: string;
  salesHref?: (channel: "shop" | "website") => string;
  expensesHref?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi icon={ArrowDownToLine} label="Total purchases" value={formatMoney(m.purchases, cur)} note={`${count(m.piecesBought, "piece")} bought`} />
      <Kpi icon={HandCoins} label="Total sales" value={formatMoney(m.sales, cur)} note={`${count(m.piecesSold, "piece")} sold · shop + website`} />
      <Kpi
        icon={TrendingUp}
        label="Profit on sales"
        value={formatMoney(m.profit, cur)}
        note={`sales minus their cost (${formatMoney(m.costOfSold, cur)})`}
        tone={m.profit < 0 ? "bad" : undefined}
      />
      <Kpi
        icon={Landmark}
        label="Net profit"
        value={formatMoney(m.netProfit, cur)}
        note="profit on sales minus expenses"
        tone={m.netProfit < 0 ? "bad" : undefined}
        accent
      />
      <Kpi
        icon={Store}
        label="Shop sales (in person)"
        value={formatMoney(m.shop.sales, cur)}
        note={`${count(m.shop.count, "sale")} · profit ${formatMoney(m.shop.profit, cur)}`}
        href={salesHref?.("shop")}
      />
      <Kpi
        icon={Globe}
        label="Website sales"
        value={formatMoney(m.website.sales, cur)}
        note={`${count(m.website.count, "delivered order")} · profit ${formatMoney(m.website.profit, cur)}`}
        href={salesHref?.("website")}
      />
      <Kpi icon={Receipt} label="Expenses" value={formatMoney(m.expenses, cur)} note={`${count(m.expenseCount, "expense")} · fuel, rent and more`} href={expensesHref} />
      <Kpi icon={Scale} label="Sales minus purchases" value={formatMoney(m.net, cur)} note="money in minus stock bought" tone={m.net < 0 ? "bad" : undefined} />
    </div>
  );
}
