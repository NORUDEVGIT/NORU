/**
 * Guest Profile Module — Wave 5 helpers (Notes / Comms / Activity hub +
 * Privacy finish).
 *
 * Hub composes existing profile notes + guest_profile_history. Send is
 * offered only when a real email transport AND a property-saved email
 * channel exist — never a fake “email sent”. This is not a marketing cloud.
 *
 * Privacy writes (export / anonymise / unmerge) are owner/manager only —
 * stricter than the receptionist residual on guest manage. Documented, not
 * an entitlement-model change.
 */

export const WAVE5_MIGRATION_FILE = "0054_pms_guest_profile_wave5.sql";

export const WAVE5_MIGRATION_UNAVAILABLE =
  "Unavailable until Guest Profile Wave 5 migration 0054 is applied.";

export const WAVE5_HUB_COPY =
  "Notes, profile history and recorded operational communications for this profile. This is not a marketing cloud.";

export const WAVE5_HUB_EMPTY =
  "No notes, history or recorded communications yet. This card does not invent messages.";

export const WAVE5_NO_SEND_COPY =
  "No send control is offered. Email is sent only when a real channel is configured for this property.";

export const WAVE5_SEND_COPY =
  "Send uses the property email channel and the platform mail transport. Failed sends are not recorded as sent.";

export const WAVE5_PRIVACY_COPY =
  "Export, anonymise and unmerge are owner/manager privacy actions. Wave 2 consent stays visible and editable on Information under policy.";

export const WAVE5_PRIVACY_ROLES_COPY =
  "Privacy writes are owner/manager only. Receptionist guest-manage access is unchanged and does not export, anonymise or unmerge.";

export const WAVE5_ANONYMISE_COPY =
  "Anonymise permanently removes live PII from Directory and search. Stay and folio records stay linked by id.";

export const WAVE5_UNMERGE_COPY =
  "Unmerge reverses a Wave 2 merge when a reversible ledger exists. Otherwise a recorded exception explains why — never a silent undo.";

export const WAVE5_UNMERGE_BLOCKED_NO_LEDGER =
  "This merge has no reversible ledger. Unmerge is not available; the exception is recorded on history.";

export const WAVE5_UNMERGE_BLOCKED_MOVED =
  "Reservations or documents moved after the merge, so unmerge cannot run. The exception is recorded on history.";

export const WAVE5_ANONYMISED_GUEST_LABEL = "Anonymised guest";

export const WAVE5_ANONYMISED_MASTER_LABELS = {
  company: "Anonymised company",
  group: "Anonymised group account",
  travel_agent: "Anonymised travel agent",
} as const;

export const WAVE5_ACCEPTANCE_CRITERIA = [
  "AC-W5-1",
  "AC-W5-2",
  "AC-W5-3",
  "AC-W5-4",
  "AC-W5-5",
  "AC-W5-6",
  "AC-W5-7",
] as const;

export const GUEST_PRIVACY_ROLES = ["owner", "manager"] as const;
export type GuestPrivacyRole = (typeof GUEST_PRIVACY_ROLES)[number];

export const GUEST_COMMS_CHANNELS = ["email", "phone", "in_person", "other"] as const;
export type GuestCommsChannel = (typeof GUEST_COMMS_CHANNELS)[number];

export const GUEST_COMMS_CHANNEL_LABELS: Record<GuestCommsChannel, string> = {
  email: "Email",
  phone: "Phone",
  in_person: "In person",
  other: "Other",
};

export const WAVE5_PRIVACY_EVENT_TYPES = [
  "exported",
  "anonymised",
  "unmerged",
  "unmerge_blocked",
] as const;
export type GuestPrivacyEventType = (typeof WAVE5_PRIVACY_EVENT_TYPES)[number];

export const WAVE5_COMMS_EVENT_TYPES = ["comms_logged", "comms_sent"] as const;

export type GuestSendChannel = { kind: "email" };

export function canManageGuestPrivacy(role: string): boolean {
  return (GUEST_PRIVACY_ROLES as readonly string[]).includes(role);
}

export function isGuestPrivacyEvent(eventType: string): boolean {
  return (WAVE5_PRIVACY_EVENT_TYPES as readonly string[]).includes(eventType);
}

export function isGuestCommsEvent(eventType: string): boolean {
  return (WAVE5_COMMS_EVENT_TYPES as readonly string[]).includes(eventType);
}

/** Real send transport used elsewhere in the product (Resend). Not an ESP UI. */
export function platformEmailTransportConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  const key = env["RESEND_API_KEY"]?.trim();
  const from = env["GUEST_EMAIL_FROM"]?.trim() || env["RECEIPT_EMAIL_FROM"]?.trim();
  return Boolean(key && from);
}

/** Property-saved SET5 email channel. SET5 alone is not an ESP. */
export function propertyEmailChannelConfigured(channels: {
  email: boolean;
  savedAt: string | null;
}): boolean {
  return Boolean(channels.savedAt && channels.email);
}

/**
 * Offer send only when the property saved email AND a real transport exists.
 * Otherwise omit the control — never fake “email sent”.
 */
export function resolveGuestSendChannel(input: {
  platformTransport: boolean;
  propertyEmail: boolean;
}): GuestSendChannel | null {
  if (input.platformTransport && input.propertyEmail) return { kind: "email" };
  return null;
}

export function anonymisedGuestDisplayName(anonymised: boolean, fullName: string): string {
  return anonymised ? WAVE5_ANONYMISED_GUEST_LABEL : fullName;
}

export function anonymisedMasterDisplayName(
  anonymised: boolean,
  accountType: keyof typeof WAVE5_ANONYMISED_MASTER_LABELS,
  name: string,
): string {
  return anonymised ? WAVE5_ANONYMISED_MASTER_LABELS[accountType] : name;
}

export function directoryContactForAnonymised<T extends { phone: string | null; email: string | null }>(
  anonymised: boolean,
  row: T,
): Pick<T, "phone" | "email"> {
  if (!anonymised) return { phone: row.phone, email: row.email };
  return { phone: null, email: null };
}

export type GuestMergeLedgerPayload = {
  copiedProfile: Record<string, unknown>;
  previousSurvivorProfile: Record<string, unknown>;
  copiedPrefs: Record<string, unknown>;
  previousSurvivorPrefs: Record<string, unknown> | null;
  copiedConsent: Record<string, unknown>;
  previousSurvivorConsent: Record<string, unknown>;
  movedReservationIds: string[];
  movedDocumentIds: string[];
  movedLinkIds: string[];
  deletedLinkIds: string[];
  retiredStatus: string;
};

export type UnmergeAssessment =
  | { status: "reversible"; ledgerId: string }
  | {
      status: "blocked";
      reason: string;
      code: "no_ledger" | "moved" | "already_reverted" | "anonymised" | "not_merged";
    };
