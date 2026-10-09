/**
 * Phase 6H — Cashiering & guest folios, server-only helpers.
 *
 * Folios are owner/manager only. Every helper re-derives the caller's
 * membership; a restaurant id from the browser only selects which membership
 * applies. Money never comes from the browser signed — the database applies the
 * sign convention.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { CASHIER_MANAGE_ROLES, canManageCashiering } from "@/core/lib/cashiering-roles";
import { withPmsPackage } from "./pms-package.server";

export { CASHIER_MANAGE_ROLES, canManageCashiering };

/** Roles that may open Accounting & Finance and run day-to-day cashiering. */
export const CASHIER_ACCESS_ROLES = ["owner", "manager", "cashier", "accountant"] as const;
/** Roles allowed to operate a cash drawer / post payments. */
export const CASHIER_OPERATE_ROLES = ["owner", "manager", "cashier"] as const;
/** Sensitive corrections: refunds, adjustments, discounts, folio close, audit. */

export const TRANSACTION_TYPES = [
  "charge",
  "payment",
  "deposit",
  "refund",
  "adjustment",
  "discount",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_CATEGORIES = [
  "room",
  "manual",
  "payment",
  "deposit",
  "refund",
  "adjustment",
  "discount",
  "future_restaurant",
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export const FOLIO_STATUSES = ["open", "closed"] as const;
export type FolioStatus = (typeof FOLIO_STATUSES)[number];

const NO_ACCESS = "You don't have access to Accounting & Finance for this property.";
const NO_PERMISSION = "You don't have permission to perform that finance action.";

/** Module entry + read access to folios, payments and shifts. */
export async function requireCashieringAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(context, restaurantId, "accounting_finance", CASHIER_ACCESS_ROLES, NO_ACCESS),
  );
}

/** Cash-handling actions: payments, deposits, own cashier shift. */
export async function requireCashierOperator(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "accounting_finance",
      CASHIER_OPERATE_ROLES,
      NO_PERMISSION,
    ),
  );
}

/** Sensitive corrections and night audit: owner/manager only. */
export async function requireCashierManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "accounting_finance",
      CASHIER_MANAGE_ROLES,
      NO_PERMISSION,
    ),
  );
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const CASHIER_ERRORS: Record<string, string> = {
  RESERVATION_NOT_FOUND: "Reservation not found for this property.",
  RESERVATION_NOT_BILLABLE: "Cancelled and no-show reservations can't be billed.",
  FOLIO_NOT_FOUND: "Folio not found for this property.",
  FOLIO_CLOSED: "This folio is closed. Nothing more can be posted to it.",
  BALANCE_NOT_ZERO: "Settle the outstanding balance before closing this folio.",
  INVALID_AMOUNT: "Enter an amount greater than zero.",
  INVALID_TRANSACTION_TYPE: "That transaction type isn't supported.",
  DESCRIPTION_REQUIRED: "A description is required.",
  REFUND_EXCEEDS_SETTLED: "A refund can't exceed what has been paid on this folio.",
  SOURCE_NOT_ON_FOLIO: "Choose a source line from this folio.",
  SOURCE_NOT_ALLOWED: "A source line can only be stored on a refund, adjustment, or discount.",
  SOURCE_REQUIRED: "Choose the folio line this corrects.",
  SOURCE_NOT_A_PAYMENT: "A refund must name a payment or deposit on this folio.",
  SOURCE_NOT_A_CHARGE: "A discount must name a charge on this folio.",
  REFUND_EXCEEDS_SOURCE: "A refund can't exceed the remaining amount on that payment.",
  FOLIO_TRANSACTION_IMMUTABLE: "A posted folio line cannot be changed. Post a correction instead.",
  INVALID_PAYMENT_METHOD: "That payment method cannot be stored on the folio.",
  PAYMENT_METHOD_REQUIRED: "Choose a payment method.",
  INVALID_IDEMPOTENCY_KEY: "The posting key is invalid. Try the action again.",
  IDEMPOTENCY_KEY_REUSED: "That posting was already used for a different folio line.",
  SHIFT_NOT_FOUND: "Cashier shift not found for this property.",
  SHIFT_ALREADY_OPEN: "You already have an open cashier shift.",
  SHIFT_ALREADY_CLOSED: "That cashier shift is already closed.",
  INVALID_CLOSING_CASH: "Enter the cash counted at close.",
  INVALID_MOVEMENT: "That drawer movement is not supported.",
  HOTEL_DRAWER_MOVEMENT_IMMUTABLE: "A drawer movement cannot be changed. Post another movement.",
  SOURCE_NOT_A_CHARGE: "A transfer must name a charge line on the source folio.",
  TRANSFER_EXCEEDS_REMAINDER: "That amount exceeds what remains on this charge.",
  TRANSFER_SAME_FOLIO: "Choose a different guest folio.",
  TRANSFER_CURRENCY_MISMATCH: "The destination uses a different currency.",
  TRANSFER_CHILD_NOT_ALLOWED: "Transfer the posted charge. Tax and service lines move with it.",
  TRANSFER_ALLOCATION_MISMATCH: "The transfer amount could not be split across the posted charge.",
  TRANSFER_FOLIO_PAIR: "Use guest folio transfer to move a charge between guest folios.",
  TRANSFER_ACCOUNT_TO_ACCOUNT: "A charge cannot move from one financial account to another.",
  INVALID_TRANSFER_TARGET: "Choose a guest folio or a company or group account.",
  ACCOUNT_KIND_NOT_TRANSFERABLE: "Only company and group accounts can receive a transfer.",
  TRANSFER_INVOICED: "This folio already has an issued invoice. The charge cannot move to a company or group account.",
  CORRECTION_INVOICED: "This folio already has an issued invoice. The charge cannot be corrected.",
  CORRECTION_CHILD_NOT_ALLOWED: "Correct the posted charge. Tax and service lines move with it.",
  CORRECTION_EXCEEDS_REMAINDER: "That amount exceeds what remains on this charge.",
  CORRECTION_AMOUNT_CHANGED: "The remaining amount changed. Review the correction and post it again.",
  INVALID_CORRECTION_MODE: "Choose an amount adjustment, quantity correction, discount, or reversal.",
  QUANTITY_NOT_AVAILABLE: "This charge has no posted quantity to correct.",
  CREDIT_LIMIT_EXCEEDED: "That transfer would exceed the company credit limit.",
  TARGET_WINDOW_NOT_FOUND: "Choose a target window on the destination folio.",
  ACCOUNT_NOT_FOUND: "Financial account not found for this property.",
  ACCOUNT_CLOSED: "This financial account is closed.",
  MASTER_NOT_FOUND: "Company or group master not found for this property.",
  ALLOCATION_EXCEEDS_UNALLOCATED: "That amount exceeds the unallocated deposit remainder.",
  ALLOCATION_SAME_FOLIO_ONLY: "Deposit allocation must stay on the same folio for now.",
  SOURCE_NOT_A_DEPOSIT: "Choose a deposit line to allocate.",
  INVALID_WRITE_OFF_AMOUNT: "Write-off amount must match the outstanding balance.",
  WRITE_OFF_TARGET_REQUIRED: "Choose a folio or financial account for the write-off.",
  SERVICE_NOT_FOUND: "That guest service is not on this property.",
  SERVICE_INACTIVE: "That guest service is inactive.",
  SERVICE_NOT_CHARGEABLE: "That guest service is not chargeable to a folio.",
  SERVICE_PRICE_MISSING: "That guest service has no active price.",
  CURRENCY_MISMATCH: "That guest service price uses a different currency than this folio.",
  BILLING_DEPARTMENT_REQUIRED: "That guest service needs one billing department.",
  BILLING_DEPARTMENT_AMBIGUOUS: "That guest service has more than one billing department.",
  INVALID_QUANTITY: "Quantity must be a whole number from 1 to 99.",
};

/** Map RAISE EXCEPTION codes from the cashiering functions to user-facing text. */
export function cashierError(message: string): Error {
  if (/duplicate key value/i.test(message)) {
    if (message.includes("guest_folios_one_per_reservation")) {
      return new Error("This reservation already has a folio.");
    }
    if (message.includes("cashier_shifts_one_open")) {
      return new Error("You already have an open cashier shift.");
    }
    return new Error("That record already exists.");
  }
  for (const [code, text] of Object.entries(CASHIER_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

/**
 * Display sign convention — mirrors the database:
 * charges and refunds increase the balance, payments, deposits and discounts
 * reduce it, adjustments carry their own sign.
 */
export function isCreditType(type: TransactionType): boolean {
  return type === "payment" || type === "deposit" || type === "discount";
}

export const CORRECTION_AUTHORIZER = "Only an owner or manager can post this correction.";

/** Settings threshold text. The number is not a live posting limit. */
export function correctionThresholdNotice(
  amount: number | null,
  unit: "amount" | "percent" | null,
): string | null {
  if (amount == null || !Number.isFinite(amount) || !unit) return null;
  if (unit === "percent") {
    return `Configured threshold ${amount}% is setup only and is not enforced on this post.`;
  }
  return `Configured threshold ${amount} is setup only and is not enforced on this post.`;
}

/** Paid amount on a payment or deposit, minus refunds already linked to that line. */
/** Hotel drawer expected cash. Restaurant till totals are not an input. */
export function hotelDrawerExpected(input: {
  opening: number;
  cashIn: number;
  cashOut: number;
  hotelCash: number;
}): number {
  return Math.round((input.opening + input.cashIn - input.cashOut + input.hotelCash) * 100) / 100;
}

export function hotelDrawerVariance(closingCount: number, expected: number): number {
  return Math.round((closingCount - expected) * 100) / 100;
}

export function remainingOnPaymentSource(
  source: { id: string; type: string; amount: number },
  lines: Array<{ type: string; amount: number; originalTransactionId: string | null }>,
): number | null {
  if (source.type !== "payment" && source.type !== "deposit") return null;
  const paid = Math.round(-source.amount * 100) / 100;
  const prior = lines
    .filter((line) => line.type === "refund" && line.originalTransactionId === source.id)
    .reduce((sum, line) => sum + line.amount, 0);
  return Math.round((paid - prior) * 100) / 100;
}

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;

export function assertIdempotencyKey(key: string): string {
  const trimmed = key.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new Error("The posting key is invalid. Try the action again.");
  }
  return trimmed;
}

/** Checkout is settled only when the folio is closed at ~0 and has no open exception. */
export function folioReportsSettled(input: {
  status: string | null;
  balance: number;
  unsettledCheckout: boolean;
}): boolean {
  if (input.unsettledCheckout) return false;
  if (input.status !== "closed") return false;
  return Math.abs(input.balance) < 0.01;
}

export function categoryForType(type: TransactionType): TransactionCategory {
  switch (type) {
    case "charge":
      return "manual";
    case "payment":
      return "payment";
    case "deposit":
      return "deposit";
    case "refund":
      return "refund";
    case "discount":
      return "discount";
    default:
      return "adjustment";
  }
}

export async function callPostFolioTransaction(input: {
  restaurantId: string;
  folioId: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  membershipId: string;
  paymentMethod?: string | null;
  idempotencyKey: string;
  originalTransactionId?: string | null;
}): Promise<{ id: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("post_folio_transaction", {
    _restaurant_id: input.restaurantId,
    _folio_id: input.folioId,
    _type: input.type,
    _category: input.category,
    _description: input.description,
    _amount: input.amount,
    _reference_type: (input.referenceType ?? null) as unknown as string,
    _reference_id: (input.referenceId ?? null) as unknown as string,
    _membership_id: input.membershipId,
    _payment_method: input.paymentMethod ?? undefined,
    _idempotency_key: assertIdempotencyKey(input.idempotencyKey),
    ...(input.originalTransactionId
      ? { _original_transaction_id: input.originalTransactionId }
      : {}),
  });
  if (error) throw cashierError(error.message);
  return { id: (data as { id: string }).id };
}

/** Append-only folio audit write; runs with the service role inside a handler. */
export async function recordFolioEvent(params: {
  restaurantId: string;
  folioId?: string | null;
  cashierShiftId?: string | null;
  eventType: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("folio_history").insert({
    restaurant_id: params.restaurantId,
    folio_id: params.folioId ?? null,
    cashier_shift_id: params.cashierShiftId ?? null,
    event_type: params.eventType,
    previous_values: (params.previousValues ?? null) as never,
    new_values: (params.newValues ?? null) as never,
    notes: params.notes ?? null,
    actor_membership_id: params.actorMembershipId,
  });
}
