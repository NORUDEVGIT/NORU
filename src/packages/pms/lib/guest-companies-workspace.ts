/**
 * Guest Profile → Companies workspace helpers.
 * Catalogue: Card 4 pms_business_profile_types / settings.
 * Rows: guest_account_masters (account_type = company).
 */

import type { BusinessFieldOption, BusinessProfileSettings, BusinessProfileTypeRecord } from "./company-business-card4.server.ts";
import type { GuestAccountStatus } from "./guest-profile-wave4.ts";

export const COMPANIES_WORKSPACE_MIGRATION_FILE = "0090_pms_guest_companies_workspace.sql";
export const COMPANIES_TITLE = "Companies";
export const COMPANIES_COPY =
  "Manage corporate clients, travel agents, tour operators and partner companies.";
export const COMPANIES_EMPTY = "No companies yet";
export const COMPANIES_NO_TYPES =
  "Configure active Business Profile Types in Company & Business Settings.";
export const COMPANIES_DISABLED =
  "Business profiles are disabled in Company & Business Settings. Existing companies stay available. New registration is blocked.";
export const COMPANY_IMPORT_XLSX =
  "Excel files are not imported. Save the sheet as CSV and try again.";
export const COMPANY_PAGE_SIZES = [10, 25, 50] as const;
export const COMPANY_DEFAULT_PAGE_SIZE = 10;

export const BUSINESS_FIELD_TO_COLUMN: Record<string, keyof CompanyValidationInput> = {
  COMPANY_NAME: "name",
  TAX_ID: "taxId",
  CONTACT_PERSON: "primaryContactName",
  BUSINESS_ADDRESS: "addressLine1",
  BUSINESS_LICENSE: "businessRegistrationNumber",
};

export type CompanyValidationInput = {
  name: string;
  taxId: string | null;
  primaryContactName: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  country: string | null;
  businessRegistrationNumber: string | null;
  creditAccountEnabled: boolean;
  paymentTerms: string | null;
  creditLimitNote: string | null;
};

export function companyCreateAllowed(
  settings: Pick<BusinessProfileSettings, "enabled">,
  listingCreateAllowed: boolean,
  activeTypeCount: number,
): { ok: true } | { ok: false; message: string } {
  if (!listingCreateAllowed) {
    return { ok: false, message: "This profile type is inactive in Guest Profile Rules. Existing records stay available." };
  }
  if (!settings.enabled) return { ok: false, message: COMPANIES_DISABLED };
  if (activeTypeCount === 0) return { ok: false, message: COMPANIES_NO_TYPES };
  return { ok: true };
}

export function defaultBusinessTypeId(
  settings: Pick<BusinessProfileSettings, "defaultBusinessTypeId">,
  types: Array<{ id: string; active: boolean }>,
): string | null {
  const id = settings.defaultBusinessTypeId;
  if (!id) return null;
  return types.some((type) => type.id === id && type.active) ? id : null;
}

export function createStatusFromAutoApproval(autoApproval: boolean): GuestAccountStatus {
  return autoApproval ? "active" : "pending";
}

export function validateCompanyAgainstType(
  input: CompanyValidationInput,
  type: Pick<
    BusinessProfileTypeRecord,
    "requiredFieldIds" | "taxIdRequired" | "contactRequired" | "creditAccountAllowed" | "active"
  >,
  fields: BusinessFieldOption[],
  mode: "create" | "update",
): string | null {
  if (mode === "create" && !type.active) {
    return "That business type is inactive and cannot be used for new companies.";
  }
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  for (const fieldId of type.requiredFieldIds) {
    const field = fieldById.get(fieldId);
    if (!field || !field.active) continue;
    const key = BUSINESS_FIELD_TO_COLUMN[field.code];
    if (!key) continue;
    if (key === "addressLine1") {
      if (!input.addressLine1?.trim() && !input.city?.trim() && !input.country?.trim()) {
        return `${field.name} is required for this business type.`;
      }
      continue;
    }
    const value = input[key];
    if (typeof value !== "string" || !value.trim()) {
      return `${field.name} is required for this business type.`;
    }
  }
  if (type.taxIdRequired && !input.taxId?.trim()) return "Tax ID is required for this business type.";
  if (type.contactRequired) {
    if (!input.primaryContactName?.trim()) return "A contact person is required for this business type.";
    if (!input.phone?.trim() && !input.email?.trim()) {
      return "Phone or email is required when a contact is required.";
    }
  }
  if (!type.creditAccountAllowed && input.creditAccountEnabled) {
    return "Credit accounts are not allowed for this business type.";
  }
  if (!type.creditAccountAllowed && (input.paymentTerms?.trim() || input.creditLimitNote?.trim())) {
    return "Credit terms are not allowed for this business type.";
  }
  return null;
}

export function companyKpis(
  rows: Array<{ accountStatus: string; creditAccountEnabled: boolean }>,
): { total: number; active: number; inactive: number; credit: number } {
  return {
    total: rows.length,
    active: rows.filter((row) => row.accountStatus === "active").length,
    inactive: rows.filter((row) => row.accountStatus === "inactive").length,
    credit: rows.filter((row) => row.creditAccountEnabled).length,
  };
}

export function parseCompanyCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]!).map((cell) => cell.trim().toLowerCase());
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}

export const COMPANY_CSV_COLUMNS = [
  "type_code",
  "name",
  "registration_number",
  "tax_id",
  "country",
  "city",
  "address",
  "contact_person",
  "job_title",
  "phone",
  "email",
  "website",
  "notes",
] as const;

export function companyCsvHeader(): string {
  return COMPANY_CSV_COLUMNS.join(",");
}

export function csvEscape(value: string | null | undefined): string {
  const text = value ?? "";
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}
