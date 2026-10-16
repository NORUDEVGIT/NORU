import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assignmentLabel,
  buildRoomAssignmentRows,
  buildRoomPrefDraft,
  emptyRoomFilters,
  filterRoomAssignmentRows,
  specialRequestsFromPrefs,
  uniqueFilterOptions,
} from "@/packages/pms/lib/reservation-detail-rooms";
import type { AssignableRoom, ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import type { HotelRoom, RoomType } from "@/packages/pms/lib/rooms.functions";

const roomsUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-rooms.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const reservation = {
  id: "11111111-1111-4111-8111-111111111111",
  confirmationNumber: "NR-000245",
  guestId: "22222222-2222-4222-8222-222222222222",
  guestName: "Maria Santos",
  guestPhone: "+351",
  guestEmail: "maria@email.com",
  guestVip: true,
  roomTypeId: "33333333-3333-4333-8333-333333333333",
  roomTypeName: "Deluxe King",
  roomId: null,
  roomNumber: null,
  arrivalDate: "2026-09-22",
  departureDate: "2026-09-24",
  nights: 2,
  adults: 2,
  children: 0,
  status: "confirmed",
  createdAt: "2026-09-20T10:24:00Z",
  updatedAt: "2026-09-20T10:24:00Z",
  specialRequests: "High Floor\nQuiet room",
  notes: null,
  cancellationReason: null,
  source: "staff",
  ratePlanId: null,
  ratePlanName: "BAR",
  currency: "ETB",
  roomSubtotal: 9000,
  nightlyRates: [],
  pricedAt: null,
  commercialBookingSource: "direct",
  marketSegment: "leisure",
  externalReference: null,
  guaranteeMethod: "credit_card",
  companyMasterId: null,
  companyName: null,
  travelAgentMasterId: null,
  travelAgentName: null,
  groupAccountMasterId: null,
  groupName: null,
  roomOperationalStatus: null,
  housekeepingStatus: null,
  infants: 0,
  roomsRequested: 1,
  purposeOfStay: "holiday",
  salesChannel: null,
  depositRequirementSnapshot: null,
  cancellationPolicySnapshot: null,
  refundabilitySnapshot: null,
  createdByStaffMembershipId: null,
  createdByName: null,
  bookerGuestId: null,
  lateCheckoutGranted: false,
  expectedArrivalAt: null,
  lateCheckoutUntil: null,
} as ReservationDetail;

const roomType = {
  id: reservation.roomTypeId,
  code: "DK",
  name: "Deluxe King",
  shortName: null,
  displayName: null,
  description: null,
  category: null,
  class: null,
  maxOccupancy: 3,
  standardOccupancy: 2,
  adultCapacity: 2,
  childCapacity: 1,
  infantCapacity: 0,
  extraGuestAllowed: false,
  extraBedAllowed: false,
  connectingEligible: true,
  accessibleEligible: false,
  smokingPolicy: "non_smoking",
  bedType: "King",
  bedCount: 1,
  roomSize: "32 m²",
  roomView: "City View",
  sellable: true,
  active: true,
  defaultBuildingId: null,
  defaultWingId: null,
  preferredFloorId: null,
  beds: [],
  amenityIds: [],
  roomCount: 5,
  coverUrl: null,
} as RoomType;

function hotelRoom(partial: Partial<HotelRoom> & Pick<HotelRoom, "id" | "roomNumber">): HotelRoom {
  return {
    roomCode: null,
    roomTypeId: reservation.roomTypeId,
    roomTypeName: "Deluxe King",
    roomTypeCode: "DK",
    floor: "5",
    building: null,
    wing: null,
    buildingId: null,
    floorId: null,
    wingId: null,
    smoking: false,
    accessible: false,
    status: "available",
    housekeepingStatus: "inspected",
    maintenanceStatus: "normal",
    restrictionReason: null,
    restrictionExpectedReturn: null,
    sellable: true,
    roomFeatures: ["wifi"],
    active: true,
    notes: null,
    links: [],
    ...partial,
  };
}

describe("Reservation Detail Rooms tab", () => {
  it("wires the Rooms workspace into the existing overlay", () => {
    expect(workspace).toContain("<ReservationDetailRoomsTab");
    expect(workspace).toContain('detailTab === "rooms"');
    expect(workspace).toContain('onBackToGuest={() => setDetailTab("guest")}');
    expect(workspace).toContain("displayValue(reservation.marketSegment)");
    expect(workspace).toContain("assignReservationRoom");
    expect(workspace).toContain("listAssignableRooms");
    expect(roomsUi).toContain("Room(s) for this Reservation");
    expect(roomsUi).toContain("Available Rooms");
    expect(roomsUi).toContain("Room Preferences");
    expect(roomsUi).toContain("Assignment Notes");
    expect(roomsUi).toContain("Back to Guest");
    expect(roomsUi).toContain("assignReservationRoom");
    expect(roomsUi).toContain("assignableRooms");
  });

  it("marks Select only for rooms returned by listAssignableRooms", () => {
    expect(assignmentLabel(reservation)).toBe("Not Assigned");
    const assignable: AssignableRoom[] = [
      {
        id: "room-501",
        roomNumber: "501",
        floor: "5",
        building: null,
        housekeepingStatus: "inspected",
      },
    ];
    const rows = buildRoomAssignmentRows({
      rooms: [
        hotelRoom({ id: "room-501", roomNumber: "501" }),
        hotelRoom({
          id: "room-702",
          roomNumber: "702",
          status: "out_of_order",
          housekeepingStatus: "dirty",
        }),
      ],
      assignable,
      roomType,
    });
    expect(rows.find((row) => row.id === "room-501")?.eligible).toBe(true);
    expect(rows.find((row) => row.id === "room-702")?.eligible).toBe(false);
    expect(rows.find((row) => row.id === "room-702")?.statusLabel).toBe("Out of Order");
    const filtered = filterRoomAssignmentRows(rows, { ...emptyRoomFilters(), search: "501" });
    expect(filtered).toHaveLength(1);
    expect(uniqueFilterOptions(rows).floors).toContain("5");
  });

  it("saves stay preferences through special requests and keeps assignment notes local", () => {
    const draft = buildRoomPrefDraft(reservation.specialRequests);
    expect(draft.high_floor).toBe(true);
    expect(draft.quiet_room).toBe(true);
    expect(draft.king_bed).toBe(false);
    const next = specialRequestsFromPrefs("Welcome drink", { ...draft, king_bed: true });
    expect(next).toContain("High Floor");
    expect(next).toContain("King bed");
    expect(next).toContain("Welcome drink");
    expect(roomsUi).toContain("ASSIGNMENT_NOTES_GAP_COPY");
    expect(roomsUi).toContain("specialRequestsFromPrefs");
    expect(roomsUi).not.toContain("saveGuestPreferences");
  });
});
