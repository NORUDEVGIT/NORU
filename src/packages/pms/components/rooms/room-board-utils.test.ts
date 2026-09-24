import { describe, expect, it } from "vitest";

import type {
  RoomBoardBlockRow,
  RoomBoardOccupancyRow,
} from "@/packages/pms/lib/room-board.functions";
import type { HotelRoom } from "@/packages/pms/lib/rooms.functions";
import { metricPercentage, roomBoardPrimaryState } from "./room-board-utils";

const room: HotelRoom = {
  id: "room-1",
  roomNumber: "101",
  roomCode: "101",
  roomTypeId: "type-1",
  roomTypeName: "Deluxe",
  roomTypeCode: "DLX",
  floor: "1",
  building: "Main",
  wing: null,
  buildingId: null,
  floorId: null,
  wingId: null,
  smoking: false,
  accessible: false,
  status: "available",
  housekeepingStatus: "clean",
  maintenanceStatus: "normal",
  restrictionReason: null,
  restrictionExpectedReturn: null,
  sellable: true,
  roomFeatures: [],
  active: true,
  notes: null,
  links: [],
};

const occupancy: RoomBoardOccupancyRow = {
  roomId: room.id,
  state: "occupied",
  reservationId: "reservation-1",
  arrivalDate: "2026-09-22",
  departureDate: "2026-09-24",
};

const block: RoomBoardBlockRow = {
  blockId: "block-1",
  roomId: room.id,
  blockType: "operational",
  reason: "Operational hold",
};

describe("Room Board visual state", () => {
  it("uses operational restriction before blocks and occupancy", () => {
    expect(roomBoardPrimaryState({ ...room, status: "out_of_order" }, occupancy, block)).toBe(
      "out_of_order",
    );
  });

  it("uses a real room block before occupancy", () => {
    expect(roomBoardPrimaryState(room, occupancy, block)).toBe("blocked");
  });

  it("shows occupancy before vacant housekeeping readiness", () => {
    expect(roomBoardPrimaryState({ ...room, housekeepingStatus: "dirty" }, occupancy)).toBe(
      "occupied",
    );
  });

  it("shows dirty only for an otherwise available vacant room", () => {
    expect(roomBoardPrimaryState({ ...room, housekeepingStatus: "dirty" })).toBe("dirty");
  });

  it("derives honest KPI percentages", () => {
    expect(metricPercentage(2, 20)).toBe("10.0%");
    expect(metricPercentage(0, 0)).toBe("0.0%");
  });
});
