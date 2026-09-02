import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GUEST_STATUSES,
  blankToNull,
  canManageGuests,
  diffFields,
  normalizeEmail,
  normalizePhone,
  recordGuestEvent,
  requireGuestManager,
  type GuestEventType,
  type GuestStatus,
} from "./guests.server";
import { callerMembership } from "./workforce.server";

const idSchema = z.string().uuid();

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

const GUEST_COLUMNS =
  "id, first_name, last_name, phone, email, nationality, language, date_of_birth, address_line1, address_line2, city, region, country, postal_code, guest_status, vip_status, notes, linked_customer_user_id, created_at, updated_at";

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
  guest_status: string;
  vip_status: boolean;
  notes?: string | null;
  linked_customer_user_id?: string | null;
  created_at?: string;
  updated_at: string;
};

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
  };
}

function toProfile(row: GuestRow): GuestProfile {
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

    let query = context.supabase
      .from("guest_profiles")
      .select(GUEST_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 100);

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

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as GuestRow[]).map(toSummary);
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

    let query = context.supabase
      .from("guest_profiles")
      .select(GUEST_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .or(filters.join(","))
      .limit(10);
    if (data.excludeGuestId) query = query.neq("id", data.excludeGuestId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as GuestRow[]).map(toSummary);
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

      const { data: row } = await context.supabase
        .from("guest_profiles")
        .select(GUEST_COLUMNS)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.guestId)
        .maybeSingle();
      if (!row) throw new Error("That guest could not be found.");

      const [{ data: prefRow }, { data: historyRows }] = await Promise.all([
        context.supabase
          .from("guest_preferences")
          .select("*")
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .maybeSingle(),
        context.supabase
          .from("guest_profile_history")
          .select("id, event_type, previous_values, new_values, notes, actor_membership_id, created_at")
          .eq("restaurant_id", data.restaurantId)
          .eq("guest_id", data.guestId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const actorIds = Array.from(
        new Set((historyRows ?? []).map((h) => h.actor_membership_id).filter(Boolean) as string[]),
      );
      const actorNames = new Map<string, string>();
      if (actorIds.length > 0) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: members } = await supabaseAdmin
          .from("restaurant_users")
          .select("id, user_id")
          .eq("restaurant_id", data.restaurantId)
          .in("id", actorIds);
        const userIds = (members ?? []).map((m) => m.user_id);
        const { data: profiles } = userIds.length
          ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
          : { data: [] as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] };
        const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
        for (const m of members ?? []) {
          const p = byUser.get(m.user_id);
          const name = p ? fullName(p.first_name ?? "", p.last_name ?? null) || (p.email ?? "") : "";
          actorNames.set(m.id, name || "Staff member");
        }
      }

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
        guest: toProfile(row as GuestRow),
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
      .select(GUEST_COLUMNS)
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
      .object({ restaurantId: idSchema, guestId: idSchema, note: z.string().trim().min(1).max(2000) })
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
