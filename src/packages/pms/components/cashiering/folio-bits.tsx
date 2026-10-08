import { Badge } from "@/shared/components/ui/badge";
import type { FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";

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
