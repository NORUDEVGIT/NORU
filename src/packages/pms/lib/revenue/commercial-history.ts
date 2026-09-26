/**
 * P5A-04 / UI-21 — Commercial history display helpers.
 */

import {
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_MAX_PAGE_SIZE,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  commercialChangedFields,
  commercialHistoryActorLabel,
  type CommercialActionType,
  type CommercialActivationState,
  type CommercialChangedField,
  type CommercialEntityType,
} from "./commercial-engine.ts";
import { historyPaginationRange } from "./rate-history.ts";

export {
  COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE,
  COMMERCIAL_HISTORY_MAX_PAGE_SIZE,
  COMMERCIAL_HISTORY_PAGE_SIZES,
  commercialHistoryActorLabel,
  historyPaginationRange,
};

export const COMMERCIAL_HISTORY_EMPTY_COPY =
  "No commercial activation changes have been recorded yet.";
export const COMMERCIAL_HISTORY_REASON_EMPTY = "No reason provided";
export const COMMERCIAL_HISTORY_IMMUTABLE_COPY = "Commercial history is immutable.";
export const COMMERCIAL_HISTORY_VALUE_NOT_SET = "Not set";
export const COMMERCIAL_HISTORY_VALUE_ALL_ELIGIBLE = "All eligible";
export const COMMERCIAL_HISTORY_VALUE_NONE = "None";
export const COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED = "Not activated";

export type CommercialHistoryRow = {
  id: string;
  restaurantId: string;
  operationId: string;
  entityType: CommercialEntityType;
  entityId: string;
  masterId: string | null;
  actionType: CommercialActionType;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  source: string;
  createdAt: string;
  changedFields: CommercialChangedField[];
};

export type CommercialHistoryPage = {
  rows: CommercialHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type CommercialOperationDetail = {
  operationId: string;
  actionType: CommercialActionType;
  entityType: CommercialEntityType;
  source: string;
  reason: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  createdAt: string;
  restaurantId: string;
  events: CommercialHistoryRow[];
};

function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function asIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function commercialHistoryIsReactivated(
  actionType: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): boolean {
  return (
    (actionType === "promotion_activation_edited" || actionType === "package_activation_edited") &&
    before?.active === false &&
    after?.active === true
  );
}

export function commercialHistoryActionLabel(
  actionType: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): string {
  if (commercialHistoryIsReactivated(actionType, before, after)) {
    return actionType.startsWith("package_") ? "Package Reactivated" : "Promotion Reactivated";
  }
  if (actionType === "promotion_activation_created") return "Promotion Activated";
  if (actionType === "promotion_activation_edited") return "Promotion Edited";
  if (actionType === "promotion_activation_deactivated") return "Promotion Deactivated";
  if (actionType === "promotion_activation_scope_changed") return "Promotion Scope Changed";
  if (actionType === "package_activation_created") return "Package Activated";
  if (actionType === "package_activation_edited") return "Package Edited";
  if (actionType === "package_activation_deactivated") return "Package Deactivated";
  if (actionType === "package_activation_scope_changed") return "Package Scope Changed";
  return actionType;
}

export function commercialHistoryEntityTypeLabel(entityType: string): string {
  if (entityType === "promotion_activation") return "Promotion Activation";
  if (entityType === "package_activation") return "Package Activation";
  return entityType;
}

export function commercialHistoryEntityFallback(entityType: string): string {
  return commercialHistoryEntityTypeLabel(entityType);
}

export function commercialHistoryEntityFromState(
  entityType: string,
  state: Record<string, unknown> | null | undefined,
): { name: string; code: string | null } {
  if (entityType === "promotion_activation") {
    const name = asText(state?.promotionName);
    const code = asText(state?.promotionCode);
    if (name || code) return { name: name ?? code!, code };
    return { name: "Promotion Activation", code: null };
  }
  if (entityType === "package_activation") {
    const name = asText(state?.packageName);
    const code = asText(state?.packageCode);
    if (name || code) return { name: name ?? code!, code };
    return { name: "Package Activation", code: null };
  }
  return { name: commercialHistoryEntityFallback(entityType), code: null };
}

export function commercialHistorySourceLabel(source: string): string {
  if (source === "rate_revenue") return "Rate & Revenue";
  if (source === "commercial_workspace") return "Commercial workspace";
  return source;
}

export function commercialHistoryReasonLabel(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? COMMERCIAL_HISTORY_REASON_EMPTY : trimmed;
}

export function commercialHistoryPageSize(value: number | undefined): number {
  if (value == null) return COMMERCIAL_HISTORY_DEFAULT_PAGE_SIZE;
  if ((COMMERCIAL_HISTORY_PAGE_SIZES as readonly number[]).includes(value)) return value;
  return Math.min(Math.max(value, 1), COMMERCIAL_HISTORY_MAX_PAGE_SIZE);
}

export function commercialHistoryFieldLabel(field: CommercialChangedField | string): string {
  if (field === "validity") return "Stay dates";
  if (field === "bookingWindow") return "Booking Window";
  if (field === "priority") return "Priority";
  if (field === "active") return "Status";
  if (field === "reason") return "Reason";
  if (field === "roomTypes") return "Room Types";
  if (field === "ratePlans") return "Rate Plans";
  if (field === "validFrom") return "Stay Valid From";
  if (field === "validTo") return "Stay Valid To";
  return field;
}

export function commercialHistoryChangesSummary(fields: readonly CommercialChangedField[]): string {
  if (fields.length === 0) return "Activated";
  const labels = fields.map((field) => {
    if (field === "validity") return "Stay dates";
    if (field === "roomTypes") return "room scope";
    if (field === "ratePlans") return "rate-plan scope";
    if (field === "bookingWindow") return "Booking window";
    if (field === "active") return "Status";
    if (field === "priority") return "Priority";
    if (field === "reason") return "Reason";
    return field;
  });
  return labels.join(", ");
}

export function commercialHistoryStatusLabel(
  value: unknown,
  empty: "not-set" | "not-activated" = "not-set",
): string {
  if (value === true) return "Active";
  if (value === false) return "Inactive";
  return empty === "not-activated" ? COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED : COMMERCIAL_HISTORY_VALUE_NOT_SET;
}

export function commercialHistoryScalarLabel(value: unknown): string {
  const text = asText(value);
  return text ?? COMMERCIAL_HISTORY_VALUE_NOT_SET;
}

export function commercialHistoryRangeLabel(from: unknown, to: unknown): string {
  const start = asText(from);
  const end = asText(to);
  if (!start && !end) return COMMERCIAL_HISTORY_VALUE_NOT_SET;
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? COMMERCIAL_HISTORY_VALUE_NOT_SET;
}

export function commercialHistoryScopeNames(
  ids: unknown,
  names: Map<string, string>,
): string {
  const list = asIdList(ids);
  if (list.length === 0) return COMMERCIAL_HISTORY_VALUE_ALL_ELIGIBLE;
  const labels = list.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  if (labels.length === 0) return list.length === 1 ? "1 selected" : `${list.length} selected`;
  return labels.join(", ");
}

function asState(value: Record<string, unknown> | null): CommercialActivationState | null {
  if (!value) return null;
  return {
    active: value.active === true,
    validFrom: String(value.validFrom ?? ""),
    validTo: String(value.validTo ?? ""),
    bookingFrom: value.bookingFrom == null ? null : String(value.bookingFrom),
    bookingTo: value.bookingTo == null ? null : String(value.bookingTo),
    priority: value.priority == null ? null : Number(value.priority),
    reason: value.reason == null ? null : String(value.reason),
    roomTypeIds: asIdList(value.roomTypeIds),
    ratePlanIds: asIdList(value.ratePlanIds),
  };
}

export function commercialHistoryChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): CommercialChangedField[] {
  const next = asState(after);
  if (!next) return [];
  return commercialChangedFields(asState(before), next);
}

export function sanitizeCommercialHistorySearch(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[%_(),.*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
}
