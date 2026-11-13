import { describe, expect, it } from "vitest";

import type { RoomInventoryEvent } from "@/packages/pms/lib/room-inventory.functions";
import {
  appendRoomNote,
  describeRoomEvent,
  splitRoomNotes,
} from "./room-detail-format";
import { formatRoomTypeName, roomMatchesKpiFilter } from "./room-board-utils";

const base: RoomInventoryEvent = {
  id: "event-1",
  eventType: "room_ooo",
  roomId: "room-1",
  roomNumber: "101",
  blockId: null,
  actorMembershipId: "11111111-2222-3333-4444-555555555555",
  actorName: "Amina Bekele",
  previousValues: JSON.stringify({ status: "available" }),
  newValues: JSON.stringify({
    status: "out_of_order",
    reason: "Leaking pipe",
    expectedReturn: "2026-11-20",
    maintenanceRequestId: "99999999-0000-0000-0000-000000000000",
  }),
  notes: "Leaking pipe",
  createdAt: "2026-11-11T09:30:00.000Z",
};

describe("describeRoomEvent", () => {
  it("explains an Out of Order event without JSON or identifiers", () => {
    const entry = describeRoomEvent(base);
    expect(entry.title).toBe("Set Out of Order");
    expect(entry.details).toContain("Reason: Leaking pipe");
    expect(entry.details).toContain("Previous status: Available");
    expect(entry.details).toContain("Linked to a maintenance request");
    expect(entry.expectedReturn).toMatch(/2026/);
    expect(entry.staff).toBe("Amina Bekele");
    const printed = JSON.stringify(entry);
    expect(printed).not.toContain("11111111");
    expect(printed).not.toContain("99999999");
    expect(entry.details.join(" ")).not.toContain("{");
  });

  it("falls back to a neutral staff label", () => {
    expect(describeRoomEvent({ ...base, actorName: null }).staff).toBe("Staff");
  });

  it("describes a return to service", () => {
    const entry = describeRoomEvent({
      ...base,
      eventType: "room_released",
      previousValues: JSON.stringify({ status: "out_of_order", reason: "Leaking pipe" }),
      newValues: JSON.stringify({ status: "available" }),
      notes: null,
    });
    expect(entry.title).toBe("Returned to Service");
    expect(entry.details).toContain("Previous status: Out Of Order");
    expect(entry.details).toContain("Restriction reason: Leaking pipe");
  });

  it("describes room block changes in plain language", () => {
    const entry = describeRoomEvent({
      ...base,
      eventType: "block_activated",
      previousValues: JSON.stringify({ status: "approved" }),
      newValues: JSON.stringify({ status: "active" }),
      notes: null,
    });
    expect(entry.title).toBe("Room block activated");
    expect(entry.details).toContain("Status: Approved → Active");
  });
});

describe("room notes helpers", () => {
  it("splits and appends dated entries without losing earlier notes", () => {
    const next = appendRoomNote("Check the balcony door.", "Guest asked for quiet room.", "2026-11-11");
    expect(splitRoomNotes(next)).toEqual([
      "Check the balcony door.",
      expect.stringContaining("Guest asked for quiet room."),
    ]);
    expect(appendRoomNote(null, "First note", "2026-11-11")).toMatch(/^\[.*\] First note$/);
  });
});

describe("room board presentation helpers", () => {
  it("standardises room type names", () => {
    expect(formatRoomTypeName("deluxe KING")).toBe("Deluxe King");
    expect(formatRoomTypeName("STANDARD  twin")).toBe("Standard Twin");
    expect(formatRoomTypeName("VIP suite")).toBe("VIP Suite");
    expect(formatRoomTypeName("Suite with balcony")).toBe("Suite with Balcony");
    expect(formatRoomTypeName(null)).toBe("");
  });

  it("matches KPI filters with the same state as the KPI counts", () => {
    expect(roomMatchesKpiFilter("occupied", "departing")).toBe(true);
    expect(roomMatchesKpiFilter("ooo", "out_of_service")).toBe(false);
    expect(roomMatchesKpiFilter("all", "blocked")).toBe(true);
  });
});
