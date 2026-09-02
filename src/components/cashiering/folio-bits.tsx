import { Badge } from "@/components/ui/badge";
import type { FolioTransactionRow } from "@/lib/cashiering.functions";

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

export function labelTransactionType(type: string): string {
  return TYPE_LABEL[type] ?? type;
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
