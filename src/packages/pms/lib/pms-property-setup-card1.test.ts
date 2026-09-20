import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SET1_COMING_SOON,
  SET1_HUB_HREF,
  SET1_LIVE_CARDS,
  propertySetupRedirectHref,
} from "./pms-set1-foundation.ts";
import { emptySet2Snapshot } from "./pms-set2-structure.ts";
import {
  CARD1_AGREEMENT_OUT,
  CARD1_AUDIT_ACTIONS,
  CARD1_AUDIT_COMPLETED,
  CARD1_FINISH_COPY,
  CARD1_HASH,
  CARD1_LANGUAGES,
  CARD1_OPENING_DATE_IN,
  CARD1_PMS_NAV,
  CARD1_ROOMS_HREF,
  CARD1_SIDEBAR_OUT,
  CARD1_STEPS,
  CARD1_STRUCTURE_CRUD_COPY,
  CARD1_SUBTITLE,
  CARD1_TITLE,
  CARD1_VAT_GATE_COPY,
  CARD1_WORKSPACE_TITLE,
  D8_STRUCTURE_DEFAULTS,
  PROPERTY_SETUP_CARDS,
  card1FinishActivatesProperty,
  card1LanguageOptions,
  card1StepComplete,
  card1TaxWarnings,
  composeFullAddress,
  continueLabel,
  emptyCard1Draft,
  emptyStructureRules,
  evaluateCard1Status,
  evaluateProgrammeCardStatus,
  finishLabel,
  formatPropertyCode,
  hasVatCertificate,
  isCard1WorkspaceHash,
  isNrcPropertyCode,
  propertySetupStatusLabel,
  validateAddressFields,
  validateBrandImageFile,
  validateIdentityFields,
  vatCertificateRequired,
} from "./pms-property-setup-card1.ts";
import {
  ISO_COUNTRIES,
  KENYA_COUNTIES,
  clearDependentGeography,
  isRegionValidForCountry,
  regionsForCountry,
} from "./pms-geography.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");
const steps = readFileSync(new URL("../components/settings/pms-property-setup-card1-steps.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../../routes/restaurant/settings.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
const lib = readFileSync(new URL("./pms-property-setup-card1.ts", import.meta.url), "utf8");
const fns = readFileSync(new URL("./pms-property-setup-card1.functions.ts", import.meta.url), "utf8");

describe("PMS Property Setup Card 1 fidelity locks", () => {
  it("keeps Agreement absent and finish does not Activate", () => {
    assert.equal(CARD1_AGREEMENT_OUT.includes("Agreement"), true);
    assert.equal(card1FinishActivatesProperty(), false);
    assert.match(CARD1_FINISH_COPY, /does not Activate/);
    assert.match(CARD1_FINISH_COPY, /pms_set1_live/);

    assert.doesNotMatch(lib, /pms_card1_live\s*:/);
    assert.doesNotMatch(lib, /pms_card1_live boolean/);
    assert.match(lib, /no pms_card1_live/);
    assert.match(lib, /Opening Date IN/);

    assert.doesNotMatch(fns, /pms_set1_live:/);
    assert.doesNotMatch(fns, /pms_card1_live/);
    assert.doesNotMatch(fns, /business_date:\s/);
    assert.match(fns, /activated: false/);
    assert.match(fns, /CARD1_AUDIT_COMPLETED/);
    assert.equal(CARD1_AUDIT_COMPLETED, "pms_card1_completed");
    assert.deepEqual([...CARD1_AUDIT_ACTIONS], ["pms_card1_draft_saved", "pms_card1_step_saved", "pms_card1_completed"]);

    assert.doesNotMatch(ui, /sign the agreement|Agreement signing/i);
    assert.doesNotMatch(steps, /sign the agreement|Agreement signing/i);
    assert.match(ui, /Save Draft/);
    assert.match(ui, /Save & Continue/);
    assert.match(ui, /Complete Card 1/);
    assert.match(ui, /Save & Finish/);
    assert.equal(continueLabel("structure"), "Complete Card 1");
    assert.equal(finishLabel("structure"), "Save & Finish");
    assert.equal(continueLabel("identity"), "Save & Continue");
  });

  it("requires Opening Date on Identity Complete and keeps Property Code read-only NRC", () => {
    assert.equal(CARD1_OPENING_DATE_IN.includes("Opening Date"), true);
    assert.match(steps, /card1-opening-date/);
    assert.match(steps, /Opening Date/);
    assert.match(fns, /Opening Date is required/);
    assert.doesNotMatch(steps, /Number of Rooms/);
    assert.doesNotMatch(steps, /Secondary currency|Tertiary currency/);
    assert.match(steps, /card1-identity-panel/);
    assert.match(steps, /card1-branding-panel/);
    assert.match(steps, /readOnly/);
    assert.match(steps, /card1-property-code/);
    assert.doesNotMatch(steps, /https:\/\/ or uploaded URL/);
    assert.match(fns, /createPropertyBrandImageUpload/);
    assert.equal(formatPropertyCode(1), "NRC0001");
    assert.equal(isNrcPropertyCode("NRC0002"), true);
    assert.equal(isNrcPropertyCode("HH"), false);

    const incomplete = emptyCard1Draft({ name: "Harbour House", timezone: "Africa/Addis_Ababa", currencyCode: "ETB" });
    assert.equal(card1StepComplete("identity", incomplete), false);
    assert.equal(
      card1StepComplete(
        "identity",
        emptyCard1Draft({
          name: "Harbour House",
          propertyType: "hotel",
          businessType: "independent",
          openingDate: "2026-09-17",
          timezone: "Africa/Addis_Ababa",
          currencyCode: "ETB",
          defaultLanguage: "en",
        }),
      ),
      true,
    );
  });

  it("keeps Full Address and CURRENT STATE read-only", () => {
    const composed = composeFullAddress({
      addressHouseNo: "12",
      address: "Bole Road",
      addressKebele: "03",
      addressSubcity: "Bole",
      city: "Addis Ababa",
      addressRegion: "Addis Ababa",
      country: "Ethiopia",
    });
    assert.equal(composed, "Ethiopia, Addis Ababa, Addis Ababa, Bole, 03, 12 Bole Road");

    assert.match(steps, /card1-full-address/);
    assert.match(steps, /readOnly/);
    assert.match(steps, /card1-business-date-current/);
    assert.match(steps, /CURRENT STATE/);
    assert.doesNotMatch(steps, /name="fullAddress"/);
    assert.doesNotMatch(steps, /name="businessDate"/);
    assert.doesNotMatch(steps, /setDraft\(\(p\) => \(\{ \.\.\.p, fullAddress/);
    assert.doesNotMatch(steps, /setDraft\(\(p\) => \(\{ \.\.\.p, businessDate:/);
  });

  it("uses searchable country/region catalogues and rejects invalid geography", () => {
    assert.ok(ISO_COUNTRIES.some((row) => row.code === "ET" && row.name === "Ethiopia"));
    assert.ok(ISO_COUNTRIES.some((row) => row.code === "KE"));
    assert.ok(ISO_COUNTRIES.some((row) => row.code === "GB"));
    assert.ok(ISO_COUNTRIES.some((row) => row.code === "US"));
    assert.ok(ISO_COUNTRIES.length > 180);
    assert.ok(regionsForCountry("ET").includes("Addis Ababa"));
    assert.ok(!regionsForCountry("ET").includes("Nairobi"));
    assert.ok(KENYA_COUNTIES.includes("Nairobi"));
    assert.equal(isRegionValidForCountry("Kenya", "Addis Ababa"), false);
    assert.equal(isRegionValidForCountry("KE", "Nairobi"), true);
    const cleared = clearDependentGeography(
      emptyCard1Draft({ country: "Kenya", addressRegion: "Addis Ababa", city: "Addis Ababa", addressWoreda: "03" }),
    );
    assert.equal(cleared.addressRegion, "");
    assert.equal(cleared.city, "");
    assert.equal(cleared.addressWoreda, "");
    assert.equal(
      card1StepComplete("address", emptyCard1Draft({ country: "Kenya", addressRegion: "Addis Ababa", city: "Nairobi" })),
      false,
    );
    assert.equal(
      card1StepComplete("address", emptyCard1Draft({ country: "Kenya", addressRegion: "Nairobi", city: "Nairobi" })),
      true,
    );
    assert.equal(validateAddressFields(emptyCard1Draft({ latitude: "99999" })).latitude, "Latitude must be between -90 and 90.");
    assert.equal(
      validateAddressFields(emptyCard1Draft({ longitude: "9898989" })).longitude,
      "Longitude must be between -180 and 180.",
    );
    assert.equal(
      validateAddressFields(emptyCard1Draft({ locationExtras: { googleMapsLink: "not-a-url", nearbyLandmark: "", pinVisible: true } }))
        .googleMapsLink,
      "Enter a valid URL.",
    );
    assert.match(steps, /SearchableSelect/);
    assert.match(ui, /pms-card1-status-rail/);
    assert.match(steps, /CARD1_ADDRESS_ADAPT_COPY/);
  });

  it("requires VAT certificate only when VAT Registered is On", () => {
    assert.equal(vatCertificateRequired(false), false);
    assert.equal(vatCertificateRequired(true), true);
    assert.equal(hasVatCertificate([{ name: "vat.pdf", kind: "vat_certificate" }]), true);
    assert.equal(hasVatCertificate([{ name: "tin.pdf", kind: "tin" }]), false);
    assert.deepEqual(card1TaxWarnings(emptyCard1Draft({ vatRegistered: false })), []);
    assert.ok(card1TaxWarnings(emptyCard1Draft({ vatRegistered: true }))[0]?.includes("VAT certificate"));
    assert.deepEqual(
      card1TaxWarnings(emptyCard1Draft({ vatRegistered: true, taxUploadRefs: [{ name: "vat.pdf", kind: "vat_certificate" }] })),
      [],
    );
    assert.equal(card1StepComplete("tax", emptyCard1Draft({ vatRegistered: false })), true);
    assert.equal(card1StepComplete("tax", emptyCard1Draft({ vatRegistered: true })), false);
    assert.equal(CARD1_VAT_GATE_COPY.includes("VAT Registered"), true);
    assert.match(steps, /vatCertificateRequired\(draft.vatRegistered\)/);
    assert.match(steps, /VAT certificate/);
  });

  it("locks D8 structure defaults and ships full Structure CRUD not a stub", () => {
    assert.deepEqual(D8_STRUCTURE_DEFAULTS, {
      buildingRequired: true,
      wingOptional: true,
      floorRequired: true,
      roomCodeFormat: "BLD-WNG-FLR-RM",
      autoNumbering: true,
      duplicateCodePrevention: true,
    });
    assert.deepEqual(emptyStructureRules(), D8_STRUCTURE_DEFAULTS);
    const set2 = emptySet2Snapshot({ roomCount: 7, roomTypeCount: 2 });
    assert.equal(CARD1_ROOMS_HREF, "/restaurant/pms/room-inventory?tab=rooms");
    assert.match(steps, /Building required/);
    assert.match(steps, /Wing optional/);
    assert.match(steps, /Floor required/);
    assert.match(steps, /Open room inventory/);
    assert.match(steps, /derivedCapacity/);
    assert.match(steps, /\+ Add Building/);
    assert.match(steps, /\+ Add Wing/);
    assert.match(steps, /\+ Add Floor/);
    assert.match(steps, /Deactivate/);
    assert.match(steps, /Number of Floors/);
    assert.match(steps, /card1-structure-tree/);
    assert.match(steps, /CARD1_STRUCTURE_CRUD_COPY|Full hierarchy CRUD/);
    assert.doesNotMatch(steps, /Coming soon stub/);
    assert.doesNotMatch(steps, /planned Number of Rooms/);
    assert.equal(CARD1_STRUCTURE_CRUD_COPY.includes("not a Coming soon stub"), true);
    assert.equal(set2.roomCount, 7);
  });

  it("gates Contacts Complete on emergency name and phone", () => {
    assert.equal(
      card1StepComplete(
        "contacts",
        emptyCard1Draft({ phone: "+251911000000", email: "ops@example.com" }),
      ),
      false,
    );
    assert.equal(
      card1StepComplete(
        "contacts",
        emptyCard1Draft({
          phone: "+251911000000",
          email: "ops@example.com",
          emergency: { name: "Night Manager", phone: "+251911000111", notes: "" },
        }),
      ),
      true,
    );
    assert.match(steps, /card1-emergency/);
    assert.match(steps, /Emergency contact name/);
    assert.match(fns, /Emergency contact name and phone are required/);
    assert.match(steps, /id="card1-website"/);
    assert.match(steps, /Company Website/);
    assert.match(steps, /\+ Add social link/);
    assert.match(steps, /\+ Add department/);
  });

  it("keeps the eight-card programme and status honesty as cards are spec'd", () => {
    assert.equal(PROPERTY_SETUP_CARDS.length, 8);
    assert.deepEqual(
      PROPERTY_SETUP_CARDS.map((card) => ({ number: card.number, title: card.title, purpose: card.purpose })),
      [
        {
          number: 1,
          title: "Property & Business",
          purpose: "Identity & Branding, Check-In & Check-Out, Business Date, Property Structure.",
        },
        {
          number: 2,
          title: "Rooms & Operations",
          purpose: "Rooms & Room Types, Amenities, Housekeeping Rules, Room Inventory Rules, Maintenance Rules.",
        },
        {
          number: 3,
          title: "Financial & Commercial",
          purpose: "Taxes, Policies & Fees, Rates & Meal Plans, Payment Methods.",
        },
        {
          number: 4,
          title: "Guest & Services",
          purpose: "Guest Profile Rules, Guest Service Types, Notifications & Communication.",
        },
        {
          number: 5,
          title: "Organization & Facilities",
          purpose: "Departments, Outlets & Facilities, Sales & Events.",
        },
        {
          number: 6,
          title: "Connectivity & Distribution",
          purpose: "Integrations and Distribution.",
        },
        {
          number: 7,
          title: "Security, Data & Reports",
          purpose: "Security & Roles, Audit, Reports & Analytics, Data Import & Migration.",
        },
        {
          number: 8,
          title: "System & Go-Live",
          purpose: "Offline & Sync, System Validation, Go-Live, Property Activation.",
        },
      ],
    );
    assert.equal(PROPERTY_SETUP_CARDS[0].title, CARD1_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[0].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[1].title, "Rooms & Operations");
    assert.equal(PROPERTY_SETUP_CARDS[1].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[2].title, "Financial & Commercial");
    assert.equal(PROPERTY_SETUP_CARDS[2].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[4].title, "Organization & Facilities");
    assert.equal(PROPERTY_SETUP_CARDS[4].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[3].title, "Guest & Services");
    assert.equal(PROPERTY_SETUP_CARDS[3].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[5].title, "Connectivity & Distribution");
    assert.equal(PROPERTY_SETUP_CARDS[5].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[6].title, "Security, Data & Reports");
    assert.equal(PROPERTY_SETUP_CARDS[6].specced, true);
    assert.equal(PROPERTY_SETUP_CARDS[7].title, "System & Go-Live");
    assert.equal(PROPERTY_SETUP_CARDS[7].specced, true);
    assert.deepEqual(
      PROPERTY_SETUP_CARDS.filter((card) => !card.specced).map((card) => card.number),
      [],
    );
    assert.ok(PROPERTY_SETUP_CARDS.every((card) => (card.specced ? card.hash !== null : card.hash === null)));
    assert.equal(CARD1_STEPS.length, 8);
    assert.deepEqual(
      CARD1_STEPS.map((step) => step.title),
      [
        "Property Identity",
        "Address & Location",
        "Contacts",
        "Check-In & Check-Out",
        "Business Date",
        "Legal Identity",
        "Tax Documents",
        "Property Structure",
      ],
    );
    assert.equal(propertySetupStatusLabel("complete"), "Complete");
    assert.equal(propertySetupStatusLabel("in_progress"), "In Progress");
    assert.equal(propertySetupStatusLabel("not_started"), "Not Started");

    const incomplete = evaluateCard1Status(emptyCard1Draft(), { cards: {}, card1Steps: {} });
    assert.equal(incomplete, "not_started");
    const started = evaluateCard1Status(emptyCard1Draft({ name: "Harbour House", timezone: "Africa/Addis_Ababa", currencyCode: "ETB" }), {
      cards: { "property-business": "in_progress" },
      card1Steps: { identity: "complete" },
    });
    assert.equal(started, "in_progress");
    assert.equal(evaluateProgrammeCardStatus("rooms-inventory", { cards: {}, card1Steps: {} }, "complete"), "not_started");

    assert.match(hub, /PROPERTY_SETUP_CARDS.map/);
    assert.match(hub, /Coming soon/);
    assert.match(hub, /PmsPropertySetupCard1Section/);
    assert.match(hub, /PmsPropertySetupCard2Section/);
    assert.match(hub, /PmsPropertySetupCard3Section/);
    assert.match(hub, /Complete \/ In Progress \/ Not Started|propertySetupStatusLabel/);
    assert.doesNotMatch(hub, /FO-CHROME1/);
    assert.doesNotMatch(hub, /overbooking/i);
    assert.doesNotMatch(hub, /Agreement/);
    assert.ok(!SET1_COMING_SOON.some((card) => card.title === CARD1_TITLE));
    assert.ok(SET1_LIVE_CARDS.some((card) => card.id === "structure"));
    assert.deepEqual(SET1_COMING_SOON, []);

    const comingSoon = hub.slice(hub.indexOf("SET1_COMING_SOON.map"));
    assert.match(comingSoon, /Coming soon/);
    assert.doesNotMatch(comingSoon, /Configure/);
  });

  it("uses full-screen chrome and keeps the old Settings sidebar out of Card 1", () => {
    assert.equal(CARD1_WORKSPACE_TITLE, "Property & Business Setup");
    assert.equal(CARD1_SIDEBAR_OUT.includes("sidebar"), true);
    assert.deepEqual(
      CARD1_PMS_NAV.map((item) => item.label),
      ["Dashboard", "FO", "Reservation", "Housekeeping", "Cashiering", "Night Audit", "Settings"],
    );
    assert.match(ui, /pms-card1-fullscreen/);
    assert.match(ui, /pms-card1-top-nav/);
    assert.match(ui, /CARD1_WORKSPACE_TITLE/);
    assert.match(ui, /CARD1_SIDEBAR_OUT/);
    assert.doesNotMatch(ui, /Foundation badge|SET1_FOUNDATION_CHIP/);
    assert.match(settings, /hidePackageRail/);
    assert.match(settings, /isCard1WorkspaceHash/);
    assert.match(settings, /isCard2WorkspaceHash/);
    assert.match(shell, /hidePackageRailProp/);
    assert.doesNotMatch(ui, /SETTINGS rail/);
  });

  it("redirects property-setup honestly and keeps Card 1 hash", () => {
    assert.equal(propertySetupRedirectHref(""), SET1_HUB_HREF);
    assert.equal(propertySetupRedirectHref("#property-business"), `${SET1_HUB_HREF}#property-business`);
    assert.equal(propertySetupRedirectHref("#card-1"), `${SET1_HUB_HREF}#property-business`);
    assert.equal(propertySetupRedirectHref("#policies"), `${SET1_HUB_HREF}#policies`);
    assert.equal(isCard1WorkspaceHash("#property-business"), true);
    assert.equal(isCard1WorkspaceHash("#identity"), false);
    assert.equal(CARD1_HASH, "property-business");
  });

  it("matches Property Identity language, validation, and image rules", () => {
    assert.match(CARD1_SUBTITLE, /compliance for your NORU setup/);
    assert.deepEqual(
      CARD1_LANGUAGES.map((row) => row.label),
      ["English", "Amharic", "Afaan Oromo", "Tigrinya", "Arabic", "Spanish", "Dutch", "Chinese", "Portuguese"],
    );
    assert.ok(card1LanguageOptions("so").some((row) => row.id === "so" && row.label === "Somali"));
    assert.equal(validateIdentityFields(emptyCard1Draft()).name, "Property name is required.");
    assert.equal(validateIdentityFields(emptyCard1Draft()).openingDate, "Opening date is required.");
    assert.equal(
      validateIdentityFields(emptyCard1Draft({ websiteUrl: "not-a-url" })).websiteUrl,
      "Enter a valid website address.",
    );
    assert.equal(
      validateBrandImageFile({ type: "application/pdf", size: 100 }),
      "Only PNG, JPG, JPEG and WEBP images are allowed.",
    );
    assert.equal(
      validateBrandImageFile({ type: "image/png", size: 2 * 1024 * 1024 }),
      "Image must be smaller than 1 MB.",
    );
    assert.equal(validateBrandImageFile({ type: "image/webp", size: 512 }), null);
    assert.match(ui, /pms-card1-status-rail/);
    assert.match(steps, /BrandImageField/);
    assert.match(steps, /createPropertyBrandImageUpload/);
  });

  it("ships dual-lane 0063 without live apply, seed, or a second live flag", () => {
    const drizzle063 = join(here, "../../../../drizzle/migrations/0063_pms_property_setup_card1_fidelity.sql");
    const supabase063 = join(here, "../../../../supabase/migrations/0063_pms_property_setup_card1_fidelity.sql");
    assert.equal(existsSync(drizzle063), true);
    assert.equal(existsSync(supabase063), true);
    const drizzle = readFileSync(drizzle063, "utf8");
    const supabase = readFileSync(supabase063, "utf8");
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /APPLY AFTER MERGE/);
    assert.match(drizzle, /Abel authorized/);
    assert.match(drizzle, /opening_date/);
    assert.match(drizzle, /cover_image_url/);
    assert.match(drizzle, /emergency_contacts/);
    assert.match(drizzle, /property_areas/);
    assert.match(drizzle, /floor_count/);
    assert.match(drizzle, /GRANT SELECT/);
    assert.doesNotMatch(drizzle, /pms_card1_live boolean/);
    assert.doesNotMatch(drizzle, /ADD COLUMN IF NOT EXISTS pms_card1_live/);
    assert.match(drizzle, /No pms_card1_live/);
    assert.doesNotMatch(drizzle, /CREATE FUNCTION/);
    assert.match(drizzle, /No SECURITY DEFINER/);
    assert.doesNotMatch(drizzle, /INSERT INTO/);
    assert.match(drizzle, /do not apply to production from an agent/i);

    const audit = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(audit, /CARD1_AUDIT_ACTIONS/);
  });
});
