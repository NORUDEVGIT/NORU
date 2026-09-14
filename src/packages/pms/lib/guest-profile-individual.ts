/**
 * Guest Profile gap-edit #2 — Individual form enrichment + blacklist/restricted
 * + Linking (Issue #109).
 *
 * Additive Individual UX/schema only. Waves 1–5 stay closed.
 * Company gap-edit #1 (#103/#105) stays closed.
 * Identity files reuse Wave 2 guest_documents — no second store.
 * Linking reuses Wave 4 guest_account_links — no second link table.
 * Stay paths warn; they do not hard-block Reservations / Front Office.
 * No Import/Folio/loyalty/rich Comms/Group-TA enrichment/Company further edits.
 * Additive RLS matching guest tables OK. Entitlement model is not changed.
 */

import type { GuestRelationshipRole } from "./guest-profile-wave4.ts";

export const INDIVIDUAL_ENRICHMENT_MIGRATION_FILE =
  "0057_pms_individual_form_enrichment.sql";

export const INDIVIDUAL_ENRICHMENT_UNAVAILABLE =
  "Unavailable until Individual form enrichment migration 0057 is applied.";

export const GUEST_TITLES = ["mr", "mrs", "ms", "miss", "dr", "prof", "mx"] as const;
export type GuestTitle = (typeof GUEST_TITLES)[number];

export const GUEST_TITLE_LABELS: Record<GuestTitle, string> = {
  mr: "Mr",
  mrs: "Mrs",
  ms: "Ms",
  miss: "Miss",
  dr: "Dr",
  prof: "Prof",
  mx: "Mx",
};

export const GUEST_GENDERS = ["female", "male", "other", "unspecified"] as const;
export type GuestGender = (typeof GUEST_GENDERS)[number];

export const GUEST_GENDER_LABELS: Record<GuestGender, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  unspecified: "Unspecified",
};

export const RESTRICTION_SEVERITIES = ["watch", "elevated", "severe"] as const;
export type RestrictionSeverity = (typeof RESTRICTION_SEVERITIES)[number];

export const RESTRICTION_SEVERITY_LABELS: Record<RestrictionSeverity, string> = {
  watch: "Watch",
  elevated: "Elevated",
  severe: "Severe",
};

export const INDIVIDUAL_LINK_ROLES = [
  "employer",
  "bill_to",
  "booker_ta",
  "group_member",
] as const satisfies readonly GuestRelationshipRole[];
export type IndividualLinkRole = (typeof INDIVIDUAL_LINK_ROLES)[number];

export const INDIVIDUAL_ACCEPTANCE_CRITERIA = [
  "AC-GE2-1",
  "AC-GE2-2",
  "AC-GE2-3",
  "AC-GE2-4",
  "AC-GE2-5",
  "AC-GE2-6",
  "AC-GE2-7",
  "AC-GE2-8",
  "AC-GE2-9",
  "AC-GE2-10",
  "AC-GE2-11",
  "AC-GE2-12",
  "AC-GE2-13",
  "AC-GE2-14",
  "AC-GE2-15",
  "AC-GE2-16",
  "AC-GE2-17",
  "AC-GE2-18",
  "AC-GE2-19",
  "AC-GE2-20",
  "AC-GE2-21",
  "AC-GE2-22",
  "AC-GE2-23",
  "AC-GE2-24",
  "AC-GE2-25",
  "AC-GE2-26",
  "AC-GE2-27",
  "AC-GE2-28",
  "AC-GE2-29",
  "AC-GE2-30",
  "AC-GE2-31",
  "AC-GE2-32",
  "AC-GE2-33",
  "AC-GE2-34",
] as const;

/**
 * Amended TIP used AC-GE2-1…13 as seed names. Spec #110 remapped the same
 * prefix to AC-GE2-1…34. Spec IDs win.
 */
export const INDIVIDUAL_TIP_AC_MAP = {
  "plan-sectioned-form": ["AC-GE2-1"],
  "plan-first-name-fields": ["AC-GE2-2", "AC-GE2-3", "AC-GE2-4", "AC-GE2-5", "AC-GE2-16", "AC-GE2-18"],
  "plan-identity-upload": ["AC-GE2-6", "AC-GE2-7", "AC-GE2-8", "AC-GE2-14", "AC-GE2-15"],
  "plan-emergency": ["AC-GE2-17"],
  "plan-restriction-set": ["AC-GE2-19", "AC-GE2-20", "AC-GE2-21"],
  "plan-restriction-lift": ["AC-GE2-22"],
  "plan-restriction-warn": ["AC-GE2-23", "AC-GE2-24"],
  "plan-waves-closed": ["AC-GE2-25", "AC-GE2-28", "AC-GE2-29", "AC-GE2-30", "AC-GE2-31"],
  "plan-linking": ["AC-GE2-9", "AC-GE2-10", "AC-GE2-11", "AC-GE2-12", "AC-GE2-13"],
} as const;

/** Spec #110 §9 IDs are the contract. */
export const INDIVIDUAL_SPEC_AC_IDS = [...INDIVIDUAL_ACCEPTANCE_CRITERIA] as const;

export const INDIVIDUAL_IDENTITY_UPLOAD_COPY =
  "Identity files use the existing guest_documents store. Staff verify is not government verification or KYC.";

export const INDIVIDUAL_IDENTITY_AFTER_SAVE_COPY =
  "Document upload is available after this guest is saved. Identity files use guest_documents — no second store.";

export const INDIVIDUAL_LINKING_COPY =
  "Link this individual to existing Company, Group or Travel Agent masters. Roles write the existing guest_account_links store.";

export const INDIVIDUAL_LINKING_AFTER_SAVE_COPY =
  "Linking is available after this guest is saved. The Relationships card reads the same guest_account_links store.";

export const INDIVIDUAL_RESTRICTION_WARN_COPY =
  "This guest is restricted and/or blacklisted. This is a warning — stay create is not hard-blocked.";

export const INDIVIDUAL_RESTRICTION_REASON_REQUIRED =
  "A reason is required when setting restricted or blacklisted.";

export const INDIVIDUAL_LIFT_REASON_REQUIRED =
  "A reason is required to lift a restriction.";

export const INDIVIDUAL_EMERGENCY_COPY =
  "Add or remove emergency contacts. First-name-only create can save with none.";

export const INDIVIDUAL_EMERGENCY_NAME_REQUIRED =
  "Emergency contacts need a name when other details are filled.";

export const INDIVIDUAL_HARD_BLOCK_FINDING =
  "OUT-OF-SCOPE FINDING: a Reservations / Front Office hard block would need an entitlement or RLS model change. Flag Abel — do not invent it. This batch warns only.";

export type GuestRestrictionFlags = {
  restricted: boolean;
  blacklisted: boolean;
  restrictionReason?: string | null;
};

export function isGuestTitle(value: string): value is GuestTitle {
  return (GUEST_TITLES as readonly string[]).includes(value);
}

export function isGuestGender(value: string): value is GuestGender {
  return (GUEST_GENDERS as readonly string[]).includes(value);
}

export function isRestrictionSeverity(value: string): value is RestrictionSeverity {
  return (RESTRICTION_SEVERITIES as readonly string[]).includes(value);
}

export function isIndividualLinkRole(value: string): value is IndividualLinkRole {
  return (INDIVIDUAL_LINK_ROLES as readonly string[]).includes(value);
}

export function guestRestrictionActive(
  guest: GuestRestrictionFlags | null | undefined,
): boolean {
  return Boolean(guest?.restricted || guest?.blacklisted);
}

export function guestRestrictionWarning(
  guest: GuestRestrictionFlags | null | undefined,
): string | null {
  return guestRestrictionActive(guest) ? INDIVIDUAL_RESTRICTION_WARN_COPY : null;
}

export function validateRestrictionReason(
  restricted: boolean,
  blacklisted: boolean,
  reason: string | null | undefined,
): string | null {
  if ((restricted || blacklisted) && !(reason ?? "").trim()) {
    return INDIVIDUAL_RESTRICTION_REASON_REQUIRED;
  }
  return null;
}

export function validateLiftReason(reason: string | null | undefined): string | null {
  if (!(reason ?? "").trim()) return INDIVIDUAL_LIFT_REASON_REQUIRED;
  return null;
}

export function countNamedEmergencyContacts(
  contacts: Array<{ name?: string | null }>,
): number {
  return contacts.filter((contact) => (contact.name ?? "").trim() !== "").length;
}

export function validateEmergencyContacts(
  contacts: Array<{
    name?: string | null | undefined;
    relationship?: string | null | undefined;
    phone?: string | null | undefined;
    email?: string | null | undefined;
  }>,
): string | null {
  const incomplete = contacts.some((contact) => {
    const named = (contact.name ?? "").trim() !== "";
    const extra = [contact.relationship, contact.phone, contact.email].some(
      (value) => (value ?? "").trim() !== "",
    );
    return extra && !named;
  });
  return incomplete ? INDIVIDUAL_EMERGENCY_NAME_REQUIRED : null;
}
