import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { walkInCreateDefaults } from "@/packages/pms/lib/walk-in-reservation-context";

const workspace = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/front-office-workspace.tsx"),
  "utf8",
);
const reservations = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/reservations-workspace.tsx"),
  "utf8",
);
const createPage = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-page.tsx"),
  "utf8",
);
const reservationsApi = readFileSync(
  resolve(process.cwd(), "src/packages/pms/lib/reservations.functions.ts"),
  "utf8",
);
const confirmation = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/bookings/create-reservation-confirmation.tsx"),
  "utf8",
);
const frames = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/frontoffice/front-office-frames.tsx"),
  "utf8",
);
const walkInsDesk = readFileSync(
  resolve(process.cwd(), "src/packages/pms/components/workspaces/walk-ins-workspace.tsx"),
  "utf8",
);

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to === -1 ? undefined : to);
}

describe("Front Office Walk-In overlay", () => {
  it("opens the shared reservation overlay from the quick action and the room rack", () => {
    expect(workspace).toContain('if (actionId === "walk_in")');
    expect(workspace).toContain("openWalkInCreate()");
    expect(workspace).toContain("onWalkIn={() => openWalkInCreate()}");
    expect(workspace).toContain("<ReservationWorkspaceOverlay");
    expect(workspace).toContain("<CreateReservationPage");
    expect(workspace).toContain('mode="walk-in"');
    expect(workspace).toContain("businessDate={today}");
    expect(workspace).toContain("usePropertyBusinessDate");
    expect(workspace).not.toContain("WalkInDialog");
    expect(workspace).not.toContain("setWalkIn");
    expect(workspace).not.toContain("startWalkInCheckIn");
    expect(workspace).not.toContain("initialCreate");
    expect(workspace).not.toContain("create_walk_in_reservation");
    expect(workspace).not.toContain("createWalkInReservation");
    expect(workspace).not.toContain("postCreateReservationMoney");
    expect(workspace).not.toContain("open_folio_for_reservation");
  });

  it("does not send Walk-In through the legacy new-reservation route", () => {
    const quick = between(
      workspace,
      'if (actionId === "walk_in")',
      'if (actionId === "guest_search")',
    );
    expect(quick).toContain("openWalkInCreate()");
    expect(quick).not.toContain("/restaurant/bookings/new");
    expect(workspace).toContain('to: "/restaurant/bookings/new"');
    const newReservation = between(
      workspace,
      'if (actionId === "new_reservation")',
      'if (actionId === "walk_in")',
    );
    expect(newReservation).toContain('to: "/restaurant/bookings/new"');
  });

  it("closes back to Front Office without persisting the overlay", () => {
    expect(workspace).toContain("useState<ReservationWorkspaceOverlayState>(null)");
    expect(workspace).toContain("function closeReservationOverlay()");
    expect(workspace).toContain("setReservationOverlay(null)");
    expect(workspace).toContain("onCancel={closeReservationOverlay}");
    expect(workspace).toContain("onReturnToDesk={closeReservationOverlay}");
    expect(workspace).toContain('returnToLabel="Return to Front Office"');
    const close = between(
      workspace,
      "function closeReservationOverlay()",
      "function onQuickAction",
    );
    expect(close).not.toContain("navigate(");
  });

  it("sends the walk-ins desk through the same create page and continues into check-in", () => {
    expect(walkInsDesk).not.toContain("WalkInDialog");
    expect(walkInsDesk).toContain("onCreateWalkIn");
    expect(walkInsDesk).toContain("<CheckInDialog");
    expect(workspace).toContain("onCreateWalkIn={openWalkInCreate}");
    expect(workspace).toContain("onContinueToCheckIn");
    expect(workspace).toContain('openDialog("checkin"');
    expect(workspace).not.toContain("startWalkInCheckIn");
    expect(createPage).toContain("startWalkInCheckIn");
    expect(createPage).toContain("if (walkInMode)");
    expect(confirmation).toContain('data-testid="fo-walk-in-continue-check-in"');
    expect(confirmation).toContain("Continue to Check-In");
    expect(frames).not.toContain("function WalkInsFrame");
    expect(frames).not.toContain("WalkInDialog");
  });
});

describe("Walk-In create context", () => {
  it("seeds business date, one night, confirmed status, and the technical source", () => {
    expect(walkInCreateDefaults("2026-10-20")).toEqual({
      arrival: "2026-10-20",
      departure: "2026-10-21",
      adults: 1,
      children: 0,
      status: "confirmed",
      source: "walk_in",
    });
    expect(createPage).toContain('mode = "standard"');
    expect(createPage).toContain("const today = propertyToday(timezone)");
    expect(createPage).toContain("useState(today)");
    expect(createPage).toContain('useState<"pending" | "confirmed">("pending")');
    expect(createPage).toContain("walkInCreateDefaults(businessDate)");
    expect(createPage).toContain("walkInCreateDefaults(businessDate || today).status");
    expect(createPage).toContain(
      "...(walkInMode ? { source: walkInCreateDefaults(businessDate || arrival).source } : {})",
    );
    expect(createPage).toContain("if (walkInMode)");
    expect(createPage).toContain("readCreateReservationDraft");
    expect(createPage).not.toContain("WalkInDialog");
    expect(createPage).not.toContain("create_walk_in_reservation");
  });

  it("keeps guest, room, rate, and payment on the existing create workflow", () => {
    expect(createPage).toContain("CreateReservationGuest");
    expect(createPage).toContain("listAssignableRooms");
    expect(createPage).toContain("quoteStay");
    expect(createPage).toContain("createReservation");
    expect(createPage).toContain("commercialBookingSource: channelForm.commercialBookingSource");
    expect(createPage).toContain("roomId: roomId === UNASSIGNED ? null : roomId");
    expect(reservationsApi).toContain('rpc("create_hotel_reservation_priced"');
    expect(reservationsApi).toContain('if (data.source === "walk_in")');
    expect(reservationsApi).not.toContain("create_walk_in_reservation");
  });

  it("does not apply walk-in defaults on the Reservations desk", () => {
    expect(reservations).toContain('setOverlay({ type: "new-reservation" })');
    expect(reservations).toContain("<CreateReservationPage");
    const createBlock = between(reservations, "<CreateReservationPage", "/>");
    expect(createBlock).not.toContain('mode="walk-in"');
    expect(createBlock).not.toContain("businessDate=");
    expect(reservations).not.toContain("walkInCreateDefaults");
  });
});
