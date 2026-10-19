import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/fo-check-in.functions.ts"),
  "utf8",
);
const complete = source.slice(source.indexOf("export const completeFoCheckIn"));

describe("completeFoCheckIn", () => {
  it("runs readiness before the existing transition and stamps only that unit", () => {
    const rpc = complete.indexOf('rpc("check_in_hotel_reservation"');
    const blockers = complete.indexOf("readiness.blockers.length > 0");
    const stamp = complete.indexOf("writeCheckInUnitProgress");
    const pending = complete.indexOf('outcome: "checked_in_stamp_pending"');
    expect(complete.indexOf("getCheckInReadiness")).toBeGreaterThan(-1);
    expect(blockers).toBeGreaterThan(-1);
    expect(blockers).toBeLessThan(rpc);
    expect(stamp).toBeGreaterThan(rpc);
    expect(pending).toBeGreaterThan(stamp);
    expect(complete.match(/check_in_hotel_reservation/g)).toHaveLength(1);
    expect(complete.slice(stamp)).not.toContain("check_in_hotel_reservation");
    expect(complete).toContain("_room_id: target.roomId");
    expect(complete).toContain("_reservation_room_id: target.reservationRoomId");
    expect(complete).toContain("reservationRoomId: target.reservationRoomId");
    expect(complete).not.toContain("stay.roomId");
    expect(complete).not.toContain("patchProgress");
    expect(complete).not.toContain("recordReservationEvent");
    expect(complete).not.toContain("data.roomId");
  });
});
