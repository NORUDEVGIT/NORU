import { Badge } from "@/shared/components/ui/badge";
import { InventoryStatusBadge } from "@/packages/pms/components/rooms/room-inventory-shared";
import type { FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import { reservationStatusLabel } from "@/packages/pms/lib/folio-search-filters";

export function stayStatusTone(
  status: string | null | undefined,
): "neutral" | "success" | "warning" | "danger" | "info" {
  if (!status) return "neutral";
  if (status === "checked_in") return "success";
  if (status === "confirmed" || status === "pending") return "info";
  if (status === "checked_out") return "neutral";
  if (status === "cancelled") return "danger";
  if (status === "no_show") return "warning";
  return "neutral";
}

export function FolioSearchFolioStatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <InventoryStatusBadge tone={status === "open" ? "info" : "neutral"}>
      {status === "open" ? "Open" : "Closed"}
    </InventoryStatusBadge>
  );
}

export function FolioSearchStayStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <InventoryStatusBadge tone={stayStatusTone(status)}>
      {reservationStatusLabel(status)}
    </InventoryStatusBadge>
  );
}

export function FolioStatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <Badge variant={status === "open" ? "default" : "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}

const TYPE_LABEL: Record<string, string> = {
  charge: "Charge",
  payment: "Payment",
  deposit: "Deposit",
  refund: "Refund",
  adjustment: "Adjustment",
  discount: "Discount",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

const CATEGORY_LABEL: Record<string, string> = {
  room: "Room",
  manual: "Manual",
  tax: "Tax",
  service_charge: "Service charge",
  payment: "Payment",
  deposit: "Deposit",
  refund: "Refund",
  adjustment: "Adjustment",
  discount: "Discount",
  transfer: "Transfer",
};

export function labelTransactionType(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

export function labelTransactionCategory(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}

export function isTaxRelatedCategory(category: string): boolean {
  return category === "tax" || category === "service_charge";
}

/** Charges and refunds increase the balance; payments, deposits and discounts reduce it. */
export function splitLedger(transactions: FolioTransactionRow[]): {
  charges: FolioTransactionRow[];
  credits: FolioTransactionRow[];
} {
  return {
    charges: transactions.filter((t) => t.amount >= 0),
    credits: transactions.filter((t) => t.amount < 0),
  };
}
