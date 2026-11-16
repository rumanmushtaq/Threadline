import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type JobStatus = "pending" | "processing" | "completed" | "failed" | null | undefined;

export function AiStatusBadge({ status }: { status: JobStatus }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map = {
    pending: { label: "Queued", icon: Clock, cls: "bg-muted text-muted-foreground" },
    processing: { label: "Generating", icon: Loader2, cls: "bg-brand/10 text-brand" },
    completed: { label: "Ready", icon: CheckCircle2, cls: "bg-success/12 text-success" },
    failed: { label: "Failed", icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  }[status];
  const Icon = map.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 border-transparent", map.cls)}>
      <Icon className={cn("size-3", status === "processing" && "animate-spin")} /> {map.label}
    </Badge>
  );
}

export function StockBadge({ available, threshold }: { available: number; threshold: number }) {
  if (available <= 0)
    return (
      <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
        Out of stock
      </Badge>
    );
  if (available <= threshold)
    return (
      <Badge variant="outline" className="gap-1 border-transparent bg-warning/15 text-warning-foreground dark:text-warning">
        <AlertTriangle className="size-3" /> Low · {available}
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-transparent bg-success/12 text-success">
      In stock · {available}
    </Badge>
  );
}
