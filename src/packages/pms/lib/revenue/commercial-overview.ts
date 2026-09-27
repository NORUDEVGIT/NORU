/**
 * RR-P5-UI-01 — Commercial Overview / Promotions display helpers.
 *
 * Operational status is as-of property business date.
 * Performance is reservation stay overlap with from/to.
 * Attribution-only. No forecast, approvals, OTA, or cashiering claims.
 */

import { addDays, nightsBetween } from "../../../../shared/lib/property-dates.ts";
import {
  commercialScopesOverlap,
  dateRangesOverlap,
  effectiveCommercialScope,
  isV1ExecutablePromoKind,
  type CommercialPromoKind,
} from "./commercial-engine.ts";
import type { CommercialHistoryRow } from "./commercial-history.ts";

export const COMMERCIAL_EXPIRING_SOON_DAYS = 7;
export const COMMERCIAL_RECENT_ACTIVITY_LIMIT = 8;
export const COMMERCIAL_PERFORMANCE_NOTE =
  "Based on attributed bookings since Commercial Engine launch";
export const COMMERCIAL_ATTRIBUTION_LABEL = "Attributed bookings only";
export const COMMERCIAL_EMPTY_COPY = "No commercial activations yet.";
export const COMMERCIAL_STALE_COPY =
  "This activation changed since you reviewed it. Review the latest values before applying again.";
export const COMMERCIAL_DEACTIVATE_COPY =
  "Deactivating stops future eligibility. Existing reservations are not rewritten.";
export const COMMERCIAL_CONDITIONS_NOTE =
  "Informational only; V1 eligibility uses structured activation scope.";
export const COMMERCIAL_ACTIVATION_FOUNDATION_COPY =
  "The activation workflow comes next. Edit, deactivate, or reactivate existing activations from the row menu.";

export type CommercialOperationalStatus = "active" | "upcoming" | "expired" | "inactive";
export type PromotionDisplayStatus = CommercialOperationalStatus | "not_activated";

export type PromotionWorkspaceMaster = {
  id: string;
  code: string;
  name: string;
  kind: CommercialPromoKind;
  value: number;
  validFrom: string;
  validTo: string;
  active: boolean;
  roomTypeIds: string[];
};

export type CommercialAttentionKind =
  | "overlap"
  | "expiring_soon"
  | "inactive_master"
  | "unsupported_free_night"
  | "validity_ended";

export type CommercialPromotionInput = {
  activationId: string;
  promotionId: string;
  code: string;
  name: string;
  kind: CommercialPromoKind;
  value: number;
  active: boolean;
  masterActive: boolean;
  validFrom: string;
  validTo: string;
  bookingFrom: string;
  bookingTo: string;
  priority: number;
  roomTypeIds: string[];
  ratePlanIds: string[];
  masterRoomTypeIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CommercialPerformanceTotals = {
  bookings: number;
  roomNights: number;
  discountAmount: number;
  postPromotionRoomRevenue: number;
};

export type CommercialPromotionRow = CommercialPromotionInput & {
  operationalStatus: CommercialOperationalStatus;
  executable: boolean;
  overlap: boolean;
  overlapActivationIds: string[];
  expiringSoon: boolean;
  roomScopeLabel: string;
  ratePlanScopeLabel: string;
} & CommercialPerformanceTotals;

export type PromotionWorkspaceRow = CommercialPromotionRow & {
  rowKey: string;
  rowKind: "activation" | "master";
  displayStatus: PromotionDisplayStatus;
};

export type CommercialAttentionItem = {
  kind: CommercialAttentionKind;
  activationId: string;
  title: string;
  detail: string;
};

export type CommercialOverviewWorkspace = {
  businessDate: string;
  fromDate: string | null;
  toDate: string | null;
  currency: string;
  kpis: {
    activePromotions: number;
    upcomingPromotions: number;
    expiringSoon: number;
    activePackages: number;
  };
  performance: CommercialPerformanceTotals & {
    periodLabel: string;
    note: string;
  };
  packagePerformance: {
    bookings: number;
    revenue: number;
    periodLabel: string;
    note: string;
  };
  activePromotions: CommercialPromotionRow[];
  attention: CommercialAttentionItem[];
  recentActivity: CommercialHistoryRow[];
  empty: boolean;
};

export type PromotionsWorkspace = {
  businessDate: string;
  fromDate: string | null;
  toDate: string | null;
  currency: string;
  rows: PromotionWorkspaceRow[];
  masters: PromotionWorkspaceMaster[];
  hasMasters: boolean;
  hasActivations: boolean;
};

export type PromotionPerformanceSummary = CommercialPerformanceTotals & {
  activationId: string | null;
  periodLabel: string;
  note: string;
};

export type CommercialPromotionFilter = {
  search?: string;
  status?: PromotionDisplayStatus | "all";
  kind?: CommercialPromoKind | "all";
};

export function commercialOperationalStatus(
  row: Pick<CommercialPromotionInput, "active" | "validFrom" | "validTo">,
  businessDate: string,
): CommercialOperationalStatus {
  if (!row.active) return "inactive";
  if (row.validTo < businessDate) return "expired";
  if (row.validFrom > businessDate) return "upcoming";
  return "active";
}

export function commercialExpiringSoon(
  row: Pick<CommercialPromotionInput, "active" | "validFrom" | "validTo">,
  businessDate: string,
): boolean {
  if (commercialOperationalStatus(row, businessDate) !== "active") return false;
  const until = addDays(businessDate, COMMERCIAL_EXPIRING_SOON_DAYS);
  return row.validTo >= businessDate && row.validTo <= until;
}

export function commercialKindLabel(kind: CommercialPromoKind | string): string {
  if (kind === "percent") return "Percentage";
  if (kind === "fixed") return "Fixed Amount";
  if (kind === "free_night") return "Free Night";
  return kind;
}

export function commercialStatusLabel(status: CommercialOperationalStatus | PromotionDisplayStatus): string {
  if (status === "not_activated") return "Not Activated";
  if (status === "active") return "Active";
  if (status === "upcoming") return "Upcoming";
  if (status === "expired") return "Expired";
  return "Inactive";
}

export function commercialValueLabel(
  kind: CommercialPromoKind | string,
  value: number,
  money: (amount: number) => string,
): string {
  if (kind === "percent") return `${value}%`;
  if (kind === "fixed") return money(value);
  return "Not available in V1";
}

export function commercialScopeLabel(
  ids: string[],
  names: Map<string, string>,
  emptyMeans: "all" | "inherit",
): string {
  if (ids.length === 0) return emptyMeans === "all" ? "All" : "Inherit master";
  if (ids.length === 1) return names.get(ids[0]!) ?? "1 selected";
  return `${ids.length} selected`;
}

export function stayNightsOverlappingRange(
  arrival: string,
  departure: string,
  fromDate?: string | null,
  toDate?: string | null,
): number {
  if (!fromDate || !toDate) return nightsBetween(arrival, departure);
  const overlapStart = arrival > fromDate ? arrival : fromDate;
  const rangeEndExclusive = addDays(toDate, 1);
  const overlapEnd = departure < rangeEndExclusive ? departure : rangeEndExclusive;
  return nightsBetween(overlapStart, overlapEnd);
}

export function reservationStayOverlapsRange(
  arrival: string,
  departure: string,
  fromDate?: string | null,
  toDate?: string | null,
): boolean {
  if (!fromDate || !toDate) return true;
  return arrival <= toDate && departure > fromDate;
}

export function emptyCommercialPerformance(): CommercialPerformanceTotals {
  return { bookings: 0, roomNights: 0, discountAmount: 0, postPromotionRoomRevenue: 0 };
}

export function summarizeAttributedPerformance(
  rows: Array<{
    reservationId: string;
    discountAmount: number;
    roomSubtotalAfterPromotion: number;
    arrivalDate: string;
    departureDate: string;
  }>,
  fromDate?: string | null,
  toDate?: string | null,
): CommercialPerformanceTotals {
  const included = rows.filter((row) =>
    reservationStayOverlapsRange(row.arrivalDate, row.departureDate, fromDate, toDate),
  );
  const reservations = new Set(included.map((row) => row.reservationId));
  return {
    bookings: reservations.size,
    roomNights: included.reduce(
      (sum, row) => sum + stayNightsOverlappingRange(row.arrivalDate, row.departureDate, fromDate, toDate),
      0,
    ),
    discountAmount: roundMoney(included.reduce((sum, row) => sum + row.discountAmount, 0)),
    postPromotionRoomRevenue: roundMoney(
      included.reduce((sum, row) => sum + row.roomSubtotalAfterPromotion, 0),
    ),
  };
}

export function commercialPerformancePeriodLabel(fromDate?: string | null, toDate?: string | null): string {
  if (fromDate && toDate) return `Stay overlap ${fromDate} – ${toDate}`;
  return "All attributed stays";
}

export function activationMatchesScopeFilter(
  row: Pick<CommercialPromotionInput, "roomTypeIds" | "ratePlanIds" | "masterRoomTypeIds">,
  roomTypeId?: string | null,
  ratePlanId?: string | null,
): boolean {
  if (roomTypeId) {
    const rooms = effectiveCommercialScope(row.roomTypeIds, row.masterRoomTypeIds);
    if (!rooms.all && !rooms.ids.includes(roomTypeId)) return false;
  }
  if (ratePlanId) {
    const plans = effectiveCommercialScope(row.ratePlanIds, []);
    if (!plans.all && !plans.ids.includes(ratePlanId)) return false;
  }
  return true;
}

export function detectPromotionOverlaps(rows: CommercialPromotionInput[]): Map<string, string[]> {
  const overlaps = new Map<string, string[]>();
  const active = rows.filter((row) => row.active);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]!;
      const right = active[j]!;
      if (!dateRangesOverlap(left.validFrom, left.validTo, right.validFrom, right.validTo)) continue;
      const leftRooms = effectiveCommercialScope(left.roomTypeIds, left.masterRoomTypeIds);
      const rightRooms = effectiveCommercialScope(right.roomTypeIds, right.masterRoomTypeIds);
      const leftPlans = effectiveCommercialScope(left.ratePlanIds, []);
      const rightPlans = effectiveCommercialScope(right.ratePlanIds, []);
      if (!commercialScopesOverlap(leftRooms, rightRooms) || !commercialScopesOverlap(leftPlans, rightPlans)) {
        continue;
      }
      overlaps.set(left.activationId, [...(overlaps.get(left.activationId) ?? []), right.activationId]);
      overlaps.set(right.activationId, [...(overlaps.get(right.activationId) ?? []), left.activationId]);
    }
  }
  return overlaps;
}

export function buildCommercialPromotionRows(
  rows: CommercialPromotionInput[],
  options: {
    businessDate: string;
    performanceByActivation: Map<string, CommercialPerformanceTotals>;
    roomNames: Map<string, string>;
    planNames: Map<string, string>;
    roomTypeId?: string | null;
    ratePlanId?: string | null;
  },
): CommercialPromotionRow[] {
  const overlaps = detectPromotionOverlaps(rows);
  return rows
    .filter((row) => activationMatchesScopeFilter(row, options.roomTypeId, options.ratePlanId))
    .map((row) => {
      const performance = options.performanceByActivation.get(row.activationId) ?? emptyCommercialPerformance();
      const overlapIds = overlaps.get(row.activationId) ?? [];
      return {
        ...row,
        operationalStatus: commercialOperationalStatus(row, options.businessDate),
        executable: isV1ExecutablePromoKind(row.kind),
        overlap: overlapIds.length > 0,
        overlapActivationIds: overlapIds,
        expiringSoon: commercialExpiringSoon(row, options.businessDate),
        roomScopeLabel: commercialScopeLabel(row.roomTypeIds, options.roomNames, "inherit"),
        ratePlanScopeLabel: commercialScopeLabel(row.ratePlanIds, options.planNames, "all"),
        ...performance,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code) || left.validFrom.localeCompare(right.validFrom));
}

export function buildCommercialAttention(rows: CommercialPromotionRow[]): CommercialAttentionItem[] {
  const items: CommercialAttentionItem[] = [];
  for (const row of rows) {
    if (row.overlap) {
      items.push({
        kind: "overlap",
        activationId: row.activationId,
        title: "Overlap detected",
        detail: `${row.code} overlaps another active promotion.`,
      });
    }
    if (row.expiringSoon) {
      items.push({
        kind: "expiring_soon",
        activationId: row.activationId,
        title: "Promotion expiring soon",
        detail: `${row.code} ends ${row.validTo}.`,
      });
    }
    if (row.active && !row.masterActive) {
      items.push({
        kind: "inactive_master",
        activationId: row.activationId,
        title: "Inactive master referenced",
        detail: `${row.code} references an inactive Property Setup promotion.`,
      });
    }
    if (row.kind === "free_night") {
      items.push({
        kind: "unsupported_free_night",
        activationId: row.activationId,
        title: "Unsupported for activation",
        detail: `${row.code} is a free-night master and is not available in V1.`,
      });
    }
    if (row.active && row.operationalStatus === "expired") {
      items.push({
        kind: "validity_ended",
        activationId: row.activationId,
        title: "Activation validity ended",
        detail: `${row.code} stay window ended ${row.validTo}.`,
      });
    }
  }
  return items;
}

export function countOperationalStatuses(rows: CommercialPromotionRow[]) {
  return {
    activePromotions: rows.filter((row) => row.operationalStatus === "active").length,
    upcomingPromotions: rows.filter((row) => row.operationalStatus === "upcoming").length,
    expiringSoon: rows.filter((row) => row.expiringSoon).length,
  };
}

export function filterPromotionRows<T extends {
  name: string;
  code: string;
  kind: CommercialPromoKind;
  operationalStatus: CommercialOperationalStatus | null;
  displayStatus?: PromotionDisplayStatus;
}>(
  rows: T[],
  filter: CommercialPromotionFilter,
): T[] {
  const search = (filter.search ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status && filter.status !== "all") {
      const status = row.displayStatus ?? row.operationalStatus;
      if (status !== filter.status) return false;
    }
    if (filter.kind && filter.kind !== "all" && row.kind !== filter.kind) return false;
    if (search && !row.name.toLowerCase().includes(search) && !row.code.toLowerCase().includes(search)) {
      return false;
    }
    return true;
  });
}

export function toPromotionActivationWorkspaceRow(row: CommercialPromotionRow): PromotionWorkspaceRow {
  return {
    ...row,
    rowKey: `activation:${row.activationId}`,
    rowKind: "activation",
    displayStatus: row.operationalStatus,
  };
}

export function buildPromotionMasterRow(
  master: PromotionWorkspaceMaster,
  options: {
    roomNames: Map<string, string>;
    planNames: Map<string, string>;
  },
): PromotionWorkspaceRow {
  return {
    rowKey: `master:${master.id}`,
    rowKind: "master",
    displayStatus: "not_activated",
    activationId: "",
    promotionId: master.id,
    code: master.code,
    name: master.name,
    kind: master.kind,
    value: master.value,
    active: false,
    masterActive: master.active,
    validFrom: master.validFrom,
    validTo: master.validTo,
    bookingFrom: "",
    bookingTo: "",
    priority: 100,
    roomTypeIds: [],
    ratePlanIds: [],
    masterRoomTypeIds: [...master.roomTypeIds],
    createdAt: "",
    updatedAt: "",
    operationalStatus: "inactive",
    executable: isV1ExecutablePromoKind(master.kind),
    overlap: false,
    overlapActivationIds: [],
    expiringSoon: false,
    roomScopeLabel: commercialScopeLabel(master.roomTypeIds, options.roomNames, "all"),
    ratePlanScopeLabel: "All",
    ...emptyCommercialPerformance(),
  };
}

export function commercialHistoryEntityLabel(entityType: string): string {
  if (entityType === "promotion_activation") return "Promotion";
  if (entityType === "package_activation") return "Package";
  return entityType;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
