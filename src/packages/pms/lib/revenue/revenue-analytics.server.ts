/**
 * Revenue Performance & Commercial Analytics Server Read Models (P8-STEP-02).
 *
 * Implements authoritative stay-date allocation from nightly_rate_snapshot.
 * Non-inventory dimension filters strictly disable Occupancy and RevPAR.
 * All reservation counts reflect COUNT(DISTINCT reservation_id).
 */

import { rateError } from "../rates.server.ts";
import {
  computeCommercialPerformance,
  computeRevenuePerformanceOverview,
  validateAnalyticsRange,
  type CommercialPerformance,
  type RawReservationInput,
  type RevenuePerformanceOverview,
  type RevenuePerformanceQuery,
} from "./revenue-analytics.ts";

export * from "./revenue-analytics.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export async function loadRevenuePerformanceOverview(
  db: DbClient,
  query: RevenuePerformanceQuery,
): Promise<RevenuePerformanceOverview> {
  if (query.salesChannelId) {
    throw rateError("REVENUE_ANALYTICS_SALES_CHANNEL_UNSUPPORTED");
  }
  const { fromDate, toDate } = validateAnalyticsRange(query.fromDate, query.toDate);

  // Property currency
  const propertyRes = await db
    .from("restaurants")
    .select("currency_code")
    .eq("id", query.restaurantId)
    .maybeSingle();
  const propertyCurrency = propertyRes?.data?.currency_code || "GBP";

  // Active rooms inventory
  const roomsRes = await db
    .from("hotel_rooms")
    .select("id, room_type_id")
    .eq("restaurant_id", query.restaurantId)
    .eq("active", true);
  if (roomsRes.error) throw rateError(roomsRes.error.message);
  const activeRooms = (roomsRes.data ?? []) as Array<{ id: string; room_type_id: string }>;

  // Masters
  const [typesRes, plansRes] = await Promise.all([
    db.from("room_types").select("id, name").eq("restaurant_id", query.restaurantId),
    db.from("hotel_rate_plans").select("id, code, name").eq("restaurant_id", query.restaurantId),
  ]);
  const roomTypes = (typesRes.data ?? []) as Array<{ id: string; name: string }>;
  const ratePlans = (plansRes.data ?? []) as Array<{ id: string; code: string; name: string }>;

  // Fetch reservations in range
  let resQuery = db
    .from("hotel_reservations")
    .select(
      "id, room_type_id, rate_plan_id, market_segment, commercial_booking_source, source, arrival_date, departure_date, nightly_rate_snapshot, currency, created_at, status",
    )
    .eq("restaurant_id", query.restaurantId)
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("arrival_date", toDate)
    .gt("departure_date", fromDate);

  if (query.roomTypeId) resQuery = resQuery.eq("room_type_id", query.roomTypeId);
  if (query.ratePlanId) resQuery = resQuery.eq("rate_plan_id", query.ratePlanId);
  if (query.marketSegmentId) resQuery = resQuery.eq("market_segment", query.marketSegmentId);
  if (query.commercialSourceId)
    resQuery = resQuery.eq("commercial_booking_source", query.commercialSourceId);
  if (query.technicalOrigin) resQuery = resQuery.eq("source", query.technicalOrigin);

  const { data: resData, error: resError } = await resQuery;
  if (resError) throw rateError(resError.message);

  const rawReservations = (resData ?? []) as RawReservationInput[];

  return computeRevenuePerformanceOverview({
    query,
    reservations: rawReservations,
    activeRooms,
    roomTypes,
    ratePlans,
    propertyCurrency,
  });
}

export async function loadCommercialPerformance(
  db: DbClient,
  input: {
    restaurantId: string;
    fromDate: string;
    toDate: string;
    roomTypeId?: string | null;
    ratePlanId?: string | null;
  },
): Promise<CommercialPerformance> {
  const { fromDate, toDate } = validateAnalyticsRange(input.fromDate, input.toDate);

  // Property currency
  const propertyRes = await db
    .from("restaurants")
    .select("currency_code")
    .eq("id", input.restaurantId)
    .maybeSingle();
  const propertyCurrency = propertyRes?.data?.currency_code || "GBP";

  // Eligible reservations in range
  let resQuery = db
    .from("hotel_reservations")
    .select("id, arrival_date, departure_date, room_type_id, rate_plan_id")
    .eq("restaurant_id", input.restaurantId)
    .in("status", ["confirmed", "checked_in", "checked_out"])
    .lte("arrival_date", toDate)
    .gt("departure_date", fromDate);

  if (input.roomTypeId) resQuery = resQuery.eq("room_type_id", input.roomTypeId);
  if (input.ratePlanId) resQuery = resQuery.eq("rate_plan_id", input.ratePlanId);

  const { data: resData, error: resError } = await resQuery;
  if (resError) throw rateError(resError.message);

  const reservations = (resData ?? []) as Array<{
    id: string;
    arrival_date: string;
    departure_date: string;
  }>;
  const resIds = reservations.map((r) => r.id);

  if (resIds.length === 0) {
    return {
      restaurantId: input.restaurantId,
      fromDate,
      toDate,
      currency: propertyCurrency,
      dateBasis: "stay_date",
      promotions: [],
      packages: [],
      metadata: {
        attributionStartMigration: "0104",
        claimsSettlement: false,
        claimsRoi: false,
      },
    };
  }

  // Fetch promotion attributions and activations
  const [promoAttRes, pkgAttRes, promoActRes, pkgActRes] = await Promise.all([
    db
      .from("hotel_reservation_promotions")
      .select(
        "reservation_id, promotion_activation_id, discount_amount, base_room_subtotal, room_subtotal_after_promotion",
      )
      .in("reservation_id", resIds),
    db
      .from("hotel_reservation_packages")
      .select("reservation_id, package_activation_id, applied_amount, quantity")
      .in("reservation_id", resIds),
    db
      .from("hotel_commercial_promotion_activations")
      .select("id, hotel_commercial_promotions ( name )")
      .eq("restaurant_id", input.restaurantId),
    db
      .from("hotel_commercial_package_activations")
      .select("id, hotel_commercial_packages ( name )")
      .eq("restaurant_id", input.restaurantId),
  ]);

  if (promoAttRes.error) throw rateError(promoAttRes.error.message);
  if (pkgAttRes.error) throw rateError(pkgAttRes.error.message);

  return computeCommercialPerformance({
    restaurantId: input.restaurantId,
    fromDate,
    toDate,
    propertyCurrency,
    eligibleReservations: reservations,
    promoAttributions: promoAttRes.data ?? [],
    packageAttributions: pkgAttRes.data ?? [],
    promoActivations: promoActRes.data ?? [],
    packageActivations: pkgActRes.data ?? [],
  });
}
