/**
 * Phase 6J — Direct booking engine, server-only helpers.
 *
 * These run for anonymous visitors, so nothing here trusts a restaurant id
 * from the browser: the property is always resolved from the public slug and
 * every other id is re-validated against that property before use.
 */
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from "./restaurant-time";
import { normalizeEmail, normalizePhone } from "./guests.server";

export interface StayProperty {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  contactEmail: string | null;
  contactPhone: string | null;
  bookingMessage: string | null;
}

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Public property resolution. Only approved, active properties with direct
 * booking switched on are visible; anything else looks like "not found".
 */
export type StayPropertyStatus = "ok" | "not_found" | "unavailable";

/**
 * Phase 8D2 — the public booking gate. Unknown/closed properties stay
 * "not_found" (anti-enumeration unchanged); a property whose PMS package is
 * off or expired reports "unavailable" so the page can show a neutral notice.
 */
export async function resolveStayPropertyPublic(
  slug: string,
): Promise<{ status: StayPropertyStatus; property: StayProperty | null }> {
  const property = await loadStayProperty(slug);
  if (!property) return { status: "not_found", property: null };

  const { publicPackageAvailable } = await import("./public-package.server");
  if (!(await publicPackageAvailable(property.id, "pms"))) {
    return { status: "unavailable", property: null };
  }
  return { status: "ok", property };
}

/**
 * Every public booking server function resolves the property through here, so
 * deep links and direct posts cannot bypass the package gate.
 */
export async function resolveStayProperty(slug: string): Promise<StayProperty | null> {
  return (await resolveStayPropertyPublic(slug)).property;
}

async function loadStayProperty(slug: string): Promise<StayProperty | null> {
  const db = await admin();
  const { data: row } = await db
    .from("restaurants")
    .select(
      "id, name, slug, city, logo_url, timezone, currency_code, approved, active, direct_booking_enabled, booking_contact_email, booking_contact_phone, booking_message",
    )
    .eq("slug", slug.toLowerCase())
    .maybeSingle();

  if (!row || !row.approved || !row.active || row.direct_booking_enabled === false) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city ?? null,
    logoUrl: row.logo_url ?? null,
    timezone: row.timezone ?? DEFAULT_TIMEZONE,
    currency: row.currency_code ?? DEFAULT_CURRENCY,
    contactEmail: row.booking_contact_email ?? null,
    contactPhone: row.booking_contact_phone ?? null,
    bookingMessage: row.booking_message ?? null,
  };
}

export const BOOKING_UNAVAILABLE = "This room is no longer available for those dates.";
export const LOOKUP_FAILED = "We couldn't find a booking matching those details.";

/**
 * Finds an existing guest of this property by normalized email, then phone.
 * Never reports back whether a match happened — the browser only ever sees a
 * reservation, so there is no way to enumerate guests from the public site.
 */
export async function matchOrCreateGuest(
  restaurantId: string,
  guest: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    nationality: string | null;
  },
): Promise<string> {
  const db = await admin();
  const email = normalizeEmail(guest.email);
  const phone = normalizePhone(guest.phone);

  if (email) {
    const { data } = await db
      .from("guest_profiles")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  if (phone) {
    const { data } = await db
      .from("guest_profiles")
      .select("id, phone")
      .eq("restaurant_id", restaurantId)
      .eq("phone", guest.phone ?? "")
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data: created, error } = await db
    .from("guest_profiles")
    .insert({
      restaurant_id: restaurantId,
      first_name: guest.firstName,
      last_name: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      nationality: guest.nationality,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error("We couldn't save your details. Please try again.");

  await db.from("guest_profile_history").insert({
    restaurant_id: restaurantId,
    guest_id: created.id,
    event_type: "created",
    new_values: { source: "direct_booking" } as never,
    notes: "Created from a direct booking.",
    actor_membership_id: null,
  });

  return created.id;
}

/** Append-only distribution log entry. Never stores credentials or raw payloads. */
export async function logDistribution(entry: {
  restaurantId: string;
  channelId?: string | null;
  eventType: string;
  status?: "success" | "failed" | "info";
  message?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  summary?: Record<string, unknown> | null;
}): Promise<void> {
  const db = await admin();
  await db.from("distribution_logs").insert({
    restaurant_id: entry.restaurantId,
    channel_id: entry.channelId ?? null,
    event_type: entry.eventType,
    status: entry.status ?? "success",
    message: entry.message ?? null,
    reference_type: entry.referenceType ?? null,
    reference_id: entry.referenceId ?? null,
    payload_summary: (entry.summary ?? null) as never,
  });
}

/** The property's DIRECT channel id, if it exists. */
export async function directChannelId(restaurantId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("distribution_channels")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("code", "DIRECT")
    .maybeSingle();
  return data?.id ?? null;
}
