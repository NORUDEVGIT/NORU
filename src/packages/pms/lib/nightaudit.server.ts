/**
 * Phase 6I — Night Audit engine (server-only).
 *
 * Read-only evaluation of one business date for one property. It never mutates
 * reservations, rooms, folios or the ledger; it only derives checks and
 * exceptions that the night-audit functions persist against the audit run.
 */
import { round2 } from "@/core/lib/workforce.server";
import { belongsToBusinessDate, propertyDayBounds } from "./cashiering-control";
import {
  guestInvoiceOriginalAmount,
  guestPaymentAvailable,
  guestPaymentFace,
  snapshotParentChargeIds,
} from "./cashiering-guest-allocation";
import { fiscalSnapshotMode, registeredCashDebitCover } from "./cashiering-cash-debit-cover";
import { selectAll, selectByIds } from "./night-audit-read";
import {
  housekeepingNightAuditExceptions,
  roomUnitIntegrityExceptions,
} from "./night-audit-rooms";
import { folioLedgerExceptions, settlementIntegrityExceptions } from "./night-audit-settlement";
import { isMissingSchemaError } from "./pms-set2-structure";
import { expandStayRooms } from "./reservation-room-units";

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
  "pending_arrival",
  "overstay",
  "unpaid_folio",
  "folio_invoice_contradiction",
  "allocation_exceeds_source",
  "orphan_allocation",
  "occupied_restricted_room",
  "hk_conflict",
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
  /** Checked-in reservation room units. Not travelers, and not the overstay count. */
  inHouseUnits: number;
}

const NIGHT_AUDIT_ERRORS: Record<string, string> = {
  AUDIT_RUN_NOT_FOUND: "Night audit run not found for this property.",
  BLOCKING_EXCEPTIONS_OPEN: "Resolve every blocking exception before closing the business date.",
  STALE_BUSINESS_DATE:
    "This run is not the current business date. Refresh Night Audit and close the current date.",
  AUDIT_RUN_NOT_CLOSABLE: "This night audit run cannot be closed.",
};

export function nightAuditError(message: string): Error {
  for (const [code, text] of Object.entries(NIGHT_AUDIT_ERRORS)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

function name(
  g: { first_name?: string | null; last_name?: string | null } | null | undefined,
): string {
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
  timezone: string,
): Promise<AuditEvaluation> {
  const exceptions: DerivedException[] = [];
  const checks: AreaCheck[] = [];

  /* --------------------------------------------------- reservations / stays */

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
  const reservations = await selectAll<Res>((from, to) =>
    admin
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, status, arrival_date, departure_date, room_id, room_type_id, room_subtotal, currency, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ), hotel_rooms!hotel_reservations_room_same_type ( room_number, status )",
      )
      .eq("restaurant_id", restaurantId)
      .lte("arrival_date", nextDay(businessDate))
      .order("id", { ascending: true })
      .range(from, to),
  );

  const reservationExceptions: DerivedException[] = [];
  const noShows: NoShowCandidate[] = [];
  const overstays: OverstayStay[] = [];

  for (const r of reservations) {
    if (r.status === "confirmed" && r.arrival_date < businessDate) {
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
  const inHouseIds = new Set(inHouse.map((stay) => stay.id));
  type UnitRow = {
    reservation_id: string;
    room_id: string | null;
    status: string | null;
    arrival_date: string;
    departure_date: string;
    unit_sequence: number;
  };
  let unitRows: UnitRow[] | null = [];
  try {
    const loaded = await selectAll<UnitRow>((from, to) =>
      admin
        .from("hotel_reservation_rooms")
        .select("reservation_id, room_id, status, arrival_date, departure_date, unit_sequence")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    unitRows = loaded.filter((unit) => inHouseIds.has(unit.reservation_id));
  } catch (error) {
    if (!isMissingSchemaError(error as { message?: string; code?: string })) throw error;
    unitRows = null;
  }
  const stayRooms = expandStayRooms(
    inHouse.map((stay) => ({
      id: stay.id,
      roomId: stay.room_id,
      status: stay.status,
      arrivalDate: stay.arrival_date,
      departureDate: stay.departure_date,
    })),
    unitRows
      ? unitRows.map((unit) => ({
          reservationId: unit.reservation_id,
          roomId: unit.room_id,
          status: unit.status,
          arrivalDate: unit.arrival_date,
          departureDate: unit.departure_date,
          unitSequence: unit.unit_sequence,
        }))
      : null,
  ).filter((stay) => stay.status === "checked_in");
  const occupiedRoomIdList = stayRooms
    .map((stay) => stay.roomId)
    .filter((id): id is string => Boolean(id));
  const occupiedRoomIds = new Set(occupiedRoomIdList);
  const occupiedRoomRows =
    occupiedRoomIdList.length === 0
      ? []
      : await selectByIds<{ id: string; room_number: string; status: string }>(
          occupiedRoomIdList,
          (chunk) =>
            admin
              .from("hotel_rooms")
              .select("id, room_number, status")
              .eq("restaurant_id", restaurantId)
              .in("id", chunk),
        );
  roomExceptions.push(
    ...roomUnitIntegrityExceptions({
      stays: stayRooms,
      reservations: inHouse.map((stay) => ({
        id: stay.id,
        confirmationNumber: stay.confirmation_number,
      })),
      rooms: occupiedRoomRows.map((room) => ({
        id: room.id,
        roomNumber: room.room_number,
        status: room.status,
      })),
    }),
  );

  checks.push({
    area: "Front Office & Rooms",
    status: statusFor(roomExceptions),
    detail: `${stayRooms.length} in-house room unit(s), ${occupiedRoomIds.size} occupied room(s).`,
  });

  checks.push({
    area: "Departures",
    status: overstays.length > 0 ? "blocking" : "pass",
    detail:
      overstays.length > 0 ? `${overstays.length} overstay(s) past departure.` : "No overstays.",
  });

  /* ------------------------------------------------------------ housekeeping */

  type RoomRow = {
    id: string;
    room_number: string;
    status: string;
    housekeeping_status: string;
    restriction_reason: string | null;
    active: boolean;
  };
  const rooms = await selectAll<RoomRow>((from, to) =>
    admin
      .from("hotel_rooms")
      .select("id, room_number, status, housekeeping_status, restriction_reason, active")
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const taskRows = await selectAll<{ room_id: string }>((from, to) =>
    admin
      .from("housekeeping_tasks")
      .select("id, room_id, status, task_type")
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "in_progress", "assigned"])
      .order("id", { ascending: true })
      .range(from, to),
  );
  const openTaskRooms = new Set(taskRows.map((t) => t.room_id));

  type DiscrepancyRow = { id: string; room_id: string; status: string };
  let discrepancyRows: DiscrepancyRow[] = [];
  try {
    discrepancyRows = await selectAll<DiscrepancyRow>((from, to) =>
      admin
        .from("housekeeping_discrepancies")
        .select("id, room_id, status")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (error) {
    if (!isMissingSchemaError(error as { message?: string; code?: string })) throw error;
  }
  const hkExceptions: DerivedException[] = housekeepingNightAuditExceptions({
    rooms: rooms.map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      status: room.status,
      housekeepingStatus: room.housekeeping_status,
      restrictionReason: room.restriction_reason,
      active: room.active,
    })),
    occupiedRoomIds,
    openTaskRoomIds: openTaskRooms,
    discrepancies: discrepancyRows.map((row) => ({ roomId: row.room_id, status: row.status })),
  });

  checks.push({
    area: "Housekeeping",
    status: statusFor(hkExceptions),
    detail: `${rooms.length} room(s) reviewed, ${openTaskRooms.size} with open cleaning tasks.`,
  });

  /* ------------------------------------------------------------------ folios */

  const folioRows = await selectAll<FolioRowLite>((from, to) =>
    admin
      .from("guest_folios")
      .select("id, folio_number, status, reservation_id, closed_at")
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  type FolioRowLite = {
    id: string;
    folio_number: string;
    status: string;
    reservation_id: string | null;
    closed_at: string | null;
  };
  const folios = folioRows;

  const txnRows = await selectAll<TxnRow>((from, to) =>
    admin
      .from("folio_transactions")
      .select(
        "id, folio_id, transaction_type, category, amount, posted_at, payment_method, reference_type, reference_id, original_transaction_id",
      )
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
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
    original_transaction_id: string | null;
  };
  const transactions = txnRows;

  const reservationsWithFolios = new Set(
    folios.flatMap((folio) => (folio.reservation_id ? [folio.reservation_id] : [])),
  );
  const ledger = folioLedgerExceptions({
    folios: folios.map((folio) => ({
      id: folio.id,
      number: folio.folio_number,
      status: folio.status,
      closedAt: folio.closed_at,
    })),
    transactions: transactions.map((txn) => ({
      folioId: txn.folio_id,
      amount: num(txn.amount),
      postedAt: txn.posted_at,
      referenceType: txn.reference_type,
      referenceId: txn.reference_id,
    })),
    missingFolios: reservations
      .filter(
        (reservation) =>
          num(reservation.room_subtotal) > 0 &&
          (reservation.status === "checked_in" || reservation.status === "checked_out") &&
          !reservationsWithFolios.has(reservation.id),
      )
      .map((reservation) => ({
        id: reservation.id,
        confirmationNumber: reservation.confirmation_number,
        status: reservation.status,
      })),
  });
  const balances = ledger.balances;
  const folioExceptions: DerivedException[] = [...ledger.exceptions];

  folioExceptions.push(
    ...((await loadSettlementExceptions(
      admin,
      restaurantId,
      folios,
      balances,
      transactions,
    )) as DerivedException[]),
  );

  checks.push({
    area: "Folios",
    status: statusFor(folioExceptions),
    detail: `${folios.length} folio(s), ${folios.filter((f) => f.status === "open").length} still open.`,
  });

  /* -------------------------------------------------------- payments / money */

  const bounds = propertyDayBounds(businessDate, timezone);
  const dayStart = bounds.startIso;
  const dayEnd = bounds.endIso;
  const dayTxns = transactions.filter((t) => belongsToBusinessDate(t.posted_at, businessDate, timezone));

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

  const shiftResult = await admin.rpc("list_hotel_drawers", {
    _restaurant_id: restaurantId,
  });
  if (shiftResult.error) throw new Error(shiftResult.error.message);
  const shiftRows = shiftResult.data;
  type ShiftRow = {
    id: string;
    membership_id: string;
    status: "open" | "closed";
    opened_at: string;
    closed_at: string | null;
  };
  const allShifts = (Array.isArray(shiftRows) ? shiftRows : []) as ShiftRow[];
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
        .in(
          "id",
          memberRows.map((m) => m.user_id),
        );
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
        message: `${names.get(s.membership_id) ?? "A cashier"} still has an open hotel cashier drawer. Close it before the day close.`,
      });
    } else {
      const variance = Number((s as { variance?: number | string | null }).variance ?? 0);
      if (Number.isFinite(variance) && Math.abs(variance) >= 0.01) {
        shiftExceptions.push({
          exceptionType: "closed_shift_variance",
          severity: "warning",
          referenceType: "cashier_shift",
          referenceId: s.id,
          message: `${names.get(s.membership_id) ?? "A cashier"} closed a drawer with a cash variance of ${variance.toFixed(2)}.`,
        });
      }
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
      expectedCash: round2(Number((s as { expected?: number | string }).expected ?? 0)),
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

  return {
    businessDate,
    checks,
    exceptions,
    noShows,
    overstays,
    shifts,
    finance,
    inHouseUnits: stayRooms.length,
  };
}

async function loadSettlementExceptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  folios: readonly { id: string; folio_number: string }[],
  balances: ReadonlyMap<string, number>,
  transactions: readonly {
    id: string;
    transaction_type: string;
    amount: number | string;
    original_transaction_id: string | null;
  }[],
) {
  type InvoiceRow = {
    id: string;
    folio_id: string;
    issued_number: string;
    coverage_scope: string | null;
    snapshot: unknown;
  };
  type NoteRow = {
    id: string;
    guest_invoice_id: string | null;
    note_type: string;
    total_delta: number | string;
  };
  type AmountRow = { id: string; invoice_id: string; amount: number | string };
  type ChargeAlloc = { charge_transaction_id: string; amount: number | string };
  type PaymentAlloc = AmountRow & { payment_transaction_id: string };
  type DepositAlloc = AmountRow & { deposit_transaction_id: string };
  const optional = async <T>(load: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await load();
    } catch (error) {
      if (isMissingSchemaError(error as { message?: string; code?: string })) return [];
      throw error;
    }
  };
  const invoices = await optional(() =>
    selectAll<InvoiceRow>((from, to) =>
      admin
        .from("guest_folio_invoices")
        .select("id, folio_id, issued_number, coverage_scope, snapshot")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const notes = await optional(() =>
    selectAll<NoteRow>((from, to) =>
      admin
        .from("invoice_credit_notes")
        .select("id, guest_invoice_id, note_type, total_delta")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const paymentAllocations = await optional(() =>
    selectAll<PaymentAlloc>((from, to) =>
      admin
        .from("guest_payment_invoice_allocations")
        .select("id, invoice_id, amount, payment_transaction_id")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const depositAllocations = await optional(() =>
    selectAll<DepositAlloc>((from, to) =>
      admin
        .from("guest_deposit_invoice_allocations")
        .select("id, invoice_id, amount, deposit_transaction_id")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const chargeAllocations = await optional(() =>
    selectAll<ChargeAlloc>((from, to) =>
      admin
        .from("folio_deposit_allocations")
        .select("id, charge_transaction_id, amount")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  );
  const debitIds = notes.filter((note) => note.note_type === "debit").map((note) => note.id);
  const registrations = new Map<string, { status: string; mode: "CASH" | "CREDIT" | null }>();
  if (debitIds.length > 0) {
    const registrationRows = await optional(() =>
      selectAll<{ source_id: string; status: string; request_snapshot: unknown }>((from, to) =>
        admin
          .from("fiscal_registrations")
          .select("source_id, status, request_snapshot")
          .eq("restaurant_id", restaurantId)
          .eq("source_type", "debit_note")
          .eq("fiscal_document_type", "DEB")
          .order("id", { ascending: true })
          .range(from, to),
      ),
    );
    for (const row of registrationRows) {
      if (!debitIds.includes(row.source_id)) continue;
      registrations.set(row.source_id, {
        status: row.status,
        mode: fiscalSnapshotMode(row.request_snapshot),
      });
    }
  }
  const folioNumber = new Map(folios.map((folio) => [folio.id, folio.folio_number]));
  const allocatedBySource = new Map<string, number>();
  for (const row of paymentAllocations) {
    allocatedBySource.set(
      row.payment_transaction_id,
      round2((allocatedBySource.get(row.payment_transaction_id) ?? 0) + Number(row.amount)),
    );
  }
  for (const row of depositAllocations) {
    allocatedBySource.set(
      row.deposit_transaction_id,
      round2((allocatedBySource.get(row.deposit_transaction_id) ?? 0) + Number(row.amount)),
    );
  }
  const refundedByPayment = new Map<string, number>();
  for (const txn of transactions) {
    if (txn.transaction_type !== "refund" || !txn.original_transaction_id) continue;
    refundedByPayment.set(
      txn.original_transaction_id,
      round2((refundedByPayment.get(txn.original_transaction_id) ?? 0) + Math.abs(num(txn.amount))),
    );
  }
  return settlementIntegrityExceptions({
    folios: folios.map((folio) => ({
      id: folio.id,
      number: folioNumber.get(folio.id) ?? folio.folio_number,
      balance: balances.get(folio.id) ?? 0,
    })),
    invoices: invoices.map((invoice) => {
      const invoiceNotes = notes.filter((note) => note.guest_invoice_id === invoice.id);
      const parentIds = snapshotParentChargeIds(invoice.snapshot);
      const depositApplied =
        depositAllocations
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + Number(row.amount), 0) +
        chargeAllocations
          .filter((row) => parentIds.includes(row.charge_transaction_id))
          .reduce((sum, row) => sum + Number(row.amount), 0);
      return {
        id: invoice.id,
        folioId: invoice.folio_id,
        number: invoice.issued_number,
        eligible: invoice.coverage_scope !== "legacy_folio",
        invoiceTotal: guestInvoiceOriginalAmount(
          invoice.snapshot as { totals?: { invoiceTotal?: number | null } },
        ),
        noteDeltas: invoiceNotes.map((note) => Number(note.total_delta)),
        paymentAllocated: paymentAllocations
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + Number(row.amount), 0),
        depositApplied,
        cashDebitCovered: registeredCashDebitCover(
          invoiceNotes.map((note) => ({
            id: note.id,
            noteType: note.note_type,
            totalDelta: Number(note.total_delta),
          })),
          invoiceNotes.map((note) => ({
            sourceId: note.id,
            status: registrations.get(note.id)?.status ?? "",
            mode: registrations.get(note.id)?.mode ?? null,
          })),
        ),
      };
    }),
    payments: transactions
      .filter((txn) => txn.transaction_type === "payment" || txn.transaction_type === "deposit")
      .map((txn) => ({
        id: txn.id,
        face: guestPaymentFace(num(txn.amount)),
        refunded: refundedByPayment.get(txn.id) ?? 0,
        allocated: allocatedBySource.get(txn.id) ?? 0,
      }))
      .filter(
        (payment) => guestPaymentAvailable(payment.face, payment.refunded, payment.allocated) < -0.01,
      ),
    allocations: [...paymentAllocations, ...depositAllocations].map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      amount: Number(row.amount),
    })),
  });
}
