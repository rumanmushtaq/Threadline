"use client";

import { PackagePlus } from "lucide-react";
import { StockMovementDialog } from "@/components/products/stock-movement-dialog";
import { Button } from "@/components/ui/button";
import type { Size } from "@/lib/sizes";

export function RowStockButton(props: { productId: string; productName: string; sizes: { size: Size; onHand: number; reserved: number }[] }) {
  return (
    <StockMovementDialog
      {...props}
      trigger={
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Update stock for ${props.productName}`}>
          <PackagePlus />
        </Button>
      }
    />
  );
}
