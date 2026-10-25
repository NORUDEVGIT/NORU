import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { headerGroupBlockIdFromUnits } from "./groups";
import {
  GROUP_ONLY_BLOCK_LABEL,
  defaultBlockIdForUnit,
  eligibleBlocksForUnit,
  headerBlockIdForCreate,
  noActiveAllotmentCopy,
  stayFitsBlockDates,
  unitBlockReviewCopy,
  type GroupPrelinkBlock,
} from "./groups-reservation-prelink";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const twin: GroupPrelinkBlock = {
  id: "block-twin",
  roomTypeId: "twin",
  roomTypeName: "Twin",
  startDate: "2026-11-01",
  endDate: "2026-11-08",
  status: "active",
  totals: { allotted: 10, pickedUp: 4, remaining: 6 },
};

const suite: GroupPrelinkBlock = {
  id: "block-suite",
  roomTypeId: "suite",
  roomTypeName: "Suite",
  startDate: "2026-11-01",
  endDate: "2026-11-08",
  status: "active",
  totals: { allotted: 3, pickedUp: 1, remaining: 2 },
};

const released: GroupPrelinkBlock = {
  ...twin,
  id: "block-released",
  status: "released",
};

describe("GB07 prelinked group reservation helpers", () => {
  it("keeps released blocks out of pickup options", () => {
    expect(
      eligibleBlocksForUnit({
        blocks: [twin, released],
        roomTypeId: "twin",
        arrival: "2026-11-01",
        departure: "2026-11-08",
      }).map((block) => block.id),
    ).toEqual(["block-twin"]);
  });

  it("defaults the launch block only when the unit room type matches", () => {
    expect(
      defaultBlockIdForUnit({
        blocks: [twin, suite],
        roomTypeId: "twin",
        arrival: "2026-11-01",
        departure: "2026-11-08",
        preferredBlockId: "block-twin",
      }),
    ).toBe("block-twin");
    expect(
      defaultBlockIdForUnit({
        blocks: [twin, suite],
        roomTypeId: "suite",
        arrival: "2026-11-01",
        departure: "2026-11-08",
        preferredBlockId: "block-twin",
      }),
    ).toBeNull();
  });

  it("exposes block date constraints and rejects stay outside the block", () => {
    expect(stayFitsBlockDates("2026-11-01", "2026-11-08", twin)).toBe(true);
    expect(stayFitsBlockDates("2026-10-01", "2026-10-03", twin)).toBe(false);
  });

  it("keeps mixed unit block ids and leaves header semantics to the server helper", () => {
    expect(headerBlockIdForCreate(["block-twin", "block-twin"])).toBe("block-twin");
    expect(headerBlockIdForCreate(["block-twin", "block-suite"])).toBeNull();
    expect(headerBlockIdForCreate(["block-twin", null])).toBeNull();
    expect(headerBlockIdForCreate(["block-twin", "block-suite"])).toBe(
      headerGroupBlockIdFromUnits(["block-twin", "block-suite"]),
    );
  });

  it("labels group-only units as general inventory with no pickup", () => {
    expect(
      unitBlockReviewCopy({
        roomTypeName: "Twin",
        blockLabel: null,
        contributesToPickup: false,
      }),
    ).toEqual({ block: GROUP_ONLY_BLOCK_LABEL, pickup: "No" });
    expect(noActiveAllotmentCopy(false)).toMatch(/general inventory/i);
  });
});

describe("GB07 workspace wiring", () => {
  const detailUi = source("src/packages/pms/components/reservations/group-detail-workspace.tsx");
  const listUi = source("src/packages/pms/components/reservations/groups-workspace.tsx");
  const workspace = source("src/packages/pms/components/workspaces/reservations-workspace.tsx");
  const page = source("src/packages/pms/components/bookings/create-reservation-page.tsx");
  const details = source(
    "src/packages/pms/components/bookings/create-reservation-booking-details.tsx",
  );
  const review = source("src/packages/pms/components/bookings/create-reservation-review.tsx");
  const confirmation = source(
    "src/packages/pms/components/bookings/create-reservation-confirmation.tsx",
  );
  const functions = source("src/packages/pms/lib/reservations.functions.ts");

  it("opens New Reservation from Group Detail without routing", () => {
    expect(detailUi).toContain('data-testid="group-detail-create-reservation"');
    expect(detailUi).toContain("onCreateStay(group.id, null)");
    expect(detailUi).toContain('data-testid="group-detail-block-create-reservation"');
    expect(detailUi).toContain("onCreateStay(group.id, block.id)");
    expect(detailUi).not.toContain("/restaurant/bookings/new");
    expect(listUi).not.toContain("/restaurant/bookings/new");
    expect(listUi).toContain("createStayActive");
    expect(workspace).toContain(
      "setCreateGroupLink({ pmsGroupId: groupId, pmsGroupBlockId: blockId })",
    );
    expect(workspace).toContain('setOverlay({ type: "new-reservation" })');
    expect(workspace).toContain(
      'returnToLabel={createGroupLink ? "Return to Group" : returnToLabel}',
    );
    expect(page).toContain('setReservationMode("group")');
    expect(page).toContain("setLinkedGroupId(pmsGroupId)");
  });

  it("prelinks group-only or a specific active block and restores Group Detail", () => {
    expect(detailUi).toContain('block.status === "active"');
    expect(page).toContain("setLinkedBlockId(pmsGroupBlockId)");
    expect(page).toContain("CreateReservationGroupContext");
    expect(page).toContain("CreateReservationUnitBlockSelect");
    expect(page).toContain("lockOperationalGroup");
    expect(details).toContain("lockOperationalGroup");
    expect(details).not.toContain("group_account_master_id");
    expect(workspace).toContain(
      'createStayActive={overlay?.type === "new-reservation" && Boolean(createGroupLink)}',
    );
    expect(listUi).toContain("open={Boolean(selectedId) && !newOpen && !createStayActive}");
  });

  it("sends per-unit blocks through existing createReservation", () => {
    expect(page).toContain("pmsGroupBlockId: unit.pmsGroupBlockId ?? null");
    expect(page).toContain("headerBlockIdForCreate");
    expect(page).toContain("submitReservation");
    expect(page).not.toContain('.from("hotel_reservation_rooms")');
    expect(page).not.toContain('.from("pms_groups")');
    expect(functions).toContain("export const createReservation");
    expect(functions).toContain("assertGroupUnitsPickup");
    expect(workspace).toContain('queryKey: ["pms-group-operational", restaurantId]');
    expect(review).toContain("review-group-units");
    expect(confirmation).toContain("confirmation-linked-group");
    expect(page).toContain("setRatePlanId((current) => current || planId)");
    expect(page).not.toContain("negotiated");
    expect(details).toContain("It is not copied onto the reservation");
  });

  it("does not force group mode on the desk New Reservation path", () => {
    expect(workspace).toContain("setCreateGroupLink(null)");
    expect(page).toContain("if (!draftReady || !pmsGroupId) return");
    expect(details).toContain('data-testid="change-group"');
  });
});
