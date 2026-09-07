/**
 * Guest profiles foundation (Phase 6C) — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is never trusted on its own. Guest data is
 * owner/manager only and never surfaced on public/customer routes.
 */
import { type AuthedCtx, type Membership } from "./workforce.server";
import { requireModuleRole } from "./module-access.server";
import { withPmsPackage } from "./pms-package.server";

export const GUEST_MANAGE_ROLES = ["owner", "manager", "receptionist"] as const;

export const GUEST_STATUSES = ["active", "inactive"] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

export const GUEST_EVENT_TYPES = [
  "created",
  "profile_updated",
  "vip_changed",
  "status_changed",
  "preference_updated",
  "note_added",
] as const;
export type GuestEventType = (typeof GUEST_EVENT_TYPES)[number];

export function canManageGuests(role: string): boolean {
  return (GUEST_MANAGE_ROLES as readonly string[]).includes(role);
}

/** Owner/manager membership for this property, or a hard failure. */
export async function requireGuestManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "front_office",
      GUEST_MANAGE_ROLES,
      "You don't have access to Guest Management for this property.",
    ),
  );
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Lowercased, trimmed email used for duplicate lookups. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = blankToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Digits only, so +251 91 123 4567 and 0911234567 compare sensibly. */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/[^0-9]/g, "");
  return digits === "" ? null : digits;
}

/** Append-only history row. Written with the service role: the table has no INSERT policy. */
export async function recordGuestEvent(entry: {
  restaurantId: string;
  guestId: string;
  eventType: GuestEventType;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("guest_profile_history").insert({
    restaurant_id: entry.restaurantId,
    guest_id: entry.guestId,
    event_type: entry.eventType,
    previous_values: (entry.previousValues ?? null) as never,
    new_values: (entry.newValues ?? null) as never,
    notes: entry.notes ?? null,
    actor_membership_id: entry.actorMembershipId,
  });
}

/** Shallow diff of two records, restricted to the given keys. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  keys: readonly string[],
): { previous: Record<string, unknown>; next: Record<string, unknown> } | null {
  const previous: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  let changed = false;
  for (const key of keys) {
    if ((before[key] ?? null) !== (after[key] ?? null)) {
      previous[key] = before[key] ?? null;
      next[key] = after[key] ?? null;
      changed = true;
    }
  }
  return changed ? { previous, next } : null;
}
