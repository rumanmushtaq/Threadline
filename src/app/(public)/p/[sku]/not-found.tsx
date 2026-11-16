import { Shirt } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
          <Shirt className="size-6 text-muted-foreground" />
        </div>
        <h1 className="font-display text-3xl">This item isn&apos;t available</h1>
        <p className="text-sm text-muted-foreground">The link may be old, or the product is no longer on sale.</p>
      </div>
    </main>
  );
}
