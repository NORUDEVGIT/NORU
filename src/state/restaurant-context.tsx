import { createContext, useContext, type ReactNode } from "react";
import type { PublicRestaurant } from "@/lib/public-restaurant.functions";

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
