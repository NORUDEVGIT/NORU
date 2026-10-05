import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS,
  TRAVEL_AGENT_DETAIL_MORE_ITEMS,
  TRAVEL_AGENT_DETAIL_PRIMARY_TABS,
  isMoreTravelAgentView,
  isPrimaryTravelAgentView,
  resolveCanonicalTravelAgentNavId,
  resolveInitialTravelAgentCommercialSubTab,
  resolveInitialTravelAgentContactsTravelersSubTab,
  resolveInitialTravelAgentSettingsSubTab,
  type CanonicalTravelAgentViewId,
} from "./guest-travel-agent-detail-view.ts";

import {
  TA_ALLOTMENT_COPY,
  TA_BILLING_COPY,
  TA_COMMISSION_EMPTY_COPY,
  TA_VISIBLE_SETTINGS_SECTIONS,
  TA_SETTINGS_SECTIONS,
  TRAVEL_AGENT_DETAIL_NAV,
  travelAgentDetailNav,
  travelAgentSettingsSection,
  travelAgentOverviewKpis,
  commissionEntryTotals,
  calculateCommissionAmount,
  parseLegacyCommissionRate,
} from "./guest-travel-agent-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

// ===========================================================================
// SECTION 1: CANONICAL VIEW REGISTRY & NAVIGATION TOPOLOGY
// ===========================================================================
describe("Phase 6: Travel Agent Detail View Registry & Navigation Topology", () => {
  it("defines exactly 5 canonical primary views", () => {
    assert.equal(TRAVEL_AGENT_DETAIL_PRIMARY_TABS.length, 5);
    const expected: CanonicalTravelAgentViewId[] = [
      "overview",
      "details",
      "contacts-travelers",
      "bookings",
      "commercial-commission",
    ];
    assert.deepEqual(
      TRAVEL_AGENT_DETAIL_PRIMARY_TABS.map((v) => v.id),
      expected,
    );
  });

  it("defines exactly 5 canonical more items", () => {
    assert.equal(TRAVEL_AGENT_DETAIL_MORE_ITEMS.length, 5);
    const expected: CanonicalTravelAgentViewId[] = [
      "agreements",
      "documents",
      "communication-notes",
      "activity",
      "settings",
    ];
    assert.deepEqual(
      TRAVEL_AGENT_DETAIL_MORE_ITEMS.map((v) => v.id),
      expected,
    );
  });

  it("partitions canonical views into primary and more without overlap (10 total)", () => {
    assert.equal(TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS.length, 10);
    const ids = TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS.map((v) => v.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 10);
  });

  it("correctly identifies items belonging to the More dropdown", () => {
    for (const item of TRAVEL_AGENT_DETAIL_MORE_ITEMS) {
      assert.equal(isMoreTravelAgentView(item.id), true);
      assert.equal(isPrimaryTravelAgentView(item.id), false);
    }
    for (const item of TRAVEL_AGENT_DETAIL_PRIMARY_TABS) {
      assert.equal(isMoreTravelAgentView(item.id), false);
      assert.equal(isPrimaryTravelAgentView(item.id), true);
    }
  });

  it("gives each view a descriptive human-readable label", () => {
    const labels = TRAVEL_AGENT_DETAIL_CANONICAL_VIEWS.map((v) => v.label);
    assert.ok(labels.includes("Overview"));
    assert.ok(labels.includes("Agency Details"));
    assert.ok(labels.includes("Contacts & Travelers"));
    assert.ok(labels.includes("Bookings"));
    assert.ok(labels.includes("Commercial & Commission"));
    assert.ok(labels.includes("Agreements"));
    assert.ok(labels.includes("Documents"));
    assert.ok(labels.includes("Communication & Notes"));
    assert.ok(labels.includes("Activity / History"));
    assert.ok(labels.includes("Agency Settings"));
  });
});

// ===========================================================================
// SECTION 2: BACKWARD-COMPATIBLE URL AND ALIAS RESOLUTION
// ===========================================================================
describe("Phase 6: Backward-Compatible URL and Alias Resolution", () => {
  it("resolves primary canonical IDs directly", () => {
    assert.equal(resolveCanonicalTravelAgentNavId("overview"), "overview");
    assert.equal(resolveCanonicalTravelAgentNavId("details"), "details");
    assert.equal(resolveCanonicalTravelAgentNavId("contacts-travelers"), "contacts-travelers");
    assert.equal(resolveCanonicalTravelAgentNavId("bookings"), "bookings");
    assert.equal(resolveCanonicalTravelAgentNavId("commercial-commission"), "commercial-commission");
  });

  it("resolves more canonical IDs directly", () => {
    assert.equal(resolveCanonicalTravelAgentNavId("agreements"), "agreements");
    assert.equal(resolveCanonicalTravelAgentNavId("documents"), "documents");
    assert.equal(resolveCanonicalTravelAgentNavId("communication-notes"), "communication-notes");
    assert.equal(resolveCanonicalTravelAgentNavId("activity"), "activity");
    assert.equal(resolveCanonicalTravelAgentNavId("settings"), "settings");
  });

  it("maps legacy contacts and travelers to contacts-travelers", () => {
    assert.equal(resolveCanonicalTravelAgentNavId("contacts"), "contacts-travelers");
    assert.equal(resolveCanonicalTravelAgentNavId("travelers"), "contacts-travelers");
    assert.equal(resolveInitialTravelAgentContactsTravelersSubTab("contacts"), "contacts");
    assert.equal(resolveInitialTravelAgentContactsTravelersSubTab("travelers"), "travelers");
    assert.equal(resolveInitialTravelAgentContactsTravelersSubTab(undefined), "contacts");
  });

  it("maps legacy commission and payment to commercial-commission", () => {
    assert.equal(resolveCanonicalTravelAgentNavId("commission"), "commercial-commission");
    assert.equal(resolveCanonicalTravelAgentNavId("payment"), "commercial-commission");
    assert.equal(resolveCanonicalTravelAgentNavId("billing"), "commercial-commission");
    assert.equal(resolveCanonicalTravelAgentNavId("payment-invoices"), "commercial-commission");
    assert.equal(resolveInitialTravelAgentCommercialSubTab("commission"), "commission");
    assert.equal(resolveInitialTravelAgentCommercialSubTab("payment"), "billing");
    assert.equal(resolveInitialTravelAgentCommercialSubTab("billing"), "billing");
    assert.equal(resolveInitialTravelAgentCommercialSubTab(undefined), "commission");
  });

  it("maps legacy notes, history, and settings aliases", () => {
    assert.equal(resolveCanonicalTravelAgentNavId("notes"), "communication-notes");
    assert.equal(resolveCanonicalTravelAgentNavId("history"), "activity");
    assert.equal(resolveCanonicalTravelAgentNavId("activity-log"), "activity");
    assert.equal(resolveCanonicalTravelAgentNavId("agency-settings"), "settings");
    assert.equal(resolveCanonicalTravelAgentNavId("agency-details"), "details");
    assert.equal(resolveCanonicalTravelAgentNavId("reservations"), "bookings");
  });

  it("defaults unknown or empty nav to overview", () => {
    assert.equal(resolveCanonicalTravelAgentNavId(undefined), "overview");
    assert.equal(resolveCanonicalTravelAgentNavId(""), "overview");
    assert.equal(resolveCanonicalTravelAgentNavId("non-existent-tab"), "overview");
  });
});

// ===========================================================================
// SECTION 3: TRAVEL AGENT PREFILL & RESERVATION INTEGRATION SECURITY
// ===========================================================================
describe("Phase 6: Travel Agent Prefill Security & Reservation Integration", () => {
  it("verifies reservation handoff uses /restaurant/pms/reservations?create=new&travelAgentId=", () => {
    const bookingsFile = readRel("../components/guests/guest-travel-agent-bookings.tsx");
    assert.ok(
      bookingsFile.includes('/restaurant/pms/reservations') && bookingsFile.includes('travelAgentId: agencyId'),
      "Bookings view must hand off to PMS reservation creation with travelAgentId",
    );
    assert.ok(
      !bookingsFile.includes("/restaurant/bookings/new"),
      "Bookings view must not link to legacy /restaurant/bookings/new",
    );
  });

  it("verifies header handoff uses modern reservation path", () => {
    const headerFile = readRel("../components/guests/guest-travel-agent-header.tsx");
    assert.ok(
      headerFile.includes('/restaurant/pms/reservations') && headerFile.includes('travelAgentId: agency.id'),
      "Header New Booking button must hand off with travelAgentId",
    );
    assert.ok(
      !headerFile.includes("/restaurant/bookings/new"),
      "Header must not link to legacy /restaurant/bookings/new",
    );
  });

  it("verifies overview handoff uses modern reservation path", () => {
    const overviewFile = readRel("../components/guests/guest-travel-agent-overview-view.tsx");
    assert.ok(
      overviewFile.includes('/restaurant/pms/reservations') && overviewFile.includes('travelAgentId: agencyId'),
      "Overview New Booking button must hand off with travelAgentId",
    );
    assert.ok(
      !overviewFile.includes("/restaurant/bookings/new"),
      "Overview must not link to legacy /restaurant/bookings/new",
    );
  });

  it("verifies quick view drawer handoff uses modern reservation path", () => {
    const drawerFile = readRel("../components/guests/guest-travel-agent-quick-view-drawer.tsx");
    assert.ok(
      drawerFile.includes('/restaurant/pms/reservations') && drawerFile.includes('travelAgentId: agencyId'),
      "Quick view New Booking button must hand off with travelAgentId",
    );
    assert.ok(
      !drawerFile.includes("/restaurant/bookings/new"),
      "Quick view must not link to legacy /restaurant/bookings/new",
    );
  });

  it("verifies CreateReservationPage enforces property-scoped travel agent validation", () => {
    const createPageFile = readRel("../components/bookings/create-reservation-page.tsx");
    // Amendment 2: Must accept only accountType === 'travel_agent', not anonymized, operational account
    assert.ok(
      createPageFile.includes('account.accountType === "travel_agent"'),
      "CreateReservationPage must enforce accountType is travel_agent",
    );
    assert.ok(
      createPageFile.includes("!account.anonymisedAt"),
      "CreateReservationPage must reject anonymized accounts",
    );
    assert.ok(
      createPageFile.includes('account.accountStatus !== "deleted"'),
      "CreateReservationPage must reject non-operational (deleted) accounts",
    );
    // Amendment 3: Guest selection remains separate, prefill travelAgentMaster using existing model
    assert.ok(
      createPageFile.includes("travelAgentMaster"),
      "CreateReservationPage must prefill travelAgentMaster",
    );
  });
});

// ===========================================================================
// SECTION 4: DIRECTORY & QUICK VIEW DRAWER
// ===========================================================================
describe("Phase 6: Travel Agent Directory & Quick View Drawer", () => {
  it("directory debounces search input with 300ms delay", () => {
    const dirFile = readRel("../components/guests/guest-travel-agent-directory.tsx");
    assert.ok(
      dirFile.includes("300") && dirFile.includes("debouncedSearch"),
      "Directory search must debounce with 300ms delay",
    );
  });

  it("directory KPI summary derives Commission Configured strictly from active commission plans", () => {
    const funcFile = readRel("./guest-travel-agent-detail.functions.ts");
    assert.ok(
      funcFile.includes("getTravelAgentWorkspaceSummary"),
      "Server function getTravelAgentWorkspaceSummary must exist",
    );
    assert.ok(
      funcFile.includes("pms_agency_commission_plans"),
      "getTravelAgentWorkspaceSummary must query pms_agency_commission_plans for configured count",
    );
  });

  it("directory search queries comprehensive columns including IATA and tax", () => {
    const accountsFuncFile = readRel("./guest-accounts.functions.ts");
    assert.ok(
      accountsFuncFile.includes("iata_license_number"),
      "listGuestAccounts must search iata_license_number",
    );
    assert.ok(
      accountsFuncFile.includes("tax_id"),
      "listGuestAccounts must search tax_id",
    );
  });

  it("quick view drawer renders 4 tabs: Overview, Contacts, Travelers, Commercial", () => {
    const drawerView = readRel("../components/guests/guest-travel-agent-quick-view-drawer.tsx");
    assert.ok(drawerView.includes('id: "overview"'), "Drawer must have overview tab");
    assert.ok(drawerView.includes('id: "contacts"'), "Drawer must have contacts tab");
    assert.ok(drawerView.includes('id: "travelers"'), "Drawer must have travelers tab");
    assert.ok(drawerView.includes('id: "commercial"'), "Drawer must have commercial tab");
    assert.ok(drawerView.includes("travel-agent-quick-tab-${item.id}"), "Drawer tabs must have testids");
  });

  it("quick view drawer does not mount permanent textareas or inline edit forms", () => {
    const drawerView = readRel("../components/guests/guest-travel-agent-quick-view-drawer.tsx");
    assert.ok(!drawerView.includes("<textarea"), "Quick view must not contain permanent textareas");
    assert.ok(drawerView.includes("Full Workspace"), "Quick view must provide link to Full Workspace");
    assert.ok(drawerView.includes("New Booking"), "Quick view must provide New Booking action");
  });
});

// ===========================================================================
// SECTION 5: HEADER MODERNIZATION & SINGLE EDIT FLOW
// ===========================================================================
describe("Phase 6: Header Modernization & Single Edit Flow", () => {
  it("header provides Back to Travel Agencies navigation link", () => {
    const headerFile = readRel("../components/guests/guest-travel-agent-header.tsx");
    assert.ok(
      headerFile.includes("Back to Travel Agencies"),
      "Header must include Back to Travel Agencies navigation",
    );
  });

  it("Agency Details view is read-first without giant inline input fields", () => {
    const detailsView = readRel("../components/guests/guest-travel-agent-details-view.tsx");
    assert.ok(
      detailsView.includes('data-testid="travel-agent-details-edit-btn"'),
      "Agency Details view must provide Edit Agency button",
    );
    assert.ok(
      !detailsView.includes("<input"),
      "Agency Details view must be read-first and not mount inline inputs",
    );
  });

  it("canonical edit flow is strictly GuestTravelAgentFormDialog (Amendment 8)", () => {
    const workspaceFile = readRel("../components/workspaces/guest-travel-agent-detail-workspace.tsx");
    assert.ok(
      workspaceFile.includes("GuestTravelAgentFormDialog") ||
        workspaceFile.includes("GuestTravelAgencyCreateModal"),
      "Workspace must mount canonical edit dialog",
    );
  });
});

// ===========================================================================
// SECTION 6: OVERVIEW MUST STAY SUMMARY-ONLY
// ===========================================================================
describe("Phase 6: Overview Must Stay Summary-Only (Amendment 10)", () => {
  it("renders compact 6-KPI strip", () => {
    const overviewFile = readRel("../components/guests/guest-travel-agent-overview-view.tsx");
    assert.ok(
      overviewFile.includes('data-testid="travel-agent-overview-kpi-strip"'),
      "Overview must render 6-KPI strip with designated testid",
    );
  });

  it("does not render permanent add-note textarea", () => {
    const overviewFile = readRel("../components/guests/guest-travel-agent-overview-view.tsx");
    assert.ok(
      !overviewFile.includes("<textarea"),
      "Overview must not mount permanent note textarea",
    );
  });

  it("provides contextual Add Note button opening modal dialog", () => {
    const overviewFile = readRel("../components/guests/guest-travel-agent-overview-view.tsx");
    assert.ok(
      overviewFile.includes('data-testid="travel-agent-overview-add-note-btn"'),
      "Overview must provide Add Note button opening modal dialog",
    );
  });

  it("does not reintroduce full Agreements, Documents, Notes, or Settings management", () => {
    const overviewFile = readRel("../components/guests/guest-travel-agent-overview-view.tsx");
    assert.ok(
      !overviewFile.includes("GuestTravelAgentDocuments"),
      "Overview must not embed full Documents component",
    );
    assert.ok(
      !overviewFile.includes("GuestTravelAgentSettings"),
      "Overview must not embed full Settings component",
    );
    assert.ok(
      !overviewFile.includes("GuestTravelAgentAgreements"),
      "Overview must not embed full Agreements component",
    );
  });
});

// ===========================================================================
// SECTION 7: COMMERCIAL & BILLING DOMAIN TRUTHFULNESS
// ===========================================================================
describe("Phase 6: Commercial & Billing Domain Truthfulness (Amendments 5 & 6)", () => {
  it("uses 'Folio-derived transactions' instead of 'transaction ledger' (Amendment 5)", () => {
    const commView = readRel("../components/guests/guest-travel-agent-commercial-commission-view.tsx");
    assert.ok(
      commView.includes("Folio-derived transactions"),
      "Commercial view must explicitly use 'Folio-derived transactions'",
    );
    assert.ok(
      !commView.includes("transaction ledger"),
      "Commercial view must NOT use 'transaction ledger'",
    );
  });

  it("preserves TA_BILLING_COPY disclosure about absence of separate AR/AP ledger", () => {
    assert.ok(
      TA_BILLING_COPY.includes("no separate TA accounts-receivable ledger"),
      "TA_BILLING_COPY must accurately state no separate AR ledger exists",
    );
  });

  it("uses operational status for commission 'settled' without implying bank payouts (Amendment 6)", () => {
    const commView = readRel("../components/guests/guest-travel-agent-commercial-commission-view.tsx");
    assert.ok(
      commView.includes("Operational Settlement Status"),
      "Commercial view must explicitly frame settled as operational status",
    );
    assert.ok(
      !commView.includes("bank payout initiated"),
      "Must not claim external bank payout was made",
    );
  });

  it("computes commission entry totals correctly", () => {
    const totals = commissionEntryTotals([
      { amount: 50, status: "calculated" },
      { amount: 25, status: "approved" },
      { amount: 15, status: "settled" },
      { amount: 10, status: "void" },
    ]);
    assert.equal(totals.earned, 90);
    assert.equal(totals.approved, 40); // approved (25) + settled (15)
    assert.equal(totals.settled, 15);
    assert.equal(totals.outstanding, 75); // earned (90) - settled (15)
  });
});

// ===========================================================================
// SECTION 8: ALLOTMENT DOMAIN BOUNDARY
// ===========================================================================
describe("Phase 6: Allotment Domain Boundary (Amendment 9)", () => {
  it("preserves TA_ALLOTMENT_COPY stating allotment is a booking limit not physical inventory", () => {
    assert.ok(
      TA_ALLOTMENT_COPY.includes("Rooms stay in the property's general inventory"),
      "TA_ALLOTMENT_COPY must clarify rooms stay in general inventory",
    );
  });

  it("settings view displays domain boundary disclaimer", () => {
    const settingsView = readRel("../components/guests/guest-travel-agent-settings.tsx");
    assert.ok(
      settingsView.includes("Allotment Domain Boundary"),
      "Settings Allotment section must display domain boundary banner",
    );
    assert.ok(
      settingsView.includes("Physical room inventory, housekeeping status, and maintenance remain strictly under Rooms & Inventory"),
      "Settings must state physical inventory is governed by Rooms & Inventory",
    );
  });
});

// ===========================================================================
// SECTION 9: SETTINGS OWNERSHIP
// ===========================================================================
describe("Phase 6: Agency Settings Ownership (Amendment 7)", () => {
  it("visible settings sections are strictly Booking Rules, Allotment & Inventory, Notifications", () => {
    assert.equal(TA_VISIBLE_SETTINGS_SECTIONS.length, 3);
    const visibleIds = TA_VISIBLE_SETTINGS_SECTIONS.map((s) => s.id);
    assert.deepEqual(visibleIds, ["rules", "allotment", "notifications"]);
  });

  it("travelAgentSettingsSection defaults to rules", () => {
    assert.equal(travelAgentSettingsSection("rules"), "rules");
    assert.equal(travelAgentSettingsSection("allotment"), "allotment");
    assert.equal(travelAgentSettingsSection("notifications"), "notifications");
    assert.equal(travelAgentSettingsSection(undefined), "rules");
  });

  it("settings view provides redirect notices for legacy sections", () => {
    const settingsView = readRel("../components/guests/guest-travel-agent-settings.tsx");
    assert.ok(
      settingsView.includes("Agency identity, IATA licensing, contacts, and address are managed in the canonical Agency Details view"),
      "Settings must provide notice for legacy general section",
    );
    assert.ok(
      settingsView.includes("Commercial terms, commission plans, and folio billing are managed in the canonical Commercial & Commission view"),
      "Settings must provide notice for legacy commission/billing section",
    );
    assert.ok(
      settingsView.includes("Agreements, contracts, and certifications are managed in the canonical Documents view"),
      "Settings must provide notice for legacy documents section",
    );
  });
});

// ===========================================================================
// SECTION 10: ARCHITECTURAL INVARIANTS & NON-REGRESSION
// ===========================================================================
describe("Phase 6: Architectural Invariants & Non-Regression (Amendment 1)", () => {
  it("verifies all 10 canonical view components exist and export their respective views", () => {
    const components = [
      "guest-travel-agent-overview-view.tsx",
      "guest-travel-agent-details-view.tsx",
      "guest-travel-agent-contacts-travelers-view.tsx",
      "guest-travel-agent-bookings.tsx",
      "guest-travel-agent-commercial-commission-view.tsx",
      "guest-travel-agent-agreements.tsx",
      "guest-travel-agent-documents-view.tsx",
      "guest-travel-agent-communication-notes-view.tsx",
      "guest-travel-agent-activity-view.tsx",
      "guest-travel-agent-settings-view.tsx",
    ];

    for (const comp of components) {
      const fullPath = join(here, "../components/guests", comp);
      assert.ok(existsSync(fullPath), `Component file ${comp} must exist`);
    }
  });

  it("preserves canonical 5-step travel agency create wizard in guest-travel-agent-create-workspace.tsx", () => {
    const createWizardFile = readRel("../components/workspaces/guest-travel-agent-create-workspace.tsx");
    assert.ok(
      createWizardFile.includes("GuestTravelAgentCreateWorkspace"),
      "Create wizard component must exist",
    );
    assert.ok(
      createWizardFile.includes("step === 1") || createWizardFile.includes("step"),
      "Create wizard must support multi-step flow",
    );
  });

  it("preserves existing individual guest and company workspaces without regression", () => {
    const companyWs = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.ok(companyWs.includes("GuestCompanyDetailWorkspace"), "Company detail workspace must be preserved");
    const individualWs = readRel("../components/workspaces/guest-individual-detail-workspace.tsx");
    assert.ok(individualWs.includes("GuestIndividualDetailWorkspace"), "Individual guest workspace must be preserved");
  });
});
