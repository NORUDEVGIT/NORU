import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { uniqueReservationRoomUnits } from "./reservation-workspace/calendar.server";
import { expandStayRooms } from "./reservation-room-units";
import {
  projectReservationQuickView,
  signedFolioBalance,
} from "./reservation-workspace/quick-view.server";
import type { ReservationOperationalSummary } from "./reservation-workspace/shared-read-models";
import {
  calendarBarIsSelected,
  calendarBarKey,
  calendarBarLabel,
  calendarBarToDeskRow,
  findCalendarBar,
  DEFAULT_CALENDAR_DISPLAY,
} from "./reservation-workspace/booking-calendar";
import type { CalendarBar } from "./reservation-workspace/shared-read-models";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
const calendar = source("src/packages/pms/components/reservations/booking-calendar.tsx");
const quickView = source("src/packages/pms/lib/reservation-workspace/quick-view.server.ts");

function bar(overrides: Partial<CalendarBar> = {}): CalendarBar {
  return {
    reservationId: "res-1",
    confirmationNumber: "NR-000020",
    reservationRoomId: "unit-1",
    unitSequence: 1,
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestVip: false,
    status: "confirmed",
    roomTypeId: "type-1",
    roomId: null,
    arrivalDate: "2026-10-18",
    departureDate: "2026-10-27",
    adults: 1,
    children: 0,
    updatedAt: "2026-10-02T00:00:00Z",
    source: "staff",
    ratePlanName: null,
    exceptionKeys: ["unassigned"],
    ...overrides,
  };
}

describe("RF-QV01 selection and calendar identity", () => {
  it("selects a Desk row into Quick View without opening Detail", () => {
    expect(workspace).toContain("onClick={() => onSelect(row)}");
    expect(workspace).toContain("setSelectedId(row.reservationId)");
    expect(workspace).toContain("setSelectedRoomId(row.reservationRoomId ?? null)");
    expect(workspace).toContain("getReservationQuickView");
    expect(workspace).toContain(
      'queryKey: ["reservation-quick-view", restaurantId, selectedId, selectedRoomId]',
    );
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
    const rowClick = workspace.slice(
      workspace.indexOf("onClick={() => onSelect(row)}"),
      workspace.indexOf("onClick={() => onSelect(row)}") + 80,
    );
    expect(rowClick).not.toContain("onOpen");
  });

  it("selects a calendar bar into the same Quick View read", () => {
    expect(calendar).toContain("onClick={() => onSelectBar(bar)}");
    expect(workspace).toContain("selectedReservationRoomId={selectedRoomId}");
    expect(workspace).toContain("setSelectedRoomId(row.reservationRoomId ?? null)");
    expect(quickView).toContain("reservationRoomId: idSchema.optional()");
    expect(workspace).toContain("...(selectedRoomId ? { reservationRoomId: selectedRoomId } : {})");
    const selected = calendarBarIsSelected({
      bar: bar(),
      selectedReservationId: "res-1",
      selectedReservationRoomId: "unit-1",
    });
    const other = calendarBarIsSelected({
      bar: bar({ reservationRoomId: "unit-2", unitSequence: 2 }),
      selectedReservationId: "res-1",
      selectedReservationRoomId: "unit-1",
    });
    expect(selected).toBe(true);
    expect(other).toBe(false);
    expect(calendarBarToDeskRow(bar(), [], []).reservationRoomId).toBe("unit-1");
  });

  it("renders two legitimate room units with distinct keys and selection", () => {
    const units = uniqueReservationRoomUnits([
      {
        id: "unit-1",
        reservationId: "res-1",
        roomId: null,
        status: "confirmed",
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-27",
        unitSequence: 1,
      },
      {
        id: "unit-2",
        reservationId: "res-1",
        roomId: null,
        status: "confirmed",
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-27",
        unitSequence: 2,
      },
    ]);
    const slices = expandStayRooms(
      [
        {
          id: "res-1",
          roomId: null,
          status: "confirmed",
          arrivalDate: "2026-10-18",
          departureDate: "2026-10-27",
        },
      ],
      units,
    );
    expect(slices).toHaveLength(2);
    const bars = [
      bar({ reservationRoomId: "unit-1", unitSequence: 1 }),
      bar({ reservationRoomId: "unit-2", unitSequence: 2, roomTypeId: "type-2" }),
    ];
    expect(new Set(bars.map(calendarBarKey)).size).toBe(2);
    expect(calendarBarKey(bars[0]!)).toBe("res-1:unit-1");
    expect(calendarBarKey(bars[1]!)).toBe("res-1:unit-2");
    expect(calendarBarLabel(bars[0]!, DEFAULT_CALENDAR_DISPLAY)).toContain("Unit 1");
    expect(calendarBarLabel(bars[1]!, DEFAULT_CALENDAR_DISPLAY)).toContain("Unit 2");
    expect(calendarBarLabel(bars[0]!, DEFAULT_CALENDAR_DISPLAY)).toContain("NR-000020");
    expect(
      calendarBarIsSelected({
        bar: bars[1]!,
        selectedReservationId: "res-1",
        selectedReservationRoomId: "unit-2",
      }),
    ).toBe(true);
  });

  it("does not turn one room unit into two bars", () => {
    const unique = uniqueReservationRoomUnits([
      {
        id: "unit-1",
        reservationId: "res-1",
        roomId: null,
        status: "confirmed",
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-27",
        unitSequence: 1,
      },
      {
        id: "unit-1",
        reservationId: "res-1",
        roomId: null,
        status: "confirmed",
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-27",
        unitSequence: 1,
      },
    ]);
    expect(unique).toHaveLength(1);
    const slices = expandStayRooms(
      [
        {
          id: "res-1",
          roomId: null,
          status: "confirmed",
          arrivalDate: "2026-10-18",
          departureDate: "2026-10-27",
        },
      ],
      unique,
    );
    expect(slices).toHaveLength(1);
    expect(slices[0]?.unitSequence).toBe(1);
  });

  it("keeps the overflow menu from selecting the bar", () => {
    expect(calendar).toContain("onClick={(event) => event.stopPropagation()}");
    expect(calendar).toContain("<ReservationContextMenu");
    expect(calendar).toContain("onClick={() => onSelectBar(bar)}");
    const menu = calendar.indexOf("<ReservationContextMenu");
    const stop = calendar.lastIndexOf("stopPropagation()", menu);
    expect(stop).toBeGreaterThan(-1);
    expect(menu - stop).toBeLessThan(180);
    expect(workspace).toContain("onClick={(event) => event.stopPropagation()}");
  });

  it("opens Reservation Detail in the workspace overlay", () => {
    expect(workspace).toContain('case "open":');
    expect(workspace).toContain("openReservation(row.reservationId)");
    expect(workspace).toContain('setOverlay({ type: "reservation-detail", reservationId: id })');
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
    expect(calendar).toContain("onDoubleClick={() => onOpen(bar.reservationId)}");
  });

  it("resolves a dragged unit without taking the other unit of the same confirmation", () => {
    const bars = [
      bar({ reservationRoomId: "unit-1" }),
      bar({ reservationRoomId: "unit-2", unitSequence: 2 }),
    ];
    expect(
      findCalendarBar(bars, { reservationId: "res-1", reservationRoomId: "unit-2" })?.unitSequence,
    ).toBe(2);
  });
});

function operationalSummary(
  overrides: Partial<ReservationOperationalSummary> = {},
): ReservationOperationalSummary {
  return {
    reservationId: "res-1",
    confirmationNumber: "NR-000010",
    arrivalDate: "2026-10-18",
    departureDate: "2026-10-20",
    nights: 2,
    adults: 2,
    children: 0,
    status: "confirmed",
    source: "staff",
    roomTypeId: "type-1",
    roomTypeName: "King",
    roomId: "room-1",
    roomNumber: "101",
    guestId: "guest-1",
    guestName: "Ada Lovelace",
    guestPhone: null,
    guestEmail: null,
    guestVip: false,
    ratePlanId: "rate-1",
    ratePlanName: "BAR",
    roomSubtotal: 200,
    currency: "GBP",
    companyMasterId: null,
    companyName: null,
    travelAgentMasterId: null,
    travelAgentName: null,
    groupAccountMasterId: null,
    groupName: null,
    commercialBookingSource: null,
    marketSegment: null,
    externalReference: null,
    guaranteeMethod: null,
    specialRequests: null,
    notes: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

describe("RF-QV01 Quick View projection", () => {
  function project(
    overrides: Partial<ReservationOperationalSummary> = {},
    financial: {
      state: "available" | "permission_denied" | "not_available";
      folioId: string | null;
      folioNumber: string | null;
      balance: number | null;
    } = { state: "available", folioId: null, folioNumber: null, balance: null },
  ) {
    const summary = operationalSummary(overrides);
    return projectReservationQuickView({
      summary,
      restaurantId: "00000000-0000-4000-8000-000000000001",
      businessDate: "2026-10-22",
      generatedAt: "2026-10-22T09:00:00Z",
      financial,
      roomState: {
        operationalStatus: summary.roomId ? "available" : null,
        housekeepingStatus: summary.roomId ? "clean" : null,
        maintenanceStatus: null,
      },
      lastHistoryEvent: null,
    });
  }

  it("loads assigned, unassigned, folio-less, paid, and checked-out stays", () => {
    expect(project().room.assigned).toBe(true);
    expect(project({ roomId: null, roomNumber: null }).operational.exceptionKeys).toContain(
      "unassigned",
    );
    const emptyFolio = project();
    expect(emptyFolio.financial.folioId).toBeNull();
    expect(emptyFolio.actionHints.canOpenFolio).toBe(false);
    const paid = project(undefined, {
      state: "available",
      folioId: "folio-1",
      folioNumber: "F-1",
      balance: signedFolioBalance([250, -100, -40]),
    });
    expect(paid.financial.balance).toBe(110);
    expect(paid.actionHints.canOpenFolio).toBe(true);
    const departed = project({ status: "checked_out" });
    expect(departed.stay.status).toBe("checked_out");
    expect(departed.actionHints.canOpen).toBe(true);
  });

  it("keeps Cashiering permission denial on the financial state", () => {
    const view = project(undefined, {
      state: "permission_denied",
      folioId: null,
      folioNumber: null,
      balance: null,
    });
    expect(view.financial.state).toBe("permission_denied");
    expect(view.identity.guestName).toBe("Ada Lovelace");
    expect(view.actionHints.canOpenFolio).toBe(false);
    expect(quickView).toContain("permission_denied");
    expect(quickView).toContain("requireReservationManager");
  });

  it("shows the selected room unit without replacing the reservation read", () => {
    const summary = operationalSummary({ roomId: null, roomNumber: null, roomTypeName: "King" });
    const view = projectReservationQuickView({
      summary,
      restaurantId: "00000000-0000-4000-8000-000000000001",
      businessDate: "2026-10-22",
      generatedAt: "2026-10-22T09:00:00Z",
      financial: { state: "available", folioId: null, folioNumber: null, balance: null },
      roomState: { operationalStatus: null, housekeepingStatus: null, maintenanceStatus: null },
      lastHistoryEvent: null,
      unit: {
        reservationRoomId: "unit-2",
        unitSequence: 2,
        roomTypeId: "type-2",
        roomTypeName: "Twin",
        roomId: null,
        roomNumber: null,
        operationalStatus: null,
        housekeepingStatus: null,
        maintenanceStatus: null,
        arrivalDate: "2026-10-18",
        departureDate: "2026-10-20",
        adults: 1,
        children: 0,
        status: "confirmed",
      },
    });
    expect(view.reservationId).toBe("res-1");
    expect(view.selectedUnit).toEqual({ reservationRoomId: "unit-2", unitSequence: 2 });
    expect(view.room.roomTypeName).toBe("Twin");
    expect(view.stay.adults).toBe(1);
  });
});
