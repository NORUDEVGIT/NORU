import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PublicRestaurant } from "@/lib/public-restaurant.functions";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, formatMoney } from "@/lib/restaurant-time";

const RestaurantContext = createContext<PublicRestaurant | null>(null);

export interface RestaurantSettings {
  timezone: string;
  currencyCode: string;
}

/**
 * Locale settings for whichever restaurant the current screen belongs to.
 * Customer routes fill it from the tenant in the URL; restaurant staff routes
 * fill it from the signed-in membership. Everything money/time formats through
 * it so one restaurant is never rendered with another's conventions.
 */
const RestaurantSettingsContext = createContext<RestaurantSettings>({
  timezone: DEFAULT_TIMEZONE,
  currencyCode: DEFAULT_CURRENCY,
});

export function RestaurantSettingsProvider({
  timezone,
  currencyCode,
  children,
}: {
  timezone: string;
  currencyCode: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ timezone, currencyCode }), [timezone, currencyCode]);
  return <RestaurantSettingsContext.Provider value={value}>{children}</RestaurantSettingsContext.Provider>;
}

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

export function useRestaurantSettings(): RestaurantSettings {
  return useContext(RestaurantSettingsContext);
}

/** The active restaurant's timezone, falling back to the platform default. */
export function useRestaurantTimezone(): string {
  return useContext(RestaurantSettingsContext).timezone;
}

/** A money formatter bound to the active restaurant's currency. */
export function useMoney(): (value: number) => string {
  const { currencyCode } = useContext(RestaurantSettingsContext);
  return useMemo(() => (value: number) => formatMoney(value, currencyCode), [currencyCode]);
}
