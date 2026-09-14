/**
 * Guest Profile gap-edit #1 — Company registration enrichment.
 *
 * Additive Company master UX/schema only. Waves 1–5 stay closed.
 * Legal / company name maps to existing `guest_account_masters.name`.
 * Trade / display name is `trade_name`. No second relationship store.
 * Negotiated rate reference is a name/code string — not a rate engine.
 */

import type { GuestAccountType } from "./guest-profile-wave4.ts";

export const COMPANY_ENRICHMENT_MIGRATION_FILE =
  "0055_pms_company_registration_enrichment.sql";

export const COMPANY_ENRICHMENT_UNAVAILABLE =
  "Unavailable until Company registration enrichment migration 0055 is applied.";

export const COMPANY_TYPES = [
  "private_limited",
  "plc",
  "sole_proprietorship",
  "partnership",
  "ngo",
  "government",
  "other",
] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  private_limited: "Private limited",
  plc: "PLC",
  sole_proprietorship: "Sole proprietorship",
  partnership: "Partnership",
  ngo: "NGO",
  government: "Government",
  other: "Other",
};

export const COMPANY_LINK_ROLES = ["employer", "bill_to"] as const;
export type CompanyLinkRole = (typeof COMPANY_LINK_ROLES)[number];

export const COMPANY_ACCEPTANCE_CRITERIA = [
  "AC-GE1-1",
  "AC-GE1-2",
  "AC-GE1-3",
  "AC-GE1-4",
  "AC-GE1-5",
  "AC-GE1-6",
  "AC-GE1-7",
  "AC-GE1-8",
  "AC-GE1-9",
  "AC-GE1-10",
  "AC-GE1-11",
  "AC-GE1-12",
  "AC-GE1-13",
  "AC-GE1-14",
  "AC-GE1-15",
  "AC-GE1-16",
  "AC-GE1-17",
  "AC-GE1-18",
  "AC-GE1-19",
  "AC-GE1-20",
  "AC-GE1-21",
  "AC-GE1-22",
  "AC-GE1-23",
  "AC-GE1-24",
] as const;

/** TIP seeds AC-CO-1…7 map onto Spec AC-GE1-* (#104). Spec IDs win. */
export const COMPANY_TIP_AC_MAP = {
  "AC-CO-1": ["AC-GE1-1"],
  "AC-CO-2": ["AC-GE1-2", "AC-GE1-4"],
  "AC-CO-3": ["AC-GE1-5", "AC-GE1-6", "AC-GE1-7", "AC-GE1-8", "AC-GE1-10"],
  "AC-CO-4": ["AC-GE1-9"],
  "AC-CO-5": ["AC-GE1-11", "AC-GE1-12", "AC-GE1-13"],
  "AC-CO-6": ["AC-GE1-14", "AC-GE1-15"],
  "AC-CO-7": ["AC-GE1-13", "AC-GE1-16", "AC-GE1-17", "AC-GE1-18"],
} as const;

export const COMPANY_RATE_REFERENCE_COPY =
  "Name or code only. This is not a rate engine and does not price a stay.";

export const COMPANY_DEFAULT_TA_COPY =
  "Pick an existing Travel Agent master. Typed-only names are not a default TA.";

export const COMPANY_MULTI_LINK_COPY =
  "Link one or more Directory guests to this Company. Roles write the existing guest_account_links store.";

/** Legal name is the existing `name` column. Trade name is secondary display only. */
export function companyLegalName(name: string): string {
  return name.trim();
}

export function companyDirectorySecondary(
  tradeName: string | null | undefined,
  companyType: string | null | undefined,
): string | null {
  const parts = [
    tradeName?.trim() || null,
    companyType && isCompanyType(companyType) ? COMPANY_TYPE_LABELS[companyType] : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function isCompanyType(value: string): value is CompanyType {
  return (COMPANY_TYPES as readonly string[]).includes(value);
}

export function isCompanyLinkRole(value: string): value is CompanyLinkRole {
  return (COMPANY_LINK_ROLES as readonly string[]).includes(value);
}

export function validateCompanyType(
  companyType: string | null | undefined,
  companyTypeOther: string | null | undefined,
): string | null {
  if (!companyType || !isCompanyType(companyType)) {
    return "Company type is required.";
  }
  if (companyType === "other" && !(companyTypeOther ?? "").trim()) {
    return "Describe the company type when Other is selected.";
  }
  return null;
}

export function companyTypeAppliesTo(accountType: GuestAccountType): boolean {
  return accountType === "company";
}
