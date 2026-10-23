/**
 * Server entry for the Police / Guest Stay register.
 *
 * restaurant_id comes from the authenticated handler, not from a browser filter.
 * Callers must pass a trusted server client that can read restaurants.business_date.
 * Identity columns are guest_profiles only. Query failures throw.
 *
 * Index note, no migration: hotel_reservation_rooms is indexed by
 * (restaurant_id, reservation_id), (restaurant_id, room_type_id, arrival_date),
 * and (restaurant_id, room_id, arrival_date). There is no dedicated
 * status + departure overlap index. Per-property stay volume is small enough
 * for this read. Add an index only if that scan shows up in production.
 */
import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { assertDateOnly } from "@/packages/pms/lib/reservations.server";
import {
  loadPoliceStayDataset,
  type PoliceStayDb,
  type PoliceStayReportFilters,
  type PoliceStayReportResult,
} from "@/packages/pms/lib/police-stay-report";

export type { PoliceStayDb, PoliceStayQuery } from "@/packages/pms/lib/police-stay-report";

export async function loadPoliceStayReport(
  db: PoliceStayDb,
  restaurantId: string,
  filters: PoliceStayReportFilters,
): Promise<PoliceStayReportResult> {
  const stayDate = assertDateOnly(filters.stayDate, "Stay date");
  return loadPoliceStayDataset(
    db,
    restaurantId,
    { ...filters, stayDate },
    resolvePropertyBusinessDate,
  );
}
