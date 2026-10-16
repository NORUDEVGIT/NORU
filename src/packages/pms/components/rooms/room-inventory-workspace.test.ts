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
const detail = source("src/packages/pms/components/rooms/room-detail-panel.tsx");
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

  it("uses explicit assignment inspection instead of per-row RPC fan-out", () => {
    expect(board).toContain("onInspectAssignment");
    expect(board).not.toContain("useQueries");
    expect(board).not.toContain("evaluateRoomAssignment");
    expect(workspace).toContain('selectView("assignment-eligibility")');
    expect(rules).toContain("Inspect eligibility");
  });

  it("uses the approved dark chrome without restoring the package rail", () => {
    expect(workspace).toContain("RoomInventoryChrome");
    expect(chrome).toContain("PmsCommandChrome");
    expect(chrome).toContain("Rooms & Inventory");
  });

  it("uses grid as the default while retaining the operational list", () => {
    expect(board).toContain('useState<ViewMode>("grid")');
    expect(board).toContain('setViewMode("list")');
    expect(board).toContain("<RoomList");
    expect(board).toContain("<RoomCard");
  });

  it("renders the approved filters, location navigator and selected-room details", () => {
    expect(board).toContain("<FilterBand");
    expect(board).toContain("<LocationNavigator");
    expect(board).toContain("<RoomDetailPanel");
    expect(detail).toContain('"overview"');
    expect(detail).toContain('"notes"');
    expect(detail).toContain('"history"');
  });

  it("reads active room blocks with Front Office access", () => {
    expect(boardFunctions).toContain("export const listRoomBoardBlocks");
    expect(boardFunctions).toContain("requireFrontOfficeAccess");
    expect(boardFunctions).toContain('"pms_operational_inventory_blocks"');
    expect(boardFunctions).toContain('.eq("status", "active")');
  });

  it("keeps restriction mutations on the canonical compatibility path", () => {
    expect(board).toContain("setRoomRestriction");
    expect(board).not.toContain(".update({ status");
    expect(detail).toContain("Restriction changes require manager access.");
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
    expect(availability).toContain("Overbooking Allowance");
    expect(availability).toContain("Availability Matrix");
    expect(availability).toContain("Reserved / Demand");
    expect(availability).toContain("lg:grid-cols-[minmax(0,1fr)_360px]");
    expect(availability).toContain("View All Blocks");
    expect(workspace).toContain('onOpenBlocks={() => selectView("blocks")}');
  });

  it("renders the approved monthly inventory calendar and summary panel", () => {
    expect(calendar).toContain("CalendarLegend");
    expect(calendar).toContain("Healthy");
    expect(calendar).toContain("Low Inventory");
    expect(calendar).toContain("Contains Restricted");
    expect(calendar).toContain("CalendarMatrix");
    expect(calendar).toContain("Inventory Summary");
    expect(calendar).toContain("Operational Notes");
    expect(calendar).toContain("View Affected Rooms");
    expect(calendar).toContain("Edit Blocks");
    expect(calendar).toContain("lg:grid-cols-[minmax(0,1fr)_360px]");
    expect(calendar).toContain("listRoomTypeInventoryAvailability");
    expect(calendar).not.toContain("count_sellable_rooms");
    expect(workspace).toContain("propertyName={membership.restaurant.name}");
    expect(workspace).toContain('onEditBlocks={() => selectView("blocks")}');
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
    expect(rules).toContain("Sellable room required");
    expect(rules).toContain("Config only");
    expect(rules).toContain("Block-type inventory behavior");
    expect(rules).not.toContain("query.data.sellableStatusRequired");
  });

  it("keeps overbooking configuration separate from operational allowance", () => {
    expect(workspace).toContain("<RoomOverbookingView restaurantId={restaurantId} />");
    expect(rules).toContain("OVERBOOKING_CAPACITY_NOTE");
    expect(rules).toContain("Operational allowance");
    expect(rules).toContain("Stop-sell fallback");
    expect(rules).toContain("Not configured");
  });

  it("scopes maintenance authorization failures to the maintenance view", () => {
    expect(more).toContain("Maintenance details are unavailable for your role");
    expect(workspace).toContain("<RoomMaintenanceView");
  });
});
