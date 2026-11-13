import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const workspace = source("src/packages/pms/components/workspaces/rooms-workspace.tsx");
const board = source("src/packages/pms/components/rooms/rooms-dashboard.tsx");
const inventory = source("src/packages/pms/components/rooms/room-inventory-inventory.tsx");
const availability = source("src/packages/pms/components/rooms/room-inventory-availability.tsx");
const calendar = source("src/packages/pms/components/rooms/room-inventory-calendar.tsx");
const blocks = source("src/packages/pms/components/rooms/room-inventory-blocks.tsx");
const rules = source("src/packages/pms/components/rooms/room-inventory-rules.tsx");
const more = source("src/packages/pms/components/rooms/room-inventory-more.tsx");
const utilities = source("src/packages/pms/components/rooms/room-inventory-utils.ts");
const chrome = source("src/packages/pms/components/rooms/room-inventory-chrome.tsx");
const actions = source("src/packages/pms/components/rooms/room-board-dialogs.tsx");
const historyFormat = source("src/packages/pms/components/rooms/room-detail-format.ts");
const restrictionDialog = source("src/packages/pms/components/rooms/room-restriction-dialog.tsx");
const boardFunctions = source("src/packages/pms/lib/room-board.functions.ts");

describe("Room & Inventory workspace", () => {
  it("wires every approved view and keeps legacy dashboard normalization", () => {
    for (const view of [
      "room-board",
      "availability",
      "calendar",
      "blocks",
      "assignment-eligibility",
      "inventory-rules",
      "overbooking",
      "floor-plan",
      "maintenance",
      "bulk-operations",
      "snapshot",
      "history-audit",
      "reports",
      "offline-sync",
    ]) {
      expect(workspace).toContain(`"${view}"`);
    }
    expect(workspace).toContain('initialTab === "dashboard"');
    expect(workspace).not.toContain("WorkspacePlaceholder");
  });

  it("checks assignment eligibility from the room card without leaving the board", () => {
    expect(board).toContain("<RoomEligibilityDialog");
    expect(board).not.toContain("useQueries");
    expect(board).not.toContain("evaluateRoomAssignment");
    expect(actions).toContain("evaluateRoomAssignment");
    expect(workspace).not.toContain('selectView("assignment-eligibility")');
    expect(rules).toContain("Inspect eligibility");
  });

  it("uses the approved dark chrome without restoring the package rail", () => {
    expect(workspace).toContain("RoomInventoryChrome");
    expect(chrome).toContain("PmsCommandChrome");
    expect(chrome).toContain("Rooms & Inventory");
  });

  it("uses grid as the default while retaining the operational list", () => {
    expect(board).toContain('useState<ViewMode>("grid")');
    expect(board).toContain('["table", "Table", Table2]');
    expect(board).toContain("<RoomList");
    expect(board).toContain("<RoomCard");
  });

  it("opens room actions as overlays on the board", () => {
    expect(board).toContain("<RoomBlockDialog");
    expect(board).toContain("<RoomEligibilityDialog");
    expect(board).toContain("<RoomConfigurationDialog");
    expect(board).toContain("<RoomHistoryDialog");
    expect(board).toContain("Set OOS / OOO");
    expect(board).toContain("Block Room");
    expect(board).toContain("Check Assignment Eligibility");
    expect(board).toContain("Room Configuration");
    expect(board).toContain("View History");
    expect(board).not.toContain("RoomDetailWorkspace");
    expect(board).not.toContain("RoomDetailPanel");
    expect(board).not.toContain("<Sheet");
    expect(workspace).not.toContain("openBlockForRoom");
  });

  it("keeps staff-facing history free of raw JSON and actor ids", () => {
    expect(actions).toContain("describeRoomEvent");
    expect(actions).not.toContain("actorMembershipId");
    expect(actions).not.toContain("JSON.stringify");
    expect(actions).not.toContain("previousValues}");
    expect(historyFormat).not.toContain("actorMembershipId");
  });

  it("makes the KPI cards filters over the same state logic as their counts", () => {
    expect(board).toContain("room-board-kpi-");
    expect(board).toContain("roomMatchesKpiFilter(kpiFilter, primary)");
    expect(workspace).toContain("onSelectFilter");
  });

  it("reads active room blocks with Front Office access", () => {
    expect(boardFunctions).toContain("export const listRoomBoardBlocks");
    expect(boardFunctions).toContain("requirePmsActor");
    expect(boardFunctions).toContain('"pms_operational_inventory_blocks"');
    expect(boardFunctions).toContain('.eq("status", "active")');
  });

  it("keeps restriction mutations on the canonical compatibility path", () => {
    expect(board).toContain("<RoomRestrictionDialog");
    expect(restrictionDialog).toContain("setRoomRestriction");
    expect(board).not.toContain(".update({ status");
    expect(restrictionDialog).not.toContain(".update({ status");
    expect(restrictionDialog).toContain("Maintenance request");
    expect(restrictionDialog).toContain("End date / expected return");
    expect(restrictionDialog).toContain("room-restriction-confirm");
    expect(restrictionDialog).toContain("getRoomRestrictionPolicy");
    expect(restrictionDialog).toContain("maintenanceRequestId");
    expect(restrictionDialog).toContain("OOO_MAINTENANCE_TICKET_MESSAGE");
    expect(restrictionDialog).toContain("outOfOrderNeedsMaintenanceTicket");
    expect(restrictionDialog).not.toContain("P0001");
  });

  it("uses stable canonical availability query keys", () => {
    expect(availability).toContain(
      '"room-inventory-availability", restaurantId, arrival, departure',
    );
    expect(availability).toContain(
      '"room-inventory-availability-tonight", restaurantId, businessDate',
    );
    expect(calendar).toContain('"room-inventory-calendar", restaurantId, periodStart, periodEnd');
    expect(availability).toContain("listRoomTypeInventoryAvailability");
    expect(availability).toContain("nightlyDemand");
    expect(availability).toContain("nightlyBlocked");
    expect(availability).not.toContain("count_sellable_rooms");
    expect(availability).not.toContain("count_reserved_rooms");
    expect(availability).not.toContain("physicalCapacity - row.available");
  });

  it("renders the approved availability matrix and persistent detail workspace", () => {
    expect(availability).toContain("Total Physical Capacity");
    expect(availability).toContain("Available Tonight");
    expect(availability).toContain("Occupied Tonight");
    expect(availability).toContain("Blocked Inventory");
    expect(availability).toContain("Allowances stay off this physical grid");
    expect(availability).toContain("Availability Matrix");
    expect(availability).toContain("Reserved / Demand");
    expect(availability).toContain("lg:grid-cols-[minmax(0,1fr)_360px]");
    expect(availability).toContain("View All Blocks");
    expect(workspace).toContain('onOpenBlocks={() => selectView("blocks")}');
    expect(board).toContain("<RoomBlockDialog");
    expect(actions).toContain("createOperationalBlock");
  });

  it("renders the approved monthly inventory calendar and summary panel", () => {
    expect(calendar).toContain("CalendarLegend");
    expect(calendar).toContain("Healthy");
    expect(calendar).toContain("Low Inventory");
    expect(calendar).toContain("Contains Restricted");
    expect(calendar).toContain("CalendarMatrix");
    expect(calendar).toContain("Inventory Summary");
    expect(calendar).toContain("Operational Notes");
    expect(calendar).toContain("Availability for the selected date.");
    expect(calendar).toContain("Remaining Available");
    expect(calendar).toContain("sticky left-0");
    expect(calendar).toContain("sticky left-48");
    expect(calendar).toContain("w-[360px]");
    expect(calendar).toContain("min-w-0 flex-1");
    expect(calendar).not.toContain("View Affected Rooms");
    expect(calendar).not.toContain("Edit Blocks");
    expect(calendar).not.toContain("canonical nightly");
    expect(calendar).toContain("listRoomTypeInventoryAvailability");
    expect(calendar).not.toContain("count_sellable_rooms");
    expect(workspace).toContain("propertyName={membership.restaurant.name}");
    expect(workspace).toContain("<RoomBoardKpiStrip");
    expect(workspace).not.toContain("onEditBlocks");
  });

  it("wires block lifecycle functions without recreating block policy", () => {
    for (const functionName of [
      "listOperationalBlocks",
      "createOperationalBlock",
      "activateOperationalBlock",
      "approveOperationalBlock",
      "releaseOperationalBlock",
      "cancelOperationalBlock",
    ]) {
      expect(blocks).toContain(functionName);
    }
    expect(inventory).toContain(
      'export { RoomInventoryBlocksView } from "./room-inventory-blocks"',
    );
    expect(blocks).toContain("getInventoryRules");
    expect(blocks).toContain('blockType: "temporary"');
    expect(blocks).not.toContain("operational_hold");
    expect(blocks).toContain("Quantity of Room Type");
    expect(blocks).toContain("Blocks are unavailable for your role");
    expect(blocks).not.toContain("approvalRequired: form");
    expect(blocks).not.toContain("inventoryImpact: form");
  });

  it("renders the approved blocks table, drawers, pagination and cross-view invalidation", () => {
    expect(blocks).toContain("Active Blocks");
    expect(blocks).toContain("Pending Approvals");
    expect(blocks).toContain("Rooms Blocked");
    expect(blocks).toContain("Blocks Ending Soon");
    expect(blocks).toContain("Create New Block");
    expect(blocks).toContain("Inventory Impact Preview");
    expect(blocks).toContain("View Details");
    expect(blocks).toContain("Release reason");
    expect(blocks).toContain("first 500 loaded");
    expect(blocks).toContain('"room-inventory-availability", restaurantId');
    expect(blocks).toContain('"room-inventory-calendar", restaurantId');
    expect(blocks).toContain('"room-board-blocks", restaurantId');
  });

  it("keeps unfinished capabilities honest", () => {
    expect(more).toContain("Bulk restriction mutation is not yet supported");
    expect(more).toContain("Offline operation is not configured");
    expect(more).toContain("Not configured");
  });

  it("renders known and unknown eligibility codes", () => {
    expect(utilities).toContain("ROOM_OPERATIONALLY_UNAVAILABLE");
    expect(utilities).toContain('replaceAll("_", " ")');
    expect(utilities).toContain("preferenceReasonLabel");
  });

  it("evaluates assignment from the canonical inspector without a second algorithm", () => {
    expect(rules).toContain("evaluateRoomAssignment");
    expect(rules).toContain("excludeReservationId: null");
    expect(rules).toContain("Room context");
    expect(rules).toContain("preferenceReasonLabel");
    expect(rules).not.toContain("count_sellable_rooms");
  });

  it("unwraps Card 2 inventory rules and reuses saveInventoryRules", () => {
    expect(rules).toContain("query.data.rules");
    expect(rules).toContain("saveInventoryRules");
    expect(source("src/packages/pms/components/rooms/room-inventory-rule-catalog.ts")).toContain(
      "Sellable room required",
    );
    expect(rules).toContain("Block-type Inventory Behavior");
    expect(rules).toContain("Unsaved changes");
    expect(rules).toContain("highImpactConsequences");
    expect(rules).not.toContain("canonical assignment evaluator");
    expect(rules).not.toContain("Card 2 maintenance");
    expect(rules).not.toContain("Enforced");
    expect(rules).not.toContain("Operational availability required");
    expect(rules).not.toContain("Room move allowed");
    expect(rules).not.toContain("Config only");
    expect(rules).not.toContain("query.data.sellableStatusRequired");
  });

  it("keeps overbooking configuration separate from the operational board", () => {
    expect(workspace).toContain("<RoomOverbookingView restaurantId={restaurantId} />");
    expect(rules).toContain("OVERBOOKING_CAPACITY_NOTE");
    expect(rules).toContain("getOverbookingBoard");
    expect(rules).toContain("Allowed overbooking");
    expect(rules).toContain("Consumed overbooking");
    expect(rules).not.toContain("Stop-sell fallback");
  });

  it("scopes maintenance authorization failures to the maintenance view", () => {
    expect(more).toContain("Maintenance details are unavailable for your role");
    expect(workspace).toContain("<RoomMaintenanceView");
  });

  it("gives the maintenance tab the same request actions as Maintenance", () => {
    expect(more).toContain("createMaintenanceRequest");
    expect(more).toContain("updateMaintenanceRequest");
    expect(more).toContain("Log request");
    expect(more).toContain("Start");
    expect(more).toContain("Complete");
    expect(more).toContain("Reopen");
    expect(more).toContain('status: "in_progress"');
    expect(more).toContain('status: "resolved"');
    expect(more).toContain('status: "open"');
  });
});
