import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isRegistrationComplete } from "@/packages/pms/lib/fo-check-in";
import {
  evaluateCheckInReadiness,
  registrationSnapshotIsComplete,
  rethrowReadinessReadError,
  withAssignedRoom,
  type CheckInReadinessFacts,
} from "@/packages/pms/lib/fo-check-in-readiness";
import { validateGuestCheckInRequirements } from "@/packages/pms/lib/guest-field-rules";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const IDENTITY_REQUIRED = "An identity document is required for check-in.";

/** Saved by Check-In v2. It is not a RegistrationDraft and has no fullName. */
const v2Snapshot = {
  guestId: "guest-1",
  guestSource: "unit_primary",
  fields: {
    first_name: "Ada",
    last_name: "Lovelace",
    phone: "555",
    email: "ada@example.com",
  },
};

const idConfig = {
  identityDocumentActive: true,
  identityDocumentTypes: [
    {
      id: "passport-type",
      name: "Passport",
      code: "passport",
      description: null,
      documentNumberActive: true,
      documentNumberRequired: true,
      issuingCountryActive: true,
      issuingCountryRequired: false,
      issueDateActive: false,
      issueDateRequired: false,
      expiryDateActive: true,
      expiryDateRequired: true,
      issuingAuthorityActive: false,
      issuingAuthorityRequired: false,
      scanImageAllowed: false,
      scanImageRequired: false,
      requiredAtCheckIn: true,
      active: true,
      validForProfileTypeIds: [],
      displayOrder: 1,
    },
  ],
  requiredFields: [],
  types: [],
} as never;

function deposit(satisfied: boolean) {
  return {
    requiredAmount: satisfied ? 0 : 1500,
    receivedAmount: 0,
    outstanding: satisfied ? 0 : 1500,
    satisfied,
    waived: false,
    waiverReason: null,
    waiverActor: null,
    waiverAt: null,
    guaranteeMethod: null,
  };
}

function facts(patch: Partial<CheckInReadinessFacts> = {}): CheckInReadinessFacts {
  return {
    unitRequired: false,
    hasSiblings: false,
    target: {
      reservationRoomId: "unit-1",
      guestId: "guest-1",
      guestSource: "unit_primary",
      status: "confirmed",
      roomId: null,
    },
    registrationComplete: registrationSnapshotIsComplete(v2Snapshot),
    registrationWaived: false,
    registrationWaiverReason: null,
    registrationWaivedBy: null,
    registrationWaivedAt: null,
    guestFieldErrors: [],
    identityDocumentErrors: [],
    verificationWarnings: [],
    verificationBlockers: [],
    roomEligible: null,
    roomReady: null,
    roomReadyReason: null,
    deposit: deposit(true),
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

function codes(patch: Partial<CheckInReadinessFacts> = {}) {
  return evaluateCheckInReadiness(facts(patch)).blockers.map((item) => item.code);
}

function identityErrors(documents: Array<Record<string, unknown>>) {
  const result = validateGuestCheckInRequirements({
    guest: { firstName: "Ada", lastName: "Lovelace", phone: "555" },
    documents,
    config: idConfig,
    today: "2026-10-19",
  });
  return result.missingFieldCodes.includes("IDENTITY_DOCUMENT")
    ? result.errors.filter((item) => /identity document/i.test(item))
    : [];
}

describe("check-in readiness runtime states", () => {
  it("returns readiness for a confirmed unit with no room", () => {
    const result = evaluateCheckInReadiness(facts());
    expect(result.canCheckIn).toBe(false);
    expect(result.blockers.map((item) => item.code)).toContain("ROOM_REQUIRED");
    expect(result.room.assigned).toBe(false);
  });

  it("adds the room-assignment blocker when no room is assigned", () => {
    expect(codes()).toContain("ROOM_REQUIRED");
  });

  it("returns readiness when the required identity document is missing", () => {
    const errors = identityErrors([]);
    expect(errors).toEqual([IDENTITY_REQUIRED]);
    const result = evaluateCheckInReadiness(
      facts({
        target: { ...facts().target!, roomId: "room-1" },
        roomEligible: true,
        roomReady: true,
        identityDocumentErrors: errors,
      }),
    );
    expect(result.blockers.map((item) => item.code)).toContain("IDENTITY_DOCUMENT");
    expect(result.canCheckIn).toBe(false);
  });

  it("adds the identity blocker for a missing required document", () => {
    expect(codes({ identityDocumentErrors: identityErrors([]) })).toContain("IDENTITY_DOCUMENT");
  });

  it("returns both blockers for no room and a missing required id", () => {
    expect(() => registrationSnapshotIsComplete(v2Snapshot)).not.toThrow();
    const result = evaluateCheckInReadiness(facts({ identityDocumentErrors: identityErrors([]) }));
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining(["ROOM_REQUIRED", "IDENTITY_DOCUMENT"]),
    );
    expect(result.canCheckIn).toBe(false);
  });

  it("keeps canCheckIn false when either blocker is present", () => {
    expect(evaluateCheckInReadiness(facts()).canCheckIn).toBe(false);
    expect(
      evaluateCheckInReadiness(
        facts({
          target: { ...facts().target!, roomId: "room-1" },
          roomEligible: true,
          roomReady: true,
          identityDocumentErrors: [IDENTITY_REQUIRED],
        }),
      ).canCheckIn,
    ).toBe(false);
  });

  it("keeps a deposit that is not required satisfied", () => {
    const result = evaluateCheckInReadiness(facts({ identityDocumentErrors: [IDENTITY_REQUIRED] }));
    expect(result.financial?.satisfied).toBe(true);
    expect(result.blockers.map((item) => item.code)).not.toContain("DEPOSIT_REQUIRED");
  });

  it("keeps a signed agreement satisfied", () => {
    const result = evaluateCheckInReadiness(facts());
    expect(result.agreement).toEqual({ versionId: "version-1", signed: true });
    expect(result.blockers.map((item) => item.code)).not.toContain("AGREEMENT_REQUIRED");
    expect(result.blockers.map((item) => item.code)).not.toContain("SIGNATURE_REQUIRED");
  });

  it("does not call the room evaluator with a null room id", async () => {
    const calls: string[] = [];
    const evaluated = await withAssignedRoom(null, async (roomId) => {
      calls.push(roomId);
      return roomId;
    });
    expect(evaluated).toBeNull();
    expect(calls).toEqual([]);
    const source = read("src/packages/pms/lib/fo-check-in-readiness.functions.ts");
    const eligibility = source.slice(
      source.indexOf("await getAssignmentEligibilityCompat"),
      source.indexOf("if (!eligibility.eligible)"),
    );
    expect(source).toContain("withAssignedRoom(target.roomId");
    expect(eligibility).toContain("roomId,");
    expect(eligibility).not.toContain("target.roomId");
  });

  it("returns a blocker when the assigned room is not ready", () => {
    const result = evaluateCheckInReadiness(
      facts({
        target: { ...facts().target!, roomId: "room-1" },
        roomEligible: true,
        roomReady: false,
        roomReadyReason: "The assigned room is not ready.",
      }),
    );
    expect(result.blockers.map((item) => item.code)).toContain("ROOM_NOT_READY");
    expect(result.canCheckIn).toBe(false);
  });

  it("returns a blocker when the assigned room is not eligible", () => {
    const result = evaluateCheckInReadiness(
      facts({
        target: { ...facts().target!, roomId: "room-1" },
        roomEligible: false,
      }),
    );
    expect(result.blockers.map((item) => item.code)).toContain("ROOM_NOT_ELIGIBLE");
    expect(result.canCheckIn).toBe(false);
  });

  it("returns a blocker when the agreement is unsigned", () => {
    const result = evaluateCheckInReadiness(facts({ agreementSigned: false }));
    expect(result.blockers.map((item) => item.code)).toContain("SIGNATURE_REQUIRED");
    expect(result.canCheckIn).toBe(false);
  });

  it("returns a blocker when the key is missing", () => {
    const result = evaluateCheckInReadiness(facts({ keyRecorded: false }));
    expect(result.blockers.map((item) => item.code)).toContain("KEY_REQUIRED");
    expect(result.key).toEqual({ recorded: false, waived: false });
    expect(result.canCheckIn).toBe(false);
  });

  it("returns a blocker when the unit is not confirmed", () => {
    const result = evaluateCheckInReadiness(
      facts({ target: { ...facts().target!, status: "pending" } }),
    );
    expect(result.blockers.map((item) => item.code)).toContain("INVALID_TRANSITION");
    expect(result.canCheckIn).toBe(false);
  });

  it("does not let a sibling room change the selected unit", async () => {
    const calls: string[] = [];
    await withAssignedRoom("room-2", async (roomId) => {
      calls.push(roomId);
      return roomId;
    });
    const selected = evaluateCheckInReadiness(facts());
    expect(calls).toEqual(["room-2"]);
    expect(selected.target?.reservationRoomId).toBe("unit-1");
    expect(selected.room.assigned).toBe(false);
    expect(selected.blockers.map((item) => item.code)).toContain("ROOM_REQUIRED");
  });

  it("returns readiness for a legacy stay with no unit", () => {
    const legacy = {
      fullName: "Ada Lovelace",
      phone: "555",
      email: "ada@example.com",
      idDocumentType: "passport",
      idDocumentNumber: "P1",
    };
    const result = evaluateCheckInReadiness(
      facts({
        target: {
          reservationRoomId: null,
          guestId: "guest-1",
          guestSource: "reservation",
          status: "confirmed",
          roomId: "room-1",
        },
        registrationComplete: registrationSnapshotIsComplete(legacy),
        roomEligible: true,
        roomReady: true,
      }),
    );
    expect(result.target?.reservationRoomId).toBeNull();
    expect(result.registration.complete).toBe(true);
    expect(result.canCheckIn).toBe(true);
  });

  it("still throws when a readiness query fails", () => {
    expect(() => rethrowReadinessReadError({ message: "connection refused" })).toThrow(
      "connection refused",
    );
    expect(() => rethrowReadinessReadError(null)).not.toThrow();
    const source = read("src/packages/pms/lib/fo-check-in-readiness.functions.ts");
    expect(source).toContain("rethrowReadinessReadError(documentError)");
    expect(source).not.toContain("try {\n      return evaluateCheckInReadiness");
  });

  it("does not transition when readiness still has blockers", () => {
    const complete = read("src/packages/pms/lib/fo-check-in.functions.ts");
    const command = complete.slice(complete.indexOf("export const completeFoCheckIn"));
    const blockers = command.indexOf("readiness.blockers.length > 0");
    const rpc = command.indexOf('rpc("check_in_hotel_reservation"');
    expect(blockers).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(blockers);
    expect(command).toContain("Check-in blocked:");
    const blocked = evaluateCheckInReadiness(
      facts({ identityDocumentErrors: [IDENTITY_REQUIRED] }),
    );
    expect(blocked.blockers.length).toBeGreaterThan(0);
    expect(blocked.canCheckIn).toBe(false);
  });

  it("treats an incomplete snapshot as a blocker and does not read fullName on the v2 shape", () => {
    expect(() => isRegistrationComplete(v2Snapshot as never)).toThrow();
    expect(registrationSnapshotIsComplete({ guestId: "guest-1", fields: {} })).toBe(false);
    expect(registrationSnapshotIsComplete(null)).toBe(false);
    const result = evaluateCheckInReadiness(
      facts({ registrationComplete: registrationSnapshotIsComplete(null) }),
    );
    expect(result.blockers.map((item) => item.code)).toContain("REGISTRATION_INCOMPLETE");
    const source = read("src/packages/pms/lib/fo-check-in-readiness.functions.ts");
    expect(source).toContain("registrationSnapshotIsComplete(progress.registrationSnapshot)");
    expect(source).not.toContain("isRegistrationComplete(");
  });
});
