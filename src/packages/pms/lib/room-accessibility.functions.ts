import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { requirePmsActor } from "./pms-permissions.server";
import {
  buildAccessibilityReview,
  isAccessibilityAmenity,
  type AccessibilityReview,
} from "./room-accessibility";
import { effectiveAmenities, type AmenityOverrideKind } from "./rooms-card2-amenities.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = { from: (table: string) => any };

/** Read-only. Loads configuration for staff review; never writes. */
export async function loadAccessibilityReview(
  db: DbClient,
  restaurantId: string,
): Promise<AccessibilityReview> {
  const [
    { data: rooms },
    { data: roomTypes },
    { data: catalog },
    { data: mappings },
    { data: overrides },
    { data: rules },
  ] = await Promise.all([
    db.from("hotel_rooms").select("id, room_number, room_type_id, accessible, active").eq("restaurant_id", restaurantId),
    db.from("room_types").select("id, name, display_name, accessible_eligible, active").eq("restaurant_id", restaurantId),
    db.from("room_amenities").select("id, code, category").eq("restaurant_id", restaurantId),
    db.from("room_type_amenities").select("room_type_id, amenity_id").eq("restaurant_id", restaurantId),
    db.from("hotel_room_amenity_overrides").select("room_id, amenity_id, kind").eq("restaurant_id", restaurantId),
    db.from("pms_inventory_rules").select("require_accessibility_match").eq("restaurant_id", restaurantId).maybeSingle(),
  ]);

  const accessibilityIds = new Set(
    ((catalog ?? []) as Array<{ id: string; code: string | null; category: string | null }>)
      .filter(isAccessibilityAmenity)
      .map((row) => row.id),
  );
  const typeAmenities = new Map<string, string[]>();
  for (const row of (mappings ?? []) as Array<{ room_type_id: string; amenity_id: string }>) {
    typeAmenities.set(row.room_type_id, [...(typeAmenities.get(row.room_type_id) ?? []), row.amenity_id]);
  }
  const roomOverrides = new Map<string, Array<{ amenityId: string; kind: AmenityOverrideKind }>>();
  for (const row of (overrides ?? []) as Array<{ room_id: string; amenity_id: string; kind: AmenityOverrideKind }>) {
    roomOverrides.set(row.room_id, [
      ...(roomOverrides.get(row.room_id) ?? []),
      { amenityId: row.amenity_id, kind: row.kind },
    ]);
  }

  return buildAccessibilityReview({
    accessibilityRuleOn: Boolean(
      (rules as { require_accessibility_match?: boolean } | null)?.require_accessibility_match,
    ),
    roomTypes: (
      (roomTypes ?? []) as Array<{
        id: string;
        name: string | null;
        display_name: string | null;
        accessible_eligible: boolean | null;
        active: boolean | null;
      }>
    ).map((type) => ({
      id: type.id,
      name: (type.display_name ?? "").trim() || (type.name ?? ""),
      containsAccessibleRooms: type.accessible_eligible === true,
      active: type.active !== false,
    })),
    rooms: (
      (rooms ?? []) as Array<{
        id: string;
        room_number: string;
        room_type_id: string | null;
        accessible: boolean | null;
        active: boolean | null;
      }>
    ).map((room) => ({
      roomNumber: room.room_number,
      roomTypeId: room.room_type_id,
      accessible: room.accessible === true,
      active: room.active !== false,
      accessibilityFeatureCount: effectiveAmenities({
        typeAmenityIds: room.room_type_id ? (typeAmenities.get(room.room_type_id) ?? []) : [],
        overrides: roomOverrides.get(room.id) ?? [],
      }).effective.filter((id) => accessibilityIds.has(id)).length,
    })),
  });
}

export const getAccessibilityReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW);
    return loadAccessibilityReview(context.supabase as unknown as DbClient, data.restaurantId);
  });
