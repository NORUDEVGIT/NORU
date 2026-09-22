import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { mapReservationToStay, type GuestStay } from "./guest-profile-wave3.ts";
import {
  GUEST_SERVICES_WORKSPACE_MIGRATION_FILE,
  canTransitionGuestService,
  filterGuestServices,
  guestServiceCounts,
  guestServiceRowActions,
  popularServiceTypes,
} from "./guest-services-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function stay(
  partial: Partial<GuestStay> &
    Pick<GuestStay, "id" | "confirmationNumber" | "arrivalDate" | "departureDate" | "status">,
): GuestStay {
  return mapReservationToStay({
    roomTypeName: "Deluxe",
    ...partial,
  });
}

describe("Guest services workspace helpers", () => {
  const current = stay({
    id: "res-in",
    confirmationNumber: "ST-1",
    arrivalDate: "2026-09-20",
    departureDate: "2026-09-22",
    status: "checked_in",
    roomNumber: "204",
  });
  const future = stay({
    id: "res-up",
    confirmationNumber: "ST-2",
    arrivalDate: "2026-10-01",
    departureDate: "2026-10-03",
    status: "confirmed",
  });
  const rows = [
    {
      requestNumber: "GS-000001",
      serviceName: "Turndown",
      notes: "Extra pillows",
      assignedName: "Ada",
      roomNumber: "204",
      confirmationNumber: "ST-1",
      status: "requested",
      reservationId: "res-in",
      serviceTypeId: "type-a",
    },
    {
      requestNumber: "GS-000002",
      serviceName: "Late checkout",
      notes: null,
      assignedName: null,
      roomNumber: null,
      confirmationNumber: null,
      status: "completed",
      reservationId: null,
      serviceTypeId: "type-b",
    },
  ];

  it("filters by stay scope, status, and search", () => {
    const stays = [current, future];
    assert.equal(
      filterGuestServices(rows, stays, {
        search: "",
        status: "all",
        stayScope: "general",
        today: "2026-09-21",
      }).length,
      1,
    );
    assert.equal(
      filterGuestServices(rows, stays, {
        search: "gs-000001",
        status: "requested",
        stayScope: "current",
        today: "2026-09-21",
      })[0]?.requestNumber,
      "GS-000001",
    );
  });

  it("counts real statuses and blocks invalid transitions", () => {
    const counts = guestServiceCounts(rows);
    assert.equal(counts.all, 2);
    assert.equal(counts.requested, 1);
    assert.equal(counts.completed, 1);
    assert.equal(canTransitionGuestService("requested", "in_progress"), true);
    assert.equal(canTransitionGuestService("requested", "completed"), false);
    assert.equal(canTransitionGuestService("completed", "cancelled"), false);
    const pending = guestServiceRowActions("requested");
    assert.equal(pending.start, true);
    assert.equal(pending.complete, false);
    assert.equal(guestServiceRowActions("completed").cancel, false);
  });

  it("ranks popular types from real request counts and keeps inactive used types", () => {
    const popular = popularServiceTypes(rows, [
      { id: "type-a", name: "Turndown", active: false },
      { id: "type-b", name: "Late checkout", active: true },
      { id: "type-c", name: "Unused", active: true },
    ]);
    const inactiveUsed = popular.find((row) => row.id === "type-a");
    assert.equal(inactiveUsed?.count, 1);
    assert.equal(inactiveUsed?.active, false);
    assert.equal(popular.find((row) => row.id === "type-c")?.count, 0);
  });
});

describe("Guest services workspace honesty", () => {
  it("uses Card 4 types and guest_service_history, not a second catalogue or fake types", () => {
    const functions = readRel("./guests.functions.ts");
    const card = readRel("../components/guests/guest-service-history-card.tsx");
    const helpers = readRel("./guest-services-workspace.ts");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(functions, /export const listGuestServiceWorkspace/);
    assert.match(functions, /export const createGuestServiceRequest/);
    assert.match(functions, /export const updateGuestServiceRequest/);
    assert.match(functions, /from\("guest_service_history"\)/);
    assert.match(functions, /from\("pms_guest_service_types"\)/);
    assert.match(functions, /next_guest_service_number/);
    assert.match(functions, /service_request_created/);
    assert.doesNotMatch(functions, /from\("pms_guest_request_types"\)/);
    assert.doesNotMatch(card, /Recent Activity/);
    assert.doesNotMatch(card, /Room Service|Airport Pickup|Wake-up Call/);
    assert.match(card, /GUEST_SERVICES_NO_TYPES|Guest Service Types/);
    assert.match(card, /window.print/);
    assert.match(card, /openNote/);
    assert.match(card, /New Service Request/);
    assert.match(helpers, /Configure active Guest Service Types/);
    assert.match(shell, /GuestServiceHistoryCard/);
    assert.match(shell, /onOpenBookings/);
  });

  it("keeps dual-lane 0089 migrations equal", () => {
    const supabase = readRel("../../../../supabase/migrations/0089_pms_guest_services_workspace.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0089_pms_guest_services_workspace.sql");
    assert.equal(GUEST_SERVICES_WORKSPACE_MIGRATION_FILE, "0089_pms_guest_services_workspace.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /request_number/);
    assert.match(supabase, /assigned_membership_id/);
    assert.match(supabase, /service_request_created/);
  });
});
