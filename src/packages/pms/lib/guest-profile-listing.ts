/**
 * Guest Profile listing workspace helpers.
 *
 * Presentation + mapping only. Persistence stays on guest_profiles /
 * guest_account_masters / Card 4 catalogues. This is not a second CRM.
 *
 * Card 4 profile types are configuration. Operational data remains:
 * individuals on guest_profiles; Company / Group / Travel Agent on
 * guest_account_masters. Tour Operator and Contact Person are listing
 * placeholders. Organization is never a workspace section.
 */

import type { GuestProfileTypeId } from "./guest-profile-wave1.ts";
import type { GuestAccountType } from "./guest-profile-wave4.ts";

/** Collapse the PMS package rail as soon as Guest Profile is open so listing and profile cards can use the width. */
export const GUEST_PROFILE_SIDEBAR_DEFAULT_COLLAPSED = true;

export const GUEST_LISTING_PLACEHOLDERS = ["tour-operator", "contact"] as const;
export type GuestListingPlaceholderId = (typeof GUEST_LISTING_PLACEHOLDERS)[number];

export type GuestListingSectionId = GuestProfileTypeId | GuestListingPlaceholderId;

export const GUEST_LISTING_SECTIONS = [
  { id: "individual", title: "Guests", chip: "Individuals", live: true, placeholder: false },
  { id: "company", title: "Companies", chip: "Companies", live: true, placeholder: false },
  { id: "travel-agent", title: "Travel Agencies", chip: "Travel Agencies", live: true, placeholder: false },
  { id: "tour-operator", title: "Tour Operators", chip: "Tour Operators", live: false, placeholder: true },
  { id: "contact", title: "Contacts", chip: "Contacts", live: false, placeholder: true },
  { id: "group", title: "Groups", chip: "Groups", live: true, placeholder: false },
] as const;

export const GUEST_LISTING_CHIPS = [
  { id: "all", title: "All", section: "individual" as GuestListingSectionId },
  { id: "individual", title: "Individuals", section: "individual" as GuestListingSectionId },
] as const;

export type GuestListingChipId = (typeof GUEST_LISTING_CHIPS)[number]["id"];

/** Card 4 codes → listing sections. ORG is intentionally omitted. */
export const CARD4_CODE_TO_SECTION: Record<string, GuestListingSectionId> = {
  IND: "individual",
  COM: "company",
  TRA: "travel-agent",
  TOU: "tour-operator",
  CON: "contact",
  GRP: "group",
};

export const LISTING_PAGE_SIZES = [25, 50] as const;
export const LISTING_DEFAULT_PAGE_SIZE = 25;
export const LISTING_ACTIVITY_LIMIT = 15;

export const GUEST_LIST_SORTS = ["updated_at", "name", "status", "last_stay"] as const;
export type GuestListSort = (typeof GUEST_LIST_SORTS)[number];

export const LAST_STAY_PRESETS = ["all", "never", "d30", "d90", "y1"] as const;
export type LastStayPreset = (typeof LAST_STAY_PRESETS)[number];

export const LAST_STAY_PRESET_LABELS: Record<LastStayPreset, string> = {
  all: "Any last stay",
  never: "Never stayed",
  d30: "Last 30 days",
  d90: "Last 90 days",
  y1: "Last 12 months",
};

export const GUEST_IMPORT_UNAVAILABLE =
  "Guest import is not available yet. Search existing profiles before creating a new one.";

export const CONTACT_PROFILE_UNAVAILABLE =
  "Contact profiles are not available yet. Emergency contacts stay on an individual guest.";

export const TOUR_OPERATOR_UNAVAILABLE =
  "Tour operator profiles are not available yet. Use Travel Agencies for booker travel-agent masters.";

export const DUPLICATE_PREVENTION_TIP =
  "Check existing guests before creating a new profile to avoid duplicates. Search by name, phone, email, passport or profile number first. Create still warns on matching email or phone.";

export const AGENCIES_STAT_COPY =
  "Travel agent masters only. Tour operators are not a separate profile type yet.";

export const CONTACTS_STAT_COPY = "Contact profiles are not tracked yet.";

export const REQUIRED_FIELDS_CANONICAL_NOTE =
  "Long-term required fields live on Card 4 pms_guest_fields. Runtime create/update still uses SET3 pms_guest_profile_rules until the registration phase.";

export const IDENTITY_CANONICAL_NOTE =
  "Document types stay on pms_guest_id_types. Files stay on guest_documents. Listing searches stored id_document_number only.";

export const PREFERENCE_CANONICAL_NOTE =
  "Operational preferences stay on guest_preferences and pms_preference_options. Card 4 preference catalogues are setup-only this phase.";

export const COMPANY_BUSINESS_CANONICAL_NOTE =
  "Company masters stay on guest_account_masters. Card 4 business profile types control Company Type and registration rules.";

export const PROFILE_TYPE_CREATE_BLOCKED =
  "This profile type is inactive in Guest Profile Rules. Existing records stay available. New records cannot be created.";

export const PROFILE_TYPE_INACTIVE_SECTION_COPY =
  "This profile type is inactive in Guest Profile Rules. Existing records remain accessible. New records cannot be created.";

export type ListingTypeConfigRow = {
  section: GuestListingSectionId | null;
  active: boolean;
};

export type ListingTypeConfigSnapshot = {
  available: boolean;
  types: ListingTypeConfigRow[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_FIRST_SEGMENT = /^[0-9a-f]{8}$/i;

export function isGuestListingPlaceholder(id: string): id is GuestListingPlaceholderId {
  return (GUEST_LISTING_PLACEHOLDERS as readonly string[]).includes(id);
}

export function isGuestListingSectionId(id: string): id is GuestListingSectionId {
  return GUEST_LISTING_SECTIONS.some((section) => section.id === id);
}

export function isLiveListingSection(id: GuestListingSectionId): boolean {
  return GUEST_LISTING_SECTIONS.some((section) => section.id === id && section.live);
}

export function listingSectionFromCard4Code(code: string): GuestListingSectionId | null {
  const normalized = code.trim().toUpperCase();
  if (normalized === "ORG") return null;
  return CARD4_CODE_TO_SECTION[normalized] ?? null;
}

export function listingNavSections(): typeof GUEST_LISTING_SECTIONS {
  return GUEST_LISTING_SECTIONS;
}

export function guestListingSection(
  type: GuestProfileTypeId | GuestListingPlaceholderId | undefined,
): GuestListingSectionId {
  if (type && isGuestListingSectionId(type)) return type;
  return "individual";
}

export function operationalProfileType(
  section: GuestListingSectionId,
): GuestProfileTypeId {
  if (section === "tour-operator" || section === "contact") return "individual";
  return section;
}

export function sectionToAccountType(section: GuestListingSectionId): GuestAccountType | null {
  if (section === "company") return "company";
  if (section === "group") return "group";
  if (section === "travel-agent") return "travel_agent";
  return null;
}

export function accountTypeToListingSection(accountType: GuestAccountType): GuestListingSectionId {
  if (accountType === "company") return "company";
  if (accountType === "group") return "group";
  return "travel-agent";
}

/**
 * Card 4 Active controls new-record create. Missing catalogue/rows degrade to
 * operational defaults so hotels are not stranded. Placeholders never create.
 * Inactive never hides existing records.
 */
export function listingCreateAllowed(
  section: GuestListingSectionId,
  config: ListingTypeConfigSnapshot | null | undefined,
): boolean {
  if (section === "tour-operator" || section === "contact") return false;
  if (!config?.available) return true;
  const rows = config.types.filter((row) => row.section === section);
  if (rows.length === 0) return true;
  return rows.some((row) => row.active);
}

export function listingTypeInactive(
  section: GuestListingSectionId,
  config: ListingTypeConfigSnapshot | null | undefined,
): boolean {
  if (!config?.available) return false;
  const rows = config.types.filter((row) => row.section === section);
  return rows.length > 0 && rows.every((row) => !row.active);
}

export function displayProfileNumber(id: string, code?: string | null): string {
  const trimmed = (code ?? "").trim();
  if (trimmed) return trimmed.toUpperCase();
  const compact = id.replace(/-/g, "");
  if (compact.length >= 8) return compact.slice(0, 8).toUpperCase();
  return id.slice(0, 8).toUpperCase();
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function uuidFirstSegment(value: string): string | null {
  const trimmed = value.trim();
  if (UUID_RE.test(trimmed)) return trimmed.slice(0, 8).toLowerCase();
  if (UUID_FIRST_SEGMENT.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function isGuestListSort(value: string): value is GuestListSort {
  return (GUEST_LIST_SORTS as readonly string[]).includes(value);
}

export function isLastStayPreset(value: string): value is LastStayPreset {
  return (LAST_STAY_PRESETS as readonly string[]).includes(value);
}

export function lastStayWindowStart(preset: LastStayPreset, todayIso: string): string | null {
  if (preset === "all" || preset === "never") return null;
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  if (Number.isNaN(today.getTime())) return null;
  const days = preset === "d30" ? 30 : preset === "d90" ? 90 : 365;
  today.setUTCDate(today.getUTCDate() - days);
  return today.toISOString().slice(0, 10);
}

export function chipForSection(section: GuestListingSectionId): GuestListingChipId {
  if (section === "individual") return "individual";
  return "all";
}

export function invalidateGuestWorkspaceQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: unknown[] }) => unknown },
  restaurantId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["guests", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-accounts", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-workspace-stats", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-workspace-activity", restaurantId] });
  void queryClient.invalidateQueries({ queryKey: ["guest-directory-stats", restaurantId] });
}
