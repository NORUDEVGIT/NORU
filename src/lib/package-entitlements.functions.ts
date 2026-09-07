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
