/**
 * Guest Profile gap-edit #2 — Individual form enrichment + blacklist/restricted
 * + Linking (Issue #109).
 *
 * Additive Individual UX/schema only. Waves 1–5 stay closed.
 * Company gap-edit #1 (#103/#105) stays closed.
 * Identity files reuse Wave 2 guest_documents — no second store.
 * Linking reuses Wave 4 guest_account_links — no second link table.
 * Stay paths warn; they do not hard-block Reservations / Front Office.
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
] as const;

/** Eng-ready Spec AC-GE2-* had not landed when this lock was written. Plan IDs are the contract. */
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

export const INDIVIDUAL_EMERGENCY_REQUIRED =
  "Add at least one emergency contact with a name.";

export const INDIVIDUAL_HARD_BLOCK_FINDING =
  "OUT-OF-SCOPE FINDING: a Reservations / Front Office hard block would need an entitlement or RLS model change. Flag Abel — do not invent it. This batch warns only.";

export type GuestRestrictionFlags = {
  restricted: boolean;
  blacklisted: boolean;
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
  contacts: Array<{ name?: string | null }>,
): string | null {
  if (countNamedEmergencyContacts(contacts) < 1) return INDIVIDUAL_EMERGENCY_REQUIRED;
  return null;
}
