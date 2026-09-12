/**
 * FO-SEARCH1 — property-scoped stay search.
 *
 * Reuses hotel_reservations + guest_profiles + hotel_rooms (same joins as FO
 * lists). Does not invent a second Front Office or money writer.
 * Missing 0046 company/group columns: guest / confirmation / room / phone /
 * email still match; company/group chips are omitted.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nightsBetween, requireReservationManager, type ReservationStatus } from "./reservations.server";
import type { FrontOfficeStay } from "./frontoffice.functions";
import {
  SEARCH_RESULT_CAP,
  capSearchResults,
  contributingMatchChips,
  guestNameSearchTokens,
  isCompanyGroupColumnMissing,
  isSearchReady,
  searchActionsForStay,
  searchLikePattern,
  trimCompanyGroupName,
  type FoSearchActionId,
  type FoSearchMatchField,
} from "./fo-search1";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export type FoSearchHit = FrontOfficeStay & {
  guestEmail: string | null;
  companyName: string | null;
  groupName: string | null;
  matches: FoSearchMatchField[];
  actions: FoSearchActionId[];
};

export type FoSearchResult = {
  rows: FoSearchHit[];
  truncated: boolean;
  footer: string | null;
  companyGroupAvailable: boolean;
};

const STAY_SELECT_CORE = `
  id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date,
  adults, children, status, special_requests, source,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

const STAY_SELECT_WITH_COMPANY = `
  id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date,
  adults, children, status, special_requests, source, company_name, group_name,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rooms!hotel_reservations_room_same_type ( room_number )
`;

type StaySearchRow = {
  id: string;
  confirmation_number: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  status: string;
  special_requests: string | null;
  source?: string | null;
  company_name?: string | null;
  group_name?: string | null;
  guest_profiles: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    vip_status: boolean;
  } | null;
  room_types: { name: string } | null;
  hotel_rooms: { room_number: string } | null;
};

function toHit(
  row: StaySearchRow,
  businessDate: string,
  term: string,
  companyGroupAvailable: boolean,
): FoSearchHit {
  const guest = row.guest_profiles;
  const guestName = [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest";
  const companyName = companyGroupAvailable ? trimCompanyGroupName(row.company_name) : null;
  const groupName = companyGroupAvailable ? trimCompanyGroupName(row.group_name) : null;
  const stay = {
    guestName,
    confirmationNumber: row.confirmation_number,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    guestPhone: guest?.phone ?? null,
    guestEmail: guest?.email ?? null,
    companyName,
    groupName,
    source: row.source ?? null,
    status: row.status,
    roomId: row.room_id,
  };
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName,
    guestVip: guest?.vip_status ?? false,
    guestPhone: guest?.phone ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as ReservationStatus,
    specialRequests: row.special_requests,
    source: row.source ?? null,
    overstay: row.status === "checked_in" && row.departure_date < businessDate,
    walkInIncomplete: false,
    guestEmail: guest?.email ?? null,
    companyName,
    groupName,
    matches: contributingMatchChips(stay, term, companyGroupAvailable),
    actions: searchActionsForStay(stay),
  };
}

function collectIds(rows: Array<{ id: string } | null> | null | undefined, into: Set<string>) {
  for (const row of rows ?? []) {
    if (row?.id) into.add(row.id);
  }
}

export const searchFrontOfficeStays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        today: dateSchema,
        search: z.string().max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FoSearchResult> => {
    await requireReservationManager(context as never, data.restaurantId);
    const empty: FoSearchResult = {
      rows: [],
      truncated: false,
      footer: null,
      companyGroupAvailable: true,
    };
    if (!isSearchReady(data.search)) return empty;

    const like = searchLikePattern(data.search);
    const ids = new Set<string>();
    let companyGroupAvailable = true;

    const confirmation = await context.supabase
      .from("hotel_reservations")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .ilike("confirmation_number", like)
      .limit(50);
    if (confirmation.error) throw new Error(confirmation.error.message);
    collectIds(confirmation.data, ids);

    const nameTokens = guestNameSearchTokens(data.search);
    const guestParts = nameTokens.flatMap((token) => {
      const tokenLike = searchLikePattern(token);
      return [`first_name.ilike.${tokenLike}`, `last_name.ilike.${tokenLike}`];
    });
    guestParts.push(`phone.ilike.${like}`, `email.ilike.${like}`);

    const guests = await context.supabase
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .or(guestParts.join(","))
      .limit(50);
    if (guests.error) throw new Error(guests.error.message);
    const guestIds = (guests.data ?? []).map((g: { id: string }) => g.id);
    if (guestIds.length > 0) {
      const byGuest = await context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .in("guest_id", guestIds)
        .limit(50);
      if (byGuest.error) throw new Error(byGuest.error.message);
      collectIds(byGuest.data, ids);
    }

    const rooms = await context.supabase
      .from("hotel_rooms")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .ilike("room_number", like)
      .limit(50);
    if (rooms.error) throw new Error(rooms.error.message);
    const roomIds = (rooms.data ?? []).map((r: { id: string }) => r.id);
    if (roomIds.length > 0) {
      const byRoom = await context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .in("room_id", roomIds)
        .limit(50);
      if (byRoom.error) throw new Error(byRoom.error.message);
      collectIds(byRoom.data, ids);
    }

    const companyGroup = await context.supabase
      .from("hotel_reservations")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .or(`company_name.ilike.${like},group_name.ilike.${like}`)
      .limit(50);
    if (companyGroup.error) {
      if (isCompanyGroupColumnMissing(companyGroup.error)) {
        companyGroupAvailable = false;
      } else {
        throw new Error(companyGroup.error.message);
      }
    } else {
      collectIds(companyGroup.data, ids);
    }

    if (ids.size === 0) {
      return { ...empty, companyGroupAvailable };
    }

    const fetchIds = [...ids].slice(0, SEARCH_RESULT_CAP + 1);

    async function loadRows(withCompany: boolean) {
      const result = await context.supabase
        .from("hotel_reservations")
        .select(withCompany ? STAY_SELECT_WITH_COMPANY : STAY_SELECT_CORE)
        .eq("restaurant_id", data.restaurantId)
        .in("id", fetchIds)
        .order("arrival_date", { ascending: false })
        .order("confirmation_number", { ascending: true });
      return { data: (result.data ?? null) as unknown as StaySearchRow[] | null, error: result.error };
    }

    let fetched = await loadRows(companyGroupAvailable);
    if (fetched.error && companyGroupAvailable && isCompanyGroupColumnMissing(fetched.error)) {
      companyGroupAvailable = false;
      fetched = await loadRows(false);
    }
    if (fetched.error) throw new Error(fetched.error.message);

    const hits = (fetched.data ?? []).map((row) =>
      toHit(row, data.today, data.search, companyGroupAvailable),
    );
    const capped = capSearchResults(hits, SEARCH_RESULT_CAP);
    return { ...capped, companyGroupAvailable };
  });
