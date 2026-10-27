import { describe, expect, it } from "vitest";

import { unitAssignmentSnapshot, type RoomAssignmentSnapshot } from "./room-assignment-snapshot";

type Unit = { id: string; unitSequence: number; roomId: string | null; guest: string };
type Reservation = { headerRoomId: string | null; updatedAt: string; units: Unit[] };

let clock = 0;
function tick(): string {
  clock += 1;
  return `2026-10-27T10:00:${String(clock).padStart(2, "0")}.000Z`;
}

/** Model of assign_hotel_reservation_room_unit (0183) + rollup_hotel_reservation_status (0156). */
function rpcAssign(
  res: Reservation,
  input: { reservationRoomId: string; roomId: string | null } & RoomAssignmentSnapshot,
): Reservation {
  const unit = input.reservationRoomId
    ? res.units.find((row) => row.id === input.reservationRoomId)
    : res.units.length === 1
      ? res.units[0]
      : undefined;
  if (!unit) throw new Error("ROOM_UNIT_REQUIRED");
  if (input.expectedUpdatedAt !== null && res.updatedAt !== input.expectedUpdatedAt) {
    throw new Error("ASSIGNMENT_STALE");
  }
  if (input.expectedRoomId !== null && unit.roomId !== input.expectedRoomId) {
    throw new Error("ASSIGNMENT_STALE");
  }
  if (unit.roomId === input.roomId) return res;
  if (input.roomId && res.units.some((row) => row.id !== unit.id && row.roomId === input.roomId)) {
    throw new Error("ROOM_ALREADY_BOOKED");
  }
  const units = res.units.map((row) =>
    row.id === unit.id ? { ...row, roomId: input.roomId } : row,
  );
  const first = [...units].sort((a, b) => a.unitSequence - b.unitSequence)[0];
  return { headerRoomId: first?.roomId ?? null, updatedAt: tick(), units };
}

/** What Reservation Detail sends for one unit, from the view it loaded. */
function clientAssign(
  server: Reservation,
  view: Reservation,
  reservationRoomId: string,
  roomId: string | null,
): Reservation {
  return rpcAssign(server, {
    reservationRoomId,
    roomId,
    ...unitAssignmentSnapshot({
      units: view.units,
      reservationRoomId,
      headerRoomId: view.headerRoomId,
      updatedAt: view.updatedAt,
    }),
  });
}

function twoUnit(): Reservation {
  return {
    headerRoomId: "room-401",
    updatedAt: tick(),
    units: [
      { id: "unit-a", unitSequence: 1, roomId: "room-401", guest: "Guest A" },
      { id: "unit-b", unitSequence: 2, roomId: null, guest: "Guest B" },
    ],
  };
}

function threeUnit(): Reservation {
  return {
    headerRoomId: "room-401",
    updatedAt: tick(),
    units: [
      { id: "unit-1", unitSequence: 1, roomId: "room-401", guest: "Primary" },
      { id: "unit-2", unitSequence: 2, roomId: null, guest: "Secondary" },
      { id: "unit-3", unitSequence: 3, roomId: null, guest: "Tertiary" },
    ],
  };
}

const unitOf = (res: Reservation, id: string) => res.units.find((row) => row.id === id);

describe("unitAssignmentSnapshot — selected-unit scope", () => {
  it("reproduces the regression: the old header fallback sent Room 401 for unassigned Unit B", () => {
    const res = twoUnit();
    const legacyExpected =
      res.units.find((unit) => unit.id === "unit-b")?.roomId ?? res.headerRoomId;
    expect(legacyExpected).toBe("room-401");
    expect(() =>
      rpcAssign(res, {
        reservationRoomId: "unit-b",
        roomId: "room-101A",
        expectedRoomId: legacyExpected,
        expectedUpdatedAt: res.updatedAt,
      }),
    ).toThrow("ASSIGNMENT_STALE");
  });

  it("reads an unassigned unit as null, never the header room or a sibling's room", () => {
    const res = twoUnit();
    expect(
      unitAssignmentSnapshot({
        units: res.units,
        reservationRoomId: "unit-b",
        headerRoomId: res.headerRoomId,
        updatedAt: res.updatedAt,
      }),
    ).toEqual({ expectedRoomId: null, expectedUpdatedAt: res.updatedAt });
  });

  it("reads an assigned unit's own room", () => {
    const res = twoUnit();
    expect(
      unitAssignmentSnapshot({
        units: res.units,
        reservationRoomId: "unit-a",
        headerRoomId: res.headerRoomId,
        updatedAt: res.updatedAt,
      }).expectedRoomId,
    ).toBe("room-401");
  });

  it("has no first-unit fallback on a multi-room reservation without a unit id", () => {
    const res = twoUnit();
    const snapshot = unitAssignmentSnapshot({
      units: res.units,
      reservationRoomId: "",
      headerRoomId: res.headerRoomId,
      updatedAt: res.updatedAt,
    });
    expect(snapshot.expectedRoomId).toBeNull();
    expect(() =>
      rpcAssign(res, { reservationRoomId: "", roomId: "room-101A", ...snapshot }),
    ).toThrow("ROOM_UNIT_REQUIRED");
  });

  it("has no fallback for an unknown unit id", () => {
    const res = twoUnit();
    expect(
      unitAssignmentSnapshot({
        units: res.units,
        reservationRoomId: "unit-zzz",
        headerRoomId: res.headerRoomId,
        updatedAt: res.updatedAt,
      }).expectedRoomId,
    ).toBeNull();
  });

  it("resolves the only unit on a single-room reservation, and the header on a header-only one", () => {
    expect(
      unitAssignmentSnapshot({
        units: [{ id: "unit-a", roomId: "room-7" }],
        reservationRoomId: "",
        headerRoomId: "room-7",
        updatedAt: "t",
      }).expectedRoomId,
    ).toBe("room-7");
    expect(
      unitAssignmentSnapshot({
        units: [],
        reservationRoomId: "",
        headerRoomId: "room-9",
        updatedAt: "t",
      }).expectedRoomId,
    ).toBe("room-9");
  });

  it("treats a missing updatedAt as no version check (null), not an empty string", () => {
    expect(
      unitAssignmentSnapshot({
        units: [],
        reservationRoomId: "",
        headerRoomId: null,
        updatedAt: "",
      }).expectedUpdatedAt,
    ).toBeNull();
  });
});

describe("2-unit reservation — Unit B assignment", () => {
  it("assigns Room 101A to Unit B without touching Unit A", () => {
    const before = twoUnit();
    const unitA = unitOf(before, "unit-a");
    const after = clientAssign(before, before, "unit-b", "room-101A");

    expect(unitOf(after, "unit-a")).toEqual(unitA);
    expect(unitOf(after, "unit-b")).toEqual({
      id: "unit-b",
      unitSequence: 2,
      roomId: "room-101A",
      guest: "Guest B",
    });
    expect(after.headerRoomId).toBe("room-401");
  });

  it("still rejects a genuinely stale Unit B snapshot after Unit B changed", () => {
    const loaded = twoUnit();
    const afterFirst = clientAssign(loaded, loaded, "unit-b", "room-101A");

    // A second desk still holding the pre-assignment view.
    expect(() => clientAssign(afterFirst, loaded, "unit-b", "room-102")).toThrow(
      "ASSIGNMENT_STALE",
    );

    // After refreshing, Unit B's own snapshot (101A) is current.
    const afterSecond = clientAssign(afterFirst, afterFirst, "unit-b", "room-102");
    expect(unitOf(afterSecond, "unit-b")?.roomId).toBe("room-102");
    expect(unitOf(afterSecond, "unit-a")?.roomId).toBe("room-401");

    // Two desks with the same fresh view: the second one loses.
    const afterThird = clientAssign(afterSecond, afterSecond, "unit-b", "room-103");
    expect(() => clientAssign(afterThird, afterSecond, "unit-b", "room-104")).toThrow(
      "ASSIGNMENT_STALE",
    );
  });

  it("the unit room check alone catches a changed Unit B when no version is sent", () => {
    const loaded = twoUnit();
    const moved = clientAssign(loaded, loaded, "unit-b", "room-101A");
    const noVersion = { ...moved, updatedAt: "" };
    const changed = clientAssign(moved, noVersion, "unit-b", "room-102");
    // noVersion now holds a stale Unit B room (101A) with no updated_at.
    expect(() => clientAssign(changed, noVersion, "unit-b", "room-103")).toThrow(
      "ASSIGNMENT_STALE",
    );
  });

  it("cannot put Unit B into Unit A's room", () => {
    const res = twoUnit();
    expect(() => clientAssign(res, res, "unit-b", "room-401")).toThrow("ROOM_ALREADY_BOOKED");
  });
});

describe("3-unit reservation — independent assignment", () => {
  it("primary, secondary, and tertiary units each assign independently", () => {
    let res = threeUnit();

    res = clientAssign(res, res, "unit-2", "room-101A");
    expect(res.units.map((row) => row.roomId)).toEqual(["room-401", "room-101A", null]);

    res = clientAssign(res, res, "unit-3", "room-102");
    expect(res.units.map((row) => row.roomId)).toEqual(["room-401", "room-101A", "room-102"]);

    res = clientAssign(res, res, "unit-1", "room-405");
    expect(res.units.map((row) => row.roomId)).toEqual(["room-405", "room-101A", "room-102"]);
    expect(res.headerRoomId).toBe("room-405");

    expect(res.units.map((row) => row.guest)).toEqual(["Primary", "Secondary", "Tertiary"]);
  });

  it("a sibling assignment makes an older view stale; refreshing clears it", () => {
    const loaded = threeUnit();
    const afterSecondary = clientAssign(loaded, loaded, "unit-2", "room-101A");

    expect(() => clientAssign(afterSecondary, loaded, "unit-3", "room-102")).toThrow(
      "ASSIGNMENT_STALE",
    );
    const afterTertiary = clientAssign(afterSecondary, afterSecondary, "unit-3", "room-102");
    expect(unitOf(afterTertiary, "unit-3")?.roomId).toBe("room-102");
    expect(unitOf(afterTertiary, "unit-2")?.roomId).toBe("room-101A");
    expect(unitOf(afterTertiary, "unit-1")?.roomId).toBe("room-401");
  });

  it("unassigning the tertiary unit leaves the other two alone", () => {
    let res = threeUnit();
    res = clientAssign(res, res, "unit-3", "room-102");
    res = clientAssign(res, res, "unit-3", null);
    expect(res.units.map((row) => row.roomId)).toEqual(["room-401", null, null]);
  });
});
