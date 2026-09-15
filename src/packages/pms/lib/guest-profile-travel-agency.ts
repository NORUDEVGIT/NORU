/**
 * Guest Profile gap-edit #3 — Travel Agency enrichment + Company Payment Terms
 * (Issue #115). Spec AC-GE3-1…18 from docs PR #114.
 *
 * Additive TA master UX/schema only. Waves 1–5 stay closed.
 * Gap-edit 1 (#103/#105) and Gap-edit 2 (#109/#111/#112) stay closed.
 * Legal / agency name maps to existing `guest_account_masters.name`.
 * Linking reuses Wave 4 `guest_account_links` — no second link table.
 * Commission / rates / payment terms are REFERENCE ONLY — no settlement,
 * rate, or AP/AR engines. Group form stays thin.
 * No Import / Folio tab / KYC / police export / e-sign / family graph.
 * Additive RLS matching existing account-master policies is OK.
 * Entitlement model is not changed.
 */

import type { GuestAccountType, GuestRelationshipRole } from "./guest-profile-wave4.ts";

export const TA_ENRICHMENT_MIGRATION_FILE = "0058_pms_travel_agency_enrichment.sql";

export const TA_ENRICHMENT_UNAVAILABLE =
  "Unavailable until Travel Agency enrichment migration 0058 is applied.";

export const AGENCY_TYPES = ["ota", "local", "online", "other"] as const;
export type AgencyType = (typeof AGENCY_TYPES)[number];

export const AGENCY_TYPE_LABELS: Record<AgencyType, string> = {
  ota: "OTA",
  local: "Local",
  online: "Online",
  other: "Other",
};

export const COMMISSION_TYPES = ["percent", "fixed_note"] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  percent: "Percent",
  fixed_note: "Fixed note",
};

export const CONTRACT_STATUSES = ["draft", "active", "expired"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
};

/** Default role on TA is booker_ta. Other Wave 4 roles stay for parity — no new roles. */
export const TA_LINK_ROLES = [
  "booker_ta",
  "employer",
  "bill_to",
  "group_member",
] as const satisfies readonly GuestRelationshipRole[];
export type TaLinkRole = (typeof TA_LINK_ROLES)[number];

export const TA_ACCEPTANCE_CRITERIA = [
  "AC-GE3-1",
  "AC-GE3-2",
  "AC-GE3-3",
  "AC-GE3-4",
  "AC-GE3-5",
  "AC-GE3-6",
  "AC-GE3-7",
  "AC-GE3-8",
  "AC-GE3-9",
  "AC-GE3-10",
  "AC-GE3-11",
  "AC-GE3-12",
  "AC-GE3-13",
  "AC-GE3-14",
  "AC-GE3-15",
  "AC-GE3-16",
  "AC-GE3-17",
  "AC-GE3-18",
] as const;

export const TA_COMMISSION_REFERENCE_COPY =
  "Reference only. This does not post, settle, or pay commission.";

export const TA_LICENSE_COPY =
  "Staff text and dates only. This is not government KYC or a police check.";

export const TA_CONTRACT_COPY = "Text and dates only. There is no e-sign product.";

export const TA_RATE_REFERENCE_COPY =
  "Name or code only. This is not a rate engine and does not price a stay.";

export const PAYMENT_TERMS_REFERENCE_COPY =
  "Text only. This is not accounts payable, accounts receivable, city-ledger, or folio split.";

export const TA_MULTI_LINK_COPY =
  "Link Directory guests to this Travel Agent. Default role is booker travel agent. Roles write the existing guest_account_links store.";

export const TA_STAGED_LINKING_COPY =
  "Guests chosen here are held until Create, then written to guest_account_links. The Travel Agent id is required for the write.";

export const TA_PARTIAL_CREATE_COPY =
  "This Travel Agent was created. Some links did not finish. Retry below — this is not a full success.";

export const TA_STAGED_CREATE_COPY =
  "One Create writes the Travel Agent master, then any staged guest links (guest_account_links).";

export type StagedGuestLink = {
  key: string;
  guestId: string;
  guestName: string;
  role: TaLinkRole;
};

export function taLegalName(name: string): string {
  return name.trim();
}

export function isAgencyType(value: string): value is AgencyType {
  return (AGENCY_TYPES as readonly string[]).includes(value);
}

export function isCommissionType(value: string): value is CommissionType {
  return (COMMISSION_TYPES as readonly string[]).includes(value);
}

export function isContractStatus(value: string): value is ContractStatus {
  return (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function isTaLinkRole(value: string): value is TaLinkRole {
  return (TA_LINK_ROLES as readonly string[]).includes(value);
}

export function validateAgencyType(
  agencyType: string | null | undefined,
  agencyTypeOther: string | null | undefined,
): string | null {
  if (!agencyType || !isAgencyType(agencyType)) {
    return "Agency type is required.";
  }
  if (agencyType === "other" && !(agencyTypeOther ?? "").trim()) {
    return "Describe the agency type when Other is selected.";
  }
  return null;
}

export function agencyTypeAppliesTo(accountType: GuestAccountType): boolean {
  return accountType === "travel_agent";
}

export function taDirectorySecondary(
  tradeName: string | null | undefined,
  agencyType: string | null | undefined,
): string | null {
  const parts = [
    tradeName?.trim() || null,
    agencyType && isAgencyType(agencyType) ? AGENCY_TYPE_LABELS[agencyType] : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function hasPaymentTermsInput(
  paymentTerms: string | null | undefined,
  creditLimitNote: string | null | undefined,
  billingInstruction: string | null | undefined,
): boolean {
  return Boolean(
    (paymentTerms ?? "").trim() ||
      (creditLimitNote ?? "").trim() ||
      (billingInstruction ?? "").trim(),
  );
}
