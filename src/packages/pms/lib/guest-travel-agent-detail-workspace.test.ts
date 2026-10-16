import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { COMPANY_TA_SETTINGS_COMING } from "./guest-company-detail-workspace.ts";
import { GUEST_ACCOUNT_EVENT_TYPES } from "./guest-profile-wave4.ts";
import {
  COMPANY_TA_SETTINGS_COPY,
  TA_ALLOTMENT_COPY,
  TA_BILLING_COPY,
  TA_COMMISSION_EMPTY_COPY,
  TA_DETAIL_MIGRATION_FILE,
  TA_FORM_OPERATIONAL_COPY,
  TA_NOTIFICATION_EVENTS,
  TRAVEL_AGENT_DETAIL_NAV,
  TRAVEL_AGENT_DETAIL_NAV_IDS,
  calculateCommissionAmount,
  commissionEntryTotals,
  parseLegacyCommissionRate,
  travelAgentDetailNav,
  travelAgentOverviewKpis,
} from "./guest-travel-agent-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Travel Agency workspace helpers", () => {
  it("exposes the operational nav without inventing rating or conversion", () => {
    assert.deepEqual(
      TRAVEL_AGENT_DETAIL_NAV.map((item) => item.id),
      [
        "overview",
        "contacts",
        "bookings",
        "commission",
        "agreements",
        "payment",
        "documents",
        "notes",
        "history",
        "settings",
      ],
    );
    assert.equal(TRAVEL_AGENT_DETAIL_NAV.every((item) => item.live), true);
    assert.equal(travelAgentDetailNav("commission"), "commission");
    assert.equal(travelAgentDetailNav("unknown"), "overview");
    assert.deepEqual([...TRAVEL_AGENT_DETAIL_NAV_IDS], TRAVEL_AGENT_DETAIL_NAV.map((item) => item.id));
    assert.deepEqual([...TA_NOTIFICATION_EVENTS], [
      "booking_confirmation",
      "booking_cancellation",
      "booking_modification",
    ]);
  });

  it("computes real overview KPIs and omits unconfigured commission", () => {
    const empty = travelAgentOverviewKpis({
      bookingCount: 4,
      guestCount: 3,
      commissionTotal: 120,
      commissionConfigured: false,
      defaultRateLabel: null,
    });
    assert.equal(empty.totalBookings, 4);
    assert.equal(empty.totalGuests, 3);
    assert.equal(empty.totalCommission, null);
    assert.equal(empty.commissionConfigured, false);
    const filled = travelAgentOverviewKpis({
      bookingCount: 4,
      guestCount: 3,
      commissionTotal: 120,
      commissionConfigured: true,
      defaultRateLabel: "10%",
    });
    assert.equal(filled.totalCommission, 120);
    assert.equal(filled.defaultRateLabel, "10%");
  });

  it("calculates commission from room_subtotal and tracks entry totals without inventing AR", () => {
    assert.equal(calculateCommissionAmount({ type: "percent", rateValue: 10, basisAmount: 250 }), 25);
    assert.equal(calculateCommissionAmount({ type: "fixed", rateValue: 40, basisAmount: 250 }), 40);
    assert.equal(parseLegacyCommissionRate("12.5% OTA"), 12.5);
    assert.equal(parseLegacyCommissionRate("net rate"), null);
    const totals = commissionEntryTotals([
      { amount: 20, status: "calculated" },
      { amount: 10, status: "approved" },
      { amount: 5, status: "settled" },
      { amount: 8, status: "void" },
    ]);
    assert.equal(totals.earned, 35);
    assert.equal(totals.approved, 15);
    assert.equal(totals.settled, 5);
    assert.equal(totals.outstanding, 30);
    assert.equal("availableCredit" in totals, false);
  });
});

describe("Travel Agency workspace wiring", () => {
  it("routes standalone travel-agent detail into the dedicated workspace", () => {
    const shell = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const workspace = readRel("../components/workspaces/guest-travel-agent-detail-workspace.tsx");
    const header = readRel("../components/guests/guest-travel-agent-header.tsx");
    assert.match(shell, /operationalType === "travel-agent"/);
    assert.match(shell, /GuestTravelAgentDetailWorkspace/);
    assert.match(workspace, /TRAVEL_AGENT_DETAIL_NAV/);
    assert.match(workspace, /GuestTravelAgentOverview/);
    assert.match(workspace, /GuestTravelAgentContacts/);
    assert.match(workspace, /GuestTravelAgentBookings/);
    assert.match(workspace, /GuestTravelAgentCommission/);
    assert.match(workspace, /GuestTravelAgentAgreements/);
    assert.match(workspace, /GuestTravelAgentBilling/);
    assert.match(workspace, /GuestTravelAgentDocuments/);
    assert.match(workspace, /GuestTravelAgentNotes/);
    assert.match(workspace, /GuestActivityHubCard/);
    assert.match(workspace, /GuestTravelAgentSettings/);
    assert.match(header, /travel-agent-detail-header/);
    assert.match(header, /onNavigate\("bookings"\)/);
    assert.match(header, /onNavigate\("settings"\)/);
  });

  it("lists agency bookings and prefills travelAgentMasterId on /bookings/new", () => {
    const bookings = readRel("../components/guests/guest-travel-agent-bookings.tsx");
    const page = readRel("../../../routes/restaurant/bookings/new.tsx");
    const functions = readRel("./guest-travel-agent-detail.functions.ts");
    assert.match(bookings, /travelAgentMasterId: agencyId/);
    assert.match(bookings, /listTravelAgentReservations/);
    assert.match(functions, /travel_agent_master_id/);
    assert.match(page, /travelAgentMasterId/);
    assert.match(page, /setReservationType\("travel_agency"\)/);
    assert.match(page, /accountType !== "travel_agent"/);
    assert.match(page, /companyMasterId/);
  });

  it("reuses contacts, documents, notes, and agreements without weakening company gates", () => {
    const contacts = readRel("../components/guests/guest-travel-agent-contacts.tsx");
    const documents = readRel("../components/guests/guest-travel-agent-documents.tsx");
    const notes = readRel("../components/guests/guest-travel-agent-notes.tsx");
    const agreements = readRel("../components/guests/guest-travel-agent-agreements.tsx");
    const taFunctions = readRel("./guest-travel-agent-detail.functions.ts");
    const companyFunctions = readRel("./guest-company-detail.functions.ts");
    const card3 = readRel("./corporate-card3.functions.ts");
    assert.match(contacts, /listTravelAgentContacts/);
    assert.match(contacts, /GuestTravelAgentGuestLinks/);
    assert.match(documents, /createTravelAgentDocumentUpload/);
    assert.match(notes, /listTravelAgentNotes/);
    assert.match(agreements, /saveTravelAgentAgreement/);
    assert.match(taFunctions, /from\("guest_company_contacts"\)/);
    assert.match(taFunctions, /from\("guest_company_documents"\)/);
    assert.match(taFunctions, /from\("pms_corporate_agreements"\)/);
    assert.match(taFunctions, /travel-agents\/\$\{data\.agencyId\}\/docs/);
    assert.match(companyFunctions, /\.eq\("account_type", "company"\)/);
    assert.match(card3, /account_type\) !== "company"/);
    assert.doesNotMatch(card3, /travel_agent/);
  });

  it("wires commission, allotment, booking rules, and email notifications through existing transports", () => {
    const reservations = readRel("./reservations.functions.ts");
    const booking = readRel("./guest-travel-agent-booking.ts");
    const functions = readRel("./guest-travel-agent-detail.functions.ts");
    const overview = readRel("../components/guests/guest-travel-agent-overview.tsx");
    const billing = readRel("../components/guests/guest-travel-agent-billing.tsx");
    const settings = readRel("../components/guests/guest-travel-agent-settings.tsx");
    assert.match(reservations, /enforceTravelAgentBooking/);
    assert.match(reservations, /syncTravelAgentCommission/);
    assert.match(reservations, /notifyTravelAgentBookingEvent/);
    assert.match(booking, /booking_access === "restricted"/);
    assert.match(booking, /max_advance_booking_days/);
    assert.match(booking, /min_stay_nights/);
    assert.match(booking, /group_bookings_allowed/);
    assert.match(booking, /pms_agency_allotments/);
    assert.match(booking, /room_subtotal/);
    assert.doesNotMatch(booking, /count_sellable_rooms/);
    assert.match(functions, /sendGuestAccountMessage/);
    assert.match(functions, /catch \{\s*return \{ sent: false \};/);
    assert.match(functions, /requireCashieringAccess/);
    assert.match(functions, /guestStayAccessForRole/);
    assert.match(functions, /requireGuestManager/);
    assert.match(overview, /TA_COMMISSION_EMPTY_COPY|Not configured/);
    assert.doesNotMatch(overview, /Partner Rating|Conversion Rate/i);
    assert.match(billing, /TA_BILLING_COPY/);
    assert.match(settings, /saveTravelAgentCommissionPlan/);
    assert.match(settings, /saveTravelAgentAllotment/);
    assert.match(settings, /TA_ALLOTMENT_COPY/);
    assert.match(settings, /id: editingId/);
    assert.match(settings, /travel-agent-commission-edit/);
    assert.match(settings, /travel-agent-allotment-edit/);
    assert.match(settings, /Update plan/);
    assert.match(settings, /Update allotment/);
  });

  it("adds listing filters, slims the form, and keeps Company TRA as a ComingBlock", () => {
    const directory = readRel("../components/guests/guest-account-directory.tsx");
    const form = readRel("../components/guests/guest-travel-agent-form-dialog.tsx");
    const accounts = readRel("./guest-accounts.functions.ts");
    const companyWorkspace = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    const companyHelpers = readRel("./guest-company-detail-workspace.ts");
    assert.match(directory, /guest-account-agency-type/);
    assert.match(directory, /guest-account-country/);
    assert.match(accounts, /agencyType: z.enum\(AGENCY_TYPES\)/);
    assert.match(accounts, /country: z.string\(\).max\(80\)/);
    assert.match(form, /TA_FORM_OPERATIONAL_COPY/);
    assert.match(form, /createTravelAgentLogoUpload/);
    assert.match(form, /ta-logo/);
    assert.doesNotMatch(form, /<Section id="commission"/);
    assert.match(companyWorkspace, /ComingBlock title="Travel Agent Settings"/);
    assert.match(companyHelpers, /live: false/);
    assert.match(COMPANY_TA_SETTINGS_COMING, /Guests → Travel Agencies/);
    assert.match(COMPANY_TA_SETTINGS_COPY, /classification only/);
    assert.match(TA_FORM_OPERATIONAL_COPY, /Agency Settings/);
    assert.match(TA_BILLING_COPY, /no separate TA accounts-receivable ledger/);
    assert.match(TA_ALLOTMENT_COPY, /general inventory/);
    assert.match(TA_COMMISSION_EMPTY_COPY, /No commission plan/);
  });

  it("keeps dual-lane 0095 additive and expands history events", () => {
    const supabase = readRel("../../../../supabase/migrations/0095_pms_travel_agency_workspace.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0095_pms_travel_agency_workspace.sql");
    const wave4 = readRel("./guest-profile-wave4.ts");
    assert.equal(TA_DETAIL_MIGRATION_FILE, "0095_pms_travel_agency_workspace.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_agency_commission_plans/);
    assert.match(supabase, /pms_agency_commission_entries/);
    assert.match(supabase, /pms_agency_allotments/);
    assert.match(supabase, /pms_agency_allowed_room_types/);
    assert.match(supabase, /pms_agency_notification_prefs/);
    assert.match(supabase, /credit_limit_amount/);
    assert.match(supabase, /booking_access/);
    assert.match(supabase, /commission_configured/);
    assert.doesNotMatch(supabase, /DROP COLUMN.*commission_label/i);
    assert.doesNotMatch(supabase, /accounts_receivable|agency_ledger/i);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.match(wave4, /commission_configured/);
    assert.match(wave4, /allotment_changed/);
    assert.match(wave4, /settings_changed/);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("commission_calculated"), true);
    assert.equal(GUEST_ACCOUNT_EVENT_TYPES.includes("commission_updated"), true);
  });

  it("does not invent a second TA entity, AR ledger, reserved inventory, or fake sent SMS", () => {
    const functions = readRel("./guest-travel-agent-detail.functions.ts");
    const booking = readRel("./guest-travel-agent-booking.ts");
    const helpers = readRel("./guest-travel-agent-detail-workspace.ts");
    const overview = readRel("../components/guests/guest-travel-agent-overview.tsx");
    assert.doesNotMatch(functions, /CREATE TABLE/);
    assert.doesNotMatch(functions, /from\("travel_agencies"|from\("ta_accounts_receivable"/);
    assert.doesNotMatch(booking, /reserved inventory|subtract from/i);
    assert.doesNotMatch(helpers, /sms|in-app/i);
    assert.doesNotMatch(overview, /rating|conversion rate/i);
    assert.match(functions, /channel: "email"/);
  });
});
