/**
 * Phase 7C — server-side module access resolver.
 *
 * One place decides whether a membership may ENTER a workspace. Every caller
 * (Property Home tiles, sidebars, route guards, module access functions) goes
 * through this so UI and server can never disagree. Fine-grained write
 * permissions stay with each module's own role guard.
 */
import { callerMembership, type AuthedCtx, type Membership } from "./workforce.server";
import { MODULE_LABELS, resolveModules, type ModuleKey } from "./module-access";

/** Override rows for one membership, as { module_key: enabled }. */
export async function loadModuleOverrides(
  client: { from: (t: string) => any },
  restaurantId: string,
  membershipId: string,
): Promise<Record<string, boolean>> {
  const { data } = await client
    .from("staff_module_access")
    .select("module_key, enabled")
    .eq("restaurant_id", restaurantId)
    .eq("membership_id", membershipId);
  const out: Record<string, boolean> = {};
  for (const row of (data ?? []) as { module_key: string; enabled: boolean }[]) {
    out[row.module_key] = row.enabled;
  }
  return out;
}

export interface ResolvedAccess {
  membership: Membership;
  modules: ModuleKey[];
  overrides: Record<string, boolean>;
}

/** The caller's own membership plus the modules it may enter. */
export async function resolveCallerAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<ResolvedAccess> {
  const membership = await callerMembership(context, restaurantId);
  const overrides = await loadModuleOverrides(context.supabase, restaurantId, membership.id);
  return { membership, modules: resolveModules(membership.role, overrides), overrides };
}

export async function canAccessModule(
  context: AuthedCtx,
  restaurantId: string,
  moduleKey: ModuleKey,
): Promise<boolean> {
  const { modules } = await resolveCallerAccess(context, restaurantId);
  return modules.includes(moduleKey);
}

/** Module entry gate. Throws when the caller may not enter the workspace. */
export async function requireModuleAccess(
  context: AuthedCtx,
  restaurantId: string,
  moduleKey: ModuleKey,
): Promise<Membership> {
  const { membership, modules } = await resolveCallerAccess(context, restaurantId);
  if (!modules.includes(moduleKey)) {
    throw new Error(`You don't have access to ${MODULE_LABELS[moduleKey]} for this property.`);
  }
  return membership;
}

/**
 * Module entry gate plus an action-level role check. `roles` is the set of
 * roles allowed to perform this action inside the module.
 */
export async function requireModuleRole(
  context: AuthedCtx,
  restaurantId: string,
  moduleKey: ModuleKey,
  roles: readonly string[],
  message?: string,
): Promise<Membership> {
  const membership = await requireModuleAccess(context, restaurantId, moduleKey);
  if (!roles.includes(membership.role)) {
    throw new Error(message ?? "You don't have permission to do that.");
  }
  return membership;
}
