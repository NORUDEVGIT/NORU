import { describe, expect, it } from "vitest";

import {
  OOO_MAINTENANCE_TICKET_MESSAGE,
  outOfOrderNeedsMaintenanceTicket,
  staffRestrictionError,
} from "./room-restriction-policy";

describe("Out of Order maintenance ticket rule", () => {
  it("requires a ticket only for Out of Order when the property rule is on", () => {
    expect(outOfOrderNeedsMaintenanceTicket("out_of_order", true)).toBe(true);
    expect(outOfOrderNeedsMaintenanceTicket("out_of_order", false)).toBe(false);
    expect(outOfOrderNeedsMaintenanceTicket("out_of_service", true)).toBe(false);
    expect(outOfOrderNeedsMaintenanceTicket("available", true)).toBe(false);
  });

  it("replaces the database code with a staff-facing message", () => {
    expect(staffRestrictionError("P0001 MAINTENANCE_TICKET_REQUIRED")).toBe(
      OOO_MAINTENANCE_TICKET_MESSAGE,
    );
    expect(staffRestrictionError("A reason is required.")).toBe("A reason is required.");
  });
});
