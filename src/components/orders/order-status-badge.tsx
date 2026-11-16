import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OrderStatus = "pending" | "confirmed" | "processing" | "dispatched" | "delivered" | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  dispatched: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const TONE: Record<OrderStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground dark:text-warning",
  confirmed: "bg-chart-2/15 text-chart-2",
  processing: "bg-brand/12 text-brand",
  dispatched: "bg-chart-5/12 text-chart-5",
  delivered: "bg-success/12 text-success",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[status])}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}
