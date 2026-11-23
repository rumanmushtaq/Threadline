import { Fuel, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Kpi } from "@/components/app/kpi";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rangeParamsSchema } from "@/lib/date-range";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { PAYMENT_LABEL } from "@/lib/validation/expense";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { moneyInRange } from "@/server/dashboard";
import { db } from "@/server/db";
import { businessToday, resolveRange } from "@/server/date-range";
import { expenseTotals, listExpenseCategories, listExpenses } from "@/server/expenses";
import { getSettings } from "@/server/settings";
import { RangePicker } from "../dashboard/range-picker";
import { AddExpense } from "./add-expense";
import { CancelExpense } from "./cancel-expense";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageUser("expense.view");
  const params = await searchParams;
  const range = resolveRange(rangeParamsSchema.parse(params));
  const categoryId = z.uuid().optional().catch(undefined).parse(params.category);
  const [settings, totals, rows, categories, money] = await Promise.all([
    getSettings(db),
    expenseTotals(db, range),
    listExpenses(db, range, categoryId),
    listExpenseCategories(db),
    moneyInRange(db, range),
  ]);
  const cur = settings.currencySymbol;
  const rangeQuery = { range: range.preset, ...(range.preset === "custom" ? { from: range.fromDay ?? "", to: range.toDay } : {}) };
  const href = (cat?: string) => `/expenses?${new URLSearchParams({ ...rangeQuery, ...(cat ? { category: cat } : {}) })}`;
  const top = totals.byCategory[0];
  const max = Math.max(1, ...totals.byCategory.map((c) => c.total));
  const shown = rows.filter((r) => !r.cancelled).reduce((s, r) => s + r.amountMinor, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Fuel, rent, packaging and every other running cost. Net profit on the dashboard takes these off your profit."
        actions={
          <>
            <RangePicker preset={range.preset} label={range.label} fromDay={range.fromDay} toDay={range.toDay} />
            {can(user.role, "expense.record") && <AddExpense categories={categories} currency={cur} today={businessToday()} />}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Receipt} label="Total expenses" value={formatMoney(totals.total, cur)} note={`${formatNumber(totals.count)} expense${totals.count === 1 ? "" : "s"} · ${range.label}`} accent />
        <Kpi icon={Fuel} label="Biggest cost" value={top ? top.category : "—"} note={top ? formatMoney(top.total, cur) : "nothing spent yet"} />
        <Kpi icon={Wallet} label="Profit on sales" value={formatMoney(money.profit, cur)} note="before expenses" tone={money.profit < 0 ? "bad" : undefined} />
        <Kpi icon={Wallet} label="Net profit" value={formatMoney(money.netProfit, cur)} note="after expenses" tone={money.netProfit < 0 ? "bad" : undefined} />
      </section>

      {totals.byCategory.length > 0 && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-medium">Where the money went · {range.label}</h2>
          <ul className="space-y-3">
            {totals.byCategory.map((c) => (
              <li key={c.categoryId}>
                <Link href={href(c.categoryId)} className="group block space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="group-hover:underline group-hover:underline-offset-4">{c.category}</span>
                    <span className="tabular">
                      {formatMoney(c.total, cur)} <span className="text-xs text-muted-foreground">· {Math.round((c.total / totals.total) * 100)}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(c.total / max) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="Expense category">
        <Link href={href()} scroll={false} className={chip(!categoryId)}>
          All
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={href(c.id)} scroll={false} className={chip(categoryId === c.id)}>
            {c.name}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title={`No expenses · ${range.label}`} description="Add fuel, rent, packaging and other costs with “Add expense”." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Expense</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Paid to</TableHead>
                <TableHead>Paid by</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={r.cancelled ? "text-muted-foreground line-through decoration-muted-foreground/60" : ""}>
                  <TableCell className="pl-4">
                    <span className="font-mono font-medium">{r.number}</span>
                    {r.cancelled && <span className="block text-xs no-underline">Cancelled</span>}
                    {r.note && <span className="block max-w-56 truncate text-xs text-muted-foreground">{r.note}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.spentAt)}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.paidTo ?? "—"}</TableCell>
                  <TableCell>{PAYMENT_LABEL[r.paymentMethod]}</TableCell>
                  <TableCell className="text-right font-medium tabular">{formatMoney(r.amountMinor, cur)}</TableCell>
                  <TableCell className="text-sm">{r.who ?? "—"}</TableCell>
                  <TableCell className="pr-4 text-right">{!r.cancelled && can(user.role, "expense.cancel") && <CancelExpense id={r.id} number={r.number} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-4 font-medium" colSpan={5}>
                  Total{categoryId ? " in this category" : ""}
                  {rows.some((r) => r.cancelled) && <span className="font-normal text-muted-foreground"> (cancelled not counted)</span>}
                </TableCell>
                <TableCell className="text-right font-semibold tabular">{formatMoney(shown, cur)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}

function chip(active: boolean) {
  return `inline-flex items-center rounded-full border px-3 py-1.5 text-sm ${active ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`;
}
