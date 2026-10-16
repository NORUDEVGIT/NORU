import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCreateReservationDraft } from "@/packages/pms/lib/create-reservation-draft";
import { expandRevenueRoomStays } from "@/packages/pms/lib/revenue/revenue-analytics";
import {
  aggregateRoomSubtotals,
  createReservationRoomUnitPayload,
  expandStayRooms,
  projectInventoryDemand,
  projectReservationRoomUnits,
  rollupReservationStatus,
  roomUnitAttributionLabel,
  type ReservationRoomMasterSlice,
  type ReservationRoomUnitRow,
} from "@/packages/pms/lib/reservation-room-units";

const drizzle = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0153_hotel_reservation_rooms.sql"),
  "utf8",
);
const supabase = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0153_hotel_reservation_rooms.sql"),
  "utf8",
);
const detailSelect = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);
const detailWorkspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const master: ReservationRoomMasterSlice = {
  roomTypeId: "type-1",
  roomId: "room-1",
  arrivalDate: "2026-10-14",
  departureDate: "2026-10-16",
  adults: 2,
  children: 0,
  infants: 1,
  ratePlanId: "plan-1",
  currency: "ETB",
  nightlyRates: [{ date: "2026-10-14", rate: 1000 }],
  roomSubtotal: 2000,
  pricedAt: "2026-10-01T00:00:00.000Z",
};

function unitRow(overrides: Partial<ReservationRoomUnitRow> = {}): ReservationRoomUnitRow {
  return {
    id: "unit-1",
    unit_sequence: 1,
    room_type_id: master.roomTypeId,
    room_id: master.roomId,
    arrival_date: master.arrivalDate,
    departure_date: master.departureDate,
    adults: master.adults,
    children: master.children,
    infants: master.infants ?? 0,
    rate_plan_id: master.ratePlanId,
    currency: master.currency,
    nightly_rate_snapshot: master.nightlyRates,
    room_subtotal: "2000.00",
    priced_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("STAY-08A reservation room units", () => {
  it("backfills one matching room unit and leaves runtime authority on the master", () => {
    expect(supabase).toBe(drizzle);
    expect(drizzle).toContain("CREATE TABLE public.hotel_reservation_rooms");
    expect(drizzle).toContain("UNIQUE (reservation_id, unit_sequence)");
    expect(drizzle).toContain("unit_sequence >= 1");
    expect(drizzle).toContain("ON DELETE CASCADE");
    expect(drizzle).toContain("hotel_reservation_rooms_room_same_type");
    expect(drizzle).not.toMatch(
      /hotel_rooms \(id, restaurant_id, room_type_id\)\s+ON DELETE CASCADE/,
    );
    expect(drizzle).toContain("1,\n  reservation.room_type_id");
    expect(drizzle).toContain("STAY08A_BACKFILL_MISMATCH");
    expect(drizzle).toContain("HAVING count(*) <> 1");
    expect(drizzle).not.toContain("price_hotel_stay");
    expect(drizzle).not.toContain("pms_room_type_availability");
    expect(drizzle).toContain("set_hotel_reservation_rooms_updated_at");
    expect(drizzle).not.toContain("ON public.hotel_reservations");
    const selectBlock = detailSelect.slice(
      detailSelect.indexOf("const RESERVATION_SELECT"),
      detailSelect.indexOf("function toDetail"),
    );
    expect(selectBlock).not.toContain("hotel_reservation_rooms");
  });
});

describe("STAY-08B reservation room read model", () => {
  it("reads one matching unit from the room unit", () => {
    const [unit] = projectReservationRoomUnits(master, [unitRow()]);
    expect(unit?.unitSequence).toBe(1);
    expect(unit?.authority).toBe("unit");
    expect(unit?.matchesMaster).toBe(true);
    expect(unit?.driftedFields).toEqual([]);
    expect(unit?.roomId).toBe(master.roomId);
    expect(unit?.roomSubtotal).toBe(2000);
  });

  it("keeps a drifted unit as the room authority", () => {
    const [unit] = projectReservationRoomUnits(master, [unitRow({ room_id: "room-9", adults: 4 })]);
    expect(unit?.matchesMaster).toBe(false);
    expect(unit?.driftedFields).toEqual(["roomId", "adults"]);
    expect(unit?.authority).toBe("unit");
    expect(unit?.roomId).toBe("room-9");
    expect(unit?.adults).toBe(4);
    expect(unit?.stored.roomId).toBe("room-9");
    expect(unit?.stored.adults).toBe(4);
  });

  it("loads units only on reservation detail and leaves the detail screen on the master room", () => {
    const detailFn = detailSelect.slice(detailSelect.indexOf("export const getReservation"));
    expect(detailFn).toContain('.from("hotel_reservation_rooms")');
    expect(detailFn).toContain("projectReservationRoomUnits");
    expect(detailFn).toContain("isMissingSchemaError(unitsQuery.error)");
    const createFn = detailSelect.slice(
      detailSelect.indexOf("export const createReservation"),
      detailSelect.indexOf("export const amendReservation"),
    );
    const amendFn = detailSelect.slice(
      detailSelect.indexOf("export const amendReservation"),
      detailSelect.indexOf("export const assignReservationRoom"),
    );
    expect(createFn).not.toContain("hotel_reservation_rooms");
    expect(amendFn).not.toContain("hotel_reservation_rooms");
    expect(detailWorkspace).toContain("reservation.roomNumber");
    expect(detailWorkspace).not.toContain("reservation.rooms?");
    expect(detailWorkspace).not.toContain("reservation.rooms[");
    expect(detailWorkspace).not.toContain("reservation.rooms.");
    expect(detailWorkspace).not.toContain("projectReservationRoomUnits");
  });
});

describe("STAY-08C multi-room create", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0154_create_reservation_room_units.sql"),
    "utf8",
  );
  const migrationCopy = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0154_create_reservation_room_units.sql"),
    "utf8",
  );
  const page = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-page.tsx"),
    "utf8",
  );
  const extraRooms = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/bookings/create-reservation-extra-rooms.tsx",
    ),
    "utf8",
  );
  const review = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-review.tsx"),
    "utf8",
  );

  it("keeps a one-room create on the existing rooms multiplier and omits room units", () => {
    expect(
      createReservationRoomUnitPayload({
        roomTypeId: "type-1",
        adults: 2,
        children: 1,
        infants: 0,
        ratePlanId: "plan-1",
        roomsRequested: 3,
        extraUnits: [],
      }),
    ).toEqual({ rooms: 3, roomUnits: null });
  });

  it("prices the master as one room and sends every unit when another room is added", () => {
    expect(
      createReservationRoomUnitPayload({
        roomTypeId: "type-1",
        adults: 2,
        children: 0,
        infants: 1,
        ratePlanId: "plan-1",
        roomsRequested: 4,
        extraUnits: [
          {
            roomTypeId: "type-2",
            adults: 1,
            children: 2,
            infants: 0,
            ratePlanId: "plan-2",
          },
        ],
      }),
    ).toEqual({
      rooms: 1,
      roomUnits: [
        {
          roomTypeId: "type-1",
          adults: 2,
          children: 0,
          infants: 1,
          ratePlanId: "plan-1",
        },
        {
          roomTypeId: "type-2",
          adults: 1,
          children: 2,
          infants: 0,
          ratePlanId: "plan-2",
        },
      ],
    });
  });

  it("inserts room units inside the priced create function before it returns", () => {
    expect(migrationCopy).toBe(migration);
    const priced = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced("),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(",
      ),
    );
    const commercial = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(",
      ),
    );
    expect(priced.indexOf("public.create_hotel_reservation(")).toBeGreaterThan(-1);
    expect(priced.indexOf("INSERT INTO public.hotel_reservation_rooms")).toBeGreaterThan(
      priced.indexOf("public.create_hotel_reservation("),
    );
    expect(priced.indexOf("RETURN created;")).toBeGreaterThan(
      priced.lastIndexOf("INSERT INTO public.hotel_reservation_rooms"),
    );
    expect(priced).toContain("created.room_type_id, created.room_id");
    expect(priced).toContain("1, unit_adults, unit_children, unit_infants");
    expect(priced).toContain("_room_units jsonb DEFAULT NULL");
    expect(priced).toContain("rooms_requested = COALESCE(_rooms, 1)");
    expect(priced).not.toContain("pms_room_type_availability");
    expect(priced.match(/UPDATE public\.hotel_reservations/g)).toHaveLength(2);
    expect(commercial).toContain("_room_units");
    expect(commercial.indexOf("sync_hotel_reservation_packages")).toBeGreaterThan(
      commercial.indexOf("public.create_hotel_reservation_priced("),
    );
    expect(commercial).toContain("'apply'");
  });

  it("passes room units only from the create handler and lists each room on review", () => {
    const createFn = detailSelect.slice(
      detailSelect.indexOf("export const createReservation"),
      detailSelect.indexOf("export const amendReservation"),
    );
    const amendFn = detailSelect.slice(
      detailSelect.indexOf("export const amendReservation"),
      detailSelect.indexOf("export const assignReservationRoom"),
    );
    expect(createFn).toContain("_room_units");
    expect(createFn).toContain(
      "_rooms: roomUnitPayload.roomUnits?.length ?? roomUnitPayload.rooms",
    );
    expect(createFn).not.toContain('.from("hotel_reservation_rooms")');
    expect(amendFn).not.toContain("_room_units");
    expect(amendFn).not.toContain("hotel_reservation_rooms");
    expect(extraRooms).toContain("Add Room");
    expect(extraRooms).toContain("Remove Room");
    expect(page).toContain("extraRoomUnits");
    expect(page).toContain("roomLines=");
    expect(page).toContain("roomUnitPayload.roomUnits ?? undefined");
    expect(review).toContain('data-testid="review-room-lines"');
    expect(review).toContain("(props.roomLines?.length ?? 0) > 1");
  });

  it("keeps an older draft readable when it has no extra rooms", () => {
    const parsed = parseCreateReservationDraft({
      version: 1,
      arrival: "2026-10-14",
      departure: "2026-10-15",
    });
    expect(parsed?.extraRoomUnits).toEqual([]);
  });
});

describe("STAY-08D room unit inventory and price", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0155_room_unit_inventory_price.sql"),
    "utf8",
  );
  const migrationCopy = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0155_room_unit_inventory_price.sql"),
    "utf8",
  );
  const rateCalendar = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/revenue/rate-calendar.server.ts"),
    "utf8",
  );
  const demand = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/revenue/demand.server.ts"),
    "utf8",
  );
  const checkIn = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
    "utf8",
  );

  function stays(unitTypes: string[], roomsRequested = 1) {
    return projectInventoryDemand(
      [
        {
          id: "booking-1",
          roomTypeId: unitTypes[0] ?? "type-a",
          arrivalDate: "2026-10-14",
          departureDate: "2026-10-16",
          roomsRequested,
        },
      ],
      unitTypes.map((roomTypeId) => ({
        reservationId: "booking-1",
        roomTypeId,
        arrivalDate: "2026-10-14",
        departureDate: "2026-10-16",
      })),
    );
  }

  it("counts one unit as one room and ignores rooms_requested", () => {
    expect(stays(["type-a"], 5)).toHaveLength(1);
    expect(stays(["type-a", "type-b"])).toHaveLength(2);
    expect(stays(["type-a", "type-a", "type-b"])).toHaveLength(3);
    expect(
      projectInventoryDemand(
        [
          {
            id: "legacy",
            roomTypeId: "type-a",
            arrivalDate: "2026-10-14",
            departureDate: "2026-10-16",
            roomsRequested: 4,
          },
        ],
        [],
      ),
    ).toHaveLength(1);
  });

  it("sums unit room subtotals and leaves an unpriced stay null", () => {
    expect(aggregateRoomSubtotals([1200, 800.5])).toBe(2000.5);
    expect(aggregateRoomSubtotals([1000])).toBe(1000);
    expect(aggregateRoomSubtotals([null, null])).toBeNull();
  });

  it("counts units in availability, blocks an assigned room, and rolls a failed create back", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain("public.pms_unassigned_room_demand");
    expect(migration).toContain("public.pms_stay_overlaps_room");
    expect(migration).toContain("RAISE EXCEPTION 'ROOM_ALREADY_BOOKED'");
    expect(migration).toContain("RAISE EXCEPTION 'NO_AVAILABILITY'");
    const inventoryFns = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.pms_room_unit_claims_room("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced("),
    );
    expect(inventoryFns).not.toContain("rooms_requested");
    const priced = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_priced("),
    );
    expect(priced.indexOf("PERFORM public.assert_reservation_room_units")).toBeGreaterThan(
      priced.lastIndexOf("INSERT INTO public.hotel_reservation_rooms"),
    );
    expect(priced.indexOf("RETURN created;")).toBeGreaterThan(
      priced.indexOf("PERFORM public.assert_reservation_room_units"),
    );
    expect(priced).toContain("PERFORM public.sync_reservation_room_total");
    expect(migration).toContain("sum(unit.room_subtotal)");
    expect(migration).toContain("unit.unit_sequence = 1");
    const amend = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_priced("),
    );
    expect(amend.indexOf("MULTI_ROOM_AMEND_UNSUPPORTED")).toBeLessThan(
      amend.indexOf("public.amend_hotel_reservation("),
    );
    expect(amend).toContain("sync_hotel_reservation_packages");
    expect(amend).toContain("'reevaluate'");
    expect(migration).not.toContain("check_in_hotel_reservation");
    expect(migration).not.toContain("check_out_hotel_reservation");
    expect(rateCalendar).toContain("projectInventoryDemand");
    expect(rateCalendar).not.toContain("rooms_requested");
    expect(demand).toContain("projectInventoryDemand");
    expect(demand).not.toContain("rooms_requested");
    expect(checkIn).toContain("check_in_hotel_reservation");
    expect(checkIn).not.toContain("hotel_reservation_rooms");
  });
});

describe("STAY-08E room-unit front office", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0156_room_unit_front_office.sql"),
    "utf8",
  );
  const migrationCopy = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0156_room_unit_front_office.sql"),
    "utf8",
  );
  const checkIn = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
    "utf8",
  );
  const checkOut = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-check-out.functions.ts"),
    "utf8",
  );
  const cancel = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-cancel-noshow.functions.ts"),
    "utf8",
  );
  const assign = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
    "utf8",
  );
  const move = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/frontoffice.functions.ts"),
    "utf8",
  );
  const dialogs = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/frontoffice/front-office-dialogs.tsx"),
    "utf8",
  );
  const plan = readFileSync(
    resolve(process.cwd(), "docs/pms/stay-08-multi-room-implementation-plan.md"),
    "utf8",
  );

  it("rolls the master status up from unit states", () => {
    expect(rollupReservationStatus(["cancelled", "cancelled"])).toBe("cancelled");
    expect(rollupReservationStatus(["cancelled", "no_show"])).toBe("no_show");
    expect(rollupReservationStatus(["no_show", "confirmed"])).toBe("confirmed");
    expect(rollupReservationStatus(["checked_in", "confirmed"])).toBe("checked_in");
    expect(rollupReservationStatus(["checked_in", "checked_in"])).toBe("checked_in");
    expect(rollupReservationStatus(["checked_out", "checked_in"])).toBe("checked_in");
    expect(rollupReservationStatus(["checked_out", "checked_out"])).toBe("checked_out");
    expect(rollupReservationStatus(["checked_out", "cancelled"])).toBe("checked_out");
    expect(rollupReservationStatus(["checked_out", "confirmed"])).toBe("confirmed");
    expect(rollupReservationStatus(["confirmed", "pending"])).toBe("confirmed");
    expect(rollupReservationStatus(["pending", "cancelled"])).toBe("pending");
    expect(rollupReservationStatus(["confirmed"])).toBe("confirmed");
  });

  it("targets one unit, keeps history on the master, and leaves folio attribution alone", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain("hotel_reservation_rooms_status_check");
    expect(migration).toContain(
      "'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'",
    );
    expect(migration).toContain("RAISE EXCEPTION 'ROOM_UNIT_REQUIRED'");
    expect(migration).toContain("PERFORM public.assert_room_assignable");
    expect(migration).toContain("RAISE EXCEPTION 'ROOM_ALREADY_BOOKED'");
    expect(migration).toContain("'reservation_room_id', unit.id");
    expect(migration).toContain("INSERT INTO public.hotel_reservation_history");
    expect(migration).not.toContain("ALTER TABLE public.guest_folios");
    expect(migration).not.toContain("hotel_reservation_packages");
    expect(migration).not.toContain("folio_transactions");
    expect(migration).toContain("PERFORM public.open_folio_for_reservation");
    const rollup = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.rollup_hotel_reservation_status("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.assert_reservation_room_unit_room("),
    );
    expect(rollup.indexOf("unit_count = 0")).toBeLessThan(rollup.indexOf("rolled := 'cancelled'"));
    expect(rollup.indexOf("rolled := 'cancelled'")).toBeLessThan(
      rollup.indexOf("rolled := 'no_show'"),
    );
    expect(rollup.indexOf("rolled := 'no_show'")).toBeLessThan(
      rollup.indexOf("rolled := 'checked_in'"),
    );
    expect(rollup.indexOf("rolled := 'checked_in'")).toBeLessThan(
      rollup.indexOf("rolled := 'checked_out'"),
    );
    expect(rollup.indexOf("rolled := 'checked_out'")).toBeLessThan(
      rollup.indexOf("rolled := 'confirmed'"),
    );
    expect(rollup.indexOf("rolled := 'confirmed'")).toBeLessThan(
      rollup.indexOf("rolled := 'pending'"),
    );
    const assignFn = assign.slice(
      assign.indexOf("export const assignReservationRoom"),
      assign.indexOf("export const setReservationStatus"),
    );
    expect(assignFn).toContain("assign_hotel_reservation_room_unit");
    expect(assignFn).toContain("ROOM_UNIT_REQUIRED");
    expect(assignFn).toContain("amend_hotel_reservation");
    expect(checkIn).toContain("_reservation_room_id");
    expect(checkIn).not.toContain("hotel_reservation_rooms");
    expect(checkOut).toContain("_reservation_room_id");
    expect(checkOut).toContain("check_out_hotel_reservation");
    expect(cancel).toContain("cancel_hotel_reservation_unit");
    expect(cancel).toContain("reservation_room_id");
    expect(move).toContain("_reservation_room_id");
    expect(dialogs).toContain("assignReservationRoom");
    expect(dialogs).toContain("moveReservationRoom");
    expect(dialogs).toContain("RoomUnitTargetSelect");
    expect(plan).toContain("| STAY-08G | PASS WITH DEBT |");
  });
});

describe("STAY-08F folio and package attribution", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0157_room_unit_folio_packages.sql"),
    "utf8",
  );
  const migrationCopy = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0157_room_unit_folio_packages.sql"),
    "utf8",
  );
  const cashiering = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0017_create_cashiering.sql"),
    "utf8",
  );
  const folioRead = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/cashiering.functions.ts"),
    "utf8",
  );
  const folioPage = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/cashiering/guest-folio-page.tsx"),
    "utf8",
  );
  const packagesUi = readFileSync(
    resolve(
      process.cwd(),
      "src/packages/pms/components/workspaces/reservation-detail-packages.tsx",
    ),
    "utf8",
  );
  const reservations = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
    "utf8",
  );
  const checkIn = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
    "utf8",
  );
  const frontOffice = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0156_room_unit_front_office.sql"),
    "utf8",
  );
  const plan = readFileSync(
    resolve(process.cwd(), "docs/pms/stay-08-multi-room-implementation-plan.md"),
    "utf8",
  );

  it("attributes room charges and packages without a second folio or Front Office rewrite", () => {
    expect(migrationCopy).toBe(migration);
    expect(cashiering).toContain("guest_folios_one_per_reservation");
    expect(migration).not.toContain("CREATE TABLE");
    expect(migration).not.toContain("DROP INDEX");
    expect(migration).not.toContain("UPDATE public.folio_transactions");
    expect(migration).toContain("folio_transactions_room_unit_same_property");
    expect(migration).toContain("BEFORE INSERT");
    expect(migration).toContain("reference_type IS DISTINCT FROM 'reservation_room_charge'");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.post_folio_charge_with_tax");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation");
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation",
    );
    expect(roomUnitAttributionLabel(null)).toBeNull();
    expect(roomUnitAttributionLabel(2)).toBe("Room 2");

    const split = migration.slice(
      migration.indexOf("IF unit_count > 1"),
      migration.indexOf("IF NOT split_done"),
    );
    expect(split).toContain("reference_id = res.id");
    expect(split).toContain("set_config('noru.reservation_room_id', unit.id::text, true)");
    expect(split).toContain("reference_id = unit.id");
    expect(split).toContain("'Room charge — room '");

    const reservationCharge = migration.slice(
      migration.indexOf("IF NOT split_done"),
      migration.indexOf("RETURN folio;"),
    );
    expect(reservationCharge).toContain("reference_id = res.id");
    expect(reservationCharge).toContain("'Room charge — reservation '");
    expect(reservationCharge).not.toContain("set_config");

    const sync = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.sync_hotel_reservation_packages("),
      migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_hotel_reservation_room_package("),
    );
    expect(sync).toContain("AND reservation_room_id IS NULL");
    expect(sync).toContain(
      "ON CONFLICT (reservation_id, package_activation_id) WHERE reservation_room_id IS NULL",
    );
    expect(sync).toContain("NULL,\n      activation.id");
    expect(sync).toContain("PACKAGE_CHARGE_BASIS_UNSUPPORTED");
    expect(sync).not.toContain("hotel_reservation_rooms");
    expect(sync).not.toContain("per_night");

    const apply = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_hotel_reservation_room_package("),
      migration.indexOf("REVOKE ALL ON FUNCTION public.folio_transactions_assign_room_unit()"),
    );
    expect(apply.match(/INSERT INTO public.hotel_reservation_packages/g)).toHaveLength(1);
    expect(apply).toContain("unit.id");
    expect(apply).toContain("'per_stay'");
    expect(apply).toContain("activation.package_price");
    expect(apply).toContain("PACKAGE_ALREADY_RESERVATION_SCOPED");
    expect(apply).toContain("PACKAGE_CHARGE_BASIS_UNSUPPORTED");
    expect(apply).not.toContain("FOR unit IN");
    expect(apply).not.toContain("post_folio");
    expect(apply).not.toContain("per_night");

    const folioSelect = folioRead.slice(
      folioRead.indexOf("const FOLIO_TXN_SELECT_BASE"),
      folioRead.indexOf("const UUID_PATTERN"),
    );
    expect(folioRead).toContain("reservation_room_id");
    expect(folioSelect).not.toContain("reservation_room_id");
    expect(folioPage).toContain("roomUnitLabel");
    expect(packagesUi).toContain("roomUnitLabel");
    expect(packagesUi).toContain("PACKAGE_BIND_GAP_COPY");
    expect(reservations).toContain("apply_hotel_reservation_room_package");
    expect(checkIn).toContain("open_folio_for_reservation");
    expect(frontOffice).not.toContain("folio_transactions");
    expect(frontOffice).not.toContain("hotel_reservation_packages");
    expect(plan).toContain("| STAY-08F | PASS WITH DEBT |");
    expect(plan).toContain("| STAY-08G | PASS WITH DEBT |");
  });
});

describe("STAY-08G room-unit authority", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0158_room_unit_authority.sql"),
    "utf8",
  );
  const migrationCopy = readFileSync(
    resolve(process.cwd(), "supabase/migrations/0158_room_unit_authority.sql"),
    "utf8",
  );
  const housekeeping = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/housekeeping.functions.ts"),
    "utf8",
  );
  const calendar = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/reservation-workspace/calendar.server.ts"),
    "utf8",
  );
  const nightAudit = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/nightaudit.server.ts"),
    "utf8",
  );
  const revenue = readFileSync(
    resolve(process.cwd(), "src/packages/pms/lib/revenue/revenue-analytics.server.ts"),
    "utf8",
  );
  const plan = readFileSync(
    resolve(process.cwd(), "docs/pms/stay-08-multi-room-implementation-plan.md"),
    "utf8",
  );

  it("derives master aggregates from units and counts each room", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).not.toContain("DROP COLUMN");
    expect(migration).not.toContain("ON DELETE CASCADE");
    expect(migration).not.toContain("CREATE TABLE");
    expect(migration).not.toContain("open_folio_for_reservation");
    expect(migration).not.toContain("check_in_hotel_reservation");
    expect(migration).toContain("COALESCE(sum(unit.adults), 0)");
    expect(migration).toContain("rooms_requested = GREATEST(active_count, 1)");
    expect(migration).toContain("sum(unit.room_subtotal)");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("unit.status NOT IN ('cancelled', 'no_show')");
    expect(housekeeping).toContain("hotel_reservation_rooms");
    expect(calendar).toContain("hotel_reservation_rooms");
    expect(nightAudit).toContain("hotel_reservation_rooms");
    expect(nightAudit).not.toContain("post_folio");
    expect(revenue).toContain("expandRevenueRoomStays");
    expect(plan).toContain("| STAY-08G | PASS WITH DEBT |");

    const stays = expandStayRooms(
      [
        {
          id: "res-1",
          roomId: "master-room",
          status: "checked_in",
          arrivalDate: "2026-10-14",
          departureDate: "2026-10-16",
        },
      ],
      [
        {
          reservationId: "res-1",
          roomId: "room-a",
          status: "checked_in",
          arrivalDate: "2026-10-14",
          departureDate: "2026-10-16",
          unitSequence: 1,
        },
        {
          reservationId: "res-1",
          roomId: "room-b",
          status: "confirmed",
          arrivalDate: "2026-10-14",
          departureDate: "2026-10-16",
          unitSequence: 2,
        },
        {
          reservationId: "res-1",
          roomId: "room-c",
          status: "cancelled",
          arrivalDate: "2026-10-14",
          departureDate: "2026-10-16",
          unitSequence: 3,
        },
      ],
    );
    expect(stays.map((stay) => stay.roomId)).toEqual(["room-a", "room-b"]);

    const revenueRows = expandRevenueRoomStays(
      [
        {
          id: "res-1",
          room_type_id: "type-1",
          rate_plan_id: "plan-1",
          market_segment: null,
          commercial_booking_source: null,
          source: "staff",
          arrival_date: "2026-10-14",
          departure_date: "2026-10-16",
          nightly_rate_snapshot: [{ date: "2026-10-14", rate: 3000 }],
          currency: "ETB",
          created_at: "2026-10-01T00:00:00.000Z",
          status: "checked_in",
        },
      ],
      [
        {
          reservation_id: "res-1",
          room_type_id: "type-1",
          rate_plan_id: "plan-1",
          arrival_date: "2026-10-14",
          departure_date: "2026-10-16",
          nightly_rate_snapshot: [{ date: "2026-10-14", rate: 1000 }],
          currency: "ETB",
          status: "checked_in",
        },
        {
          reservation_id: "res-1",
          room_type_id: "type-2",
          rate_plan_id: "plan-2",
          arrival_date: "2026-10-14",
          departure_date: "2026-10-16",
          nightly_rate_snapshot: [{ date: "2026-10-14", rate: 2000 }],
          currency: "ETB",
          status: "checked_in",
        },
      ],
    );
    expect(revenueRows).toHaveLength(2);
    expect(new Set(revenueRows.map((row) => row.id)).size).toBe(1);
    expect(revenueRows.map((row) => row.room_type_id)).toEqual(["type-1", "type-2"]);
  });
});
