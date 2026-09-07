/**
 * Phase 8H2 — Standalone POS server authorization.
 *
 * Access requires ALL of: an authenticated caller with an active membership in
 * the property, the `pos` package enabled for that property, the
 * `standalone_pos` module granted to that membership, and a permitted role.
 * A restaurant id coming from the browser only selects which membership
 * applies — package identity and role are always re-derived server-side.
 *
 * This file never calls a Restaurant Management, PMS or Back Office guard.
 */
import type { AuthedCtx, Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { publicPackageAvailable } from "@/core/lib/public-package.server";
import {
  STANDALONE_POS_MANAGE_ROLES,
  STANDALONE_POS_READ_ROLES,
  STANDALONE_POS_ROLES,
} from "@/core/lib/module-access";

const DENIED = "You don't have access to Standalone POS for this property.";
const DENIED_ACTION = "You don't have permission to do that in Standalone POS.";
const DENIED_MANAGE = "Only an owner or manager can do that in Standalone POS.";

/** Fail-closed package check for the Standalone POS package (`pos`). */
export async function requireStandalonePosPackage(restaurantId: string): Promise<void> {
  if (!(await publicPackageAvailable(restaurantId, "pos"))) throw new Error(DENIED);
}

async function guard(
  context: AuthedCtx,
  restaurantId: string,
  roles: readonly string[],
  message: string,
): Promise<Membership> {
  let membership: Membership;
  try {
    membership = await requireModuleRole(context, restaurantId, "standalone_pos", roles, message);
  } catch (error) {
    // Module entry failures are reported with the neutral POS wording.
    const text = error instanceof Error ? error.message : DENIED;
    throw new Error(text === message ? message : DENIED);
  }
  await requireStandalonePosPackage(restaurantId);
  return membership;
}

/** Read/entry gate: catalog, registers, shifts, transactions. */
export async function requireStandalonePosAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return guard(context, restaurantId, STANDALONE_POS_READ_ROLES, DENIED);
}

/** Any write: catalog edits, shifts, sales, payments. */
export async function requireStandalonePosMutation(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return guard(context, restaurantId, STANDALONE_POS_ROLES, DENIED_ACTION);
}

/** Owner/manager-only writes: refunds, shift close with variance. */
export async function requireStandalonePosManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return guard(context, restaurantId, STANDALONE_POS_MANAGE_ROLES, DENIED_MANAGE);
}

const POS_ERRORS: Record<string, string> = {
  POS_SALE_NOT_FOUND: "That sale could not be found for this property.",
  POS_SALE_NOT_OPEN: "That sale is no longer open.",
  POS_SALE_EMPTY: "Add at least one item before completing the sale.",
  POS_SHIFT_REQUIRED: "Open a cashier shift before completing a sale.",
  POS_SHIFT_NOT_OPEN: "That cashier shift is closed.",
  POS_PAYMENT_INSUFFICIENT: "The payments taken don't cover the sale total.",
  POS_SALE_IMMUTABLE: "A completed sale can't be changed. Use a refund instead.",
  POS_SALE_NOT_REFUNDABLE: "Only a completed sale can be refunded.",
  POS_REFUND_EXCEEDS_REMAINING: "That's more than the amount still refundable on this sale.",
  POS_REFUND_EXCEEDS_PAYMENT: "That's more than the amount still refundable on that payment.",
  POS_REFUND_PAYMENT_MISMATCH: "Choose one of the payments taken on this sale.",
  POS_REFUND_SHIFT_REQUIRED: "Open your own cashier shift before giving cash back.",
  POS_INVALID_AMOUNT: "Enter an amount greater than zero.",
};

export function standalonePosError(message: string): Error {
  for (const [code, text] of Object.entries(POS_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  if (/pos_shifts_one_open_per_register/i.test(message)) {
    return new Error("That register already has an open shift.");
  }
  if (/pos_products_sku_unique/i.test(message)) return new Error("That SKU is already in use.");
  if (/pos_products_barcode_unique/i.test(message)) return new Error("That barcode is already in use.");
  if (/pos_registers_name_unique/i.test(message)) return new Error("A register with that name already exists.");
  if (/pos_categories_name_unique/i.test(message)) return new Error("A category with that name already exists.");
  return new Error(message);
}
