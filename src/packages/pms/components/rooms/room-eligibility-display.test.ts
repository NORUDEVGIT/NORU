import { describe, expect, it } from "vitest";

import {
  compactStayRange,
  eligibilityStaffLines,
  staffEligibilityError,
  stayNightCount,
  type EligibilityStaffInput,
} from "./room-eligibility-display";

function inspection(overrides: Partial<EligibilityStaffInput> = {}): EligibilityStaffInput {
  return {
    source: "canonical",
    eligible: true,
    blockers: [],
    warnings: [],
    preferenceReasons: [],
    arrival: "2026-11-12",
    departure: "2026-11-13",
    guests: 2,
    maxOccupancy: 3,
    housekeepingStatus: "clean",
    maintenanceStatus: "normal",
    operationalStatus: "available",
    bedPreference: null,
    roomBeds: "Twin",
    buildingPreference: null,
    roomBuilding: "Main",
    floorPreference: null,
    roomFloor: "2",
    accessibleRequired: false,
    connectingRequired: false,
    forCheckIn: false,
    roomTypeAligned: true,
    ...overrides,
  };
}

describe("assignment eligibility staff display", () => {
  it("turns a clear canonical result into staff pass lines", () => {
    const lines = eligibilityStaffLines(inspection());
    expect(lines.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "Available for 12–13 Nov",
        "Capacity supports 2 guests",
        "No Out of Order / Out of Service restriction",
        "No room block conflict",
        "Housekeeping status is Clean",
        "No maintenance restriction",
      ]),
    );
    expect(lines.every((line) => line.tone === "pass")).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("ROOM_");
    expect(JSON.stringify(lines)).not.toContain("canonical");
  });

  it("keeps blocking failures red and preference misses amber", () => {
    const lines = eligibilityStaffLines(
      inspection({
        eligible: false,
        housekeepingStatus: "dirty",
        bedPreference: "King",
        blockers: [
          { code: "OCCUPANCY_EXCEEDED" },
          { code: "HOUSEKEEPING_NOT_READY" },
          { code: "BED_TYPE_MISMATCH" },
          { code: "ROOM_OPERATIONALLY_UNAVAILABLE", status: "out_of_order" },
        ],
        warnings: [{ code: "BUILDING_PREFERENCE_MISS" }],
        buildingPreference: "Garden Wing",
        roomBuilding: "Main",
      }),
    );
    expect(lines).toEqual(
      expect.arrayContaining([
        { tone: "fail", text: "Capacity does not support 2 guests." },
        { tone: "fail", text: "Housekeeping status is Dirty" },
        { tone: "fail", text: "Guest prefers King bed; this room has Twin" },
        { tone: "fail", text: "Room is Out of Order" },
        {
          tone: "warn",
          text: "Building preference is Garden Wing; this room is in Main.",
        },
      ]),
    );
  });

  it("does not invent a full checklist for the legacy fallback", () => {
    const lines = eligibilityStaffLines(inspection({ source: "legacy", eligible: false }));
    expect(lines).toEqual([{ tone: "fail", text: "This room is not available for these dates." }]);
  });

  it("maps backend errors without raw identifiers", () => {
    expect(staffEligibilityError(new Error("INVALID_DATES"))).toBe(
      "Departure must be after arrival.",
    );
    expect(
      staffEligibilityError(
        new Error(
          "Could not evaluate room assignment. room_id 6f1e8c2a-1b2c-4d3e-8f90-aabbccddeeff",
        ),
      ),
    ).toBe("Eligibility could not be checked. Try again.");
  });

  it("derives nights from the stay dates", () => {
    expect(stayNightCount("2026-11-12", "2026-11-13")).toBe(1);
    expect(stayNightCount("2026-11-12", "2026-11-12")).toBeNull();
    expect(compactStayRange("2026-11-12", "2026-11-13")).toBe("12–13 Nov");
  });
});
