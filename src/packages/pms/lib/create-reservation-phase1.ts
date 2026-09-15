/**
 * Create Reservation Phase 1 — Section 1 Context + Guest (Issue #121),
 * Section 2 Company / Travel Agency on create (Issue #127),
 * Individual Associations amend (Issue #138 / AC-CR2A),
 * Section 3 Stay (Issue #129), and
 * Section 5 Rate + sticky pricing (Issue #141).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Walk-in stays a mode of the same writer.
 * Guest Waves 1–5 + GE1–GE3 stay closed. No second guest writer.
 * No second guest / Company / TA writer. No second Stay writer.
 *
 * Section 1 is Context + Guest. Section 2 binds Company or TA masters on create
 * (AC-W4-5 for create). AC-CR2A always shows optional Company + TA on Individual
 * and lifts dual-bind XOR so both can persist together. Section 3 upgrades Stay
 * UX (linked dates/nights, occupancy soft-warn, notes, sticky honesty).
 * Section 5 (Issue #141) owns Rate + sticky pricing on the same writer.
 * None of these sections claim Phase 1 or Create Reservation DONE.
 * Room assign is Section 6. Guarantee + confirm is Section 7. Packages remain later.
 * Issue #127 stays CLOSED — AC-CR2-1…18 stand as prior lock.
 * Programme rule (Rekik / Docs 2026-09-15): take efficient Individual
 * Associations function (optional Company + TA, prefill, persist); modernize
 * on NORU Doc2 patterns (own box, sticky summary, existing drawers). Do not
 * clone legacy PMS chrome. Corporate and Group stay later separate products.
 *
 * Commercial booking source, market segment, and external reference are
 * collected in the draft. They are distinct from channel-origin
 * `hotel_reservations.source`. Confirm-time required + persistence is Section 7.
 * Section 1 migration: NONE. Migration for this section: NONE.
 * Section 2 migration: RPC signature only (columns already exist). Dual-lane APPLY HELD.
 * Section 2A migration: 0060 RPC body (lift DUAL_COMPANY_TA_NOT_ALLOWED). APPLY HELD.
 * Section 3 migration: NONE — stay fields already on the create RPC.
 */

import { addDays, nightsBetween } from "../../../shared/lib/property-dates.ts";
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution.ts";

export const CREATE_RESERVATION_SECTION1_ISSUE = 121;
export const CREATE_RESERVATION_SECTION2_ISSUE = 127;
/** AC-CR2A amend. Does not reopen #127. */
export const CREATE_RESERVATION_SECTION2A_ISSUE = 138;
export const CREATE_RESERVATION_SECTION2A_PRIOR_ISSUE = 127;
export const CREATE_RESERVATION_SECTION3_ISSUE = 129;
export const CREATE_RESERVATION_PHASE1_COMPLETE = false;
export const CREATE_RESERVATION_MODULE_DONE = false;
export const CREATE_RESERVATION_SECTION1_MIGRATION = "NONE";
export const CREATE_RESERVATION_SECTION2_MIGRATION = "0059_pms_create_reservation_company_ta.sql";
export const CREATE_RESERVATION_SECTION2_APPLY = "HELD";
export const CREATE_RESERVATION_SECTION2A_MIGRATION = "0060_pms_create_reservation_individual_associations.sql";
export const CREATE_RESERVATION_SECTION2A_APPLY = "HELD";
export const CREATE_RESERVATION_SECTION3_MIGRATION = "NONE";
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

export const CREATE_RESERVATION_SECTION2A_ACCEPTANCE_CRITERIA = [
  "AC-CR2A-1",
  "AC-CR2A-2",
  "AC-CR2A-3",
  "AC-CR2A-4",
  "AC-CR2A-5",
  "AC-CR2A-6",
  "AC-CR2A-7",
  "AC-CR2A-8",
  "AC-CR2A-9",
  "AC-CR2A-10",
  "AC-CR2A-11",
  "AC-CR2A-12",
  "AC-CR2A-13",
  "AC-CR2A-14",
  "AC-CR2A-15",
] as const;

export const CREATE_RESERVATION_SECTION2A_TIP_AC_MAP = {
  "plan-associations-ui": ["AC-CR2A-1", "AC-CR2A-2", "AC-CR2A-3", "AC-CR2A-7", "AC-CR2A-9"],
  "plan-prefill-persist-dualbind": ["AC-CR2A-4", "AC-CR2A-5", "AC-CR2A-6", "AC-CR2A-13"],
  "plan-gates-honesty": ["AC-CR2A-8", "AC-CR2A-10", "AC-CR2A-11", "AC-CR2A-12", "AC-CR2A-14", "AC-CR2A-15"],
} as const;

export const CREATE_RESERVATION_SECTION3_ACCEPTANCE_CRITERIA = [
  "AC-CR3-1",
  "AC-CR3-2",
  "AC-CR3-3",
  "AC-CR3-4",
  "AC-CR3-5",
  "AC-CR3-6",
  "AC-CR3-7",
  "AC-CR3-8",
  "AC-CR3-9",
  "AC-CR3-10",
  "AC-CR3-11",
  "AC-CR3-12",
  "AC-CR3-13",
  "AC-CR3-14",
  "AC-CR3-15",
  "AC-CR3-16",
] as const;

export const CREATE_RESERVATION_SECTION3_TIP_AC_MAP = {
  "plan-arrival-linked-invalid": ["AC-CR3-1", "AC-CR3-2", "AC-CR3-3"],
  "plan-occupancy-notes": ["AC-CR3-4", "AC-CR3-5", "AC-CR3-6"],
  "plan-sticky-writer-gates": ["AC-CR3-7", "AC-CR3-8", "AC-CR3-9"],
  "plan-honesty-helpers": ["AC-CR3-10", "AC-CR3-11", "AC-CR3-12", "AC-CR3-13", "AC-CR3-14", "AC-CR3-15", "AC-CR3-16"],
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
  "Staff override wins over guest-link prefill. Company and Travel Agency override independently. Changing the guest keeps a staff-chosen Company or Travel Agency.";

export const CREATE_RESERVATION_SECTION2_SCOPE =
  "Section 2 collects Company or Travel Agency on create. Stay, rate, room, guarantee, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_SECTION2A_SCOPE =
  "On Individual, Associations always shows optional Company and Travel Agency. Neither is required. Stay, rate, room, guarantee, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_ASSOCIATIONS_COPY =
  "Optional Company and Travel Agency for this stay. Neither is required to create.";

export const CREATE_RESERVATION_SECTION2A_PROGRAMME_RULE =
  "Include efficient functionality from the reference Individual create screen (optional Company + TA, prefill, persist). Modernize UI on NORU patterns: Associations as its own box in the Doc2 shell with sticky summary and existing drawers. Do not clone legacy PMS chrome. Placement may sit beside Guest. Corporate and Group remain later separate products. Do not invent Group block, Contact/Member, RTC, rate-adjustment engines, or LIVE OTA.";

export const CREATE_RESERVATION_SECTION3_SCOPE =
  "Section 3 upgrades Stay UX (linked dates and nights, occupancy, notes). Rate, availability invent, room assign, guarantee, packages, and send confirmation remain later sections.";

export const CREATE_RESERVATION_SECTION3_MIGRATION_REASON =
  "Stay fields arrival, departure, adults, children, special_requests, and notes are already on create_hotel_reservation_priced and hotel_reservations. Section 3 is Stay UX only. No new columns. No RPC replace. Dual-lane APPLY not required. Flag Abel: NOT required.";

/** Arrival change rule (Eng pick, documented): keep nights, move departure. */
export const CREATE_RESERVATION_ARRIVAL_CHANGE_RULE = "keep_nights" as const;
export const CREATE_RESERVATION_ARRIVAL_CHANGE_RULE_COPY =
  "Changing arrival keeps the current nights and moves departure (addDays(arrival, nights)).";

export const CREATE_RESERVATION_MIN_NIGHTS = 1;

export const CREATE_RESERVATION_STAY_INVALID_RANGE = "Departure must be after arrival.";

export const CREATE_RESERVATION_OCCUPANCY_SOFT_WARN =
  "This occupancy is above the selected room type's capacity. You can still continue — availability invent stays with a later section.";

export const CREATE_RESERVATION_SECTION3_LOCKED_NON_GOALS = [
  "rate binding",
  "availability invent",
  "room assign product",
  "guarantee + confirm product",
  "packages",
  "LIVE OTA",
  "CR-100",
  "create-time cashiering deposit",
  "email/SMS send confirmation",
  "offline / local-first",
  "new entitlement / RLS architecture",
  "new reservation status model",
] as const;

export const CREATE_RESERVATION_SECTION2_MIGRATION_REASON =
  "hotel_reservations.company_master_id and travel_agent_master_id already exist (Wave 4 / 0053). Section 2 replaces create_hotel_reservation and create_hotel_reservation_priced with optional master-id params so create can bind atomically. Dual-lane APPLY HELD. No new columns. No RLS model change.";

export const CREATE_RESERVATION_SECTION2A_MIGRATION_REASON =
  "No new columns. 0060 replaces SECURITY DEFINER create_hotel_reservation to lift DUAL_COMPANY_TA_NOT_ALLOWED so Individual can persist Company and Travel Agency together. Signature unchanged (0059 params). Dual-lane APPLY HELD. Do not apply non-prod or prod from this agent. Requires 0059 first. Prod 0059 remains Abel-gated residual. Flag Abel: NOT required (RLS model unchanged).";

export const CREATE_RESERVATION_SECTION2A_LOCKED_NON_GOALS = [
  "group block / allotment / rooming list",
  "parent Company Reservation CR-100",
  "Contact / Member invent",
  "RTC invent",
  "rate-adjustment engines",
  "Corporate as separate product",
  "Group as separate product",
  "reopen issue 127",
  "Phase 1 COMPLETE",
  "Create Reservation DONE",
  "reopen Guest GE1-GE3",
  "credit approval engine",
  "LIVE OTA connector",
  "email/SMS send confirmation",
  "new entitlement / RLS architecture",
  "clone legacy PMS chrome",
] as const;

export const CREATE_RESERVATION_BOOKING_AGENT_COPY =
  "Defaults to the signed-in staff member. The writer records that user — a different booking agent is not offered here.";

export const CREATE_RESERVATION_SECTION1_SCOPE =
  "Section 1 is Context + Guest only. Stay, rate, room, guarantee, packages, and send confirmation are later sections.";

/** Replaced by Section 5 honest unpriced sticky. Kept as an alias so older locks still resolve. */
export const CREATE_RESERVATION_SUMMARY_NO_TOTAL =
  "This stay is unpriced. No stay total is shown — a server quote is required before a total can appear.";

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
  return { companyMasterId, travelAgentMasterId };
}

export function createReservationPrefillRoles(
  mode: ReservationTypeMode,
): Array<"employer" | "booker_ta"> {
  if (mode === "corporate") return ["employer"];
  if (mode === "travel_agency") return ["booker_ta"];
  return ["employer", "booker_ta"];
}

export function typeSwitchDiscardsMaster(
  from: ReservationTypeMode,
  companyMasterId: string | null,
  travelAgentMasterId: string | null,
): boolean {
  if (from === "corporate") return companyMasterId != null;
  if (from === "travel_agency") return travelAgentMasterId != null;
  return companyMasterId != null || travelAgentMasterId != null;
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

export function clampStayNights(nights: number): number {
  if (!Number.isFinite(nights)) return CREATE_RESERVATION_MIN_NIGHTS;
  return Math.max(CREATE_RESERVATION_MIN_NIGHTS, Math.floor(nights));
}

export function isStayRangeValid(arrival: string, departure: string): boolean {
  if (!arrival || !departure) return false;
  return departure > arrival && nightsBetween(arrival, departure) >= CREATE_RESERVATION_MIN_NIGHTS;
}

/** Arrival change: keep nights, move departure. */
export function linkedStayFromArrival(
  arrival: string,
  nights: number,
): { arrival: string; departure: string; nights: number } {
  const kept = clampStayNights(nights);
  return { arrival, departure: addDays(arrival, kept), nights: kept };
}

/** Nights change: update departure from arrival. */
export function linkedStayFromNights(
  arrival: string,
  nights: number,
): { arrival: string; departure: string; nights: number } {
  const kept = clampStayNights(nights);
  return { arrival, departure: addDays(arrival, kept), nights: kept };
}

/** Departure change: nights follow nightsBetween. Pair may be invalid (blocked in UI). */
export function linkedStayFromDeparture(
  arrival: string,
  departure: string,
): { arrival: string; departure: string; nights: number; valid: boolean } {
  return {
    arrival,
    departure,
    nights: nightsBetween(arrival, departure),
    valid: isStayRangeValid(arrival, departure),
  };
}

export function formatStayOccupancySummary(adults: number, children: number): string {
  const adultLabel = adults === 1 ? "1 adult" : `${adults} adults`;
  const childLabel = children === 1 ? "1 child" : `${children} children`;
  return `${adultLabel}, ${childLabel}`;
}

export type StayOccupancyCapacity = {
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
};

export type OccupancyCapacityIssue = "maxOccupancy" | "adultCapacity" | "childCapacity";

export function occupancyCapacityIssues(
  adults: number,
  children: number,
  capacity: StayOccupancyCapacity | null | undefined,
): OccupancyCapacityIssue[] {
  if (!capacity) return [];
  const issues: OccupancyCapacityIssue[] = [];
  const total = Math.max(0, adults) + Math.max(0, children);
  if (Number.isFinite(capacity.maxOccupancy) && capacity.maxOccupancy > 0 && total > capacity.maxOccupancy) {
    issues.push("maxOccupancy");
  }
  if (Number.isFinite(capacity.adultCapacity) && capacity.adultCapacity > 0 && adults > capacity.adultCapacity) {
    issues.push("adultCapacity");
  }
  if (Number.isFinite(capacity.childCapacity) && children > capacity.childCapacity) {
    issues.push("childCapacity");
  }
  return issues;
}

/** Soft-warn only. Does not block create — hard invent is Section 4. */
export function occupancyCapacitySoftWarn(
  adults: number,
  children: number,
  capacity: StayOccupancyCapacity | null | undefined,
): string | null {
  const issues = occupancyCapacityIssues(adults, children, capacity);
  if (!capacity || issues.length === 0) return null;
  const parts: string[] = [];
  const total = Math.max(0, adults) + Math.max(0, children);
  if (issues.includes("maxOccupancy")) {
    parts.push(`${total} guests vs sleeps ${capacity.maxOccupancy}`);
  }
  if (issues.includes("adultCapacity")) {
    parts.push(`${adults} adults vs adult capacity ${capacity.adultCapacity}`);
  }
  if (issues.includes("childCapacity")) {
    parts.push(`${children} children vs child capacity ${capacity.childCapacity}`);
  }
  return `${CREATE_RESERVATION_OCCUPANCY_SOFT_WARN} (${parts.join("; ")}).`;
}
