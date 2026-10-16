import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("reservation create step 2 booking details layout", () => {
  const page = readRel("../components/bookings/create-reservation-page.tsx");
  const details = readRel("../components/bookings/create-reservation-booking-details.tsx");
  const packages = readRel("../components/bookings/create-reservation-packages.tsx");

  const company = details.slice(
    details.indexOf('data-testid="booking-details-company-tab"'),
    details.indexOf('data-testid="booking-details-travel-agent-tab"'),
  );
  const agency = details.slice(
    details.indexOf('data-testid="booking-details-travel-agent-tab"'),
    details.indexOf('data-testid="booking-details-group-tab"'),
  );
  const group = details.slice(
    details.indexOf('data-testid="booking-details-group-tab"'),
    details.indexOf('testId="booking-details-guest-requests"'),
  );

  it("shows the four Step 2 sections in a two-column content-height grid", () => {
    assert.match(details, /Source & Channel/);
    assert.match(details, /Company \/ Agent \/ Group/);
    assert.match(details, /Packages & Add-ons/);
    assert.match(details, /Guest Requests & Preferences/);
    assert.match(details, /lg:grid lg:grid-cols-2 lg:items-start/);
    assert.match(details, /h-fit/);
  });

  it("uses two independent column stacks instead of one shared row grid", () => {
    const leftStart = details.indexOf('data-testid="booking-details-left-column"');
    const rightStart = details.indexOf('data-testid="booking-details-right-column"');
    const source = details.indexOf('testId="booking-details-source-channel"');
    const packageCard = details.indexOf('testId="booking-details-packages"');
    const commercial = details.indexOf('testId="booking-details-company-agent-group"');
    const requests = details.indexOf('testId="booking-details-guest-requests"');
    assert.ok(leftStart >= 0 && rightStart > leftStart);
    assert.ok(source > leftStart && packageCard > source && packageCard < rightStart);
    assert.ok(commercial > rightStart && requests > commercial);
    assert.match(details, /contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3/);
    assert.equal(details.match(/grid items-start gap-3 lg:grid-cols-2/g), null);
    assert.match(details, /className="order-1 lg:order-none"/);
    assert.match(details, /className="order-2 lg:order-none"/);
    assert.match(details, /className="order-3 lg:order-none"/);
    assert.match(details, /className="order-4 lg:order-none"/);
  });

  it("places room assignment at the bottom of Guest Requests", () => {
    const requests = details.indexOf('testId="booking-details-guest-requests"');
    const notes = details.indexOf("booking-details-internal-notes");
    const room = details.indexOf("{roomAssignment}");
    const cardEnd = details.indexOf("</BookingCard>", room);
    const nextCard = details.indexOf("<BookingCard", requests + 1);
    assert.ok(requests >= 0 && notes > requests && room > notes && cardEnd > room);
    assert.ok(nextCard === -1 || nextCard > cardEnd);
    assert.match(page, /Room Assignment \(Optional\)/);
  });

  it("shows the Source and Channel message from the existing gate", () => {
    assert.match(page, /workflowStep === 1 && !canContinueBookingDetails && sourceChannelNotice/);
    assert.match(page, /Source is required to continue\./);
    assert.match(page, /OTA_CHANNEL_EMPTY_MESSAGE/);
    assert.match(page, /channelForm\?\.accepted === true/);
  });

  it("company mode shows contact, corporate rate, and billing only", () => {
    assert.match(company, /Company Contact/);
    assert.match(company, /Corporate Rate/);
    assert.match(company, /Billing Arrangement/);
    assert.match(company, /grid gap-3 sm:grid-cols-2/);
    const contact = company.indexOf("Company Contact");
    const rate = company.indexOf("Corporate Rate");
    const billing = company.indexOf("Billing Arrangement");
    assert.ok(contact >= 0 && rate > contact && billing > rate);
    assert.match(company, /ariaLabel="Company Contact"/);
    assert.match(company, /ariaLabel="Corporate Rate"/);
    assert.match(company, /ariaLabel="Billing Arrangement"/);
    assert.match(company, /onCompanyContactIdChange/);
    assert.match(company, /onBillingRuleIdChange/);
    assert.doesNotMatch(details, /<select/);
    assert.match(details, /<SelectContent className=\{NORU_MENU\}/);
    assert.doesNotMatch(company, /Travel Purpose/);
    assert.doesNotMatch(company, /Contact Person/);
    assert.doesNotMatch(company, /Commission Type/);
    assert.doesNotMatch(details, /Travel Purpose/);
    assert.doesNotMatch(details, /companyAgreementLabel|agencyAgreementLabel|test \(AS\)|TODO:/);
  });

  it("travel agency mode shows contact, rate, and commission only", () => {
    assert.match(agency, /Contact Person/);
    assert.match(agency, /Agency Rate/);
    assert.match(agency, /Commission Type/);
    assert.match(agency, /ariaLabel="Commission"/);
    assert.match(agency, /sm:grid-cols-2/);
    const person = agency.indexOf("Contact Person");
    const rate = agency.indexOf("Agency Rate");
    const type = agency.indexOf("Commission Type");
    const commission = agency.indexOf('ariaLabel="Commission"');
    assert.ok(person >= 0 && rate > person && type > rate && commission > type);
    assert.doesNotMatch(agency, /Company Contact/);
    assert.doesNotMatch(agency, /Corporate Rate/);
    assert.doesNotMatch(agency, /Billing Arrangement/);
    assert.doesNotMatch(agency, /Agency Reference/);
  });

  it("group mode replaces the other commercial content", () => {
    assert.match(group, /Change Group/);
    assert.match(group, /ariaLabel="Block"/);
    assert.match(group, /Group Rate/);
    assert.match(group, /Cut-off Date/);
    assert.match(group, /Pickup/);
    assert.match(group, /sm:grid-cols-2/);
    assert.doesNotMatch(group, /Company Contact/);
    assert.doesNotMatch(group, /Contact Person/);
    assert.doesNotMatch(group, /Commission Type/);
  });

  it("renders one commercial mode at a time", () => {
    assert.match(details, /relationTab === "company"/);
    assert.match(details, /relationTab === "travel_agent"/);
    assert.match(details, /relationTab === "group"/);
    assert.match(details, /role="tablist"/);
    assert.doesNotMatch(details, /Other options preview/);
    assert.equal(details.match(/relationTab === "company" \? \(/g)?.length, 1);
    assert.equal(details.match(/relationTab === "travel_agent" \? \(/g)?.length, 1);
    assert.equal(details.match(/relationTab === "group" \? \(/g)?.length, 1);
  });

  it("keeps the packages table, preference labels, requests, notes, and continue gate", () => {
    assert.match(packages, /<table/);
    assert.match(packages, /card\.coverUrl/);
    assert.match(packages, /PackageCoverThumb/);
    assert.match(packages, /package-cover-image/);
    assert.match(packages, /package-cover-fallback/);
    assert.match(packages, /selected && "bg-\[#FBF6EE\]/);
    assert.match(packages, /<Checkbox/);
    assert.match(packages, /data-selected=\{selected \? "true" : "false"\}/);
    assert.match(packages, /onToggleActivation/);
    assert.match(details, /data-testid="saved-preference-chip"/);
    assert.match(details, /\{row\.label\}/);
    assert.match(details, /apply-saved-preferences/);
    assert.match(details, /<Checkbox/);
    assert.match(details, /booking-details-service-requests/);
    assert.match(details, /onSelectedServiceRequestsChange/);
    assert.match(details, /max-h-32 space-y-0\.5 overflow-y-auto/);
    assert.match(packages, /block break-words leading-snug">\{card\.name\}/);
    assert.doesNotMatch(packages, /truncate">\{card\.name\}/);
    assert.match(details, /Special Requests/);
    assert.match(details, /booking-details-internal-notes/);
    assert.match(page, /canAdvanceFromBookingDetails/);
    assert.match(page, /channelForm\?\.accepted === true/);
    assert.match(page, /reservationCreateChannelForm/);
    assert.match(page, /Continue to Policies & Payment/);
  });
});
