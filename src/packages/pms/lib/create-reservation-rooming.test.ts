import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseCreateReservationDraft } from "@/packages/pms/lib/create-reservation-draft";
import {
  activateRoom,
  activeRoomTarget,
  addGroupRoom,
  applyActiveRoomSelection,
  applyRoomOccupancy,
  assignExtraOccupant,
  buildGroupRoomGuestAssignments,
  confirmSingleDowngrade,
  groupStayTotals,
  groupStep1Issue,
  initialStep1RoomingState,
  removeGroupRoom,
  restoreStep1RoomingState,
  selectReservationMode,
  step1CreateFields,
  type Step1RoomingState,
} from "@/packages/pms/lib/create-reservation-rooming";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

function groupState(): Step1RoomingState {
  const selected = selectReservationMode(initialStep1RoomingState(), "group").state;
  return {
    ...selected,
    guestId: "lead-guest",
    arrival: "2026-10-14",
    departure: "2026-10-16",
    room1: {
      roomTypeId: "twin",
      adults: 2,
      children: 0,
      infants: 0,
      ratePlanId: "bar",
    },
  };
}

describe("GROUP-RES-03 Step 1 rooming", () => {
  const page = read("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const roomingList = read(
    "src/packages/pms/components/bookings/create-reservation-rooming-list.tsx",
  );
  const step = page.slice(
    page.indexOf("const guestStayAvailabilitySection"),
    page.indexOf("const bookingDetailsSection"),
  );
  const booking = page.slice(
    page.indexOf("const bookingDetailsSection"),
    page.indexOf("const stepSections"),
  );
  const policies = page.slice(
    page.indexOf("const policiesSection"),
    page.indexOf("const reviewSection"),
  );
  const review = page.slice(
    page.indexOf("const reviewSection"),
    page.indexOf("function roomRateLabel"),
  );
  const mutation = page.slice(page.indexOf("mutationFn:"), page.indexOf("onSuccess:"));
  const fo = read("src/packages/pms/lib/fo-check-in.functions.ts");

  it("selector defaults to single and an older draft restores as single", () => {
    expect(initialStep1RoomingState().reservationMode).toBe("single");
    expect(page).toContain('useState<ReservationMode>("single")');
    expect(page).toContain('data-testid="reservation-type-selector"');
    expect(restoreStep1RoomingState({}).reservationMode).toBe("single");
    const restored = parseCreateReservationDraft({
      version: 1,
      guest: { id: "guest-1", fullName: "Abebe Kebed" },
    });
    expect(restored?.reservationMode).toBe("single");
    expect(restored?.activeRoomIndex).toBe(0);
  });

  it("single keeps one read-only room and hides the rooming list", () => {
    const single = initialStep1RoomingState();
    expect(groupStayTotals(single).rooms).toBe(1);
    expect(page).toContain("roomsReadOnly");
    expect(page).toContain("rooms={groupMode ? stayTotals.rooms : 1}");
    expect(step).toContain('reservationMode === "group"');
    expect(step).toContain("<CreateReservationRoomingList");
    expect(step).not.toContain("<CreateReservationExtraRooms");
    expect(roomingList).toContain("+ Add Another Room");
    expect(roomingList).toContain("Rooming List");
  });

  it("switching single to group preserves the guest and dates", () => {
    const single = {
      ...initialStep1RoomingState(),
      guestId: "lead-guest",
      arrival: "2026-10-14",
      departure: "2026-10-16",
      room1: {
        roomTypeId: "twin",
        adults: 2,
        children: 1,
        infants: 0,
        ratePlanId: "bar",
      },
    };
    const next = selectReservationMode(single, "group");
    expect(next.status).toBe("applied");
    expect(next.state.guestId).toBe("lead-guest");
    expect(next.state.arrival).toBe("2026-10-14");
    expect(next.state.departure).toBe("2026-10-16");
    expect(next.state.room1.roomTypeId).toBe("twin");
    expect(next.state.reservationMode).toBe("group");
  });

  it("adds a second room, derives room count and occupancy, and defaults room 1 to the lead guest", () => {
    const withRoom = addGroupRoom(groupState(), "room-2");
    expect(withRoom.extras).toHaveLength(1);
    expect(withRoom.extras[0]).toMatchObject({
      roomTypeId: "",
      adults: 1,
      children: 0,
      infants: 0,
      ratePlanId: null,
      occupant: null,
    });
    expect(withRoom.activeRoomIndex).toBe(1);
    const occupied = applyRoomOccupancy(withRoom, 1, { adults: 2, children: 1 });
    expect(groupStayTotals(occupied)).toEqual({ rooms: 2, adults: 4, children: 1, infants: 0 });
    expect(buildGroupRoomGuestAssignments(occupied)).toEqual([
      { unitSequence: 1, guestId: "lead-guest", isPrimary: true },
    ]);
    expect(roomingList).toContain("Lead Guest");
    expect(roomingList).toContain("room-primary-badge");
  });

  it("requires a primary occupant on an additional room and accepts an existing guest profile", () => {
    const withRoom = applyActiveRoomSelection(addGroupRoom(groupState(), "room-2"), {
      roomTypeId: "king",
      ratePlanId: "corporate",
    });
    expect(
      groupStep1Issue({
        hasGuest: true,
        datesValid: true,
        canCreateUnpriced: false,
        room1: { ...withRoom.room1, maxOccupancy: 4, available: 2 },
        extras: withRoom.extras.map((unit) => ({
          ...unit,
          occupantGuestId: unit.occupant?.guestId ?? null,
          maxOccupancy: 4,
          available: 2,
        })),
      }),
    ).toBe("Choose a primary occupant for Room 2.");
    const assigned = assignExtraOccupant(withRoom, "room-2", {
      guestId: "guest-2",
      fullName: "Loza Tilahun",
    });
    expect(assigned.extras[0]?.occupant?.fullName).toBe("Loza Tilahun");
    expect(roomingList).toContain("Guest Profile");
    expect(roomingList).toContain("listGuests");
    expect(roomingList).toContain("GuestFormDialog");
    expect(roomingList).toContain("Change");
  });

  it("edits availability and rate selection for the active room only", () => {
    const withRoom = addGroupRoom(groupState(), "room-2");
    expect(activeRoomTarget(withRoom).unitSequence).toBe(2);
    const selected = applyActiveRoomSelection(withRoom, {
      roomTypeId: "king",
      ratePlanId: "corporate",
    });
    expect(selected.room1).toMatchObject({ roomTypeId: "twin", ratePlanId: "bar" });
    expect(selected.extras[0]).toMatchObject({ roomTypeId: "king", ratePlanId: "corporate" });
    const back = applyActiveRoomSelection(activateRoom(selected, 0), {
      roomTypeId: "twin",
      ratePlanId: "bar",
    });
    expect(back.extras[0]?.roomTypeId).toBe("king");
    expect(page).toContain("applyActiveRoomSelection(currentRooming()");
    expect(page).toContain("rooms: 1");
    expect(page).toContain("quoteStay");
  });

  it("removes room 2 and its occupant, then asks before a group to single downgrade", () => {
    const second = assignExtraOccupant(addGroupRoom(groupState(), "room-2"), "room-2", {
      guestId: "guest-2",
      fullName: "Loza Tilahun",
    });
    const third = assignExtraOccupant(addGroupRoom(second, "room-3"), "room-3", {
      guestId: "guest-3",
      fullName: "Sara Bekele",
    });
    const removed = removeGroupRoom(third, "room-2");
    expect(removed.extras.map((unit) => unit.occupant?.guestId)).toEqual(["guest-3"]);
    expect(buildGroupRoomGuestAssignments(removed).map((row) => row.unitSequence)).toEqual([1, 2]);
    expect(selectReservationMode(removed, "single").status).toBe("confirm");
    const downgraded = confirmSingleDowngrade(removed);
    expect(downgraded.reservationMode).toBe("single");
    expect(downgraded.extras).toEqual([]);
    expect(downgraded.room1.roomTypeId).toBe("twin");
    expect(downgraded.guestId).toBe("lead-guest");
    expect(page).toContain('data-testid="group-to-single-confirm"');
  });

  it("sends a group create payload and leaves a single create payload compatible", () => {
    const assigned = assignExtraOccupant(addGroupRoom(groupState(), "room-2"), "room-2", {
      guestId: "guest-2",
      fullName: "Loza Tilahun",
    });
    expect(step1CreateFields(assigned)).toEqual({
      reservationMode: "group",
      roomGuestAssignments: [
        { unitSequence: 1, guestId: "lead-guest", isPrimary: true },
        { unitSequence: 2, guestId: "guest-2", isPrimary: true },
      ],
    });
    expect(
      buildGroupRoomGuestAssignments(assigned).filter((row) => row.unitSequence === 1),
    ).toHaveLength(1);
    expect(step1CreateFields(initialStep1RoomingState())).toEqual({});
    expect(mutation).toContain('reservationMode === "group"');
    expect(mutation).toContain('reservationMode: "group"');
    expect(mutation).toContain(
      "roomGuestAssignments: buildGroupRoomGuestAssignments(currentRooming())",
    );
    expect(mutation).toContain("guestId: guest?.id");
    expect(mutation).not.toContain('.from("hotel_reservation_room_guests")');
  });

  it("restores a group draft without a duplicate room 1 occupant", () => {
    const restored = parseCreateReservationDraft({
      version: 1,
      reservationMode: "group",
      activeRoomIndex: 1,
      guest: { id: "lead-guest", fullName: "Abebe Kebed" },
      arrival: "2026-10-14",
      departure: "2026-10-16",
      extraRoomUnits: [
        {
          key: "room-2",
          roomTypeId: "",
          adults: 1,
          children: 0,
          infants: 0,
          ratePlanId: null,
          occupant: { guestId: "guest-2", fullName: "Loza Tilahun" },
        },
      ],
    });
    expect(restored?.reservationMode).toBe("group");
    expect(restored?.activeRoomIndex).toBe(1);
    expect(restored?.extraRoomUnits).toHaveLength(1);
    expect(restored?.extraRoomUnits[0]?.occupant?.guestId).toBe("guest-2");
    expect(page).toContain("stored.activeRoomIndex");
    expect(page).toContain('stored.reservationMode === "group"');
  });

  it("uses the locked compact group row, totals, and active-room labels", () => {
    const header = roomingList.slice(0, roomingList.indexOf("<RoomingCard"));
    const room1 = roomingList.slice(
      roomingList.indexOf("<RoomingCard"),
      roomingList.indexOf("{extras.map"),
    );
    expect(page).toContain('data-testid="reservation-type-selector"');
    expect(page).toContain("rooms={groupMode ? stayTotals.rooms : 1}");
    expect(page).toContain("occupancyReadOnly={groupMode}");
    expect(step).toContain('reservationMode === "group" ?');
    expect(step).toContain("<CreateReservationRoomingList");
    expect(header).toContain("+ Add Another Room");
    expect(header).toContain('data-testid="add-another-room"');
    expect(roomingList).toContain("data-testid={`rooming-room-${sequence}`}");
    expect(roomingList).toContain('data-testid="room-editing-badge"');
    expect(roomingList).toContain("Editing");
    expect(room1).toContain("primary");
    expect(room1).not.toContain("onRemove");
    expect(roomingList).toContain('data-testid="room-primary-badge"');
    expect(roomingList).toContain("data-testid={`remove-room-${sequence}`}");
    expect(roomingList).toContain("Edit Selection");
    expect(roomingList).toContain("testId={`room-${sequence}-adults`}");
    expect(page).toContain("activeRoomLabel={groupMode ? `Room ${activeRoomIndex + 1}` : null}");
    expect(page).toContain("Edit Room ${activeRoomIndex + 1} Criteria");
    expect(page).toContain("roomSequenceLabel={groupMode ? `Room ${activeRoomIndex + 1}` : null}");
    expect(page).toContain(
      'selectedPanelTitle={groupMode ? "Primary Guest / Booker" : "Selected Guest"}',
    );
  });

  it("does not change Step 2, Step 3, Step 4, or Front Office", () => {
    expect(booking).not.toContain("reservation-type-selector");
    expect(booking).not.toContain("CreateReservationRoomingList");
    expect(policies).not.toContain("reservation-type-selector");
    expect(policies).not.toContain("CreateReservationRoomingList");
    expect(review).not.toContain("reservation-type-selector");
    expect(review).not.toContain("CreateReservationRoomingList");
    expect(fo).not.toContain("reservation-type-selector");
    expect(fo).not.toContain("CreateReservationRoomingList");
    expect(fo).not.toContain("roomGuestAssignments");
  });
});
