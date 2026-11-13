/**
 * Reservation cancellation settlement (pure).
 *
 * Shape of settle_reservation_cancellation and the outcome shown after a cancel,
 * no-show, or room removal. Refunds and payments stay in Cashiering.
 */

export type SettlementKind = "cancel" | "noshow" | "unit_removal";

export type SettlementLine = {
  chargeId: string;
  referenceType: string | null;
  description: string | null;
  mode: string | null;
  amount: number;
};

export type SettlementPendingReason = "credit_note_required" | "legacy_invoice_manual" | "folio_closed";

export type SettlementPendingLine = SettlementLine & { reason: SettlementPendingReason };

export type SettlementRelease = {
  allocationId: string;
  depositTransactionId: string;
  amount: number;
};

export type SettlementSkip = { chargeId: string; reason: string };

export type CancellationSettlement = {
  dryRun: boolean;
  kind: SettlementKind;
  reservationId: string;
  reservationRoomId: string | null;
  folioId: string | null;
  folioNumber: string | null;
  folioStatus: "open" | "closed" | null;
  currency: string;
  reversed: SettlementLine[];
  pending: SettlementPendingLine[];
  released: SettlementRelease[];
  skipped: SettlementSkip[];
  reversalTotal: number;
  feesPosted: number;
  credits: number;
  balance: number;
  refundDue: number;
  amountDue: number;
  closable: boolean;
};

export type SettlementOutcome =
  | "no_folio"
  | "settled"
  | "refund_due"
  | "amount_due"
  | "credit_note_required"
  | "pending";

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function arr(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Record<string, unknown>[]) : [];
}

const PENDING_REASONS: SettlementPendingReason[] = [
  "credit_note_required",
  "legacy_invoice_manual",
  "folio_closed",
];

function line(row: Record<string, unknown>): SettlementLine {
  return {
    chargeId: String(row["charge_id"] ?? ""),
    referenceType: str(row["reference_type"]),
    description: str(row["description"]),
    mode: str(row["mode"]),
    amount: num(row["amount"]),
  };
}

export function parseCancellationSettlement(raw: unknown): CancellationSettlement {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind = row["kind"] === "noshow" || row["kind"] === "unit_removal" ? row["kind"] : "cancel";
  const status = row["folio_status"] === "open" || row["folio_status"] === "closed" ? row["folio_status"] : null;
  return {
    dryRun: row["dry_run"] !== false,
    kind,
    reservationId: String(row["reservation_id"] ?? ""),
    reservationRoomId: str(row["reservation_room_id"]),
    folioId: str(row["folio_id"]),
    folioNumber: str(row["folio_number"]),
    folioStatus: status,
    currency: str(row["currency"]) ?? "GBP",
    reversed: arr(row["reversed"]).map(line),
    pending: arr(row["pending"]).map((p) => {
      const reason = PENDING_REASONS.includes(p["reason"] as SettlementPendingReason)
        ? (p["reason"] as SettlementPendingReason)
        : "credit_note_required";
      return { ...line(p), reason };
    }),
    released: arr(row["released"]).map((r) => ({
      allocationId: String(r["allocation_id"] ?? ""),
      depositTransactionId: String(r["deposit_transaction_id"] ?? ""),
      amount: num(r["amount"]),
    })),
    skipped: arr(row["skipped"]).map((s) => ({
      chargeId: String(s["charge_id"] ?? ""),
      reason: String(s["reason"] ?? ""),
    })),
    reversalTotal: num(row["reversal_total"]),
    feesPosted: num(row["fees_posted"]),
    credits: num(row["credits"]),
    balance: num(row["balance"]),
    refundDue: num(row["refund_due"]),
    amountDue: num(row["amount_due"]),
    closable: row["closable"] === true,
  };
}

export function settlementOutcome(s: CancellationSettlement): SettlementOutcome {
  if (!s.folioId) return "no_folio";
  if (s.pending.some((p) => p.reason === "credit_note_required" || p.reason === "legacy_invoice_manual")) {
    return "credit_note_required";
  }
  if (s.pending.length > 0) return "pending";
  if (s.refundDue >= 0.01) return "refund_due";
  if (s.amountDue >= 0.01) return "amount_due";
  return "settled";
}

export const SETTLEMENT_OUTCOME_LABEL: Record<SettlementOutcome, string> = {
  no_folio: "No folio",
  settled: "Settled",
  refund_due: "Refund due",
  amount_due: "Amount due",
  credit_note_required: "Credit note required",
  pending: "Needs review",
};

export const SETTLEMENT_PENDING_LABEL: Record<SettlementPendingReason, string> = {
  credit_note_required: "Invoiced. Issue a credit note in Cashiering.",
  legacy_invoice_manual: "Covered by a full-folio invoice. Correct it in Cashiering.",
  folio_closed: "The folio is closed. Correct it in Cashiering.",
};

export function settlementOutcomeMessage(s: CancellationSettlement): string {
  const outcome = settlementOutcome(s);
  switch (outcome) {
    case "no_folio":
      return "No folio was opened for this stay. Nothing to settle.";
    case "settled":
      return s.closable
        ? "The folio balance is zero. You can close the folio in Cashiering."
        : "The folio balance is zero.";
    case "refund_due":
      return "The guest is in credit. Refund it in Cashiering when the guest asks.";
    case "amount_due":
      return "The guest still owes money. Take payment in Cashiering.";
    case "credit_note_required":
      return "Some reversed charges are invoiced. Issue a credit note in Cashiering, then run settlement again.";
    case "pending":
      return "Some charges could not be reversed. Review the folio in Cashiering.";
  }
}

/** True when a public guest may cancel online: the frozen policy charges nothing. */
export function publicCancelAllowed(penalty: {
  calculable: boolean;
  required: boolean;
  amount: number | null;
}): boolean {
  if (!penalty.calculable) return false;
  if (!penalty.required) return true;
  return (penalty.amount ?? 0) < 0.01;
}
