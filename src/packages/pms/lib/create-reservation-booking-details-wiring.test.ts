import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Create reservation Booking Details wiring", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const details = readRel("../components/bookings/create-reservation-booking-details.tsx");
  const packages = readRel("../components/bookings/create-reservation-packages.tsx");
  const picker = readRel("../components/bookings/create-reservation-master-picker.tsx");

  it("source and channel stay wired to existing create state", () => {
    assert.match(page, /onRequestTypeChange={requestTypeChange}/);
    assert.match(page, /reservationType={reservationType}/);
    assert.doesNotMatch(details, /reservation-type-/);
    assert.doesNotMatch(details, /onRequestTypeChange\(mode\)/);
    assert.match(details, /label="Source" required/);
    assert.match(details, /label="Channel" required/);
    assert.match(details, /booking-details-source/);
    assert.match(details, /booking-details-segment/);
    assert.match(details, /booking-details-external-ref/);
    assert.match(details, /onSalesChannelChange/);
    assert.match(details, /data-testid="booking-agent"/);
    assert.match(details, /value={bookingAgentName}/);
    assert.match(details, /data-testid="booking-agent"[\s\S]{0,120}readOnly/);
    assert.doesNotMatch(details, /Sub-Source|subSource/);
  });

  it("company, travel agent, and group reuse the existing masters", () => {
    assert.match(details, /kind="company"/);
    assert.match(details, /kind="travel_agent"/);
    assert.match(details, /onCompanyMasterChange/);
    assert.match(details, /onTravelAgentMasterChange/);
    assert.match(details, /onLinkedGroupChange/);
    assert.match(details, /companyMaster\?\.name|companyMaster/);
    assert.match(details, /travelAgentMaster/);
    assert.match(page, /onCompanyMasterChange={handleCompanyMasterChange}/);
    assert.match(page, /onTravelAgentMasterChange={handleTravelAgentMasterChange}/);
    const source = details.slice(
      details.indexOf('testId="booking-details-source-channel"'),
      details.indexOf('testId="booking-details-company-agent-group"'),
    );
    assert.doesNotMatch(source, /CreateReservationMasterPicker/);
    assert.match(picker, /enabled: searchTerm\.length > 0/);
    assert.match(picker, /search: searchTerm/);
    assert.match(picker, /searchTerm\.length > 0 \?/);
    assert.match(details, /enabled: groupQuery\.trim\(\)\.length >= 2/);
  });

  it("company, travel agent, and group details appear only after a record is selected", () => {
    assert.match(details, /\{companyMaster \? \(/);
    assert.match(details, /booking-details-company-details/);
    assert.match(details, /listCompanyContacts/);
    assert.match(details, /listAccountRatePlanHints/);
    assert.match(details, /getBillingCard3/);
    assert.match(details, /listPurposeOfStay/);
    assert.match(details, /enabled: Boolean\(companyMaster\?\.id\)/);
    assert.match(picker, /change-company/);
    assert.match(picker, /onMasterChange\(null\)/);
    assert.match(picker, /searchInputRef\.current\?\.focus\(\)/);
    assert.match(page, /function handleCompanyMasterChange/);
    assert.match(page, /setCompanyContactId\(""\)/);
    assert.match(page, /companyMasterId: boundMasters\.companyMasterId/);
    assert.match(page, /companyContactId: companyContactId \|\| null/);
    assert.match(page, /billingRuleId: billingRuleId \|\| null/);
    assert.match(page, /purposeOfStay/);

    assert.match(details, /\{travelAgentMaster \? \(/);
    assert.match(details, /booking-details-travel-agent-details/);
    assert.match(details, /listTravelAgentContacts/);
    assert.match(details, /listTravelAgentCommissionPlans/);
    assert.match(details, /agencyHintsQuery\.data\?\.hints/);
    assert.match(details, /aria-label="Agency Rate"/);
    assert.match(details, /aria-label="Commission Type"/);
    assert.match(details, /readOnly/);
    assert.match(picker, /change-ta/);
    assert.match(page, /function handleTravelAgentMasterChange/);
    assert.match(page, /setTravelAgentContactId\(""\)/);
    assert.match(page, /travelAgentMasterId: boundMasters\.travelAgentMasterId/);

    assert.match(details, /\{linkedGroupId \? \(/);
    assert.match(details, /booking-details-group-details/);
    assert.match(details, /data-testid="change-group"/);
    assert.match(details, /onLinkedGroupChange\(null, null\)/);
    assert.match(details, /enabled: groupQuery\.trim\(\)\.length >= 2/);
    assert.match(details, /listGroups/);
    assert.match(details, /getGroup/);
    assert.match(details, /onApplyRatePlan\(selectedGroup\.ratePlanId\)/);
    assert.match(page, /pmsGroupId: linkedGroupId/);
    assert.match(page, /pmsGroupBlockId: linkedBlockId/);
    assert.doesNotMatch(details, /guest_account_masters/);
  });

  it("packages stay read-only on the existing catalogue and are not priced in the browser", () => {
    assert.match(page, /packagesSlot=/);
    assert.match(page, /merchandiseCards={createPackageMerchandiseCards}/);
    assert.match(packages, /CREATE_RESERVATION_PACKAGES_NOT_ATTACHED/);
    assert.match(packages, /money\(card\.price\)/);
    assert.match(packages, /card\.price == null/);
    assert.match(packages, /<table/);
    assert.match(packages, />Package</);
    assert.match(packages, />Description</);
    assert.match(packages, /Price \(\{currency\}\)/);
    assert.match(packages, />Qty</);
    assert.match(packages, /Total \(\{currency\}\)/);
    assert.match(packages, /card\.chargeType/);
    assert.match(packages, /card\.chargeBasisHonesty/);
    assert.match(packages, /No packages are available for the selected room and rate\./);
    assert.match(packages, /canBindCreatePackage/);
    assert.match(packages, /Select optional packages for this reservation\./);
    assert.match(packages, /createPackageUnselectableReason/);
    assert.match(packages, /data-selected=\{selected \? "true" : "false"\}/);
    assert.match(packages, /data-bindable=\{bindable \? "true" : "false"\}/);
    assert.match(packages, /<Checkbox/);
    assert.match(packages, /disabled=\{!bindable/);
    assert.match(page, /getMealsCard3|fetchMealsCard3/);
    assert.match(page, /buildAvailablePackageCards/);
    assert.match(page, /ratePlanId,\s*roomTypeId,\s*arrival,\s*departure/);
    assert.doesNotMatch(packages, /type="checkbox"|role="checkbox"|quantity/);
    assert.doesNotMatch(packages, /card\.price\s*\*|qty\s*\*/);
    assert.doesNotMatch(packages, /Transport|Activities|Other Services|hardcodedPackage/);
    assert.doesNotMatch(packages, /fo_service_catalogue|pms_guest_service_types/);
    assert.match(page, /packageActivationIds:\s*selectedCreatePackages\.length > 0/);
    assert.match(page, /canBindCreatePackage/);
    assert.doesNotMatch(page, /packagePicker|addPackage/);
    assert.doesNotMatch(packages, /card\.price \* nights|roomSubtotal \+ card\.price/);
  });

  it("Step 2 Continue requires the existing gate plus Source and Channel", () => {
    assert.match(page, /canAdvanceFromBookingDetails/);
    assert.match(page, /bookingSource\.trim\(\)\.length > 0/);
    assert.match(page, /salesChannel\.trim\(\)\.length > 0/);
    assert.doesNotMatch(page, /canAdvanceFromBookingDetails[\s\S]{0,500}specialRequests/);
    assert.doesNotMatch(details, /onArrivalChange|onDepartureChange|onNightsChange/);
  });

  it("special requests and notes persist through the existing payload fields", () => {
    assert.match(page, /specialRequests: specialRequests\.trim\(\)/);
    assert.match(page, /notes: notes\.trim\(\) \|\| null/);
    assert.match(details, /onSpecialRequestsChange/);
    assert.match(details, /onNotesChange/);
    assert.match(details, /booking-details-internal-notes/);
    assert.doesNotMatch(details, /room-preferences-ui-only/);
    assert.doesNotMatch(details, /setPreferences/);
    assert.match(details, /booking-details-saved-preferences/);
    assert.match(details, /apply-saved-preferences/);
    assert.match(details, /confirm-apply-preferences/);
    assert.match(details, /mergeSpecialRequests/);
    assert.match(page, /listGuestPreferenceWorkspace/);
    assert.match(page, /savedPreferencesForProfileType/);
    assert.match(page, /current \|\| nextRoomTypeId/);
    assert.match(page, /createGuestServiceRequest/);
    assert.match(page, /priority: "normal"/);
    assert.match(page, /reservationId: result\.id/);
    assert.match(page, /description: row\.description\.trim\(\) \|\| row\.name/);
    assert.doesNotMatch(page, /guestServiceTypeIds|serviceRequestIds|preferenceValues/);
    assert.doesNotMatch(page, /saveGuestPreference/);
    assert.match(details, /data-testid="saved-preference-chip"/);
    assert.match(details, /No saved preferences for this guest/);
    assert.match(details, /<Checkbox/);
    assert.match(details, /booking-details-service-requests/);
    assert.match(details, /data-testid="selected-service-description"/);
    assert.match(details, /onSelectedServiceRequestsChange/);
    assert.doesNotMatch(details, /service-type-search|Selected Requests \(/);
    assert.match(details, /lg:grid-cols-2/);
    const packagesCard = details.indexOf('testId="booking-details-packages"');
    const requestsCard = details.indexOf('testId="booking-details-guest-requests"');
    const roomSlot = details.indexOf("{roomAssignment}");
    assert.ok(packagesCard > 0 && requestsCard > packagesCard && roomSlot > requestsCard);
    assert.match(page, /roomTypes: \(roomCatalogQuery\.data/);
    assert.match(page, /ratePlans: ratePreferenceOptions/);
    assert.doesNotMatch(details, /max-h-28 overflow-y-auto/);
    assert.doesNotMatch(
      details,
      /High Floor|Quiet Room|King Bed|Baby Cot|Extra Bed|Early Check-In|Late Check-Out|Non-Smoking|Connecting Room|Accessible Room/,
    );
  });

  it("legacy CreateReservationContext is not used in production create flow", () => {
    assert.doesNotMatch(page, /CreateReservationContext/);
    assert.doesNotMatch(page, /create-reservation-context/);
  });
});
