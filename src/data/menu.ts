/**
 * Shared menu types and money formatting.
 *
 * The mock catalog that used to live here was migrated into the database
 * (menu_categories / menu_items) and removed: every menu shown to customers and
 * every price used by placeOrder now comes from Supabase, per restaurant.
 */
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

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
