import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { emptyCheckInUnitProgress, type CheckInUnitTarget } from "./fo-check-in-unit";
import {
  checkInRoomReadiness,
  checkInStep1Presentation,
  classifyCheckInUnitFailure,
} from "./fo-checkin-v2-model";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

function unit(overrides: Partial<CheckInUnitTarget> = {}): CheckInUnitTarget & {
  progress: ReturnType<typeof emptyCheckInUnitProgress>;
} {
  return {
    reservationRoomId: "unit-205",
    sequence: 1,
    status: "confirmed",
    arrivalDate: "2026-10-06",
    departureDate: "2026-10-08",
    adults: 1,
    children: 0,
    infants: null,
    roomTypeId: "type-std",
    roomTypeName: "Standard",
    roomId: "room-205",
    roomNumber: "205",
    ratePlanId: "plan-1",
    ratePlanName: "Best Available Rate",
    subtotal: 3000,
    currency: "ETB",
    guestSource: "unit_primary",
    primaryGuestId: "guest-hana",
    primaryGuestName: "Hana Ali Kebede",
    occupants: [
      { guestId: "guest-hana", name: "Hana Ali Kebede", isPrimary: true },
      { guestId: "guest-kidus", name: "Kidus Bekele", isPrimary: false },
    ],
    packages: [],
    siblings: [
      { id: "unit-206", sequence: 2, status: "pending", roomId: "room-206", roomNumber: "206" },
    ],
    progress: emptyCheckInUnitProgress("unit-205"),
    ...overrides,
  };
}

const ENTRY_POINTS = [
  "../components/workspaces/front-office-workspace.tsx",
  "../components/workspaces/reservation-detail-workspace.tsx",
  "../components/workspaces/reservations-workspace.tsx",
  "../components/workspaces/walk-ins-workspace.tsx",
  "../components/workspaces/arrivals-workspace.tsx",
  "../components/workspaces/arrivals-departures-workspace.tsx",
  "../components/frontoffice/walk-ins-history-frame.tsx",
];

const RETIRED_WALK_IN_HOST = "../components/frontoffice/front-office-frames.tsx";

describe("Check-In Step 1 workspace", () => {
  const workspace = readRel("../components/frontoffice/fo-checkin-v2-workspace.tsx");
  const dialogs = readRel("../components/frontoffice/front-office-dialogs.tsx");
  const checkInDialog = dialogs.slice(
    dialogs.indexOf("export function CheckInDialog"),
    dialogs.indexOf("export function LegacyCheckInStepperHost"),
  );

  it("opens the Step 1 workspace from the shared Check-In action", () => {
    assert.match(checkInDialog, /FoCheckInV2Workspace/);
    assert.match(workspace, /data-testid="fo-ci-v2-workspace"/);
    assert.match(workspace, /useState<CheckInV2StepId>\("guest_reservation"\)/);
    assert.match(workspace, /Guest & Reservation/);
    for (const entry of ENTRY_POINTS) {
      assert.match(readRel(entry), /<CheckInDialog/);
    }
    const frames = readRel(RETIRED_WALK_IN_HOST);
    assert.doesNotMatch(frames, /function WalkInsFrame/);
    assert.doesNotMatch(frames, /WalkInDialog/);
    assert.doesNotMatch(frames, /<CheckInDialog/);
    assert.doesNotMatch(frames, /FoCheckInStepper/);
  });

  it("uses getCheckInUnit and not the legacy context read", () => {
    assert.match(workspace, /getCheckInUnit/);
    assert.doesNotMatch(workspace, /getCheckInContext/);
    assert.match(workspace, /checkInStep1Presentation/);
  });

  it("renders the selected unit guest, not another room's guest", () => {
    const view = checkInStep1Presentation(
      unit({
        primaryGuestName: "Hana Ali Kebede",
        primaryGuestId: "guest-hana",
        siblings: [
          {
            id: "unit-206",
            sequence: 2,
            status: "checked_in",
            roomId: "room-206",
            roomNumber: "206",
          },
        ],
      }),
    );
    assert.equal(view.guestName, "Hana Ali Kebede");
    assert.equal(view.guestId, "guest-hana");
    assert.equal(view.siblings[0]?.status, "checked_in");
    assert.notEqual(view.guestName, "Room 206 guest");
  });

  it("prefers the unit primary over the reservation booker", () => {
    const view = checkInStep1Presentation(
      unit({
        guestSource: "unit_primary",
        primaryGuestName: "Unit Primary",
        primaryGuestId: "guest-primary",
      }),
    );
    assert.equal(view.bookerFallback, false);
    assert.equal(view.guestName, "Unit Primary");
  });

  it("labels the booker fallback", () => {
    const view = checkInStep1Presentation(
      unit({
        guestSource: "booker",
        primaryGuestName: "Abel Bekele",
        primaryGuestId: "guest-booker",
        occupants: [],
      }),
    );
    assert.equal(view.bookerFallback, true);
    assert.equal(view.guestName, "Abel Bekele");
    assert.match(workspace, /fo-ci-v2-booker-label/);
    assert.match(workspace, /Booker/);
  });

  it("shows the selected unit room", () => {
    const view = checkInStep1Presentation(unit({ roomNumber: "205", roomTypeName: "Standard" }));
    assert.equal(view.roomNumber, "205");
    assert.equal(view.roomTypeName, "Standard");
    assert.match(workspace, /data-testid="fo-ci-v2-room-number"/);
  });

  it("does not let a sibling room replace the target room", () => {
    const view = checkInStep1Presentation(
      unit({
        roomNumber: "205",
        status: "confirmed",
        siblings: [
          {
            id: "unit-206",
            sequence: 2,
            status: "checked_in",
            roomId: "room-206",
            roomNumber: "206",
          },
        ],
      }),
    );
    assert.equal(view.roomNumber, "205");
    assert.equal(view.siblings[0]?.roomNumber, "206");
    assert.equal(view.siblings[0]?.status, "checked_in");
    assert.match(workspace, /setSwitchUnitId/);
    assert.match(workspace, /reservationRoomId: activeRoomId/);
  });

  it("lists occupants from the selected unit", () => {
    const view = checkInStep1Presentation(unit());
    assert.deepEqual(
      view.occupants.map((occupant) => occupant.name),
      ["Hana Ali Kebede", "Kidus Bekele"],
    );
    assert.equal(view.occupants[0]?.isPrimary, true);
    assert.match(workspace, /fo-ci-v2-guest-list/);
  });

  it("keeps progress on the selected unit", () => {
    const progress = emptyCheckInUnitProgress("unit-205");
    progress.registrationWaived = true;
    const view = checkInStep1Presentation(
      unit({
        status: "checked_in",
        progress,
        siblings: [
          {
            id: "unit-206",
            sequence: 2,
            status: "confirmed",
            roomId: "room-206",
            roomNumber: "206",
          },
        ],
      }),
    );
    assert.equal(view.progressReservationRoomId, "unit-205");
    assert.equal(view.registrationComplete, false);
    assert.equal(view.reviewComplete, false);
    assert.match(workspace, /data-testid="fo-ci-v2-progress"/);
    assert.match(workspace, /registrationProgressLabel/);
    assert.doesNotMatch(workspace, /view\.registrationComplete/);
    assert.doesNotMatch(workspace, /unit\.status === "checked_in"/);
    assert.match(workspace, /unitAlreadyCheckedIn\(unit\.status\)/);
  });

  it("changes the room through the existing assignment command", () => {
    assert.match(workspace, /assignReservationRoom/);
    assert.match(workspace, /data-testid="fo-ci-v2-change-room"/);
    assert.match(workspace, /listCheckInRoomCandidates/);
    assert.match(workspace, /projectCheckInStep1Readiness/);
    assert.match(workspace, /getReservationCashieringSummary/);
    assert.match(workspace, /occupant.isPrimary && view.occupants.length === 1/);
    assert.doesNotMatch(workspace, /View Guest Profile/);
    assert.doesNotMatch(workspace, /Reservation Found/);
    assert.match(workspace, /Reservation loaded/);
    assert.doesNotMatch(workspace, /listAssignableRooms/);
    assert.doesNotMatch(workspace, /forCheckIn/);
    assert.doesNotMatch(workspace, /pms_evaluate_room_assignment/);
  });

  it("handles choose-which-room without guessing a unit", () => {
    assert.equal(
      classifyCheckInUnitFailure(new Error("Choose which room this action applies to.")),
      "room_unit_required",
    );
    assert.equal(classifyCheckInUnitFailure(new Error("ROOM_UNIT_REQUIRED")), "room_unit_required");
    assert.match(workspace, /failure === "room_unit_required"/);
    assert.match(workspace, /data-testid="fo-ci-v2-room-unit-required"/);
    assert.match(workspace, /data-testid="fo-ci-v2-choose-room"/);
  });

  it("renders a legacy stay that has no room unit", () => {
    const view = checkInStep1Presentation(
      unit({
        reservationRoomId: null,
        sequence: null,
        roomNumber: "101",
        guestSource: "booker",
        primaryGuestName: "Legacy Guest",
        occupants: [],
        siblings: [],
        progress: emptyCheckInUnitProgress(null),
      }),
    );
    assert.equal(view.legacyNoUnit, true);
    assert.equal(view.bookerFallback, true);
    assert.equal(view.roomNumber, "101");
    assert.equal(view.occupants.length, 0);
    assert.equal(view.progressReservationRoomId, null);
    assert.match(workspace, /This stay has no separate room guest list/);
  });

  it("closes back to the desk that opened it", () => {
    assert.match(workspace, /onOpenChange\(next\)/);
    assert.match(workspace, /data-testid="fo-ci-v2-cancel-btn"/);
    assert.match(workspace, /aria-label="Close check-in workspace"/);
    const desk = readRel("../components/workspaces/front-office-workspace.tsx");
    assert.match(desk, /setDialog\(null\)/);
    const detail = readRel("../components/workspaces/reservation-detail-workspace.tsx");
    assert.match(detail, /setFoAction\(null\)/);
  });

  it("advances to a Registration placeholder without building Registration", () => {
    assert.match(workspace, /setStep\("registration"\)/);
    assert.match(workspace, /data-testid="fo-ci-v2-next-registration"/);
    assert.match(workspace, /FoCheckInV2Registration/);
    assert.doesNotMatch(workspace, /saveCheckInRegistration/);
    assert.doesNotMatch(workspace, /idDocumentNumber/);
    assert.doesNotMatch(workspace, /price_hotel_stay/);
  });

  it("does not send migrated Check-In entry points to a legacy page", () => {
    assert.match(checkInDialog, /FoCheckInV2Workspace/);
    assert.doesNotMatch(checkInDialog, /FoCheckInStepper/);
    assert.doesNotMatch(workspace, /useNavigate/);
    assert.doesNotMatch(workspace, /\/check-in/);
    for (const entry of ENTRY_POINTS) {
      const source = readRel(entry);
      assert.match(source, /CheckInDialog/);
      assert.doesNotMatch(source, /FoCheckInStepper/);
      assert.doesNotMatch(source, /to:\s*["'][^"']*check-in/);
    }
    const frames = readRel(RETIRED_WALK_IN_HOST);
    assert.doesNotMatch(frames, /FoCheckInStepper/);
    assert.doesNotMatch(frames, /to:\s*["'][^"']*check-in/);
  });

  it("maps the other read failures to friendly states", () => {
    assert.equal(
      classifyCheckInUnitFailure(new Error("Reservation not found for this property.")),
      "reservation_not_found",
    );
    assert.equal(
      classifyCheckInUnitFailure(new Error("That room is not on this reservation.")),
      "unit_not_found",
    );
    assert.equal(
      classifyCheckInUnitFailure(new Error("You don't have access to Front Office.")),
      "permission_denied",
    );
    assert.equal(classifyCheckInUnitFailure(new Error("network down")), "retryable");
    assert.match(workspace, /fo-ci-v2-reservation-not-found/);
    assert.match(workspace, /fo-ci-v2-unit-not-found/);
    assert.match(workspace, /fo-ci-v2-guest-unavailable/);
    assert.match(workspace, /data-testid="fo-ci-v2-room-unassigned"/);
    assert.match(workspace, /Room status unavailable/);
  });

  it("shows room chips from eligibility, housekeeping, and the server ready flag", () => {
    const ready = checkInRoomReadiness({
      roomId: "room-205",
      display: [{ id: "room-205", eligible: true }],
      assignedRoom: { floor: "2", building: "A", housekeepingStatus: "inspected" },
      readyForCheckIn: true,
    });
    assert.deepEqual(ready.chips, ["Available", "Inspected", "Ready"]);
    assert.equal(ready.floor, "2");
    const cleanButNotPolicyReady = checkInRoomReadiness({
      roomId: "room-205",
      display: [{ id: "room-205", eligible: true }],
      assignedRoom: { floor: "2", building: "A", housekeepingStatus: "clean" },
      readyForCheckIn: false,
    });
    assert.deepEqual(cleanButNotPolicyReady.chips, ["Available", "Clean"]);
    const unknown = checkInRoomReadiness({
      roomId: "room-205",
      display: [],
      assignedRoom: null,
    });
    assert.deepEqual(unknown.chips, []);
    assert.equal(unknown.statusUnavailable, true);
  });
});
