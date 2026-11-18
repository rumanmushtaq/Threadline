import Link from "next/link";

/** Small centred layout for the password pages. */
export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Link href="/login" className="flex items-center gap-2 text-sm font-medium tracking-wide">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-foreground font-display text-lg">T</span>
          Threadline
        </Link>
        <div className="space-y-2">
          <h1 className="font-display text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
