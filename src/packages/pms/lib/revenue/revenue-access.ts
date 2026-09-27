/**
 * Rate & Revenue access model (Phase 1 Prompt 5).
 * Pure helpers — no server. Maps current owner/manager behavior only.
 *
 * Does not replace requireRateManager / requirePmsPackage / RLS.
 * Keep in lockstep with RATE_MANAGE_ROLES in rates.server.ts.
 */

export const REVENUE_OPERATE_ROLES = ["owner", "manager"] as const;

export type RevenueAccess = {
  canView: boolean;
  canViewRates: boolean;
  canEditDailyRates: boolean;
  canViewRestrictions: boolean;
  canApplyRestrictions: boolean;
  canViewCommercial: boolean;
  canViewForecast: boolean;
  canViewApprovals: boolean;
  canApprove: boolean;
  canViewAnalytics: boolean;
  canViewAudit: boolean;
  canExport: boolean;
};

export type RevenueCapability = Exclude<keyof RevenueAccess, never>;

export type RevenueAccessResolution = RevenueAccess & {
  role: string;
  packageEnabled: boolean;
  membershipId?: string | null;
};

export function deniedRevenueAccess(): RevenueAccess {
  return {
    canView: false,
    canViewRates: false,
    canEditDailyRates: false,
    canViewRestrictions: false,
    canApplyRestrictions: false,
    canViewCommercial: false,
    canViewForecast: false,
    canViewApprovals: false,
    canApprove: false,
    canViewAnalytics: false,
    canViewAudit: false,
    canExport: false,
  };
}

/**
 * Conservative mapping of CURRENT roles.
 * Accountant reports access stays on getRevenueOverview / reports_analytics — not here.
 * canApprove is true for owner/manager. Self-approval is still enforced server-side.
 */
export function resolveRevenueAccess(
  role: string,
  options?: { packageEnabled?: boolean },
): RevenueAccess {
  if (options?.packageEnabled === false) return deniedRevenueAccess();
  if (!(REVENUE_OPERATE_ROLES as readonly string[]).includes(role)) return deniedRevenueAccess();
  return {
    canView: true,
    canViewRates: true,
    canEditDailyRates: true,
    canViewRestrictions: true,
    canApplyRestrictions: true,
    canViewCommercial: true,
    canViewForecast: true,
    canViewApprovals: true,
    canApprove: true,
    canViewAnalytics: true,
    canViewAudit: true,
    canExport: true,
  };
}

export function hasRevenueCapability(access: RevenueAccess, capability: RevenueCapability): boolean {
  return access[capability];
}
