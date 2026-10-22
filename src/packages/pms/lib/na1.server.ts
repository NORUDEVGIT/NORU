/**
 * NA-1 — Live blocker evaluation (server-only).
 *
 * Arrival, overstay, and drawer counts are read here. Room-unit, housekeeping,
 * and settlement blockers come from the same evaluateAudit exceptions the close
 * path persists, so the board and the close gate share one count.
 */
import type { ExceptionStayLike } from "./fo-exceptions.ts";
import { selectAll } from "./night-audit-read.ts";
import {
  buildNa1Blockers,
  emptyIntegrityCounts,
  type NaBlockerRow,
  type NaFolioLane,
  type NaIntegrityCounts,
} from "./na1.ts";

function toStay(
  row: {
    id: string;
    confirmation_number: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    room_id: string | null;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
    hotel_rooms: { room_number: string } | null;
  },
  businessDate: string,
): ExceptionStayLike {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestName:
      [row.guest_profiles?.first_name, row.guest_profiles?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Guest",
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    status: row.status,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
  };
}

export type Na1FeedCounts = {
  settlementBlockers: number;
  occupiedRestricted: number;
  occupiedDiscrepancies: number;
};

/** Evaluate the close board. Integrity and settlement counts come from evaluateAudit. */
export async function evaluateNa1Blockers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  businessDate: string,
  folioLane: NaFolioLane,
  integrity: NaIntegrityCounts = emptyIntegrityCounts(),
  feeds: Na1FeedCounts = {
    settlementBlockers: 0,
    occupiedRestricted: 0,
    occupiedDiscrepancies: 0,
  },
): Promise<NaBlockerRow[]> {
  type StayRow = {
    id: string;
    confirmation_number: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    room_id: string | null;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
    hotel_rooms: { room_number: string } | null;
  };
  const reservationRows = await selectAll<StayRow>((from, to) =>
    admin
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, status, arrival_date, departure_date, room_id, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
      )
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "confirmed", "checked_in"])
      .order("id", { ascending: true })
      .range(from, to),
  );
  const reservations = reservationRows.map((row) => toStay(row, businessDate));
  const arrivalsPendingCount = reservations.filter(
    (stay) =>
      (stay.status === "pending" || stay.status === "confirmed") &&
      stay.arrivalDate <= businessDate,
  ).length;
  const overstayCount = reservations.filter((stay) => stay.overstay).length;

  const drawerResult = await admin.rpc("list_hotel_drawers", { _restaurant_id: restaurantId });
  if (drawerResult.error) throw new Error(drawerResult.error.message);
  const shifts = (Array.isArray(drawerResult.data) ? drawerResult.data : []) as Array<{
    id: string;
    status: string;
  }>;

  return buildNa1Blockers({
    businessDate,
    arrivalsPendingCount,
    overstayCount,
    unpaidFolios: {
      lane: folioLane,
      count: folioLane === "live" ? feeds.settlementBlockers : 0,
    },
    openShift: {
      tillUsed: shifts.length > 0,
      openCount: shifts.filter((shift) => shift.status === "open").length,
    },
    hkConflict: {
      discrepancyLane: "live",
      discrepancyCount: feeds.occupiedDiscrepancies,
      roomUnavailableCount: feeds.occupiedRestricted,
    },
    integrity,
  });
}
