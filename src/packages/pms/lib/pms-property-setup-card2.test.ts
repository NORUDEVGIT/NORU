import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SET1_HUB_HREF, isSet1SectionHash, propertySetupRedirectHref } from "./pms-set1-foundation.ts";
import { PROPERTY_SETUP_CARDS } from "./pms-property-setup-card1.ts";
import {
  CARD2_HASH,
  CARD2_HREF,
  CARD2_STEPS,
  CARD2_SUBTITLE,
  CARD2_TITLE,
  card2CompletedCount,
  card2ProgressPct,
  evaluateCard2StepStatus,
  isCard2WorkspaceHash,
  nextCard2Step,
  previousCard2Step,
  resolveCard2Hash,
} from "./pms-property-setup-card2.ts";

const here = dirname(fileURLToPath(import.meta.url));
const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../components/settings/pms-property-setup-workspace.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../../routes/restaurant/settings.tsx", import.meta.url), "utf8");
const card1Ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");

describe("PMS Property Setup Card 2 Phase 0 shell", () => {
  it("keeps Rooms & Operations title, five steps, and rooms-inventory hash", () => {
    assert.equal(CARD2_TITLE, "Rooms & Operations");
    assert.equal(
      CARD2_SUBTITLE,
      "Configure room types, physical rooms, amenities, housekeeping, inventory and maintenance rules.",
    );
    assert.equal(CARD2_HASH, "rooms-inventory");
    assert.equal(CARD2_HREF, `${SET1_HUB_HREF}#rooms-inventory`);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.id, "rooms-inventory");
    assert.equal(PROPERTY_SETUP_CARDS[1]?.title, CARD2_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[1]?.hash, CARD2_HASH);
    assert.deepEqual(
      CARD2_STEPS.map((row) => row.title),
      ["Room Types & Rooms", "Amenities", "Housekeeping", "Inventory Rules", "Maintenance"],
    );
    assert.equal(CARD2_STEPS[0]?.id, "room-types");
    assert.equal(nextCard2Step("room-types"), "amenities");
    assert.equal(previousCard2Step("room-types"), null);
    assert.equal(nextCard2Step("maintenance"), null);
  });

  it("does not invent completion and does not collide with SET2 rooms", () => {
    assert.equal(evaluateCard2StepStatus("room-types", undefined), "not_started");
    assert.equal(card2CompletedCount({}), 0);
    assert.equal(card2ProgressPct({}), 0);
    assert.equal(isCard2WorkspaceHash("#rooms-inventory"), true);
    assert.equal(isCard2WorkspaceHash("#card-2"), true);
    assert.equal(isCard2WorkspaceHash("#rooms"), false);
    assert.equal(resolveCard2Hash("#rooms"), null);
    assert.equal(isSet1SectionHash("#rooms"), true);
    assert.equal(isSet1SectionHash("#rooms-inventory"), false);
    assert.equal(propertySetupRedirectHref("#card-2"), `${SET1_HUB_HREF}#rooms-inventory`);
    assert.equal(propertySetupRedirectHref("#rooms"), `${SET1_HUB_HREF}#rooms`);
  });

  it("opens from the hub with Card 1 chrome, a status rail, and a draft save", () => {
    assert.match(hub, /PmsPropertySetupCard2Section/);
    assert.match(hub, /restaurantId=\{restaurantId\}/);
    assert.match(hub, /card2Steps=/);
    assert.match(section, /testIdPrefix="pms-card2"/);
    assert.match(section, /PmsPropertySetupCard2RoomTypes/);
    assert.match(section, /onSaveDraft/);
    assert.match(chrome, /Setup Progress/);
    assert.match(chrome, /Save Draft/);
    assert.match(chrome, /Save & Continue/);
    assert.match(chrome, /onSaveDraft/);
    assert.match(chrome, /pointer-events-none/);
    assert.match(chrome, /\[&>\*\]:pointer-events-auto/);
    assert.match(chrome, /pb-28/);
    assert.match(settings, /isCard2WorkspaceHash/);
    assert.match(settings, /hidePackageRail=\{workspaceOpen\}/);
    assert.match(card1Ui, /pms-card1-fullscreen/);
    assert.doesNotMatch(card1Ui, /PmsPropertySetupWorkspace/);
  });

  it("ships dual-lane 0064 without live apply, operational rewrite, or sample seed", () => {
    const drizzle064 = join(here, "../../../../drizzle/migrations/0064_pms_card2_room_types_rooms.sql");
    const supabase064 = join(here, "../../../../supabase/migrations/0064_pms_card2_room_types_rooms.sql");
    assert.equal(existsSync(drizzle064), true);
    assert.equal(existsSync(supabase064), true);
    const drizzle = readFileSync(drizzle064, "utf8");
    const supabase = readFileSync(supabase064, "utf8");
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /APPLY AFTER MERGE/);
    assert.match(drizzle, /do not apply to production from an agent/i);
    assert.match(drizzle, /room_type_beds/);
    assert.match(drizzle, /hotel_room_links/);
    assert.match(drizzle, /maintenance_status/);
    assert.match(drizzle, /maintenance_required/);
    assert.match(drizzle, /room_features/);
    assert.match(drizzle, /default_building_id/);
    assert.match(drizzle, /preferred_floor_id/);
    assert.match(drizzle, /hotel_rooms_code_unique/);
    assert.doesNotMatch(drizzle, /CREATE FUNCTION/);
    assert.match(drizzle, /No SECURITY DEFINER/);
    assert.doesNotMatch(drizzle, /DROP COLUMN IF EXISTS status/);
    assert.match(drizzle, /Operational status only/);
    assert.doesNotMatch(drizzle, /INSERT INTO public\.hotel_rooms/);
  });
});

describe("PMS Property Setup Card 2 Phase 1 Room Types UI", () => {
  it("calls live room APIs and keeps later steps as placeholders", () => {
    const ui = readFileSync(new URL("../components/settings/pms-property-setup-card2-room-types.tsx", import.meta.url), "utf8");
    const sectionSrc = readFileSync(new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url), "utf8");
    assert.match(ui, /saveRoomType/);
    assert.match(ui, /saveRoom/);
    assert.match(ui, /bulkCreateRooms/);
    assert.match(ui, /evaluateCard2RoomTypesReadiness/);
    assert.match(ui, /listRoomTypes/);
    assert.match(ui, /listRooms/);
    assert.match(ui, /sequentialRoomLabels/);
    assert.match(ui, /cascadeLocationIds/);
    assert.match(ui, /wingsForBuilding/);
    assert.match(ui, /floorsForBuildingAndWing/);
    assert.match(ui, /scroll-mb-32/);
    assert.match(ui, /changed: "building"/);
    assert.match(ui, /changed: "wing"/);
    assert.doesNotMatch(ui, /pmsDb/);
    assert.doesNotMatch(ui, /localStorage/);
    assert.match(ui, /Bed configuration/);
    assert.match(ui, /Bulk room generation/);
    assert.match(ui, /Connecting \/ adjacent/);
    assert.match(ui, /maintenanceStatus/);
    assert.match(ui, /housekeepingStatus/);
    assert.match(sectionSrc, /step === "room-types"/);
    assert.match(sectionSrc, /step === "amenities"/);
    assert.match(sectionSrc, /PmsPropertySetupCard2Amenities/);
    assert.match(sectionSrc, /step === "inventory-rules"/);
    assert.match(sectionSrc, /PmsPropertySetupCard2Inventory/);
    assert.match(sectionSrc, /step === "maintenance"/);
    assert.match(sectionSrc, /PmsPropertySetupCard2Maintenance/);
    assert.match(
      sectionSrc.replace(/\s+/g, " "),
      /saveDraftDisabled=\{ ?!canEdit \|\| \( ?step !== "room-types" && step !== "amenities" && step !== "housekeeping" && step !== "inventory-rules" && step !== "maintenance" ?\)/,
    );
    assert.match(sectionSrc, /current.placeholder/);
    assert.match(sectionSrc, /Card 2 Review/);
    assert.doesNotMatch(sectionSrc, /Amenities configuration will be implemented in a later phase/);
    assert.doesNotMatch(sectionSrc, /Inventory Rules configuration will be implemented in a later phase/);
    assert.doesNotMatch(sectionSrc, /Maintenance configuration will be implemented in a later phase/);
    const inventoryUi = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-inventory.tsx", import.meta.url),
      "utf8",
    );
    assert.match(inventoryUi, /getInventoryRules/);
    assert.match(inventoryUi, /saveInventoryRules/);
    assert.match(inventoryUi, /getInventorySummary/);
    assert.match(inventoryUi, /evaluateCard2InventoryReadiness/);
    assert.match(inventoryUi, /OVERBOOKING_CAPACITY_NOTE/);
    assert.doesNotMatch(inventoryUi, /Available to Sell/);
    assert.doesNotMatch(inventoryUi, /pmsDb/);
  });
});

describe("PMS Property Setup Card 2 Phase 5 Maintenance UI", () => {
  it("wires maintenance APIs and keeps housekeeping as a placeholder", () => {
    const ui = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-maintenance.tsx", import.meta.url),
      "utf8",
    );
    const sectionSrc = readFileSync(
      new URL("../components/settings/pms-property-setup-card2-section.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ui, /getMaintenanceRules/);
    assert.match(ui, /saveMaintenanceRules/);
    assert.match(ui, /getMaintenanceSummary/);
    assert.match(ui, /evaluateCard2MaintenanceReadiness/);
    assert.match(ui, /listMaintenanceDepartments/);
    assert.match(ui, /Maintenance Status Rules control restrictions/);
    assert.match(ui, /Out of Service \/ Out of Order policies below govern operational room restrictions/);
    assert.match(ui, /maintenance-status-\$\{status\}-\$\{field\.key\}/);
    assert.match(ui, /maintenance-oos-enabled/);
    assert.match(ui, /maintenance-ooo-ticket-required/);
    assert.match(ui, /scroll-mb-32/);
    assert.doesNotMatch(ui, /Available to Sell/);
    assert.doesNotMatch(ui, /Repair Complete/);
    assert.doesNotMatch(ui, /removes_from_inventory/);
    assert.doesNotMatch(ui, /pmsDb/);
    assert.doesNotMatch(ui, /pms_card2_housekeeping/);
    assert.match(sectionSrc, /PmsPropertySetupCard2Maintenance/);
    assert.match(sectionSrc, /pms-card2-step-\$\{step\}/);
  });
});
