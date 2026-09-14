/**
 * Guest Profile Wave 4 — Company / Group / Travel Agent masters and
 * relationship links. Guest-owned tables only. Reservations consume master IDs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blankToNull, normalizeEmail, recordGuestEvent, requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { propertyToday, requireReservationManager } from "./reservations.server";
import { deriveStayOverview } from "./guest-profile-wave3";
import { guestStayAccessForRole, loadGuestStaysForProfile } from "./guests.functions";
import {
  GUEST_ACCOUNT_STATUSES,
  GUEST_ACCOUNT_TYPES,
  GUEST_RELATIONSHIP_ROLES,
  WAVE4_MIGRATION_UNAVAILABLE,
  assertRoleMatchesType,
  loyaltyFromStayOverview,
  type GuestAccountLink,
  type GuestAccountProfile,
  type GuestAccountStatus,
  type GuestAccountSummary,
  type GuestAccountType,
  type GuestLoyaltyValue,
  type GuestRelationshipRole,
} from "./guest-profile-wave4";

const idSchema = z.string().uuid();

/** Wave 4 tables are not in generated types until 0053 is applied. */
function db(context: { supabase: { from: (table: string) => unknown } }) {
  return context.supabase as unknown as { from: (table: string) => any };
}

const MASTER_COLUMNS =
  "id, account_type, name, code, email, phone, address_line1, city, country, notes, account_status, created_at, updated_at";

type MasterRow = {
  id: string;
  account_type: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
};

function toSummary(row: MasterRow): GuestAccountSummary {
  return {
    id: row.id,
    accountType: row.account_type as GuestAccountType,
    name: row.name,
    code: row.code,
    phone: row.phone,
    email: row.email,
    accountStatus: row.account_status as GuestAccountStatus,
    updatedAt: row.updated_at,
  };
}

function toProfile(row: MasterRow): GuestAccountProfile {
  return {
    ...toSummary(row),
    addressLine1: row.address_line1,
    city: row.city,
    country: row.country,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function wave4Unavailable(error: { message?: string; code?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  code: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  accountStatus: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
});

function toMasterColumns(input: z.infer<typeof accountInputSchema>) {
  const email = normalizeEmail(input.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return {
    name: input.name.trim(),
    code: blankToNull(input.code),
    email,
    phone: blankToNull(input.phone),
    address_line1: blankToNull(input.addressLine1),
    city: blankToNull(input.city),
    country: blankToNull(input.country),
    notes: blankToNull(input.notes),
    account_status: input.accountStatus ?? "active",
  };
}

export const listGuestAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        search: z.string().max(120).optional(),
        status: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountSummary[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    let query = db(context)
      .from("guest_account_masters")
      .select(MASTER_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .eq("account_type", data.accountType)
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.status) query = query.eq("account_status", data.status);
    const term = (data.search ?? "").trim();
    if (term) {
      const like = `%${term.replace(/[%,]/g, "")}%`;
      query = query.or(`name.ilike.${like},code.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    const result = await query;
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as MasterRow[]).map(toSummary);
  });

export const getGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountProfile> => {
    await requireGuestManager(context as never, data.restaurantId);
    const result = await db(context)
      .from("guest_account_masters")
      .select(MASTER_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("That account master could not be found.");
    return toProfile(result.data as MasterRow);
  });

export const createGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        account: accountInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const columns = toMasterColumns(data.account);
    const { data: inserted, error } = await db(context)
      .from("guest_account_masters")
      .insert({
        ...columns,
        restaurant_id: data.restaurantId,
        account_type: data.accountType,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error || !inserted) throw new Error(error?.message ?? "Could not create this account master.");
    return { id: inserted.id };
  });

export const updateGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        account: accountInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireGuestManager(context as never, data.restaurantId);
    const columns = toMasterColumns(data.account);
    const { error } = await db(context)
      .from("guest_account_masters")
      .update(columns)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId);
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) throw new Error(error.message);
    return { id: data.accountId };
  });

type LinkRow = {
  id: string;
  guest_id: string;
  master_id: string;
  role: string;
  created_at: string;
  guest_profiles: { first_name: string; last_name: string | null } | null;
  guest_account_masters: { name: string; account_type: string } | null;
};

const LINK_SELECT = `
  id, guest_id, master_id, role, created_at,
  guest_profiles!guest_account_links_guest_same_property ( first_name, last_name ),
  guest_account_masters!guest_account_links_master_same_property ( name, account_type )
`;

function toLink(row: LinkRow): GuestAccountLink {
  const guest = row.guest_profiles;
  const master = row.guest_account_masters;
  return {
    id: row.id,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    masterId: row.master_id,
    masterName: master?.name ?? "Account",
    masterType: (master?.account_type ?? "company") as GuestAccountType,
    role: row.role as GuestRelationshipRole,
    createdAt: row.created_at,
  };
}

export const listGuestAccountLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema.optional(),
        accountId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestAccountLink[]> => {
    await requireGuestManager(context as never, data.restaurantId);
    if (!data.guestId && !data.accountId) {
      throw new Error("Choose a guest or an account master to list relationships.");
    }
    let query = db(context)
      .from("guest_account_links")
      .select(LINK_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false });
    if (data.guestId) query = query.eq("guest_id", data.guestId);
    if (data.accountId) query = query.eq("master_id", data.accountId);
    const result = await query;
    if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as unknown as LinkRow[]).map(toLink);
  });

export const linkGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        guestId: idSchema,
        accountId: idSchema,
        role: z.enum(GUEST_RELATIONSHIP_ROLES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);

    const { data: master, error: masterError } = await db(context)
      .from("guest_account_masters")
      .select("id, name, account_type")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.accountId)
      .maybeSingle();
    if (wave4Unavailable(masterError)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (masterError) throw new Error(masterError.message);
    if (!master) throw new Error("That account master could not be found.");
    const typeMismatch = assertRoleMatchesType(data.role, master.account_type as GuestAccountType);
    if (typeMismatch) throw new Error(typeMismatch);

    const { data: guest, error: guestError } = await db(context)
      .from("guest_profiles")
      .select("id, first_name, last_name")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guestError) throw new Error(guestError.message);
    if (!guest) throw new Error("That guest could not be found.");

    const { data: inserted, error } = await db(context)
      .from("guest_account_links")
      .insert({
        restaurant_id: data.restaurantId,
        guest_id: data.guestId,
        master_id: data.accountId,
        role: data.role,
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) {
      if (error.code === "23505") throw new Error("That relationship is already linked.");
      throw new Error(error.message);
    }
    if (!inserted) throw new Error("Could not link this relationship.");

    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "relationship_linked",
      newValues: { masterId: data.accountId, role: data.role, masterName: master.name },
      notes: `Linked as ${data.role} to ${master.name}`,
      actorMembershipId: me.id,
    });

    return { id: inserted.id };
  });

export const unlinkGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        linkId: idSchema,
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ guestRemaining: boolean; masterRemaining: boolean }> => {
      const me = await requireGuestManager(context as never, data.restaurantId);
      const { data: link, error: readError } = await db(context)
        .from("guest_account_links")
        .select("id, guest_id, master_id, role")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.linkId)
        .maybeSingle();
      if (wave4Unavailable(readError)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
      if (readError) throw new Error(readError.message);
      if (!link) throw new Error("That relationship could not be found.");

      const { error: deleteError } = await db(context)
        .from("guest_account_links")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.linkId);
      if (deleteError) throw new Error(deleteError.message);

      const [{ data: guest }, { data: master }] = await Promise.all([
        db(context)
          .from("guest_profiles")
          .select("id")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.guest_id)
          .maybeSingle(),
        db(context)
          .from("guest_account_masters")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", link.master_id)
          .maybeSingle(),
      ]);

      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: link.guest_id,
        eventType: "relationship_unlinked",
        previousValues: { masterId: link.master_id, role: link.role },
        notes: `Unlinked ${link.role}. The individual and the master were not deleted.`,
        actorMembershipId: me.id,
      });

      return { guestRemaining: Boolean(guest), masterRemaining: Boolean(master) };
    },
  );

export const getAccountLoyaltyValue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GuestLoyaltyValue> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const access = guestStayAccessForRole(me.role);
    const links = await db(context)
      .from("guest_account_links")
      .select("guest_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.accountId);
    if (wave4Unavailable(links.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (links.error) throw new Error(links.error.message);
    const guestIds = [
      ...new Set(((links.data ?? []) as Array<{ guest_id: string }>).map((row) => row.guest_id)),
    ];
    const stays = (
      await Promise.all(
        guestIds.map((guestId) =>
          loadGuestStaysForProfile(context as never, data.restaurantId, guestId, access),
        ),
      )
    ).flat();
    const { data: restaurant } = await db(context)
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const today = propertyToday((restaurant as { timezone?: string } | null)?.timezone ?? "UTC");
    const overview = deriveStayOverview(stays, today, access);
    return {
      ...loyaltyFromStayOverview(overview, false),
      memberCount: guestIds.length,
    };
  });

export type ReservationGuestMasters = {
  companyMasterId: string | null;
  companyMasterName: string | null;
  groupAccountMasterId: string | null;
  groupAccountMasterName: string | null;
  travelAgentMasterId: string | null;
  travelAgentMasterName: string | null;
  available: boolean;
};

async function resolveMasterName(
  supabase: { from: (table: string) => any },
  restaurantId: string,
  masterId: string | null,
): Promise<string | null> {
  if (!masterId) return null;
  const result = await supabase
    .from("guest_account_masters")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", masterId)
    .maybeSingle();
  return (result.data as { name: string } | null)?.name ?? null;
}

export const getReservationGuestMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationGuestMasters> => {
    await requireReservationManager(context as never, data.restaurantId);
    const empty: ReservationGuestMasters = {
      companyMasterId: null,
      companyMasterName: null,
      groupAccountMasterId: null,
      groupAccountMasterName: null,
      travelAgentMasterId: null,
      travelAgentMasterName: null,
      available: true,
    };
    const result = await db(context)
      .from("hotel_reservations")
      .select("company_master_id, group_account_master_id, travel_agent_master_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (wave4Unavailable(result.error)) return { ...empty, available: false };
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Reservation not found for this property.");
    const row = result.data as {
      company_master_id: string | null;
      group_account_master_id: string | null;
      travel_agent_master_id: string | null;
    };
    const [companyName, groupName, taName] = await Promise.all([
      resolveMasterName(db(context) as never, data.restaurantId, row.company_master_id),
      resolveMasterName(db(context) as never, data.restaurantId, row.group_account_master_id),
      resolveMasterName(db(context) as never, data.restaurantId, row.travel_agent_master_id),
    ]);
    return {
      companyMasterId: row.company_master_id,
      companyMasterName: companyName,
      groupAccountMasterId: row.group_account_master_id,
      groupAccountMasterName: groupName,
      travelAgentMasterId: row.travel_agent_master_id,
      travelAgentMasterName: taName,
      available: true,
    };
  });

export const setReservationGuestMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        companyMasterId: idSchema.nullable().optional(),
        groupAccountMasterId: idSchema.nullable().optional(),
        travelAgentMasterId: idSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await requireReservationManager(context as never, data.restaurantId);

    async function assertType(id: string | null | undefined, type: GuestAccountType) {
      if (!id) return;
      const result = await db(context)
        .from("guest_account_masters")
        .select("id, account_type")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", id)
        .maybeSingle();
      if (wave4Unavailable(result.error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new Error("That account master could not be found.");
      if (result.data.account_type !== type) {
        throw new Error("That master is the wrong account type for this stay field.");
      }
    }

    await assertType(data.companyMasterId, "company");
    await assertType(data.groupAccountMasterId, "group");
    await assertType(data.travelAgentMasterId, "travel_agent");

    const patch: Record<string, string | null> = {};
    if (data.companyMasterId !== undefined) patch["company_master_id"] = data.companyMasterId;
    if (data.groupAccountMasterId !== undefined) {
      patch["group_account_master_id"] = data.groupAccountMasterId;
    }
    if (data.travelAgentMasterId !== undefined) {
      patch["travel_agent_master_id"] = data.travelAgentMasterId;
    }

    const { error } = await db(context)
      .from("hotel_reservations")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId);
    if (wave4Unavailable(error)) throw new Error(WAVE4_MIGRATION_UNAVAILABLE);
    if (error) throw new Error(error.message);
    return { id: data.reservationId };
  });

export const listReservationsForGuestAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(GUEST_ACCOUNT_TYPES),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ available: boolean; rows: Array<{ id: string; confirmationNumber: string; guestName: string; masterName: string | null }> }> => {
      await requireReservationManager(context as never, data.restaurantId);
      const column =
        data.accountType === "company"
          ? "company_master_id"
          : data.accountType === "group"
            ? "group_account_master_id"
            : "travel_agent_master_id";
      const result = await db(context)
        .from("hotel_reservations")
        .select(
          `id, confirmation_number, ${column}, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )`,
        )
        .eq("restaurant_id", data.restaurantId)
        .not(column, "is", null)
        .order("arrival_date", { ascending: false })
        .limit(data.limit ?? 50);
      if (wave4Unavailable(result.error)) return { available: false, rows: [] };
      if (result.error) throw new Error(result.error.message);
      const rows = (result.data ?? []) as Array<{
        id: string;
        confirmation_number: string;
        company_master_id?: string | null;
        group_account_master_id?: string | null;
        travel_agent_master_id?: string | null;
        guest_profiles: { first_name: string; last_name: string | null } | null;
      }>;
      const masterIds = [
        ...new Set(
          rows
            .map((row) => row.company_master_id ?? row.group_account_master_id ?? row.travel_agent_master_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const names = new Map<string, string>();
      if (masterIds.length > 0) {
        const masters = await db(context)
          .from("guest_account_masters")
          .select("id, name")
          .eq("restaurant_id", data.restaurantId)
          .in("id", masterIds);
        for (const master of (masters.data ?? []) as Array<{ id: string; name: string }>) {
          names.set(master.id, master.name);
        }
      }
      return {
        available: true,
        rows: rows.map((row) => {
          const masterId = row.company_master_id ?? row.group_account_master_id ?? row.travel_agent_master_id ?? null;
          const guest = row.guest_profiles;
          return {
            id: row.id,
            confirmationNumber: row.confirmation_number,
            guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
            masterName: masterId ? (names.get(masterId) ?? null) : null,
          };
        }),
      };
    },
  );
