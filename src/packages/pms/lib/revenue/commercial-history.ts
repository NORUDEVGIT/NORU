/**
 * P5A-04 — Commercial history display helpers for UI-21.
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
  "No commercial activation changes have been recorded since commercial history was enabled.";
export const COMMERCIAL_HISTORY_REASON_EMPTY = "No reason provided";

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

export function commercialHistoryActionLabel(actionType: string): string {
  if (actionType === "promotion_activation_created") return "Promotion activation created";
  if (actionType === "promotion_activation_edited") return "Promotion activation edited";
  if (actionType === "promotion_activation_deactivated") return "Promotion activation deactivated";
  if (actionType === "promotion_activation_scope_changed") return "Promotion scope changed";
  if (actionType === "package_activation_created") return "Package activation created";
  if (actionType === "package_activation_edited") return "Package activation edited";
  if (actionType === "package_activation_deactivated") return "Package activation deactivated";
  if (actionType === "package_activation_scope_changed") return "Package scope changed";
  return actionType;
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
    roomTypeIds: Array.isArray(value.roomTypeIds) ? value.roomTypeIds.map(String) : [],
    ratePlanIds: Array.isArray(value.ratePlanIds) ? value.ratePlanIds.map(String) : [],
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
