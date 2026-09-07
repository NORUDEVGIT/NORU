/**
 * Phase 6J — Distribution foundation, server-only helpers.
 *
 * Distribution is owner/manager only, like rates. Every helper re-derives the
 * caller's membership from restaurant_users.
 */
import { callerMembership, type AuthedCtx, type Membership } from "./workforce.server";
import { requirePmsPackage } from "./pms-package.server";

export const DISTRIBUTION_MANAGE_ROLES = ["owner", "manager"] as const;

export const CHANNEL_STATUSES = ["active", "inactive", "not_connected"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export function canManageDistribution(role: string): boolean {
  return (DISTRIBUTION_MANAGE_ROLES as readonly string[]).includes(role);
}

export async function requireDistributionManager(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const me = await callerMembership(context, restaurantId);
  if (!canManageDistribution(me.role)) {
    throw new Error("You don't have access to Distribution for this property.");
  }
  await requirePmsPackage(restaurantId);
  return me;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}
