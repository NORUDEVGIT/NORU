import { describe, expect, it } from "vitest";

import {
  defaultOfferExpiresAt,
  deriveWaitlistRequestStatus,
  effectiveOfferStatus,
  isAllowedWaitlistRequestTransition,
  occupancyFits,
  waitlistWorkspaceKpis,
  waitlistWorkspaceSectionFromTab,
} from "./waitlist";

describe("Phase 7 Waitlist domain", () => {
  it("derives offer expiry on-read without mutating stored pending", () => {
    expect(
      effectiveOfferStatus({ status: "pending", expiresAt: "2026-09-01T00:00:00.000Z" }, "2026-09-24T12:00:00.000Z"),
    ).toBe("expired");
    expect(
      effectiveOfferStatus({ status: "pending", expiresAt: "2026-09-30T00:00:00.000Z" }, "2026-09-24T12:00:00.000Z"),
    ).toBe("pending");
    expect(
      effectiveOfferStatus({ status: "accepted", expiresAt: "2026-09-01T00:00:00.000Z" }, "2026-09-24T12:00:00.000Z"),
    ).toBe("accepted");
  });

  it("keeps waitlist status separate from reservation stay statuses", () => {
    expect(deriveWaitlistRequestStatus("open", [], null)).toBe("open");
    expect(
      deriveWaitlistRequestStatus(
        "offered",
        [{ status: "pending", expiresAt: "2026-09-30T00:00:00.000Z" }],
        null,
        "2026-09-24T12:00:00.000Z",
      ),
    ).toBe("offered");
    expect(
      deriveWaitlistRequestStatus(
        "offered",
        [{ status: "pending", expiresAt: "2026-09-01T00:00:00.000Z" }],
        null,
        "2026-09-24T12:00:00.000Z",
      ),
    ).toBe("expired");
    expect(deriveWaitlistRequestStatus("open", [], "res-1")).toBe("converted");
    expect(deriveWaitlistRequestStatus("cancelled", [], null)).toBe("cancelled");
    expect(isAllowedWaitlistRequestTransition("converted", "open")).toBe(false);
    expect(isAllowedWaitlistRequestTransition("open", "cancelled")).toBe(true);
  });

  it("rolls waitlist KPIs from display status, not pending reservations", () => {
    expect(waitlistWorkspaceSectionFromTab("waitlist")).toBe(true);
    expect(waitlistWorkspaceSectionFromTab("groups")).toBe(false);
    expect(
      waitlistWorkspaceKpis([
        { displayStatus: "open" },
        { displayStatus: "offered" },
        { displayStatus: "expired" },
        { displayStatus: "converted" },
      ]),
    ).toEqual({ total: 4, open: 1, offered: 1, expired: 1, converted: 1 });
    expect(occupancyFits(2, 1, 2)).toBe(false);
    expect(occupancyFits(2, 0, 2)).toBe(true);
    expect(defaultOfferExpiresAt(new Date("2026-09-24T00:00:00.000Z"))).toBe("2026-09-25T00:00:00.000Z");
  });
});
