/**
 * Rate & Revenue access — server resolution.
 * UI uses the flags. Mutations still require requireRateManager.
 */

import { type AuthedCtx, callerMembership } from "@/core/lib/workforce.server";
import { requirePmsPackage } from "../pms-package.server";
import { requireRateManager } from "../rates.server";
import {
  deniedRevenueAccess,
  resolveRevenueAccess,
  type RevenueAccessResolution,
} from "./revenue-access";

export { requireRateManager };

export async function loadRevenueAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<RevenueAccessResolution> {
  const me = await callerMembership(context, restaurantId);
  try {
    await requirePmsPackage(restaurantId);
  } catch {
    return { role: me.role, packageEnabled: false, membershipId: me.id, ...deniedRevenueAccess() };
  }
  return { role: me.role, packageEnabled: true, membershipId: me.id, ...resolveRevenueAccess(me.role) };
}
