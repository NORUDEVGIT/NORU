import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getPropertyBusinessDate } from "./nightaudit.functions";
import { propertyToday } from "./reservation-dates";

export const PROPERTY_BUSINESS_DATE_KEY = "property-business-date";

/**
 * FO chrome date key — persisted restaurants.business_date, falling back to
 * propertyToday(timezone) the same way Night Audit loadProperty does.
 */
export function usePropertyBusinessDate(restaurantId: string, timezone: string): string {
  const fetchDate = useServerFn(getPropertyBusinessDate);
  const query = useQuery({
    queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId],
    queryFn: () => fetchDate({ data: { restaurantId } }),
    retry: false,
  });
  return query.data?.businessDate ?? propertyToday(timezone);
}
