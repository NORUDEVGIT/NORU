import { describe, expect, it } from "vitest";

import {
  evaluateCheckInReadiness,
  type CheckInReadinessFacts,
} from "@/packages/pms/lib/fo-check-in-readiness";
import {
  assignmentIneligibilityReason,
  projectCheckInStep1Readiness,
} from "@/packages/pms/lib/fo-checkin-v2-model";

function ready(patch: Partial<CheckInReadinessFacts> = {}): CheckInReadinessFacts {
  return {
    unitRequired: false,
    hasSiblings: false,
    target: {
      reservationRoomId: "unit-1",
      guestId: "guest-1",
      guestSource: "unit_primary",
      status: "confirmed",
      roomId: "room-1",
    },
    registrationComplete: true,
    registrationWaived: false,
    registrationWaiverReason: null,
    registrationWaivedBy: null,
    registrationWaivedAt: null,
    guestFieldErrors: [],
    identityDocumentErrors: [],
    verificationWarnings: [],
    verificationBlockers: [],
    roomEligible: true,
    roomReady: true,
    roomReadyReason: null,
    deposit: {
      requiredAmount: 1500,
      receivedAmount: 1500,
      outstanding: 0,
      satisfied: true,
      waived: false,
      waiverReason: null,
      waiverActor: null,
      waiverAt: null,
      guaranteeMethod: null,
    },
    agreementVersionId: "version-1",
    agreementSigned: true,
    keyRecorded: true,
    keyWaived: false,
    keyWaiverReason: null,
    keyWaivedBy: null,
    keyWaivedAt: null,
    earlyArrival: false,
    earlyCheckInAllowed: true,
    earlyCheckInNeedsApproval: false,
    ...patch,
  };
}

describe("projectCheckInStep1Readiness", () => {
  it("treats a room that failed policy-aware readiness as a hard Step 1 blocker", () => {
    const readiness = evaluateCheckInReadiness(
      ready({
        roomReady: false,
        roomReadyReason: "This room requires a completed inspection before check-in.",
      }),
    );
    const step = projectCheckInStep1Readiness(readiness);
    expect(readiness.canCheckIn).toBe(false);
    expect(step.canContinue).toBe(false);
    expect(step.hardBlockers.map((item) => item.code)).toEqual(["ROOM_NOT_READY"]);
    expect(step.continueMessage).toBe("This room requires a completed inspection before check-in.");
  });

  it("defers an unsatisfied deposit and does not reuse canCheckIn as the Step 1 gate", () => {
    const readiness = evaluateCheckInReadiness(
      ready({
        deposit: {
          ...ready().deposit!,
          satisfied: false,
          receivedAmount: 0,
          outstanding: 1500,
        },
      }),
    );
    const step = projectCheckInStep1Readiness(readiness);
    expect(readiness.canCheckIn).toBe(false);
    expect(step.canContinue).toBe(true);
    expect(step.hardBlockers).toEqual([]);
    expect(step.deferredBlockers.map((item) => item.code)).toEqual(["DEPOSIT_REQUIRED"]);
  });

  it("keeps early arrival as a warning", () => {
    const readiness = evaluateCheckInReadiness(
      ready({ earlyArrival: true, earlyCheckInAllowed: false }),
    );
    const step = projectCheckInStep1Readiness(readiness, {
      arrivalDate: "2026-10-22",
      persistedBusinessDate: "2026-10-21",
      timezone: "Africa/Addis_Ababa",
    });
    expect(step.canContinue).toBe(true);
    expect(step.warnings.map((item) => item.code)).toEqual(["EARLY_ARRIVAL"]);
    expect(step.hardBlockers).toEqual([]);
    expect(step.arrivalVersusBusinessDate).toBe("early");
  });

  it("reports a past arrival without adding a blocker", () => {
    const step = projectCheckInStep1Readiness(evaluateCheckInReadiness(ready()), {
      arrivalDate: "2026-10-20",
      persistedBusinessDate: "2026-10-21",
      timezone: "Africa/Addis_Ababa",
    });
    expect(step.arrivalVersusBusinessDate).toBe("past");
    expect(step.canContinue).toBe(true);
    expect(step.hardBlockers).toEqual([]);
  });

  it("names an assignment blocker and stays silent when the room is eligible", () => {
    expect(assignmentIneligibilityReason(true, [{ code: "ROOM_BLOCKED" }])).toBeNull();
    expect(assignmentIneligibilityReason(false, [{ code: "ROOM_ALREADY_BOOKED" }])).toBe(
      "This room overlaps another stay.",
    );
  });
});
