import { Activity } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activityLabel, activitySubject } from "@/lib/activity-labels";
import { formatDateTime } from "@/lib/format";
import { activityFiltersSchema, listActivity } from "@/server/activity-queries";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listUsers } from "@/server/users";
import { Pager } from "../products/products-table";
import { ActivityFilters } from "./activity-filters";

export const metadata: Metadata = { title: "Activity logs" };

function entityHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "product") return `/products/${id}`;
  if (type === "order") return `/orders/${id}`;
  if (type === "user") return "/users";
  return null;
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("activity.view");
  const filters = activityFiltersSchema.parse(await searchParams);
  const [result, users] = await Promise.all([listActivity(db, filters), listUsers(db)]);
  return (
    <>
      <PageHeader title="Activity logs" description="Every important action, newest first. Logs cannot be edited or deleted." />
      <ActivityFilters users={users.map((u) => ({ id: u.id, name: u.name }))} />
      {result.rows.length === 0 ? (
        <EmptyState icon={Activity} title="No activity matches" />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="pr-4">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => {
                  const href = entityHref(r.entityType, r.entityId);
                  const subject = activitySubject(r.metadata) ?? r.entityType;
                  const details = Object.entries(r.metadata ?? {})
                    .filter(([k]) => !["sku", "orderNumber", "email"].includes(k))
                    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                    .join(" · ");
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="font-medium">{r.userName ?? "Customer / system"}</TableCell>
                      <TableCell>{activityLabel(r.action)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {subject}
                          </Link>
                        ) : (
                          subject
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate pr-4 text-xs text-muted-foreground" title={details}>
                        {details || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pager page={result.page} pageCount={result.pageCount} total={result.total} />
        </div>
      )}
    </>
  );
}
