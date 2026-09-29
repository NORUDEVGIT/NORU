import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_BOOKINGS_TITLE,
  MODERN_GUEST_NEW_RESERVATION_PATH,
  modernNewReservationHref,
} from "./guest-bookings-workspace";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "./guest-profile-wave1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readRel(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
}

describe("NORU PMS — Guest Profile Phase 3B — Modernize Individual Detail Views & Reservation Handoff", () => {
  const prefsCode = readRel("../components/guests/guest-preferences-view.tsx");
  const staysCode = readRel("../components/guests/guest-stays-reservations-view.tsx");
  const relsCode = readRel("../components/guests/guest-relationships-view.tsx");
  const servicesCode = readRel("../components/guests/guest-services-view.tsx");
  const commsCode = readRel("../components/guests/guest-communication-notes-view.tsx");
  const privacyCode = readRel("../components/guests/guest-privacy-administration-view.tsx");
  const activityCode = readRel("../components/guests/guest-activity-history-view.tsx");
  const loyaltyCode = readRel("../components/guests/guest-loyalty-value-view.tsx");
  const workspaceCode = readRel("../components/workspaces/guest-individual-detail-workspace.tsx");

  const headerCode = readRel("../components/guests/guest-profile-header.tsx");
  const quickViewCode = readRel("../components/guests/guest-quick-view-drawer.tsx");
  const overviewCode = readRel("../components/guests/guest-individual-overview.tsx");
  const quickActionsCode = readRel("../components/guests/guest-overview-quick-actions.tsx");
  const dirWorkspaceCode = readRel("../components/workspaces/guest-directory-workspace.tsx");

  const reservationsRouteCode = readRel("../../../routes/restaurant/pms/reservations.index.tsx");
  const reservationsWorkspaceCode = readRel("../components/workspaces/reservations-workspace.tsx");
  const overlayCode = readRel("../components/reservations/reservation-workspace-overlay.tsx");
  const createPageCode = readRel("../components/bookings/create-reservation-page.tsx");

  // PREFERENCES
  it("1. modern Preferences view renders with warm NORU operational styling", () => {
    assert.match(prefsCode, /GuestPreferencesView/);
    assert.match(prefsCode, /border-\[#DDD4C5\]/);
    assert.match(prefsCode, /bg-white/);
    assert.match(prefsCode, /text-\[#251605\]/);
  });

  it("2. no duplicate Apply to Future Reservations control in Preferences", () => {
    const matches = prefsCode.match(/applyToFutureReservations/g) || [];
    assert.ok(matches.length > 0, "applyToFutureReservations exists");
    // Ensure only one switch rendered with data-testid="guest-pref-apply-future-toggle"
    const toggleMatches = prefsCode.match(/guest-pref-apply-future-toggle/g) || [];
    assert.equal(toggleMatches.length, 1, "Exactly one Apply to Future Reservations toggle rendered");
  });

  it("3. Property Setup category rendering preserved dynamically", () => {
    assert.match(prefsCode, /categories\.map/);
    assert.match(prefsCode, /category\.name/);
    assert.match(prefsCode, /PREFERENCE_SETUP_HREF/);
  });

  it("4. inactive historical preference values preserved", () => {
    assert.match(prefsCode, /option\.active\s*\|\|\s*values\.includes\(option\.value\)/);
  });

  it("5. Save/Discard state preserved with dirty detection", () => {
    assert.match(prefsCode, /isDirty/);
    assert.match(prefsCode, /saveMutation/);
    assert.match(prefsCode, /handleDiscard/);
    assert.match(prefsCode, /Save Changes/);
  });

  // STAYS
  it("6. modern stay summary strip renders 5-cell KPI metrics", () => {
    assert.match(staysCode, /Upcoming/);
    assert.match(staysCode, /In-House/);
    assert.match(staysCode, /Past Stays/);
    assert.match(staysCode, /Cancelled/);
    assert.match(staysCode, /Total Nights/);
  });

  it("7. upcoming/current/past stay scope filters operate", () => {
    assert.match(staysCode, /scope\s*===\s*"upcoming"/);
    assert.match(staysCode, /scope\s*===\s*"in_house"/);
    assert.match(staysCode, /scope\s*===\s*"past"/);
  });

  it("8. dense reservation list/table renders expected operational columns", () => {
    assert.match(staysCode, /Confirmation/);
    assert.match(staysCode, /Arrival/);
    assert.match(staysCode, /Departure/);
    assert.match(staysCode, /Nights/);
    assert.match(staysCode, /Room Type/);
    assert.match(staysCode, /Status/);
    assert.match(staysCode, /Rate Plan/);
  });

  it("9. Open Reservation routes to modern Reservation workspace", () => {
    assert.match(staysCode, /\/restaurant\/pms\/reservations/);
  });

  it("10. GuestStayActions preserved for stay rows", () => {
    assert.match(staysCode, /GuestStayActions/);
  });

  // RELATIONSHIPS
  it("11. compact relationships summary strip", () => {
    assert.match(relsCode, /Company:/);
    assert.match(relsCode, /Travel Agency:/);
    assert.match(relsCode, /Group:/);
  });

  it("12. dense relationship table/list renders", () => {
    assert.match(relsCode, /guest-relationships-table/);
    assert.match(relsCode, /Relationship/);
    assert.match(relsCode, /Account Name/);
    assert.match(relsCode, /Role/);
  });

  it("13. link drawer/modal is used instead of permanent visible form", () => {
    assert.match(relsCode, /drawerOpen/);
    assert.match(relsCode, /Sheet/);
    assert.match(relsCode, /Link Relationship/);
  });

  it("14. unlink preserved with confirmation dialog", () => {
    assert.match(relsCode, /unlinkMutation/);
    assert.match(relsCode, /AlertDialog/);
    assert.match(relsCode, /WAVE4_UNLINK_COPY/);
  });

  it("15. linked profile navigation preserved", () => {
    assert.match(relsCode, /GUEST_PROFILE_DETAIL_PATH/);
  });

  // SERVICES
  it("16. compact service status summary strip", () => {
    assert.match(servicesCode, /All Requests/);
    assert.match(servicesCode, /Pending/);
    assert.match(servicesCode, /In Progress/);
    assert.match(servicesCode, /Completed/);
    assert.match(servicesCode, /Cancelled/);
  });

  it("17. services filters preserved (scope, status, search)", () => {
    assert.match(servicesCode, /stayScope/);
    assert.match(servicesCode, /statusFilter/);
    assert.match(servicesCode, /filterGuestServices/);
  });

  it("18. new service request drawer is used instead of permanent form", () => {
    assert.match(servicesCode, /createDrawerOpen/);
    assert.match(servicesCode, /New Service Request/);
  });

  it("19. update service request status preserved", () => {
    assert.match(servicesCode, /updateMutation/);
    assert.match(servicesCode, /GUEST_SERVICE_STATUSES/);
  });

  it("20. service stay association preserved", () => {
    assert.match(servicesCode, /reservationForDraft/);
    assert.match(servicesCode, /currentStay/);
    assert.match(servicesCode, /futureStays/);
  });

  // COMMUNICATION & NOTES
  it("21. communication & notes activity-first layout", () => {
    assert.match(commsCode, /Communication & Notes/);
    assert.match(commsCode, /Staff Note/);
  });

  it("22. add note modal/drawer", () => {
    assert.match(commsCode, /noteOpen/);
    assert.match(commsCode, /Add Staff Note/);
    assert.match(commsCode, /noteMutation/);
  });

  it("23. record communication modal/drawer", () => {
    assert.match(commsCode, /commsOpen/);
    assert.match(commsCode, /Record Communication/);
    assert.match(commsCode, /recordMutation/);
  });

  it("24. unsupported email sending not presented as active fake functionality", () => {
    assert.match(commsCode, /sendAvailable/);
  });

  // PRIVACY & ADMINISTRATION
  it("25. consent preferences preserved", () => {
    assert.match(privacyCode, /GuestConsentPanel/);
    assert.match(privacyCode, /Section 1/);
  });

  it("26. data export preserved", () => {
    assert.match(privacyCode, /exportMutation/);
    assert.match(privacyCode, /Export Held Data/);
  });

  it("27. anonymise preserved with destructive confirmation dialog", () => {
    assert.match(privacyCode, /anonymiseMutation/);
    assert.match(privacyCode, /AlertDialog/);
    assert.match(privacyCode, /Confirm Profile Anonymisation/);
  });

  it("28. unmerge candidates preserved", () => {
    assert.match(privacyCode, /unmergeCandidates/);
    assert.match(privacyCode, /unmergeMutation/);
  });

  it("29. privacy audit dense layout", () => {
    assert.match(privacyCode, /guest-privacy-audit-table/);
    assert.match(privacyCode, /auditEvents/);
  });

  // ACTIVITY / HISTORY
  it("30. compact chronological activity history view", () => {
    assert.match(activityCode, /Activity & Profile History/);
    assert.match(activityCode, /guest-activity-table/);
  });

  it("31. activity filters for categories and search", () => {
    assert.match(activityCode, /activeCategory/);
    assert.match(activityCode, /profile_changes/);
    assert.match(activityCode, /notes/);
    assert.match(activityCode, /communication/);
  });

  it("32. actor, date, and details expansion preserved in activity", () => {
    assert.match(activityCode, /expandedRowId/);
    assert.match(activityCode, /item\.actorName/);
    assert.match(activityCode, /(?:formatStayDate|formatAuditDateTime)\(item\.createdAt\)/);
  });

  // LOYALTY & VALUE
  it("33. compact 4-cell summary band in Loyalty & Value", () => {
    assert.match(loyaltyCode, /guest-loyalty-metrics/);
    assert.match(loyaltyCode, /Total Stays/);
    assert.match(loyaltyCode, /Total Nights/);
    assert.match(loyaltyCode, /Quoted Room Value/);
    assert.match(loyaltyCode, /Posted Folio Value/);
  });

  it("34. no invented loyalty points or fake membership tiers", () => {
    assert.match(loyaltyCode, /WAVE4_NO_POINTS_COPY/);
    assert.doesNotMatch(loyaltyCode, /pointsBalance/);
    assert.doesNotMatch(loyaltyCode, /goldTier/);
  });

  it("35. truthful VIP recognition flag and value explanation preserved", () => {
    assert.match(loyaltyCode, /VipBadge/);
    assert.match(loyaltyCode, /WAVE4_VIP_STAFF_FLAG_COPY/);
    assert.match(loyaltyCode, /actual stays and folios/);
  });

  // RESERVATION HANDOFF
  it("36. Guest header New Reservation routes to /restaurant/pms/reservations", () => {
    assert.match(headerCode, /to="\/restaurant\/pms\/reservations"/);
    assert.match(headerCode, /search=\{\{\s*create:\s*"new",\s*guestId:\s*guest\.id\s*\}\}/);
  });

  it("37. Quick View New Reservation uses same modern route", () => {
    assert.match(quickViewCode, /to:\s*"\/restaurant\/pms\/reservations"/);
    assert.match(quickViewCode, /search:\s*\{\s*create:\s*"new",\s*guestId:\s*previewId\s*\}/);
  });

  it("38. Reservation search parser supports create + guestId as UUID", () => {
    assert.match(reservationsRouteCode, /UUID_REGEX/);
    assert.match(reservationsRouteCode, /create\s*===\s*"new"/);
    assert.match(reservationsRouteCode, /guestId/);
  });

  it("39. ReservationsWorkspace accepts initialCreate and initialGuestId", () => {
    assert.match(reservationsWorkspaceCode, /initialCreate/);
    assert.match(reservationsWorkspaceCode, /initialGuestId/);
  });

  it("40. Overlay opens once on hydration and can be closed normally", () => {
    assert.match(reservationsWorkspaceCode, /hydratedCreateRef/);
    assert.match(reservationsWorkspaceCode, /setOverlay\(\{\s*type:\s*"new-reservation"/);
  });

  it("41. CreateReservationPage accepts initialGuestId", () => {
    assert.match(createPageCode, /initialGuestId/);
  });

  it("42. Real guest is loaded via getGuest server function", () => {
    assert.match(createPageCode, /fetchGuest\(\{ data: \{ restaurantId, guestId: initialGuestId! \} \}\)/);
  });

  it("43. Guest & Contact step displays preselected guest via toPickedGuest", () => {
    assert.match(createPageCode, /setGuest\(toPickedGuest\(initialGuestQuery\.data\.guest\)\)/);
  });

  it("44. Linked company prefill preserved", () => {
    assert.match(createPageCode, /prefillCompany/);
    assert.match(createPageCode, /pickPrefillMasterId/);
  });

  it("45. Linked travel agency prefill preserved", () => {
    assert.match(createPageCode, /prefillTravelAgent/);
  });

  it("46. Staff override continues winning over automatic prefill", () => {
    assert.match(createPageCode, /companyOverride/);
    assert.match(createPageCode, /travelAgentOverride/);
  });

  it("47. applyToFutureReservations preference defaults respected where supported", () => {
    assert.match(createPageCode, /getGuestReservationPreferenceDefaults/);
    assert.match(createPageCode, /applyToFutureReservations/);
    assert.match(createPageCode, /specialRequests/);
  });

  it("48. Preference prefill never bypasses availability, rate, or room assignment", () => {
    // Room assignment is UNASSIGNED by default
    assert.match(createPageCode, /const \[roomId, setRoomId\] = useState\(UNASSIGNED\)/);
  });

  it("49. Changing guest refreshes guest-derived prefill", () => {
    assert.match(createPageCode, /queryKey:\s*\["guest-account-links",\s*restaurantId,\s*guest\?\.id/);
  });

  it("50. Old /restaurant/bookings/new guest entry points removed from Guest Profile", () => {
    assert.doesNotMatch(headerCode, /\/restaurant\/bookings\/new/);
    assert.doesNotMatch(quickViewCode, /\/restaurant\/bookings\/new/);
    assert.doesNotMatch(overviewCode, /\/restaurant\/bookings\/new/);
    assert.doesNotMatch(quickActionsCode, /\/restaurant\/bookings\/new/);
    assert.doesNotMatch(dirWorkspaceCode, /search:\s*\{\s*guestId:\s*g\.id\s*\}/);
  });

  // REGRESSIONS
  it("51. Guest Overview unchanged", () => {
    assert.match(overviewCode, /GuestIndividualOverview/);
    assert.match(overviewCode, /guest-individual-overview/);
    assert.match(overviewCode, /Guest Information/);
  });

  it("52. Personal & Contact unchanged", () => {
    const pcCode = readRel("../components/guests/guest-personal-contact-view.tsx");
    assert.match(pcCode, /GuestPersonalContactView/);
    assert.match(pcCode, /Emergency Contacts/);
  });

  it("53. Identity view preserved", () => {
    const idCode = readRel("../components/guests/guest-identity-card.tsx");
    assert.match(idCode, /GuestIdentityCard/);
  });

  it("54. Company detail regression safe", () => {
    const companyCode = readRel("../components/guests/guest-company-overview.tsx");
    assert.match(companyCode, /GuestCompanyOverview/);
  });

  it("55. Travel Agency detail regression safe", () => {
    const taCode = readRel("../components/guests/guest-travel-agent-overview.tsx");
    assert.match(taCode, /GuestTravelAgentOverview/);
  });

  it("56. Group detail regression safe", () => {
    const groupCode = readRel("../components/guests/guest-group-overview.tsx");
    assert.match(groupCode, /GuestGroupOverview/);
  });

  it("57. Reservation Desk regression safe", () => {
    assert.match(reservationsWorkspaceCode, /getReservationDesk/);
    assert.match(reservationsWorkspaceCode, /Reservation Desk/);
  });

  it("58. Reservation Create regression safe", () => {
    assert.match(createPageCode, /CreateReservationPage/);
    assert.match(createPageCode, /CREATE_WORKFLOW_STEPS/);
  });

  // PHASE 3B.1 — PREFERENCE CONTROL CORRECTION
  describe("Phase 3B.1 — Preference Control Correction", () => {
    it("1. select preference renders Select", () => {
      assert.match(prefsCode, /<Select/);
      assert.match(prefsCode, /<SelectTrigger/);
      assert.match(prefsCode, /<SelectContent/);
    });

    it("2. multi preference renders multiple selectable options", () => {
      assert.match(prefsCode, /type\.valueType === "multi"/);
      assert.match(prefsCode, /<Checkbox/);
    });

    it("3. yes_no preference renders Switch", () => {
      assert.match(prefsCode, /type\.valueType === "yes_no"/);
      assert.match(prefsCode, /<Switch/);
    });

    it("4. text preference renders text input/textarea", () => {
      assert.match(prefsCode, /type\.valueType === "text"/);
      assert.match(prefsCode, /<Textarea/);
      assert.match(prefsCode, /<Input/);
    });

    it("5. number preference renders numeric input", () => {
      assert.match(prefsCode, /type\.valueType === "number"/);
      assert.match(prefsCode, /type="number"/);
    });

    it("6. configured options come from Property Setup", () => {
      assert.match(prefsCode, /type\.options\.filter/);
      assert.match(prefsCode, /option\.label/);
      assert.match(prefsCode, /option\.value/);
    });

    it("7. inactive option remains visible when historically selected", () => {
      assert.match(prefsCode, /option\.active\s*\|\|\s*values\.includes\(option\.value\)/);
      assert.match(prefsCode, /— Inactive/);
    });

    it("8. inactive option cannot be newly selected", () => {
      assert.match(prefsCode, /disabled=\{!option\.active\}/);
      assert.match(prefsCode, /disabled=\{isOptionInactive && !checked\}/);
    });

    it("9. no-option select does NOT fall back to free text", () => {
      assert.match(prefsCode, /No active options configured\./);
      assert.match(prefsCode, /Review Property Setup/);
    });

    it("10. required marker follows configured type.required", () => {
      assert.match(prefsCode, /type\.required\s*&&\s*type\.active/);
    });

    it("11. values save through existing answer contract", () => {
      assert.match(prefsCode, /saveWorkspace/);
      assert.match(prefsCode, /answers:\s*answersPayload/);
    });

    it("12. modern preference view has exactly one Apply to Future Reservations toggle", () => {
      const toggleMatches = prefsCode.match(/guest-pref-apply-future-toggle/g) || [];
      assert.equal(toggleMatches.length, 1);
    });

    it("13. no hard-coded Room Type options", () => {
      // Ensure no static hardcoded arrays for Room Types
      assert.doesNotMatch(prefsCode, /\["Standard",\s*"Deluxe"/);
      assert.doesNotMatch(prefsCode, /\["King",\s*"Twin"/);
    });

    it("14. no hard-coded Floor options", () => {
      // Ensure no static hardcoded arrays for Floor options
      assert.doesNotMatch(prefsCode, /\["High Floor",\s*"Low Floor"/);
      assert.doesNotMatch(prefsCode, /\["Floor 1",\s*"Floor 2"/);
    });

    it("15. reservation handoff treats preferences as non-binding defaults", () => {
      // CreateReservationPage prefill places notes in specialRequests, never assigning room
      assert.match(createPageCode, /initialPrefQuery/);
      assert.match(createPageCode, /setSpecialRequests/);
      assert.match(createPageCode, /const \[roomId, setRoomId\] = useState\(UNASSIGNED\)/);
    });
  });
});
