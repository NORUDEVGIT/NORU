import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decideExplicitOverbooking,
  roomTypeOverbookingAllowance,
  roomTypeOverbookingRemaining,
  roomTypeShortage,
  settleConcurrentOverbooking,
  totalOverbookedRooms,
  type RoomTypeNightState,
  type RoomTypeOverbookingRule,
} from "./overbooking-policy.ts";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/0172_reservation_overbooking.sql", import.meta.url),
  "utf8",
);

const enabled = (maximumOverbooking: number | null, percentageLimit: number | null): RoomTypeOverbookingRule => ({
  enabled: true,
  maximumOverbooking,
  percentageLimit,
});

function type(
  roomTypeId: string,
  physicalCapacity: number,
  demand: number,
  rule: RoomTypeOverbookingRule | null,
): RoomTypeNightState {
  return { roomTypeId, physicalCapacity, demand, rule };
}

describe("room-type overbooking allowance", () => {
  it("is zero when the property or the room type is off, or a configured limit is zero", () => {
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: false,
        rule: enabled(5, 10),
        physicalCapacity: 20,
      }),
      0,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: { enabled: false, maximumOverbooking: 5, percentageLimit: 10 },
        physicalCapacity: 20,
      }),
      0,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(0, null),
        physicalCapacity: 20,
      }),
      0,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(null, null),
        physicalCapacity: 20,
      }),
      0,
    );
  });

  it("uses max only, floored percentage only, or the smaller of both", () => {
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(3, null),
        physicalCapacity: 20,
      }),
      3,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(null, 15),
        physicalCapacity: 20,
      }),
      3,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(2, 20),
        physicalCapacity: 20,
      }),
      2,
    );
  });

  it("floors each room type from its own physical capacity", () => {
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(null, 10),
        physicalCapacity: 20,
      }),
      2,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(null, 10),
        physicalCapacity: 19,
      }),
      1,
    );
    assert.equal(
      roomTypeOverbookingAllowance({
        propertyAllowed: true,
        rule: enabled(null, 10),
        physicalCapacity: 7,
      }),
      0,
    );
  });
});

describe("independent room-type allowances", () => {
  const standard = enabled(2, null);
  const deluxe = enabled(3, null);

  it("does not let a full Standard allowance block Deluxe", () => {
    const standardLeft = roomTypeOverbookingRemaining({
      propertyAllowed: true,
      type: type("standard", 10, 12, standard),
    });
    const deluxeLeft = roomTypeOverbookingRemaining({
      propertyAllowed: true,
      type: type("deluxe", 10, 5, deluxe),
    });
    assert.equal(standardLeft, 0);
    assert.equal(deluxeLeft, 3);
    assert.equal(roomTypeShortage(10, 5), 0);
    const rejected = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 12, standard), type("deluxe", 10, 5, deluxe)],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(rejected.ok, false);
    const accepted = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 12, standard), type("deluxe", 10, 5, deluxe)],
          additionalByType: { deluxe: 3 },
        },
      ],
    });
    assert.equal(accepted.ok, true);
  });

  it("does not let Standard borrow Deluxe allowance", () => {
    const decision = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [
            type("standard", 10, 11, enabled(1, null)),
            type("deluxe", 10, 10, enabled(5, null)),
          ],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "OVERBOOKING_LIMIT_REACHED");
  });

  it("rejects a stay when any room type on any night exceeds its own allowance", () => {
    const decision = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 10, enabled(2, null))],
          additionalByType: { standard: 1 },
        },
        {
          night: "2026-10-21",
          typesBefore: [type("standard", 10, 11, enabled(2, null))],
          additionalByType: { standard: 1 },
        },
        {
          night: "2026-10-22",
          typesBefore: [type("standard", 10, 12, enabled(2, null))],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.night, "2026-10-22");
  });

  it("accepts three Standard rooms when one physical room and two allowance rooms remain", () => {
    const accepted = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 9, enabled(2, null))],
          additionalByType: { standard: 3 },
        },
      ],
    });
    assert.equal(accepted.ok, true);
    const rejected = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 9, enabled(2, null))],
          additionalByType: { standard: 4 },
        },
      ],
    });
    assert.equal(rejected.ok, false);
  });

  it("rejects the whole reservation when one of two room types exceeds its allowance", () => {
    const decision = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [
            type("standard", 10, 10, enabled(1, null)),
            type("deluxe", 10, 10, enabled(1, null)),
          ],
          additionalByType: { standard: 1, deluxe: 2 },
        },
      ],
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.roomTypeId, "deluxe");
  });

  it("rejects a disabled room type and a disabled property", () => {
    const typeOff = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 10, { enabled: false, maximumOverbooking: 2, percentageLimit: null })],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(typeOff.ok, false);
    if (!typeOff.ok) assert.equal(typeOff.code, "OVERBOOKING_NOT_ALLOWED");
    const propertyOff = decideExplicitOverbooking({
      propertyAllowed: false,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 10, enabled(2, null))],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(propertyOff.ok, false);
    if (!propertyOff.ok) assert.equal(propertyOff.code, "OVERBOOKING_NOT_ALLOWED");
  });

  it("rejects an enabled room type that has no usable limit", () => {
    const decision = decideExplicitOverbooking({
      propertyAllowed: true,
      nights: [
        {
          night: "2026-10-20",
          typesBefore: [type("standard", 10, 10, enabled(null, null))],
          additionalByType: { standard: 1 },
        },
      ],
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "OVERBOOKING_CONFIGURATION_INVALID");
  });

  it("restores only the cancelled room type", () => {
    const before = [
      type("standard", 10, 12, enabled(2, null)),
      type("deluxe", 10, 10, enabled(3, null)),
    ];
    const after = [
      type("standard", 10, 11, enabled(2, null)),
      type("deluxe", 10, 10, enabled(3, null)),
    ];
    assert.equal(roomTypeShortage(10, 12), 2);
    assert.equal(roomTypeShortage(10, 11), 1);
    assert.equal(
      roomTypeOverbookingRemaining({ propertyAllowed: true, type: before[1] }),
      roomTypeOverbookingRemaining({ propertyAllowed: true, type: after[1] }),
    );
    assert.equal(totalOverbookedRooms(before), 2);
    assert.equal(totalOverbookedRooms(after), 1);
  });

  it("serializes two Standard requests and leaves Deluxe independent", async () => {
    const results = await settleConcurrentOverbooking({
      propertyAllowed: true,
      night: "2026-10-20",
      typesBefore: [
        type("standard", 10, 11, enabled(2, null)),
        type("deluxe", 10, 10, enabled(3, null)),
      ],
      requests: [
        { roomTypeId: "standard", rooms: 1 },
        { roomTypeId: "standard", rooms: 1 },
        { roomTypeId: "deluxe", rooms: 1 },
      ],
    });
    assert.deepEqual(results, ["accepted", "OVERBOOKING_LIMIT_REACHED", "accepted"]);
  });
});

describe("overbooking migration contract", () => {
  it("keeps physical availability clamped and locks each room type night", () => {
    assert.match(migration, /pms_room_type_overbooking_rules/);
    assert.match(migration, /floor\(GREATEST\(_physical_capacity, 0\) \* _percentage \/ 100\.0\)/);
    assert.match(migration, /LEAST\(\s*GREATEST\(_maximum, 0\)/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.match(migration, /type_id::text \|\| '\|' \|\| night::text/);
    assert.match(migration, /room_type_allowance/);
    assert.doesNotMatch(migration, /property_allowance/);
    assert.doesNotMatch(migration, /pms_overbooking_allowance_for/);
    assert.match(migration, /RAISE EXCEPTION 'NO_AVAILABILITY'/);
    assert.match(migration, /RAISE EXCEPTION 'OVERBOOKING_NOT_ALLOWED'/);
    assert.match(migration, /RAISE EXCEPTION 'OVERBOOKING_APPROVAL_REQUIRED'/);
    assert.match(migration, /RAISE EXCEPTION 'OVERBOOKING_REASON_REQUIRED'/);
    assert.match(migration, /OVERBOOKING_LIMIT_REACHED/);
    assert.match(migration, /RAISE EXCEPTION 'OVERBOOKING_CONFIGURATION_INVALID'/);
    assert.match(migration, /member\.role IN \('owner', 'manager'\)/);
    assert.match(migration, /shortage := GREATEST\(reservation_demand - physical_before, 0\)/);
    assert.doesNotMatch(migration, /hotel_reservation_counters/);
    const controls = readFileSync(
      new URL("../../../../supabase/migrations/0175_overbooking_controls.sql", import.meta.url),
      "utf8",
    );
    assert.match(controls, /pms_overbooking_date_limits/);
    assert.match(controls, /pms_room_type_overbooking_effective_limits/);
    assert.match(controls, /rules\.manager_approval_required/);
    assert.match(controls, /rules\.overbooking_reason_required/);
    assert.match(controls, /candidate_allowance < chosen_allowance/);
  });

  it("does not give public, channel, or waitlist writers the override function", () => {
    const publicBooking = readFileSync(
      new URL("./public-booking.functions.ts", import.meta.url),
      "utf8",
    );
    const aiosell = readFileSync(
      new URL("./distribution/aiosell-ari.ts", import.meta.url),
      "utf8",
    );
    const ingest = readFileSync(
      new URL("../../../../supabase/migrations/0164_external_reservation_ingest.sql", import.meta.url),
      "utf8",
    );
    const groups = readFileSync(new URL("./groups.functions.ts", import.meta.url), "utf8");
    for (const source of [publicBooking, aiosell, ingest, groups]) {
      assert.equal(source.includes("create_hotel_reservation_overbooking"), false);
      assert.equal(source.includes("effectiveBookable"), false);
    }
  });
});
