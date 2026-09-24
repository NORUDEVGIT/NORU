import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";

const detail = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const functions = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);

describe("Phase 3 reservation detail gaps", () => {
  it("maps persisted commercial, guarantee, and master columns into getReservation", () => {
    expect(functions).toContain("commercial_booking_source, market_segment, external_reference, guarantee_method");
    expect(functions).toContain("company_master_id, travel_agent_master_id, group_account_master_id");
    expect(functions).toContain(
      "company:guest_account_masters!hotel_reservations_company_master_same_property ( name )",
    );
    expect(functions).toContain("commercialBookingSource: row.commercial_booking_source");
    expect(functions).toContain("guaranteeMethod: row.guarantee_method");
    expect(functions).toContain("companyName: oneRel(row.company)?.name ?? null");
    expect(functions).toContain("housekeeping_status");
    expect(detail).toContain("displayValue(reservation.commercialBookingSource)");
    expect(detail).toContain("displayValue(reservation.marketSegment)");
    expect(detail).toContain("displayValue(reservation.companyName)");
    expect(detail).toContain("displayValue(reservation.guaranteeMethod)");
    expect(detail).not.toContain('<Field label="Booking source" value={dash} />');
  });

  it("launches Front Office Check In, Check Out, No-Show, and Change Room from Detail", () => {
    expect(detail).toContain("<CheckInDialog");
    expect(detail).toContain("<CheckOutDialog");
    expect(detail).toContain("<NoShowDialog");
    expect(detail).toContain("<RoomMoveDialog");
    expect(detail).toContain("Check In");
    expect(detail).toContain("Check Out");
    expect(detail).toContain("Mark No-Show");
    expect(detail).toContain("Change Room");
    expect(detail).not.toContain("Process no-show");
    expect(detail).not.toContain("FoNoShowStepper");
  });

  it("edits notes and special requests through amendReservation", () => {
    expect(detail).toContain("id=\"detail-special-requests\"");
    expect(detail).toContain("id=\"detail-notes\"");
    expect(detail).toContain("id=\"amend-special-requests\"");
    expect(detail).toContain("Save notes");
    expect(detail).toContain("specialRequests,");
    expect(detail).toContain("notes,");
    expect(detail).toContain("Save notes");
  });

  it("loads history actor and renders before/after values", () => {
    expect(functions).toContain("actor_membership_id");
    expect(functions).toContain("resolveReservationActorNames");
    expect(functions).toContain("actorName: event.actor_membership_id");
    expect(detail).toContain("reservationHistoryChanges");
    expect(detail).toContain("entry.actorName");
    expect(detail).toContain("{change.from} → {change.to}");
  });

  it("reviews amend impact, copies a stay, and still launches FO dialogs", () => {
    expect(detail).toContain("amend-impact-review");
    expect(detail).toContain("Review changes");
    expect(detail).toContain("Copy stay");
    expect(functions).toContain("export const copyReservation");
    expect(functions).toContain("roomId: null");
  });
});

describe("reservationHistoryChanges", () => {
  it("only lists keys that actually changed", () => {
    expect(
      reservationHistoryChanges(
        { notes: "old", adults: 1, status: "pending" },
        { notes: "new", adults: 1, status: "confirmed" },
      ),
    ).toEqual([
      { key: "notes", from: "old", to: "new" },
      { key: "status", from: "pending", to: "confirmed" },
    ]);
  });
});
