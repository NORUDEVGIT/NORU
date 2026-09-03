/**
 * Phase 7C — module access server functions.
 *
 * `getMyModuleAccess` drives the Property Home tiles and sidebar; the staff
 * override functions are owner/manager only and can never grant a module
 * outside OVERRIDABLE_MODULES.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MODULE_KEYS,
  OVERRIDABLE_MODULES,
  defaultModulesForRole,
  resolveModules,
  type ModuleKey,
} from "./module-access";

const idSchema = z.string().uuid();
const moduleSchema = z.enum(MODULE_KEYS as unknown as [string, ...string[]]);

export interface MyModuleAccess {
  role: string;
  membershipId: string;
  modules: ModuleKey[];
}

export interface StaffModuleAccessRow {
  moduleKey: ModuleKey;
  label: string;
  byDefault: boolean;
  enabled: boolean;
  overridden: boolean;
  overridable: boolean;
}

/** The caller's own resolved modules for this property. */
export const getMyModuleAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<MyModuleAccess> => {
    const { resolveCallerAccess } = await import("./module-access.server");
    const access = await resolveCallerAccess(context as never, data.restaurantId);
    return {
      role: access.membership.role,
      membershipId: access.membership.id,
      modules: access.modules,
    };
  });

/** Owner/manager view of one staff member's module access. */
export const getStaffModuleAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, membershipId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ role: string; rows: StaffModuleAccessRow[] }> => {
    const { requireModuleRole, loadModuleOverrides } = await import("./module-access.server");
    await requireModuleRole(context as never, data.restaurantId, "human_resources", [
      "owner",
      "manager",
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMembership } = await import("./workforce.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);

    const overrides = await loadModuleOverrides(supabaseAdmin, data.restaurantId, target.id);
    const defaults = defaultModulesForRole(target.role);
    const resolved = resolveModules(target.role, overrides);
    const { MODULE_LABELS } = await import("./module-access");

    return {
      role: target.role,
      rows: (MODULE_KEYS as readonly ModuleKey[]).map((key) => ({
        moduleKey: key,
        label: MODULE_LABELS[key],
        byDefault: defaults.includes(key),
        enabled: resolved.includes(key),
        overridden: overrides[key] !== undefined,
        overridable: OVERRIDABLE_MODULES.includes(key),
      })),
    };
  });

/** Toggle (or clear) one module override for a staff member. */
export const setStaffModuleAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        membershipId: idSchema,
        moduleKey: moduleSchema,
        // null clears the override and falls back to the role default.
        enabled: z.boolean().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { requireModuleRole } = await import("./module-access.server");
    const actor = await requireModuleRole(context as never, data.restaurantId, "human_resources", [
      "owner",
      "manager",
    ]);

    const moduleKey = data.moduleKey as ModuleKey;
    if (!OVERRIDABLE_MODULES.includes(moduleKey)) {
      throw new Error("That module can't be changed per staff member.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadMembership } = await import("./workforce.server");
    const target = await loadMembership(supabaseAdmin, data.restaurantId, data.membershipId);

    if (target.id === actor.id) {
      throw new Error("You can't change your own module access.");
    }
    if (target.role === "owner" || target.role === "manager") {
      throw new Error("Owners and managers always have full module access.");
    }

    if (data.enabled === null) {
      await supabaseAdmin
        .from("staff_module_access")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("membership_id", target.id)
        .eq("module_key", moduleKey);
      return { ok: true };
    }

    const { error } = await supabaseAdmin.from("staff_module_access").upsert(
      {
        restaurant_id: data.restaurantId,
        membership_id: target.id,
        module_key: moduleKey,
        enabled: data.enabled,
        created_by_membership_id: actor.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,membership_id,module_key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
