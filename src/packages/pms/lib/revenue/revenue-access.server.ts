/**
 * Rate & Revenue access — server resolution.
 * UI uses these flags. They come from the permission catalogue, not the role name.
 */

import { type AuthedCtx, callerMembership } from "@/core/lib/workforce.server";
import { requirePmsPackage } from "../pms-package.server";
import { hasEffectivePermission, resolveEffectivePermissions } from "../pms-permissions.server";
import { PMS_PERMISSIONS } from "../pms-permissions";
import {
  deniedRevenueAccess,
  type RevenueAccessResolution,
} from "./revenue-access";

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
  const resolved = await resolveEffectivePermissions(context, restaurantId);
  const has = (code: (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS]) =>
    hasEffectivePermission(resolved, code);
  const canView = has(PMS_PERMISSIONS.RATES_VIEW);
  return {
    role: me.role,
    packageEnabled: true,
    membershipId: me.id,
    canView,
    canViewRates: canView,
    canConfigureRates: has(PMS_PERMISSIONS.RATES_CONFIGURE),
    canEditDailyRates: has(PMS_PERMISSIONS.RATES_CALENDAR_OVERRIDE),
    canViewRestrictions: canView,
    canApplyRestrictions: has(PMS_PERMISSIONS.RATES_RESTRICTION_CONFIGURE),
    canViewCommercial: canView,
    canViewForecast: canView || has(PMS_PERMISSIONS.REPORTS_VIEW),
    canViewApprovals: canView,
    canApprove: has(PMS_PERMISSIONS.RATES_ACTIVATE),
    canViewAnalytics: canView || has(PMS_PERMISSIONS.REPORTS_VIEW),
    canViewAudit: canView,
    canExport: has(PMS_PERMISSIONS.REPORTS_EXPORT),
  };
}
