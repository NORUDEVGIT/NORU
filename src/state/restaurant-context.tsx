import { createContext, useContext, type ReactNode } from "react";
import type { PublicRestaurant } from "@/lib/public-restaurant.functions";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "@/lib/restaurant-time";

const RestaurantContext = createContext<PublicRestaurant | null>(null);

export function RestaurantProvider({
  restaurant,
  children,
}: {
  restaurant: PublicRestaurant;
  children: ReactNode;
}) {
  return (
    <RestaurantContext.Provider value={restaurant}>{children}</RestaurantContext.Provider>
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

/** Tenant when inside /r/$restaurantSlug, otherwise null (shared components). */
export function useOptionalRestaurant(): PublicRestaurant | null {
  return useContext(RestaurantContext);
}

/** The tenant's configured currency, falling back to the platform default. */
export function useCurrencyCode(): string {
  return useContext(RestaurantContext)?.currencyCode ?? DEFAULT_CURRENCY;
}

/** The tenant's configured timezone, falling back to the platform default. */
export function useRestaurantTimezone(): string {
  return useContext(RestaurantContext)?.timezone ?? DEFAULT_TIMEZONE;
}
