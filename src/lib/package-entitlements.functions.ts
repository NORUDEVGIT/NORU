/**
 * Phase 8B1 — current-user package entitlement resolver.
 *
 * The restaurant id from the browser is never trusted on its own: the
 * caller's active membership is re-derived first, exactly like every other
 * tenant-scoped server function in the project.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PackageKey, PackageState } from "./package-entitlements";

export interface MyPackageEntitlements {
  packages: Record<PackageKey, boolean>;
  states: PackageState[];
}

export const getMyPackageEntitlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MyPackageEntitlements> => {
    const { callerMembership } = await import("./workforce.server");
    const membership = await callerMembership(context as never, data.restaurantId);

    const { getPropertyPackageEntitlements, packageFlags } = await import(
      "./package-entitlements.server"
    );
    const { PACKAGE_KEYS } = await import("./package-entitlements");

    const states = await getPropertyPackageEntitlements(
      (context as never as { supabase: { from: (t: string) => any } }).supabase,
      membership.restaurantId,
    );

    return {
      packages: packageFlags(states),
      states: PACKAGE_KEYS.map((key) => states[key]),
    };
  });

/* ------------------------------------------------------------------ *
 * Phase 8B2 — Platform Admin package controls
 *
 * Package entitlement is a COMMERCIAL layer: it records what a property has
 * been sold. It is separate from staff module access, which decides which
 * people inside that property may use a feature. Nothing here enforces
 * anything yet — enforcement lands in Phase 8C.
 * ------------------------------------------------------------------ */

export interface AdminPackageState extends PackageState {
  enabledFlag: boolean;
  activatedAt: string | null;
}

const packageKeySchema = z.enum(["restaurant_management", "pms", "pos", "back_office"]);
const restaurantIdSchema = z.string().uuid();

async function loadAdminStates(restaurantId: string): Promise<AdminPackageState[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { PACKAGE_KEYS, resolvePackages } = await import("./package-entitlements");

  const { data } = await supabaseAdmin
    .from("restaurant_package_entitlements")
    .select("package_key, enabled, activated_at, expires_at")
    .eq("restaurant_id", restaurantId);

  const rows = data ?? [];
  const states = resolvePackages(rows, new Date());
  const byKey = new Map(rows.map((r) => [r.package_key, r]));

  return PACKAGE_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      ...states[key],
      // The stored switch, before expiry is applied — an admin needs to see
      // "on but expired" as distinct from "switched off".
      enabledFlag: row ? row.enabled : true,
      activatedAt: row?.activated_at ?? null,
    };
  });
}

async function requireExistingRestaurant(restaurantId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("restaurants")
    .select("id, name")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That property could not be found.");
  return data.name;
}

export const getPackageEntitlementsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: restaurantIdSchema }).parse(input))
  .handler(async ({ data, context }): Promise<AdminPackageState[]> => {
    const { requirePlatformAdmin } = await import("./admin-authz");
    await requirePlatformAdmin(context as never);
    await requireExistingRestaurant(data.restaurantId);
    return loadAdminStates(data.restaurantId);
  });

interface MutationResult {
  states: AdminPackageState[];
}

/**
 * The one authoritative package mutation. Platform Admin only, service-role
 * write, always audited. `activated_at` records the most recent switch-on and
 * is never used to decide access.
 */
export const setPropertyPackageEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: restaurantIdSchema,
        packageKey: packageKeySchema,
        enabled: z.boolean(),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<MutationResult> => {
    const { requirePlatformAdmin } = await import("./admin-authz");
    const adminId = await requirePlatformAdmin(context as never);
    await requireExistingRestaurant(data.restaurantId);

    const expiresAt = data.expiresAt ?? null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new Error("An expiry date must be in the future.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: previous } = await supabaseAdmin
      .from("restaurant_package_entitlements")
      .select("enabled, activated_at, expires_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("package_key", data.packageKey)
      .maybeSingle();

    const now = new Date().toISOString();
    const wasOn = previous ? previous.enabled : null;
    // Latest activation time: set whenever the package is switched on.
    const activatedAt = data.enabled
      ? wasOn === true
        ? (previous?.activated_at ?? now)
        : now
      : (previous?.activated_at ?? null);

    const { error } = await supabaseAdmin
      .from("restaurant_package_entitlements")
      .upsert(
        {
          restaurant_id: data.restaurantId,
          package_key: data.packageKey,
          enabled: data.enabled,
          activated_at: activatedAt,
          expires_at: expiresAt,
          updated_at: now,
        },
        { onConflict: "restaurant_id,package_key" },
      );
    if (error) {
      console.error("[setPropertyPackageEntitlement]", error.message);
      throw new Error("We couldn't save that package change. Please try again.");
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: adminId,
      action: data.enabled ? "package_entitlement_enabled" : "package_entitlement_disabled",
      restaurant_id: data.restaurantId,
      reason: null,
      metadata: {
        package_key: data.packageKey,
        previous_source: previous ? "explicit" : "default_compatibility",
        previous_enabled: wasOn,
        new_enabled: data.enabled,
        previous_expires_at: previous?.expires_at ?? null,
        new_expires_at: expiresAt,
        activated_at: activatedAt,
      },
    });

    return { states: await loadAdminStates(data.restaurantId) };
  });

/**
 * Removes the explicit row so the package returns to the compatibility
 * default. This is NOT the same as disabling it.
 */
export const clearPropertyPackageEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: restaurantIdSchema, packageKey: packageKeySchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MutationResult> => {
    const { requirePlatformAdmin } = await import("./admin-authz");
    const adminId = await requirePlatformAdmin(context as never);
    await requireExistingRestaurant(data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: previous } = await supabaseAdmin
      .from("restaurant_package_entitlements")
      .select("enabled, activated_at, expires_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("package_key", data.packageKey)
      .maybeSingle();

    if (!previous) {
      return { states: await loadAdminStates(data.restaurantId) };
    }

    const { error } = await supabaseAdmin
      .from("restaurant_package_entitlements")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("package_key", data.packageKey);
    if (error) {
      console.error("[clearPropertyPackageEntitlement]", error.message);
      throw new Error("We couldn't reset that package. Please try again.");
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      admin_user_id: adminId,
      action: "package_entitlement_reset",
      restaurant_id: data.restaurantId,
      reason: null,
      metadata: {
        package_key: data.packageKey,
        previous_source: "explicit",
        previous_enabled: previous.enabled,
        new_enabled: null,
        previous_expires_at: previous.expires_at ?? null,
        new_expires_at: null,
        new_source: "default_compatibility",
      },
    });

    return { states: await loadAdminStates(data.restaurantId) };
  });
