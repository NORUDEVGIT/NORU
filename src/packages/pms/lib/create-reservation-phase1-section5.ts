/**
 * Create Reservation Phase 1 — Section 5: Rate plan + sticky pricing (Issue #141).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Reuses `quoteStay` / `price_hotel_stay`.
 * Server quote is the sticky source of truth. Browser math is ignored.
 *
 * TIP locked (Rekik APPROVED 2026-09-15):
 * 1. Unpriced = Pending only + owner|manager (align requireRateManager).
 *    Receptionist must pick a quoted plan.
 * 2. quoteStay gate = reservation managers including receptionist.
 *    Unpriced Pending remains manager-only.
 * 3. Block submit when status is confirmed and there is no successful quote.
 * 4. Clear ratePlanId on room-type change and when a stay-date change
 *    invalidates the previous quote.
 * 5. Fixed Rate / create adjustment / RTC = OUT.
 *
 * Guest Waves 1–5 + GE1–GE3 stay closed. Section 5 does not claim Phase 1
 * or Create Reservation DONE. Room assign is Section 6. Confirm chrome is
 * Section 7. Migration for this section: NONE. Capability-only — no RLS
 * model change. Flag Abel: NOT required.
 */

export const CREATE_RESERVATION_SECTION5_ISSUE = 141;
export const CREATE_RESERVATION_SECTION5_MIGRATION = "NONE";

/** Align unpriced Pending with CURRENT requireRateManager (owner | manager). */
export const UNPRICED_PENDING_ROLES = ["owner", "manager"] as const;

export const CREATE_RESERVATION_STALE_RATE_RULE = "clear-on-type-and-invalid-stay";

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA_SECTION5 = [
  "AC-CR5-1",
  "AC-CR5-2",
  "AC-CR5-3",
  "AC-CR5-4",
  "AC-CR5-5",
  "AC-CR5-6",
  "AC-CR5-7",
  "AC-CR5-8",
  "AC-CR5-9",
  "AC-CR5-10",
  "AC-CR5-11",
  "AC-CR5-12",
  "AC-CR5-13",
  "AC-CR5-14",
  "AC-CR5-15",
  "AC-CR5-16",
  "AC-CR5-17",
  "AC-CR5-18",
  "AC-CR5-19",
  "AC-CR5-20",
  "AC-CR5-21",
] as const;

export const CREATE_RESERVATION_SECTION5_TIP_AC_MAP = {
  "plan-list-bind-sticky": ["AC-CR5-1", "AC-CR5-2", "AC-CR5-3", "AC-CR5-4"],
  "plan-unpriced-confirm": ["AC-CR5-5", "AC-CR5-6", "AC-CR5-7"],
  "plan-no-second-writer": ["AC-CR5-8", "AC-CR5-9", "AC-CR5-10", "AC-CR5-11"],
  "plan-revalidate-gates": [
    "AC-CR5-12",
    "AC-CR5-13",
    "AC-CR5-14",
    "AC-CR5-15",
    "AC-CR5-16",
    "AC-CR5-17",
    "AC-CR5-18",
    "AC-CR5-19",
    "AC-CR5-20",
    "AC-CR5-21",
  ],
} as const;

export const CREATE_RESERVATION_SECTION5_SCOPE =
  "Section 5 is Rate + sticky pricing. Specific room, guarantee chrome, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_RATE_NEEDS_CONTEXT = "Pick dates and a room type to see rates.";

export const CREATE_RESERVATION_PRICING_STAY = "Pricing the stay…";

export const CREATE_RESERVATION_RATE_QUOTE_ERROR =
  "Rates could not be loaded for this stay. Try again or pick another room type.";

export const CREATE_RESERVATION_EMPTY_RATE_CATALOGUE =
  "No rate plans for this room type yet.";

export const CREATE_RESERVATION_EMPTY_RATE_MANAGER =
  "No rate plans for this room type yet. You can create a Pending stay without pricing.";

export const CREATE_RESERVATION_EMPTY_RATE_RECEPTIONIST =
  "No rate plans for this room type yet. A quoted rate plan is required to create this stay.";

export const CREATE_RESERVATION_SUMMARY_UNPRICED =
  "This stay is unpriced. No stay total is shown — a server quote is required before a total can appear.";

export const CREATE_RESERVATION_SUMMARY_NEEDS_CONTEXT =
  "Rate and stay total appear after dates and a room type are set.";

export const CREATE_RESERVATION_SUMMARY_LOADING = "Pricing the stay… no total yet.";

export const CREATE_RESERVATION_SUMMARY_QUOTE_ERROR =
  "Stay total is unavailable until rates load.";

export const CREATE_RESERVATION_UNPRICED_BADGE = "Unpriced";

export const CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE =
  "A quoted rate plan is required to create a confirmed stay.";

export const CREATE_RESERVATION_UNPRICED_REQUIRES_MANAGER =
  "A quoted rate plan is required. Unpriced Pending stays are limited to owners and managers.";

export const CREATE_RESERVATION_QUOTE_SERVER_COPY =
  "Pricing is calculated and re-checked on the server when the reservation is created. Browser totals are ignored.";

export const CREATE_RESERVATION_UNPRICED_PERMISSION_DOC =
  "Unpriced create is Pending only and owner|manager only (align requireRateManager). Receptionist must select a quoted plan. Capability-only — no RLS / entitlement model change.";

export const CREATE_RESERVATION_QUOTE_GATE_DOC =
  "quoteStay is gated with requireReservationManager (owner|manager|receptionist) so create UX can quote. Rate admin writers stay requireRateManager. Unpriced Pending stays manager-only.";

export const CREATE_RESERVATION_SECTION5_MIGRATION_REASON =
  "quoteStay, price_hotel_stay, create_hotel_reservation_priced, and rate_plan_id / room_subtotal / nightly_rate_snapshot already exist. Section 5 is Rate UX + capability gates only. No new columns. No SECURITY DEFINER replace. Dual-lane APPLY not required. Flag Abel: NOT required.";

export const CREATE_RESERVATION_SECTION5_LOCKED_NON_GOALS = [
  "Fixed Rate / manual create override",
  "create-time rate adjustment amount/%",
  "RTC",
  "LIVE RMS / OTA / commission / yield engine",
  "second pricing writer",
  "specific room assign expand",
  "Guarantee + Confirm product",
  "packages",
  "email/SMS send confirmation",
  "parent Company Reservation CR-100",
  "new entitlement / RLS architecture",
  "fake sticky totals / browser math as SoT",
] as const;

export type CreateStayQuoteView = {
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  currency: string;
  nights: number;
  subtotal: number;
  nightly: Array<{ date: string; rate: number }>;
};

export type CreateRateQuoteRow = {
  plan: { id: string; code: string; name: string };
  quote: CreateStayQuoteView | null;
  unavailableReason: string | null;
};

export type CreatePricingState =
  | { kind: "needs_context" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "priced"; quote: CreateStayQuoteView }
  | { kind: "unpriced" };

export type CreateReservationStatus = "pending" | "confirmed";

export function canCreateUnpricedPending(role: string): boolean {
  return (UNPRICED_PENDING_ROLES as readonly string[]).includes(role);
}

export function isPricedQuote(row: { quote: CreateStayQuoteView | null } | null | undefined): boolean {
  return row?.quote != null;
}

export function resolveCreatePricingState(input: {
  datesValid: boolean;
  roomTypeId: string;
  loading: boolean;
  error: boolean;
  selectedQuote: { quote: CreateStayQuoteView | null } | null;
}): CreatePricingState {
  if (!input.datesValid || !input.roomTypeId) return { kind: "needs_context" };
  if (input.loading) return { kind: "loading" };
  if (input.error) return { kind: "error" };
  if (input.selectedQuote?.quote) return { kind: "priced", quote: input.selectedQuote.quote };
  return { kind: "unpriced" };
}

export function stickyPricingCopy(state: CreatePricingState): string {
  if (state.kind === "needs_context") return CREATE_RESERVATION_SUMMARY_NEEDS_CONTEXT;
  if (state.kind === "loading") return CREATE_RESERVATION_SUMMARY_LOADING;
  if (state.kind === "error") return CREATE_RESERVATION_SUMMARY_QUOTE_ERROR;
  if (state.kind === "unpriced") return CREATE_RESERVATION_SUMMARY_UNPRICED;
  return "";
}

export function fromNightlyRate(quote: CreateStayQuoteView): number | null {
  if (quote.nightly.length === 0) return null;
  return Math.min(...quote.nightly.map((night) => night.rate));
}

export function rateCatalogueCopy(input: {
  datesValid: boolean;
  roomTypeId: string;
  loading: boolean;
  error: boolean;
  quoteCount: number;
  canCreateUnpriced: boolean;
}): string | null {
  if (!input.datesValid || !input.roomTypeId) return CREATE_RESERVATION_RATE_NEEDS_CONTEXT;
  if (input.loading) return CREATE_RESERVATION_PRICING_STAY;
  if (input.error) return CREATE_RESERVATION_RATE_QUOTE_ERROR;
  if (input.quoteCount === 0) {
    return input.canCreateUnpriced
      ? CREATE_RESERVATION_EMPTY_RATE_MANAGER
      : CREATE_RESERVATION_EMPTY_RATE_RECEPTIONIST;
  }
  return null;
}

export function shouldClearStaleRatePlan(input: {
  ratePlanId: string;
  quotesReady: boolean;
  quotes: Array<{ planId: string; hasQuote: boolean }>;
}): boolean {
  if (!input.ratePlanId) return false;
  if (!input.quotesReady) return false;
  const row = input.quotes.find((quote) => quote.planId === input.ratePlanId);
  return !row?.hasQuote;
}

export function canSubmitCreateReservation(input: {
  hasGuest: boolean;
  datesValid: boolean;
  roomTypeId: string;
  available: number;
  status: CreateReservationStatus;
  priced: boolean;
  canCreateUnpriced: boolean;
}): boolean {
  if (!input.hasGuest || !input.datesValid || !input.roomTypeId || input.available <= 0) {
    return false;
  }
  if (input.priced) return true;
  if (input.status === "confirmed") return false;
  return input.canCreateUnpriced;
}

export function createSubmitBlockCopy(input: {
  hasGuest: boolean;
  datesValid: boolean;
  roomTypeId: string;
  available: number;
  status: CreateReservationStatus;
  priced: boolean;
  canCreateUnpriced: boolean;
}): string | null {
  if (canSubmitCreateReservation(input)) return null;
  if (!input.hasGuest || !input.datesValid || !input.roomTypeId || input.available <= 0) {
    return "Pick a guest, valid dates and an available room type to continue.";
  }
  if (input.status === "confirmed") return CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE;
  return CREATE_RESERVATION_UNPRICED_REQUIRES_MANAGER;
}

export function assertCreateReservationPricing(input: {
  role: string;
  status: CreateReservationStatus;
  ratePlanId: string | null;
}): void {
  if (input.ratePlanId) return;
  if (input.status === "confirmed") {
    throw new Error(CREATE_RESERVATION_CONFIRMED_REQUIRES_RATE);
  }
  if (!canCreateUnpricedPending(input.role)) {
    throw new Error(CREATE_RESERVATION_UNPRICED_REQUIRES_MANAGER);
  }
}
