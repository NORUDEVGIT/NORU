/**
 * Read-only Guest Profile listing config for FO staff.
 * Card 4 writes stay on room-manager setup. Receptionists may read.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGuestManager } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  PROFILE_TYPE_CREATE_BLOCKED,
  listingCreateAllowed,
  listingSectionFromCard4Code,
  type GuestListingSectionId,
  type ListingTypeConfigSnapshot,
} from "./guest-profile-listing";

const idSchema = z.string().uuid();

export type GuestWorkspaceTypeConfig = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  section: GuestListingSectionId | null;
};

export type GuestWorkspaceConfig = {
  available: boolean;
  types: GuestWorkspaceTypeConfig[];
};

export async function loadGuestWorkspaceConfig(restaurantId: string): Promise<GuestWorkspaceConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin
    .from("pms_guest_profile_types")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (result.error && isMissingSchemaError(result.error)) {
    return { available: false, types: [] };
  }
  if (result.error && (result.error.code === "42P01" || result.error.code === "PGRST205")) {
    return { available: false, types: [] };
  }
  if (result.error) throw new Error(result.error.message);
  const types = ((result.data ?? []) as Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
  }>)
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      active: row.active,
      section: listingSectionFromCard4Code(row.code),
    }))
    .filter((row) => row.section !== null);
  return { available: true, types };
}

export async function assertListingCreateAllowed(
  restaurantId: string,
  section: GuestListingSectionId,
): Promise<void> {
  const config: ListingTypeConfigSnapshot = await loadGuestWorkspaceConfig(restaurantId);
  if (!listingCreateAllowed(section, config)) {
    throw new Error(PROFILE_TYPE_CREATE_BLOCKED);
  }
}

export const getGuestWorkspaceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestWorkspaceConfig> => {
    await requireGuestManager(context as never, data.restaurantId);
    return loadGuestWorkspaceConfig(data.restaurantId);
  });
