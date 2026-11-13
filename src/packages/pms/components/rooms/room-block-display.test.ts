import { describe, expect, it } from "vitest";

import {
  displayName,
  groupReservationLabel,
  hotelDateTime,
  inventoryImpactSentence,
  inventoryImpactTable,
  lifecycleLine,
  removedRoomCount,
  staffNoteText,
} from "./room-block-display";

describe("block staff display", () => {
  it("hides uuid notes left by the group allotment workflow", () => {
    const groupBlockId = "6f1e8c2a-1b2c-4d3e-8f90-aabbccddeeff";
    expect(staffNoteText(groupBlockId)).toBeNull();
    expect(staffNoteText(`Hold ${groupBlockId} overnight`)).toBe("Hold overnight");
    expect(staffNoteText("VIP arrival, keep adjoining rooms")).toBe(
      "VIP arrival, keep adjoining rooms",
    );
    expect(staffNoteText("   ")).toBeNull();
  });

  it("names a group reservation without showing its id", () => {
    expect(
      groupReservationLabel({
        groupId: "6f1e8c2a-1b2c-4d3e-8f90-aabbccddeeff",
        groupName: "Spring Conference",
        groupCode: "SPR26",
      }),
    ).toBe("Linked to group reservation Spring Conference (SPR26).");
    expect(
      groupReservationLabel({
        groupId: "6f1e8c2a-1b2c-4d3e-8f90-aabbccddeeff",
        groupName: null,
      }),
    ).toBe("Linked to a group reservation.");
    expect(groupReservationLabel({ groupId: null })).toBeNull();
  });

  it("phrases inventory impact for staff", () => {
    expect(inventoryImpactTable(7, "remove_from_inventory")).toBe("-7 rooms");
    expect(inventoryImpactTable(1, "remove_from_inventory")).toBe("-1 room");
    expect(inventoryImpactSentence(7, "remove_from_inventory")).toBe(
      "7 rooms removed from sellable inventory",
    );
    expect(
      removedRoomCount(
        { inventoryImpact: "remove_from_inventory", targetKind: "room", quantity: null },
        12,
      ),
    ).toBe(1);
    expect(displayName("6f1e8c2a-1b2c-4d3e-8f90-aabbccddeeff")).toBe("—");
    expect(displayName("Abel Abraha")).toBe("Abel Abraha");
  });

  it("formats lifecycle rows with a hotel date and an em dash when unnamed", () => {
    expect(lifecycleLine("Released", null, null)).toBe("Released by —");
    expect(lifecycleLine("Created", "Abel Abraha", "11 Nov 2026, 13:42")).toBe(
      "Created by Abel Abraha · 11 Nov 2026, 13:42",
    );
    const formatted = hotelDateTime("2026-11-11T10:42:00.000Z", "Africa/Addis_Ababa");
    expect(formatted).toBe("11 Nov 2026, 13:42");
  });
});
