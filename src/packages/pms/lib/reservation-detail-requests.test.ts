import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { GuestServiceHistoryItem } from "@/packages/pms/lib/guests.functions";
import {
  filterServiceRequests,
  guestProfilePreferenceChips,
  requestHistoryEvents,
  reservationPreferenceChips,
  reservationServiceRequests,
  roomPreferenceChips,
  vipSpecialChips,
} from "@/packages/pms/lib/reservation-detail-requests";

const requestsUi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-requests.tsx"),
  "utf8",
);
const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservation-detail-workspace.tsx"),
  "utf8",
);

const item = (
  partial: Partial<GuestServiceHistoryItem> & Pick<GuestServiceHistoryItem, "id">,
): GuestServiceHistoryItem => ({
  requestNumber: null,
  serviceTypeId: "type-1",
  serviceName: "Airport Pickup",
  serviceActive: true,
  status: "requested",
  requestedAt: "2026-09-22T10:15:00Z",
  preferredAt: "2026-09-22T11:30:00Z",
  completedAt: null,
  cancelledAt: null,
  reservationId: "res-1",
  confirmationNumber: "NR-000245",
  roomNumber: null,
  notes: "Airport Pickup",
  priority: "high",
  amount: null,
  currency: null,
  requestedByName: "Abebaw",
  assignedMembershipId: null,
  assignedName: "Front Office",
  ...partial,
});

describe("Reservation Detail Requests & Preferences tab", () => {
  it("wires the Requests workspace and keeps Notes & Traces on notes", () => {
    expect(workspace).toContain("<ReservationDetailRequestsTab");
    expect(workspace).toContain('detailTab === "requests"');
    expect(workspace).toContain('onBackToFolio={() => setDetailTab("folio")}');
    expect(workspace).toContain('detailTab === "notes"');
    expect(workspace).not.toContain('detailTab === "requests" || detailTab === "notes"');
    expect(requestsUi).toContain("listGuestServiceWorkspace");
    expect(requestsUi).toContain("createGuestServiceRequest");
    expect(requestsUi).toContain("updateGuestServiceRequest");
    expect(requestsUi).toContain("guestProfilePreferenceChips");
    expect(requestsUi).toContain('search={{ card: "preferences" }}');
    expect(requestsUi).toContain("Back to Folio & Payments");
  });

  it("keeps guest profile chips separate from stay special requests", () => {
    const profile = guestProfilePreferenceChips({
      roomPreference: "King",
      bedPreference: null,
      floorPreference: "High",
      viewPreference: null,
      foodPreference: null,
      communicationPreference: null,
      accessibilityRequirements: null,
      specialRequests: "Quiet please",
      smokingAllowed: false,
    });
    expect(profile.map((chip) => chip.label).join(" ")).toMatch(
      /Floor|King|Non-smoking|Quiet please/,
    );
    const stay = reservationPreferenceChips("High Floor\nLate Check-In");
    expect(stay.some((chip) => chip.label === "High Floor")).toBe(true);
    expect(stay.some((chip) => chip.label === "Late Check-In")).toBe(true);
    expect(
      roomPreferenceChips("High Floor\nLate Check-In").some(
        (chip) => chip.label === "Late Check-In",
      ),
    ).toBe(false);
    expect(
      vipSpecialChips({ guestVip: true, specialRequests: "Early Check-In" }).map(
        (chip) => chip.label,
      ),
    ).toEqual(["VIP", "Early Check-In"]);
  });

  it("filters this reservation's service requests and only lists real history timestamps", () => {
    const rows = [
      item({ id: "a", reservationId: "res-1" }),
      item({ id: "b", reservationId: "res-2", serviceName: "Spa" }),
      item({
        id: "c",
        reservationId: "res-1",
        status: "completed",
        completedAt: "2026-09-22T12:00:00Z",
        serviceName: "Towels",
      }),
    ];
    const stay = reservationServiceRequests(rows, "res-1");
    expect(stay.map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterServiceRequests(stay, { status: "completed", search: "" })).toHaveLength(1);
    const events = requestHistoryEvents(stay, []);
    expect(events.some((event) => event.text.includes("Airport Pickup request created"))).toBe(
      true,
    );
    expect(events.some((event) => event.text.includes("Towels completed"))).toBe(true);
    expect(events.every((event) => event.at)).toBe(true);
    expect(requestsUi).toContain("amendReservation");
    expect(requestsUi).not.toContain("Anniversary celebration");
  });
});
