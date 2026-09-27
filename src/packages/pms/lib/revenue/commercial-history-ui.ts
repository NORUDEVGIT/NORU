/**
 * UI-21 — Commercial History workspace compose helpers.
 * Groups event-grain history by operation_id and resolves display labels.
 */

import type { CommercialActionType, CommercialChangedField, CommercialEntityType } from "./commercial-engine.ts";
import {
  COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED,
  COMMERCIAL_HISTORY_VALUE_ALL_ELIGIBLE,
  COMMERCIAL_HISTORY_VALUE_NONE,
  COMMERCIAL_HISTORY_VALUE_NOT_SET,
  commercialHistoryActionLabel,
  commercialHistoryChangesSummary,
  commercialHistoryEntityFromState,
  commercialHistoryEntityTypeLabel,
  commercialHistoryFieldLabel,
  commercialHistoryRangeLabel,
  commercialHistoryReasonLabel,
  commercialHistoryScalarLabel,
  commercialHistoryScopeNames,
  commercialHistorySourceLabel,
  commercialHistoryStatusLabel,
  type CommercialHistoryRow,
  type CommercialOperationDetail,
} from "./commercial-history.ts";

export type CommercialHistoryWorkspaceRow = {
  id: string;
  operationId: string;
  entityType: CommercialEntityType;
  entityId: string;
  masterId: string | null;
  actionType: CommercialActionType;
  actionLabel: string;
  entityName: string;
  entityCode: string | null;
  entityTypeLabel: string;
  reason: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  source: string;
  createdAt: string;
  changedFields: CommercialChangedField[];
  changesSummary: string;
  eventCount: number;
};

export type CommercialHistoryActorOption = {
  id: string;
  name: string;
};

export type CommercialHistoryWorkspace = {
  rows: CommercialHistoryWorkspaceRow[];
  total: number;
  page: number;
  pageSize: number;
  actors: CommercialHistoryActorOption[];
};

export type CommercialHistoryFieldChange = {
  key: string;
  label: string;
  before: string;
  after: string;
};

export type CommercialHistorySnapshotField = {
  label: string;
  value: string;
};

export type CommercialHistoryOperationDetailView = {
  operationId: string;
  actionType: CommercialActionType;
  actionLabel: string;
  entityType: CommercialEntityType;
  entityTypeLabel: string;
  entityName: string;
  entityCode: string | null;
  entityId: string;
  masterId: string | null;
  source: string;
  sourceLabel: string;
  reason: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  createdAt: string;
  restaurantId: string;
  events: CommercialHistoryRow[];
  changes: CommercialHistoryFieldChange[];
  snapshot: CommercialHistorySnapshotField[];
};

export type CommercialHistoryNameMaps = {
  roomNames: Map<string, string>;
  planNames: Map<string, string>;
};

function uniqueFields(fields: CommercialChangedField[]): CommercialChangedField[] {
  return [...new Set(fields)];
}

export function groupCommercialHistoryByOperation(events: CommercialHistoryRow[]): CommercialHistoryRow[] {
  const groups = new Map<string, CommercialHistoryRow[]>();
  for (const event of events) {
    const current = groups.get(event.operationId) ?? [];
    current.push(event);
    groups.set(event.operationId, current);
  }
  return [...groups.values()].map((group) => {
    const latest = group.reduce((best, row) => (row.createdAt > best.createdAt ? row : best));
    return {
      ...latest,
      changedFields: uniqueFields(group.flatMap((row) => row.changedFields)),
    };
  });
}

export function toCommercialHistoryWorkspaceRow(
  event: CommercialHistoryRow,
  eventCount = 1,
): CommercialHistoryWorkspaceRow {
  const entity = commercialHistoryEntityFromState(event.entityType, event.afterState ?? event.beforeState);
  return {
    id: event.operationId,
    operationId: event.operationId,
    entityType: event.entityType,
    entityId: event.entityId,
    masterId: event.masterId,
    actionType: event.actionType,
    actionLabel: commercialHistoryActionLabel(event.actionType, event.beforeState, event.afterState),
    entityName: entity.name,
    entityCode: entity.code,
    entityTypeLabel: commercialHistoryEntityTypeLabel(event.entityType),
    reason: event.reason,
    actorMembershipId: event.actorMembershipId,
    actorName: event.actorName,
    source: event.source,
    createdAt: event.createdAt,
    changedFields: event.changedFields,
    changesSummary: commercialHistoryChangesSummary(event.changedFields),
    eventCount,
  };
}

function bookingLabel(state: Record<string, unknown> | null | undefined): string {
  if (!state) return COMMERCIAL_HISTORY_VALUE_NOT_SET;
  return commercialHistoryRangeLabel(state.bookingFrom, state.bookingTo);
}

function priorityLabel(state: Record<string, unknown> | null | undefined): string {
  if (!state || state.priority == null || state.priority === "") return COMMERCIAL_HISTORY_VALUE_NOT_SET;
  return String(state.priority);
}

function reasonValue(state: Record<string, unknown> | null | undefined): string {
  if (!state) return COMMERCIAL_HISTORY_VALUE_NONE;
  const text = typeof state.reason === "string" ? state.reason.trim() : "";
  return text || COMMERCIAL_HISTORY_VALUE_NONE;
}

export function commercialHistoryFieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  names: CommercialHistoryNameMaps,
): CommercialHistoryFieldChange[] {
  const created = before == null;
  const rows: CommercialHistoryFieldChange[] = [
    {
      key: "validFrom",
      label: commercialHistoryFieldLabel("validFrom"),
      before: created ? COMMERCIAL_HISTORY_VALUE_NOT_SET : commercialHistoryScalarLabel(before.validFrom),
      after: commercialHistoryScalarLabel(after?.validFrom),
    },
    {
      key: "validTo",
      label: commercialHistoryFieldLabel("validTo"),
      before: created ? COMMERCIAL_HISTORY_VALUE_NOT_SET : commercialHistoryScalarLabel(before.validTo),
      after: commercialHistoryScalarLabel(after?.validTo),
    },
    {
      key: "bookingWindow",
      label: commercialHistoryFieldLabel("bookingWindow"),
      before: created ? COMMERCIAL_HISTORY_VALUE_NOT_SET : bookingLabel(before),
      after: bookingLabel(after),
    },
    {
      key: "priority",
      label: commercialHistoryFieldLabel("priority"),
      before: created ? COMMERCIAL_HISTORY_VALUE_NOT_SET : priorityLabel(before),
      after: priorityLabel(after),
    },
    {
      key: "active",
      label: commercialHistoryFieldLabel("active"),
      before: created ? COMMERCIAL_HISTORY_STATUS_NOT_ACTIVATED : commercialHistoryStatusLabel(before.active),
      after: commercialHistoryStatusLabel(after?.active),
    },
    {
      key: "roomTypes",
      label: commercialHistoryFieldLabel("roomTypes"),
      before: created ? COMMERCIAL_HISTORY_VALUE_ALL_ELIGIBLE : commercialHistoryScopeNames(before.roomTypeIds, names.roomNames),
      after: commercialHistoryScopeNames(after?.roomTypeIds, names.roomNames),
    },
    {
      key: "ratePlans",
      label: commercialHistoryFieldLabel("ratePlans"),
      before: created ? COMMERCIAL_HISTORY_VALUE_ALL_ELIGIBLE : commercialHistoryScopeNames(before.ratePlanIds, names.planNames),
      after: commercialHistoryScopeNames(after?.ratePlanIds, names.planNames),
    },
    {
      key: "reason",
      label: commercialHistoryFieldLabel("reason"),
      before: created ? COMMERCIAL_HISTORY_VALUE_NONE : reasonValue(before),
      after: reasonValue(after),
    },
  ];
  return created ? rows : rows.filter((row) => row.before !== row.after);
}

export function commercialHistorySnapshotFields(
  entityType: string,
  state: Record<string, unknown> | null,
  names: CommercialHistoryNameMaps,
): CommercialHistorySnapshotField[] {
  if (!state) return [];
  const entity = commercialHistoryEntityFromState(entityType, state);
  const stay = commercialHistoryRangeLabel(state.validFrom, state.validTo);
  const rooms = commercialHistoryScopeNames(state.roomTypeIds, names.roomNames);
  const plans = commercialHistoryScopeNames(state.ratePlanIds, names.planNames);
  if (entityType === "package_activation") {
    return [
      { label: "Name", value: entity.name },
      { label: "Code", value: entity.code ?? COMMERCIAL_HISTORY_VALUE_NOT_SET },
      { label: "Type", value: commercialHistoryScalarLabel(state.chargeBasis) },
      { label: "Configured Price", value: commercialHistoryScalarLabel(state.packagePrice) },
      { label: "Stay Window", value: stay },
      { label: "Room Scope", value: rooms },
      { label: "Rate Plan Scope", value: plans },
      { label: "Active", value: commercialHistoryStatusLabel(state.active) },
    ];
  }
  return [
    { label: "Name", value: entity.name },
    { label: "Code", value: entity.code ?? COMMERCIAL_HISTORY_VALUE_NOT_SET },
    { label: "Kind", value: commercialHistoryScalarLabel(state.promoKind) },
    { label: "Value", value: commercialHistoryScalarLabel(state.promoValue) },
    { label: "Stay Window", value: stay },
    { label: "Booking Window", value: bookingLabel(state) },
    { label: "Room Scope", value: rooms },
    { label: "Rate Plan Scope", value: plans },
    { label: "Priority", value: priorityLabel(state) },
    { label: "Active", value: commercialHistoryStatusLabel(state.active) },
  ];
}

export function composeCommercialHistoryOperationDetail(
  detail: CommercialOperationDetail,
  names: CommercialHistoryNameMaps,
): CommercialHistoryOperationDetailView {
  const latest = detail.events[detail.events.length - 1] ?? detail.events[0];
  const first = detail.events[0];
  const before = first?.beforeState ?? null;
  const after = latest?.afterState ?? first?.afterState ?? null;
  const entity = commercialHistoryEntityFromState(detail.entityType, after ?? before);
  return {
    operationId: detail.operationId,
    actionType: detail.actionType,
    actionLabel: commercialHistoryActionLabel(detail.actionType, before, after),
    entityType: detail.entityType,
    entityTypeLabel: commercialHistoryEntityTypeLabel(detail.entityType),
    entityName: entity.name,
    entityCode: entity.code,
    entityId: latest?.entityId ?? first?.entityId ?? "",
    masterId: latest?.masterId ?? first?.masterId ?? null,
    source: detail.source,
    sourceLabel: commercialHistorySourceLabel(detail.source),
    reason: detail.reason,
    actorMembershipId: detail.actorMembershipId,
    actorName: detail.actorName,
    createdAt: detail.createdAt,
    restaurantId: detail.restaurantId,
    events: detail.events,
    changes: commercialHistoryFieldChanges(before, after, names),
    snapshot: commercialHistorySnapshotFields(detail.entityType, after, names),
  };
}

export function commercialHistoryReasonDisplay(reason: string | null | undefined): string {
  return commercialHistoryReasonLabel(reason);
}
