import { describe, expect, it } from "vitest";

import {
  allotmentTotals,
  effectiveGroupBlockCutoff,
  headerGroupBlockIdFromUnits,
  isAllowedGroupStatusTransition,
  nightlyAllotment,
  stayFitsAllotment,
  staysFitAllotment,
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

  it("counts each room unit toward pickup, not the reservation header", () => {
    const nights = nightlyAllotment({
      allotted: 10,
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      stays: [
        {
          arrivalDate: "2026-10-01",
          departureDate: "2026-10-03",
          status: "confirmed",
          reservationRoomId: "u1",
        },
        {
          arrivalDate: "2026-10-01",
          departureDate: "2026-10-03",
          status: "confirmed",
          reservationRoomId: "u2",
        },
        {
          arrivalDate: "2026-10-01",
          departureDate: "2026-10-03",
          status: "pending",
          reservationRoomId: "u3",
        },
      ],
    });
    expect(allotmentTotals(nights)).toEqual({ allotted: 10, pickedUp: 3, remaining: 7 });
  });

  it("drops cancelled and no-show units from pickup", () => {
    const nights = nightlyAllotment({
      allotted: 10,
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      stays: [
        { arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "confirmed" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "cancelled" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-02", status: "no_show" },
      ],
    });
    expect(allotmentTotals(nights)).toEqual({ allotted: 10, pickedUp: 1, remaining: 9 });
  });

  it("rejects a unit amend that would over-pick", () => {
    expect(
      staysFitAllotment({
        allotted: 2,
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        stays: [
          { arrivalDate: "2026-10-01", departureDate: "2026-10-03", status: "confirmed" },
          { arrivalDate: "2026-10-01", departureDate: "2026-10-03", status: "confirmed" },
        ],
        proposed: [{ arrivalDate: "2026-10-01", departureDate: "2026-10-03", status: "pending" }],
      }),
    ).toBe(false);
  });

  it("uses a shared header block only when every unit names the same block", () => {
    expect(headerGroupBlockIdFromUnits(["twin-1", "twin-1", "twin-1"])).toBe("twin-1");
    expect(headerGroupBlockIdFromUnits(["twin-1", "suite-1"])).toBe(null);
    expect(headerGroupBlockIdFromUnits([null, null])).toBe(null);
  });

  it("takes block cutoff over group cutoff and skips when both are empty", () => {
    expect(effectiveGroupBlockCutoff("2026-10-01", "2026-10-10")).toBe("2026-10-01");
    expect(effectiveGroupBlockCutoff(null, "2026-10-10")).toBe("2026-10-10");
    expect(effectiveGroupBlockCutoff(null, null)).toBe(null);
  });

  it("keeps picked rooms when releasing unused remaining at cutoff", () => {
    const nights = nightlyAllotment({
      allotted: 10,
      startDate: "2026-10-01",
      endDate: "2026-10-04",
      stays: [
        { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "confirmed" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "confirmed" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "pending" },
        { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "checked_in" },
      ],
    });
    const totals = allotmentTotals(nights);
    expect(totals).toEqual({ allotted: 10, pickedUp: 4, remaining: 6 });
    expect(
      allotmentTotals(
        nightlyAllotment({
          allotted: totals.pickedUp,
          startDate: "2026-10-01",
          endDate: "2026-10-04",
          stays: [
            { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "confirmed" },
            { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "confirmed" },
            { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "pending" },
            { arrivalDate: "2026-10-01", departureDate: "2026-10-04", status: "checked_in" },
          ],
        }),
      ),
    ).toEqual({ allotted: 4, pickedUp: 4, remaining: 0 });
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
