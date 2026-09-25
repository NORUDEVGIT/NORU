import { describe, expect, it } from "vitest";

import {
  allotmentTotals,
  isAllowedGroupStatusTransition,
  nightlyAllotment,
  stayFitsAllotment,
} from "./groups";

describe("Groups allotment pickup", () => {
  it("computes nightly remaining from overlapping pickup stays", () => {
    const nights = nightlyAllotment({
      allotted: 2,
      startDate: "2026-10-01",
      endDate: "2026-10-04",
      stays: [
        { arrivalDate: "2026-10-01", departureDate: "2026-10-03", status: "confirmed" },
        { arrivalDate: "2026-10-02", departureDate: "2026-10-04", status: "pending" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "cancelled" },
      ],
    });
    expect(nights.map((night) => [night.night, night.pickedUp, night.remaining])).toEqual([
      ["2026-10-01", 1, 1],
      ["2026-10-02", 2, 0],
      ["2026-10-03", 1, 1],
    ]);
    expect(allotmentTotals(nights)).toEqual({ allotted: 2, pickedUp: 2, remaining: 0 });
  });

  it("rejects over-pickup on a tight night", () => {
    expect(
      stayFitsAllotment({
        allotted: 1,
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        stays: [{ arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "confirmed" }],
        proposed: { arrivalDate: "2026-10-01", departureDate: "2026-10-03", status: "pending" },
      }),
    ).toBe(false);
    expect(
      stayFitsAllotment({
        allotted: 1,
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        stays: [{ arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "confirmed" }],
        proposed: { arrivalDate: "2026-10-02", departureDate: "2026-10-03", status: "pending" },
      }),
    ).toBe(true);
  });

  it("guards group status transitions", () => {
    expect(isAllowedGroupStatusTransition("tentative", "definite")).toBe(true);
    expect(isAllowedGroupStatusTransition("definite", "tentative")).toBe(false);
    expect(isAllowedGroupStatusTransition("cancelled", "tentative")).toBe(true);
    expect(isAllowedGroupStatusTransition("completed", "definite")).toBe(false);
  });

  it("rolls group workspace KPIs from list rows", async () => {
    const { groupWorkspaceKpis, groupWorkspaceSectionFromTab } = await import("./groups");
    expect(groupWorkspaceSectionFromTab("groups-blocks")).toBe(true);
    expect(
      groupWorkspaceKpis([
        { status: "tentative", remaining: 2, pickedUp: 1, reservationCount: 1 },
        { status: "definite", remaining: 0, pickedUp: 3, reservationCount: 4 },
      ]),
    ).toEqual({
      total: 2,
      tentative: 1,
      definite: 1,
      remaining: 2,
      pickedUp: 4,
      reservations: 5,
    });
  });
});
