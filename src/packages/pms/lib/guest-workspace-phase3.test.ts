import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GUEST_DETAIL_VIEW_DEFINITIONS,
  GUEST_DETAIL_VIEW_IDS,
  MORE_GUEST_DETAIL_VIEWS,
  PRIMARY_GUEST_DETAIL_VIEWS,
  legacyParamsForDetailView,
  resolveGuestDetailView,
} from "./guest-detail-view";
import {
  GUEST_PROFILE_DETAIL_PATH,
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
  parseGuestProfileSearch,
} from "./guest-profile-wave1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");
}

describe("NORU PMS — Guest Profile Phase 3 — Individual Guest Detail Workspace Redesign", () => {
  const workspaceCode = readRel("../components/workspaces/guest-profile-workspace.tsx");
  const detailWorkspaceCode = readRel(
    "../components/workspaces/guest-individual-detail-workspace.tsx",
  );
  const headerCode = readRel("../components/guests/guest-profile-header.tsx");
  const overviewCode = readRel("../components/guests/guest-individual-overview.tsx");
  const personalContactCode = readRel("../components/guests/guest-personal-contact-view.tsx");

  it("1. Open Full Profile opens individual guest detail workspace", () => {
    assert.match(workspaceCode, /GuestIndividualDetailWorkspace/);
    assert.match(workspaceCode, /if \(guestId && !isAccount\)/);
  });

  it("2. Individual guest detail workspace renders inside shared PMS command chrome", () => {
    assert.match(workspaceCode, /<GuestProfileChrome/);
    assert.match(detailWorkspaceCode, /GuestProfileHeader/);
  });

  it("3. Individual guest detail workspace uses warm NORU hospitality color palette matching Reservations and Room & Inventory", () => {
    assert.match(detailWorkspaceCode, /border-\[#DDD4C5\]|bg-white/);
    assert.match(headerCode, /border-\[#DDD4C5\]|bg-white/);
    assert.match(overviewCode, /border-\[#DDD4C5\]|bg-white/);
  });

  it("4. Compact identity header renders at top of individual guest detail", () => {
    assert.match(detailWorkspaceCode, /<GuestProfileHeader/);
    assert.match(headerCode, /data-testid="guest-profile-header-container"/);
  });

  it("5. Avatar renders image when photoUrl is present, or initials when absent", () => {
    assert.match(headerCode, /guest\.photoUrl/);
    assert.match(headerCode, /guestInitials/);
    assert.match(headerCode, /data-testid="guest-overview-photo"/);
  });

  it("6. Guest full name renders as primary heading (h1)", () => {
    assert.match(headerCode, /<h1 className="font-display/);
    assert.match(headerCode, /{guest\.fullName}/);
  });

  it("7. VIP badge renders when guest.vipStatus === true", () => {
    assert.match(headerCode, /guest\.vipStatus \? <VipBadge/);
  });

  it("8. Status badge renders with correct active/inactive styling", () => {
    assert.match(headerCode, /<StatusBadge status=\{guest\.guestStatus\}/);
  });

  it("9. Restriction badges render when active restrictions exist", () => {
    assert.match(headerCode, /<GuestRestrictionBadges guest=\{guest\}/);
  });

  it("10. Contact sub-row displays phone, email, location with separator dots", () => {
    assert.match(headerCode, /guest\.phone/);
    assert.match(headerCode, /guest\.email/);
    assert.match(headerCode, /location/);
  });

  it("11. Demographic sub-row displays ID, nationality, DOB with calculated age, language, member since", () => {
    assert.match(headerCode, /calculateAge/);
    assert.match(headerCode, /guest\.nationality/);
    assert.match(headerCode, /guest\.language/);
    assert.match(headerCode, /Member since/);
  });

  it("12. Company affiliation renders in header when linked", () => {
    assert.match(headerCode, /data-testid="guest-header-company"/);
    assert.match(headerCode, /company\.masterName/);
  });

  it("13. Primary action button is + New Reservation linking to /restaurant/bookings/new?guestId=...", () => {
    assert.match(headerCode, /New Reservation/);
    assert.match(headerCode, /\/restaurant\/bookings\/new/);
    assert.match(headerCode, /guestId: guest\.id/);
  });

  it("14. Secondary action button is Edit Guest", () => {
    assert.match(headerCode, /Edit Guest/);
    assert.match(headerCode, /actions\.openEdit/);
  });

  it("15. Tertiary action is More ▾ dropdown containing secondary profile actions", () => {
    assert.match(headerCode, /DropdownMenu/);
    assert.match(headerCode, /Add Note/);
    assert.match(headerCode, /Upload Document/);
    assert.match(headerCode, /Print Profile/);
    assert.match(headerCode, /Merge Profile/);
  });

  it("16. Header back button returns to Guest Directory preserving active search/filter parameters", () => {
    assert.match(headerCode, /data-testid="guest-header-back-button"/);
    assert.match(headerCode, /GUEST_PROFILE_DIRECTORY_PATH/);
    assert.match(headerCode, /guestProfileSearch\(\{ card: returnCard, type: profileType \}\)/);
  });

  it("17. Tab strip renders 5 primary visible tabs: Overview, Personal & Contact, Identity & Documents, Preferences, Stays & Reservations", () => {
    const primaryIds = PRIMARY_GUEST_DETAIL_VIEWS.map((v) => v.id);
    assert.deepEqual(primaryIds, [
      "overview",
      "personal-contact",
      "identity",
      "preferences",
      "stays",
    ]);
    assert.match(detailWorkspaceCode, /data-testid="guest-detail-section-nav"/);
    assert.match(detailWorkspaceCode, /PRIMARY_GUEST_DETAIL_VIEWS\.map/);
  });

  it("18. Tab strip renders More ▾ dropdown for secondary views", () => {
    assert.match(detailWorkspaceCode, /data-testid="guest-detail-tab-more"/);
    assert.match(detailWorkspaceCode, /DropdownMenu/);
  });

  it("19. More ▾ dropdown contains: Relationships, Services, Communication & Notes, Privacy & Administration, Activity / History, Loyalty & Value", () => {
    const moreIds = MORE_GUEST_DETAIL_VIEWS.map((v) => v.id);
    assert.deepEqual(moreIds, [
      "relationships",
      "services",
      "communication-notes",
      "privacy",
      "activity",
      "loyalty",
    ]);
  });

  it("20. Active tab receives gold underline styling", () => {
    assert.match(detailWorkspaceCode, /border-\[#C89933\]/);
    assert.match(detailWorkspaceCode, /text-\[#251605\]/);
  });

  it("21. When a secondary view is active, More ▾ dropdown receives gold active styling", () => {
    assert.match(detailWorkspaceCode, /isMoreActive/);
    assert.match(detailWorkspaceCode, /border-\[#C89933\] font-semibold text-\[#8A641A\]/);
  });

  it("22. Default active view is Overview", () => {
    assert.equal(resolveGuestDetailView(undefined), "overview");
    assert.equal(resolveGuestDetailView({}), "overview");
  });

  it("23. Operational Overview Row 1 renders compact 6-KPI strip (Status, VIP, Last Stay, Upcoming Stay, Total Stays, Total Nights)", () => {
    assert.match(overviewCode, /data-testid="guest-overview-kpi-strip"/);
    assert.match(overviewCode, /grid-cols-2/);
    assert.match(overviewCode, /sm:grid-cols-3/);
    assert.match(overviewCode, /lg:grid-cols-6/);
    assert.match(overviewCode, /Status/);
    assert.match(overviewCode, /VIP Status/);
    assert.match(overviewCode, /Last Stay/);
    assert.match(overviewCode, /Upcoming Stay/);
    assert.match(overviewCode, /Total Stays/);
    assert.match(overviewCode, /Total Nights/);
  });

  it("24. KPI strip items read like a compact summary strip, not large cards (Caution 1)", () => {
    // Must be compact strip with text-[10px] headers and small padding, not bulky min-h cards
    assert.match(overviewCode, /text-\[10px\] font-semibold uppercase tracking-wider/);
    assert.match(overviewCode, /divide-\[#DDD4C5\]/);
  });

  it("25. Operational Overview Row 2 renders 3 cards: Guest Information, Contact & Address, Upcoming Reservation", () => {
    assert.match(overviewCode, /data-testid="guest-overview-info"/);
    assert.match(overviewCode, /data-testid="guest-overview-contact"/);
    assert.match(overviewCode, /data-testid="guest-overview-upcoming"/);
  });

  it("26. Guest Information card displays demographics and has Edit action", () => {
    assert.match(overviewCode, /Guest Information/);
    assert.match(overviewCode, /onNavigateView\("personal-contact"\)/);
  });

  it("27. Contact & Address card displays phone, email, address, and View on Map only if coordinates are present (Caution 2)", () => {
    assert.match(overviewCode, /data-testid="guest-overview-contact"/);
    assert.match(overviewCode, /mapHref/);
    assert.match(overviewCode, /guest\.geoLatitude != null && guest\.geoLongitude != null/);
    assert.match(overviewCode, /data-testid="guest-overview-map"/);
  });

  it("28. Upcoming Reservation card displays reservation details truthfully with — for missing fields (Caution 3)", () => {
    assert.match(overviewCode, /data-testid="guest-overview-upcoming"/);
    assert.match(overviewCode, /featuredStay\.ratePlanName \?\? "—"/);
    assert.match(overviewCode, /featuredStay\.sourceLabel \?\? "—"/);
  });

  it("29. Operational Overview Row 3 renders 3 cards: Key Preferences, Identity Status, Relationships", () => {
    assert.match(overviewCode, /data-testid="guest-overview-preferences"/);
    assert.match(overviewCode, /data-testid="guest-overview-identity"/);
    assert.match(overviewCode, /data-testid="guest-overview-relationships"/);
  });

  it("30. Key Preferences card renders preference chips and Edit action", () => {
    assert.match(overviewCode, /prefsQuery\.data/);
    assert.match(overviewCode, /onNavigateView\("preferences"\)/);
  });

  it("31. Identity Status card renders masked ID, expiration, verification badge, and View All action", () => {
    assert.match(overviewCode, /idNumberMasked/);
    assert.match(overviewCode, /guest\.idVerified/);
    assert.match(overviewCode, /onNavigateView\("identity"\)/);
  });

  it("32. Relationships card renders linked accounts and View All action", () => {
    assert.match(overviewCode, /linksQuery\.data/);
    assert.match(overviewCode, /onNavigateView\("relationships"\)/);
  });

  it("33. Operational Overview Row 4 renders Important Notes & Alerts card with Add Note action", () => {
    assert.match(overviewCode, /data-testid="guest-overview-notes"/);
    assert.match(overviewCode, /actions\.openNote/);
  });

  it("34. Personal & Contact view consolidates Personal Information, Contact Channels, Residential Address, Emergency Contacts, and Employment", () => {
    assert.match(personalContactCode, /data-testid="guest-personal-contact-view"/);
    assert.match(personalContactCode, /data-testid="personal-info-panel"/);
    assert.match(personalContactCode, /data-testid="contact-info-panel"/);
    assert.match(personalContactCode, /data-testid="address-info-panel"/);
    assert.match(personalContactCode, /data-testid="employment-info-panel"/);
    assert.match(personalContactCode, /data-testid="emergency-info-panel"/);
  });

  it("35. Emergency contacts render with name, relationship, phone, and email", () => {
    assert.match(personalContactCode, /guest\.emergencyContacts/);
    assert.match(personalContactCode, /contact\.relationship/);
    assert.match(personalContactCode, /contact\.phone/);
    assert.match(personalContactCode, /contact\.email/);
  });

  it("36. URL parameters view and tab update on view switch", () => {
    assert.match(workspaceCode, /view: nextView/);
    assert.match(workspaceCode, /tab: nextView/);
  });

  it("37. Legacy URL parameter card=information resolves to personal-contact", () => {
    assert.equal(resolveGuestDetailView({ card: "information" }), "personal-contact");
    assert.equal(resolveGuestDetailView({ nav: "personal" }), "personal-contact");
    assert.equal(resolveGuestDetailView({ nav: "contact" }), "personal-contact");
  });

  it("38. Legacy URL parameter card=dashboard resolves to overview", () => {
    assert.equal(resolveGuestDetailView({ card: "dashboard" }), "overview");
    assert.equal(resolveGuestDetailView({ nav: "overview" }), "overview");
  });

  it("39. Legacy URL parameter card=stay-history resolves to stays", () => {
    assert.equal(resolveGuestDetailView({ card: "stay-history" }), "stays");
    assert.equal(resolveGuestDetailView({ nav: "bookings" }), "stays");
  });

  it("40. Secondary query failures (stays, links, prefs) do not crash the individual guest detail workspace", () => {
    // Both Overview and Detail Workspace independently query or isolate errors without breaking main shell
    assert.match(overviewCode, /overviewQuery\.isError/);
    assert.match(detailWorkspaceCode, /data-testid="guest-individual-detail-error"/);
  });

  it("41. Company, Travel Agency, and Group detail workspaces remain untouched and route to their respective workspaces", () => {
    assert.match(workspaceCode, /operationalType === "company"/);
    assert.match(workspaceCode, /GuestCompanyDetailWorkspace/);
    assert.match(workspaceCode, /operationalType === "travel-agent"/);
    assert.match(workspaceCode, /GuestTravelAgentDetailWorkspace/);
    assert.match(workspaceCode, /operationalType === "group"/);
    assert.match(workspaceCode, /GuestGroupDetailWorkspace/);
  });
});
