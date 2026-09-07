/**
 * Shared menu types and money formatting.
 *
 * The mock catalog that used to live here was migrated into the database
 * (menu_categories / menu_items) and removed: every menu shown to customers and
 * every price used by placeOrder now comes from Supabase, per restaurant.
 */
import { formatMoney } from "@/core/lib/restaurant-time";

export type DietaryTag = "Vegetarian" | "Vegan" | "Gluten Free";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string | null;
  dietaryTags?: DietaryTag[] | undefined;
}

/**
 * Money in the restaurant's configured currency. Callers that know the tenant
 * pass its currency code; the rest fall back to the platform default.
 */
export const formatPrice = (value: number, currencyCode?: string | null) =>
  formatMoney(value, currencyCode);
