/**
 * Operational access for a restaurant/property.
 *
 * Approval (`approved && active`) is independent of commercial package
 * entitlements. Pending, suspended, rejected and inactive properties must not
 * run package dashboards or package server functions.
 */
export const RESTAURANT_NOT_OPERATIONAL = "This restaurant isn't available yet.";

export function isRestaurantOperational(approved: boolean, active: boolean): boolean {
  return approved === true && active === true;
}

export async function loadRestaurantOperationalFlags(restaurantId: string): Promise<{
  approved: boolean;
  active: boolean;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("approved, active")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    console.error("[loadRestaurantOperationalFlags]", error.message);
    return null;
  }
  if (!data) return null;
  return { approved: data.approved, active: data.active };
}

export async function restaurantIsOperational(restaurantId: string): Promise<boolean> {
  const flags = await loadRestaurantOperationalFlags(restaurantId);
  if (!flags) return false;
  return isRestaurantOperational(flags.approved, flags.active);
}

export async function assertRestaurantOperational(restaurantId: string): Promise<void> {
  if (!(await restaurantIsOperational(restaurantId))) {
    throw new Error(RESTAURANT_NOT_OPERATIONAL);
  }
}
