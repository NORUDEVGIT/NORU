/**
 * Shared Rate & Revenue commercial context (Prompt 4).
 * Pure helpers — no server, no writes.
 */

import type { RevenueWorkspaceView } from "../rate-revenue-workspace";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type RevenueContextField =
  "dateRange" | "roomType" | "ratePlan" | "segment" | "source" | "channel";

export type RevenueContext = {
  fromDate: string;
  toDate: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  marketSegmentId: string | null;
  commercialSourceId: string | null;
  salesChannelId: string | null;
};

export type RevenueContextOptions = {
  roomTypes: Array<{ id: string }>;
  ratePlans: Array<{ id: string; roomTypeId: string }>;
  marketSegments: Array<{ id: string }>;
  bookingSources: Array<{ id: string }>;
  salesChannels: Array<{ id: string }>;
};

export type RevenueApprovalTab = "pending" | "mine" | "history";
export type RevenueAnalyticsTab =
  "overview" | "kpis" | "segments" | "sources" | "trends" | "commercial";
export type RevenueAuditTab = "history" | "rates" | "restrictions" | "overrides";

export type RevenueSearchParams = {
  view?: string | undefined;
  tab?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  roomType?: string | undefined;
  ratePlan?: string | undefined;
  segment?: string | undefined;
  source?: string | undefined;
  channel?: string | undefined;
  approvalTab?: RevenueApprovalTab | undefined;
  approvalRequest?: string | undefined;
  analyticsTab?: RevenueAnalyticsTab | undefined;
  auditTab?: RevenueAuditTab | undefined;
  auditEvent?: string | undefined;
  auditAction?: string | undefined;
  auditActor?: string | undefined;
  auditSearch?: string | undefined;
};

export type RevenueApprovalSearchExtras = {
  approvalTab?: RevenueApprovalTab | undefined;
  approvalRequest?: string | undefined;
  analyticsTab?: RevenueAnalyticsTab | undefined;
  auditTab?: RevenueAuditTab | undefined;
  auditEvent?: string | undefined;
  auditAction?: string | undefined;
  auditActor?: string | undefined;
  auditSearch?: string | undefined;
};

/** Reservation-origin values. Never treat these as commercial source-code masters. */
export const TECHNICAL_RESERVATION_SOURCES = ["staff", "walk_in", "direct_booking"] as const;

export function emptyRevenueContext(businessDate: string): RevenueContext {
  return {
    fromDate: businessDate,
    toDate: businessDate,
    roomTypeId: null,
    ratePlanId: null,
    marketSegmentId: null,
    commercialSourceId: null,
    salesChannelId: null,
  };
}

export function parseIsoDate(value: string | undefined, fallback: string): string {
  return value && ISO_DATE.test(value) ? value : fallback;
}

export function normalizeDateRange(
  fromDate: string,
  toDate: string,
): { fromDate: string; toDate: string } {
  if (toDate < fromDate) return { fromDate: toDate, toDate: fromDate };
  return { fromDate, toDate };
}

function knownId(id: string | null, rows: Array<{ id: string }>): string | null {
  if (!id) return null;
  return rows.some((row) => row.id === id) ? id : null;
}

export function ratePlansForRoomType(
  ratePlans: Array<{ id: string; roomTypeId: string }>,
  roomTypeId: string | null,
) {
  if (!roomTypeId) return ratePlans;
  return ratePlans.filter((plan) => plan.roomTypeId === roomTypeId);
}

export function sanitizeRevenueContext(
  input: RevenueContext,
  options: RevenueContextOptions,
): RevenueContext {
  const range = normalizeDateRange(
    ISO_DATE.test(input.fromDate) ? input.fromDate : input.toDate,
    ISO_DATE.test(input.toDate) ? input.toDate : input.fromDate,
  );
  const roomTypeId = knownId(input.roomTypeId, options.roomTypes);
  const compatiblePlans = ratePlansForRoomType(options.ratePlans, roomTypeId);
  const ratePlanId = knownId(input.ratePlanId, compatiblePlans);

  return {
    fromDate: range.fromDate,
    toDate: range.toDate,
    roomTypeId,
    ratePlanId,
    marketSegmentId: knownId(input.marketSegmentId, options.marketSegments),
    commercialSourceId: knownId(input.commercialSourceId, options.bookingSources),
    salesChannelId: knownId(input.salesChannelId, options.salesChannels),
  };
}

export function contextFromSearch(
  search: RevenueSearchParams,
  businessDate: string,
): RevenueContext {
  return {
    fromDate: parseIsoDate(search.from, businessDate),
    toDate: parseIsoDate(search.to, businessDate),
    roomTypeId: search.roomType || null,
    ratePlanId: search.ratePlan || null,
    marketSegmentId: search.segment || null,
    commercialSourceId: search.source || null,
    salesChannelId: search.channel || null,
  };
}

export function serializeRevenueSearch(
  view: RevenueWorkspaceView,
  context: RevenueContext,
  extras?: RevenueApprovalSearchExtras,
): RevenueSearchParams {
  return {
    view,
    from: context.fromDate,
    to: context.toDate,
    ...(context.roomTypeId ? { roomType: context.roomTypeId } : {}),
    ...(context.ratePlanId ? { ratePlan: context.ratePlanId } : {}),
    ...(context.marketSegmentId ? { segment: context.marketSegmentId } : {}),
    ...(context.commercialSourceId ? { source: context.commercialSourceId } : {}),
    ...(context.salesChannelId ? { channel: context.salesChannelId } : {}),
    ...(view === "approvals" && extras?.approvalTab ? { approvalTab: extras.approvalTab } : {}),
    ...(view === "approvals" && extras?.approvalRequest
      ? { approvalRequest: extras.approvalRequest }
      : {}),
    ...(view === "revenue-performance" && extras?.analyticsTab
      ? { analyticsTab: extras.analyticsTab }
      : {}),
    ...((view === "audit-control" || view === "export") && extras?.auditTab
      ? { auditTab: extras.auditTab }
      : {}),
    ...(view === "audit-control" && extras?.auditEvent ? { auditEvent: extras.auditEvent } : {}),
    ...((view === "audit-control" || view === "export") && extras?.auditAction
      ? { auditAction: extras.auditAction }
      : {}),
    ...((view === "audit-control" || view === "export") && extras?.auditActor
      ? { auditActor: extras.auditActor }
      : {}),
    ...((view === "audit-control" || view === "export") && extras?.auditSearch
      ? { auditSearch: extras.auditSearch }
      : {}),
  };
}

export function patchRevenueContext(
  current: RevenueContext,
  patch: Partial<RevenueContext>,
  options: RevenueContextOptions,
): RevenueContext {
  const next: RevenueContext = { ...current, ...patch };
  if (patch.roomTypeId !== undefined && patch.roomTypeId !== current.roomTypeId) {
    const stillValid = ratePlansForRoomType(options.ratePlans, patch.roomTypeId).some(
      (plan) => plan.id === current.ratePlanId,
    );
    if (!stillValid) next.ratePlanId = null;
  }
  return sanitizeRevenueContext(next, options);
}

function keepId(id: string | null): Array<{ id: string }> {
  return id ? [{ id }] : [];
}

/** Keep URL ids until the matching catalogue has loaded so refresh does not wipe them. */
export function sanitizeLoadedContext(
  search: RevenueSearchParams,
  businessDate: string,
  options: RevenueContextOptions,
  loaded: { base: boolean; catalogues: boolean },
): RevenueContext {
  const raw = contextFromSearch(search, businessDate);
  return sanitizeRevenueContext(raw, {
    roomTypes: loaded.base ? options.roomTypes : keepId(raw.roomTypeId),
    ratePlans: loaded.base
      ? options.ratePlans
      : raw.ratePlanId
        ? [{ id: raw.ratePlanId, roomTypeId: raw.roomTypeId ?? "" }]
        : [],
    marketSegments: loaded.catalogues ? options.marketSegments : keepId(raw.marketSegmentId),
    bookingSources: loaded.catalogues ? options.bookingSources : keepId(raw.commercialSourceId),
    salesChannels: loaded.catalogues ? options.salesChannels : keepId(raw.salesChannelId),
  });
}
