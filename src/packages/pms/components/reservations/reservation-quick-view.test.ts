import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const component = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/reservations/reservation-quick-view.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
  "utf8",
);

describe("UI-02 Reservation Quick View", () => {
  it("renders a compact header with real status, guest identity and VIP state", () => {
    expect(component).toContain("row.confirmationNumber");
    expect(component).toContain("quickView?.identity.vip ?? row.guestVip");
    expect(component).toContain("<VipBadge");
    expect(component).toContain("<ReservationStatusBadge");
    expect(component).not.toContain("Guaranteed");
    expect(component).not.toContain("Tentative");
  });

  it("implements the four requested interactive tabs", () => {
    for (const [id, label] of [
      ["overview", "Overview"],
      ["guest", "Guest"],
      ["stay", "Stay Details"],
      ["notes", "Notes"],
    ]) {
      expect(component).toContain(`id: "${id}", label: "${label}"`);
    }
    expect(component).toContain("onClick={() => setTab(item.id)}");
    expect(component).toContain('role="tabpanel"');
  });

  it("renders Overview from only the Quick View DTO", () => {
    for (const section of ["Stay Summary", "Room", "Commercial", "Financial", "Operational"]) {
      expect(component).toContain(`title="${section}"`);
    }
    expect(component).toContain("quickView.room.operationalStatus");
    expect(component).toContain("quickView.room.housekeepingStatus");
    expect(component).toContain("quickView.commercial.commercialBookingSource");
    expect(component).toContain("quickView.operational.lastHistoryEvent");
  });

  it("renders null-safe Guest, Stay Details and Notes content", () => {
    expect(component).toContain("quickView.identity.company?.name");
    expect(component).toContain("quickView.identity.travelAgent?.name");
    expect(component).toContain("quickView.identity.group?.name");
    expect(component).toContain('value={quickView.room.assigned ? "Assigned" : "Unassigned"}');
    expect(component).toContain("No reservation notes");
    expect(component).toContain(
      'return value === null || value === undefined || value === "" ? "—"',
    );
  });

  it("handles all financial capability states without inventing zero balance", () => {
    expect(component).toContain('quickView.financial.state === "permission_denied"');
    expect(component).toContain("Financial details unavailable.");
    expect(component).toContain('quickView.financial.state === "not_available"');
    expect(component).toContain("Financial signal is not available.");
    expect(component).toContain("No folio is available for this reservation.");
    expect(component).not.toContain("balance ?? 0");
  });

  it("shows readable exception labels instead of raw keys", () => {
    expect(component).toContain('room_unavailable: "Room unavailable"');
    expect(component).toContain('room_not_ready: "Room not ready"');
    expect(component).toContain('missing_rate_snapshot: "Missing rate snapshot"');
    expect(component).toContain('overdue_departure: "Overstay"');
    expect(component).toContain("EXCEPTION_LABELS[key]");
  });

  it("gates actions with Quick View hints and uses canonical routes", () => {
    expect(component).toContain("hints: quickView?.actionHints ?? row.hints");
    expect(component).toContain("getReservationContextActions(actionContext)");
    expect(component).toContain("state: quickView.financial.state");
    expect(component).toContain("folioId: quickView.financial.folioId");
    expect(workspace).toContain('setOverlay({ type: "reservation-detail", reservationId: id })');
    expect(workspace).not.toContain('to: "/restaurant/cashiering/folios/$folioId"');
  });

  it("keeps selection context through loading, errors and the no-selection state", () => {
    expect(component).toContain("<QuickViewSkeleton");
    expect(component).toContain("Could not load Quick View.");
    expect(component).toContain("onRetry={onRetry}");
    expect(component).toContain("Select a reservation to view details");
    expect(component).toContain(
      "Quick View shows stay, room, commercial and operational information.",
    );
  });

  it("remains lazy, responsive and introduces no additional read path", () => {
    expect(workspace).toContain("enabled: selectedId !== null");
    expect(workspace).toContain("<Sheet");
    expect(workspace).toContain("<ReservationQuickViewPanel");
    expect(component).not.toContain("useQuery");
    expect(component).not.toContain("useServerFn");
    expect(component).not.toContain('from("');
  });
});
