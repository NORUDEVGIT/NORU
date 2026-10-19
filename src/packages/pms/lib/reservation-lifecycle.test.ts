import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getReservationActions } from "@/packages/pms/lib/reservation-actions";
import { reservationDetailActionInput } from "@/packages/pms/lib/reservation-detail-actions";
import {
  assignmentAvailabilityMessage,
  buildRoomAssignmentRows,
  buildRoomPrefDraft,
  roomCanBeSelected,
  roomSelectionNotice,
  roomsDraftDirty,
  roomStatusLabel,
  ROOM_NO_LONGER_AVAILABLE,
} from "@/packages/pms/lib/reservation-detail-rooms";
import {
  isUnarrivedPastStay,
  reservationDetailEditable,
  reservationMutationBlock,
  roomMenuActions,
} from "@/packages/pms/lib/reservation-lifecycle";
import type { AssignableRoom } from "@/packages/pms/lib/reservations.functions";
import type { HotelRoom } from "@/packages/pms/lib/rooms.functions";

const roomsUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-rooms.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const summary = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-summary.tsx"),
  "utf8",
);
const assignFn = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);
const controls = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservation-detail-controls.functions.ts"),
  "utf8",
);
const rates = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/rates.functions.ts"),
  "utf8",
);
const folio = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/cashiering.functions.ts"),
  "utf8",
);

const FUTURE = { arrivalDate: "2026-10-20", businessDate: "2026-10-17", canManage: true };
const SAME_DAY = { arrivalDate: "2026-10-17", businessDate: "2026-10-17", canManage: true };

describe("room action visibility", () => {
  it("shows Assign Room for a future confirmed stay with no room", () => {
    expect(roomMenuActions({ ...FUTURE, status: "confirmed", roomId: null })).toEqual([
      "assign",
      "change_room_type",
    ]);
  });

  it("shows Assign Room for a same-day confirmed stay that has not checked in", () => {
    expect(roomMenuActions({ ...SAME_DAY, status: "confirmed", roomId: null })).toContain("assign");
  });

  it("shows Change and Unassign for an assigned future confirmed stay", () => {
    expect(roomMenuActions({ ...FUTURE, status: "confirmed", roomId: "room-1" })).toEqual([
      "change_room",
      "unassign",
      "change_room_type",
    ]);
  });

  it("hides direct Unassign after check-in and keeps the Front Office room move", () => {
    expect(roomMenuActions({ ...SAME_DAY, status: "checked_in", roomId: "room-1" })).toEqual([
      "change_room",
    ]);
  });

  it("hides room mutations for checked-out, cancelled, and no-show stays", () => {
    for (const status of ["checked_out", "cancelled", "no_show"] as const) {
      expect(roomMenuActions({ ...FUTURE, status, roomId: "room-1" })).toEqual([]);
      expect(reservationDetailEditable({ ...FUTURE, status })).toBe(false);
    }
  });

  it("hides room mutations without reservation permission", () => {
    expect(
      roomMenuActions({ ...FUTURE, status: "confirmed", roomId: null, canManage: false }),
    ).toEqual([]);
  });
});

describe("available room table", () => {
  const room = (patch: Partial<HotelRoom>): HotelRoom =>
    ({
      id: "room-1",
      roomNumber: "901",
      roomCode: null,
      roomTypeId: "type-1",
      roomTypeName: "Twin",
      roomTypeCode: "TWN",
      floor: "9",
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
      ...patch,
    }) as HotelRoom;

  it("marks a Ready room selectable only when Room & Inventory returned it", () => {
    const ready = room({ id: "ready", housekeepingStatus: "clean" });
    const rows = buildRoomAssignmentRows({
      rooms: [ready],
      assignable: [
        {
          id: "ready",
          roomNumber: "901",
          floor: "9",
          housekeepingStatus: "clean",
        } as AssignableRoom,
      ],
      roomType: null,
    });
    expect(rows[0]?.eligible).toBe(true);
    expect(rows[0]?.statusLabel).toBe("Ready");
    expect(roomStatusLabel(ready).tone).toBe("ready");
  });

  it("keeps a Dirty room selectable when Room & Inventory returned it", () => {
    const dirty = room({ id: "dirty", housekeepingStatus: "dirty", roomNumber: "402" });
    const rows = buildRoomAssignmentRows({
      rooms: [dirty],
      assignable: [
        {
          id: "dirty",
          roomNumber: "402",
          floor: "4",
          housekeepingStatus: "dirty",
        } as AssignableRoom,
      ],
      roomType: null,
    });
    expect(rows[0]?.eligible).toBe(true);
    expect(rows[0]?.statusLabel).toBe("Dirty");
    expect(roomCanBeSelected({ selecting: true, eligible: true, current: false })).toBe(true);
    expect(roomCanBeSelected({ selecting: false, eligible: true, current: false })).toBe(false);
  });

  it("does not offer OOO, OOS, blocked, or the current room as a new candidate", () => {
    const ooo = room({
      id: "ooo",
      status: "out_of_order",
      maintenanceStatus: "out_of_order",
      roomNumber: "403",
    });
    const oos = room({
      id: "oos",
      status: "out_of_service",
      maintenanceStatus: "out_of_service",
      roomNumber: "404",
    });
    const blocked = room({ id: "blocked", housekeepingStatus: "clean", roomNumber: "405" });
    const rows = buildRoomAssignmentRows({
      rooms: [ooo, oos, blocked],
      assignable: [],
      roomType: null,
    });
    expect(rows.every((row) => row.eligible === false)).toBe(true);
    expect(roomStatusLabel(ooo).label).toBe("Out of Order");
    expect(roomStatusLabel(oos).label).toBe("Out of Service");
    expect(rows.find((row) => row.id === "blocked")?.eligible).toBe(false);
    expect(roomCanBeSelected({ selecting: true, eligible: true, current: true })).toBe(false);
  });

  it("does not render a fake Unavailable action and only mounts the menu for a real action", () => {
    expect(roomsUi).not.toContain("Unavailable");
    expect(roomsUi).toContain('data-testid="room-actions-menu"');
    expect(roomsUi).toContain("actions.length > 0");
    expect(roomsUi).toContain("roomHoldReason");
    expect(roomsUi).not.toContain("Unavailable");
  });
});

describe("multi-room targeting and room type", () => {
  it("sends the selected room unit on assign and unassign", () => {
    expect(roomsUi).toContain("reservationRoomId: unitId");
    expect(roomsUi).toContain("Choose which room this action applies to.");
  });

  it("sends an in-house room change to the Front Office move for the selected unit", () => {
    expect(roomsUi).toContain('onOperate?.("change_room", targetId)');
    expect(workspace).toContain("RoomMoveDialog");
  });

  it("opens a unit-specific room type change instead of the generic amend form", () => {
    expect(roomsUi).toContain("setRoomTypeOpen(true)");
    expect(roomsUi).toContain("<RoomTypeChangeDialog");
    expect(roomsUi).not.toContain("onChangeRoomType()");
    expect(workspace).not.toContain("onChangeRoomType={() => setAmendOpen(true)}");
    expect(roomsUi).not.toContain("room_type_id:");
  });
});

describe("historical reservations and no-show", () => {
  it("identifies a past unarrived confirmed stay from the property business date", () => {
    expect(
      isUnarrivedPastStay({
        status: "confirmed",
        arrivalDate: "2026-10-08",
        businessDate: "2026-10-17",
      }),
    ).toBe(true);
    expect(
      isUnarrivedPastStay({
        status: "confirmed",
        arrivalDate: "2026-10-17",
        businessDate: "2026-10-17",
      }),
    ).toBe(false);
    expect(
      reservationMutationBlock({
        status: "confirmed",
        arrivalDate: "2026-10-08",
        businessDate: "2026-10-17",
      }),
    ).toMatch(/no-show/i);
    const actions = getReservationActions(
      reservationDetailActionInput({
        status: "confirmed",
        businessDate: "2026-10-17",
        arrivalDate: "2026-10-08",
        departureDate: "2026-10-20",
        roomId: null,
        role: "receptionist",
      }),
    );
    expect(actions.editable).toBe(false);
    expect(actions.actions.map((action) => action.id)).not.toContain("edit");
    expect(actions.actions.map((action) => action.id)).not.toContain("check_in");
    expect(actions.actions.map((action) => action.id)).toContain("no_show");
  });

  it("keeps ordinary reservation commands behind the shared edit guard", () => {
    expect(assignFn).toContain("assertReservationDetailEditable");
    expect(assignFn).toContain("Direct assign and unassign are not available after check-in.");
    expect(controls).toContain("assertReservationDetailEditable");
    expect(rates).toContain("assertReservationDetailEditable");
    expect(folio).not.toContain("assertReservationDetailEditable");
  });
});

describe("assignment selection mode", () => {
  it("opens selection without assigning and activates rooms only in that mode", () => {
    expect(roomsUi).toContain("beginSelection(action, unit)");
    expect(roomsUi).not.toContain("Select an eligible room first.");
    expect(roomsUi).toContain("Assign Selected Room");
    expect(roomsUi).toContain("Cancel Assignment");
    expect(roomsUi).toContain("data-assignment-mode=");
    expect(
      roomSelectionNotice({
        intent: "assign",
        reservationRoomId: "unit-2",
        unitSequence: 2,
        currentRoomId: null,
      }),
    ).toBe("Select an eligible room to assign to Room 2.");
    expect(roomCanBeSelected({ selecting: false, eligible: true, current: false })).toBe(false);
  });

  it("keeps the candidate off the page draft and shows a controlled stale-room message", () => {
    const saved = buildRoomPrefDraft(null);
    expect(roomsDraftDirty({ prefs: saved, savedPrefs: saved, notes: "", savedNotes: "" })).toBe(
      false,
    );
    expect(
      roomsDraftDirty({
        prefs: { ...saved, quiet_room: true },
        savedPrefs: saved,
        notes: "",
        savedNotes: "",
      }),
    ).toBe(true);
    expect(
      roomsDraftDirty({ prefs: saved, savedPrefs: saved, notes: "Late arrival", savedNotes: "" }),
    ).toBe(true);
    expect(roomsUi).toContain("roomsDraftDirty({ prefs, savedPrefs, notes, savedNotes })");
    expect(roomsUi).not.toContain(
      "roomsDraftDirty({ prefs, savedPrefs, notes, savedNotes, candidate",
    );
    expect(assignmentAvailabilityMessage("That room is not eligible for this stay.")).toBe(
      ROOM_NO_LONGER_AVAILABLE,
    );
    expect(
      assignmentAvailabilityMessage("This reservation is closed and cannot be changed."),
    ).toBeNull();
    expect(roomsUi).toContain("reservationRoomId: assignmentMode.reservationRoomId");
    expect(roomsUi).toContain('onOperate?.("change_room", targetId)');
  });

  it("uses the shared Stay footer and saves assignment notes with Save Changes", () => {
    expect(roomsUi).toContain("sticky bottom-0 z-10 -mx-4 -mb-4 mt-6");
    expect(roomsUi).toContain("Unsaved changes");
    expect(roomsUi).toContain("bg-[#251605]");
    expect(roomsUi).toContain("Back to Guest");
    expect(roomsUi).toContain("saveAssignmentNotes");
    expect(roomsUi).not.toContain("Save notes");
  });
});

describe("guest deposit KPI", () => {
  it("uses deposit credits and never the payment requirement snapshot", () => {
    expect(workspace).toContain("guestDepositReceived");
    expect(workspace).toContain("No deposit received");
    expect(workspace).toContain("No payment received");
    expect(workspace).not.toContain("deposit?.amount ?? null");
    expect(summary).toContain("No deposit received");
    expect(summary).toContain("Payment requirement");
    expect(summary).not.toContain("deposit?.amount ?? null");
  });
});
