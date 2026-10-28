/**
 * Night Audit operational reconciliation — server read.
 *
 * Required reads (reservations, room units, rooms, housekeeping tasks and
 * discrepancies, the overbooking board and its approvals) throw, so the caller
 * reports UNAVAILABLE instead of a false clean. Distribution, revenue, waitlist
 * and services never block close; a failed read there shows as unavailable.
 * This module does not write.
 */
import { propertyDayBounds } from "./cashiering-control";
import type { HousekeepingReadinessPolicy } from "./housekeeping-card2.server";
import {
  reconcileNightAuditOperations,
  type NightAuditOperationalFacts,
  type NightAuditOperationalReconciliation,
  type OperationalUnitFact,
  type OptionalSection,
} from "./night-audit-operational";
import { selectAll, selectByIds } from "./night-audit-read";
import { parseOverbookingNights } from "./overbooking.functions";
import { isMissingSchemaError } from "./pms-set2-structure";
import { reservationRoomNightlyRates } from "./reservation-room-units";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type DbError = { message?: string; code?: string };

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function missing(error: unknown): boolean {
  return isMissingSchemaError(error as DbError);
}

function guestName(row: { first_name?: string | null; last_name?: string | null } | null | undefined) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

/** Ids in chunks, every chunk paged, so neither PostgREST cap can hide rows. */
async function selectAllByIds<T>(
  ids: readonly string[],
  page: (chunk: readonly string[], from: number, to: number) => Promise<{ data: T[] | null; error: DbError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    rows.push(...(await selectAll<T>((from, to) => page(chunk, from, to) as never)));
  }
  return rows;
}

/** Optional section: a missing table is NOT CONFIGURED, any other failure is UNAVAILABLE. */
async function optionalSection<T extends object>(load: () => Promise<T>): Promise<OptionalSection<T>> {
  try {
    return { state: "ok", ...(await load()) };
  } catch (error) {
    if (missing(error)) return { state: "not_configured" };
    return error instanceof Error ? { state: "unavailable", message: error.message } : { state: "unavailable" };
  }
}

type ReservationRow = {
  id: string;
  confirmation_number: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  room_id: string | null;
  room_type_id: string | null;
  late_checkout_granted?: boolean | null;
  late_checkout_until?: string | null;
  guest_profiles: { first_name: string | null; last_name: string | null } | null;
};

async function loadReservations(admin: Admin, restaurantId: string, tomorrow: string) {
  const base =
    "id, confirmation_number, status, arrival_date, departure_date, room_id, room_type_id, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )";
  const read = (columns: string) =>
    selectAll<ReservationRow>((from, to) =>
      admin
        .from("hotel_reservations")
        .select(columns)
        .eq("restaurant_id", restaurantId)
        .in("status", ["pending", "confirmed", "checked_in"])
        .lte("arrival_date", tomorrow)
        .order("id", { ascending: true })
        .range(from, to),
    );
  try {
    return await read(`${base}, late_checkout_granted, late_checkout_until`);
  } catch (error) {
    if (!missing(error)) throw error;
    return read(base);
  }
}

type UnitRow = {
  id: string;
  reservation_id: string;
  unit_sequence: number;
  room_id: string | null;
  room_type_id: string | null;
  status?: string | null;
  arrival_date: string;
  departure_date: string;
  rate_plan_id: string | null;
  nightly_rate_snapshot: unknown;
};

async function loadUnits(
  admin: Admin,
  restaurantId: string,
  reservationIds: readonly string[],
): Promise<OperationalUnitFact[] | null> {
  const read = (columns: string) =>
    selectAllByIds<UnitRow>(reservationIds, (chunk, from, to) =>
      admin
        .from("hotel_reservation_rooms")
        .select(columns)
        .eq("restaurant_id", restaurantId)
        .in("reservation_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
  const base =
    "id, reservation_id, unit_sequence, room_id, room_type_id, arrival_date, departure_date, rate_plan_id, nightly_rate_snapshot";
  let rows: UnitRow[];
  try {
    rows = await read(`${base}, status`);
  } catch (error) {
    if (!missing(error)) throw error;
    try {
      rows = await read(base);
    } catch (retryError) {
      if (!missing(retryError)) throw retryError;
      return null;
    }
  }
  return rows.map((row) => ({
    id: row.id,
    reservationId: row.reservation_id,
    unitSequence: row.unit_sequence,
    roomId: row.room_id,
    roomTypeId: row.room_type_id,
    status: row.status ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    ratePlanId: row.rate_plan_id,
    nightlyDates: reservationRoomNightlyRates(row.nightly_rate_snapshot).map((night) => night.date),
  }));
}

type RoomRow = {
  id: string;
  room_number: string;
  room_type_id: string | null;
  status: string;
  housekeeping_status: string;
  maintenance_status?: string | null;
  sellable?: boolean | null;
  restriction_reason: string | null;
  active: boolean;
};

async function loadRooms(admin: Admin, restaurantId: string): Promise<RoomRow[]> {
  const read = (columns: string) =>
    selectAll<RoomRow>((from, to) =>
      admin
        .from("hotel_rooms")
        .select(columns)
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: true })
        .range(from, to),
    );
  const base = "id, room_number, room_type_id, status, housekeeping_status, restriction_reason, active";
  try {
    return await read(`${base}, maintenance_status, sellable`);
  } catch (error) {
    if (!missing(error)) throw error;
    return read(base);
  }
}

async function loadPolicy(admin: Admin, restaurantId: string): Promise<HousekeepingReadinessPolicy | undefined> {
  try {
    const { loadCard2HousekeepingSnapshot } = await import("./housekeeping-card2.functions");
    const snapshot = await loadCard2HousekeepingSnapshot(admin, restaurantId, false);
    return snapshot.settings;
  } catch {
    // Display only. Readiness falls back to the clean/inspected rule.
    return undefined;
  }
}

export async function loadNightAuditOperationalReconciliation(
  admin: Admin,
  restaurantId: string,
  businessDate: string,
  timezone: string,
  checkedAt: string = new Date().toISOString(),
): Promise<NightAuditOperationalReconciliation> {
  const tomorrow = nextDate(businessDate);
  const bounds = propertyDayBounds(businessDate, timezone);

  /* ------------------------------------------------------ required reads */

  const reservations = await loadReservations(admin, restaurantId, tomorrow);
  const units = await loadUnits(
    admin,
    restaurantId,
    reservations.map((row) => row.id),
  );
  const rooms = await loadRooms(admin, restaurantId);
  const roomTypes = await selectAll<{ id: string; name: string }>((from, to) =>
    admin
      .from("room_types")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const tasks = await selectAll<{ room_id: string }>((from, to) =>
    admin
      .from("housekeeping_tasks")
      .select("id, room_id, status")
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "in_progress", "assigned"])
      .order("id", { ascending: true })
      .range(from, to),
  );
  let discrepancies: Array<{ id: string; room_id: string; status: string }> = [];
  try {
    discrepancies = await selectAll<{ id: string; room_id: string; status: string }>((from, to) =>
      admin
        .from("housekeeping_discrepancies")
        .select("id, room_id, status")
        .eq("restaurant_id", restaurantId)
        .in("status", ["open", "unresolved"])
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch (error) {
    if (!missing(error)) throw error;
  }

  const overbooking = await (async (): Promise<NightAuditOperationalFacts["overbooking"]> => {
    const board = await admin.rpc("pms_property_overbooking_board", {
      _restaurant_id: restaurantId,
      _start: businessDate,
      _end: tomorrow,
    });
    if (board.error) {
      if (missing(board.error)) return { state: "not_configured" };
      throw new Error(board.error.message);
    }
    const nights = parseOverbookingNights(board.data);
    const short = nights.some((night) => night.roomTypes.some((type) => type.shortage > 0));
    if (!short) return { state: "ok", nights, approvals: [] };
    let approvalRows: Array<{ id: string; reservation_id: string; nights: unknown }> = [];
    try {
      approvalRows = await selectAll<{ id: string; reservation_id: string; nights: unknown }>((from, to) =>
        admin
          .from("pms_reservation_overbooking_approvals")
          .select("id, reservation_id, nights")
          .eq("restaurant_id", restaurantId)
          .order("id", { ascending: true })
          .range(from, to),
      );
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const approvalReservations = await selectByIds<{ id: string; status: string }>(
      [...new Set(approvalRows.map((row) => row.reservation_id))],
      (chunk) =>
        admin.from("hotel_reservations").select("id, status").eq("restaurant_id", restaurantId).in("id", chunk),
    );
    const statusById = new Map(approvalReservations.map((row) => [row.id, row.status]));
    return {
      state: "ok",
      nights,
      approvals: approvalRows.map((row) => {
        const status = statusById.get(row.reservation_id);
        return {
          id: row.id,
          reservationId: row.reservation_id,
          reservationActive:
            status === "pending" || status === "confirmed" || status === "checked_in",
          nights: (Array.isArray(row.nights) ? row.nights : []).flatMap((night) => {
            const item = night as { date?: unknown; room_type_id?: unknown; shortage_approved?: unknown };
            if (typeof item.date !== "string" || typeof item.room_type_id !== "string") return [];
            return [
              {
                date: item.date.slice(0, 10),
                roomTypeId: item.room_type_id,
                shortageApproved: Number(item.shortage_approved ?? 0) || 0,
              },
            ];
          }),
        };
      }),
    };
  })();

  /* ------------------------------------------------- non-blocking reads */

  const maintenance = await optionalSection(async () => ({
    requests: (
      await selectAll<{ id: string; room_id: string; priority: string; status: string; category: string }>(
        (from, to) =>
          admin
            .from("housekeeping_maintenance_requests")
            .select("id, room_id, priority, status, category")
            .eq("restaurant_id", restaurantId)
            .in("status", ["open", "in_progress"])
            .order("id", { ascending: true })
            .range(from, to),
      )
    ).map((row) => ({
      id: row.id,
      roomId: row.room_id,
      priority: row.priority,
      status: row.status,
      category: row.category,
    })),
  }));

  const waitlist = await optionalSection(async () => {
    const rows = await selectAll<{
      id: string;
      confirmation_number: string;
      status: string;
      arrival_date: string;
      reservation_id: string | null;
    }>((from, to) =>
      admin
        .from("pms_waitlist_requests")
        .select("id, confirmation_number, status, arrival_date, reservation_id")
        .eq("restaurant_id", restaurantId)
        .in("status", ["open", "offered", "accepted", "converted"])
        .gte("arrival_date", businessDate)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const linked = await selectByIds<{ id: string }>(
      rows.flatMap((row) => (row.status === "converted" && row.reservation_id ? [row.reservation_id] : [])),
      (chunk) => admin.from("hotel_reservations").select("id").eq("restaurant_id", restaurantId).in("id", chunk),
    );
    const exists = new Set(linked.map((row) => row.id));
    return {
      requests: rows.map((row) => ({
        id: row.id,
        confirmationNumber: row.confirmation_number,
        status: row.status,
        arrivalDate: row.arrival_date,
        reservationId: row.reservation_id,
        reservationExists: row.reservation_id ? exists.has(row.reservation_id) : false,
      })),
    };
  });

  const distribution = await optionalSection(async () => {
    const integrations = await selectAll<{
      id: string;
      environment: string;
      enabled: boolean;
      last_error: string | null;
      last_validated_at: string | null;
    }>((from, to) =>
      admin
        .from("pms_integrations")
        .select("id, environment, enabled, last_error, last_validated_at")
        .eq("restaurant_id", restaurantId)
        .eq("provider", "aiosell")
        .order("id", { ascending: true })
        .range(from, to),
    );
    const events =
      integrations.length === 0
        ? []
        : await selectAll<{
            id: string;
            operation: string;
            direction: string;
            channel: string | null;
            response_message: string | null;
            created_at: string;
          }>((from, to) =>
            admin
              .from("pms_distribution_sync_events")
              .select("id, operation, direction, channel, response_message, created_at")
              .eq("restaurant_id", restaurantId)
              .eq("status", "failed")
              .gte("created_at", bounds.startIso)
              .lt("created_at", bounds.endIso)
              .order("id", { ascending: true })
              .range(from, to),
          );
    return {
      connections: integrations.map((row) => ({
        id: row.id,
        environment: row.environment,
        enabled: row.enabled,
        lastError: row.last_error,
        lastValidatedAt: row.last_validated_at,
      })),
      failedEvents: events.map((row) => ({
        id: row.id,
        operation: row.operation,
        direction: row.direction,
        channel: row.channel,
        message: row.response_message,
        createdAt: row.created_at,
      })),
    };
  });

  const revenue = await optionalSection(async () => {
    const approvals = await selectAll<{
      id: string;
      domain: string;
      action_type: string;
      display_snapshot: { summary?: string; dateFrom?: string | null; dateTo?: string | null } | null;
      requested_at: string;
    }>((from, to) =>
      admin
        .from("hotel_revenue_approval_requests")
        .select("id, domain, action_type, display_snapshot, requested_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .order("id", { ascending: true })
        .range(from, to),
    );
    const restrictionRows = await selectAll<{
      id: string;
      rate_plan_id: string;
      restriction_date: string;
      stop_sell: boolean;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
    }>((from, to) =>
      admin
        .from("hotel_rate_restrictions")
        .select("id, rate_plan_id, restriction_date, stop_sell, closed_to_arrival, closed_to_departure")
        .eq("restaurant_id", restaurantId)
        .eq("restriction_date", tomorrow)
        .or("stop_sell.eq.true,closed_to_arrival.eq.true,closed_to_departure.eq.true")
        .order("id", { ascending: true })
        .range(from, to),
    );
    const plans = await selectByIds<{ id: string; name: string }>(
      [...new Set(restrictionRows.map((row) => row.rate_plan_id))],
      (chunk) => admin.from("hotel_rate_plans").select("id, name").eq("restaurant_id", restaurantId).in("id", chunk),
    );
    const planName = new Map(plans.map((row) => [row.id, row.name]));
    return {
      approvals: approvals.map((row) => ({
        id: row.id,
        domain: row.domain,
        summary: row.display_snapshot?.summary?.trim() || row.action_type,
        dateFrom: row.display_snapshot?.dateFrom?.slice(0, 10) ?? null,
        dateTo: row.display_snapshot?.dateTo?.slice(0, 10) ?? null,
        requestedAt: row.requested_at,
      })),
      restrictions: restrictionRows.map((row) => ({
        id: row.id,
        ratePlanId: row.rate_plan_id,
        ratePlanName: planName.get(row.rate_plan_id) ?? "Rate plan",
        date: row.restriction_date.slice(0, 10),
        stopSell: row.stop_sell,
        closedToArrival: row.closed_to_arrival,
        closedToDeparture: row.closed_to_departure,
      })),
    };
  });

  const services = await optionalSection(async () => ({
    entitlements: (
      await selectAll<{
        id: string;
        reservation_id: string;
        reservation_room_id: string;
        service_kind: string;
        service_name_snapshot: string;
        service_date: string;
        status: string;
        room_number_snapshot: string;
      }>((from, to) =>
        admin
          .from("pms_reservation_service_entitlements")
          .select(
            "id, reservation_id, reservation_room_id, service_kind, service_name_snapshot, service_date, status, room_number_snapshot",
          )
          .eq("restaurant_id", restaurantId)
          .eq("service_date", businessDate)
          .in("status", ["PENDING", "IN_PROGRESS"])
          .order("id", { ascending: true })
          .range(from, to),
      )
    ).map((row) => ({
      id: row.id,
      reservationId: row.reservation_id,
      reservationRoomId: row.reservation_room_id,
      serviceKind: row.service_kind,
      serviceName: row.service_name_snapshot,
      serviceDate: row.service_date.slice(0, 10),
      status: row.status,
      roomNumber: row.room_number_snapshot,
    })),
  }));

  return reconcileNightAuditOperations({
    businessDate,
    checkedAt,
    reservations: reservations.map((row) => ({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      status: row.status,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      roomId: row.room_id,
      roomTypeId: row.room_type_id,
      guestName: guestName(row.guest_profiles),
      lateCheckoutGranted: Boolean(row.late_checkout_granted),
      lateCheckoutUntil: row.late_checkout_until ?? null,
    })),
    units,
    rooms: rooms.map((row) => ({
      id: row.id,
      roomNumber: row.room_number,
      roomTypeId: row.room_type_id,
      status: row.status,
      housekeepingStatus: row.housekeeping_status,
      maintenanceStatus: row.maintenance_status ?? null,
      sellable: row.sellable ?? null,
      active: row.active,
      restrictionReason: row.restriction_reason,
    })),
    roomTypeNames: Object.fromEntries(roomTypes.map((row) => [row.id, row.name])),
    openTaskRoomIds: tasks.map((row) => row.room_id),
    discrepancies: discrepancies.map((row) => ({ id: row.id, roomId: row.room_id, status: row.status })),
    maintenance,
    housekeepingPolicy: await loadPolicy(admin, restaurantId),
    overbooking,
    waitlist,
    distribution,
    revenue,
    services,
  });
}
