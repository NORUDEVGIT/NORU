/**
 * P7-STEP-02 — Rate & Revenue approval engine (pure domain).
 *
 * Policy default is disabled. Official applies stay immediate unless a
 * property row enables approval. Missing policy row = disabled.
 */

import { z } from "zod";
import { rateChangeRequestSchema } from "./rate-change.ts";
import { restrictionChangeRequestSchema } from "./restriction-change.ts";

export const REVENUE_APPROVAL_DOMAINS = [
  "rate",
  "restriction",
  "promotion_activation",
  "package_activation",
] as const;
export type RevenueApprovalDomain = (typeof REVENUE_APPROVAL_DOMAINS)[number];

export const REVENUE_APPROVAL_ENTITY_TYPES = [
  "rate_calendar",
  "rate_bulk",
  "restriction",
  "restriction_bulk",
  "promotion_activation",
  "package_activation",
] as const;
export type RevenueApprovalEntityType = (typeof REVENUE_APPROVAL_ENTITY_TYPES)[number];

export const REVENUE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "stale",
] as const;
export type RevenueApprovalStatus = (typeof REVENUE_APPROVAL_STATUSES)[number];

export const REVENUE_APPROVAL_TERMINAL_STATUSES = [
  "approved",
  "rejected",
  "cancelled",
  "stale",
] as const;

export const REVENUE_APPROVAL_EVENTS = [
  "submitted",
  "approved",
  "rejected",
  "cancelled",
  "stale",
] as const;
export type RevenueApprovalEventType = (typeof REVENUE_APPROVAL_EVENTS)[number];

export const REVENUE_APPROVAL_HISTORY_PAGE_SIZE = 25;
export const REVENUE_APPROVAL_HISTORY_MAX_PAGE_SIZE = 100;
export const REVENUE_APPROVAL_EVENT_IMMUTABLE = "REVENUE_APPROVAL_EVENT_IMMUTABLE";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const idSchema = z.string().uuid();

export const promotionActivationProposalSchema = z.object({
  restaurantId: idSchema,
  operation: z.enum(["CREATE", "EDIT", "DEACTIVATE"]),
  promotionId: idSchema.optional(),
  activationId: idSchema.optional(),
  validFrom: isoDateSchema.optional(),
  validTo: isoDateSchema.optional(),
  bookingFrom: isoDateSchema.optional(),
  bookingTo: isoDateSchema.optional(),
  priority: z.number().int().min(0).optional(),
  roomTypeIds: z.array(idSchema).optional(),
  ratePlanIds: z.array(idSchema).optional(),
  reason: z.string().max(500).nullable().optional(),
  expectedVersion: z.string().min(1).optional(),
});

export const packageActivationProposalSchema = z.object({
  restaurantId: idSchema,
  operation: z.enum(["CREATE", "EDIT", "DEACTIVATE"]),
  packageId: idSchema.optional(),
  activationId: idSchema.optional(),
  validFrom: isoDateSchema.optional(),
  validTo: isoDateSchema.optional(),
  roomTypeIds: z.array(idSchema).optional(),
  ratePlanIds: z.array(idSchema).optional(),
  reason: z.string().max(500).nullable().optional(),
  expectedVersion: z.string().min(1).optional(),
});

export function parseRevenueApprovalProposal(domain: RevenueApprovalDomain, payload: unknown) {
  if (domain === "rate") return rateChangeRequestSchema.parse(payload);
  if (domain === "restriction") return restrictionChangeRequestSchema.parse(payload);
  if (domain === "promotion_activation") return promotionActivationProposalSchema.parse(payload);
  return packageActivationProposalSchema.parse(payload);
}

export type RevenueApprovalPolicy = {
  enabled: boolean;
};

export function policyFromRow(
  row: { enabled?: boolean } | null | undefined,
): RevenueApprovalPolicy {
  return { enabled: row?.enabled === true };
}

export function canSelfApproveRevenueRequest(
  eligibleApproverCount: number,
  requesterMembershipId: string,
  reviewerMembershipId: string,
): boolean {
  if (requesterMembershipId !== reviewerMembershipId) return true;
  return eligibleApproverCount <= 1;
}

export function isTerminalRevenueApprovalStatus(status: string): boolean {
  return (REVENUE_APPROVAL_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function allowedRevenueApprovalTransition(from: string, to: string): boolean {
  if (from !== "pending") return false;
  return (REVENUE_APPROVAL_TERMINAL_STATUSES as readonly string[]).includes(to);
}

export type RevenueMutationApplied<TApplied> = { mode: "applied" } & TApplied;
export type RevenueMutationSubmitted = {
  mode: "submitted_for_approval";
  approvalRequestId: string;
  summary: string;
};
export type RevenueMutationResult<TApplied> =
  RevenueMutationApplied<TApplied> | RevenueMutationSubmitted;

export type RevenueApprovalStaleResult = {
  status: "stale";
  reason: string;
  approvalRequestId: string;
};

export type RevenueApprovalApprovedResult = {
  status: "approved";
  approvalRequestId: string;
  appliedOperationId: string;
};

export type RevenueApprovalDisplaySnapshot = {
  summary: string;
  operationLabel: string;
  roomTypeNames: string[];
  ratePlanNames: string[];
  name?: string | null;
  code?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  targetCount?: number;
};

export type PreparedRevenueApproval = {
  restaurantId: string;
  domain: RevenueApprovalDomain;
  actionType: string;
  entityType: RevenueApprovalEntityType;
  entityId: string | null;
  requestReason: string | null;
  proposalPayload: Record<string, unknown>;
  displaySnapshot: RevenueApprovalDisplaySnapshot;
  expectedVersion: string;
  summary: string;
};

export function uniqueLabels(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => (value ?? "").trim()).filter(Boolean))];
}

function joinLabels(values: string[]): string {
  if (values.length === 0) return "selected";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} / ${values[1]}`;
  return `${values[0]} / ${values[1]} +${values.length - 2}`;
}

function dateRangeLabel(dates: string[]): { from: string | null; to: string | null } {
  if (dates.length === 0) return { from: null, to: null };
  const sorted = [...dates].sort();
  return { from: sorted[0] ?? null, to: sorted[sorted.length - 1] ?? null };
}

export function summarizeRateApproval(input: {
  ruleType: string;
  ratePlanNames: string[];
  roomTypeNames: string[];
  dates: string[];
}): string {
  const scope = joinLabels([
    ...uniqueLabels(input.ratePlanNames),
    ...uniqueLabels(input.roomTypeNames),
  ]);
  const count = input.dates.length;
  const dates = count === 1 ? "1 date" : `${count} dates`;
  if (input.ruleType === "RESET_OVERRIDE") return `Reset ${scope} override for ${dates}`;
  if (input.ruleType === "COPY_FROM_DATE") return `Copy rate onto ${scope} for ${dates}`;
  if (input.ruleType === "PERCENT_INCREASE") return `Increase ${scope} rate for ${dates}`;
  if (input.ruleType === "PERCENT_DECREASE") return `Decrease ${scope} rate for ${dates}`;
  return `Set ${scope} rate for ${dates}`;
}

export function summarizeRestrictionApproval(input: {
  operationType: string;
  fields: string[];
  ratePlanNames: string[];
  roomTypeNames: string[];
  dates: string[];
}): string {
  const scope = joinLabels([
    ...uniqueLabels(input.roomTypeNames),
    ...uniqueLabels(input.ratePlanNames),
  ]);
  const count = input.dates.length;
  const dates = count === 1 ? "1 date" : `${count} dates`;
  if (input.operationType === "CLEAR_ALL") return `Clear restrictions on ${scope} for ${dates}`;
  const field = input.fields.includes("stopSell")
    ? "Stop Sell"
    : input.fields.includes("closedToArrival")
      ? "CTA"
      : input.fields.includes("closedToDeparture")
        ? "CTD"
        : input.fields.includes("minStay")
          ? "Min Stay"
          : input.fields.includes("maxStay")
            ? "Max Stay"
            : "restriction";
  return `Apply ${field} to ${scope} for ${dates}`;
}

export function summarizeCommercialApproval(input: {
  operation: "CREATE" | "EDIT" | "DEACTIVATE";
  kind: "promotion" | "package";
  name?: string | null;
  code?: string | null;
  active?: boolean;
}): string {
  const label = input.name?.trim() || input.code?.trim() || `this ${input.kind}`;
  if (input.operation === "CREATE") return `Activate ${label} ${input.kind}`;
  if (input.operation === "DEACTIVATE") return `Deactivate ${label} ${input.kind}`;
  if (input.active === true) return `Edit ${label} ${input.kind}`;
  return `Edit ${label} ${input.kind}`;
}

export function rateEntityType(targetCount: number): RevenueApprovalEntityType {
  return targetCount > 1 ? "rate_bulk" : "rate_calendar";
}

export function restrictionEntityType(targetCount: number): RevenueApprovalEntityType {
  return targetCount > 1 ? "restriction_bulk" : "restriction";
}

export function encodeExpectedVersions(
  versions: Array<{ ratePlanId: string; date: string; expectedVersion: string }>,
): string {
  return versions
    .map((row) => `${row.ratePlanId}:${row.date}:${row.expectedVersion}`)
    .sort()
    .join("|");
}

export function buildRateDisplaySnapshot(input: {
  ruleType: string;
  ratePlanNames: string[];
  roomTypeNames: string[];
  dates: string[];
  operationLabel: string;
}): RevenueApprovalDisplaySnapshot {
  const range = dateRangeLabel(input.dates);
  const summary = summarizeRateApproval(input);
  return {
    summary,
    operationLabel: input.operationLabel,
    roomTypeNames: uniqueLabels(input.roomTypeNames),
    ratePlanNames: uniqueLabels(input.ratePlanNames),
    dateFrom: range.from,
    dateTo: range.to,
    targetCount: input.dates.length,
  };
}

export function buildRestrictionDisplaySnapshot(input: {
  operationType: string;
  fields: string[];
  ratePlanNames: string[];
  roomTypeNames: string[];
  dates: string[];
  operationLabel: string;
}): RevenueApprovalDisplaySnapshot {
  const range = dateRangeLabel(input.dates);
  const summary = summarizeRestrictionApproval(input);
  return {
    summary,
    operationLabel: input.operationLabel,
    roomTypeNames: uniqueLabels(input.roomTypeNames),
    ratePlanNames: uniqueLabels(input.ratePlanNames),
    dateFrom: range.from,
    dateTo: range.to,
    targetCount: input.dates.length,
  };
}

export function buildCommercialDisplaySnapshot(input: {
  operation: "CREATE" | "EDIT" | "DEACTIVATE";
  kind: "promotion" | "package";
  name?: string | null;
  code?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  roomTypeNames?: string[];
  ratePlanNames?: string[];
  active?: boolean;
}): RevenueApprovalDisplaySnapshot {
  const summary = summarizeCommercialApproval(input);
  return {
    summary,
    operationLabel: input.operation,
    name: input.name ?? null,
    code: input.code ?? null,
    dateFrom: input.dateFrom ?? null,
    dateTo: input.dateTo ?? null,
    roomTypeNames: uniqueLabels(input.roomTypeNames ?? []),
    ratePlanNames: uniqueLabels(input.ratePlanNames ?? []),
  };
}

export const revenueApprovalListQuerySchema = z.object({
  restaurantId: idSchema,
  status: z.enum(REVENUE_APPROVAL_STATUSES).optional(),
  statuses: z.array(z.enum(REVENUE_APPROVAL_STATUSES)).min(1).optional(),
  domain: z.enum(REVENUE_APPROVAL_DOMAINS).optional(),
  requestedBy: idSchema.optional(),
  reviewedBy: idSchema.optional(),
  fromDate: isoDateSchema.optional(),
  toDate: isoDateSchema.optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(REVENUE_APPROVAL_HISTORY_MAX_PAGE_SIZE).optional(),
});

export const revenueApprovalDetailQuerySchema = z.object({
  restaurantId: idSchema,
  approvalRequestId: idSchema,
});

export function revenueApprovalPageBounds(input: { page?: number; pageSize?: number }) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? REVENUE_APPROVAL_HISTORY_PAGE_SIZE;
  return { page, pageSize };
}

export function isStaleDomainError(message: string): boolean {
  return (
    message.includes("RATE_CHANGE_STALE") ||
    message.includes("RESTRICTION_CHANGE_STALE") ||
    message.includes("COMMERCIAL_ACTIVATION_STALE") ||
    message.includes("PROMOTION_ACTIVATION_DUPLICATE") ||
    message.includes("PACKAGE_ACTIVATION_DUPLICATE")
  );
}
