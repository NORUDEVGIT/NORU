/**
 * FO-10R1 — Checkout backend contract (pure).
 *
 * Read projections for the three-stage checkout: folio review & settlement,
 * final confirmation, departure complete. Money comes from the Cashiering
 * folio read (loadGuestFolio); gates reuse the FO-FS2 helpers in fo-check-out.
 * The only status writer is check_out_hotel_reservation.
 */
import {
  canContinueClose,
  canContinueFolio,
  canContinueSettle,
  isCreditBalance,
  isFolioSettled,
  isOwesBalance,
  overrideKindForBalance,
  roundMoney,
  shouldCloseFolioAtCheckout,
  type CheckOutDocumentSnapshot,
  type CheckoutOverrideKind,
} from "./fo-check-out";

export type CheckOutUnitRow = {
  id: string;
  unitSequence: number;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  status: string;
};

export type CheckOutUnitResolution =
  | { kind: "unit"; unit: CheckOutUnitRow }
  | { kind: "header" }
  | { kind: "error"; code: "ROOM_UNIT_NOT_FOUND" | "ROOM_UNIT_REQUIRED" };

/** Same resolution order as public.resolve_reservation_room_unit. */
export function resolveCheckOutUnit(
  units: CheckOutUnitRow[],
  reservationRoomId: string | null | undefined,
): CheckOutUnitResolution {
  if (reservationRoomId) {
    const unit = units.find((row) => row.id === reservationRoomId);
    return unit ? { kind: "unit", unit } : { kind: "error", code: "ROOM_UNIT_NOT_FOUND" };
  }
  if (units.length === 0) return { kind: "header" };
  if (units.length === 1) return { kind: "unit", unit: units[0]! };
  return { kind: "error", code: "ROOM_UNIT_REQUIRED" };
}

export type CheckOutLedgerSource = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  quantity?: number | null;
  paymentMethod: string | null;
  referenceType: string | null;
  referenceId?: string | null;
  postedBy: string | null;
  chargeSource?: string | null;
  roomUnitLabel?: string | null;
};

export type CheckOutChargeItem = {
  transactionId: string;
  postedAt: string;
  type: string;
  category: string;
  description: string;
  quantity: number | null;
  amount: number;
  postedBy: string | null;
  source: string | null;
  roomUnitLabel: string | null;
};

export type CheckOutPaymentItem = {
  transactionId: string;
  postedAt: string;
  type: string;
  method: string | null;
  reference: string | null;
  cashier: string | null;
  channel: string | null;
  amount: number;
};

/** Debit side of the ledger: the same sign rule as Cashiering totals (amount ≥ 0). */
export function projectCheckOutCharges(rows: CheckOutLedgerSource[]): CheckOutChargeItem[] {
  return rows
    .filter((row) => row.amount >= 0)
    .map((row) => ({
      transactionId: row.id,
      postedAt: row.postedAt,
      type: row.type,
      category: row.category,
      description: row.description,
      quantity: row.quantity ?? null,
      amount: roundMoney(row.amount),
      postedBy: row.postedBy,
      source: row.chargeSource ?? row.referenceType ?? null,
      roomUnitLabel: row.roomUnitLabel ?? null,
    }));
}

/** Credit side of the ledger (amount < 0), shown as a positive amount. */
export function projectCheckOutPayments(rows: CheckOutLedgerSource[]): CheckOutPaymentItem[] {
  return rows
    .filter((row) => row.amount < 0)
    .map((row) => ({
      transactionId: row.id,
      postedAt: row.postedAt,
      type: row.type,
      method: row.paymentMethod,
      reference: row.referenceId ?? null,
      cashier: row.postedBy,
      channel: row.referenceType,
      amount: roundMoney(-row.amount),
    }));
}

export type CheckOutFolioFacts = {
  folioId: string;
  folioNumber: string;
  status: "open" | "closed";
  invoiced: boolean;
  invoiceNumbers: string[];
  currency: string;
  charges: number;
  credits: number;
  balance: number;
  depositsReceived: number;
  transactionCount: number;
  lastTransactionId: string | null;
};

export type CheckOutOverrideFacts = {
  recorded: boolean;
  kind: CheckoutOverrideKind | null;
  reason: string | null;
};

export type CheckOutBlockingReason =
  | "unit_not_found"
  | "unit_required"
  | "stay_not_in_house"
  | "folio_missing"
  | "outstanding_balance"
  | "credit_balance"
  | "folio_close_required";

export type CheckOutEligibility = {
  financiallyClear: boolean;
  isZero: boolean;
  outstanding: number;
  credit: number;
  folioMissing: boolean;
  folioClosed: boolean;
  folioInvoiced: boolean;
  overrideRecorded: boolean;
  overrideKind: CheckoutOverrideKind | null;
  overrideAllowedForRole: boolean;
  overrideAvailable: boolean;
  overrideReasonRequired: true;
  closeFolioRequired: boolean;
  checkoutAllowed: boolean;
  blockingReason: CheckOutBlockingReason | null;
  reasons: CheckOutBlockingReason[];
};

export function checkOutEligibility(input: {
  resolution: CheckOutUnitResolution;
  stayStatus: string | null;
  folio: CheckOutFolioFacts | null;
  override: CheckOutOverrideFacts;
  canOverride: boolean;
}): CheckOutEligibility {
  const reasons: CheckOutBlockingReason[] = [];
  if (input.resolution.kind === "error") {
    reasons.push(
      input.resolution.code === "ROOM_UNIT_NOT_FOUND" ? "unit_not_found" : "unit_required",
    );
  } else if (input.stayStatus !== "checked_in") {
    reasons.push("stay_not_in_house");
  }

  const folio = input.folio;
  const balance = folio?.balance ?? 0;
  const status = folio?.status ?? null;
  const overrideRecorded = input.override.recorded;
  const settleOk = canContinueSettle({ balance, override: overrideRecorded });
  const closeOk = canContinueClose({ balance, override: overrideRecorded, folioStatus: status });

  if (!canContinueFolio({ folioId: folio?.folioId ?? null })) {
    reasons.push("folio_missing");
  } else if (!settleOk) {
    reasons.push(isCreditBalance(balance) ? "credit_balance" : "outstanding_balance");
  } else if (!closeOk) {
    reasons.push("folio_close_required");
  }

  const overrideKind = input.override.kind ?? (folio ? overrideKindForBalance(balance) : null);
  return {
    financiallyClear: Boolean(folio) && isFolioSettled(balance),
    isZero: Boolean(folio) && isFolioSettled(balance),
    outstanding: folio && isOwesBalance(balance) ? roundMoney(balance) : 0,
    credit: folio && isCreditBalance(balance) ? roundMoney(-balance) : 0,
    folioMissing: !folio,
    folioClosed: status === "closed",
    folioInvoiced: folio?.invoiced ?? false,
    overrideRecorded,
    overrideKind,
    overrideAllowedForRole: input.canOverride,
    overrideAvailable:
      input.canOverride &&
      !overrideRecorded &&
      status === "open" &&
      overrideKindForBalance(balance) !== null,
    overrideReasonRequired: true,
    closeFolioRequired: shouldCloseFolioAtCheckout({
      balance,
      override: overrideRecorded,
      folioStatus: status,
    }),
    checkoutAllowed: reasons.length === 0,
    blockingReason: reasons[0] ?? null,
    reasons,
  };
}

export type CheckOutHousekeepingConsequence = {
  roomId: string | null;
  roomNumber: string | null;
  currentStatus: string | null;
  /** Result of pms_housekeeping_transition_target('guest_check_out', fallback 'dirty'). */
  targetStatus: string | null;
  statusChange: "to_target" | "already_target" | "automatic_disabled" | "no_room";
  /** housekeeping_create_task reuses an open task of the same type, otherwise inserts one. */
  departureCleaningTask: "ensured" | "no_room";
};

/** What check_out_hotel_reservation does to the room, and nothing more. */
export function checkOutHousekeepingConsequence(input: {
  roomId: string | null;
  roomNumber: string | null;
  currentStatus: string | null;
  targetStatus: string | null;
}): CheckOutHousekeepingConsequence {
  if (!input.roomId) {
    return {
      roomId: null,
      roomNumber: null,
      currentStatus: null,
      targetStatus: input.targetStatus,
      statusChange: "no_room",
      departureCleaningTask: "no_room",
    };
  }
  return {
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    currentStatus: input.currentStatus,
    targetStatus: input.targetStatus,
    statusChange: !input.targetStatus
      ? "automatic_disabled"
      : input.currentStatus === input.targetStatus
        ? "already_target"
        : "to_target",
    departureCleaningTask: "ensured",
  };
}

/**
 * Changes when a payment/charge lands, the folio closes or is invoiced, the
 * override is recorded, the unit status flips, or the unit changes room.
 */
export function checkOutFingerprint(input: {
  reservationId: string;
  reservationRoomId: string | null;
  stayStatus: string | null;
  roomId: string | null;
  folio: CheckOutFolioFacts | null;
  overrideRecorded: boolean;
}): string {
  const folio = input.folio;
  return [
    input.reservationId,
    input.reservationRoomId ?? "-",
    input.stayStatus ?? "-",
    input.roomId ?? "-",
    folio?.folioId ?? "-",
    folio?.status ?? "-",
    folio ? folio.balance.toFixed(2) : "-",
    folio?.transactionCount ?? 0,
    folio?.lastTransactionId ?? "-",
    folio?.invoiceNumbers.length ?? 0,
    input.overrideRecorded ? "override" : "-",
  ].join("|");
}

export type CheckOutSiblingUnit = {
  id: string;
  roomNumber: string | null;
  status: string | null;
};

export type CheckOutSharedFolioWarning = {
  /** True whenever this reservation has more than one unit (one folio serves them all). */
  shared: boolean;
  siblingsInHouse: CheckOutSiblingUnit[];
};

/**
 * One guest_folios row per reservation (see loadGuestFolio by reservation_id),
 * so settling or closing it reaches every unit on a multi-room reservation.
 * Pure read of stay.roomUnits — no new query.
 */
export function checkOutSharedFolioWarning(input: {
  reservationRoomId: string | null;
  units: CheckOutSiblingUnit[];
}): CheckOutSharedFolioWarning {
  if (input.units.length <= 1) return { shared: false, siblingsInHouse: [] };
  return {
    shared: true,
    siblingsInHouse: input.units.filter(
      (unit) => unit.id !== input.reservationRoomId && unit.status === "checked_in",
    ),
  };
}

export type CheckOutDueLabel = "due_out_today" | "in_house";

/** "DUE OUT TODAY" vs "IN-HOUSE" chip — compares the unit's own scheduled date. */
export function checkOutDueLabel(
  scheduledDepartureDate: string,
  businessDate: string | null,
): CheckOutDueLabel {
  return businessDate && scheduledDepartureDate === businessDate ? "due_out_today" : "in_house";
}

export type CheckOutAccountingBadge =
  "no_folio" | "paid_in_full" | "balance_due" | "credit" | "override_open";

/** "Paid in Full / Balance Due / Credit" badge — reads the same facts as checkOutEligibility. */
export function checkOutAccountingBadge(input: {
  folio: CheckOutFolioFacts | null;
  override: CheckOutOverrideFacts;
}): CheckOutAccountingBadge {
  if (input.override.recorded) return "override_open";
  if (!input.folio) return "no_folio";
  if (isCreditBalance(input.folio.balance)) return "credit";
  if (isOwesBalance(input.folio.balance)) return "balance_due";
  return "paid_in_full";
}

export type CheckOutSettlementState = "settled" | "override_unpaid" | "override_credit" | "open";

export function checkOutSettlementState(input: {
  folio: CheckOutFolioFacts | null;
  override: CheckOutOverrideFacts;
}): CheckOutSettlementState {
  if (input.override.recorded) {
    return input.override.kind === "credit" ? "override_credit" : "override_unpaid";
  }
  if (input.folio && input.folio.status === "closed" && isFolioSettled(input.folio.balance)) {
    return "settled";
  }
  return "open";
}

/**
 * Printable snapshot for Print Folio (stage 1) and Print Final Folio Receipt
 * (stage 3) — the same FO-FS2 renderer (renderCheckoutDocumentHtml), fed by
 * the new contract's charges/payments instead of the old ledger read.
 */
export function checkOutDocumentSnapshot(input: {
  propertyName: string;
  guestName: string;
  confirmationNumber: string;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  folio: CheckOutFolioFacts | null;
  charges: CheckOutChargeItem[];
  payments: CheckOutPaymentItem[];
  overrideOpen: boolean;
}): CheckOutDocumentSnapshot {
  const lines = [
    ...input.charges.map((row) => ({
      description: row.description,
      amount: row.amount,
      type: row.type,
      postedAt: row.postedAt,
    })),
    ...input.payments.map((row) => ({
      description: row.method ? `Payment (${row.method})` : "Payment",
      amount: -row.amount,
      type: row.type,
      postedAt: row.postedAt,
    })),
  ].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  return {
    propertyName: input.propertyName,
    guestName: input.guestName,
    confirmationNumber: input.confirmationNumber,
    folioNumber: input.folio?.folioNumber ?? "—",
    roomNumber: input.roomNumber,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    currency: input.folio?.currency ?? "GBP",
    lines,
    charges: input.folio?.charges ?? 0,
    credits: input.folio?.credits ?? 0,
    balance: input.folio?.balance ?? 0,
    folioStatus: input.folio?.status ?? "open",
    overrideOpen: input.overrideOpen,
  };
}

export type CheckOutCompletion = {
  reservationId: string;
  reservationRoomId: string | null;
  confirmationNumber: string;
  guestName: string;
  roomId: string | null;
  roomNumber: string | null;
  roomVacated: boolean;
  unitStatus: string | null;
  reservationStatus: string | null;
  folioId: string | null;
  folioNumber: string | null;
  folioStatus: "open" | "closed" | null;
  folioBalance: number;
  folioSettled: boolean;
  settlement: CheckOutSettlementState;
  housekeeping: {
    roomStatus: string | null;
    targetStatus: string | null;
    statusApplied: boolean;
    departureTaskId: string | null;
  };
  checkedOutAt: string | null;
  documents: CheckOutDocumentCapabilities;
};

/** Built only from reads taken after check_out_hotel_reservation returned. */
export function buildCheckOutCompletion(input: {
  reservationId: string;
  reservationRoomId: string | null;
  confirmationNumber: string;
  guestName: string;
  roomId: string | null;
  roomNumber: string | null;
  unitStatus: string | null;
  reservationStatus: string | null;
  folio: CheckOutFolioFacts | null;
  override: CheckOutOverrideFacts;
  roomHousekeepingStatus: string | null;
  housekeepingTarget: string | null;
  departureTaskId: string | null;
  checkedOutAt: string | null;
}): CheckOutCompletion {
  const settlement = checkOutSettlementState({ folio: input.folio, override: input.override });
  return {
    reservationId: input.reservationId,
    reservationRoomId: input.reservationRoomId,
    confirmationNumber: input.confirmationNumber,
    guestName: input.guestName,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    roomVacated: input.unitStatus === "checked_out",
    unitStatus: input.unitStatus,
    reservationStatus: input.reservationStatus,
    folioId: input.folio?.folioId ?? null,
    folioNumber: input.folio?.folioNumber ?? null,
    folioStatus: input.folio?.status ?? null,
    folioBalance: input.folio?.balance ?? 0,
    folioSettled: settlement === "settled",
    settlement,
    housekeeping: {
      roomStatus: input.roomHousekeepingStatus,
      targetStatus: input.housekeepingTarget,
      statusApplied:
        Boolean(input.housekeepingTarget) &&
        input.roomHousekeepingStatus === input.housekeepingTarget,
      departureTaskId: input.departureTaskId,
    },
    checkedOutAt: input.checkedOutAt,
    documents: checkOutDocumentCapabilities({ folio: input.folio, override: input.override }),
  };
}

export type CheckOutDocumentCapabilities = {
  printFolio: boolean;
  finalFolioReceipt: boolean;
  bookingVoucher: false;
};

/**
 * Print Folio: the Cashiering folio read is printable whenever a folio exists.
 * Final Folio Receipt: the FO-FS2 checkout document (renderCheckoutDocumentHtml),
 * meaningful once the folio is closed at zero or left open by override.
 * Booking Voucher: no voucher generator exists.
 */
export function checkOutDocumentCapabilities(input: {
  folio: CheckOutFolioFacts | null;
  override: CheckOutOverrideFacts;
}): CheckOutDocumentCapabilities {
  const settlement = checkOutSettlementState(input);
  return {
    printFolio: Boolean(input.folio),
    finalFolioReceipt: Boolean(input.folio) && settlement !== "open",
    bookingVoucher: false,
  };
}
