import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canActivateSet1,
  canEditSet1,
  emptyIdentity,
  emptyOps,
  emptyPolicies,
  emptyTaxes,
  evaluateSet1Checklist,
  SET1_COMING_SOON,
  SET1_LIVE_CARDS,
} from "./pms-set1-foundation.ts";
import {
  SET2_AMENITIES_WARNING,
  SET2_AUDIT_AMENITY,
  SET2_AUDIT_OUTLET,
  SET2_AUDIT_STRUCTURE,
  SET2_OUTLETS_UNAVAILABLE,
  SET2_RI_HREF,
  SET2_STRUCTURE_UNAVAILABLE,
  completeSet2Activate,
  emptySet2Activate,
  inferMasterFromFreeText,
  roomNeedsStructureAssign,
  structureDeleteBlocked,
  structureDeleteMessage,
  wingParentXor,
} from "./pms-set2-structure.ts";
import { completeSet3Activate } from "./pms-set3-rates-guest.ts";

const completeIdentity = emptyIdentity({
  name: "Harbour House",
  timezone: "Europe/London",
  currencyCode: "GBP",
  propertyCode: "HH",
  legalName: "Harbour House Ltd",
  propertyType: "hotel",
  taxIdentities: [{ label: "VAT", value: "GB123" }],
});
const completeOps = emptyOps({ checkInTime: "15:00", checkOutTime: "11:00" });
const completeTaxes = emptyTaxes({ taxInclusive: false, taxName: "VAT", taxRate: 20 });
const completePolicies = emptyPolicies({
  fees: {
    cancelFeeRequired: true,
    cancelFeeDefault: 0,
    noshowFeeRequired: true,
    noshowFeeDefault: 25,
  },
});

function foundationReady(set2 = completeSet2Activate(), role = "owner") {
  return evaluateSet1Checklist({
    identity: completeIdentity,
    ops: completeOps,
    taxes: completeTaxes,
    policies: completePolicies,
    foundationColumnsAvailable: true,
    pmsSet1Live: false,
    role,
    set2,
    set3: completeSet3Activate(),
  });
}

describe("PMS-SET2 live free-text is not silently rewritten", () => {
  it("treats 1 vs f1 as unassigned until an explicit assign and never infers a master", () => {
    assert.equal(roomNeedsStructureAssign(null), true);
    assert.equal(roomNeedsStructureAssign(""), true);
    assert.equal(roomNeedsStructureAssign("building-1"), false);
    assert.equal(inferMasterFromFreeText("1"), null);
    assert.equal(inferMasterFromFreeText("f1"), null);
    assert.equal(inferMasterFromFreeText("Floor 1"), null);

    const fns = readFileSync(new URL("./pms-set2-structure.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fns, /inferMasterFromFreeText\(/);
    assert.doesNotMatch(fns, /floor === "f1"|building === "1"/);
    assert.match(fns, /roomNeedsStructureAssign/);
  });
});

describe("PMS-SET2 structure delete/reassign guard", () => {
  it("blocks delete while rooms are assigned and allows after reassign", () => {
    assert.equal(structureDeleteBlocked(2), true);
    assert.equal(structureDeleteMessage("building", 2), "Reassign 2 rooms before deleting this building.");
    assert.equal(structureDeleteMessage("floor", 1), "Reassign 1 room before deleting this floor.");
    assert.equal(structureDeleteBlocked(0), false);
    assert.equal(structureDeleteMessage("wing", 0), null);
    assert.equal(wingParentXor("building-1", null), true);
    assert.equal(wingParentXor(null, "floor-1"), true);
    assert.equal(wingParentXor("building-1", "floor-1"), false);
    assert.equal(wingParentXor(null, null), false);
  });
});

describe("PMS-SET2 amenities Warning is non-blocking", () => {
  it("keeps Activate available when the catalogue is empty", () => {
    const emptyAmenities = foundationReady(completeSet2Activate({ amenityCount: 0 }));
    assert.equal(emptyAmenities.domains.rooms.readiness, "warning");
    assert.ok(emptyAmenities.domains.rooms.warnings.includes(SET2_AMENITIES_WARNING));
    assert.equal(emptyAmenities.canActivate, true);
    assert.equal(emptyAmenities.overall, "warning");
    assert.ok(!emptyAmenities.mandatoryMissing.includes("Amenity"));
  });
});

describe("PMS-SET2 single Activate mandatory expand", () => {
  it("keeps one pms_set1_live flag and expands mandatory to structure, rooms and outlets", () => {
    const set1Only = foundationReady(emptySet2Activate());
    assert.equal(set1Only.canActivate, false);
    assert.ok(set1Only.mandatoryMissing.includes("Building"));
    assert.ok(set1Only.mandatoryMissing.includes("Floor"));
    assert.ok(set1Only.mandatoryMissing.includes("Room type"));
    assert.ok(set1Only.mandatoryMissing.includes("Room"));
    assert.ok(set1Only.mandatoryMissing.includes("Rooms outlet"));
    assert.equal(set1Only.domains.structure.readiness, "incomplete");
    assert.ok(set1Only.domains.structure.warnings.includes(SET2_STRUCTURE_UNAVAILABLE));
    assert.equal(set1Only.domains.outlets.readiness, "incomplete");
    assert.ok(set1Only.domains.outlets.warnings.includes(SET2_OUTLETS_UNAVAILABLE));

    const owner = foundationReady();
    assert.equal(owner.canActivate, true);
    assert.equal(owner.overall, "ready");
    assert.equal(canActivateSet1("owner"), true);

    const manager = foundationReady(completeSet2Activate(), "manager");
    assert.equal(canEditSet1("manager"), true);
    assert.equal(manager.canActivate, false);

    const receptionist = foundationReady(completeSet2Activate(), "receptionist");
    assert.equal(canEditSet1("receptionist"), false);
    assert.equal(receptionist.canActivate, false);
  });
});

describe("PMS-SET2 role gate", () => {
  it("lets owner and manager edit Settings; receptionist may open FO rooms but not Settings", () => {
    assert.equal(canEditSet1("owner"), true);
    assert.equal(canEditSet1("manager"), true);
    assert.equal(canEditSet1("receptionist"), false);
    const roomsServer = readFileSync(new URL("./rooms.server.ts", import.meta.url), "utf8");
    assert.match(roomsServer, /ROOM_MANAGE_ROLES = \["owner", "manager"\]/);
    assert.match(roomsServer, /ROOM_ACCESS_ROLES = FRONT_OFFICE_ROLES/);
    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /PermissionDeniedPanel/);
    assert.doesNotMatch(hub, /Coming soon.*receptionist/i);
    const workspace = readFileSync(new URL("../components/workspaces/rooms-workspace.tsx", import.meta.url), "utf8");
    assert.match(workspace, /Receptionist may open/);
    assert.match(workspace, /room-types/);
  });
});

describe("PMS-SET2 RI deep-link and hub unmute", () => {
  it("deep-links Rooms to room inventory and unmutes Structure · Rooms · Outlets", () => {
    assert.equal(SET2_RI_HREF, "/restaurant/pms/room-inventory");
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "structure"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "rooms" && card.title === "Rooms & amenities"));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "outlets"));
    assert.ok(!SET1_COMING_SOON.some((card) => ["Structure", "Rooms", "Rooms & amenities", "Outlets"].includes(card.title)));
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === "Rates" || card.title === "Rates & meal plans"));
    assert.ok(SET1_COMING_SOON.some((card) => card.title === "Banks"));
    assert.ok(SET1_COMING_SOON.some((card) => card.title === "Roles"));

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /SET1_HUB_HREF}#\$\{card\.id/);
    assert.match(hub, /Configure/);
    assert.match(hub, /section === "structure"/);
    assert.match(hub, /section === "rooms"/);
    assert.match(hub, /Set2StructureSection/);
    assert.match(hub, /Set2RoomsSection/);
    assert.match(hub, /Set2OutletsSection/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    const comingSoon = hub.slice(hub.indexOf("SET1_COMING_SOON.map"));
    assert.match(comingSoon, /Coming soon/);
    assert.doesNotMatch(comingSoon, /Configure/);

    const attach = readFileSync(new URL("../components/rooms/room-type-dialogs.tsx", import.meta.url), "utf8");
    assert.match(attach, /amenityIds/);
    assert.match(attach, /Settings · Rooms/);
    const settingsRooms = readFileSync(new URL("../components/settings/pms-set2-section.tsx", import.meta.url), "utf8");
    assert.match(settingsRooms, /Amenities catalogue/);
    assert.doesNotMatch(settingsRooms, /amenityIds/);

    const rooms = readFileSync(new URL("../components/settings/pms-set2-section.tsx", import.meta.url), "utf8");
    assert.match(rooms, /SET2_RI_HREF/);
    assert.match(rooms, /Open room inventory/);
    assert.doesNotMatch(rooms, /deskHours/);
    assert.doesNotMatch(rooms, /inventory calendar/);
    assert.doesNotMatch(rooms, /FO-CHROME1/);
  });
});

describe("PMS-SET2 no FO deskHours / FO-CHROME1", () => {
  it("leaves Front Office chrome and SET3+ forms out of this wave", () => {
    const chrome = readFileSync(new URL("../components/frontoffice/front-office-chrome.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(chrome, /deskHours/);
    assert.doesNotMatch(chrome, /FO-CHROME1/);

    const activate = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(activate, /pms_set1_live: true/);
    assert.doesNotMatch(activate, /pms_set2_live/);
    assert.match(activate, /SET2_AUDIT_STRUCTURE/);
    assert.match(activate, /restaurant_staff_audit_log/);

    const amenities = readFileSync(new URL("./rooms.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(amenities, /DEFAULT_AMENITIES\.map/);
    assert.match(amenities, /room_type_amenities/);
  });
});

describe("PMS-SET2 migration 0048 dual-lane", () => {
  it("keeps identical additive SQL in drizzle and supabase lanes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const drizzle = join(here, "../../../../drizzle/migrations/0048_pms_set2_structure_outlets.sql");
    const supabase = join(here, "../../../../supabase/migrations/0048_pms_set2_structure_outlets.sql");
    assert.equal(existsSync(drizzle), true);
    assert.equal(existsSync(supabase), true);
    const drizzleSql = readFileSync(drizzle, "utf8");
    const supabaseSql = readFileSync(supabase, "utf8");
    assert.equal(drizzleSql, supabaseSql);
    assert.match(drizzleSql, /hotel_buildings/);
    assert.match(drizzleSql, /hotel_floors/);
    assert.match(drizzleSql, /hotel_wings/);
    assert.match(drizzleSql, /pms_outlets/);
    assert.match(drizzleSql, /single_building_mode/);
    assert.match(drizzleSql, /parent_building_id IS NOT NULL AND parent_floor_id IS NULL/);
    assert.match(drizzleSql, /building_id/);
    assert.match(drizzleSql, /room_amenities/);
    assert.doesNotMatch(drizzleSql, /CREATE FUNCTION/i);
    assert.doesNotMatch(drizzleSql, /ALTER TABLE public\.folio_transactions/);
    assert.doesNotMatch(drizzleSql, /Managers delete rooms/);
    assert.doesNotMatch(drizzleSql, /ON public\.hotel_rooms\s+FOR DELETE/);
    assert.doesNotMatch(drizzleSql, /UPDATE public\.hotel_rooms\s+SET/);
    assert.match(drizzleSql, /AFTER Abel merged/);
    assert.match(drizzleSql, /20260914084725/);
    assert.doesNotMatch(drizzleSql, /INSERT INTO public\.hotel_buildings/);
    assert.match(drizzleSql, /do not apply to production from an agent/i);
    assert.equal(SET2_AUDIT_STRUCTURE, "pms_set2_structure_updated");
    assert.equal(SET2_AUDIT_OUTLET, "pms_set2_outlet_updated");
    assert.equal(SET2_AUDIT_AMENITY, "pms_set2_amenity_updated");
  });
});
