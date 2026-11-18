import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { AiStatusBadge } from "@/components/products/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, timeAgo } from "@/lib/format";
import { defaultProviderName, PROVIDER_LABEL, PROVIDER_NAMES, providerConfigured, type ProviderName } from "@/server/ai/provider";
import { listJobs, type JobStatus } from "@/server/ai/queries";
import { requirePageUser } from "@/server/auth/current";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { AutoRefresh, JobRetryButton, StatusTabs } from "./job-controls";

export const metadata: Metadata = { title: "AI product images" };

const STATUSES: JobStatus[] = ["pending", "processing", "completed", "failed"];

function duration(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  const s = Math.round((end.getTime() - start.getTime()) / 1000);
  return s < 90 ? `${s}s` : `${Math.round(s / 60)} min`;
}

export default async function AiImagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePageUser("ai.view");
  const raw = (await searchParams).status;
  const status = STATUSES.includes(raw as JobStatus) ? (raw as JobStatus) : undefined;
  const { counts, rows } = await listJobs(db, status);
  const active = (counts.pending ?? 0) + (counts.processing ?? 0);
  const provider = defaultProviderName();
  const configured = (PROVIDER_NAMES as readonly string[]).includes(provider) && providerConfigured(provider as ProviderName);

  return (
    <>
      <PageHeader
        title="AI product images"
        description="Generation jobs run in the background with automatic retries. Text on marketing cards is drawn by a fixed template, never by the AI."
      />
      {active > 0 && <AutoRefresh />}
      {!configured && (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          The AI provider <span className="font-medium">{provider}</span> has no API key yet, so jobs will fail with “AI provider not configured”. Products still save
          normally. Add the key to the server environment and use Retry.
        </p>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => (
          <div key={s} className="rounded-xl border bg-card p-4">
            <AiStatusBadge status={s} />
            <p className="mt-2 text-2xl font-semibold tabular">{counts[s] ?? 0}</p>
          </div>
        ))}
      </div>
      <StatusTabs />
      {rows.length === 0 ? (
        <EmptyState icon={Sparkles} title="No generation jobs here" description="Every new product queues a job automatically." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Queued</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="pl-4">
                    <Link href={`/products/${j.productId}`} className="flex items-center gap-3">
                      {j.originalUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- storage URL
                        <img src={j.originalUrl} alt="" className="h-12 w-10 rounded border object-cover" />
                      ) : (
                        <div className="h-12 w-10 rounded bg-muted" />
                      )}
                      <div>
                        <p className="font-medium hover:underline">{j.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{j.sku}</p>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <AiStatusBadge status={j.status} />
                    {j.provider && <p className="mt-1 text-xs text-muted-foreground">via {PROVIDER_LABEL[j.provider as ProviderName] ?? j.provider}</p>}
                    {j.status === "pending" && j.attempts > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">retry {timeAgo(j.runAfter).replace(" ago", "")}</p>
                    )}
                  </TableCell>
                  <TableCell className="tabular">
                    {j.attempts}/{j.maxAttempts}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">{duration(j.startedAt, j.finishedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(j.createdAt)}
                    {j.requestedBy && <span className="block text-xs">by {j.requestedBy}</span>}
                  </TableCell>
                  <TableCell className="max-w-72">
                    {j.thumbUrl ? (
                      <Link href={`/products/${j.productId}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- storage URL */}
                        <img src={j.thumbUrl} alt="Marketing card" className="h-16 w-13 rounded border object-cover" />
                      </Link>
                    ) : j.lastError ? (
                      <p className="line-clamp-2 text-xs text-destructive" title={j.lastError}>
                        {j.lastError}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {can(user.role, "ai.regenerate") && (j.status === "failed" || j.status === "completed") && (
                      <JobRetryButton productId={j.productId} label={j.status === "failed" ? "Retry" : "Regenerate"} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
