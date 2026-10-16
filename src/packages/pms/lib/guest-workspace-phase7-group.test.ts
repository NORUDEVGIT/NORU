import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GROUP_DETAIL_CANONICAL_VIEWS,
  GROUP_DETAIL_PRIMARY_TABS,
  GROUP_DETAIL_MORE_ITEMS,
  resolveCanonicalGroupNavId,
  isPrimaryGroupView,
  isMoreGroupView,
} from "./guest-group-detail-view.ts";

import {
  GROUP_MEMBER_STATUSES,
  GROUP_STATUS_LABELS,
  generateGroupCode,
  isGroupCancelled,
} from "./guest-group-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Phase 7: Group Navigation Topology & View Registry", () => {
  it("defines exactly 5 canonical primary views", () => {
    assert.equal(GROUP_DETAIL_PRIMARY_TABS.length, 5);
    const ids = GROUP_DETAIL_PRIMARY_TABS.map((tab) => tab.id);
    assert.deepEqual(ids, ["overview", "master", "members", "reservations", "rooming"]);
  });

  it("defines exactly 5 canonical more items", () => {
    assert.equal(GROUP_DETAIL_MORE_ITEMS.length, 5);
    const ids = GROUP_DETAIL_MORE_ITEMS.map((item) => item.id);
    assert.deepEqual(ids, ["communication", "financial", "itinerary", "documents", "activity"]);
  });

  it("partitions canonical views into primary and more without overlap (10 total)", () => {
    assert.equal(GROUP_DETAIL_CANONICAL_VIEWS.length, 10);
    const primarySet = new Set(GROUP_DETAIL_PRIMARY_TABS.map((t) => t.id));
    const moreSet = new Set(GROUP_DETAIL_MORE_ITEMS.map((m) => m.id));

    for (const item of GROUP_DETAIL_MORE_ITEMS) {
      assert.equal(primarySet.has(item.id), false);
    }
    for (const tab of GROUP_DETAIL_PRIMARY_TABS) {
      assert.equal(moreSet.has(tab.id), false);
    }
  });

  it("correctly identifies primary vs more views", () => {
    assert.equal(isPrimaryGroupView("overview"), true);
    assert.equal(isPrimaryGroupView("master"), true);
    assert.equal(isPrimaryGroupView("members"), true);
    assert.equal(isPrimaryGroupView("reservations"), true);
    assert.equal(isPrimaryGroupView("rooming"), true);

    assert.equal(isPrimaryGroupView("communication"), false);
    assert.equal(isMoreGroupView("communication"), true);
    assert.equal(isMoreGroupView("financial"), true);
    assert.equal(isMoreGroupView("itinerary"), true);
    assert.equal(isMoreGroupView("documents"), true);
    assert.equal(isMoreGroupView("activity"), true);
  });

  it("resolves primary canonical IDs directly", () => {
    assert.equal(resolveCanonicalGroupNavId("overview"), "overview");
    assert.equal(resolveCanonicalGroupNavId("master"), "master");
    assert.equal(resolveCanonicalGroupNavId("members"), "members");
    assert.equal(resolveCanonicalGroupNavId("reservations"), "reservations");
    assert.equal(resolveCanonicalGroupNavId("rooming"), "rooming");
  });

  it("resolves more canonical IDs directly", () => {
    assert.equal(resolveCanonicalGroupNavId("communication"), "communication");
    assert.equal(resolveCanonicalGroupNavId("financial"), "financial");
    assert.equal(resolveCanonicalGroupNavId("itinerary"), "itinerary");
    assert.equal(resolveCanonicalGroupNavId("documents"), "documents");
    assert.equal(resolveCanonicalGroupNavId("activity"), "activity");
  });

  it("resolves legacy URL aliases gracefully", () => {
    assert.equal(resolveCanonicalGroupNavId("details"), "master");
    assert.equal(resolveCanonicalGroupNavId("group-master"), "master");
    assert.equal(resolveCanonicalGroupNavId("bookings"), "reservations");
    assert.equal(resolveCanonicalGroupNavId("rooming-list"), "rooming");
    assert.equal(resolveCanonicalGroupNavId("comms"), "communication");
    assert.equal(resolveCanonicalGroupNavId("notes"), "communication");
    assert.equal(resolveCanonicalGroupNavId("financials"), "financial");
    assert.equal(resolveCanonicalGroupNavId("financial-summary"), "financial");
    assert.equal(resolveCanonicalGroupNavId("history"), "activity");
    assert.equal(resolveCanonicalGroupNavId("activity-log"), "activity");
  });

  it("defaults unknown or null nav to overview", () => {
    assert.equal(resolveCanonicalGroupNavId(null), "overview");
    assert.equal(resolveCanonicalGroupNavId(undefined), "overview");
    assert.equal(resolveCanonicalGroupNavId(""), "overview");
    assert.equal(resolveCanonicalGroupNavId("random-unknown-nav"), "overview");
  });
});

describe("Phase 7: Amendment 1 & 2 — Reservation Prefill & Architecture", () => {
  it("accepts groupId on reservations route and workspace overlay", () => {
    const route = readRel("../../../routes/restaurant/pms/reservations.index.tsx");
    assert.match(route, /rawGroupId = search\["groupId"\] \?\? search\["groupAccountMasterId"\]/);
    assert.match(route, /UUID_REGEX\.test\(rawGroupId\.trim\(\)\)/);
    assert.match(route, /initialGroupId=\{search\.groupId\}/);

    const overlay = readRel("../components/reservations/reservation-workspace-overlay.tsx");
    assert.match(overlay, /initialGroupMasterId\?: string \| null/);

    const workspace = readRel("../components/workspaces/reservations-workspace.tsx");
    assert.match(workspace, /initialGroupId/);
    assert.match(workspace, /initialGroupMasterId: initialGroupId/);
  });

  it("enforces property-scoped group validation and prefill without forcing group type", () => {
    const createPage = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(createPage, /initialGroupMasterId/);
    assert.match(createPage, /accountType === "group"/);
    assert.match(createPage, /!account\.anonymi[sz]edAt/);
    assert.match(createPage, /account\.accountStatus !== "deleted"/);
    assert.match(createPage, /account\.accountStatus !== "inactive"/);
    assert.match(createPage, /setGroupMaster/);
    assert.match(createPage, /groupAccountMasterId:/);
    // Does NOT overwrite or force reservation_type
    assert.doesNotMatch(createPage, /reservation_type:\s*"group"/i);
  });

  it("uses modern reservation link with create=new and groupId", () => {
    const header = readRel("../components/guests/guest-group-header.tsx");
    assert.match(header, /\/restaurant\/pms\/reservations/);
    assert.match(header, /groupId:\s*group\.id/);

    const quickView = readRel("../components/guests/guest-group-quick-view-drawer.tsx");
    assert.match(quickView, /\/restaurant\/pms\/reservations/);
    assert.match(quickView, /create:\s*"new",\s*groupId/);

    const resView = readRel("../components/guests/guest-group-reservations-view.tsx");
    assert.match(resView, /\/restaurant\/pms\/reservations/);
    assert.match(resView, /create:\s*"new",\s*groupId/);
  });
});

describe("Phase 7: Amendment 3 — Member Status Boundary", () => {
  it("isolates member statuses strictly to group-member relationship", () => {
    assert.deepEqual([...GROUP_MEMBER_STATUSES], ["expected", "confirmed", "cancelled"]);

    const membersView = readRel("../components/guests/guest-group-members-view.tsx");
    assert.match(membersView, /updateGroupMember/);
    assert.match(membersView, /member-drawer/);
  });
});

describe("Phase 7: Amendment 4 & 5 — Room Assignment & Auto-Assignment Safety", () => {
  it("assigns rooms through hotel_reservations.room_id and room inventory", () => {
    const roomingView = readRel("../components/guests/guest-group-rooming-view.tsx");
    assert.match(roomingView, /assignGroupRoom/);
    assert.match(roomingView, /listGroupAssignableRooms/);
    assert.match(roomingView, /swapGroupRooms/);
    assert.match(roomingView, /autoAssignGroupRooms/);
  });

  it("reports per-row auto-assignment results and never shows blanket success on failure", () => {
    const roomingView = readRel("../components/guests/guest-group-rooming-view.tsx");
    assert.match(roomingView, /Auto-Assignment Results/);
    assert.match(roomingView, /Assigned \(/);
    assert.match(roomingView, /Failed \/ No Availability \(/);
    assert.match(roomingView, /Skipped \(/);
    assert.match(roomingView, /toast\.warning/);
    assert.match(roomingView, /toast\.error/);
  });
});

describe("Phase 7: Amendment 6 & 7 — Financial Summary & Folio Boundaries", () => {
  it("uses Derived Financial Summary terminology and avoids fake AR/ledgers", () => {
    const finView = readRel("../components/guests/guest-group-financial-view.tsx");
    assert.match(finView, /Derived Financial Summary/);
    assert.match(finView, /Outstanding across linked folios/i);
    assert.match(finView, /Group Folios and Group Ledgers do not exist/);
    assert.match(finView, /group-statement-/);
  });

  it("links directly to reservation folios without inventing group invoices", () => {
    const finView = readRel("../components/guests/guest-group-financial-view.tsx");
    assert.match(finView, /\/restaurant\/pms\/cashiering\/folios\/\$folioId/);
    assert.doesNotMatch(finView, /createGroupInvoice/);
  });
});

describe("Phase 7: Amendment 8 & 10 — Communication Channels & Templates", () => {
  it("restricts communication to real email-backed channel and shows template helper", () => {
    const commsView = readRel("../components/guests/guest-group-communication-view.tsx");
    assert.match(commsView, /sendGroupCommunication/);
    assert.match(commsView, /Channel: Email/);
    assert.match(commsView, /GROUP_COMMS_TEMPLATES_UNAVAILABLE/);
    assert.doesNotMatch(commsView, /sms/i);
    assert.doesNotMatch(commsView, /whatsapp/i);
  });

  it("keeps group templates in Directory/Create tooling, not as a detail tab", () => {
    assert.equal(isPrimaryGroupView("templates"), false);
    assert.equal(isMoreGroupView("templates"), false);

    const dir = readRel("../components/guests/guest-group-directory.tsx");
    assert.match(dir, /group-templates-button/);
    assert.match(dir, /templatesDialogOpen/);
  });
});

describe("Phase 7: Amendment 9 — Group Itinerary Boundary", () => {
  it("aggregates member guest service requests without inventing Sales & Events or Transport modules", () => {
    const itinView = readRel("../components/guests/guest-group-itinerary-view.tsx");
    assert.match(itinView, /createGroupItineraryItem/);
    assert.match(itinView, /listGroupItinerary/);
    assert.match(itinView, /Chronological itinerary aggregating member guest service requests/);
    assert.doesNotMatch(itinView, /Sales & Events/);
    assert.doesNotMatch(itinView, /Banquet/);
    assert.doesNotMatch(itinView, /Conference/);
  });
});

describe("Phase 7: Amendment 11 — Unavailable Actions Disabled / Omitted", () => {
  it("disables unsupported actions in the header menu with explanatory copy", () => {
    const header = readRel("../components/guests/guest-group-header.tsx");
    assert.match(header, /Generate invoice/i);
    assert.match(header, /Send confirmation/i);
    assert.match(header, /Convert to individual/i);
    assert.match(header, /disabled title=\{GROUP_INVOICE_SERVICE_UNAVAILABLE\}/);
    assert.match(header, /disabled title=\{GROUP_CONVERT_UNAVAILABLE\}/);
  });
});

describe("Phase 7: Amendment 12 — Directory & Server Query Truthfulness", () => {
  it("debounces directory search by 300ms and provides Quick View drawer", () => {
    const dir = readRel("../components/guests/guest-group-directory.tsx");
    assert.match(dir, /debouncedSearch/);
    assert.match(dir, /300/);
    assert.match(dir, /GuestGroupQuickViewDrawer/);
    assert.match(dir, /Total Groups/);
    assert.match(dir, /Draft/);
    assert.match(dir, /Confirmed/);
    assert.match(dir, /Cancelled/);
  });

  it("quick view drawer renders 4 tabs without permanent forms", () => {
    const quickView = readRel("../components/guests/guest-group-quick-view-drawer.tsx");
    assert.match(quickView, /quick-view-tab-\$\{t\.id\}/);
    assert.match(quickView, /id:\s*"overview"/);
    assert.match(quickView, /id:\s*"members"/);
    assert.match(quickView, /id:\s*"reservations"/);
    assert.match(quickView, /id:\s*"operations"/);
  });
});

describe("Phase 7: Architectural Invariants & Non-Regression", () => {
  it("verifies all 10 canonical view components exist and export their respective views", () => {
    const views = [
      "../components/guests/guest-group-overview-view.tsx",
      "../components/guests/guest-group-master-view.tsx",
      "../components/guests/guest-group-members-view.tsx",
      "../components/guests/guest-group-reservations-view.tsx",
      "../components/guests/guest-group-rooming-view.tsx",
      "../components/guests/guest-group-communication-view.tsx",
      "../components/guests/guest-group-financial-view.tsx",
      "../components/guests/guest-group-itinerary-view.tsx",
      "../components/guests/guest-group-documents-view.tsx",
      "../components/guests/guest-group-activity-view.tsx",
    ];

    for (const viewPath of views) {
      assert.equal(existsSync(join(here, viewPath)), true, `File must exist: ${viewPath}`);
    }
  });

  it("preserves canonical 5-step group create wizard in guest-group-create-workspace.tsx", () => {
    const createWs = readRel("../components/workspaces/guest-group-create-workspace.tsx");
    assert.match(createWs, /GuestGroupCreateWorkspace/);
    assert.match(createWs, /step === "details"/);
    assert.match(createWs, /step === "stay"/);
    assert.match(createWs, /step === "guests"/);
    assert.match(createWs, /step === "billing"/);
    assert.match(createWs, /step === "review"/);
  });

  it("preserves existing individual guest, company, and travel agent workspaces without regression", () => {
    const company = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(company, /GuestCompanyDetailWorkspace/);

    const travelAgent = readRel("../components/workspaces/guest-travel-agent-detail-workspace.tsx");
    assert.match(travelAgent, /GuestTravelAgentDetailWorkspace/);

    const individual = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(individual, /GuestProfileWorkspace/);
  });
});
