/**
 * RR-P5-UI-02 — Packages display helpers.
 *
 * Operational status is as-of property business date.
 * Performance is reservation stay overlap with from/to.
 * Attribution-only. No forecast, approvals, OTA, or cashiering claims.
 */

import { PACKAGE_TYPE_LABELS, type PackageType } from "../pms-set3-rates-guest.ts";
import {
  COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
  effectiveCommercialScope,
  type PackageComponentSnapshot,
} from "./commercial-engine.ts";
import {
  commercialExpiringSoon,
  commercialOperationalStatus,
  commercialPerformancePeriodLabel,
  commercialScopeLabel,
  reservationStayOverlapsRange,
  type CommercialOperationalStatus,
} from "./commercial-overview.ts";
import type { CommercialHistoryRow } from "./commercial-history.ts";

export const PACKAGE_PERFORMANCE_NOTE =
  "Based on attributed package selections since Commercial Engine launch.";
export const PACKAGE_REVENUE_HELPER = "Attributed package value; not cashiering collection.";
export const PACKAGE_EMPTY_ACTIVATIONS = "No package activations yet.";
export const PACKAGE_EMPTY_MASTERS = "No packages are configured in Property Setup.";
export const PACKAGE_STALE_COPY =
  "This package activation changed since you reviewed it. Review the latest values before applying again.";
export const PACKAGE_DEACTIVATE_COPY =
  "Deactivation stops new eligibility. Existing reservations keep their package attribution.";
export const PACKAGE_CHARGE_BASIS_LABEL = "Per Stay";

export type PackageDisplayStatus = CommercialOperationalStatus | "not_activated";

export type PackageWorkspaceMaster = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  packagePrice: number;
  active: boolean;
  roomTypeIds: string[];
  ratePlanIds: string[];
  componentCount: number;
};

export type PackagePerformanceTotals = {
  bookings: number;
  revenue: number;
  attributionCount: number;
  averageAppliedAmount: number;
};

export type PackageWorkspaceRow = {
  rowKey: string;
  kind: "activation" | "master";
  activationId: string | null;
  packageId: string;
  code: string;
  name: string;
  type: string | null;
  configuredPrice: number;
  masterPrice: number;
  chargeBasis: typeof COMMERCIAL_V1_PACKAGE_CHARGE_BASIS;
  masterActive: boolean;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  roomTypeIds: string[];
  ratePlanIds: string[];
  masterRoomTypeIds: string[];
  masterRatePlanIds: string[];
  components: PackageComponentSnapshot[];
  createdAt: string | null;
  updatedAt: string | null;
  displayStatus: PackageDisplayStatus;
  operationalStatus: CommercialOperationalStatus | null;
  expiringSoon: boolean;
  roomScopeLabel: string;
  ratePlanScopeLabel: string;
  componentCount: number;
} & PackagePerformanceTotals;

export type PackagesWorkspace = {
  businessDate: string;
  fromDate: string | null;
  toDate: string | null;
  currency: string;
  kpis: {
    activePackages: number;
    upcomingPackages: number;
    expiringSoon: number;
    packageBookings: number;
    packageRevenue: number;
  };
  rows: PackageWorkspaceRow[];
  masters: PackageWorkspaceMaster[];
  recentActivity: CommercialHistoryRow[];
  hasMasters: boolean;
  hasActivations: boolean;
};

export type PackagePerformanceSummary = PackagePerformanceTotals & {
  packageId: string | null;
  activationId: string | null;
  periodLabel: string;
  note: string;
};

export type PackageWorkspaceFilter = {
  search?: string;
  status?: PackageDisplayStatus | "all";
  packageType?: string | "all";
};

export function packageTypeLabel(type: string | null | undefined): string {
  if (!type) return "—";
  if (type in PACKAGE_TYPE_LABELS) return PACKAGE_TYPE_LABELS[type as PackageType];
  return type;
}

export function packageStatusLabel(status: PackageDisplayStatus): string {
  if (status === "not_activated") return "Not Activated";
  if (status === "active") return "Active";
  if (status === "upcoming") return "Upcoming";
  if (status === "expired") return "Expired";
  return "Inactive";
}

export function packageComponentLabel(component: PackageComponentSnapshot): string {
  const quantity = Number.isFinite(component.quantity) ? component.quantity : 1;
  const label = component.label?.trim() || component.componentType || "Component";
  return `${label} × ${quantity}`;
}

export function packageComponentTypeLabel(componentType: string): string {
  if (componentType === "meal_plan") return "Meal plan";
  if (componentType === "room_amenity") return "Amenity";
  if (componentType === "fo_service") return "Service";
  return componentType || "—";
}

export function emptyPackagePerformance(): PackagePerformanceTotals {
  return { bookings: 0, revenue: 0, attributionCount: 0, averageAppliedAmount: 0 };
}

export function summarizePackagePerformance(
  rows: Array<{ reservationId: string; appliedAmount: number }>,
): PackagePerformanceTotals {
  const reservations = new Set(rows.map((row) => row.reservationId));
  const revenue = roundMoney(rows.reduce((sum, row) => sum + row.appliedAmount, 0));
  const attributionCount = rows.length;
  return {
    bookings: reservations.size,
    revenue,
    attributionCount,
    averageAppliedAmount: attributionCount === 0 ? 0 : roundMoney(revenue / attributionCount),
  };
}

export function packageActivationMatchesScopeFilter(
  row: Pick<PackageWorkspaceRow, "roomTypeIds" | "ratePlanIds" | "masterRoomTypeIds" | "masterRatePlanIds">,
  roomTypeId?: string | null,
  ratePlanId?: string | null,
): boolean {
  if (roomTypeId) {
    const rooms = effectiveCommercialScope(row.roomTypeIds, row.masterRoomTypeIds);
    if (!rooms.all && !rooms.ids.includes(roomTypeId)) return false;
  }
  if (ratePlanId) {
    const plans = effectiveCommercialScope(row.ratePlanIds, row.masterRatePlanIds);
    if (!plans.all && !plans.ids.includes(ratePlanId)) return false;
  }
  return true;
}

export function filterPackageRows(
  rows: PackageWorkspaceRow[],
  filter: PackageWorkspaceFilter,
): PackageWorkspaceRow[] {
  const search = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status && filter.status !== "all" && row.displayStatus !== filter.status) return false;
    if (filter.packageType && filter.packageType !== "all" && row.type !== filter.packageType) return false;
    if (search && !row.name.toLowerCase().includes(search) && !row.code.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}

export function countPackageOperationalStatuses(rows: PackageWorkspaceRow[]) {
  const activations = rows.filter((row) => row.kind === "activation");
  return {
    activePackages: activations.filter((row) => row.displayStatus === "active").length,
    upcomingPackages: activations.filter((row) => row.displayStatus === "upcoming").length,
    expiringSoon: activations.filter((row) => row.expiringSoon).length,
  };
}

export function buildPackageActivationRow(
  input: {
    activationId: string;
    packageId: string;
    code: string;
    name: string;
    type: string | null;
    configuredPrice: number;
    masterPrice: number;
    masterActive: boolean;
    active: boolean;
    validFrom: string;
    validTo: string;
    roomTypeIds: string[];
    ratePlanIds: string[];
    masterRoomTypeIds: string[];
    masterRatePlanIds: string[];
    components: PackageComponentSnapshot[];
    createdAt: string;
    updatedAt: string;
  },
  options: {
    businessDate: string;
    performance: PackagePerformanceTotals;
    roomNames: Map<string, string>;
    planNames: Map<string, string>;
  },
): PackageWorkspaceRow {
  const operationalStatus = commercialOperationalStatus(input, options.businessDate);
  return {
    rowKey: `activation:${input.activationId}`,
    kind: "activation",
    activationId: input.activationId,
    packageId: input.packageId,
    code: input.code,
    name: input.name,
    type: input.type,
    configuredPrice: input.configuredPrice,
    masterPrice: input.masterPrice,
    chargeBasis: COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
    masterActive: input.masterActive,
    active: input.active,
    validFrom: input.validFrom,
    validTo: input.validTo,
    roomTypeIds: [...input.roomTypeIds],
    ratePlanIds: [...input.ratePlanIds],
    masterRoomTypeIds: [...input.masterRoomTypeIds],
    masterRatePlanIds: [...input.masterRatePlanIds],
    components: [...input.components],
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    displayStatus: operationalStatus,
    operationalStatus,
    expiringSoon: commercialExpiringSoon(input, options.businessDate),
    roomScopeLabel: commercialScopeLabel(input.roomTypeIds, options.roomNames, "inherit"),
    ratePlanScopeLabel: commercialScopeLabel(input.ratePlanIds, options.planNames, "inherit"),
    componentCount: input.components.length,
    ...options.performance,
  };
}

export function buildPackageMasterRow(
  master: PackageWorkspaceMaster,
  options: {
    roomNames: Map<string, string>;
    planNames: Map<string, string>;
  },
): PackageWorkspaceRow {
  return {
    rowKey: `master:${master.id}`,
    kind: "master",
    activationId: null,
    packageId: master.id,
    code: master.code,
    name: master.name,
    type: master.type,
    configuredPrice: master.packagePrice,
    masterPrice: master.packagePrice,
    chargeBasis: COMMERCIAL_V1_PACKAGE_CHARGE_BASIS,
    masterActive: master.active,
    active: false,
    validFrom: null,
    validTo: null,
    roomTypeIds: [],
    ratePlanIds: [],
    masterRoomTypeIds: [...master.roomTypeIds],
    masterRatePlanIds: [...master.ratePlanIds],
    components: [],
    createdAt: null,
    updatedAt: null,
    displayStatus: "not_activated",
    operationalStatus: null,
    expiringSoon: false,
    roomScopeLabel: commercialScopeLabel(master.roomTypeIds, options.roomNames, "all"),
    ratePlanScopeLabel: commercialScopeLabel(master.ratePlanIds, options.planNames, "all"),
    componentCount: master.componentCount,
    ...emptyPackagePerformance(),
  };
}

export function packagePerformancePeriodLabel(fromDate?: string | null, toDate?: string | null): string {
  return commercialPerformancePeriodLabel(fromDate, toDate);
}

export function attributedStayOverlaps(
  arrival: string,
  departure: string,
  fromDate?: string | null,
  toDate?: string | null,
): boolean {
  return reservationStayOverlapsRange(arrival, departure, fromDate, toDate);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
