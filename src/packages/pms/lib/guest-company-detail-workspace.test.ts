import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_BILLING_COPY,
  COMPANY_CONTACT_REQUIRED,
  COMPANY_CONTACT_WHATSAPP_MIGRATION_FILE,
  COMPANY_DETAIL_MIGRATION_FILE,
  COMPANY_PHASE1_MIGRATION_FILE,
  COMPANY_TA_SETTINGS_COMING,
  blockLastPrimaryRemoval,
  companyBillingTotals,
  companyDocumentKpis,
  companyDocumentStatus,
  companyHasCompanyRate,
  companyOverviewKpis,
  companyReservationKpis,
  contactActivityLabel,
  contactMethodKpis,
  distinctDepartmentCount,
  distinctDepartmentNames,
  isTravelAgencyBusinessType,
  latestNoteById,
  roleAssignableForNew,
  visibleCompanyNav,
} from "./guest-company-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Company detail workspace helpers", () => {
  it("shows Billing for every company and TA Settings only for travel-agency types", () => {
    const corp = visibleCompanyNav({ creditAccountAllowed: false, travelAgency: false });
    assert.equal(corp.some((item) => item.id === "credit"), true);
    assert.equal(corp.some((item) => item.id === "travel-agent-settings"), false);
    const ta = visibleCompanyNav({ creditAccountAllowed: true, travelAgency: true });
    assert.equal(ta.some((item) => item.id === "credit"), true);
    assert.equal(ta.some((item) => item.id === "travel-agent-settings"), true);
    assert.equal(isTravelAgencyBusinessType({ code: "TRA", name: "Travel Agency" }), true);
    assert.equal(isTravelAgencyBusinessType({ code: "TOU", name: "Tour Operator" }), false);
    assert.equal(companyHasCompanyRate(" CORP-RATE "), true);
    assert.equal(companyHasCompanyRate("  "), false);
  });

  it("blocks removing the last primary when the business type requires a contact", () => {
    assert.equal(
      blockLastPrimaryRemoval({
        contactRequired: true,
        currentIsPrimary: true,
        nextIsPrimary: false,
        nextStatus: "active",
      }),
      COMPANY_CONTACT_REQUIRED,
    );
    assert.equal(
      blockLastPrimaryRemoval({
        contactRequired: true,
        currentIsPrimary: true,
        nextIsPrimary: true,
        nextStatus: "inactive",
      }),
      COMPANY_CONTACT_REQUIRED,
    );
    assert.equal(
      blockLastPrimaryRemoval({
        contactRequired: false,
        currentIsPrimary: true,
        nextIsPrimary: false,
        nextStatus: "active",
      }),
      null,
    );
    assert.equal(roleAssignableForNew({ active: false }, true), true);
    assert.equal(roleAssignableForNew({ active: false }, false), false);
  });

  it("computes KPIs without inventing revenue", () => {
    const empty = companyOverviewKpis({
      reservationCount: 0,
      guestCount: 2,
      revenue: null,
      nightCount: 0,
      stayCount: 0,
    });
    assert.equal(empty.totalRevenue, null);
    assert.equal(empty.averageLengthOfStay, null);
    const filled = companyOverviewKpis({
      reservationCount: 3,
      guestCount: 2,
      revenue: { amount: 100, currency: "ETB" },
      nightCount: 9,
      stayCount: 3,
    });
    assert.equal(filled.averageLengthOfStay, 3);
  });

  it("counts contact methods and distinct departments from real rows", () => {
    const rows = [
      { phone: "+251911", email: "a@ex.com", whatsapp: "+251933", departmentId: "d1" },
      { phone: null, email: "b@ex.com", whatsapp: "", departmentId: "d1" },
      { phone: "+251922", email: null, whatsapp: null, departmentId: "d2" },
    ];
    assert.deepEqual(contactMethodKpis(rows), { phone: 2, email: 2, whatsapp: 1 });
    assert.equal(distinctDepartmentCount(rows), 2);
    assert.deepEqual(
      distinctDepartmentNames(rows, new Map([["d1", "Reservations"], ["d2", "Sales"]])),
      ["Reservations", "Sales"],
    );
    assert.equal(contactActivityLabel("primary_contact_changed"), "Primary contact changed");
  });
});

describe("Company detail workspace honesty", () => {
  it("keeps dual-lane 0091 equal and does not add a second company or guest table", () => {
    const supabase = readRel("../../../../supabase/migrations/0091_pms_guest_company_detail.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0091_pms_guest_company_detail.sql");
    assert.equal(COMPANY_DETAIL_MIGRATION_FILE, "0091_pms_guest_company_detail.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_business_contact_roles/);
    assert.match(supabase, /guest_company_contacts/);
    assert.match(supabase, /guest_company_contact_roles/);
    assert.match(supabase, /primary_contact_changed/);
    assert.doesNotMatch(supabase, /CREATE TABLE.*guest_profiles/i);
    assert.doesNotMatch(supabase, /CREATE TABLE.*hotel_reservations/i);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });

  it("wires company chrome, existing APIs, and settings catalogues", () => {
    const workspace = readRel("../components/workspaces/guest-profile-workspace.tsx");
    const detail = readRel("../components/workspaces/guest-company-detail-workspace.tsx");
    const functions = readRel("./guest-company-detail.functions.ts");
    const overview = readRel("../components/guests/guest-company-overview.tsx");
    const contacts = readRel("../components/guests/guest-company-contacts.tsx");
    const travelers = readRel("../components/guests/guest-company-travelers.tsx");
    const settings = readRel("../components/settings/pms-card4-company-business.tsx");
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const corporate = readRel("../components/guests/guest-company-corporate.tsx");
    const reservations = readRel("../components/guests/guest-company-reservations.tsx");
    const billing = readRel("../components/guests/guest-company-billing.tsx");
    const notes = readRel("../components/guests/guest-company-notes.tsx");
    const documents = readRel("../components/guests/guest-company-documents.tsx");
    const contracts = readRel("../components/guests/guest-company-contracts.tsx");
    const bookings = readRel("../../../routes/restaurant/bookings/new.tsx");
    assert.match(workspace, /GuestCompanyDetailWorkspace/);
    assert.match(workspace, /operationalType === "company"/);
    assert.doesNotMatch(detail, /GUEST_PROFILE_WORKSPACE_NAV/);
    assert.match(functions, /from\("guest_company_contacts"\)/);
    assert.match(functions, /from\("guest_account_links"\)/);
    assert.match(functions, /from\("hotel_reservations"\)/);
    assert.match(functions, /from\("pms_corporate_agreements"\)/);
    assert.match(functions, /from\("pms_departments"\)/);
    assert.match(functions, /knownMoneyTotal/);
    assert.match(functions, /nightsBetween/);
    assert.match(functions, /maskIdNumber/);
    assert.match(functions, /requireGuestManager/);
    assert.match(overview, /sendGuestAccountMessage/);
    assert.match(overview, /exportGuestAccount/);
    assert.match(overview, /companyMasterId: companyId/);
    assert.match(overview, /Add Contact/);
    assert.match(overview, /Add Contract/);
    assert.match(overview, /Add Note/);
    assert.match(overview, /\/restaurant\/bookings\/new/);
    assert.match(contacts, /pms_departments|getCompanyContactCatalogues/);
    assert.match(travelers, /GuestFormDialog/);
    assert.match(travelers, /linkGuestAccount/);
    assert.match(travelers, /GUEST_PROFILE_DETAIL_PATH/);
    assert.match(settings, /card4-contact-roles/);
    assert.doesNotMatch(form, /Position|Department/);
    assert.doesNotMatch(travelers, /createGuest\(/);
    assert.match(functions, /whatsapp/);
    assert.match(contacts, /company-contacts-kpis/);
    assert.match(contacts, /items-start/);
    assert.match(contacts, /Actions for/);
    assert.match(contacts, /dateTime\(row.createdAt\)/);
    assert.doesNotMatch(overview, /Corporate Rate Agreement|Commission Agreement/);
    assert.match(corporate, /updateGuestAccount/);
    assert.match(corporate, /validateCompanyAgainstType/);
    assert.match(reservations, /listCompanyReservations/);
    assert.match(reservations, /companyMasterId: companyId/);
    assert.match(billing, /listCompanyBilling/);
    assert.match(billing, /COMPANY_BILLING_COPY/);
    assert.doesNotMatch(billing, /availableCredit|credit_limit[^_]/);
    assert.match(notes, /listCompanyNotes/);
    assert.match(documents, /property-images/);
    assert.match(documents, /createCompanyDocumentUpload/);
    assert.match(contracts, /saveCorporateAgreementCard3/);
    assert.match(contracts, /saveContractRateCard3/);
    assert.match(detail, /GuestCompanyCorporate/);
    assert.match(detail, /GuestCompanyBilling/);
    assert.match(detail, /GuestCompanyDocuments/);
    assert.match(detail, /COMPANY_TA_SETTINGS_COMING/);
    assert.match(detail, /travel-agent-settings/);
    assert.match(bookings, /companyMasterId/);
    assert.match(bookings, /setReservationType\("corporate"\)/);
    assert.match(functions, /listCompanyBilling/);
    assert.match(functions, /guestStayAccessForRole/);
    assert.match(functions, /from\("guest_company_documents"\)/);
    assert.match(functions, /from\("folio_transactions"\)/);
    assert.doesNotMatch(functions, /CREATE TABLE.*accounts_receivable/i);
  });

  it("keeps dual-lane 0092 WhatsApp columns on the existing contact table", () => {
    const supabase = readRel("../../../../supabase/migrations/0092_pms_guest_company_contact_whatsapp.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0092_pms_guest_company_contact_whatsapp.sql");
    assert.equal(COMPANY_CONTACT_WHATSAPP_MIGRATION_FILE, "0092_pms_guest_company_contact_whatsapp.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /ALTER TABLE public.guest_company_contacts/);
    assert.match(supabase, /whatsapp_normalized/);
    assert.doesNotMatch(supabase, /CREATE TABLE/);
  });

  it("keeps dual-lane 0094 company documents and agreement metadata without an AR ledger", () => {
    const supabase = readRel("../../../../supabase/migrations/0094_pms_company_profile_phase1.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0094_pms_company_profile_phase1.sql");
    assert.equal(COMPANY_PHASE1_MIGRATION_FILE, "0094_pms_company_profile_phase1.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /pms_company_document_types/);
    assert.match(supabase, /guest_company_documents/);
    assert.match(supabase, /auto_renew/);
    assert.match(supabase, /note_updated/);
    assert.match(supabase, /document_uploaded/);
    assert.doesNotMatch(supabase, /accounts_receivable|company_folios|company_ledger/i);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
    assert.equal(COMPANY_BILLING_COPY.includes("accounts-receivable"), true);
    assert.match(COMPANY_TA_SETTINGS_COMING, /Guests → Travel Agencies/);
    assert.match(COMPANY_TA_SETTINGS_COMING, /classification only/);
  });
});

describe("Company phase 1 helpers", () => {
  it("computes reservation KPIs from real stay statuses", () => {
    const kpis = companyReservationKpis(
      [
        { status: "confirmed", arrivalDate: "2026-09-24", departureDate: "2026-09-26", nights: 2 },
        { status: "checked_in", arrivalDate: "2026-09-20", departureDate: "2026-09-23", nights: 3 },
        { status: "checked_out", arrivalDate: "2026-09-01", departureDate: "2026-09-03", nights: 2 },
        { status: "cancelled", arrivalDate: "2026-09-10", departureDate: "2026-09-12", nights: 2 },
      ],
      "2026-09-22",
    );
    assert.equal(kpis.total, 4);
    assert.equal(kpis.upcoming, 1);
    assert.equal(kpis.inHouse, 1);
    assert.equal(kpis.completed, 1);
    assert.equal(kpis.cancelled, 1);
    assert.equal(kpis.roomNights, 9);
  });

  it("does not invent a credit-limit ledger from folio signs", () => {
    const totals = companyBillingTotals([
      { amount: 100, folioStatus: "open" },
      { amount: -40, folioStatus: "open" },
      { amount: 20, folioStatus: "closed" },
    ]);
    assert.equal(totals.charges, 120);
    assert.equal(totals.credits, 40);
    assert.equal(totals.outstanding, 80);
    assert.equal("availableCredit" in totals, false);
  });

  it("keeps the latest structured note and document expiry status honest", () => {
    const latest = latestNoteById([
      { noteId: "n1", createdAt: "2026-09-01T00:00:00.000Z", content: "old" },
      { noteId: "n1", createdAt: "2026-09-02T00:00:00.000Z", content: "new" },
    ]);
    assert.equal(latest[0]?.content, "new");
    assert.equal(companyDocumentStatus({ reviewStatus: "verified", expiryDate: "2026-09-01", today: "2026-09-22" }), "expired");
    assert.equal(companyDocumentStatus({ reviewStatus: "rejected", expiryDate: "2026-10-01", today: "2026-09-22" }), "rejected");
    const kpis = companyDocumentKpis(
      [
        { status: "verified", expiryDate: "2026-10-01" },
        { status: "pending", expiryDate: null },
        { status: "expired", expiryDate: "2026-09-01" },
      ],
      "2026-09-22",
    );
    assert.equal(kpis.total, 3);
    assert.equal(kpis.verified, 1);
    assert.equal(kpis.pending, 1);
    assert.equal(kpis.expired, 1);
    assert.equal(kpis.expiring, 1);
  });
});
