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
  CARD4_CODE_TO_SECTION,
  listingSectionFromCard4Code,
  type GuestListingSectionId,
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

export const getGuestWorkspaceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<GuestWorkspaceConfig> => {
    await requireGuestManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin
      .from("pms_guest_profile_types")
      .select("id, name, code, active")
      .eq("restaurant_id", data.restaurantId)
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
      .filter((row) => row.code.trim().toUpperCase() !== "ORG")
      .map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        active: row.active,
        section: listingSectionFromCard4Code(row.code),
      }))
      .filter((row) => row.section !== null || Object.keys(CARD4_CODE_TO_SECTION).includes(row.code));
    return { available: true, types };
  });
