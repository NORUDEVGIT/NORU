import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  OPERATIONAL_RESTRICTION_CAPABILITY_REQUIRED,
  getAssignmentEligibilityCompat,
  getRoomTypeAvailabilityCompat,
  roomPersistencePayload,
  setOperationalRestrictionCompat,
} from "./room-inventory-compat.ts";

const input = {
  restaurantId: "11111111-1111-4111-8111-111111111111",
  roomTypeId: "22222222-2222-4222-8222-222222222222",
  arrival: "2026-10-01",
  departure: "2026-10-03",
};

function missing(functionName: string) {
  return {
    data: null,
    error: {
      code: "PGRST202",
      message: `Could not find the function public.${functionName}`,
    },
  };
}

describe("Room & Inventory compatibility wrappers", () => {
  it("maps the canonical availability response to the stable shape", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        return {
          data: [
            {
              room_type_id: input.roomTypeId,
              physical_capacity: 12,
              available: 7,
              business_date: "2026-09-30",
              limiting_date: "2026-10-02",
              overbooking_allowance: 0,
              nightly: [{ date: "2026-10-01", available: 8 }],
            },
          ],
          error: null,
        };
      },
    };

    const result = await getRoomTypeAvailabilityCompat(client, input);

    assert.deepEqual(calls, ["pms_room_type_availability"]);
    assert.equal(result.source, "canonical");
    assert.equal(result.physicalCapacity, 12);
    assert.equal(result.available, 7);
    assert.equal(result.reserved, null);
    assert.equal(result.businessDate, "2026-09-30");
    assert.equal(result.limitingDate, "2026-10-02");
    assert.deepEqual(result.nightly, [{ date: "2026-10-01", available: 8 }]);
  });

  it("falls back to legacy availability only when the canonical RPC is absent", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "pms_room_type_availability") return missing(name);
        if (name === "count_sellable_rooms") return { data: 10, error: null };
        return { data: 4, error: null };
      },
    };

    const result = await getRoomTypeAvailabilityCompat(client, input);

    assert.deepEqual(calls, [
      "pms_room_type_availability",
      "count_sellable_rooms",
      "count_reserved_rooms",
    ]);
    assert.deepEqual(result, {
      source: "legacy",
      roomTypeId: input.roomTypeId,
      physicalCapacity: 10,
      available: 6,
      reserved: 4,
      businessDate: null,
      limitingDate: null,
      overbookingAllowance: 0,
      nightly: [],
    });
  });

  it("does not hide real canonical availability errors", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (name: string) => {
        calls.push(name);
        return { data: null, error: { code: "42501", message: "permission denied" } };
      },
    };

    await assert.rejects(() => getRoomTypeAvailabilityCompat(client, input), /permission denied/);
    assert.deepEqual(calls, ["pms_room_type_availability"]);
  });

  it("uses canonical and legacy assignment behavior according to capability", async () => {
    let legacyCalls = 0;
    const canonical = await getAssignmentEligibilityCompat(
      {
        rpc: async () => ({
          data: {
            eligible: true,
            blockers: [],
            warnings: [{ code: "PREFERENCE_NOT_MET" }],
            preferenceScore: 2,
            preferenceReasons: ["floor"],
          },
          error: null,
        }),
      },
      {
        ...input,
        roomId: "33333333-3333-4333-8333-333333333333",
      },
      () => {
        legacyCalls += 1;
        return {
          source: "legacy",
          eligible: false,
          blockers: [],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        };
      },
    );
    assert.equal(canonical.source, "canonical");
    assert.equal(canonical.eligible, true);
    assert.equal(canonical.preferenceScore, 2);
    assert.equal(legacyCalls, 0);

    const legacy = await getAssignmentEligibilityCompat(
      { rpc: async (name: string) => missing(name) },
      {
        ...input,
        roomId: "33333333-3333-4333-8333-333333333333",
      },
      () => {
        legacyCalls += 1;
        return {
          source: "legacy",
          eligible: false,
          blockers: [{ code: "ROOM_CLASH" }],
          warnings: [],
          preferenceScore: 0,
          preferenceReasons: [],
        };
      },
    );
    assert.equal(legacy.source, "legacy");
    assert.equal(legacy.eligible, false);
    assert.equal(legacyCalls, 1);
  });

  it("does not hide real assignment RPC errors behind the legacy fallback", async () => {
    let legacyCalls = 0;
    await assert.rejects(
      () =>
        getAssignmentEligibilityCompat(
          {
            rpc: async () => ({
              data: null,
              error: { code: "P0001", message: "INSUFFICIENT_PRIVILEGE" },
            }),
          },
          {
            ...input,
            roomId: "33333333-3333-4333-8333-333333333333",
          },
          () => {
            legacyCalls += 1;
            return {
              source: "legacy",
              eligible: true,
              blockers: [],
              warnings: [],
              preferenceScore: 0,
              preferenceReasons: [],
            };
          },
        ),
      /INSUFFICIENT_PRIVILEGE/,
    );
    assert.equal(legacyCalls, 0);
  });

  it("reads jsonb assignment payloads that PostgREST wraps or stringifies", async () => {
    const wrapped = await getAssignmentEligibilityCompat(
      {
        rpc: async () => ({
          data: {
            pms_evaluate_room_assignment: {
              eligible: true,
              blockers: [],
              warnings: [],
              preferenceScore: 0,
              preferenceReasons: [],
            },
          },
          error: null,
        }),
      },
      { ...input, roomId: "33333333-3333-4333-8333-333333333333" },
      () => {
        throw new Error("legacy must not run");
      },
    );
    assert.equal(wrapped.eligible, true);

    const asString = await getAssignmentEligibilityCompat(
      {
        rpc: async () => ({
          data: JSON.stringify({
            eligible: true,
            blockers: [],
            warnings: [],
            preferenceScore: 1,
            preferenceReasons: ["floor"],
          }),
          error: null,
        }),
      },
      { ...input, roomId: "33333333-3333-4333-8333-333333333333" },
      () => {
        throw new Error("legacy must not run");
      },
    );
    assert.equal(asString.eligible, true);
    assert.equal(asString.preferenceScore, 1);

    await assert.rejects(
      () =>
        getAssignmentEligibilityCompat(
          {
            rpc: async () => ({
              data: { unexpected: true },
              error: null,
            }),
          },
          { ...input, roomId: "33333333-3333-4333-8333-333333333333" },
          () => {
            throw new Error("legacy must not run");
          },
        ),
      /Assignment eligibility RPC returned no result/,
    );
  });

  it("strips operational fields from updates while preserving master data", () => {
    const result = roomPersistencePayload(
      {
        room_number: "101",
        floor_id: "44444444-4444-4444-8444-444444444444",
        status: "out_of_order",
        restriction_reason: "Leak",
        restriction_expected_return: "2026-10-02",
        restriction_maintenance_request_id: "55555555-5555-4555-8555-555555555555",
        restriction_placed_at: "2026-09-23T12:00:00Z",
        restriction_placed_by_membership_id: "66666666-6666-4666-8666-666666666666",
        restriction_approved_by_membership_id: "77777777-7777-4777-8777-777777777777",
      },
      "update",
    );

    assert.deepEqual(result, {
      room_number: "101",
      floor_id: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("forces newly created rooms to available while preserving master data", () => {
    const result = roomPersistencePayload(
      { room_number: "102", active: true, status: "out_of_service" },
      "create",
    );

    assert.deepEqual(result, { room_number: "102", active: true, status: "available" });
  });

  it("routes saveRoom updates and creates through the protected payload builder", () => {
    const functions = readFileSync(
      fileURLToPath(new URL("./rooms.functions.ts", import.meta.url)),
      "utf8",
    );
    const saveRoom = functions.slice(
      functions.indexOf("export const saveRoom"),
      functions.indexOf("export const bulkCreateRooms"),
    );

    assert.match(saveRoom, /roomPersistencePayload\(masterDataPayload, "update"\)/);
    assert.match(saveRoom, /roomPersistencePayload\(masterDataPayload, "create"\)/);
    assert.doesNotMatch(saveRoom, /status:\s*data\.status/);
    assert.match(functions, /export const bulkCreateRooms[\s\S]*status:\s*"available"/);
  });

  it("prefers the canonical restriction RPC", async () => {
    const calls: string[] = [];
    const result = await setOperationalRestrictionCompat(
      {
        rpc: async (name: string) => {
          calls.push(name);
          return { data: null, error: null };
        },
      },
      {
        restaurantId: input.restaurantId,
        roomId: "33333333-3333-4333-8333-333333333333",
        status: "out_of_order",
        reason: "Leak",
        expectedReturn: "2026-10-02",
        membershipId: "66666666-6666-4666-8666-666666666666",
      },
    );

    assert.equal(result.source, "canonical");
    assert.deepEqual(calls, ["pms_set_room_operational_restriction"]);
  });

  it("uses the legacy restriction RPC only for legacy-compatible requests", async () => {
    const calls: string[] = [];
    const result = await setOperationalRestrictionCompat(
      {
        rpc: async (name: string) => {
          calls.push(name);
          if (name === "pms_set_room_operational_restriction") return missing(name);
          return { data: null, error: null };
        },
      },
      {
        restaurantId: input.restaurantId,
        roomId: "33333333-3333-4333-8333-333333333333",
        status: "out_of_service",
        reason: "Refurbishment",
        expectedReturn: "2026-10-02",
        membershipId: "66666666-6666-4666-8666-666666666666",
      },
    );

    assert.equal(result.source, "legacy");
    assert.deepEqual(calls, [
      "pms_set_room_operational_restriction",
      "housekeeping_set_room_restriction",
    ]);
  });

  it("never sends advanced restriction requirements through the legacy RPC", async () => {
    const calls: string[] = [];

    await assert.rejects(
      () =>
        setOperationalRestrictionCompat(
          {
            rpc: async (name: string) => {
              calls.push(name);
              return missing(name);
            },
          },
          {
            restaurantId: input.restaurantId,
            roomId: "33333333-3333-4333-8333-333333333333",
            status: "out_of_order",
            reason: "Leak",
            expectedReturn: "2026-10-02",
            membershipId: "66666666-6666-4666-8666-666666666666",
            maintenanceRequestId: "55555555-5555-4555-8555-555555555555",
          },
        ),
      new RegExp(
        OPERATIONAL_RESTRICTION_CAPABILITY_REQUIRED.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
    assert.deepEqual(calls, ["pms_set_room_operational_restriction"]);
  });
});
