import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { departureExceptionOwner } from "@/packages/pms/lib/fo-departure";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("FO-10 departure checkout actions", () => {
  it("keeps a balance due in check-out and sends a credit to Cashiering", () => {
    expect(departureExceptionOwner("unsettled_folio", 40)).toBe("check_out");
    expect(departureExceptionOwner("unsettled_folio", -12)).toBe("open_folio");
    expect(departureExceptionOwner("missing_folio", null)).toBe("check_out");
    expect(departureExceptionOwner("late_checkout_conflict", 0)).toBe("late_checkout");
    expect(departureExceptionOwner("maintenance", 0)).toBe("open_maintenance");
    expect(departureExceptionOwner("guest_request", 0)).toBe("guest_request");
  });

  it("opens check-out, folio, and the unarrived handoff for the selected room", () => {
    const desk = read("src/packages/pms/components/workspaces/departures-workspace.tsx");
    const qv = read("src/packages/pms/components/frontoffice/departure-quick-view.tsx");
    expect(desk).toContain("initialReservationRoomId={checkOutStay.reservationRoomId ?? undefined}");
    expect(desk).toContain("initialReservationRoomId={unarrivedStay.reservationRoomId ?? undefined}");
    expect(desk).toContain('to: "/restaurant/pms/cashiering/folios/$folioId"');
    expect(desk).toContain("<NoShowDialog");
    expect(qv).toContain("fo-departure-preparation");
    expect(qv).toContain("fo-departure-check-out");
    expect(qv).toContain("fo-departure-refund");
    expect(qv).toContain("departureExceptionOwner");
    expect(qv).not.toContain("No-Show");
    expect(desk).toContain("/restaurant/pms/cashiering");
  });
});
