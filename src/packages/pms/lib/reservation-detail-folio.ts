import {
  DETAIL_DASH,
  type DetailDepositView,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { FolioDetail, FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";

export const FOLIO_NOTES_MAX = 500;

export const FOLIO_NOTES_GAP_COPY =
  "Folio notes are not stored on the reservation. Stay notes remain on Notes & Traces.";

export const FOLIO_INVOICE_GAP_COPY =
  "Issue invoice from Cashiering on the guest folio. Print statement there is not an issued invoice.";

export const FOLIO_BILLING_EDIT_GAP_COPY =
  "Billing and routing are not editable in this workspace. Company and travel agent stay on the reservation record.";

export const FOLIO_MISSING_COPY =
  "No guest folio is open for this reservation. Posting stays in Cashiering.";

export const FOLIO_ADD_FOLIO_GAP_COPY =
  "Extras, deposit, and city-ledger folios are not stored. This reservation uses the guest folio in Cashiering.";

export const FOLIO_LINE_QTY_GAP = DETAIL_DASH;
export const FOLIO_LINE_BALANCE_GAP = DETAIL_DASH;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  credit_card: "Credit Card",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  other: "Other",
};

export type FolioKpiCard = {
  id: "room" | "extras" | "deposit" | "city_ledger";
  name: string;
  status: "Active" | "Inactive";
  amount: number | null;
  realFolio: boolean;
};

export type FolioLedgerSummary = {
  roomCharges: number;
  packageCharges: number;
  otherCharges: number;
  discounts: number;
  taxes: number | null;
  totalCharges: number;
  payments: number;
  adjustments: number;
  totalPayments: number;
  balance: number;
  depositCredits: number;
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function folioActiveLabel(status: string | null | undefined): "Active" | "Inactive" {
  return status === "open" ? "Active" : "Inactive";
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
  const taxes = roundMoney(
    allCharges
      .filter((row) => row.category === "tax" || row.category === "service_charge")
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
  return {
    roomCharges,
    packageCharges,
    otherCharges,
    discounts: sumAbsByType(folio.transactions, "discount"),
    taxes,
    totalCharges: folio.charges,
    payments: sumAbsByType(folio.transactions, "payment"),
    adjustments: roundMoney(
      folio.transactions
        .filter((row) => row.type === "adjustment")
        .reduce((sum, row) => sum + Number(row.amount), 0),
    ),
    totalPayments: folio.credits,
    balance: folio.balance,
    depositCredits: sumAbsByType(folio.transactions, "deposit"),
  };
}

export function folioKpiCards(
  folio: FolioDetail | null,
  summary: FolioLedgerSummary | null,
): FolioKpiCard[] {
  return [
    {
      id: "room",
      name: "Room Folio",
      status: folio ? folioActiveLabel(folio.status) : "Inactive",
      amount: folio ? folio.balance : null,
      realFolio: Boolean(folio),
    },
    {
      id: "extras",
      name: "Extras Folio",
      status: "Inactive",
      amount: null,
      realFolio: false,
    },
    {
      id: "deposit",
      name: "Deposit Folio",
      status: "Inactive",
      amount: summary ? summary.depositCredits : null,
      realFolio: false,
    },
    {
      id: "city_ledger",
      name: "City Ledger",
      status: "Inactive",
      amount: null,
      realFolio: false,
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

export function folioDepositStatus(deposit: DetailDepositView | null, paid: number | null): string {
  if (
    paid != null &&
    deposit?.amount != null &&
    paid + Number.EPSILON >= deposit.amount &&
    deposit.amount > 0
  ) {
    return "Received";
  }
  if (paid != null && paid > 0) return "Partial";
  if (!deposit) return DETAIL_DASH;
  if (deposit.required === false) return "Not required";
  if (deposit.required === true) return "Pending";
  return DETAIL_DASH;
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
