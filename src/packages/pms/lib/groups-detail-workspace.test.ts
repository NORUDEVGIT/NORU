import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { GroupBlockRead } from "./groups.functions";
import {
  GROUP_DETAIL_EMPTY,
  GROUP_DETAIL_TABS,
  GROUP_HISTORY_EVENT_LABELS,
  groupDetailSummary,
  groupHistoryDetails,
  groupHistoryEventLabel,
  groupLinkedUnitRows,
  groupPickupRows,
  looksLikeUuid,
  pickupPercent,
} from "./groups-detail-workspace";
import type { GroupOperationalUnit } from "./groups-operational-detail";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const listUi = source("src/packages/pms/components/reservations/groups-workspace.tsx");
const detailUi = source("src/packages/pms/components/reservations/group-detail-workspace.tsx");
const groupsFunctions = source("src/packages/pms/lib/groups.functions.ts");

function block(
  partial: Partial<GroupBlockRead> & Pick<GroupBlockRead, "id" | "roomTypeName">,
): GroupBlockRead {
  return {
    roomTypeId: "rt-1",
    startDate: "2026-11-01",
    endDate: "2026-11-08",
    allotted: 10,
    cutoffDate: "2026-10-31",
    status: "active",
    nights: [],
    totals: { allotted: 10, pickedUp: 4, remaining: 6 },
    ...partial,
  };
}

describe("GB06 Group Detail Workspace", () => {
  it("opens the Group Detail Workspace from a list row without routing", () => {
    expect(listUi).toContain('data-testid="groups-row"');
    expect(listUi).toContain("onClick={() => setSelectedId(row.id)}");
    expect(listUi).toContain("<GroupDetailWorkspace");
    expect(listUi).toContain("open={Boolean(selectedId) && !newOpen}");
    expect(listUi).not.toContain("useNavigate");
    expect(listUi).not.toContain("@tanstack/react-router");
    expect(listUi).not.toContain('data-testid="group-quick-view"');
    expect(listUi).not.toContain("function GroupQuickView");
    expect(detailUi).toContain('data-testid="group-detail-workspace"');
    expect(detailUi).toContain("ReservationWorkspaceOverlay");
  });

  it("renders overview identity, selected-group KPIs, and amendGroup edit", () => {
    expect(detailUi).toContain('data-testid="group-detail-overview"');
    expect(detailUi).toContain("groupOverviewFields");
    expect(detailUi).toContain("groupDetailSummary");
    expect(detailUi).toContain('data-testid="group-detail-edit"');
    expect(detailUi).toContain("onAmend");
    expect(detailUi).not.toContain("Policies");
    expect(detailUi).not.toContain("Master Folio");
    expect(GROUP_DETAIL_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Allotment",
      "Pickup",
      "Rooming List",
      "Linked Reservations",
      "History",
    ]);
    const summary = groupDetailSummary(
      [
        block({
          id: "a",
          roomTypeName: "Deluxe King",
          totals: { allotted: 10, pickedUp: 4, remaining: 6 },
        }),
        block({
          id: "b",
          roomTypeName: "Suite",
          totals: { allotted: 3, pickedUp: 1, remaining: 2 },
        }),
      ],
      5,
    );
    expect(summary).toEqual({
      totalAllotment: 13,
      pickedUp: 5,
      remaining: 8,
      linkedReservations: 5,
    });
  });

  it("renders allotment blocks with pickup/remaining and existing add/release commands", () => {
    expect(detailUi).toContain('data-testid="group-detail-allotment"');
    expect(detailUi).toContain("block.totals.pickedUp");
    expect(detailUi).toContain("block.totals.remaining");
    expect(detailUi).toContain("onAddBlock");
    expect(detailUi).toContain("onRelease");
    expect(detailUi).toContain("groupBlockPreflightFromRules");
    expect(detailUi).toContain("validateAllotmentRow");
    expect(detailUi).not.toContain("negotiated");
    expect(detailUi).not.toContain("per-block rate");
    expect(detailUi).not.toMatch(/bulk convert/i);
  });

  it("shows unit-based pickup from block totals and mixed room types separately", () => {
    const units: GroupOperationalUnit[] = [
      {
        reservationId: "res-1",
        confirmationNumber: "RSV-1",
        reservationRoomId: "u-1",
        guestId: "g-1",
        guestName: "John Doe",
        roomId: null,
        roomNumber: null,
        roomTypeId: "twin",
        roomTypeName: "Twin",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-08",
        reservationStatus: "confirmed",
        unitStatus: "confirmed",
        blockId: "king",
        blockLabel: "Deluxe King",
        isGroupOnlyLink: false,
        contributesToPickup: true,
      },
      {
        reservationId: "res-1",
        confirmationNumber: "RSV-1",
        reservationRoomId: "u-2",
        guestId: "g-1",
        guestName: "John Doe",
        roomId: "room-12",
        roomNumber: "12",
        roomTypeId: "suite",
        roomTypeName: "Suite",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-08",
        reservationStatus: "confirmed",
        unitStatus: "confirmed",
        blockId: "suite",
        blockLabel: "Suite",
        isGroupOnlyLink: false,
        contributesToPickup: true,
      },
    ];
    const rows = groupPickupRows(
      [
        block({
          id: "king",
          roomTypeName: "Deluxe King",
          totals: { allotted: 10, pickedUp: 4, remaining: 6 },
        }),
        block({
          id: "suite",
          roomTypeName: "Suite",
          totals: { allotted: 3, pickedUp: 3, remaining: 0 },
        }),
      ],
      [
        ...units,
        ...Array.from({ length: 3 }, (_, index) => ({
          ...units[0]!,
          reservationRoomId: `king-${index}`,
        })),
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      roomTypeName: "Deluxe King",
      blocked: 10,
      pickedUp: 4,
      remaining: 6,
      reservationUnits: 4,
      pickupPercent: 40,
    });
    expect(rows[0]?.units).toHaveLength(4);
    expect(rows[1]?.units[0]?.blockId).toBe("suite");
    expect(pickupPercent(3, 3)).toBe(100);
    expect(detailUi).toContain("reservation room units, not reservation headers");
    expect(detailUi).toContain("groupPickupRows");
    expect(detailUi).toContain('data-testid="group-detail-pickup-unit"');
    expect(detailUi).toContain("getGroupOperationalDetail");
  });

  it("keeps rooming add/convert on existing commands and linked reservations without legacy routes", () => {
    expect(detailUi).toContain("onAddRooming");
    expect(detailUi).toContain("onConvert");
    expect(detailUi).toContain('data-testid="group-detail-open-reservation"');
    expect(detailUi).toContain('data-testid="group-detail-create-reservation"');
    expect(detailUi).toContain("onCreateStay");
    expect(detailUi).toContain("onOpenReservation(row.reservationId)");
    expect(detailUi).not.toContain("/restaurant/bookings/new");
    expect(listUi).not.toContain("/restaurant/bookings/new");
    expect(detailUi).not.toContain("groupLinkedReservationRows");
    expect(detailUi).not.toContain("detail.reservations.map");
    const linked = groupLinkedUnitRows([
      {
        reservationId: "res-1",
        confirmationNumber: "RSV-1",
        reservationRoomId: "u-1",
        guestId: "g-1",
        guestName: "John Doe",
        roomId: null,
        roomNumber: null,
        roomTypeId: "twin",
        roomTypeName: "Twin",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-03",
        reservationStatus: "confirmed",
        unitStatus: "confirmed",
        blockId: "king",
        blockLabel: "Deluxe King",
        isGroupOnlyLink: false,
        contributesToPickup: true,
      },
      {
        reservationId: "res-1",
        confirmationNumber: "RSV-1",
        reservationRoomId: "u-2",
        guestId: "g-1",
        guestName: "John Doe",
        roomId: "room-12",
        roomNumber: "12",
        roomTypeId: "suite",
        roomTypeName: "Suite",
        arrivalDate: "2026-11-01",
        departureDate: "2026-11-03",
        reservationStatus: "confirmed",
        unitStatus: "confirmed",
        blockId: "suite",
        blockLabel: "Suite",
        isGroupOnlyLink: false,
        contributesToPickup: true,
      },
    ]);
    expect(linked).toHaveLength(2);
    expect(linked[0]?.blockLabel).toBe("Deluxe King");
    expect(linked[1]?.blockLabel).toBe("Suite");
    expect(linked[0]?.id).toBe("u-1");
    expect(linked[1]?.id).toBe("u-2");
    expect(detailUi).toContain('data-testid="group-detail-linked-unit"');
    expect(GROUP_DETAIL_EMPTY.rooming).toBe("No rooming-list entries yet.");
    expect(GROUP_DETAIL_EMPTY.linked).toBe("No reservations are linked to this group.");
  });

  it("translates history without exposing UUIDs, JSON, or function names", () => {
    expect(groupHistoryEventLabel("group_created", null)).toBe("Group created");
    expect(groupHistoryEventLabel("inventory_resync", null)).toBe("Inventory updated");
    expect(
      groupHistoryEventLabel(
        "block_released",
        "cutoff_auto_release 2026-10-31. Linked reservations were not cancelled.",
      ),
    ).toBe("Unused inventory released at cut-off");
    expect(GROUP_HISTORY_EVENT_LABELS.cutoff_auto_release).toBe(
      "Unused inventory released at cut-off",
    );
    expect(
      groupHistoryDetails(
        { name: "Old" },
        { name: "New", blockId: "11111111-1111-4111-8111-111111111111" },
        null,
      ),
    ).toBe("Name Old → New");
    expect(looksLikeUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(detailUi).toContain("groupHistoryEventLabel");
    expect(detailUi).toContain("groupHistoryDetails");
    expect(detailUi).not.toContain("syncBlockInventory(");
    expect(detailUi).not.toContain("pms_create_operational_block");
    expect(detailUi).not.toContain("JSON.stringify");
  });

  it("keeps GB05 create wizard and GB01–GB03 inventory writers unchanged", () => {
    expect(listUi).toContain("CreateGroupWizard");
    expect(groupsFunctions).toContain("async function syncBlockInventory");
    expect(groupsFunctions).toContain("export const convertRoomingRow");
    expect(groupsFunctions).toContain("export const releaseGroupBlock");
    expect(groupsFunctions).toContain("export const addGroupBlock");
    expect(groupsFunctions).toContain("export const amendGroup");
    expect(listUi).toContain("convertRoomingRow");
    expect(listUi).toContain("releaseGroupBlock");
  });
});
