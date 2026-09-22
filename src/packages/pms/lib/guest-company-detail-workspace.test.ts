import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_CONTACT_REQUIRED,
  COMPANY_CONTACT_WHATSAPP_MIGRATION_FILE,
  COMPANY_DETAIL_MIGRATION_FILE,
  blockLastPrimaryRemoval,
  companyHasCompanyRate,
  companyOverviewKpis,
  contactActivityLabel,
  contactMethodKpis,
  distinctDepartmentCount,
  distinctDepartmentNames,
  isTravelAgencyBusinessType,
  roleAssignableForNew,
  visibleCompanyNav,
} from "./guest-company-detail-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

describe("Company detail workspace helpers", () => {
  it("shows credit and TA tabs only from Card 4 type rules", () => {
    const corp = visibleCompanyNav({ creditAccountAllowed: false, travelAgency: false });
    assert.equal(corp.some((item) => item.id === "credit"), false);
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
    assert.match(overview, /CARD3_HREF/);
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
});
