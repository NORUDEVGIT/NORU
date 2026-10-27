import { describe, expect, it } from "vitest";

import type { FrontOfficeStay } from "./frontoffice.functions";
import {
  focusFrontOfficeStay,
  frontOfficeStayKey,
  projectOperationalStayRows,
  siblingUnitSummary,
  stayDateTargetsOneRoom,
} from "./fo-unit-desk";
import type { FrontOfficeRoomTarget } from "./reservation-room-units";

function unit(patch: Partial<FrontOfficeRoomTarget> & Pick<FrontOfficeRoomTarget, "id" | "status">): FrontOfficeRoomTarget {
  return {
    unitSequence: 1,
    roomTypeId: "type-1",
    roomId: null,
    arrivalDate: "2026-10-23",
    departureDate: "2026-10-25",
    adults: 1,
    roomTypeName: "Card2 Smoke Twin",
    roomNumber: null,
    ...patch,
  };
}

function stay(patch: Partial<FrontOfficeStay> = {}): FrontOfficeStay {
  return {
    id: "res-1",
    confirmationNumber: "NR-000029",
    guestId: "guest-1",
    guestName: "Yohanes Worku",
    guestVip: false,
    guestPhone: null,
    guestEmail: null,
    roomTypeId: "type-1",
    roomTypeName: "Card2 Smoke Twin",
    roomId: "room-904",
    roomNumber: "904",
    arrivalDate: "2026-10-23",
    departureDate: "2026-10-25",
    nights: 2,
    adults: 2,
    children: 0,
    status: "checked_in",
    specialRequests: null,
    overstay: false,
    ...patch,
  };
}

describe("FO-04 operational unit rows", () => {
  const rooms: FrontOfficeRoomTarget[] = [
    unit({
      id: "unit-1",
      unitSequence: 1,
      status: "checked_in",
      roomId: "room-904",
      roomNumber: "904",
    }),
    unit({
      id: "unit-2",
      unitSequence: 2,
      status: "confirmed",
      roomId: "room-smk",
      roomNumber: "SMK1",
      arrivalDate: "2026-10-23",
      departureDate: "2026-10-26",
    }),
  ];

  it("puts the checked-in unit in-house and the confirmed unit on arrivals", () => {
    const master = stay({ roomUnits: rooms });
    const inHouse = projectOperationalStayRows([master], "in_house", "2026-10-23");
    const arrivals = projectOperationalStayRows([master], "arrivals", "2026-10-23");

    expect(inHouse.map((row) => row.reservationRoomId)).toEqual(["unit-1"]);
    expect(inHouse[0]?.status).toBe("checked_in");
    expect(inHouse[0]?.roomNumber).toBe("904");
    expect(arrivals.map((row) => row.reservationRoomId)).toEqual(["unit-2"]);
    expect(arrivals[0]?.status).toBe("confirmed");
    expect(arrivals[0]?.roomNumber).toBe("SMK1");
    expect(arrivals[0]?.id).toBe("res-1");
    expect(frontOfficeStayKey(inHouse[0]!)).not.toBe(frontOfficeStayKey(arrivals[0]!));
  });

  it("shows the sibling lifecycle on each row", () => {
    const [row] = projectOperationalStayRows([stay({ roomUnits: rooms })], "in_house", "2026-10-23");
    expect(siblingUnitSummary(row!)).toBe("Room SMK1 confirmed");
    expect(row?.siblingUnits?.[0]?.reservationRoomId).toBe("unit-2");
  });

  it("keeps a reservation with no unit rows as one header", () => {
    const header = stay({ status: "confirmed", roomUnits: [] });
    expect(projectOperationalStayRows([header], "arrivals", "2026-10-23")).toEqual([header]);
  });

  it("does not invent a passed validation or a second unit for departures", () => {
    const rows = projectOperationalStayRows([stay({ roomUnits: rooms })], "departures", "2026-10-25");
    expect(rows.map((row) => [row.reservationRoomId, row.status])).toEqual([["unit-1", "checked_in"]]);
  });

  it("focuses quick view on the selected unit", () => {
    const focused = focusFrontOfficeStay(stay({ roomUnits: rooms }), "unit-2", "2026-10-23");
    expect(focused.reservationRoomId).toBe("unit-2");
    expect(focused.roomNumber).toBe("SMK1");
    expect(focused.status).toBe("confirmed");
  });

  it("refuses a reservation-wide date change when several rooms are still open", () => {
    expect(stayDateTargetsOneRoom(stay({ roomUnits: rooms }))).toBe(false);
    expect(stayDateTargetsOneRoom(stay({ roomUnits: [rooms[0]!] }))).toBe(true);
    expect(stayDateTargetsOneRoom(stay())).toBe(true);
  });
});

describe("FO-GR01B unit guest identity", () => {
  const occupantUnits: FrontOfficeRoomTarget[] = [
    unit({
      id: "unit-a",
      unitSequence: 1,
      status: "checked_in",
      roomId: "room-401",
      roomNumber: "401",
      occupants: [{ guestId: "guest-test", name: "Test Guest", isPrimary: true }],
    }),
    unit({
      id: "unit-b",
      unitSequence: 2,
      status: "confirmed",
      roomId: "room-101a",
      roomNumber: "101A",
      occupants: [{ guestId: "guest-aker", name: "Aker Girma", isPrimary: true, phone: "+251911" }],
    }),
    unit({
      id: "unit-c",
      unitSequence: 3,
      status: "confirmed",
      roomId: "room-102",
      roomNumber: "102",
      occupants: [{ guestId: "guest-c", name: "Guest C", isPrimary: true }],
    }),
  ];

  it("1: a 2-unit reservation projects two separate stays with distinct guests", () => {
    const twoArriving: FrontOfficeRoomTarget[] = [
      unit({
        id: "unit-x",
        unitSequence: 1,
        status: "confirmed",
        roomId: "room-401",
        roomNumber: "401",
        occupants: [{ guestId: "guest-test", name: "Test Guest", isPrimary: true }],
      }),
      occupantUnits[1]!,
    ];
    const rows = projectOperationalStayRows(
      [stay({ roomUnits: twoArriving, status: "confirmed" })],
      "arrivals",
      "2026-10-23",
    );
    expect(rows.map((row) => [row.reservationRoomId, row.guestId, row.guestName])).toEqual([
      ["unit-x", "guest-test", "Test Guest"],
      ["unit-b", "guest-aker", "Aker Girma"],
    ]);
    // Both rows share one reservation; this does not create a second reservation.
    expect(rows.every((row) => row.id === "res-1")).toBe(true);
  });

  it("2: mixed statuses keep each unit's own guest (Unit A in-house, Unit B arrivals)", () => {
    const master = stay({ roomUnits: occupantUnits.slice(0, 2), guestId: "booker-1", guestName: "Booker Name" });
    const inHouse = projectOperationalStayRows([master], "in_house", "2026-10-23");
    const arrivals = projectOperationalStayRows([master], "arrivals", "2026-10-23");

    expect(inHouse).toHaveLength(1);
    expect(inHouse[0]?.guestId).toBe("guest-test");
    expect(inHouse[0]?.guestName).toBe("Test Guest");

    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]?.guestId).toBe("guest-aker");
    expect(arrivals[0]?.guestName).toBe("Aker Girma");
  });

  it("5: a 3-unit reservation projects primary, secondary, and tertiary occupants independently", () => {
    const master = stay({
      roomUnits: occupantUnits,
      guestId: "booker-1",
      guestName: "Booker Name",
      status: "confirmed",
    });
    const rows = projectOperationalStayRows([master], "arrivals", "2026-10-23");
    expect(rows.map((row) => [row.reservationRoomId, row.guestId, row.guestName])).toEqual([
      ["unit-b", "guest-aker", "Aker Girma"],
      ["unit-c", "guest-c", "Guest C"],
    ]);
    // Every row shares the same reservation number; no second reservation is created.
    expect(rows.every((row) => row.id === "res-1")).toBe(true);
  });

  it("6: a unit with no primary occupant of its own keeps the header guest, not a sibling's", () => {
    const noOccupant = unit({
      id: "unit-d",
      unitSequence: 1,
      status: "confirmed",
      roomId: "room-500",
      roomNumber: "500",
      occupants: [],
    });
    const master = stay({
      roomUnits: [noOccupant, occupantUnits[1]!],
      guestId: "booker-1",
      guestName: "Booker Name",
      status: "confirmed",
    });
    const rows = projectOperationalStayRows([master], "arrivals", "2026-10-23");
    const unitD = rows.find((row) => row.reservationRoomId === "unit-d");
    const unitB = rows.find((row) => row.reservationRoomId === "unit-b");
    expect(unitD?.guestId).toBe("booker-1");
    expect(unitD?.guestName).toBe("Booker Name");
    // Never borrows the sibling's own occupant either.
    expect(unitD?.guestId).not.toBe("guest-aker");
    expect(unitB?.guestId).toBe("guest-aker");
  });

  it("9: focusing one unit never changes a sibling's guest identity (sibling isolation)", () => {
    const master = stay({ roomUnits: occupantUnits, guestId: "booker-1", guestName: "Booker Name" });
    const focusedB = focusFrontOfficeStay(master, "unit-b", "2026-10-23");
    const focusedC = focusFrontOfficeStay(master, "unit-c", "2026-10-23");
    expect(focusedB.guestName).toBe("Aker Girma");
    expect(focusedC.guestName).toBe("Guest C");
    expect(focusedB.reservationRoomId).toBe("unit-b");
    expect(focusedC.reservationRoomId).toBe("unit-c");
  });
});
