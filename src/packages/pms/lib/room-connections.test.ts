import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ConnectingReviewPanel,
  RoomConnectionsView,
  RoomTypeConnectingRooms,
} from "@/packages/pms/components/rooms/room-connections-panels";
import {
  CONNECTING_RULE_WITHOUT_PAIRS,
  CONTAINS_CONNECTING_ROOMS_HELP,
  CONTAINS_CONNECTING_ROOMS_LABEL,
  CROSS_BUILDING_LINK_WARNING,
  MAX_ROOM_CONNECTIONS,
  ROOM_LINK_DIFFERENT_BUILDINGS,
  ROOM_LINK_INACTIVE,
  ROOM_LINK_OTHER_PROPERTY,
  ROOM_LINK_SELF,
  TYPE_CONNECTING_ROOMS_WITHOUT_GUIDANCE,
  TYPE_GUIDANCE_WITHOUT_CONNECTING_ROOMS,
  addRoomConnectionWith,
  buildConnectingReview,
  connectingRoomCount,
  connectingValidationWarnings,
  connectionCandidates,
  connectionRoomLabel,
  removeConnectionConfirmText,
  removeRoomConnectionWith,
  roomTypeConnectingHint,
  type ConnectionRoom,
  type RoomLinkStore,
  type StoredRoomLink,
} from "./room-connections";

/**
 * Phase 5B: physical room connections are undirected and maintained through
 * dedicated add / remove actions.
 *
 * The migration checks execute 0064's table DDL and 0211 in PGlite. Run with:
 *   PGLITE_MODULE=/tmp/pgl/node_modules/@electric-sql/pglite/dist/index.js \
 *     npx vitest run src/packages/pms/lib/room-connections.test.ts
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const MIGRATION_NAME = "0211_room_link_undirected_pairs.sql";
const MIGRATION = read(`supabase/migrations/${MIGRATION_NAME}`);

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

function room(id: string, number: string, extra: Partial<ConnectionRoom> = {}): ConnectionRoom {
  return {
    id,
    roomNumber: number,
    roomTypeId: "type-king",
    roomTypeName: "Deluxe King",
    active: true,
    buildingId: "b-main",
    building: "Main building",
    floorId: "f-3",
    floor: "Floor 3",
    ...extra,
  };
}

/* ------------------------------------------------------------ migration */

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

async function loadPglite(): Promise<(new () => Db) | null> {
  const specifier = process.env["PGLITE_MODULE"] ?? "@electric-sql/pglite";
  try {
    const mod = (await import(/* @vite-ignore */ specifier)) as { PGlite: new () => Db };
    return mod.PGlite;
  } catch {
    return null;
  }
}

const PGlite = await loadPglite();

function linksTableDdl(): string {
  const source = read("supabase/migrations/0064_pms_card2_room_types_rooms.sql");
  const start = source.indexOf("CREATE TABLE IF NOT EXISTS public.hotel_room_links");
  const end = source.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_room_links");
  return source.slice(start, end);
}

const STUB = `
  CREATE TABLE public.restaurants (id uuid PRIMARY KEY);
  CREATE TABLE public.hotel_rooms (
    id uuid PRIMARY KEY,
    restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
    UNIQUE (id, restaurant_id)
  );
  INSERT INTO public.restaurants VALUES ('${P1}'), ('${P2}');
  INSERT INTO public.hotel_rooms VALUES
    ('10000000-0000-4000-8000-000000000301', '${P1}'),
    ('10000000-0000-4000-8000-000000000302', '${P1}'),
    ('10000000-0000-4000-8000-000000000303', '${P1}'),
    ('20000000-0000-4000-8000-000000000101', '${P2}');
`;
const R301 = "10000000-0000-4000-8000-000000000301";
const R302 = "10000000-0000-4000-8000-000000000302";
const R303 = "10000000-0000-4000-8000-000000000303";
const OTHER_PROPERTY_ROOM = "20000000-0000-4000-8000-000000000101";

describe("0211 migration source", () => {
  it("is mirrored byte for byte in both migration lanes", () => {
    expect(read(`drizzle/migrations/${MIGRATION_NAME}`)).toBe(MIGRATION);
  });

  it("adds one undirected pair index and rewrites no rows", () => {
    expect(MIGRATION).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS hotel_room_links_undirected_pair_unique\s+ON public\.hotel_room_links \(\s*restaurant_id,\s*LEAST\(room_id, other_room_id\),\s*GREATEST\(room_id, other_room_id\)\s*\)/,
    );
    const code = MIGRATION.replace(/^\s*--.*$/gm, "");
    expect(code).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/);
    expect(code).not.toMatch(
      /connecting_room_required|pms_evaluate_room_assignment|hotel_reservation_rooms/,
    );
  });
});

describe.skipIf(!PGlite)("0211 executed against the 0064 table", () => {
  async function fresh(): Promise<Db> {
    const db = new PGlite!();
    await db.exec(STUB);
    await db.exec(linksTableDdl());
    return db;
  }

  async function failure(db: Db, sql: string): Promise<string | null> {
    try {
      await db.exec(sql);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  const insert = (a: string, b: string, kind: string, restaurant = P1) =>
    `INSERT INTO public.hotel_room_links (restaurant_id, room_id, other_room_id, kind) VALUES ('${restaurant}', '${a}', '${b}', '${kind}');`;

  it("keeps existing rows and enforces one row per undirected pair", async () => {
    const db = await fresh();
    await db.exec(insert(R301, R302, "connecting"));
    await db.exec(MIGRATION);

    const kept = await db.query<{ room_id: string; other_room_id: string; kind: string }>(
      "SELECT room_id, other_room_id, kind FROM public.hotel_room_links",
    );
    expect(kept.rows).toEqual([{ room_id: R301, other_room_id: R302, kind: "connecting" }]);

    expect(await failure(db, insert(R302, R301, "connecting"))).toMatch(
      /hotel_room_links_undirected_pair_unique/,
    );
    expect(await failure(db, insert(R301, R302, "adjacent"))).toMatch(
      /hotel_room_links_undirected_pair_unique/,
    );
    expect(await failure(db, insert(R302, R301, "adjacent"))).toMatch(
      /hotel_room_links_undirected_pair_unique/,
    );
    expect(await failure(db, insert(R303, R303, "connecting"))).toMatch(
      /hotel_room_links_distinct_check/,
    );
    expect(await failure(db, insert(R301, OTHER_PROPERTY_ROOM, "connecting"))).toMatch(
      /hotel_room_links_other_fk/,
    );

    await db.exec(insert(R303, R301, "adjacent"));
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.hotel_room_links",
    );
    expect(count.rows[0]?.n).toBe(2);
  });

  it("stops without rewriting anything when a pair is already stored twice", async () => {
    const db = await fresh();
    await db.exec(insert(R301, R302, "connecting"));
    await db.exec(insert(R302, R301, "connecting"));
    expect(await failure(db, MIGRATION)).toMatch(/stored more than once/);
    const count = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.hotel_room_links",
    );
    expect(count.rows[0]?.n).toBe(2);
  });
});

describe.skipIf(Boolean(PGlite))("0211 executed against the 0064 table", () => {
  it.skip("needs @electric-sql/pglite (see the comment at the top of this file)", () => {});
});

/* ------------------------------------------------------- add / remove */

function memoryStore(
  rooms: Array<ConnectionRoom & { restaurantId: string }>,
  links: Array<StoredRoomLink & { restaurantId: string }>,
  restaurantId = P1,
) {
  const state = { links: [...links], inserted: 0, deleted: [] as string[] };
  const store: RoomLinkStore = {
    async loadRooms(ids) {
      return rooms.filter((row) => row.restaurantId === restaurantId && ids.includes(row.id));
    },
    async loadLinksTouching(ids) {
      return state.links.filter(
        (link) =>
          link.restaurantId === restaurantId &&
          (ids.includes(link.roomId) || ids.includes(link.otherRoomId)),
      );
    },
    async insertLink(row) {
      state.inserted += 1;
      const id = `link-${state.links.length + 1}`;
      state.links.push({ id, restaurantId, ...row });
      return { ok: true, id };
    },
    async loadLink(linkId) {
      return (
        state.links.find((link) => link.restaurantId === restaurantId && link.id === linkId) ?? null
      );
    },
    async deleteLink(linkId) {
      const before = state.links.length;
      state.links = state.links.filter(
        (link) => !(link.restaurantId === restaurantId && link.id === linkId),
      );
      state.deleted.push(linkId);
      return state.links.length === before - 1;
    },
  };
  return { store, state };
}

const A = { ...room("a", "301"), restaurantId: P1 };
const B = { ...room("b", "302", { roomTypeName: "Deluxe Twin" }), restaurantId: P1 };
const C = { ...room("c", "303"), restaurantId: P1 };
const OTHER_FLOOR = { ...room("d", "401", { floorId: "f-4", floor: "Floor 4" }), restaurantId: P1 };
const OTHER_BUILDING = {
  ...room("e", "101", {
    buildingId: "b-2",
    building: "Building 2",
    floorId: "f-1",
    floor: "Floor 1",
  }),
  restaurantId: P1,
};
const UNKNOWN = {
  ...room("u", "501", { buildingId: null, building: null, floorId: null, floor: null }),
  restaurantId: P1,
};
const INACTIVE = { ...room("i", "309", { active: false }), restaurantId: P1 };
const ELSEWHERE = { ...room("x", "201"), restaurantId: P2 };
const ROOMS = [A, B, C, OTHER_FLOOR, OTHER_BUILDING, UNKNOWN, INACTIVE, ELSEWHERE];
const PROPERTY_ROOMS = ROOMS.filter((row) => row.restaurantId === P1);

describe("add room connection", () => {
  it("adds a same-property connection with no warnings", async () => {
    const { store, state } = memoryStore(ROOMS, []);
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "b", kind: "connecting" }),
    ).toEqual({
      ok: true,
      warnings: [],
    });
    expect(state.links).toHaveLength(1);
  });

  it("rejects a self-link, another property's room and an inactive room", async () => {
    const { store, state } = memoryStore(ROOMS, []);
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "a", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: ROOM_LINK_SELF,
    });
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "x", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: ROOM_LINK_OTHER_PROPERTY,
    });
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "i", kind: "adjacent" }),
    ).toEqual({
      ok: false,
      message: ROOM_LINK_INACTIVE,
    });
    expect(state.inserted).toBe(0);
  });

  it("blocks rooms in different known buildings", async () => {
    const { store, state } = memoryStore(ROOMS, []);
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "e", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: ROOM_LINK_DIFFERENT_BUILDINGS,
    });
    expect(ROOM_LINK_DIFFERENT_BUILDINGS).toBe(
      "Connecting or adjacent rooms must be in the same building.",
    );
    expect(state.inserted).toBe(0);
  });

  it("warns but saves across floors and when the location is unknown", async () => {
    const { store } = memoryStore(ROOMS, []);
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "d", kind: "connecting" }),
    ).toEqual({
      ok: true,
      warnings: ["Connecting rooms are normally on the same floor."],
    });
    const unknown = await addRoomConnectionWith(store, {
      roomId: "a",
      otherRoomId: "u",
      kind: "adjacent",
    });
    expect(unknown.ok).toBe(true);
    expect(unknown.ok && unknown.warnings).toEqual([
      "Building is not recorded for Room 501. Confirm both rooms are in the same building.",
      "Floor is not recorded for Room 501.",
    ]);
  });

  it("rejects the same pair in either direction, with the same or the other kind", async () => {
    const existing = [
      { id: "l1", restaurantId: P1, roomId: "b", otherRoomId: "a", kind: "connecting" as const },
    ];
    const { store, state } = memoryStore(ROOMS, existing);
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "b", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: "Room 301 and Room 302 already have a Connecting connection.",
    });
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "b", kind: "adjacent" }),
    ).toEqual({
      ok: false,
      message:
        "Room 301 and Room 302 already have a Connecting connection. Remove it before adding an Adjacent connection.",
    });
    expect(state.inserted).toBe(0);
  });

  it(`allows multiple partners up to ${MAX_ROOM_CONNECTIONS} per room`, async () => {
    const extra = ["f", "g", "h", "j"].map((id, index) => ({
      ...room(id, `31${index}`),
      restaurantId: P1,
    }));
    const { store } = memoryStore([...ROOMS, ...extra], []);
    for (const target of extra) {
      expect(
        (
          await addRoomConnectionWith(store, {
            roomId: "a",
            otherRoomId: target.id,
            kind: "adjacent",
          })
        ).ok,
      ).toBe(true);
    }
    expect(
      await addRoomConnectionWith(store, { roomId: "a", otherRoomId: "b", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: "Room 301 already has 4 connections. Remove one before adding another.",
    });
    expect(
      await addRoomConnectionWith(store, { roomId: "b", otherRoomId: "a", kind: "connecting" }),
    ).toEqual({
      ok: false,
      message: "Room 301 already has 4 connections. Remove one before adding another.",
    });
  });
});

describe("remove room connection", () => {
  const links = () => [
    { id: "l1", restaurantId: P1, roomId: "a", otherRoomId: "b", kind: "connecting" as const },
    { id: "l2", restaurantId: P1, roomId: "a", otherRoomId: "c", kind: "adjacent" as const },
    { id: "l3", restaurantId: P1, roomId: "c", otherRoomId: "b", kind: "adjacent" as const },
  ];

  it("removes the single stored row from either room, leaving the others", async () => {
    for (const from of ["a", "b"]) {
      const { store, state } = memoryStore(ROOMS, links());
      expect(await removeRoomConnectionWith(store, { roomId: from, linkId: "l1" })).toEqual({
        ok: true,
        warnings: [],
      });
      expect(state.deleted).toEqual(["l1"]);
      expect(state.links.map((link) => link.id)).toEqual(["l2", "l3"]);
    }
  });

  it("refuses a link that is not on the room or not in the property", async () => {
    const { store, state } = memoryStore(ROOMS, [
      ...links(),
      { id: "l9", restaurantId: P2, roomId: "x", otherRoomId: "y", kind: "connecting" },
    ]);
    expect((await removeRoomConnectionWith(store, { roomId: "d", linkId: "l1" })).ok).toBe(false);
    expect((await removeRoomConnectionWith(store, { roomId: "x", linkId: "l9" })).ok).toBe(false);
    expect(state.deleted).toEqual([]);
  });

  it("confirms with room numbers and the kind", () => {
    expect(removeConnectionConfirmText("connecting", "301", "302")).toBe(
      "Remove the Connecting connection between Room 301 and Room 302?",
    );
  });
});

describe("server actions", () => {
  const source = read("src/packages/pms/lib/room-connections.functions.ts");

  it("are dedicated, authorised and property-scoped", () => {
    expect(source).toMatch(/export const addRoomConnection = createServerFn/);
    expect(source).toMatch(/export const removeRoomConnection = createServerFn/);
    expect(source.match(/PMS_PERMISSIONS\.CONFIG_ROOMS_OPS_CONFIGURE/g)).toHaveLength(2);
    expect(source).toMatch(/requireSupabaseAuth/);
    expect(source.match(/\.eq\("restaurant_id", restaurantId\)/g)!.length).toBeGreaterThanOrEqual(
      5,
    );
    expect(source).toMatch(
      /\.delete\(\)\s*\.eq\("restaurant_id", restaurantId\)\s*\.eq\("id", linkId\)/,
    );
  });

  it("saveRoom no longer replaces links from one side", () => {
    const rooms = read("src/packages/pms/lib/rooms.functions.ts");
    expect(rooms).not.toMatch(/replaceRoomLinks|roomLinkInput|data\.links/);
    expect(rooms).not.toMatch(/from\("hotel_room_links"\)\s*\.insert/);
  });
});

/* ---------------------------------------------------------- two-way reads */

describe("two-way reads", () => {
  it("listRooms lists each stored row on both rooms", () => {
    const rooms = read("src/packages/pms/lib/rooms.functions.ts");
    const start = rooms.indexOf("export const listRooms");
    const listRooms = rooms.slice(start, rooms.indexOf("export const saveRoom = ", start));
    expect(listRooms).not.toMatch(/\.in\("room_id", roomIds\)/);
    expect(listRooms).toContain(
      "addLink(link.room_id, { id: link.id, otherRoomId: link.other_room_id, kind })",
    );
    expect(listRooms).toContain(
      "addLink(link.other_room_id, { id: link.id, otherRoomId: link.room_id, kind })",
    );
  });

  it("the Room context badge reads the two-way room links", () => {
    const rules = read("src/packages/pms/components/rooms/room-inventory-rules.tsx");
    expect(rules).toMatch(/room\.links\.some\(\(link\) => link\.kind === "connecting"\)/);
    expect(rules).toMatch(/useServerFn\(listRooms\)/);
  });

  it("a row stored A→B shows on both rooms in Room Configuration", () => {
    const stored = [{ id: "l1", roomId: "a", otherRoomId: "b", kind: "connecting" as const }];
    expect(connectionCandidates(A, PROPERTY_ROOMS, stored).map((row) => row.id)).not.toContain("b");
    expect(connectionCandidates(B, PROPERTY_ROOMS, stored).map((row) => row.id)).not.toContain("a");
  });
});

/* -------------------------------------------------- Room Configuration */

describe("Room Configuration connections", () => {
  const dialog = read("src/packages/pms/components/rooms/room-board-dialogs.tsx");

  it("mounts the section next to accessibility and saves through the dedicated actions", () => {
    const accessibility = dialog.indexOf('data-testid="room-configuration-accessibility"');
    const connections = dialog.indexOf("<RoomConnectionsSection");
    expect(accessibility).toBeGreaterThan(0);
    expect(connections).toBeGreaterThan(accessibility);
    const panels = read("src/packages/pms/components/rooms/room-connections-panels.tsx");
    expect(panels).toMatch(/useServerFn\(addRoomConnection\)/);
    expect(panels).toMatch(/useServerFn\(removeRoomConnection\)/);
    expect(panels).not.toMatch(/saveRoom|\.from\(/);
  });

  it("lists connections by room number, type, building, floor and kind with no IDs", () => {
    const markup = html(
      createElement(RoomConnectionsView, {
        room: A,
        connections: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "connecting",
            partner: B,
            crossBuilding: false,
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            kind: "adjacent",
            partner: OTHER_BUILDING,
            crossBuilding: true,
          },
        ],
        candidates: [],
      }),
    );
    expect(markup).toContain("Room connections");
    expect(markup).toContain("Room 302 · Deluxe Twin · Main building · Floor 3 · <span");
    expect(markup).toContain(">Connecting</span>");
    expect(markup).toContain(">Adjacent</span>");
    expect(markup).toContain(CROSS_BUILDING_LINK_WARNING);
    expect(markup).toContain("Add connection");
    expect(markup).toContain("Remove");
    expect(markup).not.toMatch(UUID);
  });

  it("orders candidates same floor first, then other floors, unknown and other buildings", () => {
    expect(connectionCandidates(A, PROPERTY_ROOMS, []).map((row) => row.roomNumber)).toEqual([
      "302",
      "303",
      "401",
      "501",
      "101",
    ]);
    expect(connectionRoomLabel(UNKNOWN)).toBe(
      "Room 501 · Deluxe King · Building not recorded · Floor not recorded",
    );
  });
});

/* ------------------------------------------------------------ room type */

describe("Room Type guidance", () => {
  const wizard = read(
    "src/packages/pms/components/settings/room-type-wizard/room-type-wizard-step1.tsx",
  );

  it("is relabelled as guidance only", () => {
    expect(CONTAINS_CONNECTING_ROOMS_LABEL).toBe("Contains connecting rooms");
    expect(CONTAINS_CONNECTING_ROOMS_HELP).toBe(
      "Use this as room-type guidance. Physical room connections must still be configured on the individual rooms.",
    );
    expect(wizard).toContain("{CONTAINS_CONNECTING_ROOMS_LABEL}");
    expect(wizard).not.toMatch(/Connecting Room Eligible|Can connect with adjacent room/);
    expect(wizard).toMatch(
      /<RoomTypeConnectingRooms\s+containsConnectingRooms=\{typeForm\.connectingEligible\}/,
    );
  });

  it("counts active rooms with connecting links and flags both mismatches", () => {
    const rooms = [
      { active: true, hasConnectingLink: true },
      { active: true, hasConnectingLink: false },
      { active: false, hasConnectingLink: true },
    ];
    expect(connectingRoomCount(rooms)).toEqual({ connected: 1, total: 2 });
    expect(
      html(createElement(RoomTypeConnectingRooms, { containsConnectingRooms: true, rooms })),
    ).toContain("Rooms with connecting links: 1 of 2");
    expect(roomTypeConnectingHint(true, 0)).toEqual({
      tone: "warning",
      message: TYPE_GUIDANCE_WITHOUT_CONNECTING_ROOMS,
    });
    expect(roomTypeConnectingHint(false, 2)).toEqual({
      tone: "info",
      message: TYPE_CONNECTING_ROOMS_WITHOUT_GUIDANCE,
    });
    expect(roomTypeConnectingHint(true, 1)).toBeNull();
  });

  it("is never read by assignment", () => {
    const evaluator = read(
      "supabase/migrations/0168_room_assignment_eligibility_qualification.sql",
    );
    expect(evaluator).not.toMatch(/connecting_eligible/);
    const lib = readdirSync(resolve(root, "src/packages/pms/lib")).filter(
      (name) => /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts"),
    );
    const code = (name: string) =>
      read(`src/packages/pms/lib/${name}`)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const readers = lib.filter((name) => /connecting_eligible/.test(code(name)));
    expect(readers.sort()).toEqual(["room-connections.functions.ts", "rooms.functions.ts"]);
  });
});

/* ------------------------------------------------------ Property Setup */

describe("Property Setup connecting room review", () => {
  const roomTypes = [
    { id: "type-queen", name: "Standard Queen Room", containsConnectingRooms: true, active: true },
    { id: "type-single", name: "singl room", containsConnectingRooms: false, active: true },
    { id: "type-king", name: "Deluxe King", containsConnectingRooms: true, active: true },
  ];
  const live = {
    rooms: [
      room("r301", "301", {
        roomTypeId: "type-queen",
        buildingId: "b-2",
        building: "Building 2",
        floorId: "f-3",
      }),
      room("r101", "101", {
        roomTypeId: "type-single",
        buildingId: "b-main",
        building: "Main building",
        floorId: "f-1",
      }),
    ],
    links: [{ id: "l1", roomId: "r301", otherRoomId: "r101", kind: "connecting" as const }],
  };

  it("surfaces the live cross-building link without changing it", () => {
    const review = buildConnectingReview({ connectingRuleOn: true, roomTypes, ...live });
    expect(review.counts).toEqual({
      roomsWithConnectingLinks: 2,
      connectingPairs: 1,
      typesContainingConnectingRooms: 2,
      typesMarkedWithoutPairs: 1,
      crossBuildingLinks: 1,
    });
    expect(review.readinessWarning).toBeNull();
    expect(review.groups.find((group) => group.category === "cross_building_links")?.items).toEqual(
      ["Room 101 · singl room ↔ Room 301 · Standard Queen Room · Connecting"],
    );
    expect(
      review.groups.find((group) => group.category === "type_marked_without_pairs")?.items,
    ).toEqual(["Deluxe King"]);
    expect(
      review.groups.find((group) => group.category === "type_pairs_not_marked")?.items,
    ).toEqual(["singl room"]);
    expect(live.links).toHaveLength(1);

    const markup = html(createElement(ConnectingReviewPanel, { review, connectingRuleOn: true }));
    expect(markup).toContain("Connecting room configuration review");
    expect(markup).toContain(CROSS_BUILDING_LINK_WARNING);
    expect(markup).not.toMatch(UUID);
    expect(markup).not.toMatch(
      /hotel_room_links|connecting_eligible|require_connecting_room_match|room_id/,
    );
  });

  it("shows the readiness warning when the rule is on with zero pairs", () => {
    const review = buildConnectingReview({
      connectingRuleOn: true,
      roomTypes,
      rooms: live.rooms,
      links: [],
    });
    expect(review.readinessWarning).toBe(CONNECTING_RULE_WITHOUT_PAIRS);
    expect(CONNECTING_RULE_WITHOUT_PAIRS).toBe(
      "Connecting room matching is enabled, but no connecting room pairs are configured. Reservations requiring connecting rooms cannot be assigned.",
    );
    expect(
      html(createElement(ConnectingReviewPanel, { review, connectingRuleOn: true })),
    ).toContain(CONNECTING_RULE_WITHOUT_PAIRS);
    expect(
      html(createElement(ConnectingReviewPanel, { review, connectingRuleOn: false })),
    ).not.toContain(CONNECTING_RULE_WITHOUT_PAIRS);
    expect(connectingValidationWarnings(review)[0]).toBe(CONNECTING_RULE_WITHOUT_PAIRS);
  });

  it("is mounted after the rule toggles and reported as non-blocking validation", () => {
    const card2 = read(
      "src/packages/pms/components/settings/pms-property-setup-card2-inventory.tsx",
    );
    expect(card2.indexOf("<ConnectingReviewPanel")).toBeGreaterThan(
      card2.indexOf('label="Connecting Room Match"'),
    );
    expect(card2).toContain("connectingRuleOn={draft.requireConnectingRoomMatch}");
    const card8 = read("src/packages/pms/lib/pms-property-setup-card8-validation.functions.ts");
    expect(card8).toContain(
      '{ id: "connecting-rooms", label: "Connecting rooms", warnings: connectingWarnings }',
    );
    const loader = read("src/packages/pms/lib/room-connections.functions.ts");
    const review = loader.slice(loader.indexOf("export async function loadConnectingReview"));
    expect(review).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

/* -------------------------------------------------- enforcement unchanged */

describe("assignment enforcement is unchanged", () => {
  it("no migration after 0210 touches the evaluator, the requirement or the final enforcement", () => {
    expect(MIGRATION).not.toMatch(
      /pms_evaluate_room_assignment|connecting_room_required|pms_assert_room_assignment_hard_rules/,
    );
  });

  it("the evaluator still accepts a link stored in either direction", () => {
    const evaluator = read(
      "supabase/migrations/0168_room_assignment_eligibility_qualification.sql",
    );
    expect(evaluator).toMatch(
      /link\.kind = 'connecting'\s+AND \(link\.room_id = room\.id OR link\.other_room_id = room\.id\)/,
    );
  });
});
