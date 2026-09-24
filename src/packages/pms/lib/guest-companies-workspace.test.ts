import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COMPANY_CSV_COLUMNS,
  COMPANY_IMPORT_XLSX,
  COMPANIES_WORKSPACE_MIGRATION_FILE,
  companyCreateAllowed,
  companyKpis,
  createStatusFromAutoApproval,
  csvEscape,
  defaultBusinessTypeId,
  parseCompanyCsv,
  validateCompanyAgainstType,
} from "./guest-companies-workspace.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const type = {
  requiredFieldIds: ["tax-field"],
  taxIdRequired: true,
  contactRequired: true,
  creditAccountAllowed: false,
  active: true,
};

const fields = [
  { id: "tax-field", name: "Tax ID", code: "TAX_ID", active: true },
  { id: "name-field", name: "Company name", code: "COMPANY_NAME", active: true },
];

describe("Guest companies workspace helpers", () => {
  it("gates create from Card 4 settings and listing rules", () => {
    assert.equal(
      companyCreateAllowed({ enabled: false }, true, 1).ok,
      false,
    );
    assert.equal(
      companyCreateAllowed({ enabled: true }, true, 0).ok,
      false,
    );
    assert.equal(companyCreateAllowed({ enabled: true }, true, 1).ok, true);
    assert.equal(defaultBusinessTypeId({ defaultBusinessTypeId: "a" }, [{ id: "a", active: false }]), null);
    assert.equal(defaultBusinessTypeId({ defaultBusinessTypeId: "a" }, [{ id: "a", active: true }]), "a");
    assert.equal(createStatusFromAutoApproval(true), "active");
    assert.equal(createStatusFromAutoApproval(false), "pending");
  });

  it("validates required fields, tax, contact, and credit against the type", () => {
    const missing = validateCompanyAgainstType(
      {
        name: "Acme",
        taxId: null,
        primaryContactName: null,
        phone: null,
        email: null,
        addressLine1: null,
        city: null,
        country: null,
        businessRegistrationNumber: null,
        creditAccountEnabled: true,
        paymentTerms: "NET30",
        creditLimitNote: null,
      },
      type,
      fields,
      "create",
    );
    assert.match(missing ?? "", /Tax ID is required/);
    const credit = validateCompanyAgainstType(
      {
        name: "Acme",
        taxId: "TIN-1",
        primaryContactName: "Ada",
        phone: "+251900",
        email: null,
        addressLine1: "1 Main",
        city: "Addis Ababa",
        country: "ET",
        businessRegistrationNumber: null,
        creditAccountEnabled: true,
        paymentTerms: null,
        creditLimitNote: null,
      },
      type,
      fields,
      "create",
    );
    assert.equal(credit, "Credit accounts are not allowed for this business type.");
  });

  it("parses CSV, rejects Excel copy, and counts credit KPIs", () => {
    const parsed = parseCompanyCsv('type_code,name\nCORP,"Acme, Inc"');
    assert.deepEqual(parsed.headers, ["type_code", "name"]);
    assert.equal(parsed.rows[0]?.[1], "Acme, Inc");
    assert.equal(csvEscape('a,b'), '"a,b"');
    assert.deepEqual([...COMPANY_CSV_COLUMNS].slice(0, 3), ["type_code", "name", "registration_number"]);
    assert.match(COMPANY_IMPORT_XLSX, /CSV/);
    const kpis = companyKpis([
      { accountStatus: "active", creditAccountEnabled: true },
      { accountStatus: "inactive", creditAccountEnabled: false },
      { accountStatus: "pending", creditAccountEnabled: true },
    ]);
    assert.equal(kpis.total, 3);
    assert.equal(kpis.active, 1);
    assert.equal(kpis.inactive, 1);
    assert.equal(kpis.credit, 2);
  });
});

describe("Guest companies workspace honesty", () => {
  it("uses Card 4 types on guest_account_masters, not a second company table or AR ledger", () => {
    const functions = readRel("./guest-companies.functions.ts");
    const accounts = readRel("./guest-accounts.functions.ts");
    const directory = readRel("../components/guests/guest-company-directory.tsx");
    const form = readRel("../components/guests/guest-company-form-dialog.tsx");
    const listing = readRel("../components/guests/guest-account-directory.tsx");
    assert.match(functions, /from\("pms_business_profile_types"\)/);
    assert.match(functions, /from\("guest_account_masters"\)/);
    assert.match(functions, /export const listCompanyWorkspace/);
    assert.match(functions, /export const previewCompanyImport/);
    assert.match(functions, /export const confirmCompanyImport/);
    assert.match(functions, /requireGuestManager/);
    assert.doesNotMatch(functions, /credit ledger|accounts receivable|invoice aging/i);
    assert.match(accounts, /business_profile_type_id/);
    assert.match(accounts, /credit_account_enabled/);
    assert.match(directory, /Register New Company/);
    assert.match(directory, /companies-import/);
    assert.match(form, /Register New Company/);
    assert.match(form, /ISO_COUNTRIES/);
    assert.match(form, /company-job-title/);
    assert.doesNotMatch(form, /Position|Department/);
    assert.match(listing, /GuestCompanyDirectory/);
  });

  it("keeps dual-lane 0090 migrations equal", () => {
    const supabase = readRel("../../../../supabase/migrations/0090_pms_guest_companies_workspace.sql");
    const drizzle = readRel("../../../../drizzle/migrations/0090_pms_guest_companies_workspace.sql");
    assert.equal(COMPANIES_WORKSPACE_MIGRATION_FILE, "0090_pms_guest_companies_workspace.sql");
    assert.equal(supabase, drizzle);
    assert.match(supabase, /business_profile_type_id/);
    assert.match(supabase, /credit_account_enabled/);
    assert.match(supabase, /primary_contact_title/);
    assert.match(supabase, /'pending'/);
    assert.match(supabase, /logo_updated/);
    assert.doesNotMatch(supabase, /SECURITY DEFINER/i);
  });
});
