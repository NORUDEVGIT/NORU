/**
 * Create Reservation Phase 1 — Section 7: Guarantee + review/confirm +
 * on-screen confirmation (Issue #153).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Same writer as FO walk-in. Server / RPC
 * remains source of truth. Sticky total = Section 5 server quote. No second
 * calculator.
 *
 * TIP locked (Rekik APPROVED 2026-09-15):
 * 1. Guarantee values: prefer active `pms_payment_methods` via
 *    `getPmsPolish1Snapshot`; else cashier `PAYMENT_METHODS` fallback.
 *    Labels only — no gateway / folio post.
 * 2. Migration `0061_pms_create_reservation_guarantee_confirm.sql` (0060 taken
 *    by Associations). Dual-lane supabase + drizzle. Additive columns +
 *    optional RPC params DEFAULT NULL. Do not overload channel-origin `source`.
 *    0061 is applied on the only inspectable project (qcwptraosaudcbjasmul /
 *    20260915144627). Writer persist is APPLIED: Confirm writes commercial
 *    source / segment / ref / guarantee. Fail-closed path remains if persist is off.
 * 3. Persist source/segment/ref (+ guarantee if set) on every successful create.
 * 4. FO `WalkInDialog`: confirmed + rate without guarantee required (option 1).
 *    Create Confirm/Guarantee requires guarantee.
 * 5. Success: in-place on-screen confirmation panel + `window.print`; secondary
 *    Open reservation to detail. Not public `/stay/.../confirmation`.
 * 6. Sticky/review compose with §5 rate/total and §6 Room/Unassigned — no
 *    second calculator.
 * 7. Leave create RPC channel `source = 'staff'` residual documented.
 *
 * Guest Waves 1–5 + GE1–GE3 stay closed. Section 7 does not claim Phase 1 or
 * Create Reservation DONE. Packages are Section 8.
 */

import { FALLBACK_CASHIERING_TENDERS } from "./pms-polish1-payment-admin.ts";
import {
  canSubmitCreateReservation,
  createSubmitBlockCopy,
  type CreateReservationStatus,
} from "./create-reservation-phase1-section5.ts";
import type { ReservationTypeMode } from "./create-reservation-phase1.ts";

export const CREATE_RESERVATION_SECTION7_ISSUE = 153;
export const CREATE_RESERVATION_SECTION7_SPEC_PR = 150;
export const CREATE_RESERVATION_SECTION7_MIGRATION =
  "0061_pms_create_reservation_guarantee_confirm.sql";
/** Persist gate. APPLIED after 0061 verify on qcwptraosaudcbjasmul (org has one inspectable project). */
export const CREATE_RESERVATION_SECTION7_APPLY = "APPLIED";
/** Non-prod qcwptraosaudcbjasmul: 0061 objects and migration row are live. */
export const CREATE_RESERVATION_SECTION7_NONPROD_DB = "APPLIED";
/** Same inspectable project as non-prod; no separate production project in the org. */
export const CREATE_RESERVATION_SECTION7_PROD_DB = "APPLIED";

/** TIP pick: FO walk-in stays confirmed + rate without guarantee. */
export const CREATE_RESERVATION_FO_WALKIN_GUARANTEE_REQUIRED = false;

/** TIP pick: persist source/segment/ref (+ guarantee if set) on every successful create after APPLY. */
export const CREATE_RESERVATION_SECTION7_PENDING_PERSIST = "every-successful-create";

/** TIP pick: in-place confirmation panel (not a public stay route). */
export const CREATE_RESERVATION_SECTION7_SUCCESS_CHROME = "in-place-panel-print";

/** Channel origin residual: create RPC still hardcodes staff, including FO walk-in. */
export const CREATE_RESERVATION_CHANNEL_ORIGIN_RESIDUAL =
  "create_hotel_reservation INSERT still hardcodes channel-origin source = 'staff' (including FO walk-in). Commercial booking source is commercial_booking_source. Do not overload hotel_reservations.source.";

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION7 = [
  "AC-CR7-1",
  "AC-CR7-2",
  "AC-CR7-3",
  "AC-CR7-4",
  "AC-CR7-5",
  "AC-CR7-6",
  "AC-CR7-7",
  "AC-CR7-8",
  "AC-CR7-9",
  "AC-CR7-10",
  "AC-CR7-11",
  "AC-CR7-12",
  "AC-CR7-13",
  "AC-CR7-14",
  "AC-CR7-15",
  "AC-CR7-16",
  "AC-CR7-17",
  "AC-CR7-18",
  "AC-CR7-19",
  "AC-CR7-20",
  "AC-CR7-21",
  "AC-CR7-22",
  "AC-CR7-23",
  "AC-CR7-24",
] as const;

export const CREATE_RESERVATION_SECTION7_TIP_AC_MAP = {
  "plan-review-sticky": ["AC-CR7-1", "AC-CR7-17", "AC-CR7-22"],
  "plan-guarantee-confirm": [
    "AC-CR7-2",
    "AC-CR7-3",
    "AC-CR7-4",
    "AC-CR7-5",
    "AC-CR7-7",
    "AC-CR7-23",
  ],
  "plan-persist-fail-closed": ["AC-CR7-8", "AC-CR7-19"],
  "plan-success-print": ["AC-CR7-9", "AC-CR7-10", "AC-CR7-24"],
  "plan-no-second-writer": ["AC-CR7-11", "AC-CR7-12", "AC-CR7-16"],
  "plan-out-gates": [
    "AC-CR7-6",
    "AC-CR7-13",
    "AC-CR7-14",
    "AC-CR7-15",
    "AC-CR7-18",
    "AC-CR7-20",
    "AC-CR7-21",
  ],
} as const;

export const CREATE_RESERVATION_SECTION7_SCOPE =
  "Section 7 is Guarantee + review/confirm + on-screen confirmation. Packages remain Section 8. Email/SMS send confirmation is OUT.";

export const CREATE_RESERVATION_SECTION7_PROGRAMME_RULE =
  "Reference Individual create guarantee/confirm function with modern NORU UI (own box, sticky summary, sticky actions). Do not clone legacy chrome. Corporate and Group remain later separate products (CR-100 OUT).";

export const CREATE_RESERVATION_GUARANTEE_REQUIRED =
  "Pick a guarantee method to Confirm / Guarantee. Pending does not require it.";

export const CREATE_RESERVATION_SOURCE_SEGMENT_REQUIRED =
  "Booking source and market segment are required to Confirm / Guarantee.";

export const CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED =
  "A Company is required to Confirm a Corporate stay, and a Travel Agency is required to Confirm a Travel Agency stay.";

export const CREATE_RESERVATION_PERSIST_HELD_COPY =
  "Confirm / Guarantee cannot store source, segment, reference, or guarantee until migration 0061 is applied. This create fails closed instead of dropping those fields. Save as Pending still works.";

export const CREATE_RESERVATION_GUARANTEE_LABELS_ONLY =
  "Recorded guarantee / tender class only. This does not post a deposit, open a gateway, or capture a card.";

export const CREATE_RESERVATION_EMPTY_PAYMENT_METHODS_WARN =
  "No active payment methods in Setup yet. Cashier tender labels are shown instead. This is a warning, not a fake seed.";

export const CREATE_RESERVATION_NO_PAYMENT_TERMS = "No payment terms on this master.";

export const CREATE_RESERVATION_PENDING_LABEL = "Save as Pending";
export const CREATE_RESERVATION_CONFIRM_LABEL = "Confirm / Guarantee";
export const CREATE_RESERVATION_PRINT_LABEL = "Print";
export const CREATE_RESERVATION_OPEN_RESERVATION_LABEL = "Open reservation";

export const CREATE_RESERVATION_SECTION7_MIGRATION_REASON =
  "0061 columns and create_hotel_reservation_priced params are live on qcwptraosaudcbjasmul (version 20260915144627). CREATE_RESERVATION_SECTION7_APPLY is APPLIED so Confirm persists source, segment, reference, and guarantee. Fail-closed copy remains if persist is turned off. Do not overload channel-origin source. Flag Abel: NOT required (RLS model unchanged).";

export const CREATE_RESERVATION_SECTION7_PERMISSION_DOC =
  'Create Confirm/Pending uses requireReservationManager (owner|manager|receptionist) + requireRoutePackage("pms"). Unpriced Pending stays owner|manager (Section 5). Capability-only — no RLS / entitlement model change. Flag Abel: NOT required.';

export const CREATE_RESERVATION_SECTION7_LOCKED_NON_GOALS = [
  "email/SMS send confirmation",
  "create-time deposit cashiering",
  "payment gateway / card capture",
  "credit-approval engine / city-ledger",
  "guarantee rules Setup product",
  "overload hotel_reservations.source",
  "packages (Section 8)",
  "LIVE OTA / RMS / commission",
  "offline / local-first",
  "Group / CR-100",
  "new entitlement / RLS architecture",
  "Phase 1 / Create Reservation DONE claim",
] as const;

export type GuaranteeMethodOption = {
  value: string;
  label: string;
  origin: "setup" | "cashier";
};

export type GuaranteeCatalogueSnapshot = {
  paymentMethodsAvailable: boolean;
  paymentMethods: Array<{ code: string; name: string; active: boolean }>;
};

export function section7PersistApplied(): boolean {
  return CREATE_RESERVATION_SECTION7_APPLY !== "HELD";
}

/** Prefer active Setup tenders; else cashier PAYMENT_METHODS labels. Empty Setup is honest. */
export function resolveGuaranteeMethodOptions(
  snapshot: GuaranteeCatalogueSnapshot | null | undefined,
): GuaranteeMethodOption[] {
  if (snapshot?.paymentMethodsAvailable) {
    const active = snapshot.paymentMethods.filter((row) => row.active);
    if (active.length > 0) {
      return active.map((row) => ({
        value: row.code,
        label: row.name,
        origin: "setup" as const,
      }));
    }
  }
  return FALLBACK_CASHIERING_TENDERS.map((row) => ({
    value: row.code,
    label: row.name,
    origin: "cashier" as const,
  }));
}

export function guaranteeCatalogueWarning(
  snapshot: GuaranteeCatalogueSnapshot | null | undefined,
): string | null {
  const options = resolveGuaranteeMethodOptions(snapshot);
  if (options.some((row) => row.origin === "cashier")) {
    return CREATE_RESERVATION_EMPTY_PAYMENT_METHODS_WARN;
  }
  return null;
}

export function requiredMasterForConfirm(
  reservationType: ReservationTypeMode,
  companyMasterId: string | null,
  travelAgentMasterId: string | null,
): boolean {
  if (reservationType === "corporate") return Boolean(companyMasterId);
  if (reservationType === "travel_agency") return Boolean(travelAgentMasterId);
  return true;
}

export function paymentTermsReviewCopy(input: {
  companyName: string | null;
  companyTerms: string | null;
  travelAgentName: string | null;
  travelAgentTerms: string | null;
}): string | null {
  const parts: string[] = [];
  if (input.companyName) {
    parts.push(
      `Company · ${input.companyTerms?.trim() ? input.companyTerms.trim() : CREATE_RESERVATION_NO_PAYMENT_TERMS}`,
    );
  }
  if (input.travelAgentName) {
    parts.push(
      `Travel Agency · ${input.travelAgentTerms?.trim() ? input.travelAgentTerms.trim() : CREATE_RESERVATION_NO_PAYMENT_TERMS}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type CreateConfirmSubmitInput = {
  hasGuest: boolean;
  datesValid: boolean;
  roomTypeId: string;
  available: number;
  priced: boolean;
  canCreateUnpriced: boolean;
  hasGuarantee: boolean;
  hasSource: boolean;
  hasSegment: boolean;
  hasRequiredMaster: boolean;
  persistApplied: boolean;
};

export function canSubmitPendingReservation(
  input: Parameters<typeof canSubmitCreateReservation>[0],
): boolean {
  return canSubmitCreateReservation({ ...input, status: "pending" });
}

export function canSubmitConfirmReservation(input: CreateConfirmSubmitInput): boolean {
  if (!input.persistApplied) return false;
  if (
    !canSubmitCreateReservation({
      hasGuest: input.hasGuest,
      datesValid: input.datesValid,
      roomTypeId: input.roomTypeId,
      available: input.available,
      status: "confirmed",
      priced: input.priced,
      canCreateUnpriced: input.canCreateUnpriced,
    })
  ) {
    return false;
  }
  return input.hasGuarantee && input.hasSource && input.hasSegment && input.hasRequiredMaster;
}

export function createPendingBlockCopy(
  input: Parameters<typeof createSubmitBlockCopy>[0],
): string | null {
  return createSubmitBlockCopy({ ...input, status: "pending" });
}

export function createConfirmBlockCopy(input: CreateConfirmSubmitInput): string | null {
  if (canSubmitConfirmReservation(input)) return null;
  if (!input.persistApplied) return CREATE_RESERVATION_PERSIST_HELD_COPY;
  const pricing = createSubmitBlockCopy({
    hasGuest: input.hasGuest,
    datesValid: input.datesValid,
    roomTypeId: input.roomTypeId,
    available: input.available,
    status: "confirmed",
    priced: input.priced,
    canCreateUnpriced: input.canCreateUnpriced,
  });
  if (pricing) return pricing;
  if (!input.hasRequiredMaster) return CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED;
  if (!input.hasSource || !input.hasSegment) return CREATE_RESERVATION_SOURCE_SEGMENT_REQUIRED;
  if (!input.hasGuarantee) return CREATE_RESERVATION_GUARANTEE_REQUIRED;
  return null;
}

export function assertCreateReservationSection7(input: {
  status: CreateReservationStatus;
  requireGuarantee: boolean;
  guaranteeMethod: string | null;
  commercialBookingSource: string | null;
  marketSegment: string | null;
  persistApplied: boolean;
  reservationType?: ReservationTypeMode | null;
  companyMasterId?: string | null;
  travelAgentMasterId?: string | null;
}): void {
  if (!input.requireGuarantee) return;
  if (!input.guaranteeMethod?.trim()) {
    throw new Error(CREATE_RESERVATION_GUARANTEE_REQUIRED);
  }
  if (!input.commercialBookingSource?.trim() || !input.marketSegment?.trim()) {
    throw new Error(CREATE_RESERVATION_SOURCE_SEGMENT_REQUIRED);
  }
  if (input.reservationType === "corporate" && !input.companyMasterId) {
    throw new Error(CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED);
  }
  if (input.reservationType === "travel_agency" && !input.travelAgentMasterId) {
    throw new Error(CREATE_RESERVATION_CONFIRM_MASTER_REQUIRED);
  }
  if (!input.persistApplied) {
    throw new Error(CREATE_RESERVATION_PERSIST_HELD_COPY);
  }
}

export type CreatedReservationConfirmation = {
  id: string;
  confirmationNumber: string;
  status: CreateReservationStatus;
  guestName: string;
  stayDates: string;
  occupancy: string;
  roomType: string;
  room: string;
  rate: string | null;
  stayTotal: string | null;
  unpriced: boolean;
  guaranteeMethod: string | null;
  paymentTerms: string | null;
  bookingSource: string | null;
  marketSegment: string | null;
  externalReference: string | null;
};
