import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stayFromExceptionItem } from "@/packages/pms/lib/reservation-workspace/exceptions";
import type { ReservationExceptionItem } from "@/packages/pms/lib/reservation-workspace/shared-read-models";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = source("src/packages/pms/components/workspaces/reservation-control-workspace.tsx");
const parent = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
const server = source("src/packages/pms/lib/reservation-workspace/exceptions.server.ts");

function item(overrides: Partial<ReservationExceptionItem> = {}): ReservationExceptionItem {
  return {
    key: "unassigned",
    severity: "high",
    blocking: true,
    reservationId: "res-1",
    confirmationNumber: "NORU-2401",
    guest: {
      id: "guest-1",
      name: "Ada Lovelace",
      vip: true,
      phone: null,
      email: null,
    },
    stay: { arrivalDate: "2026-09-23", departureDate: "2026-09-25", status: "confirmed" },
    room: null,
    financial: {
      state: "available",
      folioId: "folio-1",
      balance: 12,
      depositPosted: 0,
      depositWaived: false,
    },
    sourceModule: "reservation",
    responsibleModule: "reservation",
    summary: "Arrival has no room assigned.",
    actionTarget: "assign_room",
    detectedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 9B Reservation Exceptions Control workspace", () => {
  it("enables the Exceptions tab and consumes getReservationExceptions only", () => {
    expect(parent).toContain("ReservationControlWorkspace");
    expect(parent).toContain('goWorkspaceSection("exceptions")');
    expect(parent).toContain('section === "Exceptions"');
    expect(workspace).toContain("getReservationExceptions");
    expect(workspace).toContain('data-testid="reservation-control-workspace"');
    expect(workspace).not.toContain("checkInReservation(");
    expect(workspace).not.toContain("checkOutReservation(");
    expect(workspace).not.toContain("Mark resolved");
    expect(workspace).not.toContain("Resolved Today");
  });

  it("renders open totals without inventing resolved-today or connectivity errors", () => {
    expect(workspace).toContain('label: "Total Open"');
    expect(workspace).toContain('label: "Critical"');
    expect(workspace).toContain('label: "Attention"');
    expect(workspace).toContain('label: "Blocking"');
    expect(workspace).not.toContain("channel error");
    expect(workspace).not.toContain("OTA");
    expect(server).toContain("assignment_overlap");
    expect(server).not.toContain("reservation_exceptions");
  });

  it("launches existing writers and does not duplicate owner engines", () => {
    expect(workspace).toContain("AssignRoomDialog");
    expect(workspace).toContain("CheckOutDialog");
    expect(workspace).toContain("Open Reservation");
    expect(workspace).toContain("Open Folio");
    expect(workspace).toContain("Open Housekeeping");
    expect(workspace).toContain("Guest Profile");
    expect(workspace).toContain("History");
    expect(workspace).toContain("onOpenCalendar");
    expect(workspace).not.toContain("bulkAssignUnassignedRooms");
  });

  it("maps an exception item to a Front Office stay for assign/checkout dialogs", () => {
    const stay = stayFromExceptionItem(item());
    expect(stay?.id).toBe("res-1");
    expect(stay?.status).toBe("confirmed");
    expect(stayFromExceptionItem(item({ reservationId: null }))).toBeNull();
  });
});
