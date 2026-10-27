/**
 * Front Office Folio & Charges tab.
 * Figures and locks come from the Cashiering folio read. This module does not
 * add ledger lines or recompute a balance.
 */
import type { FolioTransactionRow } from "./cashiering.functions";
import type { FolioCapabilities } from "./folio-workspace";
import type { ReservationStatus } from "./reservation-dates";
import type { TransactionType } from "./cashiering.server";

export const FO_FOLIO_SECTIONS = [
  { id: "charges", label: "Charges" },
  { id: "payments", label: "Payments & Credits" },
  { id: "adjustments", label: "Adjustments" },
  { id: "invoices", label: "Invoices" },
] as const;

export type FoFolioSectionId = (typeof FO_FOLIO_SECTIONS)[number]["id"];

export type FoFolioActionId =
  | "post_charge"
  | "record_payment"
  | "post_deposit"
  | "print_folio"
  | "adjustment"
  | "discount"
  | "refund"
  | "close_folio"
  | "issue_invoice";

export type FoFolioActionState = "hidden" | "disabled" | "enabled";

export type FoFolioSummaryCard = {
  id: "charges" | "payments" | "balance" | "deposits";
  label: string;
  amount: number;
};

/** The folio row must be the one Cashiering opened for this reservation. */
export function foFolioMatchesReservation(
  folioReservationId: string | null | undefined,
  reservationId: string,
): boolean {
  return Boolean(folioReservationId) && folioReservationId === reservationId;
}

export type FoOpenFolioTarget = {
  surface: "in_house" | "stay";
  reservationId: string;
  reservationRoomId: string | null;
  tab: "folio";
};

/** Open Folio stays on the guest workspace for this reservation and unit. */
export function foOpenFolioTarget(stay: {
  id: string;
  status: ReservationStatus;
  reservationRoomId?: string | null;
}): FoOpenFolioTarget {
  return {
    surface: stay.status === "checked_in" ? "in_house" : "stay",
    reservationId: stay.id,
    reservationRoomId: stay.reservationRoomId ?? null,
    tab: "folio",
  };
}

/**
 * Cards for the tab. Amounts are the Cashiering folio charges total and the
 * workspace summary buckets. They are not derived again from ledger lines.
 */
export function foFolioSummaryCards(input: {
  charges: number;
  payments: number;
  balance: number;
  deposits: number;
}): FoFolioSummaryCard[] {
  return [
    { id: "charges", label: "Total Charges", amount: input.charges },
    { id: "payments", label: "Payments & Credits", amount: input.payments },
    { id: "balance", label: "Balance Due", amount: input.balance },
    { id: "deposits", label: "Deposits", amount: input.deposits },
  ];
}

/** Display groups. Filtering does not change amounts. */
export function foFolioSectionRows(
  rows: readonly FolioTransactionRow[],
  section: Exclude<FoFolioSectionId, "invoices">,
): FolioTransactionRow[] {
  if (section === "charges") return rows.filter((row) => row.type === "charge");
  if (section === "payments") {
    return rows.filter(
      (row) => row.type === "payment" || row.type === "deposit" || row.type === "refund",
    );
  }
  return rows.filter((row) => row.type === "adjustment" || row.type === "discount");
}

const ENTRY_TYPE: Partial<Record<FoFolioActionId, TransactionType>> = {
  post_charge: "charge",
  record_payment: "payment",
  post_deposit: "deposit",
  adjustment: "adjustment",
  discount: "discount",
  refund: "refund",
};

export function foFolioEntryType(action: FoFolioActionId): TransactionType | null {
  return ENTRY_TYPE[action] ?? null;
}

/**
 * Role without the Cashiering capability hides the action.
 * A role that Cashiering locks (closed folio, no close, no invoice) stays visible and disabled.
 */
export function foFolioActionState(input: {
  action: FoFolioActionId;
  canManage: boolean;
  canOperate: boolean;
  capabilities: FolioCapabilities;
  hasFolio: boolean;
}): FoFolioActionState {
  if (input.action === "print_folio") return input.hasFolio ? "enabled" : "hidden";
  if (!input.hasFolio) return "hidden";
  const allowedRole =
    input.action === "record_payment" || input.action === "post_deposit"
      ? input.canOperate
      : input.canManage;
  if (!allowedRole) return "hidden";
  const allowed: Record<Exclude<FoFolioActionId, "print_folio">, boolean> = {
    post_charge: input.capabilities.canPostCharge,
    record_payment: input.capabilities.canPostPayment,
    post_deposit: input.capabilities.canPostDeposit,
    adjustment: input.capabilities.canAdjust,
    discount: input.capabilities.canDiscount,
    refund: input.capabilities.canRefund,
    close_folio: input.capabilities.canClose,
    issue_invoice: input.capabilities.canIssueInvoice,
  };
  return allowed[input.action] ? "enabled" : "disabled";
}
