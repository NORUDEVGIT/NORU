/**
 * Group Detail workspace APIs.
 * Rows stay on guest_account_masters.account_type = group.
 * Members reuse guest_account_links. Reservations reuse hotel_reservations.
 * Rooming list and financials are derived.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  blankToNull,
  normalizeEmail,
  normalizePhone,
  recordGuestAccountEvent,
  recordGuestEvent,
  requireGuestManager,
} from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import { guestStayAccessForRole } from "./guests.functions";
import { nightsBetween } from "./reservation-dates";
import { propertyToday, requireReservationManager } from "./reservations.server";
import { assignReservationRoom, listAssignableRooms } from "./reservations.functions";
import { setReservationGuestMasters } from "./guest-accounts.functions";
import { GUEST_ACCOUNT_STATUSES } from "./guest-profile-wave4";
import { TOUR_OPERATOR_UNAVAILABLE } from "./guest-profile-listing";
import {
  GROUP_MEMBER_STATUSES,
  GROUP_WORKSPACE_UNAVAILABLE,
  assignmentStatus,
  canConfirmGroup,
  generateGroupCode,
  groupOverviewKpis,
  validateGroupDates,
  type GroupImportResult,
  type GroupMemberStatus,
} from "./guest-group-detail-workspace";
import { assertActiveGroupType, loadGroupTypes } from "./guest-group-types";
import { roomInventoryAutoAssignment } from "./guest-group-auto-assignment";
import { getGroupInvoices, summarizeGroupFinancials } from "./guest-group-financials";

const idSchema = z.string().uuid();

function admin(client: { from: (table: string) => unknown }) {
  return client as { from: (table: string) => any };
}

function unavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && isMissingSchemaError(error));
}

const GROUP_MASTER_COLUMNS =
  "id, name, code, email, phone, address_line1, city, country, notes, account_status, primary_contact_name, group_type_id, market_segment_id, source_code_id, company_master_id, travel_agent_master_id, primary_contact_guest_id, arrival_date, departure_date, expected_pax, expected_rooms, special_requests, created_by_staff_membership_id, updated_by_staff_membership_id, created_at, updated_at";

type GroupMasterRow = {
  id: string;
  name: string;
  code: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  account_status: string;
  primary_contact_name: string | null;
  group_type_id: string | null;
  market_segment_id: string | null;
  source_code_id: string | null;
  company_master_id: string | null;
  travel_agent_master_id: string | null;
  primary_contact_guest_id: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  expected_pax: number | null;
  expected_rooms: number | null;
  special_requests: string | null;
  created_by_staff_membership_id: string | null;
  updated_by_staff_membership_id: string | null;
  created_at: string;
  updated_at: string;
};

const groupInputSchema = z.object({
  name: z.string().trim().min(1, "Group name is required.").max(200),
  code: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  specialRequests: z.string().max(4000).optional().nullable(),
  accountStatus: z.enum(GUEST_ACCOUNT_STATUSES).optional(),
  groupTypeId: z.string().uuid().optional().nullable(),
  marketSegmentId: z.string().uuid().optional().nullable(),
  sourceCodeId: z.string().uuid().optional().nullable(),
  companyMasterId: z.string().uuid().optional().nullable(),
  travelAgentMasterId: z.string().uuid().optional().nullable(),
  primaryContactGuestId: z.string().uuid().optional().nullable(),
  primaryContactName: z.string().max(200).optional().nullable(),
  arrivalDate: z.string().max(20).optional().nullable(),
  departureDate: z.string().max(20).optional().nullable(),
  expectedPax: z.number().int().min(0).max(9999).optional().nullable(),
  expectedRooms: z.number().int().min(0).max(9999).optional().nullable(),
});

export async function loadGroupMaster(
  db: { from: (table: string) => any },
  restaurantId: string,
  groupId: string,
): Promise<GroupMasterRow> {
  const result = await db
    .from("guest_account_masters")
    .select(GROUP_MASTER_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .eq("id", groupId)
    .eq("account_type", "group")
    .maybeSingle();
  if (unavailable(result.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("That group could not be found.");
  return result.data as GroupMasterRow;
}

async function assertRelatedMaster(
  db: { from: (table: string) => any },
  restaurantId: string,
  masterId: string | null | undefined,
  type: "company" | "travel_agent",
  label: string,
) {
  if (!masterId) return;
  const result = await db
    .from("guest_account_masters")
    .select("id, account_type")
    .eq("restaurant_id", restaurantId)
    .eq("id", masterId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error(`That ${label} could not be found.`);
  if (result.data.account_type !== type) throw new Error(`Select an existing ${label}.`);
}

async function assertGroupCodeUnique(
  db: { from: (table: string) => any },
  restaurantId: string,
  code: string,
  excludeId?: string,
) {
  const result = await db
    .from("guest_account_masters")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("account_type", "group")
    .ilike("code", code)
    .maybeSingle();
  if (result.error && !unavailable(result.error)) throw new Error(result.error.message);
  if (result.data && result.data.id !== excludeId) {
    throw new Error("A group with that code already exists.");
  }
}

function groupColumns(input: z.infer<typeof groupInputSchema>, actorId: string) {
  const dateError = validateGroupDates(input.arrivalDate, input.departureDate);
  if (dateError) throw new Error(dateError);
  const status = input.accountStatus ?? "pending";
  if (status === "active") {
    const confirmError = canConfirmGroup({
      name: input.name,
      groupTypeId: input.groupTypeId,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
    });
    if (confirmError) throw new Error(confirmError);
  }
  return {
    name: input.name.trim(),
    code: blankToNull(input.code),
    email: normalizeEmail(input.email),
    phone: blankToNull(input.phone),
    address_line1: blankToNull(input.addressLine1),
    city: blankToNull(input.city),
    country: blankToNull(input.country),
    notes: blankToNull(input.notes),
    special_requests: blankToNull(input.specialRequests),
    account_status: status,
    group_type_id: input.groupTypeId || null,
    market_segment_id: input.marketSegmentId || null,
    source_code_id: input.sourceCodeId || null,
    company_master_id: input.companyMasterId || null,
    travel_agent_master_id: input.travelAgentMasterId || null,
    primary_contact_guest_id: input.primaryContactGuestId || null,
    primary_contact_name: blankToNull(input.primaryContactName),
    arrival_date: blankToNull(input.arrivalDate),
    departure_date: blankToNull(input.departureDate),
    expected_pax: input.expectedPax ?? null,
    expected_rooms: input.expectedRooms ?? null,
    updated_by_staff_membership_id: actorId,
  };
}

async function loadCatalogueOptions(db: { from: (table: string) => any }, restaurantId: string) {
  const [types, segments, sources] = await Promise.all([
    loadGroupTypes(restaurantId, db),
    db
      .from("pms_market_segments")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_source_codes")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);
  return {
    groupTypes: types,
    marketSegments: unavailable(segments.error)
      ? []
      : ((segments.data ?? []) as Array<{ id: string; code: string; name: string; active: boolean }>),
    sourceCodes: unavailable(sources.error)
      ? []
      : ((sources.data ?? []) as Array<{ id: string; code: string; name: string; active: boolean }>),
  };
}

async function loadGroupReservations(
  db: { from: (table: string) => any },
  restaurantId: string,
  groupId: string,
) {
  const result = await db
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, folio_balance, adults, children, room_type_id, room_id, special_requests, room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number ), guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("group_account_master_id", groupId)
    .order("arrival_date", { ascending: true });
  if (result.error) {
    const fallback = await db
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, arrival_date, departure_date, status, currency, room_subtotal, folio_balance, adults, children, room_type_id, room_id, special_requests",
      )
      .eq("restaurant_id", restaurantId)
      .eq("group_account_master_id", groupId)
      .order("arrival_date", { ascending: true });
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? []) as ReservationRow[];
  }
  return (result.data ?? []) as ReservationRow[];
}

type ReservationRow = {
  id: string;
  confirmation_number: string;
  guest_id: string | null;
  arrival_date: string;
  departure_date: string;
  status: string;
  currency: string | null;
  room_subtotal: number | string | null;
  folio_balance: number | string | null;
  adults: number;
  children: number;
  room_type_id: string;
  room_id: string | null;
  special_requests: string | null;
  room_types?: { name: string } | null;
  hotel_rooms?: { room_number: string } | null;
  guest_profiles?: { first_name: string | null; last_name: string | null } | null;
};

function guestName(row: { first_name?: string | null; last_name?: string | null } | null | undefined) {
  return [row?.first_name, row?.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

function mapReservation(row: ReservationRow, folioAccess: boolean) {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: guestName(row.guest_profiles),
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    status: row.status,
    adults: row.adults,
    children: row.children,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? null,
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    assignment: assignmentStatus(row.room_id),
    specialRequests: row.special_requests,
    roomSubtotal: folioAccess && row.room_subtotal != null ? Number(row.room_subtotal) : null,
    folioBalance: folioAccess && row.folio_balance != null ? Number(row.folio_balance) : null,
    currency: row.currency,
  };
}

async function loadGroupMembers(
  db: { from: (table: string) => any },
  restaurantId: string,
  groupId: string,
) {
  const result = await db
    .from("guest_account_links")
    .select(
      "id, guest_id, reservation_id, member_status, special_requests, created_at, guest_profiles!guest_account_links_guest_same_property ( first_name, last_name, email, phone )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("master_id", groupId)
    .eq("role", "group_member")
    .order("created_at", { ascending: true });
  if (unavailable(result.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<{
    id: string;
    guest_id: string;
    reservation_id: string | null;
    member_status: string | null;
    special_requests: string | null;
    created_at: string;
    guest_profiles: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    guestId: row.guest_id,
    guestName: guestName(row.guest_profiles),
    email: row.guest_profiles?.email ?? null,
    phone: row.guest_profiles?.phone ?? null,
    reservationId: row.reservation_id,
    memberStatus: (row.member_status || "expected") as GroupMemberStatus,
    specialRequests: row.special_requests,
    createdAt: row.created_at,
  }));
}

export const listGroupCatalogues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadCatalogueOptions(admin(supabaseAdmin), data.restaurantId);
  });

export const getGroupDetailWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const group = await loadGroupMaster(db, data.restaurantId, data.groupId);
    const [catalogues, members, reservations, company, agency, contact, groupType] = await Promise.all([
      loadCatalogueOptions(db, data.restaurantId),
      loadGroupMembers(db, data.restaurantId, data.groupId),
      loadGroupReservations(db, data.restaurantId, data.groupId),
      group.company_master_id
        ? db.from("guest_account_masters").select("id, name").eq("id", group.company_master_id).maybeSingle()
        : Promise.resolve({ data: null }),
      group.travel_agent_master_id
        ? db.from("guest_account_masters").select("id, name").eq("id", group.travel_agent_master_id).maybeSingle()
        : Promise.resolve({ data: null }),
      group.primary_contact_guest_id
        ? db
            .from("guest_profiles")
            .select("id, first_name, last_name, email, phone")
            .eq("id", group.primary_contact_guest_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      group.group_type_id
        ? db.from("pms_group_types").select("id, name").eq("id", group.group_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const access = guestStayAccessForRole(me.role);
    const assignedRooms = reservations.filter((row) => row.room_id).length;
    return {
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        email: group.email,
        phone: group.phone,
        addressLine1: group.address_line1,
        city: group.city,
        country: group.country,
        notes: group.notes,
        specialRequests: group.special_requests,
        accountStatus: group.account_status,
        groupTypeId: group.group_type_id,
        groupTypeName: (groupType.data as { name?: string } | null)?.name ?? null,
        marketSegmentId: group.market_segment_id,
        sourceCodeId: group.source_code_id,
        companyMasterId: group.company_master_id,
        companyMasterName: (company.data as { name?: string } | null)?.name ?? null,
        travelAgentMasterId: group.travel_agent_master_id,
        travelAgentMasterName: (agency.data as { name?: string } | null)?.name ?? null,
        primaryContactGuestId: group.primary_contact_guest_id,
        primaryContactName:
          group.primary_contact_name ||
          guestName(contact.data as { first_name?: string | null; last_name?: string | null } | null),
        primaryContactEmail: (contact.data as { email?: string | null } | null)?.email ?? group.email,
        primaryContactPhone: (contact.data as { phone?: string | null } | null)?.phone ?? group.phone,
        arrivalDate: group.arrival_date,
        departureDate: group.departure_date,
        expectedPax: group.expected_pax,
        expectedRooms: group.expected_rooms,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        createdById: group.created_by_staff_membership_id,
        updatedById: group.updated_by_staff_membership_id,
      },
      catalogues,
      folioAccess: access.folio,
      kpis: groupOverviewKpis({
        memberCount: members.length,
        reservationCount: reservations.length,
        assignedRooms,
        expectedPax: group.expected_pax,
        expectedRooms: group.expected_rooms,
      }),
      tourOperatorCopy: TOUR_OPERATOR_UNAVAILABLE,
    };
  });

export const saveGroupMaster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema.optional(),
        account: groupInputSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; code: string | null }> => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await assertActiveGroupType(data.restaurantId, data.account.groupTypeId, db);
    await assertRelatedMaster(db, data.restaurantId, data.account.companyMasterId, "company", "company");
    await assertRelatedMaster(
      db,
      data.restaurantId,
      data.account.travelAgentMasterId,
      "travel_agent",
      "travel agency",
    );
    const columns = groupColumns(data.account, me.id);
    if (columns.code) await assertGroupCodeUnique(db, data.restaurantId, columns.code, data.groupId);
    if (data.groupId) {
      const before = await loadGroupMaster(db, data.restaurantId, data.groupId);
      const updated = await db
        .from("guest_account_masters")
        .update(columns)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.groupId)
        .eq("account_type", "group")
        .select("id, code, account_status")
        .maybeSingle();
      if (unavailable(updated.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
      if (updated.error) {
        if (updated.error.code === "23505") throw new Error("A group with that code already exists.");
        throw new Error(updated.error.message);
      }
      if (!updated.data) throw new Error("That group could not be found.");
      const eventType = before.account_status !== updated.data.account_status ? "status_changed" : "profile_updated";
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.groupId,
        eventType,
        previousValues: { name: before.name, status: before.account_status },
        newValues: { name: columns.name, status: columns.account_status },
        notes: eventType === "status_changed" ? `Group status ${columns.account_status}` : `Updated ${columns.name}`,
        actorMembershipId: me.id,
      });
      return { id: data.groupId, code: updated.data.code };
    }
    const inserted = await db
      .from("guest_account_masters")
      .insert({
        ...columns,
        restaurant_id: data.restaurantId,
        account_type: "group",
        created_by_staff_membership_id: me.id,
      })
      .select("id, code")
      .single();
    if (unavailable(inserted.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new Error("A group with that code already exists.");
      throw new Error(inserted.error.message);
    }
    if (!inserted.data) throw new Error("Could not create this group.");
    let code = inserted.data.code as string | null;
    if (!code) {
      code = generateGroupCode(inserted.data.id);
      const patched = await db
        .from("guest_account_masters")
        .update({ code })
        .eq("restaurant_id", data.restaurantId)
        .eq("id", inserted.data.id)
        .select("code")
        .maybeSingle();
      if (patched.error && patched.error.code === "23505") {
        code = generateGroupCode(`${inserted.data.id}a`);
        await db.from("guest_account_masters").update({ code }).eq("id", inserted.data.id);
      } else if (patched.data?.code) {
        code = patched.data.code;
      }
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: inserted.data.id,
      eventType: "created",
      newValues: { name: columns.name, status: columns.account_status, code },
      notes: `Created group ${columns.name}`,
      actorMembershipId: me.id,
    });
    return { id: inserted.data.id, code };
  });

export const setGroupStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        status: z.enum(GUEST_ACCOUNT_STATUSES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const group = await loadGroupMaster(db, data.restaurantId, data.groupId);
    if (data.status === "active") {
      const error = canConfirmGroup({
        name: group.name,
        groupTypeId: group.group_type_id,
        arrivalDate: group.arrival_date,
        departureDate: group.departure_date,
      });
      if (error) throw new Error(error);
    }
    const updated = await db
      .from("guest_account_masters")
      .update({
        account_status: data.status,
        updated_by_staff_membership_id: me.id,
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.groupId)
      .select("id")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType: "status_changed",
      previousValues: { status: group.account_status },
      newValues: { status: data.status },
      notes: `Group status ${data.status}`,
      actorMembershipId: me.id,
    });
    return { id: data.groupId, status: data.status };
  });

export const listGroupMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadGroupMembers(admin(supabaseAdmin), data.restaurantId, data.groupId);
  });

export const addGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        guestId: idSchema,
        reservationId: idSchema.optional().nullable(),
        memberStatus: z.enum(GROUP_MEMBER_STATUSES).optional(),
        specialRequests: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const guest = await db
      .from("guest_profiles")
      .select("id, first_name, last_name")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.guestId)
      .maybeSingle();
    if (guest.error) throw new Error(guest.error.message);
    if (!guest.data) throw new Error("That guest could not be found.");
    if (data.reservationId) {
      const reservation = await db
        .from("hotel_reservations")
        .select("id, group_account_master_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (!reservation.data) throw new Error("That reservation could not be found.");
      if (
        reservation.data.group_account_master_id &&
        reservation.data.group_account_master_id !== data.groupId
      ) {
        throw new Error("That reservation belongs to another group.");
      }
    }
    const inserted = await db
      .from("guest_account_links")
      .insert({
        restaurant_id: data.restaurantId,
        guest_id: data.guestId,
        master_id: data.groupId,
        role: "group_member",
        reservation_id: data.reservationId || null,
        member_status: data.memberStatus ?? "expected",
        special_requests: blankToNull(data.specialRequests),
        created_by_staff_membership_id: me.id,
      })
      .select("id")
      .single();
    if (unavailable(inserted.error)) throw new Error(GROUP_WORKSPACE_UNAVAILABLE);
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new Error("That guest is already a member of this group.");
      throw new Error(inserted.error.message);
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType: "relationship_linked",
      newValues: { guestId: data.guestId, role: "group_member" },
      notes: `Member added ${guestName(guest.data)}`,
      actorMembershipId: me.id,
    });
    await recordGuestEvent({
      restaurantId: data.restaurantId,
      guestId: data.guestId,
      eventType: "relationship_linked",
      newValues: { masterId: data.groupId, role: "group_member" },
      notes: "Linked as group member",
      actorMembershipId: me.id,
    });
    return { id: inserted.data.id };
  });

export const createGroupMemberGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().max(120).optional().nullable(),
        email: z.string().max(200).optional().nullable(),
        phone: z.string().max(60).optional().nullable(),
        memberStatus: z.enum(GROUP_MEMBER_STATUSES).optional(),
        specialRequests: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { createGuest } = await import("./guests.functions");
    const created = await createGuest({
      data: {
        restaurantId: data.restaurantId,
        guest: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        },
      },
    });
    const linked = await addGroupMember({
      data: {
        restaurantId: data.restaurantId,
        groupId: data.groupId,
        guestId: created.id,
        memberStatus: data.memberStatus,
        specialRequests: data.specialRequests,
      },
    });
    return { guestId: created.id, linkId: linked.id };
  });

export const updateGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        linkId: idSchema,
        reservationId: idSchema.nullable().optional(),
        memberStatus: z.enum(GROUP_MEMBER_STATUSES).optional(),
        specialRequests: z.string().max(2000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const patch: Record<string, unknown> = {};
    if (data.memberStatus) patch.member_status = data.memberStatus;
    if (data.specialRequests !== undefined) patch.special_requests = blankToNull(data.specialRequests);
    if (data.reservationId !== undefined) {
      if (data.reservationId) {
        const reservation = await db
          .from("hotel_reservations")
          .select("id, group_account_master_id")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", data.reservationId)
          .maybeSingle();
        if (!reservation.data) throw new Error("That reservation could not be found.");
        if (
          reservation.data.group_account_master_id &&
          reservation.data.group_account_master_id !== data.groupId
        ) {
          throw new Error("That reservation belongs to another group.");
        }
      }
      patch.reservation_id = data.reservationId;
    }
    const updated = await db
      .from("guest_account_links")
      .update(patch)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.linkId)
      .eq("master_id", data.groupId)
      .select("id")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new Error("That group member could not be found.");
    if (data.reservationId) {
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.groupId,
        eventType: "reservation_linked",
        newValues: { linkId: data.linkId, reservationId: data.reservationId },
        notes: "Member connected to reservation",
        actorMembershipId: me.id,
      });
    }
    return { id: data.linkId };
  });

export const removeGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, linkId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { unlinkGuestAccount } = await import("./guest-accounts.functions");
    return unlinkGuestAccount({ data: { restaurantId: data.restaurantId, linkId: data.linkId } });
  });

function parseMemberCsv(csv: string) {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length === 0) return { headers: [] as string[], rows: [] as string[][] };
  const split = (line: string) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
  return { headers: split(lines[0]).map((header) => header.toLowerCase()), rows: lines.slice(1).map(split) };
}

export const previewGroupMemberImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, filename: z.string().max(200), csv: z.string().max(1_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    if (/\.xlsx?$/i.test(data.filename)) throw new Error("Upload a CSV file. Excel import is not available yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const parsed = parseMemberCsv(data.csv);
    const index = Object.fromEntries(parsed.headers.map((header, i) => [header, i]));
    const members = await loadGroupMembers(db, data.restaurantId, data.groupId);
    const existingEmails = new Set(members.map((row) => (row.email ?? "").toLowerCase()).filter(Boolean));
    const existingPhones = new Set(members.map((row) => normalizePhone(row.phone) ?? "").filter(Boolean));
    const rows = parsed.rows.map((cells, rowIndex) => {
      const get = (key: string) => (cells[index[key] ?? -1] ?? "").trim();
      const draft = {
        firstName: get("first_name") || get("firstname") || get("name"),
        lastName: get("last_name") || get("lastname"),
        email: normalizeEmail(get("email")),
        phone: blankToNull(get("phone")),
        specialRequests: blankToNull(get("special_requests") || get("notes")),
      };
      let error: string | null = null;
      let result: GroupImportResult = "imported";
      if (!draft.firstName) {
        error = "First name is required.";
        result = "failed";
      } else if (draft.email && existingEmails.has(draft.email)) {
        error = "Already a group member (email).";
        result = "duplicate";
      } else if (draft.phone && existingPhones.has(normalizePhone(draft.phone) ?? "")) {
        error = "Already a group member (phone).";
        result = "duplicate";
      }
      return { row: rowIndex + 2, draft, error, result };
    });
    const unmatched = rows.filter((row) => !row.error);
    if (unmatched.length > 0) {
      const emails = unmatched.map((row) => row.draft.email).filter(Boolean) as string[];
      const phones = unmatched.map((row) => row.draft.phone).filter(Boolean) as string[];
      const guests =
        emails.length || phones.length
          ? await db
              .from("guest_profiles")
              .select("id, email, phone, first_name, last_name")
              .eq("restaurant_id", data.restaurantId)
              .or(
                [
                  ...(emails.length ? [`email.in.(${emails.join(",")})`] : []),
                  ...(phones.length ? [`phone.in.(${phones.join(",")})`] : []),
                ].join(",") || "id.is.null",
              )
          : { data: [] };
      const byEmail = new Map(
        ((guests.data ?? []) as Array<{ id: string; email: string | null; phone: string | null }>).map((row) => [
          (row.email ?? "").toLowerCase(),
          row,
        ]),
      );
      const byPhone = new Map(
        ((guests.data ?? []) as Array<{ id: string; email: string | null; phone: string | null }>).map((row) => [
          normalizePhone(row.phone) ?? "",
          row,
        ]),
      );
      for (const row of unmatched) {
        const match =
          (row.draft.email && byEmail.get(row.draft.email)) ||
          (row.draft.phone && byPhone.get(normalizePhone(row.draft.phone) ?? ""));
        if (match) {
          row.result = "matched";
          (row as typeof row & { guestId?: string }).guestId = match.id;
        } else {
          row.result = "created";
        }
      }
    }
    return {
      rows,
      valid: rows.filter((row) => row.result === "matched" || row.result === "created"),
      invalid: rows.filter((row) => row.result === "failed" || row.result === "duplicate"),
    };
  });

export const confirmGroupMemberImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, filename: z.string().max(200), csv: z.string().max(1_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const preview = await previewGroupMemberImport({ data });
    const results: Array<{ row: number; result: GroupImportResult; guestId?: string; error?: string | null }> = [];
    for (const row of preview.rows) {
      if (row.result === "failed" || row.result === "duplicate") {
        results.push({ row: row.row, result: row.result, error: row.error });
        continue;
      }
      try {
        if (row.result === "matched" && "guestId" in row && row.guestId) {
          await addGroupMember({
            data: {
              restaurantId: data.restaurantId,
              groupId: data.groupId,
              guestId: String(row.guestId),
              specialRequests: row.draft.specialRequests,
            },
          });
          results.push({ row: row.row, result: "matched", guestId: String(row.guestId) });
        } else {
          const created = await createGroupMemberGuest({
            data: {
              restaurantId: data.restaurantId,
              groupId: data.groupId,
              firstName: row.draft.firstName,
              lastName: row.draft.lastName,
              email: row.draft.email,
              phone: row.draft.phone,
              specialRequests: row.draft.specialRequests,
            },
          });
          results.push({ row: row.row, result: "created", guestId: created.guestId });
        }
      } catch (error) {
        results.push({
          row: row.row,
          result: error instanceof Error && /already a member/.test(error.message) ? "duplicate" : "failed",
          error: error instanceof Error ? error.message : "Import failed.",
        });
      }
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType: "member_imported",
      newValues: { filename: data.filename, counts: results.map((row) => row.result) },
      notes: data.filename,
      actorMembershipId: me.id,
    });
    return {
      results,
      imported: results.filter((row) => row.result === "matched" || row.result === "created").length,
      matched: results.filter((row) => row.result === "matched").length,
      created: results.filter((row) => row.result === "created").length,
      duplicate: results.filter((row) => row.result === "duplicate").length,
      failed: results.filter((row) => row.result === "failed").length,
    };
  });

export const listGroupReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reservations = await loadGroupReservations(admin(supabaseAdmin), data.restaurantId, data.groupId);
    return reservations.map((row) => mapReservation(row, guestStayAccessForRole(me.role).folio));
  });

export const linkReservationToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        reservationId: idSchema,
        memberLinkId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    await loadGroupMaster(admin((await import("@/integrations/supabase/client.server")).supabaseAdmin), data.restaurantId, data.groupId);
    await setReservationGuestMasters({
      data: {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        groupAccountMasterId: data.groupId,
      },
    });
    if (data.memberLinkId) {
      await updateGroupMember({
        data: {
          restaurantId: data.restaurantId,
          groupId: data.groupId,
          linkId: data.memberLinkId,
          reservationId: data.reservationId,
        },
      });
    }
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType: "reservation_linked",
      newValues: { reservationId: data.reservationId },
      notes: "Reservation linked to group",
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const unlinkReservationFromGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    await setReservationGuestMasters({
      data: {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        groupAccountMasterId: null,
      },
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await admin(supabaseAdmin)
      .from("guest_account_links")
      .update({ reservation_id: null })
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.groupId)
      .eq("reservation_id", data.reservationId);
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType: "reservation_unlinked",
      newValues: { reservationId: data.reservationId },
      notes: "Reservation unlinked from group",
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const searchReservationsToLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, q: z.string().max(120).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const term = (data.q ?? "").trim().replace(/[%,]/g, "");
    let query = admin(context.supabase)
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, arrival_date, departure_date, status, group_account_master_id, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .is("group_account_master_id", null)
      .order("arrival_date", { ascending: false })
      .limit(20);
    if (term) query = query.or(`confirmation_number.ilike.%${term}%`);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as Array<{
      id: string;
      confirmation_number: string;
      guest_id: string | null;
      arrival_date: string;
      departure_date: string;
      status: string;
      guest_profiles: { first_name: string | null; last_name: string | null } | null;
    }>).map((row) => ({
      id: row.id,
      confirmationNumber: row.confirmation_number,
      guestId: row.guest_id,
      guestName: guestName(row.guest_profiles),
      arrivalDate: row.arrival_date,
      departureDate: row.departure_date,
      status: row.status,
    }));
  });

export const listGroupRooming = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    const [members, reservations] = await Promise.all([
      loadGroupMembers(db, data.restaurantId, data.groupId),
      loadGroupReservations(db, data.restaurantId, data.groupId),
    ]);
    const reservationById = new Map(reservations.map((row) => [row.id, row]));
    const reservationByGuest = new Map(reservations.filter((row) => row.guest_id).map((row) => [row.guest_id as string, row]));
    const folioAccess = guestStayAccessForRole(me.role).folio;
    const rows = members.map((member) => {
      const reservation =
        (member.reservationId ? reservationById.get(member.reservationId) : undefined) ??
        reservationByGuest.get(member.guestId);
      return {
        memberId: member.id,
        guestId: member.guestId,
        guestName: member.guestName,
        memberStatus: member.memberStatus,
        specialRequests: member.specialRequests,
        reservation: reservation ? mapReservation(reservation, folioAccess) : null,
      };
    });
    return { rows, reservations: reservations.map((row) => mapReservation(row, folioAccess)) };
  });

export const assignGroupRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        groupId: idSchema,
        reservationId: idSchema,
        roomId: idSchema.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const existing = await db
      .from("hotel_reservations")
      .select("id, room_id, group_account_master_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (!existing.data || existing.data.group_account_master_id !== data.groupId) {
      throw new Error("That reservation is not part of this group.");
    }
    await assignReservationRoom({
      data: {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        roomId: data.roomId,
      },
    });
    const previous = existing.data.room_id;
    const eventType = !data.roomId ? "room_unassigned" : previous && previous !== data.roomId ? "room_changed" : "room_assigned";
    await recordGuestAccountEvent({
      restaurantId: data.restaurantId,
      masterId: data.groupId,
      eventType,
      previousValues: { roomId: previous },
      newValues: { reservationId: data.reservationId, roomId: data.roomId },
      notes: data.roomId ? "Room assignment updated" : "Room assignment removed",
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const autoAssignGroupRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const reservations = await loadGroupReservations(db, data.restaurantId, data.groupId);
    const needs = reservations
      .filter((row) => ["pending", "confirmed"].includes(row.status))
      .map((row) => ({
        reservationId: row.id,
        roomTypeId: row.room_type_id,
        arrival: row.arrival_date,
        departure: row.departure_date,
        adults: row.adults,
        children: row.children,
        currentRoomId: row.room_id,
        preferenceNote: row.special_requests,
      }));
    const proposals = await roomInventoryAutoAssignment.propose({
      restaurantId: data.restaurantId,
      needs,
      inventory: {
        listAssignableRooms: async (input) =>
          listAssignableRooms({
            data: {
              restaurantId: input.restaurantId,
              roomTypeId: input.roomTypeId,
              arrival: input.arrival,
              departure: input.departure,
              excludeReservationId: input.excludeReservationId,
            },
          }),
      },
    });
    const assigned: typeof proposals = [];
    const failed: typeof proposals = [];
    for (const proposal of proposals) {
      if (!proposal.assigned || !proposal.roomId) {
        failed.push(proposal);
        continue;
      }
      try {
        await assignGroupRoom({
          data: {
            restaurantId: data.restaurantId,
            groupId: data.groupId,
            reservationId: proposal.reservationId,
            roomId: proposal.roomId,
          },
        });
        assigned.push(proposal);
      } catch (error) {
        failed.push({
          ...proposal,
          assigned: false,
          reason: error instanceof Error ? error.message : "Assignment failed.",
        });
      }
    }
    if (failed.length > 0) {
      await recordGuestAccountEvent({
        restaurantId: data.restaurantId,
        masterId: data.groupId,
        eventType: "auto_assignment_failed",
        newValues: { failed: failed.map((row) => ({ reservationId: row.reservationId, reason: row.reason })) },
        notes: `${failed.length} reservation(s) could not be auto-assigned.`,
        actorMembershipId: me.id,
      });
    }
    return { assigned, failed, skipped: proposals.filter((row) => row.reason === "Already assigned.") };
  });

export const listGroupAssignableRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        arrival: z.string().min(8),
        departure: z.string().min(8),
        excludeReservationId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => listAssignableRooms({ data }));

export const getGroupFinancials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, groupId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireGuestManager(context as never, data.restaurantId);
    const access = guestStayAccessForRole(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = admin(supabaseAdmin);
    await loadGroupMaster(db, data.restaurantId, data.groupId);
    const reservations = await loadGroupReservations(db, data.restaurantId, data.groupId);
    const invoices = getGroupInvoices();
    if (!access.folio) {
      return {
        summary: { estimatedRevenue: 0, totalCharges: 0, totalPayments: 0, outstandingBalance: 0 },
        folioAccess: false,
        invoices,
        transactions: [],
      };
    }
    const reservationIds = reservations.map((row) => row.id);
    const txns: Array<{ amount: number; folioStatus: string; transactionType: string; description: string; date: string }> = [];
    if (reservationIds.length > 0) {
      const folios = await db
        .from("guest_folios")
        .select("id, status, reservation_id")
        .eq("restaurant_id", data.restaurantId)
        .in("reservation_id", reservationIds);
      const folioRows = (folios.data ?? []) as Array<{ id: string; status: string }>;
      if (folioRows.length > 0) {
        const posted = await db
          .from("folio_transactions")
          .select("amount, transaction_type, description, posted_at, folio_id")
          .eq("restaurant_id", data.restaurantId)
          .in(
            "folio_id",
            folioRows.map((row) => row.id),
          )
          .order("posted_at", { ascending: true });
        for (const txn of (posted.data ?? []) as Array<{
          amount: number | string;
          transaction_type: string;
          description: string | null;
          posted_at: string;
          folio_id: string;
        }>) {
          const folio = folioRows.find((row) => row.id === txn.folio_id);
          txns.push({
            amount: Number(txn.amount),
            folioStatus: folio?.status ?? "open",
            transactionType: txn.transaction_type,
            description: txn.description || txn.transaction_type,
            date: txn.posted_at,
          });
        }
      }
    }
    return {
      summary: summarizeGroupFinancials(
        txns,
        reservations.filter((row) => row.room_subtotal != null).map((row) => Number(row.room_subtotal)),
      ),
      folioAccess: true,
      invoices,
      transactions: txns,
    };
  });

export const listGroupActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, groupId: idSchema, limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await admin(supabaseAdmin)
      .from("guest_account_history")
      .select("id, event_type, notes, new_values, created_at, actor_membership_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("master_id", data.groupId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (result.error) throw new Error(result.error.message);
    return ((result.data ?? []) as Array<{
      id: string;
      event_type: string;
      notes: string | null;
      new_values: Record<string, unknown> | null;
      created_at: string;
      actor_membership_id: string | null;
    }>).map((row) => ({
      id: row.id,
      activityType: row.event_type,
      description: row.notes || row.event_type.replaceAll("_", " "),
      userId: row.actor_membership_id,
      timestamp: row.created_at,
      relatedEntityId:
        typeof row.new_values?.reservationId === "string"
          ? row.new_values.reservationId
          : typeof row.new_values?.guestId === "string"
            ? row.new_values.guestId
            : null,
    }));
  });

export const searchGroupPartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountType: z.enum(["company", "travel_agent"]),
        q: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { listGuestAccounts } = await import("./guest-accounts.functions");
    const page = await listGuestAccounts({
      data: {
        restaurantId: data.restaurantId,
        accountType: data.accountType,
        search: data.q,
        status: "active",
        limit: 20,
      },
    });
    return page.items.map((row) => ({ id: row.id, name: row.name, code: row.code }));
  });

export const searchGuestsForGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, q: z.string().max(120).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireGuestManager(context as never, data.restaurantId);
    const { listGuests } = await import("./guests.functions");
    const page = await listGuests({
      data: { restaurantId: data.restaurantId, search: data.q, limit: 20 },
    });
    return page.items.map((row) => ({
      id: row.id,
      name: row.fullName,
      email: row.email,
      phone: row.phone,
    }));
  });
