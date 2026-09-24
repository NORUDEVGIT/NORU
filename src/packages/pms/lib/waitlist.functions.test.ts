import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Phase 7 Waitlist", () => {
  it("adds waitlist request, offer and history tables without stay statuses", () => {
    const migration = source("supabase/migrations/0097_pms_waitlist.sql");
    const drizzle = source("drizzle/migrations/0097_pms_waitlist.sql");
    expect(migration).toBe(drizzle);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pms_waitlist_requests");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pms_waitlist_offers");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.pms_waitlist_history");
    expect(migration).toContain("reservation_id uuid");
    expect(migration).toContain("Not a reservation stay");
    expect(migration).not.toContain("checked_in");
    expect(migration).not.toContain("no_show");
    expect(migration).not.toContain("checked_out");
  });

  it("creates and amends waitlist requests without createReservation", () => {
    const functions = source("src/packages/pms/lib/waitlist.functions.ts");
    const createStart = functions.indexOf("export const createWaitlistRequest");
    const createFn = functions.slice(createStart, functions.indexOf("export const amendWaitlistRequest"));
    const amendFn = functions.slice(
      functions.indexOf("export const amendWaitlistRequest"),
      functions.indexOf("export const matchWaitlist"),
    );
    expect(createFn).toContain('from("pms_waitlist_requests")');
    expect(createFn).toContain('status: "open"');
    expect(createFn).not.toContain("createReservation");
    expect(createFn).not.toContain("create_hotel_reservation_priced");
    expect(amendFn).toContain("cancelPendingOffers");
    expect(amendFn).toContain('status: "open"');
    expect(amendFn).not.toContain("createReservation");
  });

  it("matches inventory then persists offers and responses", () => {
    const functions = source("src/packages/pms/lib/waitlist.functions.ts");
    expect(functions).toContain("getRoomTypeAvailabilityCompat");
    expect(functions).toContain("quoteStay");
    expect(functions).toContain("export const createWaitlistOffer");
    expect(functions).toContain("export const respondWaitlistOffer");
    expect(functions).toContain('response: z.enum(["accepted", "declined"])');
    expect(functions).not.toContain("pms_create_operational_block");
  });

  it("converts through createReservation then links reservation_id", () => {
    const functions = source("src/packages/pms/lib/waitlist.functions.ts");
    const convertStart = functions.indexOf("export const convertWaitlist");
    const convertFn = functions.slice(convertStart, functions.indexOf("export const cancelWaitlistRequest"));
    expect(convertFn).toContain("createReservation");
    expect(convertFn).toContain("reservation_id: created.id");
    expect(convertFn).toContain('status: "converted"');
    expect(convertFn).not.toContain("create_hotel_reservation_priced");
    expect(convertFn).not.toContain('from("hotel_reservations")');
  });

  it("cancels requests, records history, and does not send communications", () => {
    const functions = source("src/packages/pms/lib/waitlist.functions.ts");
    const ui = source("src/packages/pms/components/reservations/waitlist-workspace.tsx");
    expect(functions).toContain("export const cancelWaitlistRequest");
    expect(functions).toContain("pms_waitlist_history");
    expect(functions).toContain("offer_expired");
    expect(functions).not.toContain("resend");
    expect(functions).not.toContain("sendEmail");
    expect(ui).toContain("History");
    expect(ui).not.toContain("Send offer email");
  });

  it("wires a Waitlist workspace without a Desk waitlist KPI zero", () => {
    const workspace = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
    const desk = source("src/packages/pms/lib/reservation-workspace/desk.server.ts");
    expect(workspace).toContain("WaitlistWorkspace");
    expect(workspace).toContain('"Waitlist"');
    expect(workspace).not.toContain('label="Waitlist"');
    expect(desk).toContain("waitlist: null");
    expect(desk).toContain("waitlist: false");
    expect(desk).not.toMatch(/waitlist:\s*0/);
  });
});
