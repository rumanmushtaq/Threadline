import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePageUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { listLinks } from "@/server/public-products";
import { fileUrl } from "@/server/storage";
import { LinkRowActions } from "./link-actions";
import { appUrl } from "@/server/app-url";

export const metadata: Metadata = { title: "Public product links" };

export default async function LinksPage() {
  await requirePageUser("link.view");
  const links = await listLinks(db);
  const siteUrl = appUrl();
  return (
    <>
      <PageHeader
        title="Public product links"
        description="Every product gets a permanent link based on its SKU. Share it on WhatsApp, Instagram or Facebook — customers can order without an account."
      />
      {links.length === 0 ? (
        <EmptyState icon={Link2} title="No links yet" description="Links are created automatically with each product." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Product</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((l) => {
                const live = l.isActive && l.isPublished && l.status === "active";
                const url = `${siteUrl}/p/${l.slug}`;
                const thumb = fileUrl(l.thumbKey);
                return (
                  <TableRow key={l.slug}>
                    <TableCell className="pl-4">
                      <Link href={`/products/${l.productId}`} className="flex items-center gap-3">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- storage URL
                          <img src={thumb} alt="" className="h-11 w-9 rounded border object-cover" />
                        ) : (
                          <div className="h-11 w-9 rounded bg-muted" />
                        )}
                        <span className="font-medium hover:underline">{l.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{url}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${live ? "bg-success/12 text-success" : "bg-muted text-muted-foreground"}`}>
                        {live ? "Live" : l.status === "archived" ? "Archived" : "Hidden"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatNumber(l.viewCount)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                    <TableCell className="pr-4">
                      <LinkRowActions productId={l.productId} url={url} live={live} published={l.isPublished} archived={l.status === "archived"} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
