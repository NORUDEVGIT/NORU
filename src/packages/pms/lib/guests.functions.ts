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
  type GuestEventType,
  type GuestStatus,
} from "./guests.server";
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

const idSchema = z.string().uuid();

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
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: fullName(row.first_name, row.last_name),
    phone: row.phone,
    email: row.email,
    nationality: row.nationality,
    vipStatus: row.vip_status,
    guestStatus: row.guest_status as GuestStatus,
    updatedAt: row.updated_at,
    idDocumentNumber: row.id_document_number ?? null,
    mergedIntoGuestId: row.merged_into_guest_id ?? null,
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

function toProfile(row: GuestRow, consent: GuestConsent): GuestProfile {
  return {
    ...toSummary(row),
    language: row.language ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    addressLine1: row.address_line1 ?? null,
    addressLine2: row.address_line2 ?? null,
    city: row.city ?? null,
    region: row.region ?? null,
    country: row.country ?? null,
    postalCode: row.postal_code ?? null,
    notes: row.notes ?? null,
    linkedCustomerUserId: row.linked_customer_user_id ?? null,
    createdAt: row.created_at ?? row.updated_at,
    idDocumentType: (row.id_document_type as GuestProfile["idDocumentType"]) ?? null,
    idDocumentExpiry: row.id_document_expiry ?? null,
    consent,
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
});

type GuestInput = z.infer<typeof guestInputSchema>;

function toColumns(input: GuestInput) {
  const email = blankToNull(input.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
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
] as const;

/* --------------------------------------------------------------- access */

/** Guest Management is owner/manager only; the flag drives nav + UI affordances. */
export const getGuestsAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageGuests(me.role) };
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

    let result = await applyFilters(GUEST_COLUMNS_W2, true);
    if (result.error && isMissingSchemaError(result.error)) {
      result = await applyFilters(GUEST_COLUMNS_BASE, false);
    }
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as unknown as GuestRow[]).map(toSummary);
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

    let result = await run(GUEST_COLUMNS_W2, true);
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
      let rowResult = await context.supabase
        .from("guest_profiles")
        .select(GUEST_COLUMNS_W2)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
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
      const row = rowResult.data as GuestRow;

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

      const actorNames = await resolveActorNames(data.restaurantId, [
        ...(historyRows ?? []).map((h) => h.actor_membership_id),
        row.data_processing_consent_recorded_by,
        row.marketing_consent_recorded_by,
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

    const { data: inserted, error } = await context.supabase
      .from("guest_profiles")
      .insert({
        ...columns,
        restaurant_id: data.restaurantId,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Could not create this guest.");

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: inserted.id,
      eventType: "created",
      newValues: columns,
      actorMembershipId: me.id,
    });

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

    const { data: before } = await context.supabase
      .from("guest_profiles")
      .select(GUEST_COLUMNS_BASE)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (!before) throw new Error("That guest could not be found.");

    const columns = toColumns(data.guest);
    const { error } = await context.supabase
      .from("guest_profiles")
      .update(columns)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId);
    if (error) throw new Error(error.message);

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
    if ((before as GuestRow).vip_status !== columns.vip_status) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: data.guestId,
        eventType: "vip_changed",
        previousValues: { vip_status: (before as GuestRow).vip_status },
        newValues: { vip_status: columns.vip_status },
        actorMembershipId: me.id,
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
    const { data: rows, error } = await supabaseAdmin
      .from("guest_profiles")
      .select(GUEST_COLUMNS_W2)
      .eq("restaurant_id", data.restaurantId)
      .in("id", [data.survivorId, data.retiredId]);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(WAVE2_MIGRATION_UNAVAILABLE);
      throw new Error(error.message);
    }
    const survivor = (rows ?? []).find((row) => row.id === data.survivorId) as unknown as
      GuestRow | undefined;
    const retired = (rows ?? []).find((row) => row.id === data.retiredId) as unknown as
      GuestRow | undefined;
    if (!survivor || !retired) throw new Error("Both guests must belong to this property.");
    if (survivor.merged_into_guest_id || retired.merged_into_guest_id) {
      throw new Error("A merged guest cannot be merged again.");
    }

    const winner: Record<string, unknown> = {};
    for (const key of MERGE_PROFILE_KEYS) {
      const current = (survivor as Record<string, unknown>)[key];
      const incoming = (retired as Record<string, unknown>)[key];
      if ((current == null || current === "") && incoming != null && incoming !== "") {
        winner[key] = incoming;
      }
    }
    if (!survivor.vip_status && retired.vip_status) winner["vip_status"] = true;

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
    if (retiredPrefs) {
      const prefWinner: Record<string, unknown> = {};
      for (const key of MERGE_PREF_KEYS) {
        const current = survivorPrefs?.[key];
        const incoming = retiredPrefs[key];
        if ((current == null || current === "") && incoming != null && incoming !== "") {
          prefWinner[key] = incoming;
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
    if (
      toConsentState(survivor.data_processing_consent) === "not_asked" &&
      toConsentState(retired.data_processing_consent) !== "not_asked"
    ) {
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

    const docs = await supabaseAdmin
      .from("guest_documents")
      .update({ guest_id: data.survivorId })
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    if (docs.error && !isMissingSchemaError(docs.error)) throw new Error(docs.error.message);

    const reservations = await supabaseAdmin
      .from("hotel_reservations")
      .update({ guest_id: data.survivorId })
      .eq("restaurant_id", data.restaurantId)
      .eq("guest_id", data.retiredId);
    if (reservations.error) throw new Error(reservations.error.message);

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
      roomSubtotal: row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal),
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
  .handler(
    async ({
      data,
      context,
    }): Promise<{ stays: GuestStay[]; access: GuestStayAccess }> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const access = guestStayAccessForRole(me.role);
      const stays = await loadGuestStaysForProfile(context as never, data.restaurantId, data.guestId, access);
      return { stays, access };
    },
  );

export const getGuestStayOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, guestId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<GuestStayOverview> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const access = guestStayAccessForRole(me.role);
      const stays = await loadGuestStaysForProfile(context as never, data.restaurantId, data.guestId, access);

      const { data: restaurant } = await context.supabase
        .from("restaurants")
        .select("timezone")
        .eq("id", data.restaurantId)
        .maybeSingle();
      const today = propertyToday((restaurant as { timezone?: string } | null)?.timezone ?? "UTC");
      return deriveStayOverview(stays, today, access);
    },
  );
