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
import { ROOM_BUCKET, signRoomImages } from "./rooms.server";
import {
  GUEST_CONSENT_STATES,
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
import { CASHIER_ACCESS_ROLES } from "./cashiering.server";
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
}

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

const GUEST_COLUMNS_BASE =
  "id, first_name, last_name, phone, email, nationality, language, date_of_birth, address_line1, address_line2, city, region, country, postal_code, id_document_type, id_document_number, id_document_expiry, guest_status, vip_status, notes, linked_customer_user_id, created_at, updated_at";
const GUEST_COLUMNS_W2 = `${GUEST_COLUMNS_BASE}, merged_into_guest_id, data_processing_consent, data_processing_consent_recorded_at, data_processing_consent_recorded_by, marketing_consent, marketing_consent_recorded_at, marketing_consent_recorded_by`;
const GUEST_COLUMNS_W5 = `${GUEST_COLUMNS_W2}, anonymised_at, anonymised_by_membership_id`;
const GUEST_COLUMNS_GE2 = `${GUEST_COLUMNS_W5}, title, middle_name, preferred_name, gender, phone_alt, email_alt, employment_position, department, source_of_business, restricted, blacklisted, restriction_severity, restriction_reason, restriction_set_by_membership_id, restriction_set_at, restriction_until`;

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

export const listGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().max(120).optional(),
        status: z.enum(GUEST_STATUSES).optional(),
        vipOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestSummary[]> => {
    await requireGuestManager(context as never, data.restaurantId);

    const applyFilters = (columns: string, excludeMerged: boolean) => {
      let query = context.supabase
        .from("guest_profiles")
        .select(columns)
        .eq("restaurant_id", data.restaurantId)
        .order("updated_at", { ascending: false })
        .limit(data.limit ?? 100);
      if (excludeMerged) query = query.is("merged_into_guest_id", null);
      if (data.status) query = query.eq("guest_status", data.status);
      if (data.vipOnly) query = query.eq("vip_status", true);
      const term = (data.search ?? "").trim();
      if (term) {
        const like = `%${term.replace(/[%,]/g, "")}%`;
        const digits = normalizePhone(term);
        const parts = [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `email.ilike.${like}`,
          `phone.ilike.${like}`,
        ];
        if (digits) parts.push(`phone_normalized.ilike.%${digits}%`);
        query = query.or(parts.join(","));
      }
      return query;
    };

    let result = await applyFilters(GUEST_COLUMNS_GE2, true);
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_W5, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_W2, true);
    }
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_BASE, false);
    }
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as unknown as GuestRow[]).map(toSummary);
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

/* ------------------------------------------------------------ duplicates */

export const findGuestDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        excludeGuestId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestSummary[]> => {
    await requireGuestManager(context as never, data.restaurantId);

    const email = normalizeEmail(data.email);
    const phone = normalizePhone(data.phone);
    if (!email && !phone) return [];

    const filters: string[] = [];
    if (email) filters.push(`email_normalized.eq.${email}`);
    if (phone) filters.push(`phone_normalized.eq.${phone}`);

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
        .select(GUEST_COLUMNS_GE2)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rules = await loadGuestProfileRules(supabaseAdmin, data.restaurantId);
    const blocked = guestCreateBlocked(rules, data.guest);
    if (blocked) throw new Error(blocked);
    const columns = toColumns(data.guest);
    const restrictionOn = columns.restricted || columns.blacklisted;
    const insertRow = {
      ...columns,
      restaurant_id: data.restaurantId,
      created_by_staff_membership_id: me.id,
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
      .select(`${GUEST_COLUMNS_GE2}`)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
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
    return { ok: true };
  });

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
  storagePath: string;
  url: string | null;
  mimeType: string;
  sizeBytes: number;
  verificationStatus: GuestDocumentStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

const documentKindSchema = z.enum(GUEST_DOCUMENT_KINDS);
const documentContentType = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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
      const { data: rows, error } = await context.supabase
        .from("guest_documents")
        .select(
          "id, kind, storage_path, mime_type, size_bytes, verification_status, verified_by_membership_id, verified_at, rejection_reason, created_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("guest_id", data.guestId)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingSchemaError(error)) return { available: false, documents: [] };
        throw new Error(error.message);
      }

      const actorNames = await resolveActorNames(
        data.restaurantId,
        (rows ?? []).map((row) => row.verified_by_membership_id),
      );
      const signed = await signRoomImages((rows ?? []).map((row) => row.storage_path));
      return {
        available: true,
        documents: (rows ?? []).map((row) => ({
          id: row.id,
          kind: row.kind as GuestDocumentKind,
          storagePath: row.storage_path,
          url: signed.get(row.storage_path) ?? null,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          verificationStatus: row.verification_status as GuestDocumentStatus,
          verifiedByName: row.verified_by_membership_id
            ? (actorNames.get(row.verified_by_membership_id) ?? "Staff member")
            : null,
          verifiedAt: row.verified_at,
          rejectionReason: row.rejection_reason,
          createdAt: row.created_at,
        })),
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
  status, currency, room_subtotal,
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

const GUEST_STAY_SELECT_BARE =
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
  room_types?: { name: string } | null;
  hotel_rooms?: { room_number: string } | null;
};

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
  if (result.error) throw new Error(result.error.message);

  const rows = (result.data ?? []) as GuestStayRow[];
  const stays = rows.map((row) =>
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
    }),
  );

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
