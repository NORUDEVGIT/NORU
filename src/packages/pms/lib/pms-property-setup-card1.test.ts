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
  CARD1_OPENING_DATE_OUT,
  CARD1_ROOMS_HREF,
  CARD1_STEPS,
  CARD1_TITLE,
  CARD1_VAT_GATE_COPY,
  D8_STRUCTURE_DEFAULTS,
  PROPERTY_SETUP_CARDS,
  card1FinishActivatesProperty,
  card1StepComplete,
  card1TaxWarnings,
  composeFullAddress,
  continueLabel,
  emptyCard1Draft,
  emptyStructureRules,
  evaluateCard1Status,
  evaluateProgrammeCardStatus,
  finishLabel,
  hasVatCertificate,
  isCard1WorkspaceHash,
  propertySetupStatusLabel,
  vatCertificateRequired,
} from "./pms-property-setup-card1.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("PMS Property Setup Card 1 locks", () => {
  it("keeps Agreement absent and finish does not Activate", () => {
    assert.equal(CARD1_AGREEMENT_OUT.includes("Agreement"), true);
    assert.equal(card1FinishActivatesProperty(), false);
    assert.match(CARD1_FINISH_COPY, /does not Activate/);
    assert.match(CARD1_FINISH_COPY, /pms_set1_live/);

    const lib = readFileSync(new URL("./pms-property-setup-card1.ts", import.meta.url), "utf8");
    assert.doesNotMatch(lib, /pms_card1_live\s*:/);
    assert.doesNotMatch(lib, /pms_card1_live boolean/);
    assert.match(lib, /no pms_card1_live/);
    assert.match(lib, /Opening Date OUT/);

    const fns = readFileSync(new URL("./pms-property-setup-card1.functions.ts", import.meta.url), "utf8");
    assert.doesNotMatch(fns, /pms_set1_live:/);
    assert.doesNotMatch(fns, /pms_card1_live/);
    assert.doesNotMatch(fns, /business_date:\s/);
    assert.match(fns, /activated: false/);
    assert.match(fns, /CARD1_AUDIT_COMPLETED/);
    assert.equal(CARD1_AUDIT_COMPLETED, "pms_card1_completed");
    assert.deepEqual([...CARD1_AUDIT_ACTIONS], ["pms_card1_draft_saved", "pms_card1_step_saved", "pms_card1_completed"]);

    const ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(ui, /sign the agreement|Agreement signing/i);
    assert.doesNotMatch(ui, /openingDate|opening-date|Opening date/);
    assert.match(ui, /CARD1_OPENING_DATE_OUT/);
    assert.match(ui, /Save Draft/);
    assert.match(ui, /Save & Continue/);
    assert.match(ui, /Complete Card 1/);
    assert.match(ui, /Save & Finish/);
    assert.equal(CARD1_OPENING_DATE_OUT.includes("Opening Date"), true);
    assert.equal(continueLabel("structure"), "Complete Card 1");
    assert.equal(finishLabel("structure"), "Save & Finish");
    assert.equal(continueLabel("identity"), "Save & Continue");
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
    assert.equal(composed, "12 Bole Road, 03, Bole, Addis Ababa, Addis Ababa, Ethiopia");

    const ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");
    assert.match(ui, /card1-full-address/);
    assert.match(ui, /readOnly/);
    assert.match(ui, /card1-business-date-current/);
    assert.match(ui, /CURRENT STATE/);
    assert.doesNotMatch(ui, /name="fullAddress"/);
    assert.doesNotMatch(ui, /name="businessDate"/);
    assert.doesNotMatch(ui, /setDraft\(\(p\) => \(\{ \.\.\.p, fullAddress/);
    assert.doesNotMatch(ui, /setDraft\(\(p\) => \(\{ \.\.\.p, businessDate:/);
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

    const ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");
    assert.match(ui, /vatCertificateRequired\(draft.vatRegistered\)/);
    assert.match(ui, /VAT certificate/);
  });

  it("locks D8 structure defaults and derives capacity", () => {
    assert.deepEqual(D8_STRUCTURE_DEFAULTS, { buildingRequired: true, wingOptional: true, floorRequired: true });
    assert.deepEqual(emptyStructureRules(), D8_STRUCTURE_DEFAULTS);
    const set2 = emptySet2Snapshot({ roomCount: 7, roomTypeCount: 2 });
    assert.equal(CARD1_ROOMS_HREF, "/restaurant/pms/room-inventory?tab=rooms");
    const ui = readFileSync(new URL("../components/settings/pms-property-setup-card1-section.tsx", import.meta.url), "utf8");
    assert.match(ui, /Building required/);
    assert.match(ui, /Wing optional/);
    assert.match(ui, /Floor required/);
    assert.match(ui, /Open room inventory/);
    assert.match(ui, /Set2StructureSection/);
    assert.match(ui, /derivedCapacity/);
    assert.equal(set2.roomCount, 7);
  });

  it("shows Cards 2–8 as Coming soon and keeps status honesty", () => {
    assert.equal(PROPERTY_SETUP_CARDS.length, 8);
    assert.equal(PROPERTY_SETUP_CARDS[0].title, CARD1_TITLE);
    assert.equal(PROPERTY_SETUP_CARDS[0].specced, true);
    assert.ok(PROPERTY_SETUP_CARDS.slice(1).every((card) => card.specced === false));
    assert.equal(CARD1_STEPS.length, 8);
    assert.deepEqual(
      CARD1_STEPS.map((step) => step.title),
      [
        "Property Identity",
        "Address & Location",
        "Contacts",
        "Check-in & Check-out",
        "Business Date",
        "Legal Identity",
        "Tax & Documents",
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

    const hub = readFileSync(new URL("../components/settings/pms-set1-hub.tsx", import.meta.url), "utf8");
    assert.match(hub, /PROPERTY_SETUP_CARDS.map/);
    assert.match(hub, /Coming soon/);
    assert.match(hub, /PmsPropertySetupCard1Section/);
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

  it("redirects property-setup honestly and keeps Card 1 hash", () => {
    assert.equal(propertySetupRedirectHref(""), SET1_HUB_HREF);
    assert.equal(propertySetupRedirectHref("#property-business"), `${SET1_HUB_HREF}#property-business`);
    assert.equal(propertySetupRedirectHref("#card-1"), `${SET1_HUB_HREF}#property-business`);
    assert.equal(propertySetupRedirectHref("#policies"), `${SET1_HUB_HREF}#policies`);
    assert.equal(isCard1WorkspaceHash("#property-business"), true);
    assert.equal(isCard1WorkspaceHash("#identity"), false);
    assert.equal(CARD1_HASH, "property-business");
  });

  it("ships dual-lane 0062 without live apply, seed, or a second live flag", () => {
    const drizzle062 = join(here, "../../../../drizzle/migrations/0062_pms_property_setup_card1.sql");
    const supabase062 = join(here, "../../../../supabase/migrations/0062_pms_property_setup_card1.sql");
    assert.equal(existsSync(drizzle062), true);
    assert.equal(existsSync(supabase062), true);
    const drizzle = readFileSync(drizzle062, "utf8");
    const supabase = readFileSync(supabase062, "utf8");
    assert.equal(drizzle, supabase);
    assert.match(drizzle, /APPLY AFTER MERGE/);
    assert.match(drizzle, /Abel authorized/);
    assert.match(drizzle, /trading_name/);
    assert.match(drizzle, /vat_registered/);
    assert.match(drizzle, /structure_rules_posture/);
    assert.match(drizzle, /pms_property_setup_status/);
    assert.match(drizzle, /full_address/);
    assert.match(drizzle, /GRANT SELECT/);
    assert.doesNotMatch(drizzle, /pms_card1_live boolean/);
    assert.doesNotMatch(drizzle, /ADD COLUMN IF NOT EXISTS pms_card1_live/);
    assert.match(drizzle, /No pms_card1_live/);
    assert.doesNotMatch(drizzle, /CREATE FUNCTION/);
    assert.match(drizzle, /No SECURITY DEFINER/);
    assert.doesNotMatch(drizzle, /INSERT INTO/);
    assert.doesNotMatch(drizzle, /CREATE FUNCTION/);
    assert.match(drizzle, /do not apply to production from an agent/i);

    const audit = readFileSync(new URL("./pms-set1-foundation.functions.ts", import.meta.url), "utf8");
    assert.match(audit, /CARD1_AUDIT_ACTIONS/);
  });
});
