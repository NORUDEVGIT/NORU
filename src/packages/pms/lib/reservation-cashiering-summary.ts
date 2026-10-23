/**
 * One reservation Cashiering summary for Reservation Detail and Check-In.
 * Composes stored room subtotal, the folio ledger, and the deposit requirement.
 * It does not post, and it does not invent a combined funds-received total.
 */
import type { FolioDetail, FolioTransactionRow } from "@/packages/pms/lib/cashiering.functions";
import {
  netDepositTowardRequirement,
  snapshotRequiredAmount,
} from "@/packages/pms/lib/fo-check-in";
import { folioLedgerSummary, netPaidFromLedger } from "@/packages/pms/lib/reservation-detail-folio";

export const NO_FOLIO_LABEL = "No folio";

export type ReservationCashieringSummary = {
  reservationRoomTotal: number | null;
  postedRoomCharges: number | null;
  postedTax: number | null;
  postedTotalCharges: number | null;
  paymentReceived: number | null;
  depositRequired: number | null;
  depositReceived: number | null;
  refunded: number | null;
  netPaid: number | null;
  folioBalance: number | null;
};

export type CashieringSummaryFolio = {
  balance: number;
  transactions: Array<{
    id?: string | null;
    type: string;
    category?: string | null;
    amount: number;
    originalTransactionId?: string | null;
  }>;
};

function finiteAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function ledgerFolio(folio: CashieringSummaryFolio): FolioDetail {
  const transactions: FolioTransactionRow[] = folio.transactions.map((line, index) => ({
    id: line.id ?? `line-${index}`,
    type: line.type as FolioTransactionRow["type"],
    category: line.category ?? "",
    description: "",
    amount: Number(line.amount) || 0,
    postedAt: "",
    referenceType: null,
    paymentMethod: null,
    postedBy: null,
    originalTransactionId: line.originalTransactionId ?? null,
    sourceDescription: null,
  }));
  return { balance: folio.balance, transactions } as FolioDetail;
}

/**
 * Without a folio, every ledger field is null. A folio with no matching lines
 * returns zero for those buckets. Deposit required stays the snapshot amount.
 */
export function projectReservationCashieringSummary(input: {
  reservationRoomTotal: number | null;
  depositRequirementSnapshot: unknown;
  folio: CashieringSummaryFolio | null;
}): ReservationCashieringSummary {
  const reservationRoomTotal = finiteAmount(input.reservationRoomTotal);
  const depositRequired = snapshotRequiredAmount(input.depositRequirementSnapshot);
  if (!input.folio) {
    return {
      reservationRoomTotal,
      postedRoomCharges: null,
      postedTax: null,
      postedTotalCharges: null,
      paymentReceived: null,
      depositRequired,
      depositReceived: null,
      refunded: null,
      netPaid: null,
      folioBalance: null,
    };
  }

  const summary = folioLedgerSummary(ledgerFolio(input.folio));
  return {
    reservationRoomTotal,
    postedRoomCharges: summary?.roomCharges ?? 0,
    postedTax: summary?.tax ?? 0,
    postedTotalCharges: summary?.totalCharges ?? 0,
    paymentReceived: summary?.payments ?? 0,
    depositRequired,
    depositReceived: netDepositTowardRequirement(
      input.folio.transactions.map((line) => ({
        id: line.id ?? null,
        type: line.type,
        amount: Number(line.amount) || 0,
        originalTransactionId: line.originalTransactionId ?? null,
      })),
    ),
    refunded: summary?.refunds ?? 0,
    netPaid: netPaidFromLedger(summary),
    folioBalance: summary?.balance ?? finiteAmount(input.folio.balance),
  };
}
