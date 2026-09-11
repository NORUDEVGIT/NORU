/**
 * Issue #22 — server load of RM tax/service settings.
 *
 * Reads RM-owned columns on `restaurants`. Never `pos_settings` / `pos_*`.
 */
import {
  DEFAULT_RM_TAX_SETTINGS,
  parseRmTaxSettings,
  type RmTaxSettings,
  type RmTaxSettingsRow,
} from "./rm-tax";

export async function loadRestaurantTaxSettings(
  admin: { from: (table: string) => any },
  restaurantId: string,
): Promise<RmTaxSettings> {
  const { data, error } = await admin
    .from("restaurants")
    .select("tax_rate, tax_inclusive, service_enabled, service_rate")
    .eq("id", restaurantId)
    .maybeSingle();

  if (error || !data) return DEFAULT_RM_TAX_SETTINGS;
  return parseRmTaxSettings(data as RmTaxSettingsRow);
}
