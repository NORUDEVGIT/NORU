import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assertCheckInWaiverRole, checkInWaiverPatch } from "@/packages/pms/lib/fo-check-in-waiver";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("check-in waiver role", () => {
  it("rejects a receptionist and allows an owner or manager", () => {
    expect(() => assertCheckInWaiverRole("receptionist")).toThrow(/permission/i);
    expect(() => assertCheckInWaiverRole("owner")).not.toThrow();
    expect(() => assertCheckInWaiverRole("manager")).not.toThrow();
  });
});

describe("check-in waiver patch", () => {
  it("writes only the named requirement", () => {
    expect(checkInWaiverPatch("deposit", "card", "manager-1", "2026-10-18T12:00:00.000Z")).toEqual({
      deposit_waived: true,
      deposit_waiver_reason: "card",
      deposit_waived_by: "manager-1",
      deposit_waived_at: "2026-10-18T12:00:00.000Z",
    });
    expect(
      Object.keys(checkInWaiverPatch("key", "later", "owner-1", "2026-10-18T12:00:00.000Z")),
    ).toEqual(["key_waived", "key_waiver_reason", "key_waived_by", "key_waived_at"]);
    for (const requirement of ["agreement", "signature", "room", "identity"]) {
      expect(() =>
        checkInWaiverPatch(requirement, "no", "owner-1", "2026-10-18T12:00:00.000Z"),
      ).toThrow(/cannot be waived/);
    }
  });
});

describe("check-in waiver command", () => {
  it("stores the waiver on the target unit and records that requirement", () => {
    const source = read("src/packages/pms/lib/fo-check-in-waiver.functions.ts");
    const writer = read("src/packages/pms/lib/fo-check-in-unit.functions.ts");
    expect(source.indexOf("assertCheckInWaiverRole")).toBeLessThan(
      source.indexOf("writeCheckInUnitProgress"),
    );
    expect(source).toContain("reservationRoomId: target.reservationRoomId");
    expect(source).toContain("requirement: input.requirement");
    expect(source).toContain("reservation_room_id: target.reservationRoomId");
    expect(source).toContain('z.enum(["registration", "deposit", "key"])');
    expect(writer).toContain('.eq("reservation_room_id", input.reservationRoomId)');
    const deposit = read("src/packages/pms/lib/fo-check-in.functions.ts");
    const waive = deposit.slice(
      deposit.indexOf("export const waiveCheckInDeposit"),
      deposit.indexOf("export const recordCheckInKey"),
    );
    expect(waive).toContain('requirement: "deposit"');
    expect(waive).toContain("commitCheckInUnitWaiver");
    expect(waive).not.toContain("patchProgress");
  });
});
