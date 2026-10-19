import { describe, expect, it } from "vitest";

import {
  previousStayDate,
  unitPackageKept,
  type RoomPackageScope,
} from "@/packages/pms/lib/reservation-room-package-sync";

const scope = (partial: Partial<RoomPackageScope> = {}): RoomPackageScope => ({
  active: true,
  validFrom: "2026-10-01",
  validTo: "2026-12-31",
  chargeBasis: "per_stay",
  packagePrice: 40,
  masterRoomTypeIds: [],
  masterRatePlanIds: [],
  activationRoomTypeIds: [],
  activationRatePlanIds: [],
  masterActive: true,
  ...partial,
});

describe("unit package compatibility", () => {
  it("keeps a package that still matches the proposed room", () => {
    expect(previousStayDate("2026-10-24")).toBe("2026-10-23");
    expect(
      unitPackageKept({
        roomTypeId: "type-b",
        ratePlanId: "plan-b",
        arrivalDate: "2026-10-20",
        departureDate: "2026-10-24",
        scope: scope({ activationRoomTypeIds: ["type-b"], activationRatePlanIds: ["plan-b"] }),
      }).kept,
    ).toBe(true);
  });

  it("marks a room-type or rate-plan mismatch incompatible and leaves the amount for review", () => {
    const mismatched = unitPackageKept({
      roomTypeId: "type-b",
      ratePlanId: "plan-b",
      arrivalDate: "2026-10-20",
      departureDate: "2026-10-24",
      scope: scope({ masterRoomTypeIds: ["type-a"] }),
    });
    expect(mismatched).toEqual({ kept: false, reason: "PACKAGE_ROOM_TYPE_MISMATCH" });
    expect(
      unitPackageKept({
        roomTypeId: "type-b",
        ratePlanId: "plan-b",
        arrivalDate: "2026-10-20",
        departureDate: "2026-10-24",
        scope: scope({ activationRatePlanIds: ["plan-a"] }),
      }).reason,
    ).toBe("PACKAGE_RATE_PLAN_MISMATCH");
  });
});
