import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHECK_IN_BLOCKER_CODES,
  evaluateCheckInReadiness,
  type CheckInBlockerCode,
  type CheckInReadinessFacts,
} from "@/packages/pms/lib/fo-check-in-readiness";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function ready(patch: Partial<CheckInReadinessFacts> = {}): CheckInReadinessFacts {
  return {
    unitRequired: false,
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

function codes(patch: Partial<CheckInReadinessFacts>): CheckInBlockerCode[] {
  return evaluateCheckInReadiness(ready(patch)).blockers.map((item) => item.code);
}

describe("check-in readiness blockers", () => {
  it("produces each blocker on its own and allows check-in only when none remain", () => {
    expect(codes({})).toEqual([]);
    expect(evaluateCheckInReadiness(ready()).canCheckIn).toBe(true);
    expect(codes({ unitRequired: true, target: null })).toEqual(["ROOM_UNIT_REQUIRED"]);
    expect(codes({ target: { ...ready().target!, status: "checked_in" } })).toEqual([
      "INVALID_TRANSITION",
    ]);
    expect(codes({ guestFieldErrors: ["Phone is required."] })).toEqual(["GUEST_FIELDS"]);
    expect(
      codes({
        identityDocumentErrors: ["An unexpired identity document is required for check-in."],
      }),
    ).toEqual(["IDENTITY_DOCUMENT"]);
    expect(
      codes({
        target: { ...ready().target!, roomId: null },
        roomEligible: null,
        roomReady: null,
      }),
    ).toEqual(["ROOM_REQUIRED"]);
    expect(codes({ roomEligible: false })).toEqual(["ROOM_NOT_ELIGIBLE"]);
    expect(codes({ roomReady: false, roomReadyReason: "The assigned room is not ready." })).toEqual(
      ["ROOM_NOT_READY"],
    );
    expect(
      codes({
        deposit: { ...ready().deposit!, satisfied: false, receivedAmount: 0, outstanding: 1500 },
      }),
    ).toEqual(["DEPOSIT_REQUIRED"]);
    expect(codes({ agreementVersionId: null, agreementSigned: false })).toEqual([
      "AGREEMENT_REQUIRED",
    ]);
    expect(codes({ agreementSigned: false })).toEqual(["SIGNATURE_REQUIRED"]);
    expect(codes({ keyRecorded: false })).toEqual(["KEY_REQUIRED"]);
    expect(codes({ keyRecorded: true, keyWaived: false }).includes("KEY_REQUIRED")).toBe(false);
    expect(codes({ registrationComplete: false })).toEqual(["REGISTRATION_INCOMPLETE"]);
    for (const code of CHECK_IN_BLOCKER_CODES) {
      expect(codes({})).not.toContain(code);
    }
    const blocked = evaluateCheckInReadiness(
      ready({ keyRecorded: false, verificationWarnings: ["Identity document is not verified."] }),
    );
    expect(blocked.canCheckIn).toBe(false);
    expect(blocked.warnings.map((item) => item.code)).toEqual(["UNVERIFIED_DOCUMENT"]);
  });

  it("keeps a warning from granting check-in and does not block on a warning alone", () => {
    const warningOnly = evaluateCheckInReadiness(
      ready({
        verificationWarnings: ["Identity document is not verified."],
        deposit: { ...ready().deposit!, guaranteeMethod: "card" },
        earlyArrival: true,
        earlyCheckInAllowed: false,
      }),
    );
    expect(warningOnly.canCheckIn).toBe(true);
    expect(warningOnly.blockers).toEqual([]);
    expect(warningOnly.financial?.guaranteeSatisfied).toBeNull();
    expect(warningOnly.warnings.map((item) => item.code)).toEqual([
      "UNVERIFIED_DOCUMENT",
      "GUARANTEE_UNEVALUATED",
      "EARLY_ARRIVAL",
    ]);
    expect(warningOnly.key).toEqual({ recorded: true, waived: false });
    expect(warningOnly).not.toHaveProperty("steps");
  });

  it("lets a key waiver clear only the key blocker", () => {
    const result = evaluateCheckInReadiness(
      ready({
        keyRecorded: false,
        keyWaived: true,
        keyWaiverReason: "later",
        keyWaivedBy: "manager-1",
        keyWaivedAt: "2026-10-18T12:00:00.000Z",
        deposit: { ...ready().deposit!, satisfied: false, outstanding: 1500 },
        agreementVersionId: null,
        agreementSigned: false,
        guestFieldErrors: ["Phone is required."],
      }),
    );
    expect(result.blockers.map((item) => item.code)).toEqual([
      "GUEST_FIELDS",
      "DEPOSIT_REQUIRED",
      "AGREEMENT_REQUIRED",
    ]);
    expect(result.overrides).toEqual([
      {
        requirement: "KEY_REQUIRED",
        reason: "later",
        actor: "manager-1",
        at: "2026-10-18T12:00:00.000Z",
      },
    ]);
    expect(result.canCheckIn).toBe(false);
    expect(result.financial?.scope).toBe("reservation");
  });

  it("does not let a registration waiver skip guest field rules", () => {
    const result = evaluateCheckInReadiness(
      ready({
        registrationComplete: false,
        registrationWaived: true,
        guestFieldErrors: ["Phone is required."],
      }),
    );
    expect(result.blockers.map((item) => item.code)).toEqual(["GUEST_FIELDS"]);
    expect(result.overrides.map((item) => item.requirement)).toEqual(["REGISTRATION_INCOMPLETE"]);
  });

  it("does not let registration, deposit, or key waivers clear the hard blockers", () => {
    const result = evaluateCheckInReadiness(
      ready({
        registrationComplete: false,
        registrationWaived: true,
        keyRecorded: false,
        keyWaived: true,
        deposit: { ...ready().deposit!, satisfied: false, waived: true, outstanding: 1500 },
        identityDocumentErrors: ["An unexpired identity document is required for check-in."],
        roomEligible: false,
        agreementVersionId: null,
        agreementSigned: false,
        target: { ...ready().target!, status: "checked_in" },
      }),
    );
    expect(result.blockers.map((item) => item.code)).toEqual([
      "INVALID_TRANSITION",
      "IDENTITY_DOCUMENT",
      "ROOM_NOT_ELIGIBLE",
      "AGREEMENT_REQUIRED",
    ]);
    expect(result.canCheckIn).toBe(false);
  });

  it("does not treat another unit's checked-in status as this unit being confirmed", () => {
    const result = evaluateCheckInReadiness(
      ready({ target: { ...ready().target!, status: "confirmed" } }),
    );
    expect(result.blockers.map((item) => item.code)).not.toContain("INVALID_TRANSITION");
    expect(
      evaluateCheckInReadiness(
        ready({ target: { ...ready().target!, status: "checked_in" } }),
      ).blockers.map((item) => item.code),
    ).toEqual(["INVALID_TRANSITION"]);
  });
});

describe("check-in readiness command", () => {
  it("reads the owning modules and does not complete the stay", () => {
    const source = read("src/packages/pms/lib/fo-check-in-readiness.functions.ts");
    expect(source).toContain("requireReservationManager");
    expect(source).toContain("validateGuestCheckInRequirements");
    expect(source).toContain("checkInIdentityVerification");
    expect(source).toContain("getAssignmentEligibilityCompat");
    expect(source).toContain("isRoomReady");
    expect(source).toContain("getCheckInDepositReadiness");
    expect(source).toContain("getCheckInAgreement");
    expect(source).toContain("loadUnitProgress");
    expect(source).toContain("status: target.status");
    expect(source).toContain("guestId: target.primaryGuestId");
    expect(source).not.toContain("netPaymentTowardRequirement");
    expect(source).not.toContain("canCompleteCheckIn");
    expect(source).not.toContain("forCheckIn: true");
    expect(source).not.toContain('status: "valid"');
    expect(source).not.toContain("recordReservationEvent");
    expect(source).not.toContain("check_in_hotel_reservation");
    expect(source).toContain('target.status === "checked_in" && !progress.completedAt');
    expect(source).toContain("writeCheckInUnitProgress");
    expect(source).toContain("reservationRoomId: target.reservationRoomId");
  });
});
