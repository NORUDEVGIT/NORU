import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const eligibilitySql = read(
  "supabase/migrations/0168_room_assignment_eligibility_qualification.sql",
);
const drizzleSql = read("drizzle/migrations/0168_room_assignment_eligibility_qualification.sql");
const reservations = read("src/packages/pms/lib/reservations.functions.ts");
const roomType = read("src/packages/pms/lib/reservation-room-type.functions.ts");
const roomsUi = read("src/packages/pms/components/workspaces/reservation-detail-rooms.tsx");
const roomTypeUi = read("src/packages/pms/components/workspaces/reservation-room-type-change.tsx");
const workspace = read("src/packages/pms/components/workspaces/reservation-detail-workspace.tsx");
const checkIn = read("src/packages/pms/components/frontoffice/fo-check-in-stepper.tsx");
const roomDisplay = read("src/packages/pms/lib/reservation-room-display.functions.ts");
const occupants = read(
  "src/packages/pms/components/workspaces/reservation-detail-room-occupants.tsx",
);

const assignFn = reservations.slice(
  reservations.indexOf("export const assignReservationRoom"),
  reservations.indexOf("export const applyReservationRoomPackage"),
);
const listFn = reservations.slice(
  reservations.indexOf("export const listAssignableRooms"),
  reservations.indexOf("export const listReservations"),
);
const previewFn = roomType.slice(
  roomType.indexOf("export const previewReservationRoomTypeChange"),
  roomType.indexOf("export const confirmReservationRoomTypeChange"),
);
const confirmFn = roomType.slice(roomType.indexOf("export const confirmReservationRoomTypeChange"));

describe("room eligibility SQL", () => {
  it("qualifies require_occupancy_match so the function no longer raises 42702", () => {
    expect(eligibilitySql).toBe(drizzleSql);
    expect(eligibilitySql).toContain("rules.require_occupancy_match");
    expect(eligibilitySql).toContain("rule_require_occupancy_match boolean := false");
    expect(eligibilitySql).not.toMatch(/^\s+require_occupancy_match boolean/m);
    expect(eligibilitySql).not.toContain("INTO require_occupancy_match");
    expect(eligibilitySql).toContain(
      "_for_check_in OR rule_require_housekeeping OR rule_housekeeping_affects",
    );
  });
});

describe("assign room persistence", () => {
  it("writes the selected unit through the room-unit command and rejects a stale room", () => {
    expect(assignFn).toContain('rpc("assign_hotel_reservation_room_unit"');
    expect(assignFn).toContain("_reservation_room_id: targetUnit.id");
    expect(assignFn).toContain("targetUnit?.room_type_id ?? existing.room_type_id");
    expect(assignFn).toContain("targetUnit?.arrival_date ?? existing.arrival_date");
    expect(assignFn).toContain("throw new Error(ROOM_ASSIGNMENT_UNAVAILABLE)");
    expect(reservations).toContain(
      'const ROOM_ASSIGNMENT_UNAVAILABLE =\n  "This room is no longer available. Select another eligible room."',
    );
    expect(assignFn).not.toContain(".update({ room_id: data.roomId })");
    expect(assignFn).toContain('assignmentStatus === "checked_in"');
  });

  it("keeps the eligible-only list and explains occupied rooms on the detail display", () => {
    expect(listFn).toContain("if (eligibility.eligible)");
    expect(listFn).not.toContain("occupiedUntil");
    expect(roomDisplay).toContain("getAssignmentEligibilityCompat");
    expect(roomDisplay).toContain("excludeReservationId: data.reservationId");
    expect(roomDisplay).toContain("eligible: eligibility.eligible && !sibling");
    expect(roomDisplay).not.toContain("forCheckIn: true");
    expect(roomsUi).toContain("listReservationRoomDisplay");
    expect(roomsUi).toContain("listAssignableRooms");
    expect(roomsUi).toContain("activeUnit?.arrivalDate ?? reservation.arrivalDate");
    expect(roomsUi).toContain("activeUnit?.roomTypeId ?? reservation.roomTypeId");
  });

  it("assigns a confirmed sibling from that unit status after another room is in house", () => {
    expect(assignFn).toContain("targetUnit.status ?? existing.status");
    expect(assignFn).not.toContain('if (String(existing.status) === "checked_in")');
    expect(roomsUi).toContain("roomActionsFor");
    expect(roomsUi).toContain("units.length > 1 ? null : (");
    expect(occupants).toContain('onChoose(primary.guestId, "remove")');
    expect(occupants).toContain("room-subtotal-");
  });

  it("reviews one unit's packages and releases incompatible rows only after confirm", () => {
    expect(roomType).toContain('.eq("reservation_room_id", input.reservationRoomId)');
    expect(roomType).toContain("unitPackageKept");
    expect(roomType).toContain("price_hotel_stay");
    expect(confirmFn).toContain("release_hotel_reservation_room_package");
    expect(confirmFn).toContain("if (line.kept) continue");
    expect(confirmFn).not.toContain("pointer?.id === data.reservationRoomId");
    expect(confirmFn).toContain("sync_hotel_reservation_packages");
    expect(confirmFn).not.toContain("apply_hotel_reservation_room_package");
    expect(roomTypeUi).toContain("package-incompatible");
    expect(roomTypeUi).toContain("package-kept");
  });

  it("keeps assignment eligibility separate from check-in readiness", () => {
    expect(listFn).not.toMatch(/forCheckIn:\s*true/);
    expect(listFn).not.toContain('housekeeping_status === "inspected"');
    expect(listFn).toContain("if (eligibility.eligible)");
    expect(checkIn).toContain("listAssignableRooms");
    expect(checkIn).toContain("stay.roomId");
    expect(checkIn).not.toContain("42702");
  });

  it("reloads reservation, folio, availability, and history reads after a room change", () => {
    expect(workspace).toContain('queryKey: ["reservation", restaurantId, reservationId]');
    expect(workspace).toContain('queryKey: ["assignable-rooms", restaurantId]');
    expect(workspace).toContain('queryKey: ["reservation-folio", restaurantId, reservationId]');
    expect(workspace).toContain('queryKey: ["room-type-availability", restaurantId]');
    expect(roomsUi).toContain("onSaved()");
  });
});

describe("change room", () => {
  it("uses selection mode before check-in and Front Office after check-in", () => {
    expect(roomsUi).toContain("beginSelection(action, unit)");
    expect(roomsUi).toContain('onOperate?.("change_room", targetId)');
    expect(roomsUi).toContain("reservationRoomId: assignmentMode.reservationRoomId");
    expect(workspace).toContain("RoomMoveDialog");
  });
});

describe("change room type", () => {
  it("reviews one unit and persists only after confirmation", () => {
    expect(roomType).toContain("getRoomTypeAvailabilityCompat");
    expect(roomType).toContain('rpc("price_hotel_stay"');
    expect(roomType).toContain("ratePlan.room_type_id !== input.roomTypeId");
    expect(roomType).toContain("The proposed room type has no remaining availability.");
    expect(previewFn).not.toContain(".update(");
    expect(previewFn).not.toContain("amend_hotel_reservation_priced");
    expect(confirmFn).toContain('rpc("amend_hotel_reservation_priced"');
    expect(confirmFn).toContain('.eq("id", data.reservationRoomId)');
    expect(confirmFn).toContain("room_type_id: review.current.roomTypeId");
    expect(confirmFn).toContain("room_type_id: review.proposed.roomTypeId");
    expect(confirmFn).toContain('eventType: "repriced"');
    expect(roomTypeUi).toContain('data-testid="room-type-change"');
    expect(roomTypeUi).toContain('data-testid="room-type-change-impact"');
    expect(roomTypeUi).toContain("Review Impact");
    expect(roomTypeUi).toContain("Confirm Change");
    expect(roomTypeUi).toContain("reservationRoomId: unit.id");
    expect(roomTypeUi).not.toContain("commercialBookingSource");
    expect(roomTypeUi).not.toContain("marketSegment");
    expect(roomTypeUi).not.toContain("specialRequests");
    expect(workspace).toContain("draftReservationId.current === reservation.id");
  });
});
