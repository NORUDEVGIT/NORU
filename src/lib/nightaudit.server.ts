/**
 * Phase 6I — Night Audit engine (server-only).
 *
 * Read-only evaluation of one business date for one property. It never mutates
 * reservations, rooms, folios or the ledger; it only derives checks and
 * exceptions that the night-audit functions persist against the audit run.
 */
import { round2 } from "./workforce.server";

export type Severity = "warning" | "blocking";
export type CheckStatus = "pass" | "warning" | "blocking";

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "mobile_money", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Exception types that represent data-integrity failures and can never be ignored. */
export const NON_IGNORABLE_TYPES = new Set([
  "checked_in_without_room",
  "room_double_occupancy",
  "closed_folio_nonzero_balance",
  "duplicate_room_charge",
  "closed_folio_post_activity",
  "open_cashier_shift",
  "arrival_not_processed",
]);

export interface DerivedException {
  exceptionType: string;
  severity: Severity;
  referenceType: string | null;
  referenceId: string | null;
  message: string;
}

export interface AreaCheck {
  area: string;
  status: CheckStatus;
  detail: string;
}

export interface NoShowCandidate {
  id: string;
  confirmationNumber: string;
  guestName: string;
  arrivalDate: string;
  roomNumber: string | null;
}

export interface OverstayStay {
  id: string;
  confirmationNumber: string;
  guestName: string;
  departureDate: string;
  roomNumber: string | null;
}

export interface ShiftReconciliation {
  id: string;
  cashier: string;
  openedAt: string;
  status: "open" | "closed";
  payments: number;
  cashPayments: number;
  refunds: number;
  deposits: number;
  expectedCash: number;
}

export interface AuditFinance {
  currency: string;
  roomRevenue: number;
  otherCharges: number;
  charges: number;
  payments: number;
  deposits: number;
  refunds: number;
  discounts: number;
  adjustments: number;
  paymentsByMethod: Record<PaymentMethod, number>;
}

export interface AuditEvaluation {
  businessDate: string;
  checks: AreaCheck[];
  exceptions: DerivedException[];
  noShows: NoShowCandidate[];
  overstays: OverstayStay[];
  shifts: ShiftReconciliation[];
  finance: AuditFinance;
}

const NIGHT_AUDIT_ERRORS: Record<string, string> = {
  AUDIT_RUN_NOT_FOUND: "Night audit run not found for this property.",
  BLOCKING_EXCEPTIONS_OPEN: "Resolve every blocking exception before closing the business date.",
};

export function nightAuditError(message: string): Error {
  for (const [code, text] of Object.entries(NIGHT_AUDIT_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

function name(g: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  return [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusFor(list: DerivedException[]): CheckStatus {
  if (list.some((e) => e.severity === "blocking")) return "blocking";
  if (list.length > 0) return "warning";
  return "pass";
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Runs every night-audit check for one property/business date. */
export async function evaluateAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  businessDate: string,
  currency: string,
): Promise<AuditEvaluation> {
  const exceptions: DerivedException[] = [];
  const checks: AreaCheck[] = [];

  /* --------------------------------------------------- reservations / stays */

  const { data: reservationRows } = await admin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, status, arrival_date, departure_date, room_id, room_type_id, room_subtotal, currency, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ), hotel_rooms!hotel_reservations_room_same_type ( room_number, status )",
    )
    .eq("restaurant_id", restaurantId)
    .lte("arrival_date", nextDay(businessDate))
    .order("arrival_date", { ascending: true })
    .limit(1000);

  type Res = {
    id: string;
    confirmation_number: string;
    status: string;
    arrival_date: string;
    departure_date: string;
    room_id: string | null;
    room_subtotal: number | string | null;
    currency: string | null;
    guest_profiles: { first_name: string; last_name: string | null } | null;
    hotel_rooms: { room_number: string; status: string } | null;
  };
  const reservations = (reservationRows ?? []) as Res[];

  const reservationExceptions: DerivedException[] = [];
  const noShows: NoShowCandidate[] = [];
  const overstays: OverstayStay[] = [];

  for (const r of reservations) {
    if (r.status === "confirmed" && r.arrival_date <= businessDate) {
      noShows.push({
        id: r.id,
        confirmationNumber: r.confirmation_number,
        guestName: name(r.guest_profiles),
        arrivalDate: r.arrival_date,
        roomNumber: r.hotel_rooms?.room_number ?? null,
      });
      reservationExceptions.push({
        exceptionType: "arrival_not_processed",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} (${name(r.guest_profiles)}) arrived ${r.arrival_date} and was never checked in. Check in or mark no-show.`,
      });
    }
    if (r.status === "pending" && r.arrival_date <= businessDate) {
      reservationExceptions.push({
        exceptionType: "pending_arrival",
        severity: "warning",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} is still pending with an arrival date of ${r.arrival_date}.`,
      });
    }
    if (r.status === "checked_in" && r.departure_date < businessDate) {
      overstays.push({
        id: r.id,
        confirmationNumber: r.confirmation_number,
        guestName: name(r.guest_profiles),
        departureDate: r.departure_date,
        roomNumber: r.hotel_rooms?.room_number ?? null,
      });
      reservationExceptions.push({
        exceptionType: "overstay",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} was due to depart ${r.departure_date} and is still in-house. Extend the stay or check the guest out.`,
      });
    }
    if ((r.status === "cancelled" || r.status === "no_show") && r.room_id) {
      reservationExceptions.push({
        exceptionType: "cancelled_holding_room",
        severity: "warning",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} is ${r.status} but still has a room assigned.`,
      });
    }
    if (r.departure_date <= r.arrival_date) {
      reservationExceptions.push({
        exceptionType: "invalid_stay_dates",
        severity: "warning",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} has an invalid stay range (${r.arrival_date} → ${r.departure_date}).`,
      });
    }
  }

  checks.push({
    area: "Reservations",
    status: statusFor(reservationExceptions.filter((e) => e.exceptionType !== "overstay")),
    detail: `${reservations.length} reservation(s) reviewed, ${noShows.length} unprocessed arrival(s).`,
  });

  /* ------------------------------------------------- front office and rooms */

  const inHouse = reservations.filter((r) => r.status === "checked_in");
  const roomExceptions: DerivedException[] = [];
  const byRoom = new Map<string, Res[]>();

  for (const r of inHouse) {
    if (!r.room_id) {
      roomExceptions.push({
        exceptionType: "checked_in_without_room",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} is checked in without an assigned room.`,
      });
      continue;
    }
    byRoom.set(r.room_id, [...(byRoom.get(r.room_id) ?? []), r]);
    if (r.hotel_rooms && (r.hotel_rooms.status === "out_of_order" || r.hotel_rooms.status === "out_of_service")) {
      roomExceptions.push({
        exceptionType: "occupied_restricted_room",
        severity: "warning",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} occupies room ${r.hotel_rooms.room_number}, which is ${r.hotel_rooms.status.replace(/_/g, " ")}.`,
      });
    }
  }

  for (const [roomId, stays] of byRoom) {
    if (stays.length > 1) {
      roomExceptions.push({
        exceptionType: "room_double_occupancy",
        severity: "blocking",
        referenceType: "room",
        referenceId: roomId,
        message: `Room ${stays[0]?.hotel_rooms?.room_number ?? roomId} has ${stays.length} overlapping checked-in stays (${stays
          .map((s) => s.confirmation_number)
          .join(", ")}).`,
      });
    }
  }

  checks.push({
    area: "Front Office & Rooms",
    status: statusFor(roomExceptions),
    detail: `${inHouse.length} in-house stay(s), ${byRoom.size} occupied room(s).`,
  });

  checks.push({
    area: "Departures",
    status: overstays.length > 0 ? "blocking" : "pass",
    detail: overstays.length > 0 ? `${overstays.length} overstay(s) past departure.` : "No overstays.",
  });

  /* ------------------------------------------------------------ housekeeping */

  const { data: roomRows } = await admin
    .from("hotel_rooms")
    .select("id, room_number, status, housekeeping_status, restriction_reason, active")
    .eq("restaurant_id", restaurantId)
    .limit(500);
  type RoomRow = {
    id: string;
    room_number: string;
    status: string;
    housekeeping_status: string;
    restriction_reason: string | null;
    active: boolean;
  };
  const rooms = (roomRows ?? []) as RoomRow[];

  const { data: taskRows } = await admin
    .from("housekeeping_tasks")
    .select("id, room_id, status, task_type")
    .eq("restaurant_id", restaurantId)
    .in("status", ["pending", "in_progress", "assigned"])
    .limit(500);
  const openTaskRooms = new Set(((taskRows ?? []) as Array<{ room_id: string }>).map((t) => t.room_id));

  const hkExceptions: DerivedException[] = [];
  const occupiedRoomIds = new Set(byRoom.keys());
  for (const room of rooms) {
    if (room.housekeeping_status === "dirty" && !occupiedRoomIds.has(room.id) && !openTaskRooms.has(room.id)) {
      hkExceptions.push({
        exceptionType: "dirty_room_without_task",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.room_number} is vacant and dirty with no open cleaning task.`,
      });
    }
    if ((room.status === "out_of_order" || room.status === "out_of_service") && !room.restriction_reason) {
      hkExceptions.push({
        exceptionType: "restriction_without_reason",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.room_number} is ${room.status.replace(/_/g, " ")} without a reason recorded.`,
      });
    }
    if (occupiedRoomIds.has(room.id) && room.housekeeping_status === "inspected" && !room.active) {
      hkExceptions.push({
        exceptionType: "inconsistent_room_state",
        severity: "warning",
        referenceType: "room",
        referenceId: room.id,
        message: `Room ${room.room_number} is occupied but marked inactive.`,
      });
    }
  }

  checks.push({
    area: "Housekeeping",
    status: statusFor(hkExceptions),
    detail: `${rooms.length} room(s) reviewed, ${openTaskRooms.size} with open cleaning tasks.`,
  });

  /* ------------------------------------------------------------------ folios */

  const { data: folioRows } = await admin
    .from("guest_folios")
    .select("id, folio_number, status, reservation_id, closed_at")
    .eq("restaurant_id", restaurantId)
    .limit(1000);
  type FolioRowLite = {
    id: string;
    folio_number: string;
    status: string;
    reservation_id: string | null;
    closed_at: string | null;
  };
  const folios = (folioRows ?? []) as FolioRowLite[];

  const { data: txnRows } = await admin
    .from("folio_transactions")
    .select("id, folio_id, transaction_type, category, amount, posted_at, payment_method, reference_type, reference_id")
    .eq("restaurant_id", restaurantId)
    .limit(5000);
  type TxnRow = {
    id: string;
    folio_id: string;
    transaction_type: string;
    category: string;
    amount: number | string;
    posted_at: string;
    payment_method: string | null;
    reference_type: string | null;
    reference_id: string | null;
  };
  const transactions = (txnRows ?? []) as TxnRow[];

  const balances = new Map<string, number>();
  const roomChargeCount = new Map<string, number>();
  for (const t of transactions) {
    balances.set(t.folio_id, round2((balances.get(t.folio_id) ?? 0) + num(t.amount)));
    if (t.reference_type === "reservation_room_charge" && t.reference_id) {
      roomChargeCount.set(t.reference_id, (roomChargeCount.get(t.reference_id) ?? 0) + 1);
    }
  }

  const folioExceptions: DerivedException[] = [];
  const folioByReservation = new Map<string, FolioRowLite>();
  for (const f of folios) {
    if (f.reservation_id) folioByReservation.set(f.reservation_id, f);
    const balance = balances.get(f.id) ?? 0;
    if (f.status === "closed" && Math.abs(balance) >= 0.01) {
      folioExceptions.push({
        exceptionType: "closed_folio_nonzero_balance",
        severity: "blocking",
        referenceType: "folio",
        referenceId: f.id,
        message: `Folio ${f.folio_number} is closed with a balance of ${balance.toFixed(2)}.`,
      });
    }
    if (f.status === "closed" && f.closed_at) {
      const after = transactions.filter((t) => t.folio_id === f.id && t.posted_at > (f.closed_at as string));
      if (after.length > 0) {
        folioExceptions.push({
          exceptionType: "closed_folio_post_activity",
          severity: "blocking",
          referenceType: "folio",
          referenceId: f.id,
          message: `Folio ${f.folio_number} has ${after.length} posting(s) after it was closed.`,
        });
      }
    }
    if (f.status === "open" && Math.abs(balance) >= 0.01) {
      folioExceptions.push({
        exceptionType: "open_folio_balance",
        severity: "warning",
        referenceType: "folio",
        referenceId: f.id,
        message: `Folio ${f.folio_number} has an outstanding balance of ${balance.toFixed(2)}.`,
      });
    }
  }

  for (const [reservationId, count] of roomChargeCount) {
    if (count > 1) {
      folioExceptions.push({
        exceptionType: "duplicate_room_charge",
        severity: "blocking",
        referenceType: "reservation",
        referenceId: reservationId,
        message: `A reservation has ${count} room charges posted for the same stay.`,
      });
    }
  }

  for (const r of reservations) {
    const priced = num(r.room_subtotal) > 0;
    if (priced && (r.status === "checked_in" || r.status === "checked_out") && !folioByReservation.has(r.id)) {
      folioExceptions.push({
        exceptionType: "missing_folio",
        severity: "warning",
        referenceType: "reservation",
        referenceId: r.id,
        message: `${r.confirmation_number} is priced and ${r.status.replace(/_/g, " ")} but has no folio.`,
      });
    }
  }

  checks.push({
    area: "Folios",
    status: statusFor(folioExceptions),
    detail: `${folios.length} folio(s), ${folios.filter((f) => f.status === "open").length} still open.`,
  });

  /* -------------------------------------------------------- payments / money */

  const dayStart = `${businessDate}T00:00:00`;
  const dayEnd = `${nextDay(businessDate)}T00:00:00`;
  const dayTxns = transactions.filter((t) => t.posted_at >= dayStart && t.posted_at < dayEnd);

  const paymentsByMethod: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    bank_transfer: 0,
    mobile_money: 0,
    other: 0,
  };
  const finance: AuditFinance = {
    currency,
    roomRevenue: 0,
    otherCharges: 0,
    charges: 0,
    payments: 0,
    deposits: 0,
    refunds: 0,
    discounts: 0,
    adjustments: 0,
    paymentsByMethod,
  };

  for (const t of dayTxns) {
    const amount = Math.abs(num(t.amount));
    switch (t.transaction_type) {
      case "charge":
        finance.charges += amount;
        if (t.category === "room") finance.roomRevenue += amount;
        else finance.otherCharges += amount;
        break;
      case "payment": {
        finance.payments += amount;
        const method = (PAYMENT_METHODS as readonly string[]).includes(t.payment_method ?? "")
          ? (t.payment_method as PaymentMethod)
          : "other";
        paymentsByMethod[method] += amount;
        break;
      }
      case "deposit":
        finance.deposits += amount;
        break;
      case "refund":
        finance.refunds += amount;
        break;
      case "discount":
        finance.discounts += amount;
        break;
      default:
        finance.adjustments += num(t.amount);
    }
  }

  finance.roomRevenue = round2(finance.roomRevenue);
  finance.otherCharges = round2(finance.otherCharges);
  finance.charges = round2(finance.charges);
  finance.payments = round2(finance.payments);
  finance.deposits = round2(finance.deposits);
  finance.refunds = round2(finance.refunds);
  finance.discounts = round2(finance.discounts);
  finance.adjustments = round2(finance.adjustments);
  for (const key of PAYMENT_METHODS) paymentsByMethod[key] = round2(paymentsByMethod[key]);

  checks.push({
    area: "Payments & Revenue",
    status: "pass",
    detail: `${dayTxns.length} ledger posting(s) on ${businessDate}.`,
  });

  /* ----------------------------------------------------------- cashier shifts */

  const { data: shiftRows } = await admin
    .from("cashier_shifts")
    .select("id, membership_id, status, opened_at, closed_at")
    .eq("restaurant_id", restaurantId)
    .order("opened_at", { ascending: false })
    .limit(200);
  type ShiftRow = {
    id: string;
    membership_id: string;
    status: "open" | "closed";
    opened_at: string;
    closed_at: string | null;
  };
  const allShifts = (shiftRows ?? []) as ShiftRow[];
  const dayShifts = allShifts.filter(
    (s) => s.status === "open" || (s.opened_at >= dayStart && s.opened_at < dayEnd),
  );

  const names = new Map<string, string>();
  if (dayShifts.length > 0) {
    const { data: members } = await admin
      .from("restaurant_users")
      .select("id, user_id")
      .eq("restaurant_id", restaurantId)
      .in("id", Array.from(new Set(dayShifts.map((s) => s.membership_id))));
    const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
    if (memberRows.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", memberRows.map((m) => m.user_id));
      const profileRows = (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>;
      for (const m of memberRows) {
        const p = profileRows.find((x) => x.id === m.user_id);
        names.set(m.id, name(p) !== "Guest" ? name(p) : (p?.email ?? "Staff"));
      }
    }
  }

  const shiftExceptions: DerivedException[] = [];
  const shifts: ShiftReconciliation[] = dayShifts.map((s) => {
    const until = s.closed_at ?? dayEnd;
    const rows = transactions.filter((t) => t.posted_at >= s.opened_at && t.posted_at <= until);
    let payments = 0;
    let cashPayments = 0;
    let refunds = 0;
    let deposits = 0;
    for (const t of rows) {
      const amount = Math.abs(num(t.amount));
      if (t.transaction_type === "payment") {
        payments += amount;
        if (t.payment_method === "cash") cashPayments += amount;
      } else if (t.transaction_type === "refund") refunds += amount;
      else if (t.transaction_type === "deposit") deposits += amount;
    }
    if (s.status === "open") {
      shiftExceptions.push({
        exceptionType: "open_cashier_shift",
        severity: "blocking",
        referenceType: "cashier_shift",
        referenceId: s.id,
        message: `${names.get(s.membership_id) ?? "A cashier"} still has an open cashier shift. Close it before the day close.`,
      });
    }
    return {
      id: s.id,
      cashier: names.get(s.membership_id) ?? "Staff",
      openedAt: s.opened_at,
      status: s.status,
      payments: round2(payments),
      cashPayments: round2(cashPayments),
      refunds: round2(refunds),
      deposits: round2(deposits),
      expectedCash: round2(cashPayments - refunds),
    };
  });

  checks.push({
    area: "Cashier Shifts",
    status: statusFor(shiftExceptions),
    detail: `${shifts.filter((s) => s.status === "open").length} open shift(s) of ${shifts.length}.`,
  });

  exceptions.push(
    ...reservationExceptions,
    ...roomExceptions,
    ...hkExceptions,
    ...folioExceptions,
    ...shiftExceptions,
  );

  return { businessDate, checks, exceptions, noShows, overstays, shifts, finance };
}
