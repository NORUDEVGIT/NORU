import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { GUEST_ACCOUNT_EVENT_TYPES } from "./guest-profile-wave4.ts";
import { TOUR_OPERATOR_UNAVAILABLE } from "./guest-profile-listing.ts";
import {
  GROUP_AUTO_ASSIGN_COPY,
  GROUP_DETAIL_MIGRATION_FILE,
  GROUP_DETAIL_NAV,
  GROUP_DETAIL_NAV_IDS,
  GROUP_FINANCIAL_COPY,
  GROUP_IMPORT_RESULTS,
  GROUP_INVOICE_UNAVAILABLE,
  GROUP_ROOMING_COPY,
  GROUP_STATUS_LABELS,
  GROUP_TEMPLATES_UNAVAILABLE,
  assignmentStatus,
  canConfirmGroup,
  generateGroupCode,
  groupDetailNav,
  groupImportResultCounts,
  groupOverviewKpis,
  groupStatusLabel,
  validateGroupDates,
} from "./guest-group-detail-workspace.ts";
import { getGroupInvoices, summarizeGroupFinancials } from "./guest-group-financials.ts";
import { roomInventoryAutoAssignment } from "./guest-group-auto-assignment.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Group workspace helpers", () => {
  it("exposes operational nav without inventing isolated domains", () => {
    assert.deepEqual(
      GROUP_DETAIL_NAV.map((item) => item.id),
      ["overview", "members", "reservations", "rooming", "itinerary", "financial", "communication", "documents", "history"],
    );
    assert.equal(GROUP_DETAIL_NAV.every((item) => item.live), true);
    assert.equal(groupDetailNav("rooming"), "rooming");
    assert.equal(groupDetailNav("unknown"), "overview");
    assert.deepEqual([...GROUP_DETAIL_NAV_IDS], GROUP_DETAIL_NAV.map((item) => item.id));
  });

  it("maps account_status to draft / confirmed / cancelled", () => {
    assert.equal(GROUP_STATUS_LABELS.pending, "Draft");
    assert.equal(GROUP_STATUS_LABELS.active, "Confirmed");
    assert.equal(GROUP_STATUS_LABELS.inactive, "Cancelled");
    assert.equal(groupStatusLabel("pending"), "Draft");
  });

  it("generates GRP codes and validates confirm rules", () => {
    assert.match(generateGroupCode("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), /^GRP-aaaaaaaa$/);
    assert.equal(validateGroupDates("2026-09-01", "2026-09-03"), null);
    assert.match(validateGroupDates("2026-09-03", "2026-09-01") ?? "", /after arrival/);
    assert.match(canConfirmGroup({ name: "", groupTypeId: "t", arrivalDate: "2026-09-01", departureDate: "2026-09-03" }) ?? "", /name/);
    assert.equal(
      canConfirmGroup({
        name: "Tour",
        groupTypeId: "11111111-1111-4111-8111-111111111111",
        arrivalDate: "2026-09-01",
        departureDate: "2026-09-03",
      }),
      null,
    );
  });

  it("derives rooming assignment from reservation room_id", () => {
    assert.equal(assignmentStatus("room-1"), "assigned");
    assert.equal(assignmentStatus(null), "unassigned");
    assert.match(GROUP_ROOMING_COPY, /derived/);
    assert.match(GROUP_ROOMING_COPY, /not a second assignment store/i);
  });

  it("never fakes auto-assignment success", async () => {
    assert.match(GROUP_AUTO_ASSIGN_COPY, /never faked/);
    const results = await roomInventoryAutoAssignment.propose({
      restaurantId: "r1",
      needs: [
        {
          reservationId: "res-1",
          roomTypeId: "type-1",
          arrival: "2026-09-01",
          departure: "2026-09-03",
          adults: 2,
          children: 0,
          currentRoomId: null,
          preferenceNote: null,
        },
      ],
      inventory: {
        listAssignableRooms: async () => [],
      },
    });
    assert.equal(results[0]?.assigned, false);
    assert.match(results[0]?.reason ?? "", /No available room/);
  });

  it("derives financials and keeps invoices as a placeholder", () => {
    const summary = summarizeGroupFinancials(
      [
        { amount: 100, folioStatus: "open", transactionType: "charge" },
        { amount: -40, folioStatus: "open", transactionType: "payment" },
      ],
      [90],
    );
    assert.equal(summary.estimatedRevenue, 90);
    assert.equal(summary.totalCharges, 100);
    assert.equal(summary.totalPayments, 40);
    assert.equal(summary.outstandingBalance, 60);
    assert.deepEqual(getGroupInvoices().invoices, []);
    assert.equal(getGroupInvoices().reason, GROUP_INVOICE_UNAVAILABLE);
    assert.match(GROUP_FINANCIAL_COPY, /derived/);
  });

  it("labels import results and keeps tour-operator as a listing placeholder", () => {
    assert.deepEqual([...GROUP_IMPORT_RESULTS], ["imported", "matched", "created", "duplicate", "failed"]);
    const counts = groupImportResultCounts([
      { result: "matched" },
      { result: "created" },
      { result: "duplicate" },
      { result: "failed" },
    ]);
    assert.equal(counts.matched, 1);
    assert.equal(counts.created, 1);
    assert.equal(counts.duplicate, 1);
    assert.equal(TOUR_OPERATOR_UNAVAILABLE.includes("Travel Agencies"), true);
    assert.match(GROUP_TEMPLATES_UNAVAILABLE, /not a Phase 1 domain/);
  });

  it("reuses the Wave 4 group master and reservation FK", () => {
    const migration = readRel("../../../../supabase/migrations/0096_pms_group_workspace.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0096_pms_group_workspace.sql");
    const functions = readRel("./guest-group-detail.functions.ts");
    const workspace = readRel("../components/workspaces/guest-group-detail-workspace.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.equal(migration, drizzle);
    assert.equal(GROUP_DETAIL_MIGRATION_FILE, "0096_pms_group_workspace.sql");
    assert.match(migration, /account_type = 'group'/);
    assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.pms_groups\b/);
    assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS public\.group_rooming/);
    assert.match(functions, /group_account_master_id/);
    assert.match(functions, /guest_account_links/);
    assert.match(functions, /listAssignableRooms/);
    assert.match(functions, /assignReservationRoom/);
    assert.match(workspace, /GuestGroupDetailWorkspace/);
    assert.match(shell, /operationalType === "group"/);
    assert.match(page, /groupAccountMasterId/);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("member_imported"), true);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("room_assigned"), true);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("auto_assignment_failed"), true);
  });

  it("computes overview KPIs from real member and reservation counts", () => {
    const kpis = groupOverviewKpis({
      memberCount: 4,
      reservationCount: 3,
      assignedRooms: 1,
      expectedPax: 8,
      expectedRooms: 3,
    });
    assert.equal(kpis.members, 4);
    assert.equal(kpis.reservations, 3);
    assert.equal(kpis.assignedRooms, 1);
  });
});
