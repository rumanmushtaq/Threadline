import { UserRound } from "lucide-react";
import Link from "next/link";

/** Header for customer pages: the brand leads back to the product list; sign in or your account on the right. */
export function PublicHeader({
  brand,
  tagline,
  customer,
}: {
  brand: string;
  tagline?: string | null;
  customer?: { name: string } | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/shop" className="font-display text-xl tracking-tight">
          {brand}
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {tagline && <span className="hidden text-xs text-muted-foreground lg:block">{tagline}</span>}
          <Link href="/shop" className="font-medium underline-offset-4 hover:underline">
            All products
          </Link>
          {customer ? (
            <Link href="/account" className="flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
              <UserRound className="size-4" />
              <span className="max-w-28 truncate">{customer.name.split(" ")[0]}</span>
            </Link>
          ) : (
            <Link href="/account/login" className="rounded-full border px-3.5 py-1.5 font-medium transition hover:border-foreground/50">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
