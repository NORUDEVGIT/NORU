import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkInIdentityVerification,
  registrationProfileColumns,
} from "@/packages/pms/lib/fo-check-in-registration";
import { validateGuestCheckInRequirements } from "@/packages/pms/lib/guest-field-rules";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("registration profile columns", () => {
  it("updates profile fields and does not write scalar identity columns", () => {
    const columns = registrationProfileColumns({
      firstName: "Ada",
      phone: " 555 ",
      idDocumentNumber: "P123",
      id_document_type: "passport",
    });
    expect(columns).toEqual({ first_name: "Ada", phone: "555" });
    expect(columns).not.toHaveProperty("id_document_number");
    expect(columns).not.toHaveProperty("id_document_type");
  });
});

describe("identity verification", () => {
  it("warns when a document is unverified and no type requires staff verification", () => {
    const result = checkInIdentityVerification({
      documents: [{ typeId: "passport", verificationStatus: "unverified" }],
      types: [{ id: "passport" }],
    });
    expect(result.warnings).toEqual(["Identity document is not verified."]);
    expect(result.blockers).toEqual([]);
  });

  it("blocks only when an existing type rule requires staff verification", () => {
    const result = checkInIdentityVerification({
      documents: [{ typeId: "passport", verificationStatus: "unverified" }],
      types: [{ id: "passport", requiresStaffVerification: true }],
    });
    expect(result.blockers).toEqual(["Staff verification is required for this identity document."]);
    expect(result.warnings).toEqual([]);
  });
});

describe("validateGuestCheckInRequirements documents", () => {
  it("rejects an expired identity document", () => {
    const result = validateGuestCheckInRequirements({
      guest: { firstName: "Ada" },
      documents: [
        {
          typeId: "passport-type",
          documentNumber: "P1",
          issuingCountry: "ET",
          expiryDate: "2020-01-01",
        },
      ],
      config: {
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
      } as never,
      today: "2026-10-18",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/unexpired/i);
  });
});

describe("check-in registration commands", () => {
  const registration = read("src/packages/pms/lib/fo-check-in-registration.functions.ts");
  const complete = read("src/packages/pms/lib/fo-check-in.functions.ts");
  const save = registration.slice(
    registration.indexOf("export const saveCheckInUnitRegistration"),
    registration.indexOf("export const searchCheckInGuestDuplicates"),
  );
  const search = registration.slice(
    registration.indexOf("export const searchCheckInGuestDuplicates"),
    registration.indexOf("export const reviewCheckInGuestDocument"),
  );
  const occupants = read("src/packages/pms/lib/reservations.functions.ts");

  it("saves the resolved guest through Guest Profile and does not amend occupancy", () => {
    expect(save).toContain("requireReservationManager");
    expect(save).toContain("loadCheckInUnitTarget");
    expect(save).toContain("target.primaryGuestId");
    expect(save).toContain('eventType: "profile_updated"');
    expect(save).toContain("saveGuestDocument");
    expect(save).toContain("guestId,");
    expect(save).toContain("reservationRoomId: target.reservationRoomId");
    expect(save).not.toContain("amend_hotel_reservation");
    expect(save).not.toContain("id_document_");
    expect(save).not.toContain("findGuestDuplicates");
    expect(save).not.toContain("manage_reservation_room_guest");
    expect(save).not.toContain('.from("guest_profiles")\n        .insert');
  });

  it("searches duplicates without inserting a profile", () => {
    expect(search).toContain("findGuestDuplicates");
    expect(search).not.toContain(".insert(");
    expect(search).not.toContain("guest_profiles");
  });

  it("verifies through reviewGuestDocument", () => {
    expect(registration).toContain("reviewGuestDocument");
    expect(registration).not.toContain("verification_status:");
  });

  it("stops complete from forcing documents valid and reads the target guest", () => {
    const completeFn = complete.slice(complete.indexOf("export const completeFoCheckIn"));
    expect(completeFn).not.toContain('status: "valid"');
    expect(completeFn).toContain("verification_status");
    expect(completeFn).toContain("loadCheckInUnitTarget");
    expect(completeFn).toContain("registrationTarget.primaryGuestId");
    expect(completeFn).not.toContain("hotel_reservation_rooms");
  });

  it("leaves accompanying guests on manageReservationRoomGuest", () => {
    expect(occupants).toContain("export const manageReservationRoomGuest");
    expect(occupants).toContain('rpc("manage_reservation_room_guest"');
    expect(registration).not.toContain("manageReservationRoomGuest");
  });
});
