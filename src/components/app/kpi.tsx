import Link from "next/link";

export function Kpi({
  icon: Icon,
  label,
  value,
  note,
  href,
  accent,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note?: string;
  href?: string;
  accent?: boolean;
  tone?: "warn" | "bad";
}) {
  const body = (
    <div className={`h-full rounded-xl border p-4 transition ${accent ? "bg-primary text-primary-foreground" : "bg-card"} ${href ? "hover:border-foreground/25" : ""}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-medium ${accent ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</p>
        <Icon className={`size-4 ${tone === "warn" ? "text-warning" : tone === "bad" ? "text-destructive" : accent ? "text-brand" : "text-muted-foreground"}`} />
      </div>
      <p className="mt-2 truncate text-xl font-semibold tracking-tight tabular sm:text-2xl">{value}</p>
      {note && <p className={`mt-1 truncate text-xs ${accent ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
