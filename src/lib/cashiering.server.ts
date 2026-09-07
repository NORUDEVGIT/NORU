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
import { withPmsPackage } from "./pms-package.server";

/** Roles that may open Accounting & Finance and run day-to-day cashiering. */
export const CASHIER_ACCESS_ROLES = ["owner", "manager", "cashier", "accountant"] as const;
/** Roles allowed to operate a cash drawer / post payments. */
export const CASHIER_OPERATE_ROLES = ["owner", "manager", "cashier"] as const;
/** Sensitive corrections: refunds, adjustments, discounts, folio close, audit. */
export const CASHIER_MANAGE_ROLES = ["owner", "manager"] as const;

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

export function canManageCashiering(role: string): boolean {
  return (CASHIER_MANAGE_ROLES as readonly string[]).includes(role);
}

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
  SHIFT_NOT_FOUND: "Cashier shift not found for this property.",
  SHIFT_ALREADY_OPEN: "You already have an open cashier shift.",
  SHIFT_ALREADY_CLOSED: "That cashier shift is already closed.",
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
