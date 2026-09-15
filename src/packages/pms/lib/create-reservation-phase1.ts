/**
 * Create Reservation Phase 1 — Section 1: Context + Guest (Issue #121).
 *
 * Additive expansion of `/restaurant/bookings/new` + `createReservation` →
 * `create_hotel_reservation_priced`. Walk-in stays a mode of the same writer.
 * Guest Waves 1–5 + GE1–GE3 stay closed. No second guest writer.
 *
 * Section 1 is Context + Guest only. It does not claim Phase 1 or Create
 * Reservation DONE. Company/TA master persistence is Section 2. Stay / rate /
 * room / guarantee / packages / send confirmation are later sections.
 *
 * Commercial booking source, market segment, and external reference are
 * collected in the draft. They are distinct from channel-origin
 * `hotel_reservations.source`. Confirm-time required + persistence is Section 7.
 * Migration for this section: NONE.
 */

import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution.ts";

export const CREATE_RESERVATION_SECTION1_ISSUE = 121;
export const CREATE_RESERVATION_PHASE1_COMPLETE = false;
export const CREATE_RESERVATION_MODULE_DONE = false;
export const CREATE_RESERVATION_SECTION1_MIGRATION = "NONE";
export const CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS = 300;

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
] as const;

export const CREATE_RESERVATION_TIP_AC_MAP = {
  "plan-context-ui": ["AC-CR1-1", "AC-CR1-8", "AC-CR1-9", "AC-CR1-10", "AC-CR1-14"],
  "plan-guest-search-create": ["AC-CR1-2", "AC-CR1-3", "AC-CR1-4", "AC-CR1-5", "AC-CR1-6", "AC-CR1-11", "AC-CR1-12", "AC-CR1-13"],
  "plan-gates-honesty": ["AC-CR1-7", "AC-CR1-15", "AC-CR1-16", "AC-CR1-17", "AC-CR1-18", "AC-CR1-19", "AC-CR1-20"],
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
  "Switch reservation type? The selected guest and stay draft stay as they are. Company and travel-agency masters are not saved in this section.";

export const CREATE_RESERVATION_COMPANY_PLACEHOLDER =
  "Company search and master linking arrive in Section 2. This is a placeholder — no company is saved yet.";

export const CREATE_RESERVATION_TA_PLACEHOLDER =
  "Travel-agency search and master linking arrive in Section 2. This is a placeholder — no travel agency is saved yet.";

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

export function isReservationTypeMode(value: string): value is ReservationTypeMode {
  return (RESERVATION_TYPE_MODES as readonly string[]).includes(value);
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
