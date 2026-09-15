/**
 * Create Reservation Phase 1 — Section 1 Context + Guest (Issue #121) and
 * Section 2 Company / Travel Agency on create (Issue #127).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Walk-in stays a mode of the same writer.
 * Guest Waves 1–5 + GE1–GE3 stay closed. No second guest writer.
 * No second guest / Company / TA writer.
 *
 * Section 1 is Context + Guest. Section 2 binds Company or TA masters on create
 * (AC-W4-5 for create). Neither section claims Phase 1 or Create Reservation
 * DONE. Stay / rate / room / guarantee / packages / send confirmation are later
 * sections.
 *
 * Commercial booking source, market segment, and external reference are
 * collected in the draft. They are distinct from channel-origin
 * `hotel_reservations.source`. Confirm-time required + persistence is Section 7.
 * Section 1 migration: NONE. Migration for this section: NONE.
 * Section 2 migration: RPC signature only (columns already exist). Dual-lane APPLY HELD.
 */

import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution.ts";

export const CREATE_RESERVATION_SECTION1_ISSUE = 121;
export const CREATE_RESERVATION_SECTION2_ISSUE = 127;
export const CREATE_RESERVATION_PHASE1_COMPLETE = false;
export const CREATE_RESERVATION_MODULE_DONE = false;
export const CREATE_RESERVATION_SECTION1_MIGRATION = "NONE";
export const CREATE_RESERVATION_SECTION2_MIGRATION = "0059_pms_create_reservation_company_ta.sql";
export const CREATE_RESERVATION_SECTION2_APPLY = "HELD";
export const CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS = 300;
/** AC-CR1-21 — collapse the existing RestaurantShell rail on this route only. */
export const CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED = true;

export const CREATE_RESERVATION_ACCEPTANCE_CRITERIA = [
  "AC-CR1-1",
  "AC-CR1-2",
  "AC-CR1-3",
  "AC-CR1-4",
  "AC-CR1-5",
  "AC-CR1-6",
  "AC-CR1-7",
  "AC-CR1-8",
  "AC-CR1-9",
  "AC-CR1-10",
  "AC-CR1-11",
  "AC-CR1-12",
  "AC-CR1-13",
  "AC-CR1-14",
  "AC-CR1-15",
  "AC-CR1-16",
  "AC-CR1-17",
  "AC-CR1-18",
  "AC-CR1-19",
  "AC-CR1-20",
  "AC-CR1-21",
] as const;

export const CREATE_RESERVATION_SECTION2_ACCEPTANCE_CRITERIA = [
  "AC-CR2-1",
  "AC-CR2-2",
  "AC-CR2-3",
  "AC-CR2-4",
  "AC-CR2-5",
  "AC-CR2-6",
  "AC-CR2-7",
  "AC-CR2-8",
  "AC-CR2-9",
  "AC-CR2-10",
  "AC-CR2-11",
  "AC-CR2-12",
  "AC-CR2-13",
  "AC-CR2-14",
  "AC-CR2-15",
  "AC-CR2-16",
  "AC-CR2-17",
  "AC-CR2-18",
] as const;

export const CREATE_RESERVATION_TIP_AC_MAP = {
  "plan-context-ui": ["AC-CR1-1", "AC-CR1-8", "AC-CR1-9", "AC-CR1-10", "AC-CR1-14"],
  "plan-guest-search-create": ["AC-CR1-2", "AC-CR1-3", "AC-CR1-4", "AC-CR1-5", "AC-CR1-6", "AC-CR1-11", "AC-CR1-12", "AC-CR1-13"],
  "plan-gates-honesty": ["AC-CR1-7", "AC-CR1-15", "AC-CR1-16", "AC-CR1-17", "AC-CR1-18", "AC-CR1-19", "AC-CR1-20"],
  "plan-sidebar-collapse": ["AC-CR1-21"],
} as const;

export const CREATE_RESERVATION_SECTION2_TIP_AC_MAP = {
  "plan-pickers": ["AC-CR2-1", "AC-CR2-2", "AC-CR2-3"],
  "plan-bind-w4-5": ["AC-CR2-4", "AC-CR2-7"],
  "plan-inline-prefill-terms": ["AC-CR2-5", "AC-CR2-6", "AC-CR2-8"],
  "plan-gates-honesty": ["AC-CR2-9", "AC-CR2-10", "AC-CR2-11", "AC-CR2-12", "AC-CR2-13", "AC-CR2-14", "AC-CR2-15", "AC-CR2-16", "AC-CR2-17", "AC-CR2-18"],
} as const;

export const RESERVATION_TYPE_MODES = ["individual", "corporate", "travel_agency"] as const;
export type ReservationTypeMode = (typeof RESERVATION_TYPE_MODES)[number];

export const RESERVATION_TYPE_LABELS: Record<ReservationTypeMode, string> = {
  individual: "Individual",
  corporate: "Corporate",
  travel_agency: "Travel Agency",
};

export const DEFAULT_BOOKING_SOURCES = [
  { value: "phone", label: "Phone" },
  { value: "walk_in", label: "Walk-in" },
  { value: "email", label: "Email" },
  { value: "direct", label: "Direct" },
  { value: "corporate", label: "Corporate" },
  { value: "travel_agency", label: "Travel agency" },
  { value: "other", label: "Other" },
] as const;

export const DEFAULT_MARKET_SEGMENTS = [
  { value: "leisure", label: "Leisure" },
  { value: "corporate", label: "Corporate" },
  { value: "government", label: "Government" },
  { value: "complimentary_house", label: "Complimentary / house" },
  { value: "other", label: "Other" },
] as const;

export type ContextPickOption = {
  value: string;
  label: string;
  origin: "set6" | "default";
};

export const CREATE_RESERVATION_SOURCE_HONESTY =
  "Commercial booking source — not the reservation channel origin (staff / walk-in / direct / future online). Not a LIVE OTA connector.";

export const CREATE_RESERVATION_SEGMENT_HONESTY =
  "Market segment is a staff label for later Confirm. It is not a rate engine.";

export const CREATE_RESERVATION_CONFIRM_REQUIRED_COPY =
  "Required when you confirm (Section 7). Collected now — this section does not block create on it.";

export const CREATE_RESERVATION_TYPE_CHANGE_WARN =
  "Switch reservation type? The selected guest and stay draft stay as they are. A selected Company or Travel Agency will be cleared — it is not kept on a type that hides that picker.";

export const CREATE_RESERVATION_MASTER_CONFIRM_COPY =
  "Required when you confirm (Section 7). Collected now — this section does not hard-block create on it.";

export const CREATE_RESERVATION_PAYMENT_TERMS_COPY =
  "Payment terms from the selected master. Reference for later Confirm (Section 7) — not a credit engine.";

export const CREATE_RESERVATION_MASTER_OVERRIDE_RULE =
  "Staff override wins over guest-link prefill. Changing the guest keeps a staff-chosen Company or Travel Agency.";

export const CREATE_RESERVATION_SECTION2_SCOPE =
  "Section 2 collects Company or Travel Agency on create. Stay, rate, room, guarantee, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_SECTION2_MIGRATION_REASON =
  "hotel_reservations.company_master_id and travel_agent_master_id already exist (Wave 4 / 0053). Section 2 replaces create_hotel_reservation and create_hotel_reservation_priced with optional master-id params so create can bind atomically. Dual-lane APPLY HELD. No new columns. No RLS model change.";

export const CREATE_RESERVATION_BOOKING_AGENT_COPY =
  "Defaults to the signed-in staff member. The writer records that user — a different booking agent is not offered here.";

export const CREATE_RESERVATION_SECTION1_SCOPE =
  "Section 1 is Context + Guest only. Stay, rate, room, guarantee, packages, and send confirmation are later sections.";

export const CREATE_RESERVATION_SUMMARY_NO_TOTAL =
  "No stay total is shown here. Rate and pricing belong to a later section.";

export const CREATE_RESERVATION_MIGRATION_REASON =
  "Section 1 collects commercial source, segment, and external reference in the draft only. hotel_reservations.source remains channel origin. Confirm-time persistence is Section 7. No additive columns in this section.";

export const CREATE_RESERVATION_DENIED_COPY =
  "Owners, managers, and receptionists can create reservations for this property.";

export const CREATE_RESERVATION_LOCKED_NON_GOALS = [
  "LIVE OTA connector",
  "rate engine",
  "commission settlement",
  "create-time cashiering deposit",
  "email/SMS send confirmation",
  "offline / local-first",
  "group block / allotment / rooming list",
  "parent Company Reservation CR-100",
  "credit approval engine",
  "fake packages",
  "hard blacklist block",
  "new entitlement / RLS architecture",
] as const;

export type PickedReservationMaster = {
  id: string;
  name: string;
  code: string | null;
  paymentTerms: string | null;
};

export type CreateReservationMasterKind = "company" | "travel_agent";

export function isReservationTypeMode(value: string): value is ReservationTypeMode {
  return (RESERVATION_TYPE_MODES as readonly string[]).includes(value);
}

export function toPickedReservationMaster(account: {
  id: string;
  name: string;
  code: string | null;
  paymentTerms?: string | null;
}): PickedReservationMaster {
  return {
    id: account.id,
    name: account.name,
    code: account.code,
    paymentTerms: account.paymentTerms ?? null,
  };
}

/** Most recent matching link wins; masterId breaks remaining ties. */
export function pickPrefillMasterId(
  links: Array<{ role: string; masterId: string; createdAt: string; masterType?: string }>,
  role: "employer" | "booker_ta",
): string | null {
  const expectedType = role === "employer" ? "company" : "travel_agent";
  const matches = links
    .filter((link) => link.role === role && (link.masterType == null || link.masterType === expectedType))
    .slice()
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.masterId.localeCompare(b.masterId);
    });
  return matches[0]?.masterId ?? null;
}

export function mastersForCreateMode(
  mode: ReservationTypeMode,
  companyMasterId: string | null,
  travelAgentMasterId: string | null,
): { companyMasterId: string | null; travelAgentMasterId: string | null } {
  if (mode === "corporate") {
    return { companyMasterId, travelAgentMasterId: null };
  }
  if (mode === "travel_agency") {
    return { companyMasterId: null, travelAgentMasterId };
  }
  return { companyMasterId: null, travelAgentMasterId: null };
}

export function typeSwitchDiscardsMaster(
  from: ReservationTypeMode,
  companyMasterId: string | null,
  travelAgentMasterId: string | null,
): boolean {
  if (from === "corporate") return companyMasterId != null;
  if (from === "travel_agency") return travelAgentMasterId != null;
  return false;
}

export function activeSet6Options(rows: PmsSet6CatalogueItem[] | null | undefined): ContextPickOption[] {
  return (rows ?? [])
    .filter((row) => row.active)
    .map((row) => ({ value: row.id, label: row.name, origin: "set6" as const }));
}

export function resolveBookingSourceOptions(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ContextPickOption[] {
  const active = activeSet6Options(rows);
  if (active.length > 0) return active;
  return DEFAULT_BOOKING_SOURCES.map((row) => ({
    value: row.value,
    label: row.label,
    origin: "default" as const,
  }));
}

export function resolveMarketSegmentOptions(
  rows: PmsSet6CatalogueItem[] | null | undefined,
): ContextPickOption[] {
  const active = activeSet6Options(rows);
  if (active.length > 0) return active;
  return DEFAULT_MARKET_SEGMENTS.map((row) => ({
    value: row.value,
    label: row.label,
    origin: "default" as const,
  }));
}
