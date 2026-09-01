/**
 * Rooms & Front Office foundation — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is never trusted on its own. Room setup is
 * limited to owners and managers.
 */
import { callerMembership, type AuthedCtx, type Membership } from "./workforce.server";

export const ROOM_MANAGE_ROLES = ["owner", "manager"] as const;

export const ROOM_BUCKET = "property-images";

export const ROOM_STATUSES = ["available", "out_of_order", "out_of_service"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const DEFAULT_AMENITIES = [
  "Wi-Fi",
  "Air Conditioning",
  "TV",
  "Minibar",
  "Balcony",
  "Bathtub",
  "City View",
  "Accessible Bathroom",
] as const;

export const IMAGE_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function canManageRooms(role: string): boolean {
  return (ROOM_MANAGE_ROLES as readonly string[]).includes(role);
}

/** Owner/manager membership for this restaurant, or a hard failure. */
export async function requireRoomManager(context: AuthedCtx, restaurantId: string): Promise<Membership> {
  const me = await callerMembership(context, restaurantId);
  if (!canManageRooms(me.role)) {
    throw new Error("You don't have access to the Rooms module for this property.");
  }
  return me;
}

/** Storage object path inside this property's own namespace. */
export function roomTypeImagePath(restaurantId: string, roomTypeId: string, ext: string): string {
  return `${restaurantId}/room-types/${roomTypeId}/${crypto.randomUUID()}.${ext}`;
}

/** Signed read URLs for a set of storage paths. */
export async function signRoomImages(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(paths));
  if (unique.length === 0) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(ROOM_BUCKET).createSignedUrls(unique, 3600);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
