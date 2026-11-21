import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPropertyBusinessDate } from "./nightaudit.functions";

export const PROPERTY_BUSINESS_DATE_KEY = "property-business-date";

export type PropertyBusinessDateState = {
  /** Persisted hotel day when loaded. Null while loading or on configuration error. */
  businessDate: string | null;
  persistedBusinessDate: string | null;
  timezone: string | null;
  endOfDayPending: boolean;
  endOfDayPendingKind: "none" | "due" | "overdue";
  endOfDayPendingTitle: string | null;
  endOfDayPendingDetail: string | null;
  loading: boolean;
  error: string | null;
};

/**
 * FO / PMS chrome hotel day — restaurants.business_date only.
 * Does not fall back to propertyToday / browser / UTC while loading.
 * Polls so the shared Night Audit due/overdue banner can appear at window start
 * without a full page reload.
 */
export function usePropertyBusinessDateQuery(
  restaurantId: string,
): PropertyBusinessDateState {
  const fetchDate = useServerFn(getPropertyBusinessDate);
  const query = useQuery({
    queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId],
    queryFn: () => fetchDate({ data: { restaurantId } }),
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const errorMessage =
    query.error instanceof Error
      ? query.error.message
      : query.error
        ? "Hotel business date is unavailable."
        : null;
  return {
    businessDate: query.data?.businessDate ?? null,
    persistedBusinessDate: query.data?.persistedBusinessDate ?? null,
    timezone: query.data?.timezone ?? null,
    endOfDayPending: query.data?.endOfDayPending === true,
    endOfDayPendingKind:
      query.data?.endOfDayPendingKind === "due" ||
      query.data?.endOfDayPendingKind === "overdue"
        ? query.data.endOfDayPendingKind
        : "none",
    endOfDayPendingTitle: query.data?.endOfDayPendingTitle ?? null,
    endOfDayPendingDetail: query.data?.endOfDayPendingDetail ?? null,
    loading: query.isLoading,
    error: errorMessage,
  };
}

/**
 * Convenience for callers that already treat a missing date as a soft empty string.
 * Prefer usePropertyBusinessDateQuery when loading/error must be distinguished.
 */
export function usePropertyBusinessDate(restaurantId: string, _timezone?: string): string {
  const state = usePropertyBusinessDateQuery(restaurantId);
  return state.businessDate ?? "";
}
