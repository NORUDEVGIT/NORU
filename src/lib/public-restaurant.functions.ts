import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "./restaurant-time";

const slugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/i, "invalid slug"),
});

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  logo_url: string | null;
  timezone: string;
  currencyCode: string;
}

/**
 * Public tenant resolution for /r/:restaurantSlug. Only approved AND active
 * restaurants are exposed; anything else looks like "not found" to the public.
 * Reads go through the anon (RLS-bound) client, never the privileged client.
 */
export const getPublicRestaurant = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }): Promise<PublicRestaurant | null> => {
    const { publicServerClient } = await import("./order-pricing.server");
    const { data: row, error } = await publicServerClient()
      .from("restaurants")
      .select("id, name, slug, city, logo_url, timezone, currency_code, approved, active")
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();

    if (error || !row || !row.approved || !row.active) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      city: row.city ?? null,
      logo_url: row.logo_url ?? null,
      timezone: row.timezone ?? DEFAULT_TIMEZONE,
      currencyCode: row.currency_code ?? DEFAULT_CURRENCY,
    };
  });
