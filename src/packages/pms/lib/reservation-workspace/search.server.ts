import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  RESERVATION_STATUSES,
  nightsBetween,
  requireReservationManager,
  type ReservationStatus,
} from "../reservations.server";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  OPERATIONAL_RESERVATION_SORT_FIELDS,
  OPERATIONAL_RESERVATION_VIEWS,
  type OperationalReservationPage,
  type OperationalReservationSortField,
  type OperationalReservationView,
  type ReservationOperationalSummary,
} from "./shared-read-models";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const sourceSchema = z.enum(["staff", "walk_in", "direct_booking", "future_online"]);

export const OPERATIONAL_RESERVATION_DEFAULT_PAGE_SIZE = 25;
export const OPERATIONAL_RESERVATION_MAX_PAGE_SIZE = 100;
export const OPERATIONAL_SEARCH_RELATED_MATCH_LIMIT = 500;

export const operationalReservationSearchInputSchema = z
  .object({
    restaurantId: idSchema,
    search: z.string().trim().min(2).max(120).optional(),
    view: z.enum(OPERATIONAL_RESERVATION_VIEWS).optional(),
    statuses: z
      .array(z.enum(RESERVATION_STATUSES))
      .min(1)
      .max(RESERVATION_STATUSES.length)
      .optional(),

    arrivalFrom: dateSchema.optional(),
    arrivalTo: dateSchema.optional(),
    departureFrom: dateSchema.optional(),
    departureTo: dateSchema.optional(),
    stayOverlapStart: dateSchema.optional(),
    stayOverlapEnd: dateSchema.optional(),

    roomTypeId: idSchema.optional(),
    roomId: idSchema.optional(),
    unassigned: z.boolean().optional(),
    guestId: idSchema.optional(),
    vip: z.boolean().optional(),
    source: sourceSchema.optional(),
    commercialBookingSource: z.string().trim().min(1).max(120).optional(),
    marketSegment: z.string().trim().min(1).max(120).optional(),
    ratePlanId: idSchema.optional(),
    companyMasterId: idSchema.optional(),
    travelAgentMasterId: idSchema.optional(),
    groupAccountMasterId: idSchema.optional(),

    page: z.number().int().min(1).max(10_000).optional(),
    pageSize: z.number().int().min(1).max(OPERATIONAL_RESERVATION_MAX_PAGE_SIZE).optional(),
    sortBy: z.enum(OPERATIONAL_RESERVATION_SORT_FIELDS).optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (!!value.stayOverlapStart !== !!value.stayOverlapEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stay overlap requires both a start and end date.",
        path: ["stayOverlapStart"],
      });
    }
    if (
      value.stayOverlapStart &&
      value.stayOverlapEnd &&
      value.stayOverlapEnd < value.stayOverlapStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stay overlap end must be on or after its start.",
        path: ["stayOverlapEnd"],
      });
    }
  });

export type OperationalReservationSearchInput = z.infer<
  typeof operationalReservationSearchInputSchema
>;

export const OPERATIONAL_RESERVATION_SELECT = `
  id, confirmation_number, arrival_date, departure_date, adults, children, status, source,
  room_type_id, room_id, guest_id, rate_plan_id, room_subtotal, currency,
  company_master_id, travel_agent_master_id, group_account_master_id,
  commercial_booking_source, market_segment, external_reference, guarantee_method,
  special_requests, notes, created_at, updated_at,
  guest_profiles!hotel_reservations_guest_same_property!inner (
    first_name, last_name, phone, email, vip_status
  ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number, status, housekeeping_status ),
  rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property ( name ),
  company:guest_account_masters!hotel_reservations_company_master_same_property ( name ),
  travel_agent:guest_account_masters!hotel_reservations_travel_agent_master_same_property ( name ),
  group_account:guest_account_masters!hotel_reservations_group_account_master_same_property ( name )
`;

type NameRelation = { name: string } | null;
type GuestRelation = {
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  vip_status: boolean;
};

export type OperationalReservationRow = {
  id: string;
  confirmation_number: string;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  status: string;
  source: string;
  room_type_id: string;
  room_id: string | null;
  guest_id: string;
  rate_plan_id: string | null;
  room_subtotal: number | null;
  currency: string | null;
  company_master_id: string | null;
  travel_agent_master_id: string | null;
  group_account_master_id: string | null;
  commercial_booking_source: string | null;
  market_segment: string | null;
  external_reference: string | null;
  guarantee_method: string | null;
  special_requests: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  guest_profiles: GuestRelation | GuestRelation[] | null;
  room_types: NameRelation | NameRelation[];
  hotel_rooms:
    | { room_number: string; status?: string | null; housekeeping_status?: string | null }
    | Array<{ room_number: string; status?: string | null; housekeeping_status?: string | null }>
    | null;
  rate_plan: NameRelation | NameRelation[];
  company: NameRelation | NameRelation[];
  travel_agent: NameRelation | NameRelation[];
  group_account: NameRelation | NameRelation[];
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function operationalRoomState(row: OperationalReservationRow): {
  operationalStatus: string | null;
  housekeepingStatus: string | null;
} {
  const room = one(row.hotel_rooms);
  return {
    operationalStatus: room?.status ?? null,
    housekeepingStatus: room?.housekeeping_status ?? null,
  };
}

export function toReservationOperationalSummary(
  row: OperationalReservationRow,
): ReservationOperationalSummary {
  const guest = one(row.guest_profiles);
  const roomType = one(row.room_types);
  if (!guest || !roomType) {
    throw new Error("Reservation operational read is missing a required relation.");
  }

  return {
    reservationId: row.id,
    confirmationNumber: row.confirmation_number,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as ReservationStatus,
    source: row.source,

    roomTypeId: row.room_type_id,
    roomTypeName: roomType.name,
    roomId: row.room_id,
    roomNumber: one(row.hotel_rooms)?.room_number ?? null,

    guestId: row.guest_id,
    guestName: [guest.first_name, guest.last_name].filter(Boolean).join(" ").trim(),
    guestPhone: guest.phone,
    guestEmail: guest.email,
    guestVip: guest.vip_status,

    ratePlanId: row.rate_plan_id,
    ratePlanName: one(row.rate_plan)?.name ?? null,
    roomSubtotal: row.room_subtotal,
    currency: row.currency,

    companyMasterId: row.company_master_id,
    companyName: one(row.company)?.name ?? null,
    travelAgentMasterId: row.travel_agent_master_id,
    travelAgentName: one(row.travel_agent)?.name ?? null,
    groupAccountMasterId: row.group_account_master_id,
    groupName: one(row.group_account)?.name ?? null,

    commercialBookingSource: row.commercial_booking_source,
    marketSegment: row.market_segment,
    externalReference: row.external_reference,
    guaranteeMethod: row.guarantee_method,
    specialRequests: row.special_requests,
    notes: row.notes,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeOperationalSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[,%_()*:"'\\]/g, "")
    .replace(/\s+/g, " ");
}

type RelatedSearchMatches = {
  guestIds: string[];
  roomIds: string[];
};

function ids(rows: Array<{ id: string }> | null): string[] {
  return (rows ?? []).map((row) => row.id);
}

async function resolveRelatedSearchMatches(
  supabase: Parameters<typeof requireReservationManager>[0]["supabase"],
  restaurantId: string,
  term: string,
): Promise<RelatedSearchMatches> {
  const like = `%${term}%`;
  const limit = OPERATIONAL_SEARCH_RELATED_MATCH_LIMIT + 1;
  const [guests, rooms] = await Promise.all([
    supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .or(
        [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `phone.ilike.${like}`,
          `email.ilike.${like}`,
        ].join(","),
      )
      .limit(limit),
    supabase
      .from("hotel_rooms")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .ilike("room_number", `${term}%`)
      .limit(limit),
  ]);
  if (guests.error) throw new Error(guests.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  if ((guests.data?.length ?? 0) > OPERATIONAL_SEARCH_RELATED_MATCH_LIMIT) {
    throw new Error("Guest search is too broad. Enter a more specific search.");
  }
  if ((rooms.data?.length ?? 0) > OPERATIONAL_SEARCH_RELATED_MATCH_LIMIT) {
    throw new Error("Room search is too broad. Enter a more specific search.");
  }
  return {
    guestIds: ids(guests.data),
    roomIds: ids(rooms.data),
  };
}

export function operationalViewStatuses(
  view: OperationalReservationView,
): ReservationStatus[] | null {
  switch (view) {
    case "arrivals":
    case "unassigned":
      return ["pending", "confirmed"];
    case "departures":
      return ["confirmed", "checked_in"];
    case "in_house":
      return ["checked_in"];
    case "pending":
      return ["pending"];
    case "groups":
      return ["pending", "confirmed", "checked_in"];
    case "all":
      return null;
  }
}

export function effectiveOperationalStatuses(
  view: OperationalReservationView,
  requested: ReservationStatus[] | undefined,
): ReservationStatus[] | null {
  const viewStatuses = operationalViewStatuses(view);
  if (!viewStatuses) return requested ?? null;
  if (!requested) return viewStatuses;
  const requestedSet = new Set(requested);
  return viewStatuses.filter((status) => requestedSet.has(status));
}

function buildSearchOrFilter(term: string, matches: RelatedSearchMatches): string {
  const parts = [
    `confirmation_number.eq.${term}`,
    `confirmation_number.ilike.${term}%`,
    `external_reference.ilike.${term}%`,
  ];
  if (matches.guestIds.length > 0) {
    parts.push(`guest_id.in.(${matches.guestIds.join(",")})`);
  }
  if (matches.roomIds.length > 0) {
    parts.push(`room_id.in.(${matches.roomIds.join(",")})`);
  }
  return parts.join(",");
}

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export async function searchOperationalReservations(params: {
  supabase: WorkspaceClient;
  restaurantId: string;
  businessDate: string;
  input: OperationalReservationSearchInput;
}): Promise<OperationalReservationPage> {
  const { supabase, restaurantId, businessDate, input } = params;
  const view = input.view ?? "all";
  const statuses = effectiveOperationalStatuses(view, input.statuses);
  const term = input.search ? normalizeOperationalSearchTerm(input.search) : null;
  if (input.search && (!term || term.length < 2)) {
    throw new Error("Enter at least two searchable characters.");
  }

  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? OPERATIONAL_RESERVATION_DEFAULT_PAGE_SIZE;
  if (statuses?.length === 0) {
    return { businessDate, rows: [], page, pageSize, total: 0, hasMore: false };
  }

  const matches = term
    ? await resolveRelatedSearchMatches(supabase, restaurantId, term)
    : { guestIds: [], roomIds: [] };

  let query = supabase
    .from("hotel_reservations")
    .select(OPERATIONAL_RESERVATION_SELECT, { count: "exact" })
    .eq("restaurant_id", restaurantId);

  if (statuses) query = query.in("status", statuses);
  if (view === "arrivals") query = query.eq("arrival_date", businessDate);
  if (view === "departures") query = query.eq("departure_date", businessDate);
  if (view === "unassigned") query = query.is("room_id", null);
  if (view === "groups") query = query.not("group_account_master_id", "is", null);

  if (input.arrivalFrom) query = query.gte("arrival_date", input.arrivalFrom);
  if (input.arrivalTo) query = query.lte("arrival_date", input.arrivalTo);
  if (input.departureFrom) query = query.gte("departure_date", input.departureFrom);
  if (input.departureTo) query = query.lte("departure_date", input.departureTo);
  if (input.stayOverlapStart) query = query.gt("departure_date", input.stayOverlapStart);
  if (input.stayOverlapEnd) query = query.lte("arrival_date", input.stayOverlapEnd);

  if (input.roomTypeId) query = query.eq("room_type_id", input.roomTypeId);
  if (input.roomId) query = query.eq("room_id", input.roomId);
  if (input.unassigned === true) query = query.is("room_id", null);
  if (input.unassigned === false) query = query.not("room_id", "is", null);
  if (input.guestId) query = query.eq("guest_id", input.guestId);
  if (input.vip !== undefined) query = query.eq("guest_profiles.vip_status", input.vip);
  if (input.source) query = query.eq("source", input.source);
  if (input.commercialBookingSource) {
    query = query.eq("commercial_booking_source", input.commercialBookingSource);
  }
  if (input.marketSegment) query = query.eq("market_segment", input.marketSegment);
  if (input.ratePlanId) query = query.eq("rate_plan_id", input.ratePlanId);
  if (input.companyMasterId) query = query.eq("company_master_id", input.companyMasterId);
  if (input.travelAgentMasterId) {
    query = query.eq("travel_agent_master_id", input.travelAgentMasterId);
  }
  if (input.groupAccountMasterId) {
    query = query.eq("group_account_master_id", input.groupAccountMasterId);
  }
  if (term) query = query.or(buildSearchOrFilter(term, matches));

  const sortBy: OperationalReservationSortField = input.sortBy ?? "arrival_date";
  const ascending = (input.sortDirection ?? "asc") === "asc";
  const from = (page - 1) * pageSize;
  const result = await query
    .order(sortBy, { ascending })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (result.error) throw new Error(result.error.message);

  const rows = ((result.data ?? []) as unknown as OperationalReservationRow[]).map(
    toReservationOperationalSummary,
  );
  const total = result.count ?? rows.length;
  return {
    businessDate,
    rows,
    page,
    pageSize,
    total,
    hasMore: from + rows.length < total,
  };
}

export const listOperationalReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => operationalReservationSearchInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<OperationalReservationPage> => {
    await requireReservationManager(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyResult = await supabaseAdmin
      .from("restaurants")
      .select("business_date, timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (!propertyResult.data) throw new Error("Property not found.");

    return searchOperationalReservations({
      supabase: context.supabase,
      restaurantId: data.restaurantId,
      businessDate: resolvePropertyBusinessDate(
        propertyResult.data.business_date,
        propertyResult.data.timezone,
      ),
      input: data,
    });
  });
