import { describe, expect, it } from "vitest";

import { nightlyBlocked, nightlyDemand, stayBlocked, stayDemand } from "./room-inventory-utils";

const night = {
  date: "2026-09-23",
  physicalCapacity: 10,
  pinnedRoomClaims: 2,
  typeHold: false,
  quantityHoldApplied: 3,
  unrepresentedReservationDemand: 1,
  available: 4,
};

describe("inventory nightly honesty", () => {
  it("reads demand from pinned claims plus unrepresented demand", () => {
    expect(nightlyDemand(night)).toBe(3);
    expect(nightlyBlocked(night)).toBe(3);
    expect(stayDemand({ reserved: null, nightly: [night] })).toBe(3);
    expect(stayBlocked({ nightly: [night] })).toBe(3);
  });

  it("keeps a canonical reserved value when the adapter supplies one", () => {
    expect(stayDemand({ reserved: 7, nightly: [night] })).toBe(7);
  });

  it("uses full physical capacity when a type hold is present", () => {
    expect(nightlyBlocked({ ...night, typeHold: true })).toBe(10);
  });
});
