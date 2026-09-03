/**
 * Rooms & Front Office foundation — server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; a
 * restaurant id from the browser is never trusted on its own. Room setup is
 * limited to owners and managers.
 */
import { type AuthedCtx, type Membership } from "./workforce.server";
import { requireModuleRole } from "./module-access.server";
import { FRONT_OFFICE_ROLES } from "./module-access";

/** Room & room-type configuration stays with owners and managers. */
export const ROOM_MANAGE_ROLES = ["owner", "manager"] as const;
/** Daily front-office operations also include receptionists. */
export const ROOM_ACCESS_ROLES = FRONT_OFFICE_ROLES;

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

export function canAccessFrontOffice(role: string): boolean {
  return (ROOM_ACCESS_ROLES as readonly string[]).includes(role);
}

/** Room configuration membership (owner/manager), or a hard failure. */
export async function requireRoomManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requireModuleRole(
    context,
    restaurantId,
    "configuration",
    ROOM_MANAGE_ROLES,
    "You don't have permission to configure rooms for this property.",
  );
}

/** Front-office membership (owner/manager/receptionist), or a hard failure. */
export async function requireFrontOfficeAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return requireModuleRole(
    context,
    restaurantId,
    "front_office",
    ROOM_ACCESS_ROLES,
    "You don't have access to Front Office for this property.",
  );
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
