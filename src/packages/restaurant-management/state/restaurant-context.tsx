import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PublicRestaurant } from "@/packages/restaurant-management/lib/public-restaurant.functions";
import {
  DEFAULT_RM_TAX_SETTINGS,
  computeRmBill,
  type RmBillTotals,
  type RmTaxSettings,
} from "@/packages/restaurant-management/lib/rm-tax";
import { RestaurantSettingsProvider } from "@/core/state/property-format";

export type { RestaurantSettings } from "@/core/state/property-format";
export {
  RestaurantSettingsProvider,
  useMoney,
  useRestaurantSettings,
  useRestaurantTime,
  useRestaurantTimezone,
} from "@/core/state/property-format";

const RestaurantContext = createContext<PublicRestaurant | null>(null);

export function RestaurantProvider({
  restaurant,
  children,
}: {
  restaurant: PublicRestaurant;
  children: ReactNode;
}) {
  return (
    <RestaurantContext.Provider value={restaurant}>
      <RestaurantSettingsProvider timezone={restaurant.timezone} currencyCode={restaurant.currencyCode}>
        {children}
      </RestaurantSettingsProvider>
    </RestaurantContext.Provider>
  );
}

/** The tenant resolved from the /r/$restaurantSlug URL. Never from session state. */
export function useRestaurant(): PublicRestaurant {
  const restaurant = useContext(RestaurantContext);
  if (!restaurant) {
    throw new Error("useRestaurant must be used inside a /r/$restaurantSlug route");
  }
  return restaurant;
}

export function useOptionalRestaurant(): PublicRestaurant | null {
  return useContext(RestaurantContext);
}

/** Live bill from current restaurant tax settings (guest QR / header). */
export function useLiveRmBill(merchandiseSubtotal: number, settings?: RmTaxSettings): RmBillTotals {
  const restaurant = useOptionalRestaurant();
  const resolved = settings ?? restaurant?.taxSettings ?? DEFAULT_RM_TAX_SETTINGS;
  return useMemo(
    () => computeRmBill(merchandiseSubtotal, resolved),
    [merchandiseSubtotal, resolved.taxRate, resolved.taxInclusive, resolved.serviceEnabled, resolved.serviceRate],
  );
}
