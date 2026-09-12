/**
 * NA-1 — Live blocker evaluation (server-only).
 *
 * Reads existing hotel_reservations, cashier_shifts, guest folios / FO-EX1
 * payment_issue signals, housekeeping discrepancies and assigned OOO/OOS.
 * Never invents counts. Folio permission denied is Unavailable, not Coming soon.
 */
import {
  deriveExceptionRows,
  isOpenDiscrepancyStatus,
  type ExceptionStayLike,
  type StayMoneySignal,
} from "./fo-exceptions.ts";
import { buildNa1Blockers, type NaBlockerRow, type NaFolioLane } from "./na1.ts";

function emptySignal(): StayMoneySignal {
  return {
    folioId: null,
    folioNumber: null,
    balance: null,
    depositPosted: null,
    depositWaived: false,
    checkoutOverride: false,
    keyIssued: false,
    keyWaived: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
    guestName: [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    status: row.status,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
  };
}

async function loadUnpaidCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  stays: ExceptionStayLike[],
  rooms: Array<{ id: string; status: string }>,
  businessDate: string,
): Promise<number> {
  const ids = stays.map((stay) => stay.id);
  const byStay: Record<string, StayMoneySignal> = {};
  const ensure = (id: string) => {
    byStay[id] ??= emptySignal();
    return byStay[id];
  };

  if (ids.length > 0) {
    const { data: progressRows } = await admin
      .from("fo_checkin_progress")
      .select("reservation_id, deposit_amount, deposit_waived")
      .eq("restaurant_id", restaurantId)
      .in("reservation_id", ids);
    for (const row of (progressRows ?? []) as Array<{
      reservation_id: string;
      deposit_amount: number | string | null;
      deposit_waived: boolean | null;
    }>) {
      const signal = ensure(row.reservation_id);
      signal.depositWaived = row.deposit_waived === true;
      if (row.deposit_amount != null) signal.depositPosted = Number(row.deposit_amount);
    }

    const { data: historyRows } = await admin
      .from("hotel_reservation_history")
      .select("reservation_id, new_values")
      .eq("restaurant_id", restaurantId)
      .eq("event_type", "amended")
      .in("reservation_id", ids);
    for (const row of (historyRows ?? []) as Array<{ reservation_id: string; new_values: unknown }>) {
      const values = row.new_values as { checkout_override?: unknown; deposit_waived?: unknown } | null;
      if (!values || typeof values !== "object") continue;
      const signal = ensure(row.reservation_id);
      if (values.checkout_override === true) signal.checkoutOverride = true;
      if (values.deposit_waived === true) signal.depositWaived = true;
    }
  }

  const { data: folios, error: folioError } = await admin
    .from("guest_folios")
    .select("id, folio_number, reservation_id")
    .eq("restaurant_id", restaurantId);
  if (folioError) throw new Error(folioError.message);
  const folioList = (folios ?? []) as Array<{
    id: string;
    folio_number: string;
    reservation_id: string | null;
  }>;
  const folioIds = folioList.map((folio) => folio.id);
  const amounts = new Map<string, number[]>();
  const deposits = new Map<string, number>();
  if (folioIds.length > 0) {
    const { data: txns, error: txnError } = await admin
      .from("folio_transactions")
      .select("folio_id, amount, transaction_type")
      .eq("restaurant_id", restaurantId)
      .in("folio_id", folioIds);
    if (txnError) throw new Error(txnError.message);
    for (const t of (txns ?? []) as Array<{
      folio_id: string;
      amount: number | string;
      transaction_type: string;
    }>) {
      const bucket = amounts.get(t.folio_id) ?? [];
      bucket.push(Number(t.amount));
      amounts.set(t.folio_id, bucket);
      if (t.transaction_type === "deposit") {
        deposits.set(t.folio_id, (deposits.get(t.folio_id) ?? 0) + Math.abs(Number(t.amount)));
      }
    }
  }

  for (const folio of folioList) {
    if (!folio.reservation_id) continue;
    const signal = ensure(folio.reservation_id);
    signal.folioId = folio.id;
    signal.folioNumber = folio.folio_number;
    let charges = 0;
    let credits = 0;
    for (const amount of amounts.get(folio.id) ?? []) {
      if (amount >= 0) charges += amount;
      else credits += -amount;
    }
    signal.balance = round2(charges - credits);
    const posted = deposits.get(folio.id);
    if (posted != null) signal.depositPosted = posted;
  }

  const arrivals = stays.filter((stay) => stay.status === "pending" || stay.status === "confirmed");
  const inHouse = stays.filter((stay) => stay.status === "checked_in");
  const { rows } = deriveExceptionRows({
    arrivals,
    inHouse,
    departures: inHouse.filter((stay) => stay.overstay),
    rooms,
    folioLane: "live",
    moneyByStay: byStay,
    businessDate,
  });
  return rows.filter((row) => row.type === "payment_issue").length;
}

/** Evaluate the six NA-1 board rows from Live sources only. */
export async function evaluateNa1Blockers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  businessDate: string,
  folioLane: NaFolioLane,
): Promise<NaBlockerRow[]> {
  const { data: reservationRows } = await admin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, status, arrival_date, departure_date, room_id, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
    )
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "confirmed", "checked_in"])
    .limit(1000);

  const reservations = ((reservationRows ?? []) as Array<{
    id: string;
    confirmation_number: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    room_id: string | null;
    guest_profiles: { first_name: string | null; last_name: string | null } | null;
    hotel_rooms: { room_number: string } | null;
  }>).map((row) => toStay(row, businessDate));

  const arrivalsPendingCount = reservations.filter(
    (stay) => (stay.status === "pending" || stay.status === "confirmed") && stay.arrivalDate <= businessDate,
  ).length;
  const overstayCount = reservations.filter((stay) => stay.overstay).length;

  const { data: shiftRows } = await admin
    .from("cashier_shifts")
    .select("id, status")
    .eq("restaurant_id", restaurantId)
    .limit(200);
  const shifts = (shiftRows ?? []) as Array<{ id: string; status: string }>;
  const tillUsed = shifts.length > 0;
  const openCount = shifts.filter((shift) => shift.status === "open").length;

  const { data: roomRows } = await admin
    .from("hotel_rooms")
    .select("id, status")
    .eq("restaurant_id", restaurantId)
    .limit(500);
  const rooms = (roomRows ?? []) as Array<{ id: string; status: string }>;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const roomUnavailableCount = reservations.filter((stay) => {
    if (!stay.roomId) return false;
    const room = roomById.get(stay.roomId);
    return room?.status === "out_of_order" || room?.status === "out_of_service";
  }).length;

  let discrepancyLane: NaFolioLane = "live";
  let discrepancyCount = 0;
  try {
    const { data: discRows, error } = await admin
      .from("housekeeping_discrepancies")
      .select("id, status")
      .eq("restaurant_id", restaurantId)
      .limit(200);
    if (error) throw new Error(error.message);
    discrepancyCount = ((discRows ?? []) as Array<{ status: string }>).filter((row) =>
      isOpenDiscrepancyStatus(row.status),
    ).length;
  } catch {
    discrepancyLane = "unavailable";
    discrepancyCount = 0;
  }

  let unpaidCount = 0;
  let unpaidLane: NaFolioLane = folioLane;
  if (folioLane === "live") {
    try {
      unpaidCount = await loadUnpaidCount(admin, restaurantId, reservations, rooms, businessDate);
    } catch {
      unpaidLane = "unavailable";
      unpaidCount = 0;
    }
  }

  return buildNa1Blockers({
    arrivalsPendingCount,
    overstayCount,
    unpaidFolios: { lane: unpaidLane, count: unpaidCount },
    openShift: { tillUsed, openCount },
    hkConflict: { discrepancyLane, discrepancyCount, roomUnavailableCount },
  });
}
