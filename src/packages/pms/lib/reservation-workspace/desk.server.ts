import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireReservationManager } from "../reservations.server";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  operationalReservationSearchInputSchema,
  operationalViewStatuses,
  searchOperationalReservations,
} from "./search.server";
import type {
  ReservationDeskActionHints,
  ReservationDeskCapabilities,
  ReservationDeskKpis,
  ReservationDeskSnapshot,
  ReservationOperationalSummary,
} from "./shared-read-models";

const DESK_CAPABILITIES: ReservationDeskCapabilities = {
  waitlist: false,
  groups: "partial",
  availableRooms: "partial",
};

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

function reservationCount(supabase: WorkspaceClient, restaurantId: string) {
  return () =>
    supabase
      .from("hotel_reservations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId);
}

async function exactCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export function deskActionHints(
  row: Pick<ReservationOperationalSummary, "status" | "roomId">,
): ReservationDeskActionHints {
  const pendingOrConfirmed = row.status === "pending" || row.status === "confirmed";
  return {
    canOpen: true,
    canAssignRoom: pendingOrConfirmed && row.roomId === null,
    canConfirm: row.status === "pending",
    canCancel: pendingOrConfirmed,
    canCheckIn: row.status === "confirmed",
    canCheckOut: row.status === "checked_in",
  };
}

export async function loadReservationDeskKpis(params: {
  supabase: WorkspaceClient;
  restaurantId: string;
  businessDate: string;
}): Promise<ReservationDeskKpis> {
  const { supabase, restaurantId, businessDate } = params;
  const arrivals = operationalViewStatuses("arrivals") ?? [];
  const departures = operationalViewStatuses("departures") ?? [];
  const unassigned = operationalViewStatuses("unassigned") ?? [];
  const groups = operationalViewStatuses("groups") ?? [];
  const counts = reservationCount(supabase, restaurantId);

  const [
    arrivalsToday,
    departuresToday,
    inHouse,
    unassignedCount,
    pending,
    vipArrivals,
    linkedGroupReservations,
    availableStatusRooms,
    occupiedRows,
  ] = await Promise.all([
    exactCount(counts().in("status", arrivals).eq("arrival_date", businessDate)),
    exactCount(counts().in("status", departures).eq("departure_date", businessDate)),
    exactCount(counts().eq("status", "checked_in")),
    exactCount(counts().in("status", unassigned).is("room_id", null)),
    exactCount(counts().eq("status", "pending")),
    exactCount(
      supabase
        .from("hotel_reservations")
        .select("id, guest_profiles!hotel_reservations_guest_same_property!inner(vip_status)", {
          count: "exact",
          head: true,
        })
        .eq("restaurant_id", restaurantId)
        .in("status", arrivals)
        .eq("arrival_date", businessDate)
        .eq("guest_profiles.vip_status", true),
    ),
    exactCount(counts().in("status", groups).not("group_account_master_id", "is", null)),
    exactCount(
      supabase
        .from("hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .eq("status", "available"),
    ),
    supabase
      .from("hotel_reservations")
      .select("room_id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "checked_in")
      .not("room_id", "is", null),
  ]);

  if (occupiedRows.error) throw new Error(occupiedRows.error.message);
  const occupiedRooms = new Set(
    (occupiedRows.data ?? []).map((row: { room_id: string | null }) => row.room_id),
  ).size;

  return {
    arrivalsToday,
    departuresToday,
    inHouse,
    unassigned: unassignedCount,
    pending,
    vipArrivals,
    linkedGroupReservations,
    availableRooms: Math.max(0, availableStatusRooms - occupiedRooms),
    waitlist: null,
  };
}

export const getReservationDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => operationalReservationSearchInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ReservationDeskSnapshot> => {
    await requireReservationManager(context as never, data.restaurantId);
    const generatedAt = new Date().toISOString();
    const view = data.view ?? "all";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyResult = await supabaseAdmin
      .from("restaurants")
      .select("business_date, timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (!propertyResult.data) throw new Error("Property not found.");
    const businessDate = resolvePropertyBusinessDate(
      propertyResult.data.business_date,
      propertyResult.data.timezone,
    );

    const [kpis, page] = await Promise.all([
      loadReservationDeskKpis({
        supabase: context.supabase,
        restaurantId: data.restaurantId,
        businessDate,
      }),
      searchOperationalReservations({
        supabase: context.supabase,
        restaurantId: data.restaurantId,
        businessDate,
        input: data,
      }),
    ]);

    return {
      restaurantId: data.restaurantId,
      businessDate,
      generatedAt,
      view,
      query: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        hasMore: page.hasMore,
      },
      kpis,
      rows: page.rows.map((row) => ({ ...row, hints: deskActionHints(row) })),
      capabilities: DESK_CAPABILITIES,
    };
  });
