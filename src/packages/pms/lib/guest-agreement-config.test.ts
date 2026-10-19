import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

import { defaultGuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-defaults";
import {
  canManageGuestAgreement,
  copyGuestAgreementPackage,
  guestAgreementPlaceholderTokens,
  missingRequiredAcknowledgements,
  nextGuestAgreementLabel,
  projectCheckInAgreementContent,
  publishGuestAgreementSnapshot,
  shouldSeedGuestAgreement,
  withAcknowledgement,
  withAcknowledgementEnabled,
  withAcknowledgementRequired,
  withSection,
  withSectionEnabled,
  withSectionWording,
  withoutAcknowledgement,
  withoutSection,
  type GuestAgreementPackage,
} from "@/packages/pms/lib/guest-agreement-config";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/0171_guest_agreement_configuration.sql");
const drizzle = read("drizzle/migrations/0171_guest_agreement_configuration.sql");
const functions = read("src/packages/pms/lib/guest-agreement.functions.ts");
const checkIn = read("src/packages/pms/lib/fo-check-in-agreement.functions.ts");
const register = read("src/core/lib/restaurant.functions.ts");

function published(source: GuestAgreementPackage, checkInTime: string, checkOutTime: string) {
  return publishGuestAgreementSnapshot(source, { checkInTime, checkOutTime });
}

describe("guest agreement configuration", () => {
  it("uses the default title", () => {
    assert.equal(defaultGuestAgreementPackage().title, "Hotel Registration Agreement");
  });

  it("uses the default introduction", () => {
    assert.match(
      defaultGuestAgreementPackage().intro,
      /hotel's terms, policies, and applicable charges/,
    );
  });

  it("uses the default lead-in", () => {
    assert.match(defaultGuestAgreementPackage().leadIn, /hotel registration terms and conditions/);
  });

  it("uses the default acknowledgement heading and introduction", () => {
    const agreement = defaultGuestAgreementPackage();
    assert.equal(agreement.acknowledgementTitle, "Guest Acknowledgement");
    assert.match(agreement.acknowledgementIntro, /confirm the following statements/);
  });

  it("includes seven default sections", () => {
    assert.deepEqual(
      defaultGuestAgreementPackage().sections.map((section) => section.id),
      [
        "check_in_time",
        "check_out_time",
        "identification",
        "guest_responsibility",
        "smoking_policy",
        "privacy_data_use",
        "payment_incidental",
      ],
    );
  });

  it("orders the default sections from 10 to 70", () => {
    assert.deepEqual(
      defaultGuestAgreementPackage().sections.map((section) => section.displayOrder),
      [10, 20, 30, 40, 50, 60, 70],
    );
  });

  it("includes four default acknowledgements", () => {
    assert.deepEqual(
      defaultGuestAgreementPackage().acknowledgements.map((item) => item.id),
      ["registration_information", "hotel_terms", "privacy_data_use", "payment_authorization"],
    );
  });

  it("requires every default acknowledgement", () => {
    assert.equal(
      defaultGuestAgreementPackage().acknowledgements.every(
        (item) => item.required && item.enabled,
      ),
      true,
    );
  });

  it("orders the default acknowledgements from 10 to 40", () => {
    assert.deepEqual(
      defaultGuestAgreementPackage().acknowledgements.map((item) => item.displayOrder),
      [10, 20, 30, 40],
    );
  });

  it("seeds only a property with no agreement version", () => {
    assert.equal(shouldSeedGuestAgreement(0), true);
    assert.equal(shouldSeedGuestAgreement(1), false);
    assert.equal(shouldSeedGuestAgreement(4), false);
  });

  it("does not overwrite a property that already has a version", () => {
    assert.match(migration, /WHERE NOT EXISTS/);
    assert.match(migration, /SET published_at = created_at/);
    assert.doesNotMatch(migration, /SET body/);
  });

  it("keeps the two migration lanes identical", () => {
    assert.equal(migration, drizzle);
    assert.match(migration, /Do not apply from an agent/);
  });

  it("seeds from the configuration read and from restaurant registration", () => {
    assert.match(functions, /seedGuestAgreementDraft/);
    assert.match(register, /seedGuestAgreementDraft\(supabaseAdmin, restaurantId\)/);
  });

  it("reads check-in and check-out times from property setup", () => {
    assert.match(functions, /check_in_time, check_out_time/);
    assert.match(functions, /normalizeClock/);
    assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS check_in_time/);
    assert.doesNotMatch(functions, /14:00|12:00/);
  });

  it("resolves the check-in placeholder when the version is published", () => {
    const result = published(defaultGuestAgreementPackage(), "14:00:00", "12:00");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.package.sections.find((section) => section.id === "check_in_time")
        ?.resolvedDescription,
      "Check-in time is 14:00. Early check-in is subject to availability.",
    );
  });

  it("resolves the check-out placeholder when the version is published", () => {
    const result = published(defaultGuestAgreementPackage(), "14:00", "12:00");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.package.sections.find((section) => section.id === "check_out_time")
        ?.resolvedDescription,
      "Check-out time is 12:00. Late check-out is subject to availability and may incur additional charges.",
    );
  });

  it("keeps an already published snapshot when property times change", () => {
    const first = published(defaultGuestAgreementPackage(), "14:00", "11:00");
    published(defaultGuestAgreementPackage(), "15:00", "11:00");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.match(first.package.sections[0]?.resolvedDescription ?? "", /14:00/);
  });

  it("resolves the new property times on a later publish", () => {
    const second = published(defaultGuestAgreementPackage(), "15:00", "10:30");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.match(second.package.sections[0]?.resolvedDescription ?? "", /15:00/);
    assert.match(second.package.sections[1]?.resolvedDescription ?? "", /10:30/);
  });

  it("refuses to publish when a used property time is empty", () => {
    const result = published(defaultGuestAgreementPackage(), "", "12:00");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "AGREEMENT_PROPERTY_TIME_MISSING");
  });

  it("refuses an unknown placeholder instead of dropping it", () => {
    const unknown = withSectionWording(
      defaultGuestAgreementPackage(),
      "identification",
      "Fee {{late_fee}}.",
    );
    const rejected = published(unknown, "14:00", "12:00");
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.code, "AGREEMENT_PLACEHOLDER_UNKNOWN");
    assert.equal(guestAgreementPlaceholderTokens(unknown).includes("late_fee"), true);
    assert.match(
      unknown.sections.find((section) => section.id === "identification")?.descriptionTemplate ??
        "",
      /\{\{late_fee\}\}/,
    );
  });

  it("lets an owner manage the agreement", () => {
    assert.equal(canManageGuestAgreement("owner"), true);
  });

  it("lets a manager manage the agreement", () => {
    assert.equal(canManageGuestAgreement("manager"), true);
  });

  it("rejects a receptionist on the server", () => {
    assert.equal(canManageGuestAgreement("receptionist"), false);
    assert.match(functions, /assertManager\(me\.role\)/);
    assert.match(functions, /An owner or manager has to manage the guest agreement/);
  });

  it("edits section wording without changing the source package", () => {
    const source = defaultGuestAgreementPackage();
    const edited = withSectionWording(source, "identification", "Bring a passport.");
    assert.match(
      source.sections.find((section) => section.id === "identification")?.descriptionTemplate ?? "",
      /government-issued/,
    );
    assert.equal(
      edited.sections.find((section) => section.id === "identification")?.descriptionTemplate,
      "Bring a passport.",
    );
  });

  it("disables a section", () => {
    const disabled = withSectionEnabled(defaultGuestAgreementPackage(), "smoking_policy", false);
    assert.equal(
      disabled.sections.find((section) => section.id === "smoking_policy")?.enabled,
      false,
    );
  });

  it("removes a section", () => {
    const removed = withoutSection(defaultGuestAgreementPackage(), "smoking_policy");
    assert.equal(
      removed.sections.some((section) => section.id === "smoking_policy"),
      false,
    );
    assert.equal(removed.sections.length, 6);
  });

  it("adds a section", () => {
    const added = withSection(defaultGuestAgreementPackage(), {
      id: "pets",
      title: "Pets",
      descriptionTemplate: "Pets must be arranged in advance.",
      resolvedDescription: null,
      enabled: true,
      displayOrder: 80,
    });
    assert.equal(
      added.sections.some((section) => section.id === "pets"),
      true,
    );
  });

  it("publishes sections in display order", () => {
    const reversed = defaultGuestAgreementPackage();
    reversed.sections = [...reversed.sections].reverse();
    const result = published(reversed, "14:00", "12:00");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.package.sections.map((section) => section.displayOrder),
      [10, 20, 30, 40, 50, 60, 70],
    );
  });

  it("disables an acknowledgement", () => {
    const disabled = withAcknowledgementEnabled(
      defaultGuestAgreementPackage(),
      "hotel_terms",
      false,
    );
    assert.equal(
      disabled.acknowledgements.find((item) => item.id === "hotel_terms")?.enabled,
      false,
    );
  });

  it("changes whether an acknowledgement is required", () => {
    const optional = withAcknowledgementRequired(
      defaultGuestAgreementPackage(),
      "hotel_terms",
      false,
    );
    assert.equal(
      optional.acknowledgements.find((item) => item.id === "hotel_terms")?.required,
      false,
    );
  });

  it("adds an acknowledgement", () => {
    const added = withAcknowledgement(defaultGuestAgreementPackage(), {
      id: "house_rules",
      title: "House rules",
      statement: "I will follow the house rules shown to me.",
      enabled: true,
      required: false,
      displayOrder: 50,
    });
    assert.equal(
      added.acknowledgements.some((item) => item.id === "house_rules"),
      true,
    );
  });

  it("removes an acknowledgement without changing the source", () => {
    const source = defaultGuestAgreementPackage();
    const removed = withoutAcknowledgement(source, "payment_authorization");
    assert.equal(source.acknowledgements.length, 4);
    assert.equal(
      removed.acknowledgements.some((item) => item.id === "payment_authorization"),
      false,
    );
  });

  it("stores the resolved wording on the published snapshot", () => {
    const result = published(defaultGuestAgreementPackage(), "14:00", "12:00");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.body, /Check-in time is 14:00/);
    assert.match(result.package.sections[0]?.resolvedDescription ?? "", /14:00/);
    assert.equal(result.checkInTime, "14:00");
    assert.equal(result.checkOutTime, "12:00");
  });

  it("edits and publishes only an open draft", () => {
    assert.match(functions, /\.is\("published_at", null\)/);
    assert.match(functions, /AGREEMENT_DRAFT_EXISTS/);
    assert.match(functions, /AGREEMENT_DRAFT_REQUIRED/);
  });

  it("freezes referenced wording and still allows the active flag to change", () => {
    assert.match(migration, /NEW.agreement_sections IS DISTINCT FROM OLD.agreement_sections/);
    assert.match(migration, /NEW.acknowledgements IS DISTINCT FROM OLD.acknowledgements/);
    assert.match(
      migration,
      /NEW.resolved_check_in_time IS DISTINCT FROM OLD.resolved_check_in_time/,
    );
    assert.doesNotMatch(migration, /NEW\.active/);
  });

  it("copies a draft and does not update the source version", () => {
    const source = defaultGuestAgreementPackage();
    source.sections[0]!.resolvedDescription =
      "Check-in time is 14:00. Early check-in is subject to availability.";
    const copied = copyGuestAgreementPackage(source);
    copied.sections[0]!.descriptionTemplate = "Changed";
    assert.match(source.sections[0]?.resolvedDescription ?? "", /14:00/);
    assert.equal(copied.sections[0]?.resolvedDescription, null);
    assert.notEqual(
      copied.sections[0]?.descriptionTemplate,
      source.sections[0]?.descriptionTemplate,
    );
    const create = functions.slice(
      functions.indexOf("export const createGuestAgreementVersion"),
      functions.indexOf("export const updateGuestAgreementDraft"),
    );
    assert.match(create, /copyGuestAgreementPackage/);
    assert.match(create, /\.insert\(/);
    assert.doesNotMatch(create, /\.update\(/);
    assert.equal(nextGuestAgreementLabel(["1", "2"]), "3");
  });

  it("returns enabled sections and acknowledgements in display order", () => {
    const draft = withSectionEnabled(
      withAcknowledgementEnabled(defaultGuestAgreementPackage(), "hotel_terms", false),
      "smoking_policy",
      false,
    );
    const snapshot = published(draft, "14:00", "12:00");
    assert.equal(snapshot.ok, true);
    if (!snapshot.ok) return;
    const view = projectCheckInAgreementContent({
      id: "version-1",
      label: "1",
      body: snapshot.body,
      title: snapshot.package.title,
      intro: snapshot.package.intro,
      leadIn: snapshot.package.leadIn,
      acknowledgementTitle: snapshot.package.acknowledgementTitle,
      acknowledgementIntro: snapshot.package.acknowledgementIntro,
      sections: snapshot.package.sections,
      acknowledgements: snapshot.package.acknowledgements,
    });
    assert.equal(view.legacy, false);
    assert.equal(
      view.sections?.some((section) => section.id === "smoking_policy"),
      false,
    );
    assert.equal(
      view.acknowledgements?.some((item) => item.id === "hotel_terms"),
      false,
    );
    assert.equal(view.sections?.[0]?.displayOrder, 10);
    assert.match(checkIn, /projectCheckInAgreementContent/);
  });

  it("does not require a disabled acknowledgement", () => {
    const draft = withAcknowledgementEnabled(defaultGuestAgreementPackage(), "hotel_terms", false);
    const snapshot = published(draft, "14:00", "12:00");
    assert.equal(snapshot.ok, true);
    if (!snapshot.ok) return;
    const view = projectCheckInAgreementContent({
      id: "version-1",
      label: "1",
      body: snapshot.body,
      title: snapshot.package.title,
      intro: null,
      leadIn: null,
      acknowledgementTitle: null,
      acknowledgementIntro: null,
      sections: snapshot.package.sections,
      acknowledgements: snapshot.package.acknowledgements,
    });
    assert.deepEqual(missingRequiredAcknowledgements(view.acknowledgements, {}), [
      "registration_information",
      "privacy_data_use",
      "payment_authorization",
    ]);
    assert.match(checkIn, /missingRequiredAcknowledgements/);
  });

  it("returns a legacy body without synthesizing sections", () => {
    const view = projectCheckInAgreementContent({
      id: "legacy-1",
      label: "2024",
      body: "Original house rules.",
      title: null,
      intro: null,
      leadIn: null,
      acknowledgementTitle: null,
      acknowledgementIntro: null,
      sections: null,
      acknowledgements: null,
    });
    assert.equal(view.legacy, true);
    assert.equal(view.body, "Original house rules.");
    assert.deepEqual(view.sections, []);
    assert.deepEqual(view.acknowledgements, []);
  });

  it("keeps each signed instance on its own unit and version", () => {
    assert.match(checkIn, /draft\.reservation_room_id !== target\.reservationRoomId/);
    assert.match(checkIn, /reservation_room_id: target\.reservationRoomId/);
    assert.match(checkIn, /\.is\("reservation_room_id", null\)/);
    assert.match(checkIn, /agreement_version_id: version\.id/);
    assert.doesNotMatch(
      checkIn,
      /guest_profiles\.signature|data_processing_consent|marketing_consent/,
    );
    assert.doesNotMatch(
      functions,
      /guest_profiles\.signature|data_processing_consent|marketing_consent/,
    );
  });
});
