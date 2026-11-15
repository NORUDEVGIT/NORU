import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { eligibilityStaffLines } from "../components/rooms/room-eligibility-display";
import { assignmentIneligibilityReason } from "./fo-checkin-v2-model";
import { roomInventoryAutoAssignment, type AutoAssignmentNeed } from "./guest-group-auto-assignment";
import type { AssignmentEligibilityResult } from "./room-inventory-compat";
import {
  PAIR_CHECK_FAILED_MESSAGE,
  createPairAwareEvaluator,
  evaluatePairVerdict,
  mergePairVerdict,
  pairPartnerLabel,
  type PairEligibilityDb,
} from "./room-pair-eligibility";
import {
  PAIR_DATES_REJECTION,
  PAIR_INVALID_REJECTION,
  PAIR_PARTNER_UNAVAILABLE_REJECTION,
  ROOM_LINK_IN_USE_REJECTION,
  pairMismatchRejection,
  pairWriteErrorMessage,
  requirementRejectionFromBlockers,
  requirementRejectionFromError,
} from "./room-requirement-rejection";
import { removeRoomConnectionWith, type RoomLinkStore } from "./room-connections";

/**
 * Phase 5D: reservation room pairs in candidate eligibility and final enforcement.
 * The database rules are covered by reservation-room-pair-enforcement.test.ts (migration 0213).
 */

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const BASE: AssignmentEligibilityResult = {
  source: "canonical",
  eligible: true,
  blockers: [],
  warnings: [],
  preferenceScore: 0,
  preferenceReasons: [],
};

type RpcCall = { name: string; args: Record<string, unknown> };

function fakeDb(options: {
  pairs?: boolean;
  pairTableError?: { code?: string; message?: string };
  rpc?: (call: RpcCall) => { data: unknown; error: { code?: string; message?: string } | null };
}) {
  const calls: RpcCall[] = [];
  let pairLookups = 0;
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            or: () => ({
              limit: () => {
                pairLookups += 1;
                return Promise.resolve(
                  options.pairTableError
                    ? { data: null, error: options.pairTableError }
                    : { data: options.pairs ? [{ id: "pair-1" }] : [], error: null },
                );
              },
            }),
          }),
        }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const call = { name, args };
      calls.push(call);
      return (
        options.rpc?.(call) ?? { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } }
      );
    },
  } as unknown as PairEligibilityDb;
  return { db, calls, lookups: () => pairLookups };
}

const verdict = (overrides: Record<string, unknown>) => ({
  data: {
    paired: true,
    enforced: true,
    eligible: true,
    blockers: [],
    partner: {
      partnerUnitId: "unit-b",
      partnerUnitSequence: 2,
      partnerReservationId: "res-1",
      sameReservation: true,
      partnerConfirmationNumber: "CONF-1",
      partnerRoomId: "room-302",
      partnerRoomNumber: "302",
    },
    ...overrides,
  },
  error: null,
});

describe("staff wording", () => {
  it("names the partner's room for a pair mismatch", () => {
    expect(pairMismatchRejection("302")).toBe(
      "This room must connect to Room 302, assigned to the paired reservation room.",
    );
    expect(
      requirementRejectionFromBlockers([
        { code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" },
      ]),
    ).toBe("This room must connect to Room 302, assigned to the paired reservation room.");
  });

  it("uses the exact sentences for the other pair outcomes", () => {
    expect(PAIR_PARTNER_UNAVAILABLE_REJECTION).toBe(
      "No connecting room is available for the paired reservation room.",
    );
    expect(PAIR_INVALID_REJECTION).toBe("The current room pair is no longer valid.");
    expect(PAIR_DATES_REJECTION).toBe(
      "The paired reservation rooms must have overlapping stay dates.",
    );
    expect(ROOM_LINK_IN_USE_REJECTION).toBe(
      "This connection is used by an active paired stay. Reassign or remove the reservation pairing first.",
    );
    expect(requirementRejectionFromBlockers([{ code: "CONNECTING_PARTNER_UNAVAILABLE" }])).toBe(
      PAIR_PARTNER_UNAVAILABLE_REJECTION,
    );
    expect(requirementRejectionFromBlockers([{ code: "CONNECTING_PAIR_INVALID" }])).toBe(
      PAIR_INVALID_REJECTION,
    );
  });

  it("maps raw database errors, with the partner room when the error carries it", () => {
    expect(
      requirementRejectionFromError(new Error("ROOM_CONNECTING_PAIR_MISMATCH[302]")),
    ).toBe(pairMismatchRejection("302"));
    expect(requirementRejectionFromError("ROOM_CONNECTING_PAIR_INVALID")).toBe(PAIR_INVALID_REJECTION);
    expect(requirementRejectionFromError("ROOM_CONNECTING_PARTNER_UNAVAILABLE")).toBe(
      PAIR_PARTNER_UNAVAILABLE_REJECTION,
    );
    expect(pairWriteErrorMessage("ROOM_PAIR_STAYS_DO_NOT_OVERLAP")).toBe(PAIR_DATES_REJECTION);
    expect(pairWriteErrorMessage("ROOM_LINK_USED_BY_ACTIVE_PAIR")).toBe(ROOM_LINK_IN_USE_REJECTION);
    expect(pairWriteErrorMessage("something else")).toBeNull();
  });

  it("never lets a raw code reach a staff sentence", () => {
    for (const code of [
      "CONNECTING_PAIR_MISMATCH",
      "CONNECTING_PAIR_INVALID",
      "CONNECTING_PARTNER_UNAVAILABLE",
    ]) {
      const reason = assignmentIneligibilityReason(false, [{ code, partnerRoomNumber: "302" }]);
      expect(reason).not.toMatch(/[A-Z]{3,}_[A-Z]{3,}/);
    }
    expect(assignmentIneligibilityReason(false, [{ code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" }])).toBe(
      pairMismatchRejection("302"),
    );
  });
});

describe("pair-aware evaluator", () => {
  it("leaves an unpaired unit and a missing unit untouched, without asking the evaluator", async () => {
    const unpaired = fakeDb({ pairs: false });
    const evaluate = await createPairAwareEvaluator(unpaired.db, {
      restaurantId: "p1",
      reservationRoomId: "unit-a",
    });
    expect(await evaluate("room-1", BASE)).toBe(BASE);
    expect(unpaired.calls).toHaveLength(0);

    const none = fakeDb({ pairs: true });
    const evaluateNone = await createPairAwareEvaluator(none.db, {
      restaurantId: "p1",
      reservationRoomId: null,
    });
    expect(await evaluateNone("room-1", BASE)).toBe(BASE);
    expect(none.lookups()).toBe(0);
  });

  it("looks the pair up once and asks the evaluator per candidate room", async () => {
    const { db, calls, lookups } = fakeDb({
      pairs: true,
      rpc: ({ args }) =>
        args["_candidate_room_id"] === "room-309"
          ? verdict({})
          : verdict({
              eligible: false,
              blockers: [{ code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" }],
            }),
    });
    const evaluate = await createPairAwareEvaluator(db, {
      restaurantId: "p1",
      reservationRoomId: "unit-a",
    });
    const ok = await evaluate("room-309", BASE);
    const bad = await evaluate("room-305", BASE);
    expect(lookups()).toBe(1);
    expect(calls.map((call) => call.name)).toEqual(["pms_evaluate_room_pairing", "pms_evaluate_room_pairing"]);
    expect(calls[0]!.args).toMatchObject({
      _restaurant_id: "p1",
      _reservation_room_id: "unit-a",
      _candidate_room_id: "room-309",
      _use_partner_room: false,
    });
    expect(ok.eligible).toBe(true);
    expect(bad.eligible).toBe(false);
    expect(bad.blockers).toEqual([{ code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" }]);
    expect(requirementRejectionFromBlockers(bad.blockers)).toBe(pairMismatchRejection("302"));
    expect(bad.pairing).toEqual({
      partnerLabel: "Room 2",
      partnerRoomNumber: "302",
      partnerAssigned: true,
      enforced: true,
    });
  });

  it("keeps the base blockers first and never makes an ineligible room eligible", () => {
    const base: AssignmentEligibilityResult = {
      ...BASE,
      eligible: false,
      blockers: [{ code: "HOUSEKEEPING_NOT_READY" }],
    };
    const merged = mergePairVerdict(base, {
      paired: true,
      enforced: true,
      eligible: true,
      blockers: [],
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: null, partnerAssigned: false, enforced: true },
    });
    expect(merged.eligible).toBe(false);
    expect(merged.blockers[0]).toEqual({ code: "HOUSEKEEPING_NOT_READY" });
    expect(mergePairVerdict(base, { paired: false, enforced: false, eligible: true, blockers: [], pairing: null })).toBe(base);
  });

  it("labels a partner on another reservation with its confirmation number", () => {
    expect(pairPartnerLabel({ unitSequence: 1, confirmationNumber: "CONF-9", sameReservation: false })).toBe(
      "Room 1 (CONF-9)",
    );
    expect(pairPartnerLabel({ unitSequence: 2, confirmationNumber: "CONF-9", sameReservation: true })).toBe(
      "Room 2",
    );
  });

  it("keeps the base result when the legacy evaluator answered, or 0213 is not installed", async () => {
    const { db, calls } = fakeDb({ pairs: true });
    const evaluate = await createPairAwareEvaluator(db, { restaurantId: "p1", reservationRoomId: "u" });
    const legacy: AssignmentEligibilityResult = { ...BASE, source: "legacy" };
    expect(await evaluate("r", legacy)).toBe(legacy);
    expect(await evaluate("r", BASE)).toBe(BASE);
    expect(calls).toHaveLength(1);
  });

  it("treats a database without the pair table as unpaired", async () => {
    const { db } = fakeDb({ pairTableError: { code: "42P01", message: "relation does not exist" } });
    const evaluate = await createPairAwareEvaluator(db, { restaurantId: "p1", reservationRoomId: "u" });
    expect(await evaluate("r", BASE)).toBe(BASE);
  });

  it("refuses with a staff sentence when the pair cannot be checked", async () => {
    const failing = fakeDb({
      pairs: true,
      rpc: () => ({ data: null, error: { code: "XX000", message: "boom" } }),
    });
    const evaluate = await createPairAwareEvaluator(failing.db, {
      restaurantId: "p1",
      reservationRoomId: "u",
    });
    await expect(evaluate("r", BASE)).rejects.toThrow(PAIR_CHECK_FAILED_MESSAGE);
    const lookupFails = fakeDb({ pairTableError: { code: "XX000", message: "boom" } });
    await expect(
      createPairAwareEvaluator(lookupFails.db, { restaurantId: "p1", reservationRoomId: "u" }),
    ).rejects.toThrow(PAIR_CHECK_FAILED_MESSAGE);
  });

  it("passes a partner room override for a hypothetical swap", async () => {
    const { db, calls } = fakeDb({ rpc: () => verdict({}) });
    const result = await evaluatePairVerdict(db, {
      restaurantId: "p1",
      reservationRoomId: "unit-a",
      roomId: "room-b",
      usePartnerRoom: true,
      partnerRoomId: "room-a",
    });
    expect(result?.eligible).toBe(true);
    expect(calls[0]!.args).toMatchObject({ _partner_room_id: "room-a", _use_partner_room: true });
  });
});

describe("Assignment Eligibility display", () => {
  const input = {
    source: "canonical" as const,
    eligible: true,
    blockers: [],
    warnings: [],
    preferenceReasons: [],
    arrival: "2026-12-01",
    departure: "2026-12-03",
    guests: 2,
    maxOccupancy: 4,
    housekeepingStatus: "clean",
    maintenanceStatus: "normal",
    operationalStatus: "available",
    bedPreference: null,
    roomBeds: null,
    buildingPreference: null,
    roomBuilding: null,
    floorPreference: null,
    roomFloor: null,
    accessibleRequired: false,
    connectingRequired: true,
    forCheckIn: false,
    roomTypeAligned: true,
  };

  it("shows the pair, and the connecting requirement when the partner holds a room", () => {
    const lines = eligibilityStaffLines({
      ...input,
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: "302", partnerAssigned: true, enforced: true },
    }).map((line) => line.text);
    expect(lines).toContain("Paired with Room 2");
    expect(lines).toContain("Must connect to Room 302");
  });

  it("shows the eligible-connecting-room requirement while the partner has no room", () => {
    const lines = eligibilityStaffLines({
      ...input,
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: null, partnerAssigned: false, enforced: true },
    }).map((line) => line.text);
    expect(lines).toContain("Paired with Room 2");
    expect(lines).toContain("Candidate must have an eligible connecting room for Room 2");
  });

  it("reads a failed pair as staff wording and hides the raw codes", () => {
    const mismatch = eligibilityStaffLines({
      ...input,
      eligible: false,
      blockers: [{ code: "CONNECTING_PAIR_MISMATCH", partnerRoomNumber: "302" }],
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: "302", partnerAssigned: true, enforced: true },
    });
    expect(mismatch).toContainEqual({ tone: "fail", text: pairMismatchRejection("302") });
    const unavailable = eligibilityStaffLines({
      ...input,
      eligible: false,
      blockers: [{ code: "CONNECTING_PARTNER_UNAVAILABLE" }],
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: null, partnerAssigned: false, enforced: true },
    });
    expect(unavailable).toContainEqual({ tone: "fail", text: PAIR_PARTNER_UNAVAILABLE_REJECTION });
    for (const line of [...mismatch, ...unavailable]) expect(line.text).not.toMatch(/CONNECTING_/);
  });

  it("adds nothing for an unpaired unit or a property that does not enforce pairs", () => {
    const base = eligibilityStaffLines(input).map((line) => line.text);
    expect(base.some((text) => text.startsWith("Paired with"))).toBe(false);
    const off = eligibilityStaffLines({
      ...input,
      pairing: { partnerLabel: "Room 2", partnerRoomNumber: null, partnerAssigned: false, enforced: false },
    }).map((line) => line.text);
    expect(off).toEqual(base);
  });
});

describe("group auto-assignment of paired units", () => {
  const need = (unit: string, partner: string | null, extra: Partial<AutoAssignmentNeed> = {}): AutoAssignmentNeed => ({
    reservationId: "res-1",
    reservationRoomId: unit,
    roomTypeId: "type-1",
    arrival: "2026-12-01",
    departure: "2026-12-03",
    adults: 2,
    children: 0,
    currentRoomId: null,
    preferenceNote: null,
    pairPartnerReservationRoomId: partner,
    ...extra,
  });
  const room = (id: string, number: string) => ({
    id,
    roomNumber: number,
    floor: null,
    building: null,
    housekeepingStatus: "clean",
  });

  const inventory = (
    lists: Record<string, ReturnType<typeof room>[]>,
    links: Record<string, string[]> | undefined,
  ) => ({
    listAssignableRooms: async (input: { reservationRoomId?: string }) => lists[input.reservationRoomId ?? ""] ?? [],
    ...(links ? { connectingRoomIds: async ({ roomId }: { roomId: string }) => links[roomId] ?? [] } : {}),
  });

  it("assigns a connected combination and judges each room against its own unit", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [need("unit-a", "unit-b"), need("unit-b", "unit-a")],
      inventory: inventory(
        {
          "unit-a": [room("r301", "301"), room("r305", "305"), room("r309", "309")],
          // Unit B cannot use 302 (not in its list), only 304 or 310.
          "unit-b": [room("r304", "304"), room("r310", "310")],
        },
        { r301: ["r302"], r305: ["r304"], r309: ["r310"], r304: ["r305"], r310: ["r309"] },
      ),
    });
    expect(results.every((row) => row.assigned)).toBe(true);
    const [a, b] = results;
    const connected: Record<string, string[]> = { r305: ["r304"], r309: ["r310"] };
    expect(connected[a!.roomId!]).toContain(b!.roomId);
    expect(a!.pairedWith).toBe("unit-b");
    expect(b!.pairedWith).toBe("unit-a");
  });

  it("places paired units before others so their connecting rooms are still free", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [
        need("unit-x", null, { reservationId: "res-2" }),
        need("unit-a", "unit-b"),
        need("unit-b", "unit-a"),
      ],
      inventory: inventory(
        {
          "unit-x": [room("r301", "301"), room("r306", "306")],
          "unit-a": [room("r301", "301")],
          "unit-b": [room("r302", "302")],
        },
        { r301: ["r302"], r302: ["r301"] },
      ),
    });
    expect(results.map((row) => [row.reservationRoomId, row.roomId])).toEqual([
      ["unit-x", "r306"],
      ["unit-a", "r301"],
      ["unit-b", "r302"],
    ]);
  });

  it("assigns neither side when no connecting combination exists", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [need("unit-a", "unit-b"), need("unit-b", "unit-a")],
      inventory: inventory(
        { "unit-a": [room("r301", "301")], "unit-b": [room("r310", "310")] },
        { r301: ["r302"], r310: ["r311"] },
      ),
    });
    expect(results.map((row) => row.assigned)).toEqual([false, false]);
    expect(results.map((row) => row.reason)).toEqual([
      PAIR_PARTNER_UNAVAILABLE_REJECTION,
      PAIR_PARTNER_UNAVAILABLE_REJECTION,
    ]);
  });

  it("does not use a room that another need already holds", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [
        need("unit-a", "unit-b"),
        need("unit-b", "unit-a"),
        need("unit-held", null, { reservationId: "res-3", currentRoomId: "r302" }),
      ],
      inventory: inventory(
        { "unit-a": [room("r301", "301")], "unit-b": [room("r302", "302")] },
        { r301: ["r302"] },
      ),
    });
    expect(results[0]!.assigned).toBe(false);
    expect(results[1]!.assigned).toBe(false);
    expect(results[2]!.reason).toBe("Already assigned.");
  });

  it("falls back to the pair-aware list for a unit whose partner already holds a room", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [need("unit-a", "unit-b"), need("unit-b", "unit-a", { currentRoomId: "r302" })],
      inventory: inventory({ "unit-a": [room("r301", "301")] }, { r301: ["r302"] }),
    });
    expect(results[0]).toMatchObject({ assigned: true, roomId: "r301" });
    expect(results[1]!.reason).toBe("Already assigned.");
  });

  it("keeps unpaired needs on the plain path", async () => {
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "p1",
      needs: [need("unit-x", null), need("unit-y", null)],
      inventory: inventory({ "unit-x": [room("r1", "1"), room("r2", "2")], "unit-y": [room("r1", "1"), room("r2", "2")] }, undefined),
    });
    expect(results.map((row) => row.roomId).sort()).toEqual(["r1", "r2"]);
  });
});

describe("physical link deletion", () => {
  const store = (deleted: boolean | "in_use"): RoomLinkStore => ({
    loadRooms: async () => [],
    loadLinksTouching: async () => [],
    insertLink: async () => ({ ok: true, id: "x" }),
    loadLink: async () => ({ id: "l1", restaurantId: "p1", roomId: "a", otherRoomId: "b", kind: "connecting" }) as never,
    deleteLink: async () => deleted,
  });

  it("explains a refused delete instead of reporting a generic failure", async () => {
    expect(await removeRoomConnectionWith(store("in_use"), { roomId: "a", linkId: "l1" })).toEqual({
      ok: false,
      message: ROOM_LINK_IN_USE_REJECTION,
    });
    expect((await removeRoomConnectionWith(store(false), { roomId: "a", linkId: "l1" })).ok).toBe(false);
    expect(await removeRoomConnectionWith(store(true), { roomId: "a", linkId: "l1" })).toEqual({
      ok: true,
      warnings: [],
    });
  });

  it("reads the database refusal in the Supabase store", () => {
    const source = read("src/packages/pms/lib/room-connections.functions.ts");
    expect(source).toContain("ROOM_LINK_USED_BY_ACTIVE_PAIR");
    expect(source).toContain('return "in_use"');
  });
});

describe("workflow wiring", () => {
  it("every candidate list and check goes through the pair-aware evaluator", () => {
    for (const [path, count] of [
      ["src/packages/pms/lib/reservations.functions.ts", 3],
      ["src/packages/pms/lib/reservation-room-display.functions.ts", 1],
      ["src/packages/pms/lib/fo-check-in-readiness.functions.ts", 1],
      ["src/packages/pms/lib/room-inventory.functions.ts", 1],
    ] as const) {
      const source = read(path);
      expect(source.match(/createPairAwareEvaluator\(/g)?.length ?? 0).toBeGreaterThanOrEqual(count);
      expect(source).toContain("room-pair-eligibility");
    }
  });

  it("the Assignment Eligibility inspector sends the room unit and shows the pair context", () => {
    const rules = read("src/packages/pms/components/rooms/room-inventory-rules.tsx");
    expect(rules).toContain("reservationRoomId: linkedUnit?.reservationRoomId ?? null");
    expect(rules).toContain("pairing: result.pairing ?? null");
    expect(read("src/packages/pms/lib/room-inventory.functions.ts")).toContain(
      "reservationRoomId: idSchema.nullable().optional()",
    );
  });

  it("group swap judges the resulting rooms before writing anything", () => {
    const source = read("src/packages/pms/lib/guest-group-detail.functions.ts");
    const swap = source.slice(
      source.indexOf("export const swapGroupRooms"),
      source.indexOf("export const bulkAssignGroupRooms"),
    );
    const check = swap.indexOf("swapPairRefusal(");
    const firstWrite = swap.indexOf("await assignGroupRoom(");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(firstWrite);
    expect(swap).toContain("skipPairCheck: true");
    expect(swap).toContain("throw new Error(pairRefusal)");
  });

  it("group auto-assignment hands the partner and the physical links to the planner", () => {
    const source = read("src/packages/pms/lib/guest-group-detail.functions.ts");
    expect(source).toContain("pairPartnerReservationRoomId: partners.get(unit.id) ?? null");
    expect(source).toContain("connectingRoomIds:");
    expect(source).toContain("hotel_room_links");
  });

  it("error tables map the pair codes for every write path", () => {
    for (const path of [
      "src/packages/pms/lib/reservations.server.ts",
      "src/packages/pms/lib/rates.server.ts",
    ]) {
      const source = read(path);
      expect(source).toContain("...PAIR_WRITE_ERRORS");
      expect(source).toContain("pairWriteErrorMessage(message)");
    }
  });
});
