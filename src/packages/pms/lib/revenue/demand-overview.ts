/**
 * Demand & Forecast Overview (UI-12) display helpers.
 *
 * Live OTB only. Occupancy nights, not rate-plan occupancy.
 * Attention reuses Control Center thresholds. Never High/Low Demand.
 * Recent booking activity is never labeled Pickup.
 */

import {
  REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT,
  REVENUE_CONTROL_LOW_REMAINING_RATIO,
} from "./revenue-control.ts";
import { computeBookedRevenueOverview } from "./revenue-metrics.ts";
import type { DemandDateRow, DemandLimitations, DemandWorkspace } from "./demand.ts";

export const DEMAND_EMPTY_NO_ROOM_TYPES =
  "No room types are configured. Add room types in Property Setup before reviewing demand.";

export const DEMAND_EMPTY_NO_OTB = "No on-the-books reservations for this date range.";

export const DEMAND_UNPRICED_ADR_NOTE =
  "ADR and booked revenue may be understated because some sold nights have no pricing snapshot.";

export const DEMAND_OOO_OOS_NOTE =
  "Future availability may include OOO/OOS rooms. Available nights count active hotel rooms × nights.";

export const DEMAND_RATE_PLAN_FILTER_NOTE =
  "Occupancy stays on room-type inventory. The rate-plan filter applies to booked revenue, ADR, and recent booking activity only.";

export const DEMAND_SNAPSHOT_NOT_STARTED =
  "Pickup history starts after the first completed business-date snapshot.";

export const DEMAND_FORECAST_UNAVAILABLE_TITLE = "Forecast: Not Yet Available";

export const DEMAND_FORECAST_UNAVAILABLE_COPY =
  "A predictive forecast is not configured. This workspace shows live on-the-books demand. Pickup starts after daily snapshots.";

export const DEMAND_RECENT_BOOKING_ACTIVITY_LABEL = "Recent Booking Activity";

export const DEMAND_KPI_OTB_OCCUPANCY = "OTB Occupancy";
export const DEMAND_KPI_BOOKED_NIGHTS = "Booked Room Nights";
export const DEMAND_KPI_REMAINING_NIGHTS = "Remaining Room Nights";
export const DEMAND_KPI_BOOKED_REVENUE = "Booked Room Revenue";
export const DEMAND_KPI_ADR = "ADR";
export const DEMAND_KPI_REVPAR = "RevPAR";
export const DEMAND_KPI_PRICED_SHARE = "Priced Share";

export type DemandAttentionKind =
  | "High Occupancy"
  | "Low Remaining Inventory"
  | "Restriction Active"
  | "Rate Override";

export type DemandAttentionItem = {
  date: string;
  kinds: DemandAttentionKind[];
  occupancyPercent: number;
  roomsOnBooks: number;
  roomsRemaining: number;
  roomsAvailable: number;
  activeRestrictionCount: number;
  rateOverrideCount: number;
};

export type DemandRoomTypeRollup = {
  roomTypeId: string;
  roomTypeName: string;
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  occupancyPercent: number;
  bookedRoomRevenue: number;
  adr: number;
  pricedShare: number;
};

export function dateRestrictionCount(row: DemandDateRow): number {
  return row.roomTypes.reduce((sum, cell) => sum + cell.activeRestrictionCount, 0);
}

export function dateOverrideCount(row: DemandDateRow): number {
  return row.roomTypes.reduce((sum, cell) => sum + cell.rateOverrideCount, 0);
}

export function isHighOccupancy(occupancyPercent: number): boolean {
  return occupancyPercent >= REVENUE_CONTROL_HIGH_OCCUPANCY_PERCENT;
}

export function isLowRemainingInventory(roomsRemaining: number, roomsAvailable: number): boolean {
  if (roomsAvailable <= 0) return true;
  if (roomsRemaining <= 0) return true;
  return roomsRemaining / roomsAvailable <= REVENUE_CONTROL_LOW_REMAINING_RATIO;
}

export function demandAttentionKinds(row: {
  occupancyPercent: number;
  roomsRemaining: number;
  roomsAvailable: number;
  activeRestrictionCount: number;
  rateOverrideCount: number;
}): DemandAttentionKind[] {
  const kinds: DemandAttentionKind[] = [];
  if (isHighOccupancy(row.occupancyPercent)) kinds.push("High Occupancy");
  if (isLowRemainingInventory(row.roomsRemaining, row.roomsAvailable)) kinds.push("Low Remaining Inventory");
  if (row.activeRestrictionCount > 0) kinds.push("Restriction Active");
  if (row.rateOverrideCount > 0) kinds.push("Rate Override");
  return kinds;
}

export function collectDemandAttention(dates: DemandDateRow[]): DemandAttentionItem[] {
  return dates
    .map((row) => {
      const activeRestrictionCount = dateRestrictionCount(row);
      const rateOverrideCount = dateOverrideCount(row);
      return {
        date: row.date,
        kinds: demandAttentionKinds({
          occupancyPercent: row.occupancyPercent,
          roomsRemaining: row.roomsRemaining,
          roomsAvailable: row.roomsAvailable,
          activeRestrictionCount,
          rateOverrideCount,
        }),
        occupancyPercent: row.occupancyPercent,
        roomsOnBooks: row.roomsOnBooks,
        roomsRemaining: row.roomsRemaining,
        roomsAvailable: row.roomsAvailable,
        activeRestrictionCount,
        rateOverrideCount,
      };
    })
    .filter((item) => item.kinds.length > 0);
}

export function rollupDemandRoomTypes(dates: DemandDateRow[]): DemandRoomTypeRollup[] {
  const byType = new Map<
    string,
    {
      roomTypeId: string;
      roomTypeName: string;
      roomsOnBooks: number;
      roomsAvailable: number;
      bookedRoomRevenue: number;
      pricedRooms: number;
      revenueSoldNights: number;
    }
  >();

  for (const date of dates) {
    for (const cell of date.roomTypes) {
      const current = byType.get(cell.roomTypeId) ?? {
        roomTypeId: cell.roomTypeId,
        roomTypeName: cell.roomTypeName,
        roomsOnBooks: 0,
        roomsAvailable: 0,
        bookedRoomRevenue: 0,
        pricedRooms: 0,
        revenueSoldNights: 0,
      };
      current.roomsOnBooks += cell.roomsOnBooks;
      current.roomsAvailable += cell.roomsAvailable;
      current.bookedRoomRevenue += cell.bookedRoomRevenue;
      current.pricedRooms += cell.pricedRooms;
      current.revenueSoldNights += cell.revenueSoldNights;
      byType.set(cell.roomTypeId, current);
    }
  }

  return [...byType.values()]
    .map((row) => {
      const occupancy = computeBookedRevenueOverview({
        soldRoomNights: row.roomsOnBooks,
        availableRoomNights: row.roomsAvailable,
        bookedRoomRevenue: 0,
        pricedNights: 0,
      });
      const revenue = computeBookedRevenueOverview({
        soldRoomNights: row.revenueSoldNights,
        availableRoomNights: row.roomsAvailable,
        bookedRoomRevenue: row.bookedRoomRevenue,
        pricedNights: row.pricedRooms,
      });
      return {
        roomTypeId: row.roomTypeId,
        roomTypeName: row.roomTypeName,
        roomsOnBooks: row.roomsOnBooks,
        roomsAvailable: row.roomsAvailable,
        roomsRemaining: Math.max(0, row.roomsAvailable - row.roomsOnBooks),
        occupancyPercent: occupancy.occupancyPercent,
        bookedRoomRevenue: revenue.roomRevenue,
        adr: revenue.adr,
        pricedShare: revenue.pricedShare,
      };
    })
    .sort(
      (left, right) =>
        right.occupancyPercent - left.occupancyPercent || left.roomTypeName.localeCompare(right.roomTypeName),
    );
}

export function demandSnapshotNote(limitations: DemandLimitations): string {
  if (limitations.snapshotHistoryStartsAt) {
    return `Snapshot history starts at ${limitations.snapshotHistoryStartsAt}.`;
  }
  return DEMAND_SNAPSHOT_NOT_STARTED;
}

export function demandLimitationNotes(workspace: DemandWorkspace): string[] {
  const notes: string[] = [];
  if (workspace.limitations.ratePlanFilterAppliesToRevenueOnly) {
    notes.push(DEMAND_RATE_PLAN_FILTER_NOTE);
  }
  if (
    workspace.summary.roomsOnBooks > 0 &&
    (workspace.summary.pricedShare < 100 || workspace.limitations.unpricedReservationsPresent)
  ) {
    notes.push(DEMAND_UNPRICED_ADR_NOTE);
  }
  if (workspace.limitations.availabilityIncludesFutureOosRisk) {
    notes.push(DEMAND_OOO_OOS_NOTE);
  }
  notes.push(demandSnapshotNote(workspace.limitations));
  if (workspace.rangeClamped) {
    notes.push(`Range limited to 90 days (${workspace.fromDate} – ${workspace.toDate}).`);
  }
  return notes;
}

export function demandHasRoomTypes(workspace: DemandWorkspace): boolean {
  return workspace.dates.some((row) => row.roomTypes.length > 0);
}

export function demandHasOtb(workspace: DemandWorkspace): boolean {
  return workspace.summary.roomsOnBooks > 0;
}

export function demandHasRestrictionAttention(items: DemandAttentionItem[]): boolean {
  return items.some((item) => item.activeRestrictionCount > 0);
}
