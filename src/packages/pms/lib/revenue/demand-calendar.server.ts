/**
 * Demand Calendar loader — live demand + rate calendar + 7D snapshot pickup.
 * Does not capture snapshots. Does not invent forecast.
 */

import { loadRevenueDemandOverview } from "./demand.server";
import { loadRevenueRateCalendar } from "./rate-calendar.server";
import { loadRevenuePickupPace } from "./pickup-pace.server";
import { DEMAND_CALENDAR_PICKUP_WINDOW, buildDemandCalendarModel, type DemandCalendarQuery, type DemandCalendarWorkspace } from "./demand-calendar";
import { clampRateCalendarRange } from "./rate-calendar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export async function loadRevenueDemandCalendar(
  db: DbClient,
  query: DemandCalendarQuery,
): Promise<DemandCalendarWorkspace> {
  const range = clampRateCalendarRange(query.fromDate, query.toDate);
  const roomTypeId = query.roomTypeId ?? null;
  const [demand, rates, pickup] = await Promise.all([
    loadRevenueDemandOverview(db, {
      restaurantId: query.restaurantId,
      fromDate: range.fromDate,
      toDate: range.toDate,
      roomTypeId,
    }),
    loadRevenueRateCalendar(db, {
      restaurantId: query.restaurantId,
      fromDate: range.fromDate,
      toDate: range.toDate,
      roomTypeId,
    }),
    loadRevenuePickupPace(db, {
      restaurantId: query.restaurantId,
      windowDays: DEMAND_CALENDAR_PICKUP_WINDOW,
      fromDate: range.fromDate,
      toDate: range.toDate,
      roomTypeId,
    }),
  ]);

  return buildDemandCalendarModel(demand, rates, pickup);
}
