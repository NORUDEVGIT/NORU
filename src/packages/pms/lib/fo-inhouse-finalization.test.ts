import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { inHouseExceptionOwner } from "@/packages/pms/lib/fo-inhouse";
import { stayDateWriteInput, type RackDatesDraft } from "@/packages/pms/lib/fo-rack-power";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("FO-09 in-house unit actions", () => {
  it("sends each exception to the owner that can change it", () => {
    expect(inHouseExceptionOwner("unassigned")).toBe("room_move");
    expect(inHouseExceptionOwner("room_unavailable")).toBe("room_move");
    expect(inHouseExceptionOwner("maintenance")).toBe("open_maintenance");
    expect(inHouseExceptionOwner("overstay")).toBe("amend_stay");
    expect(inHouseExceptionOwner("missing_stay_data")).toBe("amend_stay");
    expect(inHouseExceptionOwner("folio_warning")).toBe("open_folio");
    expect(inHouseExceptionOwner("late_checkout_conflict")).toBe("late_checkout");
    expect(inHouseExceptionOwner("special_request")).toBe("special");
  });

  it("includes the selected room on a date change", () => {
    const draft = {
      kind: "change_dates",
      reservationId: "res-1",
      guestName: "Ada",
      confirmationNumber: "N-1",
      status: "checked_in",
      currentRoomId: "room-1",
      currentRoomNumber: "101",
      currentRoomTypeId: "type-1",
      arrivalDate: "2026-10-23",
      departureDate: "2026-10-25",
      nextArrivalDate: "2026-10-23",
      nextDepartureDate: "2026-10-26",
      roomSubtotal: null,
      nightlyRates: null,
      reservationRoomId: "unit-1",
    } satisfies RackDatesDraft;
    expect(stayDateWriteInput(draft).reservationRoomId).toBe("unit-1");
  });

  it("opens move, dates, folio, notes, and maintenance for the focused stay", () => {
    const desk = read("src/packages/pms/components/workspaces/in-house-workspace.tsx");
    const qv = read("src/packages/pms/components/frontoffice/in-house-quick-view.tsx");
    const dialogs = read("src/packages/pms/components/frontoffice/front-office-dialogs.tsx");
    expect(desk).toContain("initialReservationRoomId={moveStay.reservationRoomId ?? undefined}");
    expect(desk).toContain(
      "initialReservationRoomId={checkOutStay.reservationRoomId ?? undefined}",
    );
    expect(desk).toContain('to: "/restaurant/pms/cashiering/folios/$folioId"');
    expect(desk).toContain("MAINTENANCE_HREF");
    expect(qv).toContain("fo-inhouse-extend");
    expect(qv).toContain("fo-inhouse-early-departure");
    expect(qv).toContain('id="fo-inhouse-notes"');
    expect(qv).toContain("inHouseMenuItems");
    expect(dialogs).toContain("reservationRoomId: stay.reservationRoomId");
    const guests = read("src/packages/pms/components/frontoffice/fo-amend-sheet.tsx");
    expect(guests).toContain("stayDateTargetsOneRoom");
  });
});
