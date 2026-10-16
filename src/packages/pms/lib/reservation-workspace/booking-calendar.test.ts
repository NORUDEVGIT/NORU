import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { CalendarBar } from "./shared-read-models";
import {
  BOOKING_CALENDAR_DRAG_MIME,
  calendarBarToDeskRow,
  calendarExceptionLabel,
  calendarMoveKind,
  canDragCalendarBar,
  proposedStayFromDrop,
  resolveCalendarSearchFocus,
  workspaceSectionFromTab,
  tabFromWorkspaceSection,
  isCalendarSectionEnabled,
} from "./booking-calendar";

function bar(overrides: Partial<CalendarBar> = {}): CalendarBar {
  return {
    reservationId: "res-1",
    confirmationNumber: "NR-000001",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestVip: false,
    status: "confirmed",
    roomTypeId: "type-1",
    roomId: "room-1",
    arrivalDate: "2026-09-24",
    departureDate: "2026-09-26",
    adults: 2,
    children: 0,
    updatedAt: "2026-09-22T10:00:00Z",
    source: "staff",
    ratePlanName: "BAR",
    exceptionKeys: [],
    ...overrides,
  };
}

describe("Booking Calendar helpers", () => {
  it("jumps the window to arrival when the hit is outside the current horizon", () => {
    expect(
      resolveCalendarSearchFocus({
        arrivalDate: "2026-10-10",
        reservationId: "res-1",
        rangeStart: "2026-09-24",
        horizon: 7,
      }),
    ).toEqual({ rangeStart: "2026-10-10", highlightId: "res-1" });
  });

  it("keeps the current window when the arrival is already visible", () => {
    expect(
      resolveCalendarSearchFocus({
        arrivalDate: "2026-09-26",
        reservationId: "res-1",
        rangeStart: "2026-09-24",
        horizon: 7,
      }).rangeStart,
    ).toBe("2026-09-24");
  });

  it("shifts stay dates by nights on drop without mutating immediately", () => {
    expect(
      proposedStayFromDrop({
        arrivalDate: "2026-09-24",
        departureDate: "2026-09-26",
        dropDate: "2026-09-28",
      }),
    ).toEqual({ arrivalDate: "2026-09-28", departureDate: "2026-09-30" });
  });

  it("routes pending/confirmed moves to amend and in-house room-only to FO move", () => {
    expect(
      calendarMoveKind({
        status: "confirmed",
        currentRoomId: "room-1",
        proposedRoomId: "room-2",
        currentArrival: "2026-09-24",
        proposedArrival: "2026-09-24",
        currentDeparture: "2026-09-26",
        proposedDeparture: "2026-09-26",
      }),
    ).toBe("amend");
    expect(
      calendarMoveKind({
        status: "checked_in",
        currentRoomId: "room-1",
        proposedRoomId: "room-2",
        currentArrival: "2026-09-24",
        proposedArrival: "2026-09-24",
        currentDeparture: "2026-09-26",
        proposedDeparture: "2026-09-26",
      }),
    ).toBe("fo_room_move");
    expect(
      calendarMoveKind({
        status: "checked_in",
        currentRoomId: "room-1",
        proposedRoomId: "room-1",
        currentArrival: "2026-09-24",
        proposedArrival: "2026-09-25",
        currentDeparture: "2026-09-26",
        proposedDeparture: "2026-09-27",
      }),
    ).toBe("open_detail");
  });

  it("maps calendar bars onto Desk action rows without inventing contact fields", () => {
    const row = calendarBarToDeskRow(
      bar({ roomId: null, exceptionKeys: ["unassigned"] }),
      [],
      [{ roomTypeId: "type-1", roomTypeName: "Deluxe", physicalCapacity: 2, available: 4, reserved: 1, source: "canonical" }],
    );
    expect(row.hints.canAssignRoom).toBe(true);
    expect(row.guestPhone).toBeNull();
    expect(row.roomTypeName).toBe("Deluxe");
    expect(calendarExceptionLabel("assignment_overlap")).toBe("Assignment overlap");
    expect(canDragCalendarBar("cancelled")).toBe(false);
  });

  it("uses a Reservation drag MIME distinct from Front Office rack", () => {
    expect(BOOKING_CALENDAR_DRAG_MIME).toBe("application/x-noru-booking-calendar");
    expect(BOOKING_CALENDAR_DRAG_MIME).not.toContain("fo-reservation");
    expect(workspaceSectionFromTab("calendar")).toBe("calendar");
    expect(workspaceSectionFromTab("individual")).toBe("desk");
    expect(workspaceSectionFromTab("groups")).toBe("groups");
    expect(workspaceSectionFromTab("waitlist")).toBe("waitlist");
    expect(workspaceSectionFromTab("arrivals-departures")).toBe("arrivals-departures");
    expect(tabFromWorkspaceSection("arrivals-departures")).toBe("arrivals-departures");
    expect(workspaceSectionFromTab("exceptions")).toBe("exceptions");
    expect(tabFromWorkspaceSection("exceptions")).toBe("exceptions");
    expect(isCalendarSectionEnabled("Arrivals & Departures", 5)).toBe(true);
    expect(isCalendarSectionEnabled("Exceptions", 6)).toBe(true);
  });
});

describe("Booking Calendar workspace wiring", () => {
  const workspace = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
    "utf8",
  );
  const calendarUi = readFileSync(
    resolve(process.cwd(), "src/packages/pms/components/reservations/booking-calendar.tsx"),
    "utf8",
  );

  it("loads the calendar through getReservationCalendar and reuses Desk actions", () => {
    expect(workspace).toContain("BookingCalendarPanel");
    expect(workspace).toContain("reservation-calendar");
    expect(calendarUi).toContain("getReservationCalendar");
    expect(calendarUi).toContain("listOperationalReservations");
    expect(calendarUi).toContain("getReservationExceptions");
    expect(calendarUi).toContain("amendReservation");
    expect(calendarUi).toContain("reservationAmendImpact");
    expect(calendarUi).toContain("BOOKING_CALENDAR_DRAG_MIME");
    expect(calendarUi).not.toContain("FO_DRAG_MIME");
    expect(calendarUi).not.toContain("application/x-fo-reservation");
  });
});
