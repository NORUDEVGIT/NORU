import { describe, expect, it } from "vitest";

import {
  assertGroupStayPickup,
  assertGroupUnitsPickup,
  loadPickupStays,
  releaseGroupBlocksPastCutoff,
  resyncGroupBlockInventoryForReservation,
} from "./groups.functions";

type Row = Record<string, unknown>;

function createFakeClient(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const rpcs: string[] = [];

  const from = (table: string) => {
    const rows = [...(tables[table] ?? [])];
    const query: {
      filters: Array<(row: Row) => boolean>;
      pendingInsert?: Row;
      pendingUpdate?: Row;
      pendingDelete?: boolean;
    } = { filters: [] };

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
      is(column: string, value: unknown) {
        query.filters.push((row) => row[column] === value);
        return api;
      },
      or() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      insert(values: Row) {
        query.pendingInsert = values;
        return api;
      },
      update(values: Row) {
        query.pendingUpdate = values;
        return api;
      },
      delete() {
        query.pendingDelete = true;
        return api;
      },
      maybeSingle() {
        return Promise.resolve(commit()).then((result) => ({
          data: (result.data ?? [])[0] ?? null,
          error: result.error,
        }));
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        return Promise.resolve(commit()).then(resolve);
      },
    };

    function commit() {
      if (query.pendingInsert) {
        const row = { id: `${table}-${(tables[table] ?? []).length + 1}`, ...query.pendingInsert };
        tables[table] = [...(tables[table] ?? []), row];
        return { data: [row], error: null };
      }
      if (query.pendingUpdate) {
        const matched = apply();
        for (const row of matched) Object.assign(row, query.pendingUpdate);
        return { data: matched, error: null };
      }
      if (query.pendingDelete) {
        const matched = new Set(apply());
        tables[table] = (tables[table] ?? []).filter((row) => !matched.has(row));
        return { data: [], error: null };
      }
      return { data: apply(), error: null };
    }

    return api;
  };

  return {
    tables,
    rpcs,
    from,
    rpc: async (name: string) => {
      rpcs.push(name);
      return { data: `block-${rpcs.length}`, error: null };
    },
  };
}

describe("GB01/GB02 group inventory lifecycle", () => {
  const restaurantId = "rest-1";
  const blockId = "block-twin";
  const groupId = "group-1";

  function seeded(
    stays: Array<{ id: string; status: string; units: number; unitStatus?: string }>,
  ) {
    const reservations: Row[] = stays.map((stay) => ({
      id: stay.id,
      restaurant_id: restaurantId,
      arrival_date: "2026-10-01",
      departure_date: "2026-10-04",
      status: stay.status,
      pms_group_id: groupId,
      pms_group_block_id: blockId,
    }));
    const rooms: Row[] = stays.flatMap((stay) =>
      Array.from({ length: stay.units }, (_, index) => ({
        id: `${stay.id}-u${index + 1}`,
        restaurant_id: restaurantId,
        reservation_id: stay.id,
        unit_sequence: index + 1,
        arrival_date: "2026-10-01",
        departure_date: "2026-10-04",
        status: stay.unitStatus ?? stay.status,
        pms_group_block_id: blockId,
        room_type_id: "twin",
      })),
    );
    return createFakeClient({
      hotel_reservations: reservations,
      hotel_reservation_rooms: rooms,
      pms_group_blocks: [
        {
          id: blockId,
          restaurant_id: restaurantId,
          group_id: groupId,
          room_type_id: "twin",
          start_date: "2026-10-01",
          end_date: "2026-10-04",
          allotted: 10,
          cutoff_date: "2026-10-20",
          status: "active",
        },
      ],
      pms_groups: [{ id: groupId, restaurant_id: restaurantId, cutoff_date: null }],
      pms_group_allotment_nights: [],
      pms_group_history: [],
    });
  }

  it("counts a 3-unit reservation as pickup 3", async () => {
    const client = seeded([{ id: "res-1", status: "confirmed", units: 3 }]);
    const stays = await loadPickupStays(client, restaurantId, blockId);
    expect(stays).toHaveLength(3);
  });

  it("counts Twin + Suite units against their own blocks", async () => {
    const client = createFakeClient({
      hotel_reservations: [
        {
          id: "res-mix",
          restaurant_id: restaurantId,
          arrival_date: "2026-10-01",
          departure_date: "2026-10-03",
          status: "confirmed",
          pms_group_id: groupId,
          pms_group_block_id: null,
        },
      ],
      hotel_reservation_rooms: [
        {
          id: "u-twin",
          restaurant_id: restaurantId,
          reservation_id: "res-mix",
          arrival_date: "2026-10-01",
          departure_date: "2026-10-03",
          status: "confirmed",
          pms_group_block_id: "block-twin",
          room_type_id: "twin",
        },
        {
          id: "u-suite",
          restaurant_id: restaurantId,
          reservation_id: "res-mix",
          arrival_date: "2026-10-01",
          departure_date: "2026-10-03",
          status: "confirmed",
          pms_group_block_id: "block-suite",
          room_type_id: "suite",
        },
      ],
      pms_group_blocks: [
        {
          id: "block-twin",
          restaurant_id: restaurantId,
          group_id: groupId,
          room_type_id: "twin",
          start_date: "2026-10-01",
          end_date: "2026-10-03",
          allotted: 5,
          status: "active",
        },
        {
          id: "block-suite",
          restaurant_id: restaurantId,
          group_id: groupId,
          room_type_id: "suite",
          start_date: "2026-10-01",
          end_date: "2026-10-03",
          allotted: 2,
          status: "active",
        },
      ],
      pms_groups: [{ id: groupId, restaurant_id: restaurantId, cutoff_date: null }],
      pms_group_allotment_nights: [],
      pms_group_history: [],
    });
    expect(await loadPickupStays(client, restaurantId, "block-twin")).toHaveLength(1);
    expect(await loadPickupStays(client, restaurantId, "block-suite")).toHaveLength(1);
  });

  it("invokes syncBlockInventory after a linked cancel", async () => {
    const client = seeded([
      { id: "res-1", status: "cancelled", units: 1, unitStatus: "cancelled" },
      { id: "res-2", status: "confirmed", units: 1 },
      { id: "res-3", status: "confirmed", units: 1 },
      { id: "res-4", status: "confirmed", units: 1 },
    ]);
    await resyncGroupBlockInventoryForReservation(client, "mem-1", restaurantId, "res-1");
    expect(client.rpcs.filter((name) => name === "pms_create_operational_block")).toHaveLength(3);
    expect(
      client.tables.pms_group_history.some((row) => row.event_type === "inventory_resync"),
    ).toBe(true);
  });

  it("does not call inventory RPCs for a group-only link", async () => {
    const client = createFakeClient({
      hotel_reservations: [
        {
          id: "res-g",
          restaurant_id: restaurantId,
          pms_group_id: groupId,
          pms_group_block_id: null,
          status: "confirmed",
        },
      ],
      hotel_reservation_rooms: [
        {
          id: "res-g-u1",
          restaurant_id: restaurantId,
          reservation_id: "res-g",
          pms_group_block_id: null,
          status: "confirmed",
        },
      ],
      pms_group_blocks: [],
      pms_group_history: [],
    });
    await resyncGroupBlockInventoryForReservation(client, "mem-1", restaurantId, "res-g");
    expect(client.rpcs).toEqual([]);
  });

  it("rejects a block-linked amend that leaves the block", async () => {
    const client = seeded([{ id: "res-1", status: "confirmed", units: 1 }]);
    await expect(
      assertGroupStayPickup(client, {
        restaurantId,
        pmsGroupId: groupId,
        pmsGroupBlockId: blockId,
        roomTypeId: "twin",
        proposed: { arrivalDate: "2026-11-01", departureDate: "2026-11-03", status: "confirmed" },
        excludeReservationRoomIds: ["res-1-u1"],
      }),
    ).rejects.toThrow(/inside the group room block/);
  });

  it("rejects over-pickup of remaining allotment", async () => {
    const client = seeded([
      { id: "res-1", status: "confirmed", units: 1 },
      { id: "res-2", status: "confirmed", units: 1 },
    ]);
    client.tables.pms_group_blocks[0]!.allotted = 2;
    await expect(
      assertGroupUnitsPickup(client, {
        restaurantId,
        pmsGroupId: groupId,
        units: [
          {
            roomTypeId: "twin",
            blockId,
            proposed: { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "pending" },
          },
        ],
      }),
    ).rejects.toThrow(/over-pick/);
  });

  it("releases unused remaining at cutoff without dropping pickup stays", async () => {
    const client = seeded([
      { id: "res-1", status: "confirmed", units: 1 },
      { id: "res-2", status: "confirmed", units: 1 },
      { id: "res-3", status: "pending", units: 1 },
      { id: "res-4", status: "checked_in", units: 1 },
    ]);
    client.tables.pms_group_blocks[0]!.cutoff_date = "2026-10-20";
    const result = await releaseGroupBlocksPastCutoff(client, "mem-1", restaurantId, "2026-10-21");
    expect(result.released).toBe(1);
    expect(client.tables.pms_group_blocks[0]!.allotted).toBe(4);
    expect(client.tables.pms_group_blocks[0]!.status).toBe("active");
    expect(await loadPickupStays(client, restaurantId, blockId)).toHaveLength(4);
    expect(
      client.tables.pms_group_history.some(
        (row) => typeof row.notes === "string" && row.notes.includes("cutoff_auto_release"),
      ),
    ).toBe(true);
  });

  it("skips Night Audit cutoff when the block has no cutoff date", async () => {
    const client = seeded([{ id: "res-1", status: "confirmed", units: 1 }]);
    client.tables.pms_group_blocks[0]!.cutoff_date = null;
    client.tables.pms_groups[0]!.cutoff_date = null;
    const result = await releaseGroupBlocksPastCutoff(client, "mem-1", restaurantId, "2026-10-21");
    expect(result.released).toBe(0);
    expect(client.tables.pms_group_blocks[0]!.allotted).toBe(10);
  });
});
