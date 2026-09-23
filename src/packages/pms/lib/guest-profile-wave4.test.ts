import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  GUEST_PROFILE_CARDS,
  GUEST_PROFILE_TYPES,
  isGuestRequiredProfileCard,
  parseGuestProfileCardSearch,
  parseGuestProfileSearch,
  showEmptyDirectoryCta,
} from "./guest-profile-wave1.ts";
import { deriveStayOverview, type GuestStayAccess } from "./guest-profile-wave3.ts";
import {
  GUEST_ACCOUNT_TYPE_LABELS,
  GUEST_RELATIONSHIP_ROLES,
  ROLE_ACCOUNT_TYPE,
  WAVE4_ACCEPTANCE_CRITERIA,
  WAVE4_BILL_TO_COPY,
  WAVE4_GROUP_ACCOUNT_COPY,
  WAVE4_LOYALTY_COPY,
  WAVE4_LOYALTY_EMPTY,
  WAVE4_MIGRATION_FILE,
  WAVE4_NO_POINTS_COPY,
  WAVE4_RESERVATION_MASTER_COPY,
  WAVE4_SET3_FLAG_COPY,
  WAVE4_TYPED_LABEL_COPY,
  WAVE4_UNLINK_COPY,
  WAVE4_VIP_STAFF_FLAG_COPY,
  accountTypeToProfileType,
  assertRoleMatchesType,
  hasDerivedLoyaltyFigures,
  loyaltyFromStayOverview,
  profileTypeToAccountType,
  rolesForAccountType,
} from "./guest-profile-wave4.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const FULL_ACCESS: GuestStayAccess = { reservation: true, frontOffice: true, folio: true };

describe("Guest Profile Wave 4 lock — AC-W4-1…23", () => {
  it("locks AC-W4-1…23", () => {
    assert.deepEqual(
      [...WAVE4_ACCEPTANCE_CRITERIA],
      [
        "AC-W4-1",
        "AC-W4-2",
        "AC-W4-3",
        "AC-W4-4",
        "AC-W4-5",
        "AC-W4-6",
        "AC-W4-7",
        "AC-W4-8",
        "AC-W4-9",
        "AC-W4-10",
        "AC-W4-11",
        "AC-W4-12",
        "AC-W4-13",
        "AC-W4-14",
        "AC-W4-15",
        "AC-W4-16",
        "AC-W4-17",
        "AC-W4-18",
        "AC-W4-19",
        "AC-W4-20",
        "AC-W4-21",
        "AC-W4-22",
        "AC-W4-23",
      ],
    );
  });

  it("AC-W4-1 staff can create a Company master and find it by search", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const form = readRel("../components/guests/guest-account-form-dialog.tsx");
    assert.match(functions, /export const createGuestAccount/);
    assert.match(functions, /export const listGuestAccounts/);
    assert.match(functions, /from\("guest_account_masters"\)/);
    assert.match(functions, /\.eq\("account_type", data\.accountType\)/);
    assert.match(functions, /name\.ilike/);
    assert.match(directory, /create: "company"|create: "travel-agent"|create: "group"/);
    assert.match(directory, /guest-account-search/);
    assert.match(directory, /guest-account-new/);
    assert.match(form, /guest-account-name/);
    assert.match(form, /guest-account-save/);
    assert.equal(GUEST_ACCOUNT_TYPE_LABELS.company, "Company");
    assert.equal(profileTypeToAccountType("company"), "company");
  });

  it("AC-W4-2 same for Group account master and Travel Agent master", () => {
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.deepEqual(
      GUEST_PROFILE_TYPES.filter((type) => type.id !== "individual").map((type) => [
        type.id,
        type.live,
        type.wave,
      ]),
      [
        ["company", true, 4],
        ["group", true, 4],
        ["travel-agent", true, 4],
      ],
    );
    assert.equal(profileTypeToAccountType("group"), "group");
    assert.equal(profileTypeToAccountType("travel-agent"), "travel_agent");
    assert.equal(accountTypeToProfileType("travel_agent"), "travel-agent");
    assert.match(directory, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.match(shell, /guest-profile-type-\$\{type\.id\}/);
    assert.match(shell, /GuestAccountDirectory/);
    assert.match(WAVE4_GROUP_ACCOUNT_COPY, /not a Sales & Events group block/);
  });

  it("AC-W4-3 staff can link employer / bill-to / booker TA / group member", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    assert.deepEqual(
      [...GUEST_RELATIONSHIP_ROLES],
      ["employer", "bill_to", "booker_ta", "group_member"],
    );
    assert.equal(ROLE_ACCOUNT_TYPE.employer, "company");
    assert.equal(ROLE_ACCOUNT_TYPE.bill_to, "company");
    assert.equal(ROLE_ACCOUNT_TYPE.booker_ta, "travel_agent");
    assert.equal(ROLE_ACCOUNT_TYPE.group_member, "group");
    assert.deepEqual(rolesForAccountType("company"), ["employer", "bill_to"]);
    assert.equal(assertRoleMatchesType("booker_ta", "company") !== null, true);
    assert.equal(assertRoleMatchesType("employer", "company"), null);
    assert.match(functions, /export const linkGuestAccount/);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.match(functions, /relationship_linked/);
    assert.match(card, /guest-relationship-link/);
    assert.match(card, /guest-relationship-role/);
    assert.match(card, /visible from both/);
    assert.match(WAVE4_BILL_TO_COPY, /association only/);
    assert.doesNotMatch(WAVE4_BILL_TO_COPY, /folio split routing is live|routes the folio/i);
  });

  it("AC-W4-4 removing a link does not delete the individual or the master", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    const unlink = functions.slice(functions.indexOf("export const unlinkGuestAccount"));
    assert.match(unlink, /\.delete\(\)/);
    assert.match(unlink, /from\("guest_account_links"\)/);
    assert.doesNotMatch(unlink.slice(0, 1800), /from\("guest_profiles"\)[\s\S]{0,200}\.delete\(/);
    assert.doesNotMatch(
      unlink.slice(0, 1800),
      /from\("guest_account_masters"\)[\s\S]{0,200}\.delete\(/,
    );
    assert.match(unlink, /guestRemaining/);
    assert.match(unlink, /masterRemaining/);
    assert.match(card, /guest-relationship-unlink/);
    assert.match(card, /WAVE4_UNLINK_COPY/);
    assert.match(WAVE4_UNLINK_COPY, /individual and the master stay/);
  });

  it("AC-W4-5 Reservations / FO consume Guest master IDs, not typed-only company names as masters", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const picker = readRel("../components/guests/reservation-guest-masters.tsx");
    const fo = readRel("./fo-search1.functions.ts");
    const reservations = readRel("../components/workspaces/reservations-workspace.tsx");
    const migration = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    assert.match(functions, /export const setReservationGuestMasters/);
    assert.match(functions, /company_master_id/);
    assert.match(functions, /group_account_master_id/);
    assert.match(functions, /travel_agent_master_id/);
    assert.match(picker, /reservation-guest-masters/);
    assert.match(picker, /WAVE4_RESERVATION_MASTER_COPY/);
    assert.match(picker, /WAVE4_TYPED_LABEL_COPY/);
    assert.match(fo, /guest_account_masters/);
    assert.match(fo, /company_master_id/);
    assert.match(reservations, /listReservationsForGuestAccount/);
    assert.match(reservations, /not Sales & Events group blocks/);
    assert.match(migration, /company_master_id/);
    assert.match(WAVE4_TYPED_LABEL_COPY, /not Guest masters/);
    assert.match(WAVE4_RESERVATION_MASTER_COPY, /Typed company\/group names are not masters/);
  });

  it("AC-W4-6 Loyalty & Value is real-derived only with no placeholder points", () => {
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    const wave4 = readRel("./guest-profile-wave4.ts");
    const empty = loyaltyFromStayOverview(deriveStayOverview([], "2026-09-14", FULL_ACCESS), false);
    assert.equal(hasDerivedLoyaltyFigures(empty), false);
    assert.equal(empty.stayCount, 0);
    assert.equal(empty.roomTotal, null);
    assert.match(WAVE4_LOYALTY_COPY, /no points balance/i);
    assert.match(WAVE4_LOYALTY_EMPTY, /does not invent points/);
    assert.match(WAVE4_NO_POINTS_COPY, /No points balance/);
    assert.match(WAVE4_VIP_STAFF_FLAG_COPY, /staff flag on Information/);
    assert.match(loyalty, /getGuestStayOverview/);
    assert.match(loyalty, /WAVE4_LOYALTY_EMPTY/);
    assert.match(loyalty, /guest-loyalty/);
    assert.doesNotMatch(loyalty, /12,500|points balance|loyalty points/i);
    assert.doesNotMatch(wave4, /12,500/);
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("loyalty")?.live, true);
    assert.doesNotMatch(byId.get("loyalty")?.copy ?? "", /Coming in Wave 4|12,500/);
  });

  it("AC-W4-7 Sales & Events group blocks are not required and not claimed", () => {
    const sales = readRel("../../../routes/restaurant/pms/sales-events.tsx");
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const reservations = readRel("../components/workspaces/reservations-workspace.tsx");
    assert.match(WAVE4_GROUP_ACCOUNT_COPY, /not a Sales & Events group block/);
    assert.match(directory, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.match(reservations, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.match(sales, /Group blocks linked to room availability/);
    assert.doesNotMatch(directory, /rooming list|allotment live/i);
  });

  it("AC-W4-8 staff can edit a master and persist after reload", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const form = readRel("../components/guests/guest-account-form-dialog.tsx");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    assert.match(functions, /export const updateGuestAccount/);
    assert.match(functions, /export const getGuestAccount/);
    assert.match(form, /updateGuestAccount/);
    assert.match(form, /account \? `Edit/);
    assert.match(detail, /guest-account-edit/);
    assert.match(detail, /GuestAccountFormDialog/);
  });

  it("AC-W4-9 profile-type switcher is LIVE for Company Group TA", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.equal(
      GUEST_PROFILE_TYPES.every((type) => type.live),
      true,
    );
    assert.match(shell, /guest-profile-type-switcher/);
    assert.match(shell, /selectType/);
    assert.match(shell, /disabled=\{!type\.live\}/);
    assert.doesNotMatch(shell, /not LIVE · Wave 4/);
    assert.equal(parseGuestProfileSearch({}).type, undefined);
    assert.deepEqual(parseGuestProfileSearch({ type: "group" }), { type: "group" });
  });

  it("AC-W4-10 associations are visible from both sides", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    assert.match(functions, /guestId: idSchema\.optional\(\)/);
    assert.match(functions, /accountId: idSchema\.optional\(\)/);
    assert.match(card, /visible from both/);
    assert.match(card, /link\.masterName/);
    assert.match(card, /link\.guestName/);
    assert.match(card, /GUEST_PROFILE_DETAIL_PATH/);
  });

  it("AC-W4-11 no peer-package second masters", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    assert.match(functions, /from\("guest_account_masters"\)/);
    assert.doesNotMatch(
      functions,
      /from\("sales_event_companies"|from\("cashiering_companies"|from\("reservation_companies"/,
    );
    assert.doesNotMatch(
      migration,
      /CREATE TABLE IF NOT EXISTS public\.(reservation_companies|cashiering_companies|sales_event_companies)/,
    );
  });

  it("AC-W4-12 bill-to is association only while transfersSupported is false", () => {
    const relationships = readRel("../components/guests/guest-relationships-card.tsx");
    const cashiering = readRel("./cashiering.functions.ts");
    assert.equal(ROLE_ACCOUNT_TYPE.bill_to, "company");
    assert.match(WAVE4_BILL_TO_COPY, /association only/);
    assert.doesNotMatch(WAVE4_BILL_TO_COPY, /folio routed to company|split-folio is live/i);
    assert.match(relationships, /WAVE4_BILL_TO_COPY/);
    assert.match(cashiering, /transfersSupported: false/);
  });

  it("AC-W4-13 Group account is not an S&E block", () => {
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const card = readRel("../components/guests/guest-relationships-card.tsx");
    assert.match(WAVE4_GROUP_ACCOUNT_COPY, /not a Sales & Events group block/);
    assert.match(directory, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.match(detail, /WAVE4_GROUP_ACCOUNT_COPY/);
    assert.doesNotMatch(directory, /allotment|rooming list|pickup/i);
    assert.doesNotMatch(detail, /allotment|rooming list|pickup/i);
    assert.doesNotMatch(card, /allotment|rooming list/i);
  });

  it("AC-W4-14 VIP remains the staff flag on Information", () => {
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    const functions = readRel("./guests.functions.ts");
    const detail = readRel("../components/workspaces/guest-detail-workspace.tsx");
    assert.match(functions, /export const setGuestVip/);
    assert.match(detail, /setGuestVip/);
    assert.match(WAVE4_VIP_STAFF_FLAG_COPY, /staff flag on Information/);
    assert.match(loyalty, /WAVE4_VIP_STAFF_FLAG_COPY/);
    assert.doesNotMatch(loyalty, /points-for-VIP|VIP tier score|12,500/i);
  });

  it("AC-W4-15 Loyalty empty-honest when no derived value", () => {
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    const empty = loyaltyFromStayOverview(deriveStayOverview([], "2026-09-14", FULL_ACCESS), false);
    assert.equal(hasDerivedLoyaltyFigures(empty), false);
    assert.match(loyalty, /WAVE4_LOYALTY_EMPTY/);
    assert.match(loyalty, /WAVE3_KPI_NOT_AVAILABLE/);
    assert.doesNotMatch(loyalty, /lifetime spend|decorative score|12,500/i);
  });

  it("AC-W4-16 FO labels and SET3 companyRelationshipEnabled are not masters", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const fo = readRel("./fo-search1.functions.ts");
    const set3 = readRel("../components/settings/pms-set3-section.tsx");
    const set3Lib = readRel("./pms-set3-rates-guest.ts");
    assert.doesNotMatch(functions, /companyRelationshipEnabled|company_name/);
    assert.match(WAVE4_TYPED_LABEL_COPY, /not Guest masters/);
    assert.match(WAVE4_SET3_FLAG_COPY, /not a Guest Company master/);
    assert.match(set3, /WAVE4_SET3_FLAG_COPY/);
    assert.match(set3Lib, /companyRelationshipEnabled: rec\.companyRelationshipEnabled === true/);
    assert.match(fo, /company_name, group_name/);
    assert.doesNotMatch(
      fo,
      /rewrite typed labels as masters|migrate company_name into company_master_id/,
    );
  });

  it("AC-W4-17 Wave 4 files do not invent comms / privacy product", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("notes-comms")?.wave, 5);
    assert.equal(byId.get("admin-privacy")?.wave, 5);
    const wave4 = readRel("./guest-profile-wave4.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    const relationships = readRel("../components/guests/guest-relationships-card.tsx");
    for (const source of [wave4, accounts, loyalty, relationships]) {
      assert.doesNotMatch(
        source,
        /exportGuestProfile|anonymiseGuest\b|unmergeGuests|sendGuestMessage/,
      );
      assert.doesNotMatch(source, /marketing cloud|email sent successfully/i);
    }
  });

  it("AC-W4-18 denied staff cannot list or mutate masters or relationships", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.\$guestId.tsx"),
    ].join("\n");
    assert.match(functions, /requireSupabaseAuth/);
    assert.match(functions, /requireGuestManager/);
    assert.doesNotMatch(functions, /createServerFn\(\{ method: "GET" \}\)/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.match(routes, /supabase\.auth\.getUser\(\)/);
    assert.match(routes, /\/restaurant\/login/);
  });

  it("AC-W4-19 masters and links are tenant-scoped", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    assert.match(functions, /requireGuestManager\(context as never, data\.restaurantId\)/);
    assert.match(functions, /\.eq\("restaurant_id", data\.restaurantId\)/);
    assert.match(migration, /restaurant_id uuid NOT NULL REFERENCES public\.restaurants\(id\)/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  });

  it("AC-W4-20 creating updating a master or changing a relationship writes history", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const merge = readRel("./guests.functions.ts");
    const detail = readRel("../components/guests/guest-account-detail.tsx");
    const migration = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    assert.match(functions, /recordGuestAccountEvent/);
    assert.match(functions, /eventType: "created"/);
    assert.match(functions, /eventType: "profile_updated"/);
    assert.match(functions, /relationship_linked/);
    assert.match(functions, /relationship_unlinked/);
    assert.match(functions, /export const listGuestAccountHistory/);
    assert.match(detail, /guest-account-history/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.guest_account_history/);
    assert.match(merge, /from\("guest_account_links"\)/);
    assert.match(merge, /guest_id: data\.survivorId/);
  });

  it("AC-W4-21 does not invent OTA NA or commission widgets", () => {
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    const relationships = readRel("../components/guests/guest-relationships-card.tsx");
    const wave4 = readRel("./guest-profile-wave4.ts");
    for (const source of [loyalty, relationships, wave4]) {
      assert.doesNotMatch(
        source,
        /channel points|commission due|NA room\+tax loyalty|gateway settlement/i,
      );
    }
  });

  it("AC-W4-22 no entitlement or RLS model change", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const migration = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    const modules = readRel("./pms-modules.ts");
    assert.match(functions, /requireGuestManager/);
    assert.doesNotMatch(functions, /requirePackage\("guest-accounts"|newGuestRole/);
    assert.match(
      migration,
      /has_restaurant_role\(restaurant_id, 'owner'\) OR public\.has_restaurant_role\(restaurant_id, 'manager'\)/,
    );
    assert.doesNotMatch(migration, /SECURITY DEFINER/i);
    assert.match(modules, /moduleKey: "front_office"/);
    assert.doesNotMatch(modules, /key: "guest-accounts"/);
  });

  it("AC-W4-23 Directory-back and Open Directory inherit for LIVE Wave 4 cards", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.equal(isGuestRequiredProfileCard("loyalty"), true);
    assert.equal(isGuestRequiredProfileCard("relationships"), true);
    assert.equal(isGuestRequiredProfileCard("information"), true);
    assert.equal(showEmptyDirectoryCta(false, "loyalty"), true);
    assert.equal(showEmptyDirectoryCta(false, "relationships"), true);
    assert.equal(isGuestRequiredProfileCard("notes-comms"), true);
    assert.match(shell, /GuestProfileHeader/);
    assert.match(shell, /showEmptyDirectoryCta/);
    assert.match(shell, /GuestDirectoryOpenButton/);
    assert.deepEqual(parseGuestProfileCardSearch({ card: "loyalty" }), { card: "loyalty" });
    assert.deepEqual(parseGuestProfileSearch({ type: "company", card: "relationships" }), {
      card: "relationships",
      type: "company",
    });
  });
});

describe("Guest Profile Wave 4 catalogue, honesty and gates", () => {
  it("flips Company / Group / TA and loyalty / relationships LIVE", () => {
    const byId = new Map(GUEST_PROFILE_CARDS.map((card) => [card.id, card]));
    assert.equal(byId.get("loyalty")?.live, true);
    assert.equal(byId.get("relationships")?.live, true);
    assert.equal(isGuestRequiredProfileCard("loyalty"), true);
    assert.equal(isGuestRequiredProfileCard("relationships"), true);
    assert.equal(showEmptyDirectoryCta(false, "loyalty"), true);
    assert.deepEqual(parseGuestProfileCardSearch({ card: "loyalty" }), { card: "loyalty" });
    assert.deepEqual(parseGuestProfileSearch({ type: "company", card: "relationships" }), {
      card: "relationships",
      type: "company",
    });
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(shell, /GuestLoyaltyCard/);
    assert.match(shell, /GuestRelationshipsCard/);
    assert.match(shell, /selectType/);
    assert.doesNotMatch(shell, /not LIVE · Wave 4/);
  });

  it("preserves pms + guest manage gate and selected-profile back / empty CTA", () => {
    const functions = readRel("./guest-accounts.functions.ts");
    const routes = [
      readRel("../../../routes/restaurant/pms/guests.index.tsx"),
      readRel("../../../routes/restaurant/pms/guests.$guestId.tsx"),
    ].join("\n");
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    assert.match(functions, /requireGuestManager/);
    assert.match(functions, /requireReservationManager/);
    assert.match(routes, /requireRoutePackage\("pms"\)/);
    assert.match(routes, /parseGuestProfileSearch/);
    assert.match(shell, /GuestProfileHeader/);
    assert.match(shell, /showEmptyDirectoryCta/);
    assert.match(shell, /GuestDirectoryOpenButton/);
  });

  it("ships dual-lane 0053 APPLY HELD without SECURITY DEFINER or a second peer-package master table", () => {
    const supabase = readRel("../../../../supabase/migrations/0053_pms_guest_profile_wave4.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0053_pms_guest_profile_wave4.sql");
    assert.equal(WAVE4_MIGRATION_FILE, "0053_pms_guest_profile_wave4.sql");
    assert.match(supabase, /CREATE TABLE IF NOT EXISTS public.guest_account_masters/);
    assert.match(supabase, /CREATE TABLE IF NOT EXISTS public.guest_account_links/);
    assert.match(supabase, /APPLY HELD/);
    assert.match(supabase, /do not apply to production from an agent/);
    assert.match(drizzle, /CREATE TABLE IF NOT EXISTS public.guest_account_masters/);
    assert.match(drizzle, /guest_account_links/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.doesNotMatch(supabase, /CREATE FUNCTION/i);
    assert.match(
      supabase,
      /has_restaurant_role\(restaurant_id, 'owner'\) OR public.has_restaurant_role\(restaurant_id, 'manager'\)/,
    );
    assert.match(supabase, /ENABLE ROW LEVEL SECURITY/);
    const functions = readRel("./guest-accounts.functions.ts");
    assert.doesNotMatch(
      functions,
      /from\("sales_event_companies"|from\("cashiering_companies"|from\("reservation_companies"/,
    );
    assert.match(functions, /WAVE4_MIGRATION_UNAVAILABLE/);
  });

  it("does not invent folio-split product or S&E blocks", () => {
    const relationships = readRel("../components/guests/guest-relationships-card.tsx");
    const picker = readRel("../components/guests/reservation-guest-masters.tsx");
    const loyalty = readRel("../components/guests/guest-loyalty-card.tsx");
    for (const source of [relationships, picker, loyalty]) {
      assert.doesNotMatch(source, /folio split is live|routes the folio|split-folio product/i);
      assert.doesNotMatch(source, /12,500 points/);
      assert.doesNotMatch(source, /allotment live|rooming list product/i);
    }
    const cashiering = readRel("./cashiering.functions.ts");
    assert.match(cashiering, /transfersSupported: false/);
  });
});
