import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { arrivalProgressKey, arrivalUnitCount } from "@/packages/pms/lib/fo-arrival";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("FO-08 arrival unit actions", () => {
  it("keys check-in progress by the selected room", () => {
    expect(arrivalUnitCount({ roomUnits: [{ id: "a" }, { id: "b" }], reservationRoomId: "b" })).toBe(2);
    expect(arrivalUnitCount({ reservationRoomId: "only" })).toBe(1);
    expect(arrivalUnitCount({})).toBe(0);
    expect(arrivalProgressKey({ id: "res-1", reservationRoomId: "unit-2" })).toBe("res-1:unit-2");
  });

  it("uses unit progress for desk and quick view readiness", () => {
    const fns = read("src/packages/pms/lib/fo-arrival.functions.ts");
    expect(fns).toContain("loadArrivalProgressByStay");
    expect(fns).toContain("selectCheckInUnitProgress");
    expect(fns).toContain("loadUnitProgress");
    expect(fns).not.toContain("registrationOk: false");
    const control = read("src/packages/pms/lib/fo-control.functions.ts");
    expect(control).toContain("loadArrivalProgressByStay");
    expect(control).not.toContain("registrationOk: false");
  });

  it("opens assignment, check-in, and folio for the selected arrival unit", () => {
    const desk = read("src/packages/pms/components/workspaces/arrivals-workspace.tsx");
    const qv = read("src/packages/pms/components/frontoffice/arrival-quick-view.tsx");
    expect(desk).toContain("initialReservationRoomId={assignStay.reservationRoomId ?? undefined}");
    expect(desk).toContain("initialReservationRoomId={checkIn.stay.reservationRoomId ?? undefined}");
    expect(desk).toContain('to: "/restaurant/pms/cashiering/folios/$folioId"');
    expect(qv).toContain("openArrivalException");
    expect(qv).toContain('data-testid={`fo-arrival-exception-${item.key}`}');
    expect(qv).toContain('id="fo-arrival-requests"');
  });
});
