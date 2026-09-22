import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GUEST_IMAGE_EXT_BY_TYPE,
  GUEST_STATUSES,
  blankToNull,
  canManageGuests,
  diffFields,
  guestDocumentPath,
  guestPhotoPath,
  normalizeEmail,
  normalizePhone,
  recordGuestEvent,
  requireGuestManager,
  canManageGuestPrivacy,
  type GuestEventType,
  type GuestStatus,
} from "./guests.server";
import { WAVE5_ANONYMISED_GUEST_LABEL, type GuestMergeLedgerPayload } from "./guest-profile-wave5";
import { callerMembership } from "@/core/lib/workforce.server";
import { guestCreateBlocked } from "./pms-set3-rates-guest";
import { loadGuestProfileRules } from "./pms-set3-rates-guest.functions";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  kindFromTypeCode,
  maskedDocumentNumber,
  typeAllowedForNewDocument,
} from "./guest-identity-documents";
import { ROOM_BUCKET, signRoomImages } from "./rooms.server";
import {
  GUEST_CONSENT_STATES,
  GUEST_DOCUMENT_KIND_LABELS,
  GUEST_DOCUMENT_KINDS,
  WAVE2_MIGRATION_UNAVAILABLE,
  emptyConsent,
  type GuestConsentState,
  type GuestDocumentKind,
  type GuestDocumentStatus,
  type PreferenceOptionCategory,
} from "./guest-profile-wave2";
import {
  WAVE3_RESERVATION_RLS_BLOCKED,
  deriveStayOverview,
  isReservationRlsBlocked,
  mapReservationToStay,
  type GuestStay,
  type GuestStayAccess,
  type GuestStayOverview,
} from "./guest-profile-wave3";
import {
  bookingTimelineLabel,
  type GuestBookingHistoryEvent,
} from "./guest-bookings-workspace";
import {
  PREFERRED_CONTACT_METHODS,
  PREFERRED_CONTACT_TIMES,
  WAVE2_TO_CARD4_PREF_CODE,
  formatPreferenceStoredValue,
  isPreferredContactMethod,
  isPreferredContactTime,
  type OverviewPreferenceChip,
} from "./guest-profile-overview";
import {
  PREFERENCE_TEXT_MAX,
  normalizePreferenceAnswers,
  reservationDefaultsFromWorkspace,
  validatePreferenceAnswer,
  type ContactDefaultsDraft,
} from "./guest-preferences-workspace";
import {
  GUEST_SERVICE_DESCRIPTION_MAX,
  GUEST_SERVICE_PRIORITIES,
  GUEST_SERVICE_STATUSES,
  canTransitionGuestService,
  isGuestServiceStatus,
  type GuestServicePriority,
  type GuestServiceStatus,
} from "./guest-services-workspace";
import {
  isPreferenceValueType,
  normalizePreferenceOptions,
  type PreferenceCategoryRecord,
  type PreferenceTypeRecord,
  type PreferenceValueType,
} from "./preferences-card4.server";
import { canManageReservations, propertyToday } from "./reservations.server";
import type { ReservationStatus } from "./reservation-dates";
import {
  GUEST_GENDERS,
  GUEST_TITLES,
  INDIVIDUAL_ENRICHMENT_UNAVAILABLE,
  RESTRICTION_SEVERITIES,
  validateEmergencyContacts,
  validateLiftReason,
  validateRestrictionReason,
  type GuestGender,
  type GuestTitle,
  type RestrictionSeverity,
} from "./guest-profile-individual";
import {
  LISTING_ACTIVITY_LIMIT,
  isGuestListSort,
  isLastStayPreset,
  isUuid,
  lastStayWindowStart,
  uuidFirstSegment,
  type GuestListSort,
  type LastStayPreset,
} from "./guest-profile-listing";

const idSchema = z.string().uuid();

function fromTable(client: { from: (table: string) => unknown }, table: string) {
  return (client as unknown as { from: (name: string) => any }).from(table);
}

export interface GuestConsentRecord {
  state: GuestConsentState;
  recordedAt: string | null;
  recordedByName: string | null;
}

export interface GuestConsent {
  dataProcessing: GuestConsentRecord;
  marketing: GuestConsentRecord;
  available: boolean;
  defaults: { dataProcessing: boolean; marketing: boolean } | null;
}

export interface GuestEmergencyContact {
  id: string;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  sortOrder: number;
}

export interface GuestSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  vipStatus: boolean;
  guestStatus: GuestStatus;
  updatedAt: string;
  idDocumentNumber: string | null;
  mergedIntoGuestId: string | null;
  anonymisedAt: string | null;
  restricted: boolean;
  blacklisted: boolean;
  lastStayAt: string | null;
  profileNumber: string | null;
}

export interface GuestListPage {
  items: GuestSummary[];
  total: number;
  offset: number;
  limit: number;
  lastStayAvailable: boolean;
}

export function guestListItems(
  data: GuestListPage | GuestSummary[] | null | undefined,
): GuestSummary[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.items;
}

export interface GuestDirectoryStats {
  totalGuests: number;
  activeGuests: number;
  vipGuests: number;
  returningGuests: number;
  inHouseGuests: number;
}

export interface GuestProfile extends GuestSummary {
  language: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  notes: string | null;
  linkedCustomerUserId: string | null;
  createdAt: string;
  idDocumentType: "passport" | "national_id" | "driving_licence" | "other" | null;
  idDocumentExpiry: string | null;
  consent: GuestConsent;
  title: GuestTitle | null;
  middleName: string | null;
  preferredName: string | null;
  gender: GuestGender | null;
  phoneAlt: string | null;
  emailAlt: string | null;
  position: string | null;
  department: string | null;
  sourceOfBusiness: string | null;
  restrictionSeverity: RestrictionSeverity | null;
  restrictionReason: string | null;
  restrictionSetAt: string | null;
  restrictionSetByName: string | null;
  restrictionUntil: string | null;
  emergencyContacts: GuestEmergencyContact[];
  emergencyContactsAvailable: boolean;
  profileType: GuestProfileTypeRef | null;
  photoUrl: string | null;
  photoStoragePath: string | null;
  preferredContactMethod: string | null;
  preferredContactTime: string | null;
  geoLatitude: number | null;
  geoLongitude: number | null;
}

export type GuestProfileTypeRef = {
  id: string;
  code: string;
  name: string;
  active: boolean;
};

export interface GuestPreferences {
  roomPreference: string | null;
  bedPreference: string | null;
  floorPreference: string | null;
  viewPreference: string | null;
  foodPreference: string | null;
  communicationPreference: string | null;
  accessibilityRequirements: string | null;
  specialRequests: string | null;
}

type JsonValue = string | number | boolean | null;

export interface GuestHistoryEntry {
  id: string;
  eventType: GuestEventType;
  previousValues: Record<string, JsonValue> | null;
  newValues: Record<string, JsonValue> | null;
  notes: string | null;
  actorName: string | null;
  createdAt: string;
}

const EMPTY_PREFERENCES: GuestPreferences = {
  roomPreference: null,
  bedPreference: null,
  floorPreference: null,
  viewPreference: null,
  foodPreference: null,
  communicationPreference: null,
  accessibilityRequirements: null,
  specialRequests: null,
};

async function allocateGuestIdentity(restaurantId: string): Promise<{
  profileNumber: string | null;
  profileTypeId: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let profileNumber: string | null = null;
  let profileTypeId: string | null = null;
  const numbered = await supabaseAdmin.rpc("next_guest_profile_number", {
    _restaurant_id: restaurantId,
  });
  if (!numbered.error && typeof numbered.data === "string") profileNumber = numbered.data;
  const typeRow = await supabaseAdmin
    .from("pms_guest_profile_types")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("code", "IND")
    .maybeSingle();
  if (!typeRow.error) profileTypeId = (typeRow.data as { id?: string } | null)?.id ?? null;
  return { profileNumber, profileTypeId };
}

async function loadGuestProfileTypeRef(
  restaurantId: string,
  typeId: string | null | undefined,
): Promise<GuestProfileTypeRef | null> {
  if (!typeId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin
    .from("pms_guest_profile_types")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .eq("id", typeId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as { id: string; code: string; name: string; active: boolean };
  return { id: row.id, code: row.code, name: row.name, active: row.active };
}

async function syncWave2PreferencesToCard4(
  restaurantId: string,
  guestId: string,
  preferences: GuestPreferences,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const types = await supabaseAdmin
    .from("pms_guest_preference_types")
    .select("id, code, options")
    .eq("restaurant_id", restaurantId);
  if (types.error) return;
  const byCode = new Map(
    ((types.data ?? []) as Array<{ id: string; code: string; options: unknown }>).map((row) => [
      row.code,
      row,
    ]),
  );
  for (const [key, code] of Object.entries(WAVE2_TO_CARD4_PREF_CODE) as Array<
    [keyof GuestPreferences, string | null]
  >) {
    if (!code) continue;
    const type = byCode.get(code);
    if (!type) continue;
    const stored = preferences[key];
    const text = formatPreferenceStoredValue(
      stored,
      Array.isArray(type.options)
        ? (type.options as Array<{ id?: string; label?: string; value?: string }>).map((option) => ({
            id: String(option.id ?? option.value ?? ""),
            label: String(option.label ?? option.value ?? ""),
          }))
        : [],
    );
    const payload = {
      restaurant_id: restaurantId,
      guest_id: guestId,
      preference_type_id: type.id,
      value_json: text ? [text] : [],
    };
    await supabaseAdmin.from("guest_preference_values").upsert(payload as never, {
      onConflict: "guest_id,preference_type_id",
    });
  }
}

const GUEST_COLUMNS_BASE =
  "id, first_name, last_name, phone, email, nationality, language, date_of_birth, address_line1, address_line2, city, region, country, postal_code, id_document_type, id_document_number, id_document_expiry, guest_status, vip_status, notes, linked_customer_user_id, created_at, updated_at";
const GUEST_COLUMNS_W2 = `${GUEST_COLUMNS_BASE}, merged_into_guest_id, data_processing_consent, data_processing_consent_recorded_at, data_processing_consent_recorded_by, marketing_consent, marketing_consent_recorded_at, marketing_consent_recorded_by`;
const GUEST_COLUMNS_W5 = `${GUEST_COLUMNS_W2}, anonymised_at, anonymised_by_membership_id`;
const GUEST_COLUMNS_GE2 = `${GUEST_COLUMNS_W5}, title, middle_name, preferred_name, gender, phone_alt, email_alt, employment_position, department, source_of_business, restricted, blacklisted, restriction_severity, restriction_reason, restriction_set_by_membership_id, restriction_set_at, restriction_until`;
const GUEST_COLUMNS_OVERVIEW = `${GUEST_COLUMNS_GE2}, profile_number, profile_type_id, photo_storage_path, preferred_contact_method, preferred_contact_time, geo_latitude, geo_longitude`;

type GuestRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  language?: string | null;
  date_of_birth?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
  id_document_type?: string | null;
  id_document_number?: string | null;
  id_document_expiry?: string | null;
  guest_status: string;
  vip_status: boolean;
  notes?: string | null;
  linked_customer_user_id?: string | null;
  created_at?: string;
  updated_at: string;
  merged_into_guest_id?: string | null;
  data_processing_consent?: string | null;
  data_processing_consent_recorded_at?: string | null;
  data_processing_consent_recorded_by?: string | null;
  marketing_consent?: string | null;
  marketing_consent_recorded_at?: string | null;
  marketing_consent_recorded_by?: string | null;
  anonymised_at?: string | null;
  anonymised_by_membership_id?: string | null;
  title?: string | null;
  middle_name?: string | null;
  preferred_name?: string | null;
  gender?: string | null;
  phone_alt?: string | null;
  email_alt?: string | null;
  employment_position?: string | null;
  department?: string | null;
  source_of_business?: string | null;
  restricted?: boolean | null;
  blacklisted?: boolean | null;
  restriction_severity?: string | null;
  restriction_reason?: string | null;
  restriction_set_by_membership_id?: string | null;
  restriction_set_at?: string | null;
  restriction_until?: string | null;
  profile_number?: string | null;
  profile_type_id?: string | null;
  photo_storage_path?: string | null;
  preferred_contact_method?: string | null;
  preferred_contact_time?: string | null;
  geo_latitude?: number | string | null;
  geo_longitude?: number | string | null;
};

function toConsentState(value: string | null | undefined): GuestConsentState {
  return (GUEST_CONSENT_STATES as readonly string[]).includes(value ?? "")
    ? (value as GuestConsentState)
    : "not_asked";
}

function fullName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function toSummary(row: GuestRow): GuestSummary {
  const anonymisedAt = row.anonymised_at ?? null;
  return {
    id: row.id,
    firstName: anonymisedAt ? WAVE5_ANONYMISED_GUEST_LABEL : row.first_name,
    lastName: anonymisedAt ? null : row.last_name,
    fullName: anonymisedAt ? WAVE5_ANONYMISED_GUEST_LABEL : fullName(row.first_name, row.last_name),
    phone: anonymisedAt ? null : row.phone,
    email: anonymisedAt ? null : row.email,
    nationality: anonymisedAt ? null : row.nationality,
    vipStatus: row.vip_status,
    guestStatus: row.guest_status as GuestStatus,
    updatedAt: row.updated_at,
    idDocumentNumber: anonymisedAt ? null : (row.id_document_number ?? null),
    mergedIntoGuestId: row.merged_into_guest_id ?? null,
    anonymisedAt,
    restricted: row.restricted ?? false,
    blacklisted: row.blacklisted ?? false,
    lastStayAt: null,
    profileNumber: anonymisedAt ? null : (row.profile_number ?? null),
  };
}

function emptyGuestConsent(available: boolean): GuestConsent {
  return {
    dataProcessing: emptyConsent(),
    marketing: emptyConsent(),
    available,
    defaults: null,
  };
}

function toProfile(
  row: GuestRow,
  consent: GuestConsent,
  extras?: {
    restrictionSetByName?: string | null;
    emergencyContacts?: GuestEmergencyContact[];
    emergencyContactsAvailable?: boolean;
    profileType?: GuestProfileTypeRef | null;
    photoUrl?: string | null;
  },
): GuestProfile {
  const anonymised = Boolean(row.anonymised_at);
  return {
    ...toSummary(row),
    language: anonymised ? null : (row.language ?? null),
    dateOfBirth: anonymised ? null : (row.date_of_birth ?? null),
    addressLine1: anonymised ? null : (row.address_line1 ?? null),
    addressLine2: anonymised ? null : (row.address_line2 ?? null),
    city: anonymised ? null : (row.city ?? null),
    region: anonymised ? null : (row.region ?? null),
    country: anonymised ? null : (row.country ?? null),
    postalCode: anonymised ? null : (row.postal_code ?? null),
    notes: anonymised ? null : (row.notes ?? null),
    linkedCustomerUserId: row.linked_customer_user_id ?? null,
    createdAt: row.created_at ?? row.updated_at,
    idDocumentType: anonymised
      ? null
      : ((row.id_document_type as GuestProfile["idDocumentType"]) ?? null),
    idDocumentExpiry: anonymised ? null : (row.id_document_expiry ?? null),
    consent,
    title: anonymised ? null : ((row.title as GuestTitle | null) ?? null),
    middleName: anonymised ? null : (row.middle_name ?? null),
    preferredName: anonymised ? null : (row.preferred_name ?? null),
    gender: anonymised ? null : ((row.gender as GuestGender | null) ?? null),
    phoneAlt: anonymised ? null : (row.phone_alt ?? null),
    emailAlt: anonymised ? null : (row.email_alt ?? null),
    position: anonymised ? null : (row.employment_position ?? null),
    department: anonymised ? null : (row.department ?? null),
    sourceOfBusiness: anonymised ? null : (row.source_of_business ?? null),
    restrictionSeverity: (row.restriction_severity as RestrictionSeverity | null) ?? null,
    restrictionReason: row.restriction_reason ?? null,
    restrictionSetAt: row.restriction_set_at ?? null,
    restrictionSetByName: extras?.restrictionSetByName ?? null,
    restrictionUntil: row.restriction_until ?? null,
    emergencyContacts: extras?.emergencyContacts ?? [],
    emergencyContactsAvailable: extras?.emergencyContactsAvailable ?? false,
    profileType: extras?.profileType ?? null,
    photoUrl: extras?.photoUrl ?? null,
    photoStoragePath: anonymised ? null : (row.photo_storage_path ?? null),
    preferredContactMethod: anonymised ? null : (row.preferred_contact_method ?? null),
    preferredContactTime: anonymised ? null : (row.preferred_contact_time ?? null),
    geoLatitude: anonymised || row.geo_latitude == null ? null : Number(row.geo_latitude),
    geoLongitude: anonymised || row.geo_longitude == null ? null : Number(row.geo_longitude),
  };
}

async function resolveActorNames(
  restaurantId: string,
  membershipIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const actorNames = new Map<string, string>();
  const actorIds = Array.from(new Set(membershipIds.filter(Boolean) as string[]));
  if (actorIds.length === 0) return actorNames;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: members } = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", actorIds);
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds)
    : {
        data: [] as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }[],
      };
  const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
  for (const m of members ?? []) {
    const p = byUser.get(m.user_id);
    const name = p ? fullName(p.first_name ?? "", p.last_name ?? null) || (p.email ?? "") : "";
    actorNames.set(m.id, name || "Staff member");
  }
  return actorNames;
}

function consentFromRow(
  row: GuestRow,
  actorNames: Map<string, string>,
  available: boolean,
  defaults: GuestConsent["defaults"],
): GuestConsent {
  return {
    dataProcessing: {
      state: toConsentState(row.data_processing_consent),
      recordedAt: row.data_processing_consent_recorded_at ?? null,
      recordedByName: row.data_processing_consent_recorded_by
        ? (actorNames.get(row.data_processing_consent_recorded_by) ?? "Staff member")
        : null,
    },
    marketing: {
      state: toConsentState(row.marketing_consent),
      recordedAt: row.marketing_consent_recorded_at ?? null,
      recordedByName: row.marketing_consent_recorded_by
        ? (actorNames.get(row.marketing_consent_recorded_by) ?? "Staff member")
        : null,
    },
    available,
    defaults,
  };
}

const emergencyContactInputSchema = z.object({
  name: z.string().max(160).optional().nullable(),
  relationship: z.string().max(120).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
});

const guestInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(120),
  lastName: z.string().max(120).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  nationality: z.string().max(120).optional().nullable(),
  language: z.string().max(120).optional().nullable(),
  dateOfBirth: z.string().max(20).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  idDocumentType: z
    .enum(["passport", "national_id", "driving_licence", "other"])
    .optional()
    .nullable(),
  idDocumentNumber: z.string().max(80).optional().nullable(),
  idDocumentExpiry: z.string().max(20).optional().nullable(),
  vipStatus: z.boolean().optional(),
  notes: z.string().max(4000).optional().nullable(),
  title: z.enum(GUEST_TITLES).optional().nullable(),
  middleName: z.string().max(120).optional().nullable(),
  preferredName: z.string().max(120).optional().nullable(),
  gender: z.enum(GUEST_GENDERS).optional().nullable(),
  phoneAlt: z.string().max(60).optional().nullable(),
  emailAlt: z.string().max(200).optional().nullable(),
  preferredContactMethod: z.enum(PREFERRED_CONTACT_METHODS).optional().nullable(),
  preferredContactTime: z.enum(PREFERRED_CONTACT_TIMES).optional().nullable(),
  position: z.string().max(160).optional().nullable(),
  department: z.string().max(160).optional().nullable(),
  sourceOfBusiness: z.string().max(200).optional().nullable(),
  guestStatus: z.enum(GUEST_STATUSES).optional(),
  restricted: z.boolean().optional(),
  blacklisted: z.boolean().optional(),
  restrictionSeverity: z.enum(RESTRICTION_SEVERITIES).optional().nullable(),
  restrictionReason: z.string().max(2000).optional().nullable(),
  restrictionUntil: z.string().max(20).optional().nullable(),
  emergencyContacts: z.array(emergencyContactInputSchema).max(20).optional(),
});

type GuestInput = z.infer<typeof guestInputSchema>;

function assertEmail(value: string | null, label = "email"): string | null {
  if (value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new Error(`Enter a valid ${label} address.`);
  }
  return value;
}

function toColumns(input: GuestInput) {
  const email = assertEmail(blankToNull(input.email));
  const emailAlt = assertEmail(blankToNull(input.emailAlt), "alternate email");
  const restricted = input.restricted ?? false;
  const blacklisted = input.blacklisted ?? false;
  const reasonError = validateRestrictionReason(restricted, blacklisted, input.restrictionReason);
  if (reasonError) throw new Error(reasonError);
  return {
    first_name: input.firstName.trim(),
    last_name: blankToNull(input.lastName),
    phone: blankToNull(input.phone),
    email,
    nationality: blankToNull(input.nationality),
    language: blankToNull(input.language),
    date_of_birth: blankToNull(input.dateOfBirth),
    address_line1: blankToNull(input.addressLine1),
    address_line2: blankToNull(input.addressLine2),
    city: blankToNull(input.city),
    region: blankToNull(input.region),
    country: blankToNull(input.country),
    postal_code: blankToNull(input.postalCode),
    vip_status: input.vipStatus ?? false,
    notes: blankToNull(input.notes),
    ...(input.idDocumentType !== undefined
      ? { id_document_type: blankToNull(input.idDocumentType) }
      : {}),
    ...(input.idDocumentNumber !== undefined
      ? { id_document_number: blankToNull(input.idDocumentNumber) }
      : {}),
    ...(input.idDocumentExpiry !== undefined
      ? { id_document_expiry: blankToNull(input.idDocumentExpiry) }
      : {}),
    title: blankToNull(input.title),
    middle_name: blankToNull(input.middleName),
    preferred_name: blankToNull(input.preferredName),
    gender: blankToNull(input.gender),
    phone_alt: blankToNull(input.phoneAlt),
    email_alt: emailAlt,
    preferred_contact_method: blankToNull(input.preferredContactMethod),
    preferred_contact_time: blankToNull(input.preferredContactTime),
    employment_position: blankToNull(input.position),
    department: blankToNull(input.department),
    source_of_business: blankToNull(input.sourceOfBusiness),
    ...(input.guestStatus ? { guest_status: input.guestStatus } : {}),
    restricted,
    blacklisted,
    restriction_severity: restricted || blacklisted ? blankToNull(input.restrictionSeverity) : null,
    restriction_reason: restricted || blacklisted ? blankToNull(input.restrictionReason) : null,
    restriction_until: restricted || blacklisted ? blankToNull(input.restrictionUntil) : null,
  };
}

const TRACKED_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "nationality",
  "language",
  "date_of_birth",
  "address_line1",
  "address_line2",
  "city",
  "region",
  "country",
  "postal_code",
  "id_document_type",
  "id_document_number",
  "id_document_expiry",
  "notes",
  "title",
  "middle_name",
  "preferred_name",
  "gender",
  "phone_alt",
  "email_alt",
  "preferred_contact_method",
  "preferred_contact_time",
  "employment_position",
  "department",
  "source_of_business",
] as const;

const RESTRICTION_FIELDS = [
  "restricted",
  "blacklisted",
  "restriction_severity",
  "restriction_reason",
  "restriction_until",
] as const;

type EmergencyContactInput = z.infer<typeof emergencyContactInputSchema>;

function namedEmergencyContacts(contacts: EmergencyContactInput[] | undefined) {
  return (contacts ?? [])
    .map((contact, index) => ({
      name: (contact.name ?? "").trim(),
      relationship: blankToNull(contact.relationship),
      phone: blankToNull(contact.phone),
      email: assertEmail(blankToNull(contact.email), "emergency contact email"),
      sort_order: index,
    }))
    .filter((contact) => contact.name !== "");
}

async function replaceEmergencyContacts(
  client: { from: (table: string) => unknown },
  restaurantId: string,
  guestId: string,
  contacts: EmergencyContactInput[] | undefined,
): Promise<void> {
  const named = namedEmergencyContacts(contacts);
  const invalid = validateEmergencyContacts(contacts ?? []);
  if (invalid) throw new Error(invalid);
  const table = fromTable(client, "guest_emergency_contacts");
  const deleted = await table.delete().eq("restaurant_id", restaurantId).eq("guest_id", guestId);
  if (deleted.error && isMissingSchemaError(deleted.error)) {
    throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
  }
  if (deleted.error) throw new Error(deleted.error.message);
  const inserted = await fromTable(client, "guest_emergency_contacts").insert(
    named.map((contact) => ({
      restaurant_id: restaurantId,
      guest_id: guestId,
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email,
      sort_order: contact.sort_order,
    })),
  );
  if (inserted.error && isMissingSchemaError(inserted.error)) {
    throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
  }
  if (inserted.error) throw new Error(inserted.error.message);
}

async function loadEmergencyContacts(
  client: { from: (table: string) => unknown },
  restaurantId: string,
  guestId: string,
): Promise<{ contacts: GuestEmergencyContact[]; available: boolean }> {
  const result = await fromTable(client, "guest_emergency_contacts")
    .select("id, name, relationship, phone, email, sort_order")
    .eq("restaurant_id", restaurantId)
    .eq("guest_id", guestId)
    .order("sort_order", { ascending: true });
  if (result.error && isMissingSchemaError(result.error)) {
    return { contacts: [], available: false };
  }
  if (result.error) throw new Error(result.error.message);
  return {
    available: true,
    contacts: (
      (result.data ?? []) as Array<{
        id: string;
        name: string;
        relationship: string | null;
        phone: string | null;
        email: string | null;
        sort_order: number;
      }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      relationship: row.relationship,
      phone: row.phone,
      email: row.email,
      sortOrder: row.sort_order,
    })),
  };
}

function restrictionSnapshot(row: Pick<GuestRow, "restricted" | "blacklisted">) {
  return {
    restricted: row.restricted ?? false,
    blacklisted: row.blacklisted ?? false,
  };
}

async function recordRestrictionChange(entry: {
  restaurantId: string;
  guestId: string;
  actorMembershipId: string;
  before: { restricted: boolean; blacklisted: boolean };
  after: { restricted: boolean; blacklisted: boolean };
  reason: string | null;
  lifted?: boolean;
}): Promise<void> {
  const beforeOn = entry.before.restricted || entry.before.blacklisted;
  const afterOn = entry.after.restricted || entry.after.blacklisted;
  if (beforeOn === afterOn && !entry.lifted) return;
  const eventType = entry.lifted
    ? "restriction_lifted"
    : afterOn
      ? "restriction_set"
      : "restriction_cleared";
  await recordGuestEvent({
    restaurantId: entry.restaurantId,
    guestId: entry.guestId,
    eventType,
    previousValues: entry.before,
    newValues: entry.after,
    notes: entry.reason,
    actorMembershipId: entry.actorMembershipId,
  });
}

/* --------------------------------------------------------------- access */

/** Guest Management is owner/manager only; the flag drives nav + UI affordances. */
export const getGuestsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return {
      role: me.role,
      canManage: canManageGuests(me.role),
      canPrivacy: canManageGuestPrivacy(me.role),
    };
  });

/* ----------------------------------------------------------------- list */

function guestSearchOrFilter(
  term: string,
  includeIdDocument: boolean,
  includeProfileNumber = false,
): string | null {
  const trimmed = term.trim();
  if (!trimmed) return null;
  const like = `%${trimmed.replace(/[%,]/g, "")}%`;
  const digits = normalizePhone(trimmed);
  const parts = [
    `first_name.ilike.${like}`,
    `last_name.ilike.${like}`,
    `email.ilike.${like}`,
    `phone.ilike.${like}`,
  ];
  if (includeIdDocument) parts.push(`id_document_number.ilike.${like}`);
  if (includeProfileNumber) parts.push(`profile_number.ilike.${like}`);
  if (digits) parts.push(`phone_normalized.ilike.%${digits}%`);
  if (isUuid(trimmed)) parts.push(`id.eq.${trimmed}`);
  const segment = uuidFirstSegment(trimmed);
  if (segment && !isUuid(trimmed)) {
    parts.push(
      `and(id.gte.${segment}-0000-0000-0000-000000000000,id.lte.${segment}-ffff-ffff-ffff-ffffffffffff)`,
    );
  }
  return parts.join(",");
}

async function loadLastStayMap(
  supabase: { from: (table: string) => any },
  restaurantId: string,
  guestIds?: string[],
): Promise<{ map: Map<string, string>; available: boolean }> {
  const map = new Map<string, string>();
  if (guestIds && guestIds.length === 0) return { map, available: true };
  const pageSize = 1_000;
  const chunks: Array<string[] | null> =
    guestIds && guestIds.length > 100
      ? guestIds.reduce<string[][]>((acc, id, index) => {
          const bucket = Math.floor(index / 100);
          acc[bucket] = acc[bucket] ?? [];
          acc[bucket]!.push(id);
          return acc;
        }, [])
      : [guestIds ?? null];

  for (const chunk of chunks) {
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from("hotel_reservations")
        .select("guest_id, departure_date, arrival_date")
        .eq("restaurant_id", restaurantId)
        .range(from, from + pageSize - 1);
      if (chunk) query = query.in("guest_id", chunk);
      const result = await query;
      if (result.error && isReservationRlsBlocked(result.error)) {
        return { map: new Map(), available: false };
      }
      if (result.error) throw new Error(result.error.message);
      const page = (result.data ?? []) as Array<{
        guest_id: string | null;
        departure_date: string | null;
        arrival_date: string | null;
      }>;
      for (const stay of page) {
        if (!stay.guest_id) continue;
        const date = stay.departure_date || stay.arrival_date;
        if (!date) continue;
        const previous = map.get(stay.guest_id);
        if (!previous || date > previous) map.set(stay.guest_id, date);
      }
      if (page.length < pageSize) break;
    }
  }
  return { map, available: true };
}

export const listGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().max(120).optional(),
        status: z.enum(GUEST_STATUSES).optional(),
        vipOnly: z.boolean().optional(),
        nationality: z.string().max(120).optional(),
        lastStay: z.string().max(12).optional(),
        sort: z.string().max(24).optional(),
        offset: z.number().int().min(0).max(20_000).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        asOf: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestListPage> => {
    await requireGuestManager(context as never, data.restaurantId);
    const offset = data.offset ?? 0;
    const limit = data.limit ?? 100;
    const sort: GuestListSort = data.sort && isGuestListSort(data.sort) ? data.sort : "updated_at";
    const lastStay: LastStayPreset =
      data.lastStay && isLastStayPreset(data.lastStay) ? data.lastStay : "all";
    const today = (data.asOf ?? new Date().toISOString()).slice(0, 10);
    const windowStart = lastStayWindowStart(lastStay, today);

    const needsStayMap = lastStay !== "all" || sort === "last_stay";
    let stayMap = new Map<string, string>();
    let lastStayAvailable = true;
    if (needsStayMap) {
      const loaded = await loadLastStayMap(context.supabase, data.restaurantId);
      stayMap = loaded.map;
      lastStayAvailable = loaded.available;
    }

    const applyFilters = (
      columns: string,
      excludeMerged: boolean,
      includeIdDocument: boolean,
      includeProfileNumber = false,
    ) => {
      let query = context.supabase
        .from("guest_profiles")
        .select(columns, { count: "exact" })
        .eq("restaurant_id", data.restaurantId);
      if (excludeMerged) query = query.is("merged_into_guest_id", null);
      if (data.status) query = query.eq("guest_status", data.status);
      if (data.vipOnly) query = query.eq("vip_status", true);
      const nationality = (data.nationality ?? "").trim();
      if (nationality && nationality !== "all") {
        query = query.ilike("nationality", nationality);
      }
      const searchOr = guestSearchOrFilter(
        (data.search ?? "").trim(),
        includeIdDocument,
        includeProfileNumber,
      );
      if (searchOr) query = query.or(searchOr);
      if (lastStayAvailable && lastStay !== "all") {
        const stayedIds = [...stayMap.entries()]
          .filter(([, date]) => (windowStart ? date >= windowStart : true))
          .map(([id]) => id);
        if (lastStay === "never") {
          if (stayedIds.length > 0) query = query.not("id", "in", `(${stayedIds.join(",")})`);
        } else if (!windowStart || stayedIds.length === 0) {
          query = query.eq("id", "00000000-0000-0000-0000-000000000000");
        } else {
          query = query.in("id", stayedIds.slice(0, 200));
        }
      }
      if (sort === "name") {
        query = query
          .order("first_name", { ascending: true })
          .order("last_name", { ascending: true });
      } else if (sort === "status") {
        query = query
          .order("guest_status", { ascending: true })
          .order("updated_at", { ascending: false });
      } else {
        query = query.order("updated_at", { ascending: false });
      }
      if (sort !== "last_stay") query = query.range(offset, offset + limit - 1);
      else query = query.limit(2000);
      return query;
    };

    let result = await applyFilters(GUEST_COLUMNS_OVERVIEW, true, true, true);
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_GE2, true, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_W5, true, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_W5, true, false);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_W2, true, false);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_BASE, false, false);
    }
    if (result.error) throw new Error(result.error.message);

    let rows = ((result.data ?? []) as unknown as GuestRow[]).map(toSummary);
    const total = result.count ?? rows.length;

    if (sort === "last_stay" && lastStayAvailable) {
      rows = [...rows]
        .sort((a, b) => {
          const left = stayMap.get(a.id) ?? "";
          const right = stayMap.get(b.id) ?? "";
          if (left === right) return 0;
          return left < right ? 1 : -1;
        })
        .slice(offset, offset + limit);
    }

    if (!needsStayMap) {
      const loaded = await loadLastStayMap(
        context.supabase,
        data.restaurantId,
        rows.map((row) => row.id),
      );
      stayMap = loaded.map;
      lastStayAvailable = loaded.available;
    }

    return {
      items: rows.map((row) => ({
        ...row,
        lastStayAt: lastStayAvailable ? (stayMap.get(row.id) ?? null) : null,
      })),
      total,
      offset,
      limit,
      lastStayAvailable,
    };
  });

export const getGuestDirectoryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestDirectoryStats> => {
    await requireGuestManager(context as never, data.restaurantId);

    const pageSize = 1_000;
    const loadProfiles = async (excludeMerged: boolean) => {
      const rows: Array<{ id: string; guest_status: GuestStatus; vip_status: boolean }> = [];
      for (let from = 0; ; from += pageSize) {
        let query = context.supabase
          .from("guest_profiles")
          .select("id, guest_status, vip_status")
          .eq("restaurant_id", data.restaurantId)
          .range(from, from + pageSize - 1);
        if (excludeMerged) query = query.is("merged_into_guest_id", null);
        const result = await query;
        if (result.error) return { rows, error: result.error };
        const page = (result.data ?? []) as Array<{
          id: string;
          guest_status: GuestStatus;
          vip_status: boolean;
        }>;
        rows.push(...page);
        if (page.length < pageSize) return { rows, error: null };
      }
    };

    let profiles = await loadProfiles(true);
    if (profiles.error && isMissingSchemaError(profiles.error)) {
      profiles = await loadProfiles(false);
    }
    if (profiles.error) throw new Error(profiles.error.message);

    const profileIds = new Set(profiles.rows.map((profile) => profile.id));
    const completedByGuest = new Map<string, number>();
    const inHouseIds = new Set<string>();

    for (let from = 0; ; from += pageSize) {
      const result = await context.supabase
        .from("hotel_reservations")
        .select("guest_id, status")
        .eq("restaurant_id", data.restaurantId)
        .in("status", ["checked_out", "checked_in"])
        .range(from, from + pageSize - 1);
      if (result.error && isReservationRlsBlocked(result.error)) {
        throw new Error(WAVE3_RESERVATION_RLS_BLOCKED);
      }
      if (result.error) throw new Error(result.error.message);

      const page = (result.data ?? []) as Array<{
        guest_id: string | null;
        status: ReservationStatus;
      }>;
      for (const stay of page) {
        if (!stay.guest_id || !profileIds.has(stay.guest_id)) continue;
        if (stay.status === "checked_in") {
          inHouseIds.add(stay.guest_id);
        } else if (stay.status === "checked_out") {
          completedByGuest.set(stay.guest_id, (completedByGuest.get(stay.guest_id) ?? 0) + 1);
        }
      }
      if (page.length < pageSize) break;
    }

    return {
      totalGuests: profiles.rows.length,
      activeGuests: profiles.rows.filter((profile) => profile.guest_status === "active").length,
      vipGuests: profiles.rows.filter((profile) => profile.vip_status).length,
      returningGuests: [...completedByGuest.values()].filter((count) => count > 1).length,
      inHouseGuests: inHouseIds.size,
    };
  });

export interface GuestWorkspaceStats {
  totalProfiles: number;
  individuals: number;
  companies: number;
  travelAgents: number;
  groups: number;
  contacts: number | null;
  tourOperators: number | null;
}

async function countRows(
  supabase: { from: (table: string) => any },
  table: string,
  restaurantId: string,
  extra?: (query: any) => any,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  if (extra) query = extra(query);
  const result = await query;
  if (result.error && isMissingSchemaError(result.error)) return 0;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export const getGuestWorkspaceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestWorkspaceStats> => {
    await requireGuestManager(context as never, data.restaurantId);
    const individuals = await countRows(context.supabase, "guest_profiles", data.restaurantId, (query) =>
      query.is("merged_into_guest_id", null),
    );
    const companies = await countRows(
      context.supabase,
      "guest_account_masters",
      data.restaurantId,
      (query) => query.eq("account_type", "company"),
    );
    const travelAgents = await countRows(
      context.supabase,
      "guest_account_masters",
      data.restaurantId,
      (query) => query.eq("account_type", "travel_agent"),
    );
    const groups = await countRows(
      context.supabase,
      "guest_account_masters",
      data.restaurantId,
      (query) => query.eq("account_type", "group"),
    );
    return {
      individuals,
      companies,
      travelAgents,
      groups,
      totalProfiles: individuals + companies + travelAgents + groups,
      contacts: null,
      tourOperators: null,
    };
  });

export type GuestWorkspaceActivityKind =
  | GuestEventType
  | "account_created"
  | "account_updated"
  | "reservation_created";

export type GuestWorkspaceActivityItem = {
  id: string;
  kind: GuestWorkspaceActivityKind;
  label: string;
  partyName: string;
  createdAt: string;
};

const WORKSPACE_ACTIVITY_LABELS: Record<string, string> = {
  created: "Profile created",
  profile_updated: "Profile updated",
  vip_changed: "VIP changed",
  status_changed: "Status changed",
  preference_updated: "Preferences updated",
  service_request_created: "Service request created",
  service_request_updated: "Service request updated",
  note_added: "Note added",
  document_uploaded: "Document uploaded",
  document_verified: "Document staff-verified",
  document_rejected: "Document rejected",
  merged_from: "Merged from",
  merged_into: "Merged into",
  consent_updated: "Consent updated",
  relationship_linked: "Relationship linked",
  relationship_unlinked: "Relationship unlinked",
  comms_logged: "Communication recorded",
  comms_sent: "Email sent",
  exported: "Exported",
  anonymised: "Anonymised",
  unmerged: "Unmerged",
  unmerge_blocked: "Unmerge not available",
  restriction_set: "Restriction set",
  restriction_cleared: "Restriction cleared",
  restriction_lifted: "Restriction lifted",
  account_created: "Profile created",
  account_updated: "Profile updated",
  reservation_created: "Reservation created",
};

export const listGuestWorkspaceActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, limit: z.number().int().min(1).max(30).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestWorkspaceActivityItem[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    const limit = data.limit ?? LISTING_ACTIVITY_LIMIT;
    const items: GuestWorkspaceActivityItem[] = [];

    const history = await context.supabase
      .from("guest_profile_history")
      .select("id, guest_id, event_type, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (history.error && !isMissingSchemaError(history.error)) throw new Error(history.error.message);
    const guestIds = [...new Set((history.data ?? []).map((row) => row.guest_id).filter(Boolean))];
    const guestNames = new Map<string, string>();
    if (guestIds.length > 0) {
      const guests = await context.supabase
        .from("guest_profiles")
        .select("id, first_name, last_name, anonymised_at")
        .eq("restaurant_id", data.restaurantId)
        .in("id", guestIds);
      for (const row of (guests.data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string | null;
        anonymised_at?: string | null;
      }>) {
        guestNames.set(
          row.id,
          row.anonymised_at ? WAVE5_ANONYMISED_GUEST_LABEL : fullName(row.first_name, row.last_name),
        );
      }
    }
    for (const row of history.data ?? []) {
      items.push({
        id: `guest:${row.id}`,
        kind: row.event_type as GuestEventType,
        label: WORKSPACE_ACTIVITY_LABELS[row.event_type] ?? row.event_type,
        partyName: guestNames.get(row.guest_id) ?? "Guest",
        createdAt: row.created_at,
      });
    }

    const accountHistory = await context.supabase
      .from("guest_account_history")
      .select("id, master_id, event_type, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (
      accountHistory.error &&
      !isMissingSchemaError(accountHistory.error) &&
      !accountHistory.error.message.includes("does not exist")
    ) {
      if (!isMissingSchemaError(accountHistory.error)) {
        /* Wave 4 table may be missing until 0053. */
      }
    }
    if (!accountHistory.error) {
      const masterIds = [
        ...new Set((accountHistory.data ?? []).map((row) => row.master_id).filter(Boolean)),
      ];
      const masterNames = new Map<string, string>();
      if (masterIds.length > 0) {
        const masters = await context.supabase
          .from("guest_account_masters")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .in("id", masterIds);
        for (const row of (masters.data ?? []) as Array<{ id: string; name: string }>) {
          masterNames.set(row.id, row.name);
        }
      }
      for (const row of accountHistory.data ?? []) {
        const kind =
          row.event_type === "created"
            ? "account_created"
            : row.event_type === "profile_updated"
              ? "account_updated"
              : (row.event_type as GuestWorkspaceActivityKind);
        items.push({
          id: `account:${row.id}`,
          kind,
          label: WORKSPACE_ACTIVITY_LABELS[kind] ?? row.event_type,
          partyName: masterNames.get(row.master_id) ?? "Account",
          createdAt: row.created_at,
        });
      }
    }

    const reservations = await context.supabase
      .from("hotel_reservations")
      .select("id, guest_id, confirmation_number, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (reservations.error && isReservationRlsBlocked(reservations.error)) {
      /* Stay-created activity is omitted when reservations cannot be read. */
    } else if (reservations.error && !isMissingSchemaError(reservations.error)) {
      throw new Error(reservations.error.message);
    } else if (!reservations.error) {
      const resGuestIds = [
        ...new Set((reservations.data ?? []).map((row) => row.guest_id).filter(Boolean) as string[]),
      ].filter((id) => !guestNames.has(id));
      if (resGuestIds.length > 0) {
        const guests = await context.supabase
          .from("guest_profiles")
          .select("id, first_name, last_name, anonymised_at")
          .eq("restaurant_id", data.restaurantId)
          .in("id", resGuestIds);
        for (const row of (guests.data ?? []) as Array<{
          id: string;
          first_name: string;
          last_name: string | null;
          anonymised_at?: string | null;
        }>) {
          guestNames.set(
            row.id,
            row.anonymised_at ? WAVE5_ANONYMISED_GUEST_LABEL : fullName(row.first_name, row.last_name),
          );
        }
      }
      for (const row of reservations.data ?? []) {
        items.push({
          id: `reservation:${row.id}`,
          kind: "reservation_created",
          label: WORKSPACE_ACTIVITY_LABELS.reservation_created,
          partyName: (row.guest_id && guestNames.get(row.guest_id)) || row.confirmation_number || "Reservation",
          createdAt: row.created_at,
        });
      }
    }

    return items
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
      .slice(0, limit);
  });

/* ------------------------------------------------------------ duplicates */

export const findGuestDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        firstName: z.string().max(120).optional().nullable(),
        lastName: z.string().max(120).optional().nullable(),
        dateOfBirth: z.string().max(20).optional().nullable(),
        documentNumber: z.string().max(80).optional().nullable(),
        excludeGuestId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestSummary[]> => {
    await requireGuestManager(context as never, data.restaurantId);

    const email = normalizeEmail(data.email);
    const phone = normalizePhone(data.phone);
    const firstName = data.firstName?.trim();
    const lastName = data.lastName?.trim();
    const dateOfBirth = data.dateOfBirth?.trim();
    const documentNumber = data.documentNumber?.trim();
    if (!email && !phone && !(firstName && lastName && dateOfBirth) && !documentNumber) return [];

    const filters: string[] = [];
    if (email) filters.push(`email_normalized.eq.${email}`);
    if (phone) filters.push(`phone_normalized.eq.${phone}`);
    if (documentNumber) filters.push(`id_document_number.eq.${documentNumber}`);
    if (firstName && lastName && dateOfBirth) {
      filters.push(`and(first_name.ilike.${firstName},last_name.ilike.${lastName},date_of_birth.eq.${dateOfBirth})`);
    }

    const run = async (columns: string, excludeMerged: boolean) => {
      let query = context.supabase
        .from("guest_profiles")
        .select(columns)
        .eq("restaurant_id", data.restaurantId)
        .or(filters.join(","))
        .limit(10);
      if (excludeMerged) query = query.is("merged_into_guest_id", null);
      if (data.excludeGuestId) query = query.neq("id", data.excludeGuestId);
      return query;
    };

    let result = await run(GUEST_COLUMNS_GE2, true);
    if (result.error && isMissingSchemaError(result.error)) {
      result = await run(GUEST_COLUMNS_W5, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await run(GUEST_COLUMNS_W2, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await run(GUEST_COLUMNS_BASE, false);
    }
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as unknown as GuestRow[]).map(toSummary);
  });

/* --------------------------------------------------------------- detail */

export const getGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      guest: GuestProfile;
      preferences: GuestPreferences;
      history: GuestHistoryEntry[];
    }> => {
      await requireGuestManager(context as never, data.restaurantId);

      let wave2 = true;
      let rowResult = await fromTable(context.supabase, "guest_profiles")
        .select(GUEST_COLUMNS_OVERVIEW)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
      if (rowResult.error && isMissingSchemaError(rowResult.error)) {
        rowResult = await fromTable(context.supabase, "guest_profiles")
          .select(GUEST_COLUMNS_GE2)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.guestId)
          .maybeSingle();
      }
      if (rowResult.error && isMissingSchemaError(rowResult.error)) {
        rowResult = await context.supabase
          .from("guest_profiles")
          .select(GUEST_COLUMNS_W5)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.guestId)
          .maybeSingle();
      }
      if (rowResult.error && isMissingSchemaError(rowResult.error)) {
        rowResult = await context.supabase
          .from("guest_profiles")
          .select(GUEST_COLUMNS_W2)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.guestId)
          .maybeSingle();
      }
      if (rowResult.error && isMissingSchemaError(rowResult.error)) {
        wave2 = false;
        rowResult = await context.supabase
          .from("guest_profiles")
          .select(GUEST_COLUMNS_BASE)
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.guestId)
          .maybeSingle();
      }
      if (rowResult.error) throw new Error(rowResult.error.message);
      if (!rowResult.data) throw new Error("That guest could not be found.");
      const row = rowResult.data as unknown as GuestRow;

      const [{ data: prefRow }, { data: historyRows }] = await Promise.all([
        context.supabase
          .from("guest_preferences")
          .select("*")
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .maybeSingle(),
        context.supabase
          .from("guest_profile_history")
          .select(
            "id, event_type, previous_values, new_values, notes, actor_membership_id, created_at",
          )
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const emergency = await loadEmergencyContacts(
        context.supabase,
        data.restaurantId,
        data.guestId,
      );

      const actorNames = await resolveActorNames(data.restaurantId, [
        ...(historyRows ?? []).map((h) => h.actor_membership_id),
        row.data_processing_consent_recorded_by,
        row.marketing_consent_recorded_by,
        row.restriction_set_by_membership_id,
      ]);

      const rules = await loadGuestProfileRules(
        (await import("@/integrations/supabase/client.server")).supabaseAdmin,
        data.restaurantId,
      );

      const preferences: GuestPreferences = prefRow
        ? {
            roomPreference: prefRow.room_preference,
            bedPreference: prefRow.bed_preference,
            floorPreference: prefRow.floor_preference,
            viewPreference: prefRow.view_preference,
            foodPreference: prefRow.food_preference,
            communicationPreference: prefRow.communication_preference,
            accessibilityRequirements: prefRow.accessibility_requirements,
            specialRequests: prefRow.special_requests,
          }
        : EMPTY_PREFERENCES;

      return {
        guest: toProfile(
          row,
          consentFromRow(
            row,
            actorNames,
            wave2,
            rules
              ? {
                  dataProcessing: rules.consentDefaults.dataProcessing,
                  marketing: rules.consentDefaults.marketing,
                }
              : null,
          ),
          {
            restrictionSetByName: row.restriction_set_by_membership_id
              ? (actorNames.get(row.restriction_set_by_membership_id) ?? "Staff member")
              : null,
            emergencyContacts: emergency.contacts,
            emergencyContactsAvailable: emergency.available,
            profileType: await loadGuestProfileTypeRef(data.restaurantId, row.profile_type_id),
            photoUrl: row.photo_storage_path
              ? ((await signRoomImages([row.photo_storage_path])).get(row.photo_storage_path) ?? null)
              : null,
          },
        ),
        preferences,
        history: (historyRows ?? []).map((h) => ({
          id: h.id,
          eventType: h.event_type as GuestEventType,
          previousValues: (h.previous_values as Record<string, JsonValue> | null) ?? null,
          newValues: (h.new_values as Record<string, JsonValue> | null) ?? null,
          notes: h.notes,
          actorName: h.actor_membership_id ? (actorNames.get(h.actor_membership_id) ?? null) : null,
          createdAt: h.created_at,
        })),
      };
    },
  );

/* --------------------------------------------------------------- create */

export const createGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guest: guestInputSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { assertListingCreateAllowed } = await import("./guest-workspace-config.functions");
    await assertListingCreateAllowed(data.restaurantId, "individual");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rules = await loadGuestProfileRules(supabaseAdmin, data.restaurantId);
    const blocked = guestCreateBlocked(rules, data.guest);
    if (blocked) throw new Error(blocked);
    const columns = toColumns(data.guest);
    const restrictionOn = columns.restricted || columns.blacklisted;
    const identity = await allocateGuestIdentity(data.restaurantId);
    const insertRow = {
      ...columns,
      restaurant_id: data.restaurantId,
      created_by_staff_membership_id: me.id,
      ...(identity.profileNumber ? { profile_number: identity.profileNumber } : {}),
      ...(identity.profileTypeId ? { profile_type_id: identity.profileTypeId } : {}),
      ...(restrictionOn
        ? {
            restriction_set_by_membership_id: me.id,
            restriction_set_at: new Date().toISOString(),
          }
        : {}),
    };

    let inserted: { id: string } | null = null;
    let error: { message?: string; code?: string } | null = null;
    let enrichmentApplied = true;
    const first = await context.supabase
      .from("guest_profiles")
      .insert(insertRow as never)
      .select("id")
      .single();
    inserted = first.data;
    error = first.error;
    if (error && isMissingSchemaError(error)) {
      enrichmentApplied = false;
      const ge2Keys = [
        "title",
        "middle_name",
        "preferred_name",
        "gender",
        "phone_alt",
        "email_alt",
        "preferred_contact_method",
        "preferred_contact_time",
        "profile_number",
        "profile_type_id",
        "employment_position",
        "department",
        "source_of_business",
        "restricted",
        "blacklisted",
        "restriction_severity",
        "restriction_reason",
        "restriction_until",
        "restriction_set_by_membership_id",
        "restriction_set_at",
      ] as const;
      const usedEnrichment = ge2Keys.some((key) => {
        const value = (insertRow as Record<string, unknown>)[key];
        return value !== null && value !== undefined && value !== false && value !== "";
      });
      if (
        namedEmergencyContacts(data.guest.emergencyContacts).length ||
        restrictionOn ||
        usedEnrichment
      ) {
        throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
      }
      const legacy = { ...insertRow } as Record<string, unknown>;
      for (const key of ge2Keys) delete legacy[key];
      const retry = await context.supabase
        .from("guest_profiles")
        .insert({
          ...legacy,
          restaurant_id: data.restaurantId,
          created_by_staff_membership_id: me.id,
        } as never)
        .select("id")
        .single();
      inserted = retry.data;
      error = retry.error;
    }
    if (error || !inserted) throw new Error(error?.message ?? "Could not create this guest.");

    if (enrichmentApplied) {
      await replaceEmergencyContacts(
        context.supabase,
        data.restaurantId,
        inserted.id,
        data.guest.emergencyContacts,
      );
    }

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: inserted.id,
      eventType: "created",
      newValues: columns,
      actorMembershipId: me.id,
    });
    if (restrictionOn) {
      await recordRestrictionChange({
        restaurantId: data.restaurantId,
        guestId: inserted.id,
        actorMembershipId: me.id,
        before: { restricted: false, blacklisted: false },
        after: { restricted: columns.restricted, blacklisted: columns.blacklisted },
        reason: columns.restriction_reason,
      });
    }

    return { id: inserted.id };
  });

/* --------------------------------------------------------------- update */

export const updateGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, guest: guestInputSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    let beforeResult = await fromTable(context.supabase, "guest_profiles")
      .select(GUEST_COLUMNS_OVERVIEW)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (beforeResult.error && isMissingSchemaError(beforeResult.error)) {
      beforeResult = await fromTable(context.supabase, "guest_profiles")
        .select(`${GUEST_COLUMNS_GE2}`)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
    }
    if (beforeResult.error && isMissingSchemaError(beforeResult.error)) {
      beforeResult = await fromTable(context.supabase, "guest_profiles")
        .select(`${GUEST_COLUMNS_BASE}, anonymised_at`)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
    }
    const before = beforeResult.data as GuestRow | null;
    if (!before) throw new Error("That guest could not be found.");
    if (before.anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }

    const columns = toColumns(data.guest);
    const restrictionOn = columns.restricted || columns.blacklisted;
    const beforeOn = (before.restricted ?? false) || (before.blacklisted ?? false);
    const updateRow = {
      ...columns,
      ...(restrictionOn && !beforeOn
        ? {
            restriction_set_by_membership_id: me.id,
            restriction_set_at: new Date().toISOString(),
          }
        : {}),
      ...(!restrictionOn
        ? {
            restriction_set_by_membership_id: null,
            restriction_set_at: null,
          }
        : {}),
    };

    let { error } = await context.supabase
      .from("guest_profiles")
      .update(updateRow as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error && isMissingSchemaError(error)) {
      throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
    }
    if (error) throw new Error(error.message);

    await replaceEmergencyContacts(
      context.supabase,
      data.restaurantId,
      data.guestId,
      data.guest.emergencyContacts,
    );

    const profileDiff = diffFields(
      before as unknown as Record<string, unknown>,
      columns as unknown as Record<string, unknown>,
      TRACKED_FIELDS,
    );
    if (profileDiff) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "profile_updated",
        previousValues: profileDiff.previous,
        newValues: profileDiff.next,
        actorMembershipId: me.id,
      });
    }
    if (before.vip_status !== columns.vip_status) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "vip_changed",
        previousValues: { vip_status: before.vip_status },
        newValues: { vip_status: columns.vip_status },
        actorMembershipId: me.id,
      });
    }
    const restrictionDiff = diffFields(
      before as unknown as Record<string, unknown>,
      columns as unknown as Record<string, unknown>,
      RESTRICTION_FIELDS,
    );
    if (restrictionDiff) {
      await recordRestrictionChange({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        actorMembershipId: me.id,
        before: restrictionSnapshot(before),
        after: { restricted: columns.restricted, blacklisted: columns.blacklisted },
        reason: columns.restriction_reason,
      });
    }

    return { ok: true };
  });

/* ------------------------------------------------------------ vip/status */

export const setGuestVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, vip: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { data: updated, error } = await context.supabase
      .from("guest_profiles")
      .update({ vip_status: data.vip })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .select("id, vip_status")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That guest could not be found.");

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "vip_changed",
      previousValues: { vip_status: !data.vip },
      newValues: { vip_status: data.vip },
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const setGuestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, guestId: idSchema, status: z.enum(GUEST_STATUSES) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    const { data: before } = await context.supabase
      .from("guest_profiles")
      .select("id, guest_status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (!before) throw new Error("That guest could not be found.");

    const { error } = await context.supabase
      .from("guest_profiles")
      .update({ guest_status: data.status })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error) throw new Error(error.message);

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "status_changed",
      previousValues: { guest_status: before.guest_status },
      newValues: { guest_status: data.status },
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

/* ------------------------------------------------------- restrictions */

export const setGuestRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        restricted: z.boolean(),
        blacklisted: z.boolean(),
        restrictionSeverity: z.enum(RESTRICTION_SEVERITIES).optional().nullable(),
        restrictionReason: z.string().max(2000),
        restrictionUntil: z.string().max(20).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const reasonError = validateRestrictionReason(
      data.restricted,
      data.blacklisted,
      data.restrictionReason,
    );
    if (reasonError) throw new Error(reasonError);
    if (!data.restricted && !data.blacklisted) {
      throw new Error("Set restricted and/or blacklisted, or use lift instead.");
    }

    const { data: before, error: beforeError } = await fromTable(context.supabase, "guest_profiles")
      .select("id, restricted, blacklisted, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (beforeError && isMissingSchemaError(beforeError)) {
      throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
    }
    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new Error("That guest could not be found.");
    if ((before as { anonymised_at?: string | null }).anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }

    const { error } = await context.supabase
      .from("guest_profiles")
      .update({
        restricted: data.restricted,
        blacklisted: data.blacklisted,
        restriction_severity: blankToNull(data.restrictionSeverity),
        restriction_reason: data.restrictionReason.trim(),
        restriction_until: blankToNull(data.restrictionUntil),
        restriction_set_by_membership_id: me.id,
        restriction_set_at: new Date().toISOString(),
      } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error && isMissingSchemaError(error)) throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
    if (error) throw new Error(error.message);

    await recordRestrictionChange({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      actorMembershipId: me.id,
      before: restrictionSnapshot(before as GuestRow),
      after: { restricted: data.restricted, blacklisted: data.blacklisted },
      reason: data.restrictionReason.trim(),
    });
    return { ok: true as const };
  });

export const liftGuestRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        reason: z.string().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const liftError = validateLiftReason(data.reason);
    if (liftError) throw new Error(liftError);

    const { data: before, error: beforeError } = await fromTable(context.supabase, "guest_profiles")
      .select("id, restricted, blacklisted, anonymised_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (beforeError && isMissingSchemaError(beforeError)) {
      throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
    }
    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new Error("That guest could not be found.");
    if ((before as { anonymised_at?: string | null }).anonymised_at) {
      throw new Error("This profile has been anonymised and cannot be changed.");
    }
    if (!(before as GuestRow).restricted && !(before as GuestRow).blacklisted) {
      throw new Error("This guest has no restriction to lift.");
    }

    const { error } = await context.supabase
      .from("guest_profiles")
      .update({
        restricted: false,
        blacklisted: false,
        restriction_severity: null,
        restriction_reason: null,
        restriction_until: null,
        restriction_set_by_membership_id: null,
        restriction_set_at: null,
      } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error && isMissingSchemaError(error)) throw new Error(INDIVIDUAL_ENRICHMENT_UNAVAILABLE);
    if (error) throw new Error(error.message);

    await recordRestrictionChange({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      actorMembershipId: me.id,
      before: restrictionSnapshot(before as GuestRow),
      after: { restricted: false, blacklisted: false },
      reason: data.reason.trim(),
      lifted: true,
    });
    return { ok: true as const };
  });

/* ---------------------------------------------------------- preferences */

const preferenceSchema = z.object({
  roomPreference: z.string().max(200).optional().nullable(),
  bedPreference: z.string().max(200).optional().nullable(),
  floorPreference: z.string().max(200).optional().nullable(),
  viewPreference: z.string().max(200).optional().nullable(),
  foodPreference: z.string().max(500).optional().nullable(),
  communicationPreference: z.string().max(200).optional().nullable(),
  accessibilityRequirements: z.string().max(1000).optional().nullable(),
  specialRequests: z.string().max(2000).optional().nullable(),
});

export const saveGuestPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, guestId: idSchema, preferences: preferenceSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    const { data: guest } = await context.supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (!guest) throw new Error("That guest could not be found.");

    const p = data.preferences;
    const columns = {
      room_preference: blankToNull(p.roomPreference),
      bed_preference: blankToNull(p.bedPreference),
      floor_preference: blankToNull(p.floorPreference),
      view_preference: blankToNull(p.viewPreference),
      food_preference: blankToNull(p.foodPreference),
      communication_preference: blankToNull(p.communicationPreference),
      accessibility_requirements: blankToNull(p.accessibilityRequirements),
      special_requests: blankToNull(p.specialRequests),
    };

    const { data: existing } = await context.supabase
      .from("guest_preferences")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("guest_preferences")
        .update(columns)
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("guest_preferences")
        .insert({ ...columns, restaurant_id: data.restaurantId, guest_id: data.guestId });
      if (error) throw new Error(error.message);
    }

    const diff = diffFields(
      (existing ?? {}) as unknown as Record<string, unknown>,
      columns as unknown as Record<string, unknown>,
      Object.keys(columns),
    );
    if (diff) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "preference_updated",
        previousValues: diff.previous,
        newValues: diff.next,
        actorMembershipId: me.id,
      });
    }
    await syncWave2PreferencesToCard4(data.restaurantId, data.guestId, p);
    return { ok: true };
  });

const WAVE2_FIELD_BY_CARD4_CODE = Object.fromEntries(
  Object.entries(WAVE2_TO_CARD4_PREF_CODE)
    .filter((entry): entry is [keyof GuestPreferences, string] => Boolean(entry[1]))
    .map(([field, code]) => [code, field]),
) as Record<string, keyof GuestPreferences>;

export type GuestPreferenceWorkspaceType = PreferenceTypeRecord & {
  values: string[];
};

export type GuestPreferenceWorkspaceCategory = PreferenceCategoryRecord & {
  types: GuestPreferenceWorkspaceType[];
};

export type GuestPreferenceWorkspace = {
  available: boolean;
  categories: GuestPreferenceWorkspaceCategory[];
  applyToFutureReservations: boolean;
  contactDefaults: ContactDefaultsDraft;
  wave2: GuestPreferences;
};

async function loadPreferenceWorkspaceCatalogue(
  restaurantId: string,
): Promise<{ categories: PreferenceCategoryRecord[]; types: PreferenceTypeRecord[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [categories, types] = await Promise.all([
    supabaseAdmin
      .from("pms_guest_preference_categories")
      .select("id, name, code, description, active, display_order, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
    supabaseAdmin
      .from("pms_guest_preference_types")
      .select(
        "id, category_id, name, code, value_type, options, required, active, display_order, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order"),
  ]);
  if (categories.error) {
    if (isMissingSchemaError(categories.error)) return { categories: [], types: [] };
    throw new Error(categories.error.message);
  }
  if (types.error) {
    if (isMissingSchemaError(types.error)) return { categories: [], types: [] };
    throw new Error(types.error.message);
  }
  return {
    categories: ((categories.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      code: String(row.code),
      description: (row.description as string | null) ?? null,
      active: Boolean(row.active),
      displayOrder: Number(row.display_order ?? 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    types: ((types.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      categoryId: String(row.category_id),
      name: String(row.name),
      code: String(row.code),
      valueType: isPreferenceValueType(String(row.value_type))
        ? (row.value_type as PreferenceValueType)
        : "single",
      options: normalizePreferenceOptions(row.options),
      required: Boolean(row.required),
      active: Boolean(row.active),
      displayOrder: Number(row.display_order ?? 1),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
  };
}

function hydrateFromWave2(
  type: PreferenceTypeRecord,
  wave2: GuestPreferences,
): string[] {
  const field = WAVE2_FIELD_BY_CARD4_CODE[type.code];
  if (!field) return [];
  const stored = wave2[field];
  const label = formatPreferenceStoredValue(
    stored,
    type.options.map((option) => ({ id: option.id, label: option.label })),
  );
  if (!label) return [];
  const match = type.options.find(
    (option) =>
      option.value.toLowerCase() === label.toLowerCase() ||
      option.label.toLowerCase() === label.toLowerCase() ||
      option.id === stored?.replace(/^id:/, ""),
  );
  if (type.valueType === "multi") {
    return match ? [match.value] : [label];
  }
  if (type.valueType === "yes_no") {
    const lower = label.toLowerCase();
    if (lower.startsWith("y")) return ["yes"];
    if (lower.startsWith("n")) return ["no"];
  }
  return match ? [match.value] : type.valueType === "text" || type.valueType === "number" ? [label] : [];
}

export const listGuestPreferenceWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestPreferenceWorkspace> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const catalogue = await loadPreferenceWorkspaceCatalogue(data.restaurantId);
    const guest = await context.supabase
      .from("guest_profiles")
      .select("id, language, preferred_contact_method, preferred_contact_time")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (!guest.data) throw new Error("That guest could not be found.");

    const prefs = await context.supabase
      .from("guest_preferences")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .maybeSingle();
    const wave2: GuestPreferences = {
      roomPreference: prefs.data?.room_preference ?? null,
      bedPreference: prefs.data?.bed_preference ?? null,
      floorPreference: prefs.data?.floor_preference ?? null,
      viewPreference: prefs.data?.view_preference ?? null,
      foodPreference: prefs.data?.food_preference ?? null,
      communicationPreference: prefs.data?.communication_preference ?? null,
      accessibilityRequirements: prefs.data?.accessibility_requirements ?? null,
      specialRequests: prefs.data?.special_requests ?? null,
    };
    const values = await supabaseAdmin
      .from("guest_preference_values")
      .select("preference_type_id, value_json")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId);
    const byType = new Map<string, string[]>();
    if (!values.error) {
      for (const row of (values.data ?? []) as Array<{ preference_type_id: string; value_json: unknown }>) {
        const raw = Array.isArray(row.value_json) ? row.value_json.map(String) : [];
        byType.set(row.preference_type_id, raw);
      }
    }

    const categories = catalogue.categories
      .map((category) => {
        const types = catalogue.types
          .filter((type) => type.categoryId === category.id)
          .map((type) => {
            const stored = byType.get(type.id);
            const valuesForType =
              stored && stored.length > 0
                ? normalizePreferenceAnswers(type.valueType, stored)
                : hydrateFromWave2(type, wave2);
            return { ...type, values: valuesForType };
          })
          .filter((type) => type.active || type.values.length > 0);
        return { ...category, types };
      })
      .filter((category) => category.active || category.types.length > 0);

    const method = (guest.data as { preferred_contact_method?: string | null }).preferred_contact_method;
    const time = (guest.data as { preferred_contact_time?: string | null }).preferred_contact_time;
    return {
      available: catalogue.categories.length > 0 || catalogue.types.length > 0,
      categories,
      applyToFutureReservations: Boolean(
        (prefs.data as { apply_to_future_reservations?: boolean } | null)?.apply_to_future_reservations,
      ),
      contactDefaults: {
        language: ((guest.data as { language?: string | null }).language ?? "") as string,
        preferredContactMethod: isPreferredContactMethod(method ?? "")
          ? method
          : "",
        preferredContactTime: isPreferredContactTime(time ?? "") ? time : "",
      },
      wave2,
    };
  });

export const saveGuestPreferenceWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        applyToFutureReservations: z.boolean(),
        answers: z.array(
          z.object({
            typeId: idSchema,
            values: z.array(z.string().max(PREFERENCE_TEXT_MAX)).max(40),
          }),
        ),
        contactDefaults: z.object({
          language: z.string().max(120),
          preferredContactMethod: z.union([z.enum(PREFERRED_CONTACT_METHODS), z.literal("")]),
          preferredContactTime: z.union([z.enum(PREFERRED_CONTACT_TIMES), z.literal("")]),
        }),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; message: string }> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const catalogue = await loadPreferenceWorkspaceCatalogue(data.restaurantId);
      const typeById = new Map(catalogue.types.map((type) => [type.id, type]));
      const normalized: Array<{ type: PreferenceTypeRecord; values: string[] }> = [];
      for (const answer of data.answers) {
        const type = typeById.get(answer.typeId);
        if (!type) return { ok: false, message: "A preference type is no longer available." };
        const values = normalizePreferenceAnswers(type.valueType, answer.values);
        const error = validatePreferenceAnswer(type, values);
        if (error) return { ok: false, message: error };
        if (!type.active && values.length === 0) continue;
        if (!type.active && values.length > 0) {
          normalized.push({ type, values });
          continue;
        }
        normalized.push({ type, values });
      }

      const { data: guest, error: guestError } = await context.supabase
        .from("guest_profiles")
        .select("id, anonymised_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
      if (guestError && isMissingSchemaError(guestError))
        return { ok: false, message: "Guest preferences are unavailable until their migration is applied." };
      if (!guest) return { ok: false, message: "That guest could not be found." };
      if ((guest as { anonymised_at?: string | null }).anonymised_at) {
        return { ok: false, message: "This profile has been anonymised and cannot be changed." };
      }

      const { error: contactError } = await context.supabase
        .from("guest_profiles")
        .update({
          language: blankToNull(data.contactDefaults.language),
          preferred_contact_method: data.contactDefaults.preferredContactMethod || null,
          preferred_contact_time: data.contactDefaults.preferredContactTime || null,
        })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId);
      if (contactError) return { ok: false, message: contactError.message };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const item of normalized) {
        const { error } = await supabaseAdmin.from("guest_preference_values").upsert(
          {
            restaurant_id: data.restaurantId,
            guest_id: data.guestId,
            preference_type_id: item.type.id,
            value_json: item.values,
          } as never,
          { onConflict: "guest_id,preference_type_id" },
        );
        if (error) return { ok: false, message: error.message };
      }

      const wave2Patch: Record<string, string | null> = {};
      for (const item of normalized) {
        const field = WAVE2_FIELD_BY_CARD4_CODE[item.type.code];
        if (!field) continue;
        const label =
          item.values.length === 0
            ? null
            : item.type.options.find((option) => option.value === item.values[0])?.label ??
              item.values.join(", ");
        wave2Patch[
          field === "roomPreference"
            ? "room_preference"
            : field === "bedPreference"
              ? "bed_preference"
              : field === "floorPreference"
                ? "floor_preference"
                : field === "viewPreference"
                  ? "view_preference"
                  : field === "foodPreference"
                    ? "food_preference"
                    : field === "communicationPreference"
                      ? "communication_preference"
                      : field === "accessibilityRequirements"
                        ? "accessibility_requirements"
                        : "special_requests"
        ] = label ? `other:${label}` : null;
      }
      const textNotes = normalized
        .filter((item) => item.type.valueType === "text")
        .flatMap((item) => item.values);
      if (textNotes.length > 0) wave2Patch.special_requests = textNotes.join("\n");

      const existing = await context.supabase
        .from("guest_preferences")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .maybeSingle();
      const prefRow = {
        ...wave2Patch,
        apply_to_future_reservations: data.applyToFutureReservations,
      };
      if (existing.data) {
        const { error } = await context.supabase
          .from("guest_preferences")
          .update(prefRow)
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId);
        if (error) return { ok: false, message: error.message };
      } else {
        const { error } = await context.supabase.from("guest_preferences").insert({
          restaurant_id: data.restaurantId,
          guest_id: data.guestId,
          ...prefRow,
        });
        if (error) return { ok: false, message: error.message };
      }

      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "preference_updated",
        newValues: {
          apply_to_future_reservations: data.applyToFutureReservations,
          types: normalized.map((item) => item.type.code),
        },
        actorMembershipId: me.id,
      });
      return { ok: true };
    },
  );

export const getGuestReservationPreferenceDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      applyToFutureReservations: boolean;
      specialRequests: string | null;
      roomTypeId: string | null;
    }> => {
      await requireGuestManager(context as never, data.restaurantId);
      const workspace = await listGuestPreferenceWorkspace({
        data: { restaurantId: data.restaurantId, guestId: data.guestId },
      });
      const rooms = await getGuestPreferenceCatalogues({
        data: { restaurantId: data.restaurantId },
      });
      const answers = workspace.categories.flatMap((category) =>
        category.types.map((type) => ({
          code: type.code,
          valueType: type.valueType,
          values: type.values,
        })),
      );
      const mapped = reservationDefaultsFromWorkspace({
        applyToFutureReservations: workspace.applyToFutureReservations,
        answers,
        specialRequests: workspace.wave2.specialRequests,
        roomTypes: rooms.roomTypes.map((row) => ({
          id: row.id,
          code: row.code ?? null,
          label: row.label,
        })),
      });
      return {
        applyToFutureReservations: workspace.applyToFutureReservations,
        specialRequests: mapped.specialRequests,
        roomTypeId: mapped.roomTypeId,
      };
    },
  );

/* ------------------------------------------------------------------ note */

export const addGuestNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        note: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    const { data: guest } = await context.supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (!guest) throw new Error("That guest could not be found.");

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "note_added",
      notes: data.note.trim(),
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export type GuestPreferenceSummary = {
  available: boolean;
  chips: OverviewPreferenceChip[];
};

export const listGuestPreferenceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestPreferenceSummary> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const values = await supabaseAdmin
      .from("guest_preference_values")
      .select("preference_type_id, value_json")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId);
    if (!values.error) {
      const types = await supabaseAdmin
        .from("pms_guest_preference_types")
        .select("id, name, code, active")
        .eq("restaurant_id", data.restaurantId);
      if (!types.error) {
        const typeById = new Map(
          ((types.data ?? []) as Array<{ id: string; name: string; code: string; active: boolean }>).map(
            (row) => [row.id, row],
          ),
        );
        const chips: OverviewPreferenceChip[] = [];
        for (const row of (values.data ?? []) as Array<{
          preference_type_id: string;
          value_json: unknown;
        }>) {
          const type = typeById.get(row.preference_type_id);
          const raw = Array.isArray(row.value_json) ? row.value_json.map(String).filter(Boolean) : [];
          if (!type || raw.length === 0) continue;
          chips.push({
            code: type.code,
            label: type.name,
            value: raw.join(", "),
            active: type.active,
          });
        }
        if (chips.length > 0) return { available: true, chips };
      }
    }

    const prefs = await context.supabase
      .from("guest_preferences")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .maybeSingle();
    if (!prefs.data) return { available: true, chips: [] };
    const catalogues = await getGuestPreferenceCatalogues({ data: { restaurantId: data.restaurantId } });
    const optionsFor = (key: keyof GuestPreferences) => {
      if (key === "roomPreference") return catalogues.roomTypes;
      if (key === "floorPreference") return catalogues.floors;
      if (key === "bedPreference") return catalogues.options.bed;
      if (key === "viewPreference") return catalogues.options.view;
      if (key === "foodPreference") return catalogues.options.food;
      if (key === "communicationPreference") return catalogues.options.communication;
      return [];
    };
    const mapped: GuestPreferences = {
      roomPreference: prefs.data.room_preference,
      bedPreference: prefs.data.bed_preference,
      floorPreference: prefs.data.floor_preference,
      viewPreference: prefs.data.view_preference,
      foodPreference: prefs.data.food_preference,
      communicationPreference: prefs.data.communication_preference,
      accessibilityRequirements: prefs.data.accessibility_requirements,
      specialRequests: prefs.data.special_requests,
    };
    const { wave2PreferenceChips } = await import("./guest-profile-overview");
    return {
      available: catalogues.available,
      chips: wave2PreferenceChips(
        mapped,
        {
          roomPreference: "Room type",
          bedPreference: "Bed",
          floorPreference: "Floor",
          viewPreference: "View",
          foodPreference: "Dietary",
          communicationPreference: "Communication",
        },
        (key, stored) => formatPreferenceStoredValue(stored, optionsFor(key)),
      ),
    };
  });

export type GuestServiceHistoryItem = {
  id: string;
  requestNumber: string | null;
  serviceTypeId: string;
  serviceName: string;
  serviceActive: boolean;
  status: GuestServiceStatus;
  requestedAt: string;
  preferredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  reservationId: string | null;
  confirmationNumber: string | null;
  roomNumber: string | null;
  notes: string | null;
  priority: GuestServicePriority;
  amount: number | null;
  currency: string | null;
  requestedByName: string | null;
  assignedMembershipId: string | null;
  assignedName: string | null;
};

export type GuestServiceTypeOption = {
  id: string;
  name: string;
  code: string;
  categoryName: string;
  active: boolean;
  amount: number | null;
  currency: string | null;
};

export type GuestServiceStaffOption = {
  id: string;
  name: string;
};

export type GuestServiceNote = {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
};

export const listGuestServiceHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; items: GuestServiceHistoryItem[] }> => {
      const workspace = await loadGuestServiceWorkspace(
        context as never,
        data.restaurantId,
        data.guestId,
        data.limit ?? 5,
      );
      return { available: workspace.available, items: workspace.items };
    },
  );

export const listGuestServiceWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    return loadGuestServiceWorkspace(context as never, data.restaurantId, data.guestId, 100);
  });

type GuestServiceLoadCtx = { supabase: { from: (table: string) => any } };

async function loadGuestServiceWorkspace(
  context: GuestServiceLoadCtx,
  restaurantId: string,
  guestId: string,
  limit: number,
): Promise<{
  available: boolean;
  items: GuestServiceHistoryItem[];
  types: GuestServiceTypeOption[];
  staff: GuestServiceStaffOption[];
  notes: GuestServiceNote[];
}> {
  await requireGuestManager(context as never, restaurantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let result = await context.supabase
    .from("guest_service_history")
    .select(
      "id, service_type_id, status, requested_at, reservation_id, amount, currency, notes, completed_at, created_by_membership_id, request_number, priority, preferred_at, assigned_membership_id, cancelled_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("guest_id", guestId)
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (result.error && isMissingSchemaError(result.error)) {
    result = await context.supabase
      .from("guest_service_history")
      .select(
        "id, service_type_id, status, requested_at, reservation_id, amount, currency, notes, completed_at, created_by_membership_id",
      )
      .eq("restaurant_id", restaurantId)
      .eq("guest_id", guestId)
      .order("requested_at", { ascending: false })
      .limit(limit);
  }
  if (result.error && isMissingSchemaError(result.error)) {
    return { available: false, items: [], types: [], staff: [], notes: [] };
  }
  if (result.error) throw new Error(result.error.message);

  type HistoryRow = {
    id: string;
    service_type_id: string;
    status: string;
    requested_at: string;
    reservation_id: string | null;
    amount: number | string | null;
    currency: string | null;
    notes?: string | null;
    completed_at?: string | null;
    created_by_membership_id?: string | null;
    request_number?: string | null;
    priority?: string | null;
    preferred_at?: string | null;
    assigned_membership_id?: string | null;
    cancelled_at?: string | null;
  };
  const rows = (result.data ?? []) as HistoryRow[];

  const typesRes = await supabaseAdmin
    .from("pms_guest_service_types")
    .select("id, name, code, active, category_id")
    .eq("restaurant_id", restaurantId)
    .order("display_order");
  const categoriesRes = await supabaseAdmin
    .from("pms_guest_service_categories")
    .select("id, name")
    .eq("restaurant_id", restaurantId);
  const pricingRes = await supabaseAdmin
    .from("pms_guest_service_pricing")
    .select("service_type_id, amount, currency_code, active")
    .eq("restaurant_id", restaurantId);
  const categoryName = new Map(
    ((categoriesRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  );
  const priceByType = new Map(
    ((pricingRes.data ?? []) as Array<{
      service_type_id: string;
      amount: number | string;
      currency_code: string;
      active: boolean;
    }>)
      .filter((row) => row.active)
      .map((row) => [
        row.service_type_id,
        { amount: Number(row.amount), currency: row.currency_code },
      ]),
  );
  const types: GuestServiceTypeOption[] = (
    (typesRes.data ?? []) as Array<{
      id: string;
      name: string;
      code: string;
      active: boolean;
      category_id: string;
    }>
  ).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    categoryName: categoryName.get(row.category_id) ?? "Service",
    active: row.active,
    amount: priceByType.get(row.id)?.amount ?? null,
    currency: priceByType.get(row.id)?.currency ?? null,
  }));
  const typeById = new Map(types.map((type) => [type.id, type]));

  const reservationIds = [...new Set(rows.map((row) => row.reservation_id).filter(Boolean) as string[])];
  const stayById = new Map<string, { confirmationNumber: string; roomNumber: string | null }>();
  if (reservationIds.length > 0) {
    const stays = await supabaseAdmin
      .from("hotel_reservations")
      .select("id, confirmation_number, room_id, hotel_rooms!hotel_reservations_room_same_type ( room_number )")
      .eq("restaurant_id", restaurantId)
      .in("id", reservationIds);
    for (const stay of (stays.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      hotel_rooms?: { room_number: string } | null;
    }>) {
      stayById.set(stay.id, {
        confirmationNumber: stay.confirmation_number,
        roomNumber: stay.hotel_rooms?.room_number ?? null,
      });
    }
  }

  const staffIds = [
    ...rows.map((row) => row.created_by_membership_id),
    ...rows.map((row) => row.assigned_membership_id),
  ];
  const actorNames = await resolveActorNames(restaurantId, staffIds);
  const members = await supabaseAdmin
    .from("restaurant_users")
    .select("id")
    .eq("restaurant_id", restaurantId);
  const staffNames = await resolveActorNames(
    restaurantId,
    ((members.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  );
  const staff: GuestServiceStaffOption[] = [...staffNames.entries()].map(([id, name]) => ({ id, name }));

  const notesRes = await context.supabase
    .from("guest_profile_history")
    .select("id, notes, created_at, actor_membership_id")
    .eq("restaurant_id", restaurantId)
    .eq("guest_id", guestId)
    .eq("event_type", "note_added")
    .order("created_at", { ascending: false })
    .limit(8);
  const noteRows = (
    notesRes.error
      ? []
      : ((notesRes.data ?? []) as Array<{
          id: string;
          notes: string | null;
          created_at: string;
          actor_membership_id: string | null;
        }>)
  ).filter((row) => Boolean(row.notes?.trim()));
  const noteActors = await resolveActorNames(
    restaurantId,
    noteRows.map((row) => row.actor_membership_id),
  );
  const notes: GuestServiceNote[] = noteRows.map((row) => ({
    id: row.id,
    text: row.notes!.trim(),
    authorName: row.actor_membership_id ? (noteActors.get(row.actor_membership_id) ?? null) : null,
    createdAt: row.created_at,
  }));

  return {
    available: true,
    notes,
    items: rows.map((row) => {
      const type = typeById.get(row.service_type_id);
      const stay = row.reservation_id ? stayById.get(row.reservation_id) : null;
      const status = isGuestServiceStatus(row.status) ? row.status : "requested";
      const priority =
        row.priority === "high" || row.priority === "urgent" ? row.priority : "normal";
      return {
        id: row.id,
        requestNumber: row.request_number ?? null,
        serviceTypeId: row.service_type_id,
        serviceName: type?.name ?? "Guest service",
        serviceActive: type?.active ?? false,
        status,
        requestedAt: row.requested_at,
        preferredAt: row.preferred_at ?? null,
        completedAt: row.completed_at ?? null,
        cancelledAt: row.cancelled_at ?? null,
        reservationId: row.reservation_id,
        confirmationNumber: stay?.confirmationNumber ?? null,
        roomNumber: stay?.roomNumber ?? null,
        notes: row.notes ?? null,
        priority,
        amount: row.amount == null ? null : Number(row.amount),
        currency: row.currency,
        requestedByName: row.created_by_membership_id
          ? (actorNames.get(row.created_by_membership_id) ?? null)
          : null,
        assignedMembershipId: row.assigned_membership_id ?? null,
        assignedName: row.assigned_membership_id
          ? (actorNames.get(row.assigned_membership_id) ?? null)
          : null,
      };
    }),
    types,
    staff,
  };
}

export const createGuestServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        serviceTypeId: idSchema,
        priority: z.enum(GUEST_SERVICE_PRIORITIES),
        description: z.string().trim().min(1).max(GUEST_SERVICE_DESCRIPTION_MAX),
        reservationId: idSchema.nullable(),
        preferredAt: z.string().nullable().optional(),
        specialInstructions: z.string().trim().max(GUEST_SERVICE_DESCRIPTION_MAX).optional(),
        assignedMembershipId: idSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; id: string } | { ok: false; message: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const type = await supabaseAdmin
      .from("pms_guest_service_types")
      .select("id, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.serviceTypeId)
      .maybeSingle();
    if (type.error && isMissingSchemaError(type.error)) {
      return { ok: false, message: "Guest service types are unavailable until their migration is applied." };
    }
    if (!type.data) return { ok: false, message: "That service type is not configured for this property." };
    if (!(type.data as { active: boolean }).active) {
      return { ok: false, message: "That service type is inactive and cannot be requested." };
    }
    if (data.reservationId) {
      const stay = await context.supabase
        .from("hotel_reservations")
        .select("id, guest_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (!stay.data || (stay.data as { guest_id: string }).guest_id !== data.guestId) {
        return { ok: false, message: "That reservation does not belong to this guest." };
      }
    }
    if (data.assignedMembershipId) {
      const assigned = await supabaseAdmin
        .from("restaurant_users")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.assignedMembershipId)
        .maybeSingle();
      if (!assigned.data) return { ok: false, message: "That staff member is not on this property." };
    }
    const pricing = await supabaseAdmin
      .from("pms_guest_service_pricing")
      .select("amount, currency_code, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("service_type_id", data.serviceTypeId)
      .maybeSingle();
    const priced = pricing.data as { amount: number | string; currency_code: string; active: boolean } | null;
    const numbered = await supabaseAdmin.rpc("next_guest_service_number", {
      _restaurant_id: data.restaurantId,
    });
    const requestNumber = !numbered.error && typeof numbered.data === "string" ? numbered.data : null;
    const notes = [data.description.trim(), data.specialInstructions?.trim()]
      .filter(Boolean)
      .join("\n\n");
    const payload = {
      restaurant_id: data.restaurantId,
      guest_id: data.guestId,
      reservation_id: data.reservationId,
      service_type_id: data.serviceTypeId,
      status: "requested",
      notes,
      request_number: requestNumber,
      priority: data.priority,
      preferred_at: data.preferredAt ?? null,
      assigned_membership_id: data.assignedMembershipId ?? null,
      amount: priced?.active ? Number(priced.amount) : null,
      currency: priced?.active ? priced.currency_code : null,
      created_by_membership_id: me.id,
    };
    let inserted = await supabaseAdmin.from("guest_service_history").insert(payload).select("id").maybeSingle();
    if (inserted.error && isMissingSchemaError(inserted.error)) {
      inserted = await supabaseAdmin
        .from("guest_service_history")
        .insert({
          restaurant_id: data.restaurantId,
          guest_id: data.guestId,
          reservation_id: data.reservationId,
          service_type_id: data.serviceTypeId,
          status: "requested",
          notes,
          amount: priced?.active ? Number(priced.amount) : null,
          currency: priced?.active ? priced.currency_code : null,
          created_by_membership_id: me.id,
        })
        .select("id")
        .maybeSingle();
    }
    if (inserted.error) return { ok: false, message: inserted.error.message };
    const id = (inserted.data as { id: string }).id;
    try {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "service_request_created",
        newValues: {
          id,
          request_number: requestNumber,
          service_type_id: data.serviceTypeId,
          status: "requested",
          reservation_id: data.reservationId,
        },
        notes: data.description.trim(),
        actorMembershipId: me.id,
      });
    } catch {
      /* History event types land with 0089; the request row is the source of truth. */
    }
    return { ok: true, id };
  });

export const updateGuestServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        requestId: idSchema,
        status: z.enum(GUEST_SERVICE_STATUSES).optional(),
        assignedMembershipId: idSchema.nullable().optional(),
        notes: z.string().trim().max(GUEST_SERVICE_DESCRIPTION_MAX).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin
      .from("guest_service_history")
      .select("id, status, assigned_membership_id, notes")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (!existing.data) return { ok: false, message: "That service request could not be found." };
    const current = existing.data as {
      status: string;
      assigned_membership_id: string | null;
      notes: string | null;
    };
    const currentStatus = isGuestServiceStatus(current.status)
      ? (current.status as GuestServiceStatus)
      : "requested";
    const patch: Record<string, unknown> = {};
    if (data.status && data.status !== currentStatus) {
      if (!canTransitionGuestService(currentStatus, data.status)) {
        return { ok: false, message: "That status change is not allowed." };
      }
      patch.status = data.status;
      if (data.status === "completed") patch.completed_at = new Date().toISOString();
      if (data.status === "cancelled") patch.cancelled_at = new Date().toISOString();
    }
    if (data.assignedMembershipId !== undefined) {
      if (data.assignedMembershipId) {
        const assigned = await supabaseAdmin
          .from("restaurant_users")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.assignedMembershipId)
          .maybeSingle();
        if (!assigned.data) return { ok: false, message: "That staff member is not on this property." };
      }
      patch.assigned_membership_id = data.assignedMembershipId;
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const updated = await supabaseAdmin
      .from("guest_service_history")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.requestId);
    if (updated.error) return { ok: false, message: updated.error.message };
    try {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "service_request_updated",
        previousValues: {
          status: current.status,
          assigned_membership_id: current.assigned_membership_id,
        },
        newValues: patch,
        actorMembershipId: me.id,
      });
    } catch {
      /* History event types land with 0089; the request row is the source of truth. */
    }
    return { ok: true };
  });

export const createGuestPhotoUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { data: guest, error } = await context.supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (error && isMissingSchemaError(error)) {
      return {
        ok: false as const,
        message: "Guest photo is not available until Overview migration 0086 is applied.",
      };
    }
    if (!guest) return { ok: false as const, message: "That guest could not be found." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = guestPhotoPath(
      data.restaurantId,
      data.guestId,
      GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "jpg",
    );
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(ROOM_BUCKET)
      .createSignedUploadUrl(path);
    if (signedError || !signed) return { ok: false as const, message: "Could not start the upload." };
    return { ok: true as const, path, token: signed.token };
  });

export const saveGuestPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, path: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const prefix = `${data.restaurantId}/guests/${data.guestId}/`;
    if (!data.path.startsWith(prefix)) throw new Error("That photo path is not valid for this guest.");
    const { data: before } = await context.supabase
      .from("guest_profiles")
      .select("photo_storage_path")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    const { error } = await context.supabase
      .from("guest_profiles")
      .update({ photo_storage_path: data.path } as never)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error) throw new Error(error.message);
    const previous = (before as { photo_storage_path?: string | null } | null)?.photo_storage_path;
    if (previous && previous !== data.path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(ROOM_BUCKET).remove([previous]);
    }
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "photo_updated",
      previousValues: previous ? { photo_storage_path: previous } : null,
      newValues: { photo_storage_path: data.path },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

/* ----------------------------------------------------------- catalogues */

export type PreferenceCatalogueOption = {
  id: string;
  label: string;
  code?: string;
  category?: PreferenceOptionCategory;
  active?: boolean;
};

export type GuestPreferenceCatalogues = {
  available: boolean;
  roomTypes: PreferenceCatalogueOption[];
  floors: PreferenceCatalogueOption[];
  options: Record<PreferenceOptionCategory, PreferenceCatalogueOption[]>;
};

const EMPTY_OPTION_MAP: GuestPreferenceCatalogues["options"] = {
  bed: [],
  view: [],
  food: [],
  communication: [],
};

export const getGuestPreferenceCatalogues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestPreferenceCatalogues> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [rooms, floors, options] = await Promise.all([
      supabaseAdmin
        .from("room_types")
        .select("id, name, code, active")
        .eq("restaurant_id", data.restaurantId)
        .order("name"),
      supabaseAdmin
        .from("hotel_floors")
        .select("id, name, code, active")
        .eq("restaurant_id", data.restaurantId)
        .order("name"),
      supabaseAdmin
        .from("pms_preference_options")
        .select("id, category, code, name, active, sort_order")
        .eq("restaurant_id", data.restaurantId)
        .order("sort_order")
        .order("name"),
    ]);

    const optionsByCategory = { ...EMPTY_OPTION_MAP };
    let available = true;
    if (options.error) {
      if (!isMissingSchemaError(options.error)) throw new Error(options.error.message);
      available = false;
    } else {
      for (const row of options.data ?? []) {
        const category = row.category as PreferenceOptionCategory;
        if (!optionsByCategory[category]) continue;
        optionsByCategory[category].push({
          id: row.id,
          label: row.name,
          code: row.code,
          category,
          active: row.active,
        });
      }
    }

    return {
      available,
      roomTypes: (rooms.data ?? [])
        .filter((row) => row.active !== false)
        .map((row) => ({ id: row.id, label: row.name, code: row.code ?? undefined })),
      floors: (floors.error && isMissingSchemaError(floors.error) ? [] : (floors.data ?? []))
        .filter((row) => row.active !== false)
        .map((row) => ({ id: row.id, label: row.name, code: row.code ?? undefined })),
      options: optionsByCategory,
    };
  });

/* ------------------------------------------------------------ documents */

export interface GuestDocument {
  id: string;
  kind: GuestDocumentKind;
  idTypeId: string | null;
  typeName: string;
  typeCode: string | null;
  typeActive: boolean;
  documentNumberMasked: string | null;
  issuingCountry: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingAuthority: string | null;
  notes: string | null;
  storagePath: string | null;
  backStoragePath: string | null;
  url: string | null;
  backUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  verificationStatus: GuestDocumentStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface GuestDocumentDetail extends GuestDocument {
  documentNumber: string | null;
}

export type GuestIdentityDocumentTypeOption = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  issuingCountryRequired: boolean;
  expiryDateRequired: boolean;
  documentNumberRequired: boolean;
  scanImageAllowed: boolean;
  validForProfileTypeIds: string[];
};

const documentKindSchema = z.enum(GUEST_DOCUMENT_KINDS);
const documentContentType = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const GUEST_DOCUMENT_SELECT =
  "id, kind, storage_path, back_storage_path, mime_type, size_bytes, verification_status, verified_by_membership_id, verified_at, rejection_reason, created_at, updated_at, id_type_id, document_number, issuing_country, issue_date, expiry_date, issuing_authority, notes";
const GUEST_DOCUMENT_SELECT_LEGACY =
  "id, kind, storage_path, mime_type, size_bytes, verification_status, verified_by_membership_id, verified_at, rejection_reason, created_at";

type GuestDocumentRow = {
  id: string;
  kind: string;
  storage_path: string | null;
  back_storage_path?: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  verification_status: string;
  verified_by_membership_id: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at?: string | null;
  id_type_id?: string | null;
  document_number?: string | null;
  issuing_country?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  issuing_authority?: string | null;
  notes?: string | null;
};

async function loadIdentityDocumentTypes(
  restaurantId: string,
): Promise<GuestIdentityDocumentTypeOption[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin
    .from("pms_guest_id_types")
    .select(
      "id, name, code, active, issuing_country_required, expiry_date_required, document_number_required, scan_image_allowed, valid_for_profile_type_ids",
    )
    .eq("restaurant_id", restaurantId)
    .order("display_order");
  if (result.error) {
    if (isMissingSchemaError(result.error)) return [];
    throw new Error(result.error.message);
  }
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    active: Boolean(row.active),
    issuingCountryRequired: Boolean(row.issuing_country_required),
    expiryDateRequired: Boolean(row.expiry_date_required),
    documentNumberRequired: Boolean(row.document_number_required),
    scanImageAllowed: Boolean(row.scan_image_allowed),
    validForProfileTypeIds: Array.isArray(row.valid_for_profile_type_ids)
      ? (row.valid_for_profile_type_ids as string[])
      : [],
  }));
}

function mapGuestDocumentRow(
  row: GuestDocumentRow,
  types: GuestIdentityDocumentTypeOption[],
  actorNames: Map<string, string>,
  signed: Map<string, string>,
  includeNumber: boolean,
): GuestDocumentDetail {
  const type = row.id_type_id ? types.find((item) => item.id === row.id_type_id) : undefined;
  const kind = (GUEST_DOCUMENT_KINDS as readonly string[]).includes(row.kind)
    ? (row.kind as GuestDocumentKind)
    : "other";
  const number = row.document_number ?? null;
  return {
    id: row.id,
    kind,
    idTypeId: row.id_type_id ?? null,
    typeName: type?.name ?? GUEST_DOCUMENT_KIND_LABELS[kind],
    typeCode: type?.code ?? null,
    typeActive: type?.active ?? true,
    documentNumberMasked: maskedDocumentNumber(number),
    documentNumber: includeNumber ? number : null,
    issuingCountry: row.issuing_country ?? null,
    issueDate: row.issue_date ?? null,
    expiryDate: row.expiry_date ?? null,
    issuingAuthority: row.issuing_authority ?? null,
    notes: row.notes ?? null,
    storagePath: row.storage_path,
    backStoragePath: row.back_storage_path ?? null,
    url: row.storage_path ? (signed.get(row.storage_path) ?? null) : null,
    backUrl: row.back_storage_path ? (signed.get(row.back_storage_path) ?? null) : null,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    verificationStatus: row.verification_status as GuestDocumentStatus,
    verifiedByName: row.verified_by_membership_id
      ? (actorNames.get(row.verified_by_membership_id) ?? "Staff member")
      : null,
    verifiedAt: row.verified_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

function validateDocumentFields(
  type: GuestIdentityDocumentTypeOption,
  input: {
    documentNumber: string | null;
    issuingCountry: string | null;
    expiryDate: string | null;
  },
): string | null {
  if (type.documentNumberRequired && !input.documentNumber) return "Document number is required.";
  if (type.issuingCountryRequired && !input.issuingCountry) return "Issuing country is required.";
  if (type.expiryDateRequired && !input.expiryDate) return "Expiry date is required.";
  return null;
}

export const createGuestDocumentUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        contentType: documentContentType,
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { data: guest, error } = await context.supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (error && isMissingSchemaError(error))
      return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
    if (!guest) return { ok: false as const, message: "That guest could not be found." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = guestDocumentPath(
      data.restaurantId,
      data.guestId,
      GUEST_IMAGE_EXT_BY_TYPE[data.contentType] ?? "bin",
    );
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(ROOM_BUCKET)
      .createSignedUploadUrl(path);
    if (signedError || !signed)
      return { ok: false as const, message: "Could not start the upload." };
    return { ok: true as const, path, token: signed.token };
  });

export const registerGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        storagePath: z.string().trim().min(1).max(500),
        kind: documentKindSchema,
        mimeType: documentContentType,
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const prefix = `${data.restaurantId}/guests/${data.guestId}/`;
    if (!data.storagePath.startsWith(prefix)) {
      return { ok: false as const, message: "Invalid document reference." };
    }

    const { error } = await context.supabase.from("guest_documents").insert({
      restaurant_id: data.restaurantId,
      guest_id: data.guestId,
      kind: data.kind,
      storage_path: data.storagePath,
      mime_type: data.mimeType,
      size_bytes: data.size,
      uploaded_by_membership_id: me.id,
    });
    if (error) {
      if (isMissingSchemaError(error))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      return { ok: false as const, message: error.message };
    }

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "document_uploaded",
      newValues: { kind: data.kind, storage_path: data.storagePath },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listGuestDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ available: boolean; documents: GuestDocument[] }> => {
      await requireGuestManager(context as never, data.restaurantId);
      let query = context.supabase
        .from("guest_documents")
        .select(GUEST_DOCUMENT_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .order("created_at", { ascending: false });
      let { data: rows, error } = await query;
      if (error && isMissingSchemaError(error)) {
        const legacy = await context.supabase
          .from("guest_documents")
          .select(GUEST_DOCUMENT_SELECT_LEGACY)
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .order("created_at", { ascending: false });
        rows = legacy.data;
        error = legacy.error;
        if (error && isMissingSchemaError(error)) return { available: false, documents: [] };
      }
      if (error) throw new Error(error.message);

      const types = await loadIdentityDocumentTypes(data.restaurantId);
      const actorNames = await resolveActorNames(
        data.restaurantId,
        (rows ?? []).map((row) => (row as GuestDocumentRow).verified_by_membership_id),
      );
      const paths = (rows ?? []).flatMap((row) => {
        const item = row as GuestDocumentRow;
        return [item.storage_path, item.back_storage_path].filter(Boolean) as string[];
      });
      const signed = await signRoomImages(paths);
      return {
        available: true,
        documents: (rows ?? []).map((row) => {
          const mapped = mapGuestDocumentRow(
            row as GuestDocumentRow,
            types,
            actorNames,
            signed,
            false,
          );
          const { documentNumber: _hidden, ...listRow } = mapped;
          return listRow;
        }),
      };
    },
  );

export const reviewGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        documentId: idSchema,
        status: z.enum(["verified", "rejected"]),
        reason: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const now = new Date().toISOString();
    const { data: updated, error } = await context.supabase
      .from("guest_documents")
      .update({
        verification_status: data.status,
        verified_by_membership_id: me.id,
        verified_at: now,
        rejection_reason: data.status === "rejected" ? blankToNull(data.reason) : null,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId)
      .select("id, verification_status")
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      return { ok: false as const, message: error.message };
    }
    if (!updated) return { ok: false as const, message: "That document could not be found." };

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: data.status === "verified" ? "document_verified" : "document_rejected",
      newValues: {
        document_id: data.documentId,
        verification_status: data.status,
        reason: blankToNull(data.reason),
      },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const listGuestIdentityDocumentTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<{ types: GuestIdentityDocumentTypeOption[] }> => {
    await requireGuestManager(context as never, data.restaurantId);
    return { types: await loadIdentityDocumentTypes(data.restaurantId) };
  });

export const getGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, documentId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; document: GuestDocumentDetail } | { ok: false; message: string }> => {
      await requireGuestManager(context as never, data.restaurantId);
      const { data: row, error } = await context.supabase
        .from("guest_documents")
        .select(GUEST_DOCUMENT_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .eq("id", data.documentId)
        .maybeSingle();
      if (error) {
        if (isMissingSchemaError(error))
          return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
        return { ok: false as const, message: error.message };
      }
      if (!row) return { ok: false as const, message: "That document could not be found." };
      const types = await loadIdentityDocumentTypes(data.restaurantId);
      const actorNames = await resolveActorNames(data.restaurantId, [
        (row as GuestDocumentRow).verified_by_membership_id,
      ]);
      const item = row as GuestDocumentRow;
      const signed = await signRoomImages(
        [item.storage_path, item.back_storage_path].filter(Boolean) as string[],
      );
      return {
        ok: true as const,
        document: mapGuestDocumentRow(item, types, actorNames, signed, true),
      };
    },
  );

export const saveGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        documentId: idSchema.optional(),
        idTypeId: idSchema,
        documentNumber: z.string().max(120).optional().nullable(),
        issuingCountry: z.string().max(8).optional().nullable(),
        issueDate: z.string().max(20).optional().nullable(),
        expiryDate: z.string().max(20).optional().nullable(),
        issuingAuthority: z.string().max(200).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const types = await loadIdentityDocumentTypes(data.restaurantId);
      const type = types.find((item) => item.id === data.idTypeId);
      if (!type) return { ok: false as const, message: "That document type could not be found." };

      const { data: guest, error: guestError } = await context.supabase
        .from("guest_profiles")
        .select("id, profile_type_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
      if (guestError && isMissingSchemaError(guestError))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      if (!guest) return { ok: false as const, message: "That guest could not be found." };
      const profileTypeId = (guest as { profile_type_id?: string | null }).profile_type_id ?? null;

      let existingTypeId: string | null = null;
      if (data.documentId) {
        const existing = await context.supabase
          .from("guest_documents")
          .select("id, id_type_id")
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .eq("id", data.documentId)
          .maybeSingle();
        if (existing.error)
          return { ok: false as const, message: existing.error.message };
        if (!existing.data) return { ok: false as const, message: "That document could not be found." };
        existingTypeId = (existing.data as { id_type_id?: string | null }).id_type_id ?? null;
      }

      if (!data.documentId || existingTypeId !== data.idTypeId) {
        if (!typeAllowedForNewDocument(type, profileTypeId)) {
          return {
            ok: false as const,
            message: type.active
              ? "That document type is not available for this guest type."
              : "Inactive document types cannot be used for new documents.",
          };
        }
      }

      const documentNumber = blankToNull(data.documentNumber);
      const issuingCountry = blankToNull(data.issuingCountry);
      const expiryDate = blankToNull(data.expiryDate);
      const requiredError = validateDocumentFields(type, {
        documentNumber,
        issuingCountry,
        expiryDate,
      });
      if (requiredError) return { ok: false as const, message: requiredError };

      const payload = {
        id_type_id: data.idTypeId,
        kind: kindFromTypeCode(type.code),
        document_number: documentNumber,
        issuing_country: issuingCountry,
        issue_date: blankToNull(data.issueDate),
        expiry_date: expiryDate,
        issuing_authority: blankToNull(data.issuingAuthority),
        notes: blankToNull(data.notes),
      };

      if (data.documentId) {
        const { error } = await context.supabase
          .from("guest_documents")
          .update(payload)
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .eq("id", data.documentId);
        if (error) {
          if (isMissingSchemaError(error))
            return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
          return { ok: false as const, message: error.message };
        }
        await recordGuestEvent({
          restaurantId: data.restaurantId,
          guestId: data.guestId,
          eventType: "document_updated",
          newValues: { document_id: data.documentId, id_type_id: data.idTypeId },
          actorMembershipId: me.id,
        });
        return { ok: true as const, documentId: data.documentId };
      }

      const { data: inserted, error } = await context.supabase
        .from("guest_documents")
        .insert({
          restaurant_id: data.restaurantId,
          guest_id: data.guestId,
          uploaded_by_membership_id: me.id,
          ...payload,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        if (error && isMissingSchemaError(error))
          return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
        return { ok: false as const, message: error?.message ?? "Could not save the document." };
      }
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "document_uploaded",
        newValues: { document_id: inserted.id, id_type_id: data.idTypeId },
        actorMembershipId: me.id,
      });
      return { ok: true as const, documentId: inserted.id as string };
    },
  );

export const saveGuestDocumentImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        documentId: idSchema,
        side: z.enum(["front", "back"]),
        storagePath: z.string().trim().min(1).max(500),
        mimeType: documentContentType,
        size: z
          .number()
          .int()
          .positive()
          .max(8 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const prefix = `${data.restaurantId}/guests/${data.guestId}/`;
    if (!data.storagePath.startsWith(prefix)) {
      return { ok: false as const, message: "Invalid document reference." };
    }
    const types = await loadIdentityDocumentTypes(data.restaurantId);
    const { data: row, error: loadError } = await context.supabase
      .from("guest_documents")
      .select("id, id_type_id, storage_path, back_storage_path")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId)
      .maybeSingle();
    if (loadError) return { ok: false as const, message: loadError.message };
    if (!row) return { ok: false as const, message: "That document could not be found." };
    const type = types.find((item) => item.id === (row as { id_type_id?: string | null }).id_type_id);
    if (type && !type.scanImageAllowed) {
      return { ok: false as const, message: "Images are not allowed for this document type." };
    }
    const patch =
      data.side === "front"
        ? { storage_path: data.storagePath, mime_type: data.mimeType, size_bytes: data.size }
        : { back_storage_path: data.storagePath };
    const previous =
      data.side === "front"
        ? (row as { storage_path?: string | null }).storage_path
        : (row as { back_storage_path?: string | null }).back_storage_path;
    const { error } = await context.supabase
      .from("guest_documents")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId);
    if (error) {
      if (isMissingSchemaError(error))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      return { ok: false as const, message: error.message };
    }
    if (previous && previous !== data.storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(ROOM_BUCKET).remove([previous]);
    }
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "document_updated",
      newValues: { document_id: data.documentId, side: data.side },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const clearGuestDocumentImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        documentId: idSchema,
        side: z.enum(["front", "back"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { data: row, error: loadError } = await context.supabase
      .from("guest_documents")
      .select("id, storage_path, back_storage_path")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId)
      .maybeSingle();
    if (loadError) return { ok: false as const, message: loadError.message };
    if (!row) return { ok: false as const, message: "That document could not be found." };
    const path =
      data.side === "front"
        ? (row as { storage_path?: string | null }).storage_path
        : (row as { back_storage_path?: string | null }).back_storage_path;
    const patch =
      data.side === "front" ? { storage_path: null } : { back_storage_path: null };
    const { error } = await context.supabase
      .from("guest_documents")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId);
    if (error) {
      if (isMissingSchemaError(error))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      return { ok: false as const, message: error.message };
    }
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(ROOM_BUCKET).remove([path]);
    }
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "document_updated",
      newValues: { document_id: data.documentId, cleared: data.side },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

export const deleteGuestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema, documentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { data: row, error: loadError } = await context.supabase
      .from("guest_documents")
      .select("id, storage_path, back_storage_path")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId)
      .maybeSingle();
    if (loadError) return { ok: false as const, message: loadError.message };
    if (!row) return { ok: false as const, message: "That document could not be found." };
    const { error } = await context.supabase
      .from("guest_documents")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.guestId)
      .eq("id", data.documentId);
    if (error) {
      if (isMissingSchemaError(error))
        return { ok: false as const, message: WAVE2_MIGRATION_UNAVAILABLE };
      return { ok: false as const, message: error.message };
    }
    const paths = [
      (row as { storage_path?: string | null }).storage_path,
      (row as { back_storage_path?: string | null }).back_storage_path,
    ].filter(Boolean) as string[];
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(ROOM_BUCKET).remove(paths);
    }
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "document_deleted",
      newValues: { document_id: data.documentId },
      actorMembershipId: me.id,
    });
    return { ok: true as const };
  });

/* -------------------------------------------------------------- consent */

export const saveGuestConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        dataProcessing: z.enum(GUEST_CONSENT_STATES),
        marketing: z.enum(GUEST_CONSENT_STATES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const now = new Date().toISOString();

    const { data: before, error: beforeError } = await context.supabase
      .from("guest_profiles")
      .select("id, data_processing_consent, marketing_consent")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (beforeError) {
      if (isMissingSchemaError(beforeError)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(beforeError.message);
    }
    if (!before) throw new Error("That guest could not be found.");

    const columns = {
      data_processing_consent: data.dataProcessing,
      marketing_consent: data.marketing,
      data_processing_consent_recorded_at: data.dataProcessing === "not_asked" ? null : now,
      data_processing_consent_recorded_by: data.dataProcessing === "not_asked" ? null : me.id,
      marketing_consent_recorded_at: data.marketing === "not_asked" ? null : now,
      marketing_consent_recorded_by: data.marketing === "not_asked" ? null : me.id,
    };

    const { error } = await context.supabase
      .from("guest_profiles")
      .update(columns)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(error.message);
    }

    if (
      before.data_processing_consent !== data.dataProcessing ||
      before.marketing_consent !== data.marketing
    ) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "consent_updated",
        previousValues: {
          data_processing_consent: before.data_processing_consent,
          marketing_consent: before.marketing_consent,
        },
        newValues: {
          data_processing_consent: data.dataProcessing,
          marketing_consent: data.marketing,
        },
        actorMembershipId: me.id,
      });
    }
    return { ok: true };
  });

/* ---------------------------------------------------------------- merge */

const MERGE_PROFILE_KEYS = [
  "last_name",
  "phone",
  "email",
  "nationality",
  "language",
  "date_of_birth",
  "address_line1",
  "address_line2",
  "city",
  "region",
  "country",
  "postal_code",
  "id_document_type",
  "id_document_number",
  "id_document_expiry",
  "notes",
] as const;

const MERGE_PREF_KEYS = [
  "room_preference",
  "bed_preference",
  "floor_preference",
  "view_preference",
  "food_preference",
  "communication_preference",
  "accessibility_requirements",
  "special_requests",
] as const;

export const mergeGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        survivorId: idSchema,
        retiredId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    if (data.survivorId === data.retiredId) {
      throw new Error("Choose two different guests to merge.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let rowsResult = await fromTable(supabaseAdmin, "guest_profiles")
      .select(GUEST_COLUMNS_W5)
      .eq("restaurant_id", data.restaurantId)
      .in("id", [data.survivorId, data.retiredId]);
    if (rowsResult.error && isMissingSchemaError(rowsResult.error)) {
      rowsResult = await fromTable(supabaseAdmin, "guest_profiles")
        .select(GUEST_COLUMNS_W2)
        .eq("restaurant_id", data.restaurantId)
        .in("id", [data.survivorId, data.retiredId]);
    }
    const { data: rows, error } = rowsResult;
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(error.message);
    }
    const survivor = ((rows ?? []) as GuestRow[]).find((row) => row.id === data.survivorId);
    const retired = ((rows ?? []) as GuestRow[]).find((row) => row.id === data.retiredId);
    if (!survivor || !retired) throw new Error("Both guests must belong to this property.");
    if (survivor.merged_into_guest_id || retired.merged_into_guest_id) {
      throw new Error("A merged guest cannot be merged again.");
    }
    if (survivor.anonymised_at || retired.anonymised_at) {
      throw new Error("An anonymised profile cannot be merged.");
    }

    const winner: Record<string, unknown> = {};
    const previousSurvivorProfile: Record<string, unknown> = {};
    for (const key of MERGE_PROFILE_KEYS) {
      const current = (survivor as Record<string, unknown>)[key];
      const incoming = (retired as Record<string, unknown>)[key];
      if ((current == null || current === "") && incoming != null && incoming !== "") {
        winner[key] = incoming;
        previousSurvivorProfile[key] = current ?? null;
      }
    }
    if (!survivor.vip_status && retired.vip_status) {
      winner["vip_status"] = true;
      previousSurvivorProfile["vip_status"] = false;
    }

    if (Object.keys(winner).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("guest_profiles")
        .update(winner as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.survivorId);
      if (updateError) throw new Error(updateError.message);
    }

    const { data: prefRows } = await supabaseAdmin
      .from("guest_preferences")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .in("guest_id", [data.survivorId, data.retiredId]);
    const survivorPrefs = (prefRows ?? []).find((row) => row.guest_id === data.survivorId);
    const retiredPrefs = (prefRows ?? []).find((row) => row.guest_id === data.retiredId);
    const prefWinner: Record<string, unknown> = {};
    const previousSurvivorPrefs: Record<string, unknown> = {};
    if (retiredPrefs) {
      for (const key of MERGE_PREF_KEYS) {
        const current = survivorPrefs?.[key];
        const incoming = retiredPrefs[key];
        if ((current == null || current === "") && incoming != null && incoming !== "") {
          prefWinner[key] = incoming;
          previousSurvivorPrefs[key] = current ?? null;
        }
      }
      if (Object.keys(prefWinner).length > 0) {
        if (survivorPrefs) {
          await supabaseAdmin
            .from("guest_preferences")
            .update(prefWinner as never)
            .eq("restaurant_id", data.restaurantId)
            .eq("guest_id", data.survivorId);
        } else {
          await supabaseAdmin.from("guest_preferences").insert({
            ...(prefWinner as Record<string, string | null>),
            restaurant_id: data.restaurantId,
            guest_id: data.survivorId,
          } as never);
        }
      }
    }

    const consentWinner: Record<string, unknown> = {};
    const previousSurvivorConsent: Record<string, unknown> = {};
    if (
      toConsentState(survivor.data_processing_consent) === "not_asked" &&
      toConsentState(retired.data_processing_consent) !== "not_asked"
    ) {
      previousSurvivorConsent["data_processing_consent"] = survivor.data_processing_consent;
      previousSurvivorConsent["data_processing_consent_recorded_at"] =
        survivor.data_processing_consent_recorded_at;
      previousSurvivorConsent["data_processing_consent_recorded_by"] =
        survivor.data_processing_consent_recorded_by;
      consentWinner["data_processing_consent"] = retired.data_processing_consent;
      consentWinner["data_processing_consent_recorded_at"] =
        retired.data_processing_consent_recorded_at;
      consentWinner["data_processing_consent_recorded_by"] =
        retired.data_processing_consent_recorded_by;
    }
    if (
      toConsentState(survivor.marketing_consent) === "not_asked" &&
      toConsentState(retired.marketing_consent) !== "not_asked"
    ) {
      previousSurvivorConsent["marketing_consent"] = survivor.marketing_consent;
      previousSurvivorConsent["marketing_consent_recorded_at"] =
        survivor.marketing_consent_recorded_at;
      previousSurvivorConsent["marketing_consent_recorded_by"] =
        survivor.marketing_consent_recorded_by;
      consentWinner["marketing_consent"] = retired.marketing_consent;
      consentWinner["marketing_consent_recorded_at"] = retired.marketing_consent_recorded_at;
      consentWinner["marketing_consent_recorded_by"] = retired.marketing_consent_recorded_by;
    }
    if (Object.keys(consentWinner).length > 0) {
      await supabaseAdmin
        .from("guest_profiles")
        .update(consentWinner as never)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.survivorId);
    }

    const { data: documentRows } = await supabaseAdmin
      .from("guest_documents")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    const movedDocumentIds = ((documentRows ?? []) as Array<{ id: string }>).map((row) => row.id);

    const docs = await supabaseAdmin
      .from("guest_documents")
      .update({ guest_id: data.survivorId })
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    if (docs.error && !isMissingSchemaError(docs.error)) throw new Error(docs.error.message);

    const { data: reservationRows } = await supabaseAdmin
      .from("hotel_reservations")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    const movedReservationIds = ((reservationRows ?? []) as Array<{ id: string }>).map(
      (row) => row.id,
    );

    const reservations = await supabaseAdmin
      .from("hotel_reservations")
      .update({ guest_id: data.survivorId })
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    if (reservations.error) throw new Error(reservations.error.message);

    const wave4 = supabaseAdmin as unknown as { from: (table: string) => any };
    const retiredLinks = await wave4
      .from("guest_account_links")
      .select("id, master_id, role")
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    if (retiredLinks.error && !isMissingSchemaError(retiredLinks.error)) {
      throw new Error(retiredLinks.error.message);
    }
    const movedLinkIds: string[] = [];
    const deletedLinkIds: string[] = [];
    for (const link of (retiredLinks.data ?? []) as Array<{
      id: string;
      master_id: string;
      role: string;
    }>) {
      const existing = await wave4
        .from("guest_account_links")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.survivorId)
        .eq("master_id", link.master_id)
        .eq("role", link.role)
        .maybeSingle();
      if (existing.error && !isMissingSchemaError(existing.error))
        throw new Error(existing.error.message);
      if (existing.data) {
        deletedLinkIds.push(link.id);
        await wave4
          .from("guest_account_links")
          .delete()
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.id);
      } else {
        movedLinkIds.push(link.id);
        const moved = await wave4
          .from("guest_account_links")
          .update({ guest_id: data.survivorId })
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.id);
        if (moved.error && !isMissingSchemaError(moved.error)) throw new Error(moved.error.message);
      }
    }

    const { error: retireError } = await supabaseAdmin
      .from("guest_profiles")
      .update({
        guest_status: "inactive",
        merged_into_guest_id: data.survivorId,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.retiredId);
    if (retireError) {
      if (isMissingSchemaError(retireError)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(retireError.message);
    }

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.survivorId,
      eventType: "merged_from",
      newValues: {
        survivor_id: data.survivorId,
        retired_id: data.retiredId,
        retired_name: fullName(retired.first_name, retired.last_name),
      },
      notes: `Merged from ${fullName(retired.first_name, retired.last_name)}`,
      actorMembershipId: me.id,
    });
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.retiredId,
      eventType: "merged_into",
      newValues: {
        survivor_id: data.survivorId,
        retired_id: data.retiredId,
        survivor_name: fullName(survivor.first_name, survivor.last_name),
      },
      notes: `Merged into ${fullName(survivor.first_name, survivor.last_name)}`,
      actorMembershipId: me.id,
    });

    const ledgerPayload: GuestMergeLedgerPayload = {
      copiedProfile: winner,
      previousSurvivorProfile,
      copiedPrefs: prefWinner,
      previousSurvivorPrefs:
        Object.keys(previousSurvivorPrefs).length > 0 ? previousSurvivorPrefs : null,
      copiedConsent: consentWinner,
      previousSurvivorConsent,
      movedReservationIds,
      movedDocumentIds,
      movedLinkIds,
      deletedLinkIds,
      retiredStatus: retired.guest_status,
    };
    const ledger = await (supabaseAdmin as unknown as { from: (table: string) => any })
      .from("guest_merge_ledger")
      .insert({
        restaurant_id: data.restaurantId,
        survivor_id: data.survivorId,
        retired_id: data.retiredId,
        payload: ledgerPayload,
        created_by_staff_membership_id: me.id,
      });
    if (ledger.error && !isMissingSchemaError(ledger.error)) throw new Error(ledger.error.message);

    return { ok: true as const, survivorId: data.survivorId, retiredId: data.retiredId };
  });

/* ----------------------------------------------------------- Wave 3 stays */

const GUEST_STAY_SELECT = `
  id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date,
  status, currency, room_subtotal, adults, children, source, commercial_booking_source,
  rate_plan_id, created_at,
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

const GUEST_STAY_SELECT_BARE =
  "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, status, currency, room_subtotal, adults, children, source, commercial_booking_source, rate_plan_id, created_at";

const GUEST_STAY_SELECT_LEGACY =
  "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, status, currency, room_subtotal";

type GuestStayRow = {
  id: string;
  confirmation_number: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  currency: string | null;
  room_subtotal: number | string | null;
  adults?: number | null;
  children?: number | null;
  source?: string | null;
  commercial_booking_source?: string | null;
  rate_plan_id?: string | null;
  created_at?: string | null;
  room_types?: { name: string } | null;
  hotel_rooms?: { room_number: string } | null;
};

const CASHIER_ACCESS_ROLES = ["owner", "manager", "cashier", "accountant"] as const;

export function guestStayAccessForRole(role: string): GuestStayAccess {
  return {
    reservation: canManageReservations(role),
    frontOffice: canManageReservations(role),
    folio: (CASHIER_ACCESS_ROLES as readonly string[]).includes(role),
  };
}

function folioTotals(rows: { amount: number }[]): number {
  let charges = 0;
  let credits = 0;
  for (const row of rows) {
    if (row.amount >= 0) charges += row.amount;
    else credits += -row.amount;
  }
  return Math.round((charges - credits) * 100) / 100;
}

async function decorateGuestStayCatalogues(
  restaurantId: string,
  stays: GuestStay[],
  rows: GuestStayRow[],
): Promise<GuestStay[]> {
  if (stays.length === 0) return stays;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rateIds = [
    ...new Set(rows.map((row) => row.rate_plan_id).filter((id): id is string => Boolean(id))),
  ];
  const sourceKeys = [
    ...new Set(
      rows
        .map((row) => row.commercial_booking_source)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const rateById = new Map<string, string>();
  if (rateIds.length > 0) {
    const { data: plans } = await supabaseAdmin
      .from("hotel_rate_plans")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .in("id", rateIds);
    for (const plan of (plans ?? []) as Array<{ id: string; name: string }>) {
      rateById.set(plan.id, plan.name);
    }
  }

  const sourceByKey = new Map<string, string>();
  if (sourceKeys.length > 0) {
    const { data: sources } = await supabaseAdmin
      .from("pms_source_codes")
      .select("id, code, name")
      .eq("restaurant_id", restaurantId);
    for (const source of (sources ?? []) as Array<{ id: string; code: string; name: string }>) {
      sourceByKey.set(source.id, source.name);
      sourceByKey.set(source.code, source.name);
    }
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  return stays.map((stay) => {
    const row = rowById.get(stay.id);
    const commercial = row?.commercial_booking_source?.trim() || "";
    const operational = row?.source?.trim() || "";
    const sourceLabel =
      (commercial && sourceByKey.get(commercial)) ||
      commercial ||
      operational ||
      stay.sourceLabel;
    const ratePlanName = (row?.rate_plan_id && rateById.get(row.rate_plan_id)) || stay.ratePlanName;
    return { ...stay, ratePlanName, sourceLabel };
  });
}

export async function loadGuestStaysForProfile(
  context: { supabase: { from: (table: string) => any } },
  restaurantId: string,
  guestId: string,
  access: GuestStayAccess,
): Promise<GuestStay[]> {
  let result = await context.supabase
    .from("hotel_reservations")
    .select(GUEST_STAY_SELECT)
    .eq("restaurant_id", restaurantId)
    .eq("guest_id", guestId)
    .order("arrival_date", { ascending: false });

  if (result.error && isReservationRlsBlocked(result.error)) {
    throw new Error(WAVE3_RESERVATION_RLS_BLOCKED);
  }
  if (result.error) {
    result = await context.supabase
      .from("hotel_reservations")
      .select(GUEST_STAY_SELECT_BARE)
      .eq("restaurant_id", restaurantId)
      .eq("guest_id", guestId)
      .order("arrival_date", { ascending: false });
  }
  if (result.error && isReservationRlsBlocked(result.error)) {
    throw new Error(WAVE3_RESERVATION_RLS_BLOCKED);
  }
  if (result.error) {
    result = await context.supabase
      .from("hotel_reservations")
      .select(GUEST_STAY_SELECT_LEGACY)
      .eq("restaurant_id", restaurantId)
      .eq("guest_id", guestId)
      .order("arrival_date", { ascending: false });
  }
  if (result.error && isReservationRlsBlocked(result.error)) {
    throw new Error(WAVE3_RESERVATION_RLS_BLOCKED);
  }
  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as GuestStayRow[];
  let stays = rows.map((row) =>
    mapReservationToStay({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status as ReservationStatus,
      roomId: row.room_id,
      roomTypeName: row.room_types?.name ?? null,
      roomNumber: row.hotel_rooms?.room_number ?? null,
      roomSubtotal:
        row.room_subtotal === null || row.room_subtotal === undefined
          ? null
          : Number(row.room_subtotal),
      currency: row.currency,
      adults: row.adults ?? 0,
      children: row.children ?? 0,
      createdAt: row.created_at ?? null,
      sourceLabel: row.commercial_booking_source || row.source || null,
    }),
  );

  stays = await decorateGuestStayCatalogues(restaurantId, stays, rows);

  if (!access.folio || stays.length === 0) return stays;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: folios, error: folioError } = await supabaseAdmin
    .from("guest_folios")
    .select("id, folio_number, reservation_id, currency")
    .eq("restaurant_id", restaurantId)
    .in(
      "reservation_id",
      stays.map((stay) => stay.id),
    );
  if (folioError) throw new Error(folioError.message);

  const folioRows = (folios ?? []) as Array<{
    id: string;
    folio_number: string;
    reservation_id: string | null;
    currency: string | null;
  }>;
  if (folioRows.length === 0) return stays;

  const folioIds = folioRows.map((folio) => folio.id);
  const { data: txns } = await supabaseAdmin
    .from("folio_transactions")
    .select("folio_id, amount")
    .eq("restaurant_id", restaurantId)
    .in("folio_id", folioIds);
  const byFolio = new Map<string, { amount: number }[]>();
  for (const txn of (txns ?? []) as { folio_id: string; amount: number | string }[]) {
    const bucket = byFolio.get(txn.folio_id) ?? [];
    bucket.push({ amount: Number(txn.amount) });
    byFolio.set(txn.folio_id, bucket);
  }

  const folioByReservation = new Map<
    string,
    { id: string; folioNumber: string; balance: number; currency: string | null }
  >();
  for (const folio of folioRows) {
    if (!folio.reservation_id) continue;
    folioByReservation.set(folio.reservation_id, {
      id: folio.id,
      folioNumber: folio.folio_number,
      balance: folioTotals(byFolio.get(folio.id) ?? []),
      currency: folio.currency,
    });
  }

  return stays.map((stay) => {
    const folio = folioByReservation.get(stay.id);
    if (!folio) return stay;
    return {
      ...stay,
      folioId: folio.id,
      folioNumber: folio.folioNumber,
      folioBalance: folio.balance,
      currency: stay.currency ?? folio.currency,
    };
  });
}

export const listGuestStays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ stays: GuestStay[]; access: GuestStayAccess }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const access = guestStayAccessForRole(me.role);
    const stays = await loadGuestStaysForProfile(
      context as never,
      data.restaurantId,
      data.guestId,
      access,
    );
    return { stays, access };
  });

export const getGuestBookingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, guestId: idSchema, reservationId: idSchema })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ timeline: GuestBookingHistoryEvent[] }> => {
      await requireGuestManager(context as never, data.restaurantId);

      const { data: reservation, error } = await context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (error && isReservationRlsBlocked(error)) {
        throw new Error(WAVE3_RESERVATION_RLS_BLOCKED);
      }
      if (error) throw new Error(error.message);
      if (!reservation) throw new Error("Reservation not found for this guest.");

      let eventsResult = await context.supabase
        .from("hotel_reservation_history")
        .select("id, event_type, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (eventsResult.error && isReservationRlsBlocked(eventsResult.error)) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        eventsResult = await supabaseAdmin
          .from("hotel_reservation_history")
          .select("id, event_type, notes, created_at")
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId)
          .order("created_at", { ascending: true })
          .limit(100);
      }
      if (eventsResult.error) throw new Error(eventsResult.error.message);

      const timeline: GuestBookingHistoryEvent[] = (
        (eventsResult.data ?? []) as Array<{
          id: string;
          event_type: string;
          notes: string | null;
          created_at: string;
        }>
      ).map((event) => ({
        id: event.id,
        eventKind: event.event_type,
        label: bookingTimelineLabel(event.event_type),
        createdAt: event.created_at,
        notes: event.notes,
      }));

      return { timeline };
    },
  );

export const getGuestStayOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestStayOverview> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const access = guestStayAccessForRole(me.role);
    const stays = await loadGuestStaysForProfile(
      context as never,
      data.restaurantId,
      data.guestId,
      access,
    );

    const { data: restaurant } = await context.supabase
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const today = propertyToday((restaurant as { timezone?: string } | null)?.timezone ?? "UTC");
    return deriveStayOverview(stays, today, access);
  });
