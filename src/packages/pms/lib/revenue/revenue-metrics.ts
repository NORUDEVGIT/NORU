/**
 * Rate & Revenue metric semantics (Phase 1 Prompt 5).
 *
 * Centralizes CURRENT getRevenueOverview formulas. Does not invent posted,
 * collected, forecast, or net calculations.
 */

export const REVENUE_METRIC_CLASSES = ["booked", "posted", "collected", "forecast", "net"] as const;
export type RevenueMetricClass = (typeof REVENUE_METRIC_CLASSES)[number];

export const REVENUE_METRIC_CLASS_NOTES: Record<RevenueMetricClass, string> = {
  booked: "Reservation pricing snapshots / on-the-books reservations.",
  posted: "Cashiering / folio transactions. Not calculated by Rate & Revenue today.",
  collected: "Payments actually received. Not calculated by Rate & Revenue today.",
  forecast: "Decision-support estimate. No forecast schema in Phase 1.",
  net: "Only when explicitly calculated after applicable deductions. Not used today.",
};

export type RevenueMetricKey =
  | "occupancy"
  | "adr"
  | "revpar"
  | "booked-room-revenue"
  | "sold-room-nights"
  | "available-room-nights"
  | "priced-share";

export type RevenueMetricDefinition = {
  key: RevenueMetricKey;
  label: string;
  description: string;
  source: string;
  category: "booked" | "inventory" | "pricing";
  overviewField: keyof BookedRevenueOverviewMetrics;
  formula: string;
};

export type BookedRevenueOverviewInput = {
  soldRoomNights: number;
  availableRoomNights: number;
  bookedRoomRevenue: number;
  pricedNights: number;
};

export type BookedRevenueOverviewMetrics = {
  availableRoomNights: number;
  soldRoomNights: number;
  roomRevenue: number;
  occupancyPercent: number;
  adr: number;
  revPar: number;
  pricedShare: number;
};

export const REVENUE_METRIC_KNOWN_GAPS = [
  "Available room nights currently count active hotel_rooms × days and may include OOO/OOS rooms.",
  "ADR divides booked snapshot revenue by all sold nights, so unpriced sold nights understate ADR.",
  "Control Center KPI dates are a local last-30-days picker, not Night Audit business-date vs calendar-range.",
  "Room revenue is booked snapshot revenue, not posted Cashiering or collected payments.",
] as const;

export const REVENUE_METRIC_DEFINITIONS: RevenueMetricDefinition[] = [
  {
    key: "occupancy",
    label: "Occupancy",
    description: "Sold room nights divided by available room nights.",
    source: "getRevenueOverview — eligible reservation nights / active rooms × days",
    category: "inventory",
    overviewField: "occupancyPercent",
    formula: "soldRoomNights / availableRoomNights",
  },
  {
    key: "adr",
    label: "ADR",
    description: "Booked snapshot room revenue divided by sold room nights.",
    source: "getRevenueOverview — nightly_rate_snapshot sums / sold nights",
    category: "booked",
    overviewField: "adr",
    formula: "bookedRoomRevenue / soldRoomNights",
  },
  {
    key: "revpar",
    label: "RevPAR",
    description: "Booked snapshot room revenue divided by available room nights.",
    source: "getRevenueOverview — nightly_rate_snapshot sums / available nights",
    category: "booked",
    overviewField: "revPar",
    formula: "bookedRoomRevenue / availableRoomNights",
  },
  {
    key: "booked-room-revenue",
    label: "Booked Room Revenue",
    description: "Reservation pricing snapshot revenue for confirmed, in-house and checked-out stays.",
    source: "hotel_reservations.nightly_rate_snapshot — not folio/posted Cashiering",
    category: "booked",
    overviewField: "roomRevenue",
    formula: "sum(snapshot nightly rates in range)",
  },
  {
    key: "sold-room-nights",
    label: "Sold Room Nights",
    description: "Eligible reservation nights overlapping the range (confirmed, checked_in, checked_out).",
    source: "getRevenueOverview — hotel_reservations stay overlap",
    category: "inventory",
    overviewField: "soldRoomNights",
    formula: "eligible reservation nights in range",
  },
  {
    key: "available-room-nights",
    label: "Available Room Nights",
    description: "Current getRevenueOverview inventory base: active rooms × days in range.",
    source: "getRevenueOverview — hotel_rooms.active × day count",
    category: "inventory",
    overviewField: "availableRoomNights",
    formula: "activeRooms * days",
  },
  {
    key: "priced-share",
    label: "Priced Share",
    description: "Share of sold nights that carry a pricing snapshot.",
    source: "getRevenueOverview — priced nights / sold nights",
    category: "pricing",
    overviewField: "pricedShare",
    formula: "pricedNights / soldRoomNights",
  },
];

export function revenueMetricDefinition(key: RevenueMetricKey): RevenueMetricDefinition {
  return REVENUE_METRIC_DEFINITIONS.find((row) => row.key === key)!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Exact CURRENT getRevenueOverview arithmetic. Do not change rounding here. */
export function computeBookedRevenueOverview(
  input: BookedRevenueOverviewInput,
): BookedRevenueOverviewMetrics {
  const { soldRoomNights, availableRoomNights, bookedRoomRevenue, pricedNights } = input;
  return {
    availableRoomNights,
    soldRoomNights,
    roomRevenue: round2(bookedRoomRevenue),
    occupancyPercent:
      availableRoomNights > 0 ? round2((soldRoomNights / availableRoomNights) * 100) : 0,
    adr: soldRoomNights > 0 ? round2(bookedRoomRevenue / soldRoomNights) : 0,
    revPar: availableRoomNights > 0 ? round2(bookedRoomRevenue / availableRoomNights) : 0,
    pricedShare: soldRoomNights > 0 ? round2((pricedNights / soldRoomNights) * 100) : 0,
  };
}
