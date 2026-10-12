import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getReservationActions } from "./reservation-actions";
import {
  reservationDetailActionLabel,
  reservationDetailActionInput,
  reservationDetailSecondaryActions,
} from "./reservation-detail-actions";

const workspace = readFileSync(
  new URL("../components/workspaces/reservation-detail-workspace.tsx", import.meta.url),
  "utf8",
);
const overview = readFileSync(
  new URL("../components/workspaces/reservation-detail-overview.tsx", import.meta.url),
  "utf8",
);
const deskMenu = readFileSync(
  new URL("../components/reservations/reservation-context-actions.ts", import.meta.url),
  "utf8",
);

const BUSINESS_DATE = "2026-10-11";

function result(input: {
  status: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  arrivalDate: string;
  departureDate: string;
  roomId?: string | null;
  role?: string;
}) {
  return getReservationActions(
    reservationDetailActionInput({
      status: input.status,
      businessDate: BUSINESS_DATE,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      roomId: input.roomId ?? null,
      role: input.role ?? "receptionist",
    }),
  );
}

function secondaryIds(value: ReturnType<typeof result>) {
  return reservationDetailSecondaryActions(value).map((action) => action.id);
}

describe("Reservation Detail header actions", () => {
  it("shows Confirm as the only primary action for a future pending stay", () => {
    const pending = result({
      status: "pending",
      arrivalDate: "2026-10-14",
      departureDate: "2026-10-16",
    });
    expect(pending.primaryAction?.id).toBe("confirm");
    expect(reservationDetailActionLabel(pending.primaryAction!)).toBe("Confirm Reservation");
    expect(secondaryIds(pending)).not.toContain("confirm");
    expect(secondaryIds(pending)).not.toContain("print");
    expect(secondaryIds(pending)).not.toContain("open");
    expect(secondaryIds(pending)).toEqual(["edit", "assign_room", "cancel", "copy", "open_folio"]);
  });

  it("hides future booking actions when a pending stay already departed", () => {
    const stale = result({
      status: "pending",
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-04",
    });
    expect(stale.primaryAction).toBeNull();
    expect(stale.editable).toBe(false);
    const ids = stale.actions.map((action) => action.id);
    expect(ids).not.toContain("edit");
    expect(ids).not.toContain("confirm");
    expect(ids).not.toContain("assign_room");
    expect(ids).toContain("print");
  });

  it("uses Check In as primary and shows no-show only when the model allows it", () => {
    const eligible = result({
      status: "confirmed",
      arrivalDate: "2026-10-11",
      departureDate: "2026-10-14",
    });
    expect(eligible.primaryAction?.id).toBe("check_in");
    expect(secondaryIds(eligible)).not.toContain("check_in");
    expect(eligible.actions.map((action) => action.id)).toContain("no_show");

    const future = result({
      status: "confirmed",
      arrivalDate: "2026-10-20",
      departureDate: "2026-10-22",
    });
    expect(future.actions.map((action) => action.id)).not.toContain("no_show");
  });

  it("shows Check Out as primary and Change Room as a secondary in-house action", () => {
    const inHouse = result({
      status: "checked_in",
      arrivalDate: "2026-10-08",
      departureDate: "2026-10-12",
      roomId: "room-1",
    });
    expect(inHouse.primaryAction?.id).toBe("check_out");
    expect(inHouse.actions.map((action) => action.id)).not.toContain("edit");
    expect(secondaryIds(inHouse)).toContain("change_room");
    expect(secondaryIds(inHouse)).not.toContain("check_out");
  });

  it("keeps checked-out and no-show read-only and gates folio and reactivate through the model", () => {
    const checkedOut = result({
      status: "checked_out",
      arrivalDate: "2026-10-08",
      departureDate: "2026-10-10",
      roomId: "room-1",
    });
    expect(checkedOut.editable).toBe(false);
    expect(checkedOut.actions.map((action) => action.id)).not.toContain("edit");
    expect(checkedOut.actions.map((action) => action.id)).toContain("print");
    expect(checkedOut.actions.map((action) => action.id)).toContain("open_folio");
    expect(secondaryIds(checkedOut)).toContain("open_folio");

    const cancelled = result({
      status: "cancelled",
      arrivalDate: "2026-10-14",
      departureDate: "2026-10-16",
    });
    expect(cancelled.actions.map((action) => action.id)).toContain("reactivate");
    expect(cancelled.actions.map((action) => action.id)).not.toContain("edit");
    expect(
      reservationDetailSecondaryActions({
        ...cancelled,
        actions: cancelled.actions.filter((action) => action.id !== "reactivate"),
      }).map((action) => action.id),
    ).not.toContain("reactivate");

    const noShow = result({
      status: "no_show",
      arrivalDate: "2026-10-10",
      departureDate: "2026-10-12",
    });
    expect(noShow.actions.map((action) => action.id)).not.toContain("edit");
    expect(noShow.actions.map((action) => action.id)).toContain("print");
    expect(noShow.actions.map((action) => action.id)).toContain("open_folio");
  });

  it("blocks managing actions for a role outside the reservation roles", () => {
    const blocked = result({
      status: "pending",
      arrivalDate: "2026-10-14",
      departureDate: "2026-10-16",
      role: "housekeeping",
    });
    expect(blocked.editable).toBe(false);
    expect(blocked.primaryAction).toBeNull();
    expect(blocked.actions.map((action) => action.id)).not.toContain("confirm");
    expect(blocked.actions.map((action) => action.id)).not.toContain("edit");
    expect(blocked.actions.map((action) => action.id)).not.toContain("cancel");
    expect(secondaryIds(blocked)).toEqual(["open_folio"]);
  });

  it("hides More Actions when print, open, and the primary action are the only entries", () => {
    expect(
      reservationDetailSecondaryActions({
        primaryAction: { id: "confirm", label: "Confirm" },
        actions: [
          { id: "open", label: "Open Reservation" },
          { id: "confirm", label: "Confirm" },
          { id: "print", label: "Print" },
        ],
        editable: true,
        historical: false,
        warnings: [],
      }),
    ).toEqual([]);
  });

  it("wires the detail header to the shared model and existing handlers", () => {
    expect(workspace).toContain("getReservationActions(");
    expect(workspace).toContain("reservationDetailActionInput(");
    expect(workspace).toContain("reservationDetailSecondaryActions(");
    expect(workspace).toContain('data-testid="reservation-detail-primary"');
    expect(workspace).toContain('data-testid="reservation-detail-more-actions"');
    expect(workspace).toContain("secondary.length > 0");
    expect(workspace).toContain("<ReservationPrintDocument");
    expect(workspace).toContain('data-testid="reservation-detail-print"');
    expect(workspace).toContain("window.print()");
    expect(workspace).toContain("<AssignRoomDialog");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("<CheckOutDialog");
    expect(workspace).toContain("<NoShowDialog");
    expect(workspace).toContain("<RoomMoveDialog");
    expect(workspace).toContain("<FoCancelStepper");
    expect(workspace).toContain('statusMutation.mutate({ status: "confirmed" })');
    expect(workspace).toContain('statusMutation.mutate({ status: "pending" })');
    expect(workspace).toContain("copyMutation.mutate()");
    expect(workspace).toContain('setDetailTab("folio")');
    expect(workspace).toContain("onEditReservation");
    expect(workspace).toContain("setAmendOpen(true)");
    expect(workspace).not.toContain("showCheckIn");
    expect(workspace).not.toContain("showCheckOut");
    expect(workspace).not.toContain("showNoShow");
    expect(workspace).not.toContain('title="Send is not available');
    expect(workspace).toContain("onEditTab={setDetailTab}");
    expect(overview).toContain("onEdit=");
    expect(deskMenu).not.toContain("getReservationActions");
  });
});
