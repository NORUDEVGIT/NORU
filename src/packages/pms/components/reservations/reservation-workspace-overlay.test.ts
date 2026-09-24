import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
  "utf8",
);
const overlay = readFileSync(
  resolve(
    process.cwd(),
    "src/packages/pms/components/reservations/reservation-workspace-overlay.tsx",
  ),
  "utf8",
);
const detail = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);
const createPage = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-page.tsx"),
  "utf8",
);
const confirmation = readFileSync(
  resolve(
    process.cwd(),
    "src/packages/pms/components/bookings/create-reservation-confirmation.tsx",
  ),
  "utf8",
);
const route = readFileSync(
  resolve(process.cwd(), "src/routes/restaurant/bookings/new.tsx"),
  "utf8",
);

describe("Phase 1 workspace overlay routing", () => {
  it("keeps row selection local and does not open Detail from a row click", () => {
    expect(workspace).toContain("function selectRow(row: ReservationDeskRow)");
    expect(workspace).toContain("setSelectedId(row.reservationId)");
    expect(workspace).toContain("onClick={() => onSelect(row)}");
    expect(workspace).not.toContain("onSelect={(row) => openReservation(row.reservationId)}");
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
  });

  it("opens New Reservation as a workspace overlay instead of the legacy booking route", () => {
    expect(workspace).toContain('setOverlay({ type: "new-reservation" })');
    expect(workspace).toContain("<CreateReservationPage");
    expect(workspace).toContain("<ReservationWorkspaceOverlay");
    expect(workspace).not.toContain('to="/restaurant/bookings/new"');
    expect(route).toContain("<CreateReservationPage membership={m} />");
  });

  it("opens Reservation Detail as an embedded overlay", () => {
    expect(workspace).toContain('setOverlay({ type: "reservation-detail", reservationId: id })');
    expect(workspace).toContain("<ReservationDetailWorkspace");
    expect(workspace).toContain("embedded");
    expect(workspace).toContain("function overlayTitle(");
    expect(workspace).toContain("row.confirmationNumber");
    expect(workspace).toContain("row.guestName");
    expect(detail).toContain("embedded = false");
    expect(detail).toContain("{embedded ? null : (");
    expect(detail).toContain("Open guest profile");
    expect(detail).toContain("{embedded ? null : (");
  });

  it("keeps Assign, Check In and Check Out on existing in-workspace hosts", () => {
    expect(workspace).toContain("<AssignRoomDialog");
    expect(workspace).toContain("<CheckInDialog");
    expect(workspace).toContain("<CheckOutDialog");
    expect(workspace).toContain("<ReservationActionDialogHost");
    expect(workspace).not.toContain("checkInReservation(");
    expect(workspace).not.toContain("checkOutReservation(");
  });

  it("stops overflow-menu clicks from selecting or navigating the row", () => {
    expect(workspace).toContain("onClick={(event) => event.stopPropagation()}");
    expect(workspace).toContain("<ReservationContextMenu");
  });

  it("uses a large Dialog on desktop and a full-height Sheet on narrower viewports", () => {
    expect(overlay).toContain("<Dialog");
    expect(overlay).toContain("<Sheet");
    expect(overlay).toContain("h-[min(92vh,960px)]");
    expect(overlay).toContain("w-[min(96vw,1400px)]");
    expect(overlay).toContain("max-w-none");
    expect(overlay).toContain("sm:max-w-none");
    expect(overlay).toContain("h-dvh");
    expect(overlay).toContain("z-50");
    expect(overlay).toContain("WORKSPACE_OVERLAY_TEST_ID");
    expect(overlay).toContain("data-testid={WORKSPACE_OVERLAY_TEST_ID}");
    expect(overlay).not.toContain("RestaurantShell");
    expect(overlay).not.toContain("RoomInventoryChrome");
  });

  it("keeps create confirmation inside the overlay and can return to the Desk", () => {
    expect(createPage).toContain("onOpenCreatedReservation");
    expect(createPage).toContain("onReturnToDesk");
    expect(createPage).toContain("embedded = false");
    expect(confirmation).toContain("Return to Reservation Desk");
    expect(confirmation).toContain("onCreateAnother");
    expect(workspace).toContain("onOpenCreatedReservation={(reservationId) => {");
  });

  it("does not route Desk folio actions to the Cashiering page", () => {
    expect(workspace).not.toContain('to: "/restaurant/cashiering/folios/$folioId"');
    expect(workspace).toContain('case "open_folio":');
    expect(workspace).not.toContain("allowOpenFolio");
    expect(workspace).toContain("<ReservationActionDialogHost");
  });

  it("opens the confirmation number into the Detail overlay without changing the pathname", () => {
    expect(workspace).toContain("onOpen={openReservation}");
    expect(workspace).toContain("event.stopPropagation()");
    expect(workspace).toContain("onOpen(row.reservationId)");
    expect(workspace).not.toContain('to: "/restaurant/pms/reservations/$reservationId"');
  });

  it("does not render section-scope engineering copy in the create page", () => {
    expect(createPage).toMatch(/CREATE_RESERVATION_SECTION1_SCOPE/);
    expect(createPage).not.toMatch(/\{CREATE_RESERVATION_SECTION\d+_SCOPE\}/);
    expect(createPage).not.toMatch(/CREATE_RESERVATION_SECTION\d+_SCOPE<\/p>/);
  });

  it("uses a five-step New Reservation workflow in the overlay", () => {
    expect(createPage).toContain("Stay Details");
    expect(createPage).toContain("Guest and Contact");
    expect(createPage).toContain("Room and Rate");
    expect(createPage).toContain("Add-ons and Services");
    expect(createPage).toContain("Review and Confirm");
    expect(createPage).toContain('data-testid="create-reservation-stepper"');
    expect(createPage).toContain("CREATE_RESERVATION_PENDING_LABEL");
    expect(createPage).toContain("CREATE_RESERVATION_CONFIRM_LABEL");
  });

  it("gives embedded Detail one header, Overview, and no All reservations chrome", () => {
    expect(workspace).toContain('hideVisualHeader={overlay?.type === "reservation-detail"}');
    expect(detail).toContain("Reservation Detail");
    expect(detail).toContain('{ id: "overview", label: "Overview" }');
    expect(detail).toContain("Folio is not available in this workspace yet.");
    expect(detail).toContain("if (embedded)");
    const allReservationsHits = detail.match(/All reservations/g) ?? [];
    expect(allReservationsHits).toHaveLength(1);
  });

  it("prevents the parent overlay from closing on nested Escape", () => {
    expect(overlay).toContain("onEscapeKeyDown: blockParentDismiss");
    expect(overlay).toContain("onPointerDownOutside: blockParentDismiss");
    expect(overlay).toContain("onInteractOutside: blockParentDismiss");
    expect(overlay).toContain("hasNestedReservationLayer");
    expect(overlay).toContain("dataset.testid !== WORKSPACE_OVERLAY_TEST_ID");
    expect(overlay).toContain("if (!next && hasNestedReservationLayer()) return;");
    expect(detail).toContain('data-testid="amend-stay-dialog"');
    expect(detail).toContain("z-[70]");
    expect(workspace).toContain("reservation-desk-more-filters");
  });
});
