import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = source("src/packages/pms/components/workspaces/arrivals-departures-workspace.tsx");
const dialogs = source("src/packages/pms/components/workspaces/arrivals-departures-dialogs.tsx");
const parent = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");

describe("Phase 8B Arrivals & Departures workspace", () => {
  it("mounts from the Reservations tab and uses the Phase 8A snapshot", () => {
    expect(parent).toContain("ArrivalsDeparturesWorkspace");
    expect(parent).toContain('goWorkspaceSection("arrivals-departures")');
    expect(parent).toContain('tab: tabFromWorkspaceSection(section)');
    expect(workspace).toContain("getReservationArrivalsDepartures");
    expect(workspace).toContain('data-testid="arrivals-departures-workspace"');
    expect(workspace).not.toContain("checkInReservation(");
    expect(workspace).not.toContain("checkOutReservation(");
    expect(workspace).not.toContain("amendReservation(");
    expect(workspace).not.toContain("changeStayDates(");
  });

  it("renders daily control counts and omits unsupported checked-in/out zeros", () => {
    expect(workspace).toContain('label: "Arrivals"');
    expect(workspace).toContain('label: "Departures"');
    expect(workspace).toContain('label: "Unassigned Arrivals"');
    expect(workspace).toContain('label: "Not Ready"');
    expect(workspace).toContain('label: "Overstays"');
    expect(workspace).toContain('label: "Financial Issues"');
    expect(workspace).not.toContain("Checked In Today");
    expect(workspace).not.toContain("Checked Out Today");
    expect(workspace).not.toContain("checkedInToday:");
  });

  it("shows arrival and departure exception badges from backend keys only", () => {
    expect(workspace).toContain("unassigned: \"Unassigned\"");
    expect(workspace).toContain("room_not_ready: \"Room not ready\"");
    expect(workspace).toContain("room_unavailable: \"Room unavailable\"");
    expect(workspace).toContain("payment_issue: \"Payment issue\"");
    expect(workspace).toContain("special_request: \"Special request\"");
    expect(workspace).toContain("overstay: \"Overstay\"");
    expect(workspace).not.toContain("missing guarantee");
    expect(workspace).not.toContain("guest contact issue");
  });

  it("opens Quick View and launches canonical FO writers", () => {
    expect(workspace).toContain('data-testid="arrival-quick-view"');
    expect(workspace).toContain('data-testid="departure-quick-view"');
    expect(workspace).toContain("AssignRoomDialog");
    expect(workspace).toContain("CheckInDialog");
    expect(workspace).toContain("CheckOutDialog");
    expect(workspace).toContain("StayDatesDialog");
    expect(workspace).toContain("Open Reservation");
    expect(workspace).toContain("Extend Stay");
    expect(workspace).toContain("Grant Late Checkout");
    expect(workspace).toContain("History");
  });

  it("wires ETA, bulk ETA and late checkout to Phase 8A writers", () => {
    expect(dialogs).toContain("setExpectedArrivalTime");
    expect(dialogs).toContain("bulkSetExpectedArrivalTime");
    expect(dialogs).toContain("setLateCheckout");
    expect(dialogs).toContain("Bulk expected arrival");
    expect(dialogs).toContain("result.failed");
    expect(dialogs).toContain("This is same-day only");
    expect(dialogs).not.toContain("checkInReservation");
  });

  it("keeps the mobile Quick View Sheet inactive on desktop", () => {
    expect(workspace).toContain('open={!desktop && mobileOpen && selectedId !== null}');
    expect(workspace).toContain("xl:hidden");
    expect(workspace).toContain("matchMedia(\"(min-width: 1280px)\")");
  });
});
