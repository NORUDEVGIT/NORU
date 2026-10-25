import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadGroupOperationalDetail, loadPickupStays } from "./groups.functions";
import { allotmentTotals, nightlyAllotment } from "./groups";
import {
  guestDisplayName,
  mapGroupOperationalUnit,
  unitContributesToGroupPickup,
} from "./groups-operational-detail";

type Row = Record<string, unknown>;

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function createFakeClient(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const fromCalls: string[] = [];

  const from = (table: string) => {
    fromCalls.push(table);
    const rows = [...(tables[table] ?? [])];
    const query: { filters: Array<(row: Row) => boolean> } = { filters: [] };
    const apply = () => rows.filter((row) => query.filters.every((filter) => filter(row)));
    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        query.filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        query.filters.push((row) => values.includes(row[column]));
        return api;
      },
      maybeSingle() {
        const matched = apply();
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve);
      },
    };
    return api;
  };

  return { tables, fromCalls, from };
}

const restaurantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const groupId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const twinBlock = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const suiteBlock = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const otherGroup = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function groupRow() {
  return {
    id: groupId,
    restaurant_id: restaurantId,
    confirmation_number: "GR-000002",
    name: "Ethiopian Airlines",
    code: "ET",
    group_type: "corporate",
    status: "tentative",
    company_master_id: null,
    travel_agent_master_id: null,
    group_account_master_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    leader_guest_id: null,
    arrival_date: "2026-11-01",
    departure_date: "2026-11-08",
    cutoff_date: "2026-10-31",
    external_reference: null,
    notes: null,
    source: "Direct",
    market_segment: "Corporate",
    rate_plan_id: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

function blockRow(id: string, roomTypeId: string, allotted: number, extra?: Partial<Row>): Row {
  return {
    id,
    restaurant_id: restaurantId,
    group_id: groupId,
    room_type_id: roomTypeId,
    start_date: "2026-11-01",
    end_date: "2026-11-08",
    allotted,
    cutoff_date: "2026-10-31",
    status: "active",
    ...extra,
  };
}

function header(id: string, extra?: Partial<Row>): Row {
  return {
    id,
    restaurant_id: restaurantId,
    confirmation_number: `RSV-${id}`,
    guest_id: "guest-1",
    arrival_date: "2026-11-01",
    departure_date: "2026-11-08",
    status: "confirmed",
    room_type_id: "twin",
    pms_group_id: groupId,
    pms_group_block_id: null,
    group_account_master_id: null,
    ...extra,
  };
}

function unit(id: string, reservationId: string, extra?: Partial<Row>): Row {
  return {
    id,
    restaurant_id: restaurantId,
    reservation_id: reservationId,
    room_type_id: "twin",
    room_id: null,
    arrival_date: "2026-11-01",
    departure_date: "2026-11-08",
    status: "confirmed",
    pms_group_block_id: twinBlock,
    ...extra,
  };
}

function seeded(input: {
  reservations?: Row[];
  units?: Row[];
  blocks?: Row[];
  guests?: Row[];
  rooms?: Row[];
}) {
  return createFakeClient({
    pms_groups: [groupRow()],
    pms_group_blocks: input.blocks ?? [blockRow(twinBlock, "twin", 10)],
    hotel_reservations: input.reservations ?? [],
    hotel_reservation_rooms: input.units ?? [],
    guest_profiles: input.guests ?? [
      {
        id: "guest-1",
        restaurant_id: restaurantId,
        first_name: "John",
        last_name: "Doe",
      },
    ],
    hotel_rooms: input.rooms ?? [],
    room_types: [
      { id: "twin", restaurant_id: restaurantId, name: "Twin" },
      { id: "suite", restaurant_id: restaurantId, name: "Suite" },
      { id: "master", restaurant_id: restaurantId, name: "Master Type" },
    ],
  });
}

describe("GB06-R01 group operational detail", () => {
  it("returns one unit row for a single-room linked reservation", async () => {
    const client = seeded({
      reservations: [header("res-1")],
      units: [unit("u-1", "res-1")],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units).toHaveLength(1);
    expect(detail.units[0]).toMatchObject({
      reservationId: "res-1",
      reservationRoomId: "u-1",
      confirmationNumber: "RSV-res-1",
      contributesToPickup: true,
    });
  });

  it("returns every unit of a multi-room reservation", async () => {
    const client = seeded({
      reservations: [header("res-1")],
      units: [unit("u-1", "res-1"), unit("u-2", "res-1"), unit("u-3", "res-1")],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units.map((row) => row.reservationRoomId)).toEqual(["u-1", "u-2", "u-3"]);
  });

  it("counts two units on the same block as two pickup contributors", async () => {
    const client = seeded({
      reservations: [header("res-1")],
      units: [unit("u-1", "res-1"), unit("u-2", "res-1")],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units.filter((row) => row.contributesToPickup)).toHaveLength(2);
    expect(detail.blocks[0]?.totals.pickedUp).toBe(2);
  });

  it("maps mixed Twin and Suite units to different blocks", async () => {
    const client = seeded({
      blocks: [blockRow(twinBlock, "twin", 10), blockRow(suiteBlock, "suite", 3)],
      reservations: [header("res-mix", { room_type_id: "master", pms_group_block_id: null })],
      units: [
        unit("u-twin-1", "res-mix"),
        unit("u-twin-2", "res-mix"),
        unit("u-suite", "res-mix", {
          room_type_id: "suite",
          pms_group_block_id: suiteBlock,
        }),
      ],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units).toHaveLength(3);
    expect(detail.units.filter((row) => row.blockId === twinBlock)).toHaveLength(2);
    expect(detail.units.filter((row) => row.blockId === suiteBlock)).toHaveLength(1);
    expect(detail.blocks.find((block) => block.id === twinBlock)?.totals.pickedUp).toBe(2);
    expect(detail.blocks.find((block) => block.id === suiteBlock)?.totals.pickedUp).toBe(1);
  });

  it("returns group-only units with null blockId and no allotment pickup", async () => {
    const client = seeded({
      reservations: [header("res-g")],
      units: [unit("u-g", "res-g", { pms_group_block_id: null })],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units[0]).toMatchObject({
      blockId: null,
      isGroupOnlyLink: true,
      contributesToPickup: false,
    });
    expect(detail.blocks[0]?.totals.pickedUp).toBe(0);
  });

  it("does not count cancelled, no-show, or checked-out units toward pickup", async () => {
    const client = seeded({
      reservations: [
        header("res-c", { status: "cancelled" }),
        header("res-n", { status: "no_show" }),
        header("res-o", { status: "checked_out" }),
        header("res-p", { status: "pending" }),
        header("res-f", { status: "confirmed" }),
        header("res-i", { status: "checked_in" }),
      ],
      units: [
        unit("u-c", "res-c", { status: "cancelled" }),
        unit("u-n", "res-n", { status: "no_show" }),
        unit("u-o", "res-o", { status: "checked_out" }),
        unit("u-p", "res-p", { status: "pending" }),
        unit("u-f", "res-f", { status: "confirmed" }),
        unit("u-i", "res-i", { status: "checked_in" }),
      ],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    const byId = Object.fromEntries(detail.units.map((row) => [row.reservationRoomId, row]));
    expect(byId["u-c"]?.contributesToPickup).toBe(false);
    expect(byId["u-n"]?.contributesToPickup).toBe(false);
    expect(byId["u-o"]?.contributesToPickup).toBe(false);
    expect(byId["u-p"]?.contributesToPickup).toBe(true);
    expect(byId["u-f"]?.contributesToPickup).toBe(true);
    expect(byId["u-i"]?.contributesToPickup).toBe(true);
    expect(detail.blocks[0]?.totals.pickedUp).toBe(3);
  });

  it("returns assigned room numbers and null when unassigned", async () => {
    const client = seeded({
      reservations: [header("res-1")],
      units: [
        unit("u-assigned", "res-1", { room_id: "room-101" }),
        unit("u-open", "res-1", { room_id: null }),
      ],
      rooms: [{ id: "room-101", restaurant_id: restaurantId, room_number: "101" }],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    const assigned = detail.units.find((row) => row.reservationRoomId === "u-assigned");
    const open = detail.units.find((row) => row.reservationRoomId === "u-open");
    expect(assigned).toMatchObject({ roomId: "room-101", roomNumber: "101" });
    expect(open).toMatchObject({ roomId: null, roomNumber: null });
  });

  it("uses the unit room type rather than the reservation master type", async () => {
    const client = seeded({
      reservations: [header("res-1", { room_type_id: "master" })],
      units: [unit("u-1", "res-1", { room_type_id: "suite", pms_group_block_id: suiteBlock })],
      blocks: [blockRow(suiteBlock, "suite", 2)],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units[0]).toMatchObject({
      roomTypeId: "suite",
      roomTypeName: "Suite",
    });
    expect(detail.units[0]?.roomTypeName).not.toBe("Master Type");
  });

  it("loads guest names from guest profiles and ignores guest-account master links", async () => {
    const client = seeded({
      reservations: [
        header("res-1", { guest_id: "guest-1" }),
        header("res-account", {
          id: "res-account",
          confirmation_number: "RSV-account",
          guest_id: "guest-2",
          pms_group_id: otherGroup,
          group_account_master_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        }),
      ],
      units: [unit("u-1", "res-1"), unit("u-account", "res-account", { pms_group_block_id: null })],
      guests: [
        { id: "guest-1", restaurant_id: restaurantId, first_name: "John", last_name: "Doe" },
        { id: "guest-2", restaurant_id: restaurantId, first_name: "Other", last_name: "Guest" },
      ],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    expect(detail.units).toHaveLength(1);
    expect(detail.units[0]?.guestName).toBe("John Doe");
    expect(detail.units.some((row) => row.reservationId === "res-account")).toBe(false);
    expect(guestDisplayName("Ada", "Lovelace")).toBe("Ada Lovelace");
    expect(guestDisplayName(null, null)).toBeNull();
  });

  it("keeps block totals aligned with the existing pickup helper", async () => {
    const client = seeded({
      reservations: [header("res-1")],
      units: [
        unit("u-1", "res-1", {
          arrival_date: "2026-11-01",
          departure_date: "2026-11-03",
        }),
        unit("u-2", "res-1", {
          arrival_date: "2026-11-05",
          departure_date: "2026-11-07",
        }),
      ],
    });
    const detail = await loadGroupOperationalDetail(client, restaurantId, groupId);
    const stays = await loadPickupStays(client, restaurantId, twinBlock);
    const totals = allotmentTotals(
      nightlyAllotment({
        allotted: 10,
        startDate: "2026-11-01",
        endDate: "2026-11-08",
        stays,
      }),
    );
    expect(detail.blocks[0]?.totals).toEqual(totals);
    expect(detail.units.filter((row) => row.contributesToPickup)).toHaveLength(2);
    expect(totals.pickedUp).toBe(1);
  });

  it("does not introduce an N+1 query pattern and keeps the Front Office read guard", () => {
    const functions = source("src/packages/pms/lib/groups.functions.ts");
    const loaderStart = functions.indexOf("export async function loadGroupOperationalDetail");
    const loaderEnd = functions.indexOf("export const getGroupOperationalDetail");
    const loader = functions.slice(loaderStart, loaderEnd);
    expect(loader).toContain('.in("reservation_id", headerIds)');
    expect(loader).toContain('"pms_group_block_id"');
    expect(loader).toContain("guestIds");
    expect(loader).toContain("roomIds");
    expect(loader).not.toMatch(/for\s*\([^)]+\)\s*\{[\s\S]*await db\(/);
    expect(loader).not.toContain("group_account_master_id");
    const serverFn = functions.slice(loaderEnd, loaderEnd + 600);
    expect(serverFn).toContain("requireReservationManager");
    expect(serverFn).not.toContain("requireGroupWriter");
    expect(functions).toContain("export const getGroup");
    expect(functions).toContain(
      "await requireReservationManager(context as never, data.restaurantId)",
    );
  });

  it("maps contribution from the shared pickup status rule", () => {
    const ids = new Set([twinBlock]);
    expect(
      unitContributesToGroupPickup({ status: "pending", blockId: twinBlock, groupBlockIds: ids }),
    ).toBe(true);
    expect(
      unitContributesToGroupPickup({ status: "cancelled", blockId: twinBlock, groupBlockIds: ids }),
    ).toBe(false);
    expect(
      unitContributesToGroupPickup({ status: "confirmed", blockId: null, groupBlockIds: ids }),
    ).toBe(false);
    const mapped = mapGroupOperationalUnit({
      unit: {
        id: "u-1",
        reservation_id: "res-1",
        room_type_id: "twin",
        room_id: null,
        arrival_date: "2026-11-01",
        departure_date: "2026-11-08",
        status: "confirmed",
        pms_group_block_id: null,
      },
      header: {
        id: "res-1",
        confirmation_number: "RSV-1",
        guest_id: null,
        pms_group_id: groupId,
        status: "confirmed",
      },
      groupId,
      groupBlockIds: ids,
      blockLabel: "Twin",
      guestName: null,
      roomNumber: null,
      roomTypeName: "Twin",
    });
    expect(mapped.isGroupOnlyLink).toBe(true);
    expect(mapped.contributesToPickup).toBe(false);
  });
});
