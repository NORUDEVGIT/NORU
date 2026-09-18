import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_PROFILE_CARDS,
  isGuestRequiredProfileCard,
  parseGuestProfileCardSearch,
  showEmptyDirectoryCta,
} from "./guest-profile-wave1.ts";
import {
  GUEST_PRIVACY_ROLES,
  WAVE5_ACCEPTANCE_CRITERIA,
  WAVE5_ANONYMISE_COPY,
  WAVE5_ANONYMISED_GUEST_LABEL,
  WAVE5_ANONYMISED_MASTER_LABELS,
  WAVE5_HUB_COPY,
  WAVE5_MIGRATION_FILE,
  WAVE5_NO_SEND_COPY,
  WAVE5_PRIVACY_ROLES_COPY,
  WAVE5_UNMERGE_BLOCKED_NO_LEDGER,
  WAVE5_UNMERGE_COPY,
  anonymisedGuestDisplayName,
  anonymisedMasterDisplayName,
  directoryContactForAnonymised,
  platformEmailTransportConfigured,
  propertyEmailChannelConfigured,
  resolveGuestSendChannel,
} from "./guest-profile-wave5.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Guest Profile Wave 5 lock — AC-W5-1…7", () => {
  it("locks AC-W5-1…7", () => {
    assert.deepEqual(
      [...WAVE5_ACCEPTANCE_CRITERIA],
      ["AC-W5-1", "AC-W5-2", "AC-W5-3", "AC-W5-4", "AC-W5-5", "AC-W5-6", "AC-W5-7"],
    );
  });

  it("AC-W5-1 Activity hub shows notes, profile history and real comms in one place", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("notes-comms")?.live, true);
    assert.equal(byId.get("notes-comms")?.wave, 5);
    assert.match(byId.get("notes-comms")?.copy ?? "", /Send is offered only when a real channel/);
    const hub = readRel("../components/guests/guest-activity-hub-card.tsx");
    const functions = readRel("./guest-privacy.functions.ts");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(functions, /export const getGuestActivityHub/);
    assert.match(functions, /from\("guest_profile_history"\)/);
    assert.match(functions, /notes: guestRes\.data\.notes/);
    assert.match(functions, /eventType: "comms_logged"/);
    assert.match(hub, /guest-activity-hub/);
    assert.match(hub, /WAVE5_HUB_COPY/);
    assert.match(hub, /Profile notes/);
    assert.match(hub, /guest-activity-list|WAVE5_HUB_EMPTY/);
    assert.match(shell, /GuestActivityHubCard/);
    assert.match(shell, /card === "notes-comms"/);
    assert.match(WAVE5_HUB_COPY, /not a marketing cloud/);
    assert.doesNotMatch(hub, /campaign blast|marketing cloud|drip sequence/i);
  });

  it("AC-W5-2 send control only when a real channel is configured — never fake email sent", () => {
    assert.equal(
      platformEmailTransportConfigured({
        RESEND_API_KEY: "rk",
        RECEIPT_EMAIL_FROM: "desk@hotel.test",
      }),
      true,
    );
    assert.equal(platformEmailTransportConfigured({ RESEND_API_KEY: "rk" }), false);
    assert.equal(platformEmailTransportConfigured({}), false);
    assert.equal(propertyEmailChannelConfigured({ email: true, savedAt: "2026-09-14" }), true);
    assert.equal(propertyEmailChannelConfigured({ email: true, savedAt: null }), false);
    assert.equal(propertyEmailChannelConfigured({ email: false, savedAt: "2026-09-14" }), false);
    assert.deepEqual(resolveGuestSendChannel({ platformTransport: true, propertyEmail: true }), {
      kind: "email",
    });
    assert.equal(resolveGuestSendChannel({ platformTransport: true, propertyEmail: false }), null);
    assert.equal(resolveGuestSendChannel({ platformTransport: false, propertyEmail: true }), null);

    const hub = readRel("../components/guests/guest-activity-hub-card.tsx");
    const functions = readRel("./guest-privacy.functions.ts");
    assert.match(functions, /export const sendGuestMessage/);
    assert.match(functions, /if \(!channel\) throw new Error\("No send channel is configured\."\)/);
    assert.match(functions, /api\.resend\.com\/emails/);
    assert.match(functions, /eventType: "comms_sent"/);
    assert.match(functions, /The email could not be sent/);
    assert.doesNotMatch(functions, /email sent successfully|pretend|fake send/i);
    assert.match(hub, /sendChannel \?/);
    assert.match(hub, /guest-activity-send/);
    assert.match(hub, /guest-activity-no-send/);
    assert.match(hub, /WAVE5_NO_SEND_COPY/);
    assert.match(WAVE5_NO_SEND_COPY, /No send control is offered/);
    assert.doesNotMatch(hub, /Email sent anyway|mark as sent without sending/i);
  });

  it("AC-W5-3 authorised staff can export an individual's held profile data", () => {
    const functions = readRel("./guest-privacy.functions.ts");
    const card = readRel("../components/guests/guest-privacy-card.tsx");
    const server = readRel("./guests.server.ts");
    assert.match(functions, /export const exportGuestProfile/);
    assert.match(functions, /requireGuestPrivacyOfficer/);
    assert.match(functions, /filename: `guest-\$\{data\.guestId\}-export\.json`/);
    assert.match(functions, /eventType: "exported"/);
    assert.match(card, /guest-privacy-export/);
    assert.match(card, /downloadJson/);
    assert.match(functions, /jsonText: JSON.stringify/);
    assert.match(server, /requireGuestPrivacyOfficer/);
    assert.deepEqual([...GUEST_PRIVACY_ROLES], ["owner", "manager"]);
    assert.match(WAVE5_PRIVACY_ROLES_COPY, /owner\/manager only/);
  });

  it("AC-W5-4 authorised staff can anonymise a guest; Directory no longer shows live PII", () => {
    const functions = readRel("./guest-privacy.functions.ts");
    const guests = readRel("./guests.functions.ts");
    const directory = readRel("../components/workspaces/guest-directory-workspace.tsx");
    const card = readRel("../components/guests/guest-privacy-card.tsx");
    assert.match(functions, /export const anonymiseGuest/);
    assert.match(functions, /anonymised_at: now/);
    assert.match(functions, /id_document_number: null/);
    assert.match(functions, /linked_customer_user_id: null/);
    assert.match(guests, /anonymisedAt \? WAVE5_ANONYMISED_GUEST_LABEL/);
    assert.match(guests, /anonymisedAt \? null : row\.phone/);
    assert.match(guests, /anonymisedAt \? null : row\.email/);
    assert.match(directory, /g\.fullName/);
    assert.match(card, /guest-privacy-anonymise/);
    assert.match(WAVE5_ANONYMISE_COPY, /Stay and folio records stay linked/);
    assert.equal(anonymisedGuestDisplayName(true, "Ada Lovelace"), WAVE5_ANONYMISED_GUEST_LABEL);
    assert.deepEqual(directoryContactForAnonymised(true, { phone: "1", email: "a@b.c" }), {
      phone: null,
      email: null,
    });
    assert.doesNotMatch(
      functions,
      /DELETE FROM hotel_reservations|from\("hotel_reservations"\)[\s\S]{0,80}\.delete\(/,
    );
  });

  it("AC-W5-5 unmerge when reversible or recorded exception — never silent undo", () => {
    const functions = readRel("./guest-privacy.functions.ts");
    const guests = readRel("./guests.functions.ts");
    const card = readRel("../components/guests/guest-privacy-card.tsx");
    const migration = readRel("../../../../supabase/migrations/0054_pms_guest_profile_wave5.sql");
    assert.match(guests, /from\("guest_merge_ledger"\)/);
    assert.match(guests, /ledgerPayload/);
    assert.match(functions, /export const unmergeGuests/);
    assert.match(functions, /eventType: "unmerge_blocked"/);
    assert.match(functions, /eventType: "unmerged"/);
    assert.match(functions, /WAVE5_UNMERGE_BLOCKED_NO_LEDGER/);
    assert.match(card, /guest-privacy-unmerge/);
    assert.match(card, /Record why unmerge is not available/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.guest_merge_ledger/);
    assert.match(WAVE5_UNMERGE_COPY, /never a silent undo/);
    assert.match(WAVE5_UNMERGE_BLOCKED_NO_LEDGER, /no reversible ledger/);
    assert.doesNotMatch(functions, /silent undo|quietly reverse/i);
  });

  it("AC-W5-6 privacy actions appear on audit / history", () => {
    const functions = readRel("./guest-privacy.functions.ts");
    const card = readRel("../components/guests/guest-privacy-card.tsx");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const migration = readRel("../../../../supabase/migrations/0054_pms_guest_profile_wave5.sql");
    assert.match(functions, /export const listGuestPrivacyAudit/);
    assert.match(
      functions,
      /\.in\("event_type", \["exported", "anonymised", "unmerged", "unmerge_blocked"\]\)/,
    );
    assert.match(card, /guest-privacy-audit/);
    assert.match(detail, /Profile exported|anonymised|Unmerge not available/);
    assert.match(migration, /'exported'/);
    assert.match(migration, /'anonymised'/);
    assert.match(migration, /'unmerged'/);
    assert.match(migration, /'unmerge_blocked'/);
  });

  it("AC-W5-7 Company / Group / TA masters have export / anonymise for contact PII", () => {
    const functions = readRel("./guest-privacy.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const card = readRel("../components/guests/guest-privacy-card.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(functions, /export const exportGuestAccount/);
    assert.match(functions, /export const anonymiseGuestAccount/);
    assert.match(functions, /WAVE5_ANONYMISED_MASTER_LABELS/);
    assert.match(functions, /email: null/);
    assert.match(functions, /phone: null/);
    assert.match(accounts, /anonymisedAt \? WAVE5_ANONYMISED_MASTER_LABELS/);
    assert.match(card, /accountId/);
    assert.match(shell, /GuestPrivacyCard/);
    assert.match(shell, /isAccount \? guestId : undefined/);
    assert.equal(
      anonymisedMasterDisplayName(true, "company", "Acme"),
      WAVE5_ANONYMISED_MASTER_LABELS.company,
    );
    assert.equal(WAVE5_ANONYMISED_MASTER_LABELS.group, "Anonymised group account");
    assert.equal(WAVE5_ANONYMISED_MASTER_LABELS.travel_agent, "Anonymised travel agent");
  });
});

describe("Guest Profile Wave 5 catalogue, honesty and gates", () => {
  it("flips notes-comms and admin-privacy LIVE with Directory-back and Open Directory", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("notes-comms")?.live, true);
    assert.equal(byId.get("admin-privacy")?.live, true);
    assert.equal(isGuestRequiredProfileCard("notes-comms"), true);
    assert.equal(isGuestRequiredProfileCard("admin-privacy"), true);
    assert.equal(showEmptyDirectoryCta(false, "notes-comms"), true);
    assert.equal(showEmptyDirectoryCta(false, "admin-privacy"), true);
    assert.deepEqual(parseGuestProfileCardSearch({ card: "notes-comms" }), { card: "notes-comms" });
    assert.deepEqual(parseGuestProfileCardSearch({ card: "admin-privacy" }), {
      card: "admin-privacy",
    });
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(shell, /GuestProfileHeader/);
    assert.match(shell, /showEmptyDirectoryCta/);
    assert.match(shell, /GuestDirectoryOpenButton/);
    assert.match(shell, /GuestActivityHubCard/);
    assert.match(shell, /GuestPrivacyCard/);
    assert.doesNotMatch(shell, /Wave 5 cards stay labelled until LIVE/);
  });

  it("preserves pms + requireGuestManager; privacy writes are owner/manager", () => {
    const privacy = readRel("./guest-privacy.functions.ts");
    const server = readRel("./guests.server.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    assert.match(privacy, /requireGuestManager\(context as never, data\.restaurantId\)/);
    assert.match(privacy, /requireGuestPrivacyOfficer/);
    assert.match(server, /GUEST_MANAGE_ROLES = \["owner", "manager", "receptionist"\]/);
    assert.match(server, /GUEST_PRIVACY_ROLES/);
    assert.match(server, /Only owners and managers can export, anonymise or unmerge/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.doesNotMatch(privacy, /requirePackage\("guest-privacy"|newGuestRole/);
  });

  it("ships dual-lane 0054 APPLY HELD without SECURITY DEFINER or a marketing cloud", () => {
    const supabase = readRel("../../../../supabase/migrations/0054_pms_guest_profile_wave5.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0054_pms_guest_profile_wave5.sql");
    assert.equal(WAVE5_MIGRATION_FILE, "0054_pms_guest_profile_wave5.sql");
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(supabase, /CREATE TABLE IF NOT EXISTS public\.guest_merge_ledger/);
    assert.match(supabase, /anonymised_at/);
    assert.match(supabase, /ENABLE ROW LEVEL SECURITY/);
    assert.match(
      supabase,
      /has_restaurant_role\(restaurant_id, 'owner'\) OR public\.has_restaurant_role\(restaurant_id, 'manager'\)/,
    );
    assert.match(drizzle, /CREATE TABLE IF NOT EXISTS public\.guest_merge_ledger/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.doesNotMatch(supabase, /CREATE FUNCTION/i);
    assert.doesNotMatch(supabase, /marketing_cloud|sendgrid_campaign/i);
  });

  it("does not invent OTA, night audit, gateway, or Wave 4 reservation-create residuals", () => {
    const privacy = readRel("./guest-privacy.functions.ts");
    const hub = readRel("../components/guests/guest-activity-hub-card.tsx");
    const wave5 = readRel("./guest-profile-wave5.ts");
    for (const source of [privacy, hub, wave5]) {
      assert.doesNotMatch(source, /channel points|commission due|NA room\+tax|gateway settlement/i);
      assert.doesNotMatch(source, /createReservation\(/);
      assert.doesNotMatch(source, /0053_pms_guest_profile_wave4/);
    }
  });

  it("keeps Wave 2 consent on Information and on Admin & Privacy", () => {
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    const privacy = readRel("../components/guests/guest-privacy-card.tsx");
    assert.match(detail, /GuestConsentPanel/);
    assert.match(privacy, /GuestConsentPanel/);
  });
});
