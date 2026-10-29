import {
  DETAIL_DASH,
  type DetailDepositView,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { FolioDetail, FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import { tenderDisplayState } from "@/packages/pms/lib/cashiering-tender-state";

export const FOLIO_MISSING_COPY =
  "No guest folio is open for this reservation. Posting stays in Cashiering.";

export const FOLIO_LINE_QTY_GAP = DETAIL_DASH;
export const FOLIO_LINE_BALANCE_GAP = DETAIL_DASH;

export type FolioActorState = "staff" | "system" | "unavailable";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  credit_card: "Credit Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};

export type FolioKpiCard = {
  id: "room";
  name: string;
  status: "Open" | "Closed" | "Inactive";
  amountLabel: "Balance";
  amount: number | null;
  realFolio: boolean;
};

export type FolioLedgerSummary = {
  roomCharges: number;
  packageCharges: number;
  otherCharges: number;
  discounts: number;
  tax: number;
  serviceCharge: number;
  refunds: number;
  totalCharges: number;
  payments: number;
  adjustments: number;
  balance: number;
  depositCredits: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function folioActiveLabel(
  status: string | null | undefined,
): "Open" | "Closed" | "Inactive" {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  return "Inactive";
}

export function folioActorState(
  membershipId: string | null | undefined,
  name: string | null | undefined,
): FolioActorState {
  if (!membershipId) return "system";
  return name ? "staff" : "unavailable";
}

export function folioActorLabel(row: {
  postedBy?: string | null;
  actorState?: FolioActorState | null;
}): string {
  if (row.actorState === "system") return "System";
  if (row.actorState === "unavailable") return "Unavailable";
  if (row.postedBy) return row.postedBy;
  return row.actorState === "staff" ? "Unavailable" : "System";
}

export function paymentMethodLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return PAYMENT_METHOD_LABEL[raw] ?? raw.replace(/_/g, " ");
}

export function isPackageCharge(row: FolioTransactionRow): boolean {
  const category = row.category.toLowerCase();
  return category.includes("package");
}

export function isRoomCharge(row: FolioTransactionRow): boolean {
  return row.category.toLowerCase() === "room";
}

export function sumAbsByType(
  rows: FolioTransactionRow[],
  type: FolioTransactionRow["type"],
): number {
  return roundMoney(
    rows
      .filter((row) => row.type === type)
      .reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0),
  );
}

export function folioLedgerSummary(folio: FolioDetail | null): FolioLedgerSummary | null {
  if (!folio) return null;
  const allCharges = folio.transactions.filter((row) => row.type === "charge");
  const charges = allCharges.filter(
    (row) => row.category !== "tax" && row.category !== "service_charge",
  );
  const tax = roundMoney(
    allCharges
      .filter((row) => row.category === "tax")
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const serviceCharge = roundMoney(
    allCharges
      .filter((row) => row.category === "service_charge")
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const roomCharges = roundMoney(
    charges.filter(isRoomCharge).reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const packageCharges = roundMoney(
    charges.filter(isPackageCharge).reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const otherCharges = roundMoney(
    charges
      .filter((row) => !isRoomCharge(row) && !isPackageCharge(row))
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
  const discounts = sumAbsByType(folio.transactions, "discount");
  const refunds = roundMoney(
    folio.transactions
      .filter((row) => row.type === "refund")
      .reduce((sum, row) => sum + Number(row.amount), 0),
  );
  return {
    roomCharges,
    packageCharges,
    otherCharges,
    discounts,
    tax,
    serviceCharge,
    refunds,
    totalCharges: roundMoney(
      roomCharges + packageCharges + otherCharges + tax + serviceCharge - discounts,
    ),
    payments: sumAbsByType(folio.transactions, "payment"),
    adjustments: roundMoney(
      folio.transactions
        .filter((row) => row.type === "adjustment")
        .reduce((sum, row) => sum + Number(row.amount), 0),
    ),
    balance: folio.balance,
    depositCredits: sumAbsByType(folio.transactions, "deposit"),
  };
}

export function netPaidFromLedger(summary: FolioLedgerSummary | null): number | null {
  if (!summary) return null;
  return roundMoney(summary.payments - summary.refunds);
}

export function folioKpiCards(
  folio: FolioDetail | null,
  reservationTotal: number | null = null,
): FolioKpiCard[] {
  return [
    {
      id: "stay",
      name: "Total Amount",
      status: folio ? folioActiveLabel(folio.status) : "Quoted",
      amountLabel: "Expected stay",
      amount: reservationTotal,
      realFolio: Boolean(folio),
    },
    {
      id: "room",
      name: "Guest Folio",
      status: folio ? folioActiveLabel(folio.status) : "Inactive",
      amountLabel: "Balance",
      amount: folio ? folio.balance : null,
      realFolio: Boolean(folio),
    },
  ];
}

export function paymentRows(folio: FolioDetail | null): FolioTransactionRow[] {
  if (!folio) return [];
  return folio.transactions.filter((row) => row.type === "payment" || row.type === "deposit");
}

export function ledgerReference(row: FolioTransactionRow): string {
  return paymentMethodLabel(row.paymentMethod) || String(row.referenceType ?? "").trim();
}

export function depositPaidFromLedger(summary: FolioLedgerSummary | null): number | null {
  if (!summary) return null;
  return summary.depositCredits;
}

export function paymentTenderStatus(row: FolioTransactionRow, rows: FolioTransactionRow[]): string {
  return (
    tenderDisplayState(
      row,
      rows.map((line) => ({
        type: line.type,
        amount: line.amount,
        originalTransactionId: line.originalTransactionId,
      })),
    ) ?? "Posted"
  );
}

export function guestDepositCreditFromLedger(summary: FolioLedgerSummary | null): number | null {
  if (!summary) return null;
  return summary.depositCredits;
}

export function depositRemainder(input: { credit: number | null; applied: number | null }): {
  applied: number | null;
  refundable: number | null;
} {
  if (input.credit == null && input.applied == null) return { applied: null, refundable: null };
  const credit = input.credit ?? 0;
  const applied = Math.max(0, input.applied ?? 0);
  const refundable = Math.max(0, Math.round((credit - applied) * 100) / 100);
  return { applied, refundable };
}

export function folioLineQuantity(quantity: number | null | undefined): string {
  if (quantity == null || !Number.isFinite(quantity)) return DETAIL_DASH;
  return String(quantity);
}

export function folioRunningBalances(
  rows: Array<{ id: string; amount: number }>,
): Map<string, number> {
  let balance = 0;
  const totals = new Map<string, number>();
  for (const row of rows) {
    balance = Math.round((balance + row.amount) * 100) / 100;
    totals.set(row.id, balance);
  }
  return totals;
}

export function folioDepositStatus(deposit: DetailDepositView | null, paid: number | null): string {
  const received = paid ?? 0;
  const requiredAmount = deposit?.amount != null && deposit.amount > 0 ? deposit.amount : null;
  if (requiredAmount != null && received + Number.EPSILON >= requiredAmount) return "Received";
  if (requiredAmount != null && received > 0) return "Partial";
  if (!deposit) return received > 0 ? "Received" : DETAIL_DASH;
  if (deposit.required === false) return "Not required";
  if (deposit.required === true) return "Pending";
  return received > 0 ? "Received" : DETAIL_DASH;
}

export function snapshotDueDate(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  for (const key of ["due_date", "dueDate", "deposit_due_date"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
