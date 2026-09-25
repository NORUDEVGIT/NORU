import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
const quickView = source("src/packages/pms/components/reservations/reservation-quick-view.tsx");
const chrome = source("src/packages/pms/components/rooms/room-inventory-chrome.tsx");
const route = source("src/routes/restaurant/pms/reservations.index.tsx");

describe("UI-01 Reservation Desk workspace", () => {
  it("uses the shared NORU chrome and renders the locked page header/sub-navigation", () => {
    expect(workspace).toContain("<RoomInventoryChrome");
    expect(workspace).toContain('activeModule="Reservations"');
    expect(chrome).toContain("PmsCommandChrome");
    expect(route).toContain("hidePackageRail");
    expect(route).toContain("hideTopHeader");
    expect(workspace).toContain("Reservation Desk");
    expect(workspace).toContain(
      "Manage reservations, availability, and daily reservation operations across your",
    );
    for (const section of [
      "Booking Calendar",
      "Reservation List",
      "Arrivals & Departures",
      "Exceptions",
      "Groups & Blocks",
      "Waitlist",
    ]) {
      expect(workspace).toContain(`"${section}"`);
    }
  });

  it("loads the workspace exclusively through getReservationDesk", () => {
    expect(workspace).toContain("getReservationDesk");
    expect(workspace).toContain("loadDesk({");
    expect(workspace).not.toContain("listReservations");
    expect(workspace).not.toContain('from("hotel_reservations")');
    expect(workspace).not.toContain("getBookingsDashboard");
  });

  it("renders approved KPIs and does not expose Waitlist as a live zero", () => {
    for (const label of [
      "Total Reservations",
      "Arrivals Today",
      "Departures Today",
      "In-House",
      "Unassigned",
      "Available Rooms",
    ]) {
      expect(workspace).toContain(`label="${label}"`);
    }
    expect(workspace).toContain('hint="Physical vacant rooms"');
    expect(workspace).not.toContain('label="Waitlist"');
    expect(workspace).toContain("WaitlistWorkspace");
    expect(workspace).toContain("ArrivalsDeparturesWorkspace");
    expect(workspace).toContain('goWorkspaceSection("arrivals-departures")');
    expect(workspace).toContain("ReservationControlWorkspace");
    expect(workspace).toContain('goWorkspaceSection("exceptions")');
  });

  it("sends filters, views and pagination through the Desk query", () => {
    for (const value of [
      "view,",
      "page,",
      "pageSize: PAGE_SIZE",
      "arrivalFrom",
      "arrivalTo",
      "statuses",
      "roomTypeId",
      "source",
      "search",
    ]) {
      expect(workspace).toContain(value);
    }
    for (const view of [
      "all",
      "arrivals",
      "departures",
      "in_house",
      "unassigned",
      "pending",
      "groups",
    ]) {
      expect(workspace).toContain(`id: "${view}"`);
    }
    expect(workspace).toContain("snapshot?.query.hasMore");
    expect(workspace).not.toContain(".filter((row)");
  });

  it("renders the operational table from Desk rows without per-row reads", () => {
    for (const heading of [
      "Res. No.",
      "Guest Name",
      "Room Type",
      "Arrival",
      "Departure",
      "Nights",
      "Adults",
      "Children",
      "Status",
      "Source",
      "Rate Plan",
      "Total Amount",
    ]) {
      expect(workspace).toContain(heading);
    }
    expect(workspace).toContain("<ReservationStatusBadge");
    expect(workspace).toContain("formatMoney(row.roomSubtotal, row.currency)");
    expect(workspace).not.toContain("folio_transactions");
  });

  it("selects rows locally and loads Quick View only after selection", () => {
    expect(workspace).toContain("setSelectedId(row.reservationId)");
    expect(workspace).toContain("getReservationQuickView");
    expect(workspace).toContain("enabled: selectedId !== null");
    expect(quickView).toContain("Select a reservation to view details");
    expect(quickView).toContain("function FinancialCard");
  });

  it("routes Open Reservation and gates operational actions with backend hints", () => {
    expect(workspace).toContain('setOverlay({ type: "reservation-detail", reservationId: id })');
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
    expect(workspace).not.toContain('to: "/restaurant/bookings/new"');
    expect(quickView).toContain("hints: quickView?.actionHints ?? row.hints");
    expect(quickView).toContain("getReservationContextActions(actionContext)");
    expect(quickView).toContain("Open Reservation");
    expect(quickView).toContain("Assign Room");
    expect(quickView).toContain("Check In");
    expect(quickView).toContain("Check Out");
    expect(workspace).not.toContain("checkInReservation(");
    expect(workspace).not.toContain("checkOutReservation(");
  });

  it("keeps Section 7 nulls honest and labels Groups as linked masters", () => {
    expect(workspace).toContain('note: "Linked masters"');
    expect(quickView).toContain("quickView.commercial.guaranteeMethod");
    expect(quickView).not.toContain("Guaranteed");
    expect(quickView).not.toContain("Tentative");
  });

  it("contains polished loading, error, empty and responsive detail states", () => {
    expect(workspace).toContain("<DeskTableSkeleton");
    expect(workspace).toContain("<InlineError");
    expect(workspace).toContain("No reservations in this view");
    expect(workspace).toContain("No reservations match these filters");
    expect(workspace).toContain("More Filters");
    expect(workspace).toContain("Arrival From");
    expect(workspace).toContain("debouncedSearch");
    expect(workspace).toContain("...deskQuerySlice");
    expect(workspace).toContain("reservation-desk-more-filters");
    expect(workspace).toContain("toDeskSearchQuerySlice");
    expect(workspace).toContain("countActiveAdvancedFilters");
    expect(workspace).not.toContain("Reservation Type");
    expect(workspace).toContain("<Sheet");
    expect(workspace).toContain("xl:grid-cols-[190px_minmax(0,1fr)_300px]");
    expect(workspace).toContain("overflow-x-auto");
  });
});
