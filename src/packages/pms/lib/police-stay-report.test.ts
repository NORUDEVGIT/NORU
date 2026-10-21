import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PoliceStayReportError,
  assemblePoliceStayReport,
  loadPoliceStayDataset,
  policeGuestName,
  type PoliceStayDb,
  type PoliceStayOccupantSource,
  type PoliceStayQuery,
  type PoliceStayUnitSource,
} from "./police-stay-report.ts";

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STAY = "2026-10-20";

function guest(
  overrides: Partial<PoliceStayOccupantSource> &
    Pick<PoliceStayOccupantSource, "guestProfileId" | "firstName">,
): PoliceStayOccupantSource {
  return {
    middleName: null,
    lastName: null,
    phone: null,
    email: null,
    nationality: null,
    idDocumentType: null,
    idDocumentNumber: null,
    ...overrides,
  };
}

function unit(
  overrides: Partial<PoliceStayUnitSource> & Pick<PoliceStayUnitSource, "reservationRoomId">,
): PoliceStayUnitSource {
  return {
    restaurantId: PROPERTY,
    reservationId: "res-1",
    arrivalDate: "2026-10-19",
    departureDate: "2026-10-22",
    status: "checked_in",
    adults: 1,
    children: 0,
    infants: 0,
    roomId: null,
    roomNumber: null,
    roomTypeId: "type-1",
    roomTypeName: "Deluxe",
    building: null,
    floor: null,
    confirmationNumber: "RES-1001",
    reservationMode: "single",
    reservationSource: "staff",
    occupants: [],
    ...overrides,
  };
}

function report(
  units: PoliceStayUnitSource[],
  filters: Parameters<typeof assemblePoliceStayReport>[0]["filters"] = {},
) {
  return assemblePoliceStayReport({
    restaurantId: PROPERTY,
    stayDate: STAY,
    businessDate: STAY,
    timezone: "Africa/Addis_Ababa",
    units,
    filters: { stayDate: STAY, ...filters },
  });
}

describe("Police stay report read model", () => {
  it("returns one row for one named guest and builds the display name", () => {
    assert.equal(
      policeGuestName({ firstName: " Abebe ", middleName: "", lastName: " Kebede " }),
      "Abebe Kebede",
    );
    assert.equal(policeGuestName({ firstName: null, middleName: null, lastName: null }), "");
    const result = report([
      unit({
        reservationRoomId: "room-unit-1",
        roomNumber: "201",
        occupants: [
          guest({
            guestProfileId: "g1",
            firstName: "Abebe",
            lastName: "Kebede",
            phone: "0911",
            nationality: "Ethiopian",
            email: "a@example.com",
            idDocumentType: "passport",
            idDocumentNumber: "P123",
          }),
        ],
      }),
    ]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.guestName, "Abebe Kebede");
    assert.equal(result.rows[0]?.checkInDate, "2026-10-19");
    assert.equal(result.rows[0]?.checkOutDate, "2026-10-22");
    assert.equal(result.rows[0]?.idDocumentNumber, "P123");
    assert.equal(result.summary.unnamedOccupantCount, 0);
    assert.equal("folio" in (result.rows[0] ?? {}), false);
  });

  it("returns one row per named guest in the same room", () => {
    const result = report([
      unit({
        reservationRoomId: "room-unit-1",
        roomNumber: "201",
        adults: 3,
        occupants: [
          guest({ guestProfileId: "g1", firstName: "Abebe" }),
          guest({ guestProfileId: "g2", firstName: "Hana" }),
          guest({ guestProfileId: "g3", firstName: "Dawit" }),
        ],
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => row.guestName),
      ["Abebe", "Dawit", "Hana"],
    );
  });

  it("keeps occupants on their own room units", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-201",
        roomNumber: "201",
        occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
      }),
      unit({
        reservationRoomId: "unit-202",
        roomNumber: "202",
        occupants: [guest({ guestProfileId: "g2", firstName: "Hana" })],
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => [row.roomNumber, row.guestName]),
      [
        ["201", "Abebe"],
        ["202", "Hana"],
      ],
    );
  });

  it("does not copy the lead guest onto a sibling room and warns that the room is unnamed", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-1",
        roomNumber: "201",
        occupants: [guest({ guestProfileId: "lead", firstName: "Abebe" })],
      }),
      unit({
        reservationRoomId: "unit-2",
        roomNumber: "202",
        adults: 2,
        occupants: [],
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => row.guestName),
      ["Abebe"],
    );
    assert.equal(result.summary.unnamedOccupantCount, 2);
    assert.equal(result.summary.rooms[0]?.reservationRoomId, "unit-2");
    assert.equal(result.summary.rooms[0]?.expectedNamedOccupants, 2);
  });

  it("counts one unnamed occupant when capacity is 2 and only one profile exists", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-1",
        adults: 2,
        occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
      }),
    ]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.summary.namedGuestCount, 1);
    assert.equal(result.summary.unnamedOccupantCount, 1);
    assert.equal(
      result.rows.some((row) => row.guestName === "Unknown Guest"),
      false,
    );
    const filtered = report(
      [
        unit({
          reservationRoomId: "unit-1",
          adults: 2,
          occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
        }),
      ],
      { name: "no-such-guest" },
    );
    assert.equal(filtered.rows.length, 0);
    assert.equal(filtered.summary.unnamedOccupantCount, 1);
  });

  it("does not expect infants to be named guests", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-1",
        adults: 1,
        children: 1,
        infants: 2,
        occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
      }),
    ]);
    assert.equal(result.summary.unnamedOccupantCount, 1);
    assert.equal(result.summary.rooms[0]?.expectedNamedOccupants, 2);
    assert.equal(result.rows.length, 1);
  });

  it("includes a walk-in with the same in-house rule", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-1",
        reservationSource: "walk_in",
        occupants: [guest({ guestProfileId: "g1", firstName: "Marta" })],
      }),
    ]);
    assert.equal(result.rows[0]?.reservationSource, "walk_in");
    assert.equal(result.rows[0]?.guestName, "Marta");
  });

  it("includes group pickup occupants and does not accept a text-only rooming name", () => {
    const result = report([
      unit({
        reservationRoomId: "unit-1",
        reservationMode: "group",
        confirmationNumber: "GRP-1",
        occupants: [guest({ guestProfileId: "g1", firstName: "Sara" })],
      }),
    ]);
    assert.equal(result.rows[0]?.reservationMode, "group");
    assert.equal(
      result.rows.some((row) => row.guestName === "Unlinked rooming name"),
      false,
    );
    const readModel = readFileSync(new URL("./police-stay-report.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("./police-stay-report.server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(
      readModel,
      /from\(["']fo_stay_companions|from\(["']guest_documents|from\(["']pms_group_rooming_rows/,
    );
    assert.doesNotMatch(
      server,
      /from\(["']fo_stay_companions|from\(["']guest_documents|from\(["']pms_group_rooming_rows/,
    );
    assert.match(server, /assertDateOnly/);
    assert.match(server, /resolvePropertyBusinessDate/);
  });

  it("uses room-unit overlap and excludes the checkout date", () => {
    const staying = unit({
      reservationRoomId: "unit-1",
      arrivalDate: "2026-10-19",
      departureDate: "2026-10-22",
      occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
    });
    for (const stayDate of ["2026-10-19", "2026-10-20", "2026-10-21"]) {
      const result = assemblePoliceStayReport({
        restaurantId: PROPERTY,
        stayDate,
        businessDate: stayDate,
        timezone: "Africa/Addis_Ababa",
        units: [staying],
        filters: { stayDate },
      });
      assert.equal(result.rows.length, 1, stayDate);
    }
    const checkoutMorning = assemblePoliceStayReport({
      restaurantId: PROPERTY,
      stayDate: "2026-10-22",
      businessDate: "2026-10-22",
      timezone: "Africa/Addis_Ababa",
      units: [staying],
      filters: { stayDate: "2026-10-22" },
    });
    assert.equal(checkoutMorning.rows.length, 0);
  });

  it("excludes cancelled, no-show, and confirmed stays from the in-house register", () => {
    const people = [guest({ guestProfileId: "g1", firstName: "Abebe" })];
    const result = report([
      unit({ reservationRoomId: "in", status: "checked_in", occupants: people }),
      unit({ reservationRoomId: "cancelled", status: "cancelled", adults: 2, occupants: people }),
      unit({ reservationRoomId: "no-show", status: "no_show", occupants: people }),
      unit({ reservationRoomId: "confirmed", status: "confirmed", occupants: people }),
      unit({ reservationRoomId: "pending", status: "pending", occupants: people }),
      unit({ reservationRoomId: "out", status: "checked_out", occupants: people }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => row.reservationRoomId),
      ["in"],
    );
    assert.equal(result.summary.unnamedOccupantCount, 0);
  });

  it("includes a checked-out stay on an earlier night in historical mode", () => {
    const stayed = unit({
      reservationRoomId: "unit-1",
      status: "checked_out",
      arrivalDate: "2026-10-19",
      departureDate: "2026-10-22",
      occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
    });
    const historical = report([stayed], { presence: "HISTORICAL" });
    assert.equal(historical.rows.length, 1);
    const inHouse = report([stayed], { presence: "IN_HOUSE" });
    assert.equal(inHouse.rows.length, 0);
    const neverArrived = report(
      [unit({ reservationRoomId: "confirmed", status: "confirmed", occupants: stayed.occupants })],
      { presence: "HISTORICAL" },
    );
    assert.equal(neverArrived.rows.length, 0);
  });

  it("filters by guest name, nationality, and room without inventing country codes", () => {
    const rows = [
      unit({
        reservationRoomId: "a",
        roomId: "room-201",
        roomNumber: "201",
        occupants: [
          guest({
            guestProfileId: "g1",
            firstName: "Abebe",
            middleName: "T",
            lastName: "Kebede",
            nationality: " Ethiopian ",
          }),
        ],
      }),
      unit({
        reservationRoomId: "b",
        roomNumber: "202",
        occupants: [guest({ guestProfileId: "g2", firstName: "Hana", nationality: "Kenyan" })],
      }),
    ];
    assert.equal(report(rows, { name: "t kebede" }).rows[0]?.guestProfileId, "g1");
    assert.equal(report(rows, { nationality: "ethiopian" }).rows.length, 1);
    assert.equal(report(rows, { nationality: "ET" }).rows.length, 0);
    assert.equal(report(rows, { room: "202" }).rows[0]?.guestName, "Hana");
    assert.equal(report(rows, { room: "room-201" }).rows[0]?.guestName, "Abebe T Kebede");
  });

  it("paginates on screen and returns the full filter for export", () => {
    const occupants = Array.from({ length: 12 }, (_, index) =>
      unit({
        reservationRoomId: `unit-${index}`,
        roomNumber: String(index + 1),
        occupants: [
          guest({ guestProfileId: `g${index}`, firstName: `N${String(index).padStart(2, "0")}` }),
        ],
      }),
    );
    const page = report(occupants, { page: 2, pageSize: 10 });
    assert.equal(page.total, 12);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 10);
    assert.equal(page.rows.length, 2);
    assert.equal(page.summary.namedGuestCount, 12);
    assert.deepEqual(
      page.rows.map((row) => row.roomNumber),
      ["11", "12"],
    );
    const exported = report(occupants, { page: 2, pageSize: 10, export: true });
    assert.equal(exported.rows.length, 12);
    assert.equal(exported.page, 1);
    assert.equal(exported.total, 12);
  });

  it("sorts by room number, then guest name, with unassigned rooms last", () => {
    const result = report([
      unit({
        reservationRoomId: "u",
        roomNumber: null,
        occupants: [guest({ guestProfileId: "z", firstName: "Zola" })],
      }),
      unit({
        reservationRoomId: "ten",
        roomNumber: "10",
        occupants: [guest({ guestProfileId: "b", firstName: "B" })],
      }),
      unit({
        reservationRoomId: "two",
        roomNumber: "2",
        occupants: [
          guest({ guestProfileId: "a", firstName: "A" }),
          guest({ guestProfileId: "c", firstName: "C" }),
        ],
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => `${row.roomNumber ?? "none"}:${row.guestName}`),
      ["2:A", "2:C", "10:B", "none:Zola"],
    );
  });

  it("drops another property's unit instead of mixing registers", () => {
    const result = report([
      unit({
        reservationRoomId: "ours",
        occupants: [guest({ guestProfileId: "g1", firstName: "Abebe" })],
      }),
      unit({
        restaurantId: OTHER,
        reservationRoomId: "theirs",
        adults: 3,
        occupants: [guest({ guestProfileId: "g2", firstName: "Other" })],
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => row.guestName),
      ["Abebe"],
    );
    assert.equal(result.summary.unnamedOccupantCount, 0);
  });

  it("refuses an oversized register instead of returning a shortened one", () => {
    const units = Array.from({ length: 5001 }, (_, index) =>
      unit({
        reservationRoomId: `unit-${index}`,
        roomNumber: String(index + 1),
        occupants: [guest({ guestProfileId: `g${index}`, firstName: "Abebe" })],
      }),
    );
    assert.throws(
      () => report(units),
      (error: unknown) =>
        error instanceof PoliceStayReportError && /too large to print/.test(error.message),
    );
  });
});

describe("Police stay report loader", () => {
  it("returns an empty register when the property has no overlapping stays", async () => {
    const db = fakeDb({
      restaurants: { single: { timezone: "Africa/Addis_Ababa", business_date: "2026-10-20" } },
      hotel_reservation_rooms: { rows: [] },
    });
    const result = await loadDataset(db, { stayDate: STAY });
    assert.deepEqual(result.rows, []);
    assert.equal(result.total, 0);
    assert.equal(result.summary.namedGuestCount, 0);
  });

  it("rejects a database error instead of returning an empty register", async () => {
    const db = fakeDb({
      restaurants: { single: { timezone: "Africa/Addis_Ababa", business_date: "2026-10-20" } },
      hotel_reservation_rooms: { error: "relation unavailable" },
    });
    await assert.rejects(
      () => loadDataset(db, { stayDate: STAY }),
      (error: unknown) => {
        assert.ok(error instanceof PoliceStayReportError);
        assert.equal(Array.isArray(error), false);
        return true;
      },
    );
  });

  it("keeps the read inside the property and ignores a profile that did not join", async () => {
    const db = fakeDb({
      restaurants: { single: { timezone: "Africa/Addis_Ababa", business_date: "2026-10-20" } },
      hotel_reservation_rooms: {
        rows: [
          {
            id: "unit-1",
            restaurant_id: PROPERTY,
            reservation_id: "res-1",
            arrival_date: "2026-10-19",
            departure_date: "2026-10-22",
            status: "checked_in",
            adults: 2,
            children: 0,
            infants: 1,
            room_id: "room-1",
            room_type_id: "type-1",
          },
          {
            id: "foreign-unit",
            restaurant_id: OTHER,
            reservation_id: "res-x",
            arrival_date: "2026-10-19",
            departure_date: "2026-10-22",
            status: "checked_in",
            adults: 1,
            children: 0,
            infants: 0,
            room_id: null,
            room_type_id: null,
          },
        ],
      },
      hotel_reservations: {
        rows: [
          {
            id: "res-1",
            restaurant_id: PROPERTY,
            confirmation_number: "RES-1001",
            reservation_mode: "single",
            source: "walk_in",
          },
        ],
      },
      hotel_reservation_room_guests: {
        rows: [
          { reservation_room_id: "unit-1", guest_id: "guest-1", restaurant_id: PROPERTY },
          { reservation_room_id: "unit-1", guest_id: "missing-profile", restaurant_id: PROPERTY },
        ],
      },
      guest_profiles: {
        rows: [
          {
            id: "guest-1",
            restaurant_id: PROPERTY,
            first_name: "Abebe",
            last_name: "Kebede",
            nationality: "Ethiopian",
            id_document_type: "passport",
            id_document_number: "P1",
          },
          {
            id: "guest-1",
            restaurant_id: OTHER,
            first_name: "Wrong",
            last_name: "Hotel",
          },
        ],
      },
      hotel_rooms: {
        rows: [
          {
            id: "room-1",
            restaurant_id: PROPERTY,
            room_number: "201",
            building: "Main",
            floor: "2",
          },
        ],
      },
      room_types: { rows: [{ id: "type-1", restaurant_id: PROPERTY, name: "Deluxe" }] },
    });
    const result = await loadDataset(db, { stayDate: STAY });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.guestName, "Abebe Kebede");
    assert.equal(result.rows[0]?.roomNumber, "201");
    assert.equal(result.rows[0]?.building, "Main");
    assert.equal(result.summary.unnamedOccupantCount, 1);
    assert.equal(result.context.timezone, "Africa/Addis_Ababa");
    assert.equal(result.context.businessDate, "2026-10-20");
    assert.ok(db.propertyFilters.every((value) => value === PROPERTY));
  });

  it("requires a Front Office manager before reading and does not catch failures as no rows", () => {
    const source = readFileSync(
      new URL("./police-stay-report.functions.ts", import.meta.url),
      "utf8",
    );
    const guard = source.indexOf("requireReservationManager");
    const load = source.indexOf("loadPoliceStayReport");
    assert.ok(guard >= 0 && load > guard);
    assert.match(source, /supabaseAdmin/);
    assert.match(source, /policeTrustedDb/);
    assert.doesNotMatch(source, /loadPoliceStayReport\(\s*context\.supabase/);
    assert.doesNotMatch(source, /catch[\s\S]*return \[\]/);
    assert.doesNotMatch(source, /window\.print|xlsx|jspdf|maskIdNumber/);
    const server = readFileSync(new URL("./police-stay-report.server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(server, /catch[\s\S]*return \[\]/);
    assert.doesNotMatch(
      readFileSync(new URL("./police-stay-report.ts", import.meta.url), "utf8"),
      /console\.(log|info|debug|warn|error)/,
    );
  });
});

function loadDataset(db: PoliceStayDb, filters: Parameters<typeof loadPoliceStayDataset>[2]) {
  return loadPoliceStayDataset(
    db,
    PROPERTY,
    filters,
    (persisted) => persisted?.slice(0, 10) || STAY,
  );
}

function fakeDb(
  tables: Record<
    string,
    { rows?: Record<string, unknown>[]; single?: Record<string, unknown>; error?: string }
  >,
): PoliceStayDb & { propertyFilters: string[] } {
  const propertyFilters: string[] = [];
  return {
    propertyFilters,
    from(table: string) {
      const spec = tables[table] ?? { rows: [] };
      return {
        select() {
          return new FakeQuery(spec, propertyFilters);
        },
      };
    },
  };
}

class FakeQuery implements PoliceStayQuery {
  spec: { rows?: Record<string, unknown>[]; single?: Record<string, unknown>; error?: string };
  propertyFilters: string[];

  constructor(
    spec: { rows?: Record<string, unknown>[]; single?: Record<string, unknown>; error?: string },
    propertyFilters: string[],
  ) {
    this.spec = spec;
    this.propertyFilters = propertyFilters;
  }

  eq(column: string, value: string): PoliceStayQuery {
    if (column === "restaurant_id" || column === "id") this.propertyFilters.push(value);
    return this;
  }

  in(): PoliceStayQuery {
    return this;
  }

  lte(): PoliceStayQuery {
    return this;
  }

  gt(): PoliceStayQuery {
    return this;
  }

  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message?: string } | null;
  }> {
    if (this.spec.error)
      return Promise.resolve({ data: null, error: { message: this.spec.error } });
    return Promise.resolve({ data: this.spec.single ?? null, error: null });
  }

  then<
    TResult1 = { data: Record<string, unknown>[] | null; error: { message?: string } | null },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((value: {
          data: Record<string, unknown>[] | null;
          error: { message?: string } | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const payload = this.spec.error
      ? { data: null, error: { message: this.spec.error } }
      : { data: this.spec.rows ?? [], error: null };
    return Promise.resolve(payload).then(onfulfilled, onrejected);
  }
}
