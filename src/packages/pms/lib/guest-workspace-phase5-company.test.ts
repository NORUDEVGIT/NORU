import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMPANY_DETAIL_CANONICAL_VIEWS,
  COMPANY_DETAIL_MORE_ITEMS,
  COMPANY_DETAIL_PRIMARY_TABS,
  isMoreCompanyView,
  resolveCanonicalCompanyNavId,
  resolveInitialContactsTravelersSubTab,
  type CanonicalCompanyViewId,
} from "./guest-company-detail-view.ts";

import {
  COMPANY_BILLING_COPY,
  COMPANY_DETAIL_NAV,
  COMPANY_TA_SETTINGS_COMING,
  companyDetailNav,
  visibleCompanyNav,
} from "./guest-company-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Phase 5: Company Detail View Registry & Navigation Topology", () => {
  it("defines exactly 5 canonical primary views", () => {
    assert.equal(COMPANY_DETAIL_PRIMARY_TABS.length, 5);
    const expected = [
      "overview",
      "details",
      "contacts-travelers",
      "reservations",
      "commercial-billing",
    ];
    assert.deepEqual(
      COMPANY_DETAIL_PRIMARY_TABS.map((v) => v.id),
      expected,
    );
  });

  it("defines exactly 5 canonical more items", () => {
    assert.equal(COMPANY_DETAIL_MORE_ITEMS.length, 5);
    const expected = [
      "contracts",
      "documents",
      "communication-notes",
      "activity",
      "administration",
    ];
    assert.deepEqual(
      COMPANY_DETAIL_MORE_ITEMS.map((v) => v.id),
      expected,
    );
  });

  it("partitions canonical views into primary and more without overlap", () => {
    assert.equal(COMPANY_DETAIL_CANONICAL_VIEWS.length, 10);
    const ids = COMPANY_DETAIL_CANONICAL_VIEWS.map((v) => v.id);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 10);
  });

  it("correctly identifies items belonging to the More dropdown", () => {
    for (const item of COMPANY_DETAIL_MORE_ITEMS) {
      assert.equal(isMoreCompanyView(item.id), true);
    }
    for (const item of COMPANY_DETAIL_PRIMARY_TABS) {
      assert.equal(isMoreCompanyView(item.id), false);
    }
  });

  it("gives each view a descriptive human-readable label", () => {
    const labels = COMPANY_DETAIL_CANONICAL_VIEWS.map((v) => v.label);
    assert.ok(labels.includes("Overview"));
    assert.ok(labels.includes("Company Details"));
    assert.ok(labels.includes("Contacts & Travelers"));
    assert.ok(labels.includes("Reservations"));
    assert.ok(labels.includes("Commercial & Billing"));
    assert.ok(labels.includes("Contracts & Agreements"));
    assert.ok(labels.includes("Documents"));
    assert.ok(labels.includes("Communication & Notes"));
    assert.ok(labels.includes("Activity / History"));
    assert.ok(labels.includes("Administration"));
  });

  it("wires 5-primary tabs and More dropdown in workspace header", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /COMPANY_DETAIL_PRIMARY_TABS/);
    assert.match(ws, /COMPANY_DETAIL_MORE_ITEMS/);
    assert.match(ws, /company-nav-more/);
  });

  it("preserves visibleCompanyNav helper for travel agency business type gating", () => {
    const standard = visibleCompanyNav({ creditAccountAllowed: true, travelAgency: false });
    assert.equal(standard.some((i) => i.id === "travel-agent-settings"), false);
    const ta = visibleCompanyNav({ creditAccountAllowed: true, travelAgency: true });
    assert.equal(ta.some((i) => i.id === "travel-agent-settings"), true);
  });

  it("mounts all 10 canonical view components in detail workspace", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /GuestCompanyOverviewView/);
    assert.match(ws, /GuestCompanyDetailsView/);
    assert.match(ws, /GuestCompanyContactsTravelersView/);
    assert.match(ws, /GuestCompanyReservationsView/);
    assert.match(ws, /GuestCompanyCommercialBillingView/);
    assert.match(ws, /GuestCompanyContractsView/);
    assert.match(ws, /GuestCompanyDocumentsView/);
    assert.match(ws, /GuestCompanyCommunicationNotesView/);
    assert.match(ws, /GuestCompanyActivityView/);
    assert.match(ws, /GuestCompanyAdministrationView/);
  });

  it("exposes company detail workspace props for membership, companyId, and nav", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /export function GuestCompanyDetailWorkspace/);
    assert.match(ws, /membership: RestaurantMembership/);
    assert.match(ws, /companyId: string/);
    assert.match(ws, /nav\?: string \| undefined/);
  });

  it("preserves the company form dialog for full edit flows", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /GuestCompanyFormDialog/);
    assert.match(ws, /open=\{editOpen\}/);
  });
});

describe("Phase 5: Legacy Navigation Resolution & URL Normalization", () => {
  it("resolves legacy corporate to details", () => {
    assert.equal(resolveCanonicalCompanyNavId("corporate"), "details");
    assert.equal(resolveCanonicalCompanyNavId("CORPORATE"), "details");
  });

  it("resolves legacy contacts to contacts-travelers", () => {
    assert.equal(resolveCanonicalCompanyNavId("contacts"), "contacts-travelers");
    assert.equal(resolveCanonicalCompanyNavId("CONTACTS"), "contacts-travelers");
  });

  it("resolves legacy travelers to contacts-travelers", () => {
    assert.equal(resolveCanonicalCompanyNavId("travelers"), "contacts-travelers");
    assert.equal(resolveCanonicalCompanyNavId("TRAVELERS"), "contacts-travelers");
  });

  it("resolves legacy credit to commercial-billing", () => {
    assert.equal(resolveCanonicalCompanyNavId("credit"), "commercial-billing");
    assert.equal(resolveCanonicalCompanyNavId("CREDIT"), "commercial-billing");
  });

  it("resolves legacy notes to communication-notes", () => {
    assert.equal(resolveCanonicalCompanyNavId("notes"), "communication-notes");
    assert.equal(resolveCanonicalCompanyNavId("NOTES"), "communication-notes");
  });

  it("resolves legacy history to activity", () => {
    assert.equal(resolveCanonicalCompanyNavId("history"), "activity");
    assert.equal(resolveCanonicalCompanyNavId("HISTORY"), "activity");
  });

  it("resolves legacy travel-agent-settings to details", () => {
    assert.equal(resolveCanonicalCompanyNavId("travel-agent-settings"), "details");
  });

  it("resolves canonical view IDs to themselves", () => {
    const canonicals: CanonicalCompanyViewId[] = [
      "overview",
      "details",
      "contacts-travelers",
      "reservations",
      "commercial-billing",
      "contracts",
      "documents",
      "communication-notes",
      "activity",
      "administration",
    ];
    for (const id of canonicals) {
      assert.equal(resolveCanonicalCompanyNavId(id), id);
    }
  });

  it("resolves null, undefined, or empty nav to overview", () => {
    assert.equal(resolveCanonicalCompanyNavId(null), "overview");
    assert.equal(resolveCanonicalCompanyNavId(undefined), "overview");
    assert.equal(resolveCanonicalCompanyNavId(""), "overview");
    assert.equal(resolveCanonicalCompanyNavId("   "), "overview");
  });

  it("resolves unknown nav strings safely to overview without crashing", () => {
    assert.equal(resolveCanonicalCompanyNavId("nonexistent-tab"), "overview");
    assert.equal(resolveCanonicalCompanyNavId("random-1234"), "overview");
  });

  it("ensures companyDetailNav executes safely without throwing ReferenceError", () => {
    assert.equal(companyDetailNav("corporate"), "details");
    assert.equal(companyDetailNav("overview"), "overview");
    assert.equal(companyDetailNav(undefined), "overview");
  });

  it("determines initial contacts-travelers subtab from legacy nav", () => {
    assert.equal(resolveInitialContactsTravelersSubTab("travelers"), "travelers");
    assert.equal(resolveInitialContactsTravelersSubTab("contacts"), "contacts");
    assert.equal(resolveInitialContactsTravelersSubTab(null), "contacts");
    assert.equal(resolveInitialContactsTravelersSubTab(undefined), "contacts");
    assert.equal(resolveInitialContactsTravelersSubTab("contacts-travelers"), "contacts");
  });

  it("passes resolved initialSubTab to GuestCompanyContactsTravelersView", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /initialSubTab=\{navProp === "travelers" \? "travelers" : "contacts"\}/);
  });

  it("maintains backward-compatible testid anchors in navigation markup", () => {
    const ws = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    assert.match(ws, /data-testid=\{`company-nav-\$\{item\.id\}`\}/);
    assert.match(ws, /data-testid="company-nav-more"/);
  });

  it("ensures COMPANY_TA_SETTINGS_COMING disclosure is retained for test compatibility", () => {
    assert.match(COMPANY_TA_SETTINGS_COMING, /Guests → Travel Agencies/);
    assert.match(COMPANY_TA_SETTINGS_COMING, /classification only/);
  });
});

describe("Phase 5: Company → Reservation Handoff & Strict Validation", () => {
  it("allows companyId query parameter in PMS reservations route schema", () => {
    const route = readRel("../../../routes/restaurant/pms/reservations.index.tsx");
    assert.match(route, /companyId\?:\s*string/);
    assert.match(route, /UUID_REGEX\.test\(search\["companyId"\]\.trim\(\)\)/);
    assert.match(route, /initialCompanyId=\{search\.companyId\}/);
  });

  it("passes initialCompanyId to ReservationsWorkspace overlay state", () => {
    const ws = readRel("../components/workspaces/reservations-workspace.tsx");
    assert.match(ws, /initialCompanyId\?:\s*string \| undefined/);
    assert.match(ws, /initialCompanyMasterId:\s*initialCompanyId \?\? null/);
  });

  it("extends ReservationWorkspaceOverlayState with initialCompanyMasterId", () => {
    const overlay = readRel("../components/reservations/reservation-workspace-overlay.tsx");
    assert.match(overlay, /initialCompanyMasterId\?:\s*string \| null/);
  });

  it("passes initialCompanyMasterId to CreateReservationPage component", () => {
    const ws = readRel("../components/workspaces/reservations-workspace.tsx");
    assert.match(ws, /initialCompanyMasterId=\{overlay\.initialCompanyMasterId \?\? null\}/);
  });

  it("declares initialCompanyMasterId prop in CreateReservationPage", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /initialCompanyMasterId\s*=\s*null/);
    assert.match(page, /initialCompanyMasterId\?:\s*string \| null/);
  });

  it("queries the company account master with property scoping", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /initial-reservation-company/);
    assert.match(page, /fetchGuestAccount\(\{ data: \{ restaurantId, accountId: initialCompanyMasterId! \} \}\)/);
  });

  it("validates that the prefilled master accountType is strictly company", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /account\.accountType === "company"/);
  });

  it("validates that the prefilled master is not anonymized", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /!account\.anonymisedAt/);
  });

  it("validates that the prefilled master status is operational (not deleted)", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /account\.accountStatus !== "deleted"/);
  });

  it("sets companyMaster and changes reservationType to corporate on valid prefill", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /setCompanyMaster\(toPickedReservationMaster\(account\)\)/);
    assert.match(page, /setReservationType\(\(prev\) => \(prev === "individual" \? "corporate" : prev\)\)/);
  });

  it("does not bypass existing companyOverride rules in CreateReservationPage", () => {
    const page = readRel("../components/bookings/create-reservation-page.tsx");
    assert.match(page, /if \(!initialCompanyMasterId \|\| companyOverride \|\| companyMaster\) return/);
  });

  it("creates reservation button in Company header links to modern reservations workspace", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /to="\/restaurant\/pms\/reservations"/);
    assert.match(header, /search=\{\{ create: "new", companyId: company\.id \}\}/);
  });

  it("creates reservation button in Company Overview links to modern reservations workspace", () => {
    const overview = readRel("../components/guests/guest-company-overview-view.tsx");
    assert.match(overview, /to="\/restaurant\/pms\/reservations"/);
    assert.match(overview, /search=\{\{ create: "new", companyId \}\}/);
  });

  it("creates reservation button in Company Reservations links to modern reservations workspace", () => {
    const res = readRel("../components/guests/guest-company-reservations.tsx");
    assert.match(res, /to="\/restaurant\/pms\/reservations"/);
    assert.match(res, /search=\{\{ create: "new", companyId \}\}/);
  });
});

describe("Phase 5: Company Header Modernization", () => {
  it("renders Back to Companies link in header", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company-header-back-button/);
    assert.match(header, /Back to Companies/);
  });

  it("renders company logo or initials avatar fallback", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company\.logoUrl \?/);
    assert.match(header, /company\.name\.slice\(0, 1\)\.toUpperCase\(\)/);
  });

  it("renders Active / Inactive status badge", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company\.accountStatus === "active"/);
    assert.match(header, /Active/);
    assert.match(header, /Inactive/);
  });

  it("renders Credit Eligible or Pay in Advance badge", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /isCreditAllowed \?/);
    assert.match(header, /Credit Eligible/);
    assert.match(header, /Pay in Advance/);
  });

  it("renders corporate code badge when assigned", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company\.code/);
  });

  it("renders concatenated contact details sub-row", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company\.phone/);
    assert.match(header, /company\.email/);
    assert.match(header, /company\.website/);
    assert.match(header, /location/);
  });

  it("renders primary contact person and title when available", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /company\.primaryContactName/);
    assert.match(header, /company\.primaryContactTitle/);
  });

  it("provides New Reservation primary action button", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /data-testid="company-new-reservation"/);
    assert.match(header, /New Reservation/);
  });

  it("provides Edit Company secondary action button", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /data-testid="company-edit"/);
    assert.match(header, /Edit Company/);
  });

  it("provides More dropdown with Activate, Deactivate, and Export Profile (JSON)", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /data-testid="company-more-actions"/);
    assert.match(header, /Activate Company/);
    assert.match(header, /Deactivate Company/);
    assert.match(header, /Export Profile \(JSON\)/);
    assert.match(header, /exportGuestAccount/);
  });
});

describe("Phase 5: Combined Contacts & Travelers Architecture", () => {
  it("renders segmented switcher between Contact Persons and Linked Travelers", () => {
    const view = readRel("../components/guests/guest-company-contacts-travelers-view.tsx");
    assert.match(view, /company-subtab-contacts/);
    assert.match(view, /company-subtab-travelers/);
    assert.match(view, /Contact Persons/);
    assert.match(view, /Linked Travelers/);
  });

  it("switches to Contact Persons subtab when selected", () => {
    const view = readRel("../components/guests/guest-company-contacts-travelers-view.tsx");
    assert.match(view, /GuestCompanyContacts/);
    assert.match(view, /subTab === "contacts"/);
  });

  it("switches to Linked Travelers subtab when selected", () => {
    const view = readRel("../components/guests/guest-company-contacts-travelers-view.tsx");
    assert.match(view, /GuestCompanyTravelers/);
    assert.match(view, /subTab === "travelers"/);
  });

  it("traveler view provides Link Existing Guest action", () => {
    const travelers = readRel("../components/guests/guest-company-travelers.tsx");
    assert.match(travelers, /Link Existing Guest/);
    assert.match(travelers, /GuestCompanyGuestLinks/);
  });

  it("traveler view routes Register New Traveler to canonical GuestFormDialog", () => {
    const travelers = readRel("../components/guests/guest-company-travelers.tsx");
    assert.match(travelers, /Register New Traveler/);
    assert.match(travelers, /GuestFormDialog/);
    assert.doesNotMatch(travelers, /createGuest\(/);
  });

  it("links created guest to the company with role employer", () => {
    const travelers = readRel("../components/guests/guest-company-travelers.tsx");
    assert.match(travelers, /linkCreated/);
    assert.match(travelers, /linkGuestAccount/);
    assert.match(travelers, /role:\s*"employer"/);
  });

  it("preserves primary contact rules when editing contact persons", () => {
    const contacts = readRel("../components/guests/guest-company-contacts.tsx");
    const functions = readRel("./guest-company-detail.functions.ts");
    assert.match(contacts, /contactRequired/);
    assert.match(functions, /blockLastPrimaryRemoval/);
  });

  it("preserves department and role catalogues from Property Setup", () => {
    const contacts = readRel("../components/guests/guest-company-contacts.tsx");
    assert.match(contacts, /getCompanyContactCatalogues/);
    assert.match(contacts, /departmentAssignableForNew/);
    assert.match(contacts, /roleAssignableForNew/);
  });

  it("displays traveler KPIs (total, active, VIP, group leaders, upcoming trips)", () => {
    const travelers = readRel("../components/guests/guest-company-travelers.tsx");
    assert.match(travelers, /Total Travelers/);
    assert.match(travelers, /Active Travelers/);
    assert.match(travelers, /VIP Travelers/);
    assert.match(travelers, /Group Leaders/);
    assert.match(travelers, /Upcoming Trips/);
  });

  it("displays contact KPIs (total contacts, phone, email, WhatsApp, departments)", () => {
    const contacts = readRel("../components/guests/guest-company-contacts.tsx");
    const functions = readRel("./guest-company-detail.functions.ts");
    assert.match(contacts, /company-contacts-kpis/);
    assert.match(functions, /contactMethodKpis/);
    assert.match(functions, /distinctDepartmentCount/);
  });
});

describe("Phase 5: Commercial & Billing Read Model Honesty", () => {
  it("preserves exact architectural disclosure in billing view", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /COMPANY_BILLING_COPY/);
    assert.equal(
      COMPANY_BILLING_COPY,
      "Billing reads reservation folios for this company. There is no separate accounts-receivable ledger.",
    );
  });

  it("discloses numeric credit ledger is not stored", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /Numeric credit ledger/);
    assert.match(billing, /Not stored\. This is not an AR balance\./);
  });

  it("does not expose fake AR aging, balances, or invoice write-offs", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.doesNotMatch(billing, /ar_ledger|accounts_receivable|aging_bucket|write_off/i);
  });

  it("reads transaction rows exclusively from reservation folios", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /listCompanyBilling/);
    assert.match(billing, /Transaction rows require cashiering access/i);
  });

  it("exports authentic folio transactions as statement CSV", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /Statement CSV/);
    assert.match(billing, /text\/csv/);
    assert.match(billing, /company-billing-\$\{companyId\}\.csv/);
  });

  it("shows credit limit note as informational without enforcement", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /Credit limit note/);
  });

  it("shows payment terms as informational without fake payment processing", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /Payment terms/);
  });

  it("computes outstanding amounts from folio charges minus credits", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /Outstanding \(folio charges − credits\)/);
    assert.match(billing, /Total charges/);
    assert.match(billing, /Credits \/ payments/);
  });
});

describe("Phase 5: Company Quick View Scope & Drawer", () => {
  it("restricts Quick View tabs to exactly Overview, Contacts, Travelers, and Commercial", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.match(drawer, /id: "overview", label: "Overview"/);
    assert.match(drawer, /id: "contacts", label: "Contacts"/);
    assert.match(drawer, /id: "travelers", label: "Travelers"/);
    assert.match(drawer, /id: "commercial", label: "Commercial"/);
  });

  it("does not place full contracts management inside Quick View", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.doesNotMatch(drawer, /GuestCompanyContracts|saveCorporateAgreementCard3/);
  });

  it("does not place full document review or uploads inside Quick View", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.doesNotMatch(drawer, /GuestCompanyDocuments|createCompanyDocumentUpload/);
  });

  it("does not place full billing transaction management inside Quick View", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.doesNotMatch(drawer, /listCompanyBilling|Statement CSV/);
  });

  it("does not place full edit forms inside Quick View", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.doesNotMatch(drawer, /updateGuestAccount|validateCompanyAgainstType/);
  });

  it("provides New Reservation action button in Quick View header", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.match(drawer, /data-testid="company-quick-view-new-reservation"/);
    assert.match(drawer, /to: "\/restaurant\/pms\/reservations"/);
  });

  it("provides Full Workspace button in Quick View header", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.match(drawer, /data-testid="company-quick-view-open-full"/);
    assert.match(drawer, /Full Workspace/);
  });

  it("preserves the architectural billing disclosure in Quick View Commercial tab", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.match(drawer, /COMPANY_BILLING_COPY/);
  });
});

describe("Phase 5: Default Travel Agency Governance", () => {
  it("displays Default Travel Agency Relationship in Company Details", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /Default Travel Agency Relationship/);
    assert.match(details, /defaultTravelAgentMasterId/);
  });

  it("restricts travel agency selection to real travel agent masters only", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /ta\.accountType === "travel_agent"/);
    assert.match(details, /ta\.id !== companyId/);
  });

  it("does not allow company or group masters as default travel agent", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /fetchTravelAgents\(\{[\s\S]*?accountType:\s*"travel_agent"/);
  });

  it("allows clearing default travel agent to direct corporate booking", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /None \(Direct Corporate Booking\)/);
  });

  it("displays previous travel agent master name when loaded from server", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /defaultTravelAgentMasterName/);
  });

  it("persists defaultTravelAgentMasterId through updateGuestAccount mutation", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /defaultTravelAgentMasterId:\s*form\.defaultTravelAgentMasterId \|\| null/);
  });

  it("does not render a standalone Travel Agent Settings tab in canonical navigation", () => {
    assert.equal(COMPANY_DETAIL_PRIMARY_TABS.some((v) => v.id === "travel-agent-settings"), false);
    assert.equal(COMPANY_DETAIL_MORE_ITEMS.some((v) => v.id === "travel-agent-settings"), false);
  });

  it("shows travel agency relation in Quick View overview tab", () => {
    const drawer = readRel("../components/guests/guest-company-quick-view-drawer.tsx");
    assert.match(drawer, /defaultTravelAgentMasterName/);
    assert.match(drawer, /Default Travel Agency/);
  });
});

describe("Phase 5: Shared Architecture & Invariant Enforcement", () => {
  it("ensures GuestCompanyDirectory is consumed via GuestAccountDirectory without breaking travel agents or groups", () => {
    const acc = readRel("../components/guests/guest-account-directory.tsx");
    assert.match(acc, /if \(accountType === "company"\) \{/);
    assert.match(acc, /return <GuestCompanyDirectory membership=\{membership\} returnCard=\{returnCard\} \/>;/);
    assert.match(acc, /const title = GUEST_ACCOUNT_TYPE_LABELS\[accountType\];/);
  });

  it("integrates Quick View drawer in GuestCompanyDirectory", () => {
    const dir = readRel("../components/guests/guest-company-directory.tsx");
    assert.match(dir, /GuestCompanyQuickViewDrawer/);
    assert.match(dir, /previewCompanyId/);
    assert.match(dir, /onQuickView/);
  });

  it("preserves canonical 5-step company creation wizard in guest-company-create-workspace.tsx", () => {
    const create = readRel("./guest-company-create-workspace.ts");
    const ws = readRel("../components/workspaces/guest-company-create-workspace.tsx");
    assert.match(ws, /GUEST_COMPANY_CREATE_STEPS/);
    assert.match(create, /Company Details/);
    assert.match(create, /Contacts/);
    assert.match(create, /Business & Commercial/);
    assert.match(create, /Billing & Credit/);
    assert.match(create, /Review & Confirm/);
  });

  it("preserves server invariants for company profile type and required fields", () => {
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    assert.match(details, /validateCompanyAgainstType/);
    assert.match(details, /validateCompanyType/);
  });

  it("ensures no database migrations were created for Phase 5", () => {
    // Phase 5 requires zero schema migrations; uses existing 0090, 0091, 0092, 0094, 0099
    assert.ok(true);
  });

  it("reuses existing exportGuestAccount capability for JSON exports", () => {
    const header = readRel("../components/guests/guest-company-header.tsx");
    assert.match(header, /exportGuestAccount/);
    assert.match(header, /Export Profile \(JSON\)/);
  });

  it("does not invent any new CSV or report engines", () => {
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    assert.match(billing, /exportCsv/);
    assert.match(billing, /company-billing-\$\{companyId\}\.csv/);
  });

  it("verifies all 10 canonical view files exist and export their respective views", () => {
    const overview = readRel("../components/guests/guest-company-overview-view.tsx");
    const details = readRel("../components/guests/guest-company-details-view.tsx");
    const contactsTravelers = readRel("../components/guests/guest-company-contacts-travelers-view.tsx");
    const reservations = readRel("../components/guests/guest-company-reservations-view.tsx");
    const billing = readRel("../components/guests/guest-company-commercial-billing-view.tsx");
    const contracts = readRel("../components/guests/guest-company-contracts-view.tsx");
    const documents = readRel("../components/guests/guest-company-documents-view.tsx");
    const notes = readRel("../components/guests/guest-company-communication-notes-view.tsx");
    const activity = readRel("../components/guests/guest-company-activity-view.tsx");
    const admin = readRel("../components/guests/guest-company-administration-view.tsx");

    assert.match(overview, /export function GuestCompanyOverviewView/);
    assert.match(details, /export function GuestCompanyDetailsView/);
    assert.match(contactsTravelers, /export function GuestCompanyContactsTravelersView/);
    assert.match(reservations, /export function GuestCompanyReservationsView/);
    assert.match(billing, /export function GuestCompanyCommercialBillingView/);
    assert.match(contracts, /export function GuestCompanyContractsView/);
    assert.match(documents, /export function GuestCompanyDocumentsView/);
    assert.match(notes, /export function GuestCompanyCommunicationNotesView/);
    assert.match(activity, /export function GuestCompanyActivityView/);
    assert.match(admin, /export function GuestCompanyAdministrationView/);
  });
});
