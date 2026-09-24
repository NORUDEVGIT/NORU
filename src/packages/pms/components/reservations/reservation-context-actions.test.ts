import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getReservationContextActions,
  type ReservationContextActionInput,
} from "./reservation-context-actions";

const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
  "utf8",
);
const quickView = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/reservations/reservation-quick-view.tsx"),
  "utf8",
);

function context(
  overrides: Partial<ReservationContextActionInput> = {},
): ReservationContextActionInput {
  return {
    status: "pending",
    roomId: null,
    arrivalDate: "2026-09-24",
    businessDate: "2026-09-24",
    canManage: true,
    hints: {
      canOpen: true,
      canAssignRoom: true,
      canConfirm: true,
      canCancel: true,
      canCheckIn: false,
      canCheckOut: false,
    },
    ...overrides,
  };
}

function ids(input: ReservationContextActionInput) {
  return getReservationContextActions(input).map((action) => action.id);
}

describe("Reservation contextual action model", () => {
  it("shows only valid pending actions", () => {
    expect(ids(context())).toEqual(["open", "edit", "copy", "assign_room", "confirm", "cancel"]);
    expect(ids(context())).not.toContain("check_out");
    expect(ids(context())).not.toContain("no_show");
  });

  it("uses confirmed hints and current arrival scope for FO actions", () => {
    const actions = ids(
      context({
        status: "confirmed",
        roomId: null,
        hints: {
          canOpen: true,
          canAssignRoom: true,
          canConfirm: false,
          canCancel: true,
          canCheckIn: true,
          canCheckOut: false,
        },
      }),
    );
    expect(actions).toContain("assign_room");
    expect(actions).toContain("cancel");
    expect(actions).toContain("check_in");
    expect(actions).toContain("no_show");
    expect(actions).not.toContain("confirm");
    expect(
      ids(
        context({
          status: "confirmed",
          arrivalDate: "2026-09-25",
          hints: {
            canOpen: true,
            canAssignRoom: false,
            canConfirm: false,
            canCancel: true,
            canCheckIn: true,
            canCheckOut: false,
          },
        }),
      ),
    ).not.toContain("no_show");
  });

  it("limits checked-in actions to FO-owned operations and folio access", () => {
    const actions = ids(
      context({
        status: "checked_in",
        roomId: "room-1",
        hints: {
          canOpen: true,
          canAssignRoom: false,
          canConfirm: false,
          canCancel: false,
          canCheckIn: false,
          canCheckOut: true,
        },
        financial: { state: "available", folioId: "folio-1" },
        allowOpenFolio: true,
      }),
    );
    expect(actions).toEqual(["open", "copy", "change_room", "check_out", "open_folio"]);
    expect(actions).not.toContain("confirm");
    expect(actions).not.toContain("cancel");
  });

  it("keeps checked-out reservations read-only except accessible folio context", () => {
    const checkedOut = context({
      status: "checked_out",
      roomId: "room-1",
      hints: {
        canOpen: true,
        canAssignRoom: false,
        canConfirm: false,
        canCancel: false,
        canCheckIn: false,
        canCheckOut: false,
      },
    });
    expect(ids(checkedOut)).toEqual(["open", "copy"]);
    expect(
      ids({
        ...checkedOut,
        financial: { state: "available", folioId: "folio-1" },
        allowOpenFolio: true,
      }),
    ).toEqual(["open", "copy", "open_folio"]);
  });

  it("offers only the supported restore path for cancelled reservations", () => {
    expect(
      ids(
        context({
          status: "cancelled",
          hints: {
            canOpen: true,
            canAssignRoom: false,
            canConfirm: false,
            canCancel: false,
            canCheckIn: false,
            canCheckOut: false,
          },
        }),
      ),
    ).toEqual(["open", "copy", "reactivate"]);
  });

  it("honors permissions, hints, and financial capability", () => {
    expect(
      ids(
        context({
          status: "checked_in",
          roomId: "room-1",
          financial: { state: "available", folioId: "folio-1" },
        }),
      ),
    ).not.toContain("open_folio");
    expect(ids(context({ canManage: false }))).toEqual(["open"]);
    expect(
      ids(
        context({
          hints: {
            canOpen: true,
            canAssignRoom: false,
            canConfirm: false,
            canCancel: false,
            canCheckIn: false,
            canCheckOut: false,
          },
          financial: { state: "permission_denied", folioId: "folio-1" },
        }),
      ),
    ).toEqual(["open", "edit", "copy"]);
  });
});

describe("Reservation contextual action integration", () => {
  it("uses the same shared menu in Desk rows and Quick View", () => {
    expect(workspace).toContain("<ReservationContextMenu");
    expect(quickView).toContain("<ReservationContextMenu");
    expect(quickView).toContain("getReservationContextActions(actionContext)");
  });

  it("stops row propagation and remains usable without Quick View", () => {
    expect(workspace).toContain("onClick={(event) => event.stopPropagation()}");
    expect(workspace).toContain("hints: row.hints");
    expect(workspace).toContain("businessDate");
  });

  it("routes every supported write through an existing owner-module command", () => {
    expect(workspace).toContain("<AssignRoomDialog");
    expect(workspace).toContain("<RoomMoveDialog");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("<CheckOutDialog");
    expect(workspace).toContain("<NoShowDialog");
    expect(workspace).toContain("<FoCancelStepper");
    expect(workspace).toContain("setReservationStatus");
    expect(workspace).not.toContain("checkInReservation(");
    expect(workspace).not.toContain("checkOutReservation(");
    expect(workspace).not.toContain("markNoShow(");
  });

  it("does not expose unsupported future or communication actions", () => {
    for (const unsupported of [
      "Split Reservation",
      "Link Reservation",
      "Share Reservation",
      "Send Confirmation",
      "Print Confirmation",
    ]) {
      expect(workspace).not.toContain(unsupported);
      expect(quickView).not.toContain(unsupported);
    }
  });
});
