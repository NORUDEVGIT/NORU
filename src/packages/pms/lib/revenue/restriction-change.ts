/**
 * RR-P3-01 — Restriction-change domain.
 *
 * Official APIs for UI-08–UI-11. Single and bulk share this path.
 * Pricing still reads hotel_rate_restrictions only. Card 3 templates stay
 * Property Setup catalogue — no template FK, no merge.
 *
 * saveRateRestriction remains an unmounted compatibility writer.
 * Official Phase 3 writes go through
 * applyRestrictionChanges → apply_hotel_rate_restrictions.
 *
 * Open product decisions (do not invent stricter rules here):
 *   1. Active plan / valid_from / valid_to — current saveRateRestriction does
 *      not enforce these; this domain also does not.
 *   2. Past dates / Night Audit-closed dates — not blocked.
 *   3. Reason required — reason is optional; blank trims to null.
 */
import { z } from "zod";
import { isIsoDate, normalizeReason, targetKey } from "./rate-change.ts";

export const RESTRICTION_CHANGE_MAX_TARGETS = 366;
export const RESTRICTION_STAY_LIMIT = 365;
export const RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE = 25;
export const RESTRICTION_HISTORY_MAX_PAGE_SIZE = 100;
export const ABSENT_RESTRICTION_VERSION = "absent";

export const RESTRICTION_CHANGE_SOURCES = ["restriction_calendar", "rate_revenue"] as const;
export type RestrictionChangeSource = (typeof RESTRICTION_CHANGE_SOURCES)[number];

export const RESTRICTION_ACTION_TYPES = [
  "single_restriction_change",
  "bulk_restriction_change",
  "clear_restriction",
] as const;
export type RestrictionActionType = (typeof RESTRICTION_ACTION_TYPES)[number];

export const RESTRICTION_FIELD_KEYS = [
  "minStay",
  "maxStay",
  "closedToArrival",
  "closedToDeparture",
  "stopSell",
] as const;
export type RestrictionFieldKey = (typeof RESTRICTION_FIELD_KEYS)[number];

export type RestrictionState = {
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export const EMPTY_RESTRICTION_STATE: RestrictionState = {
  minStay: null,
  maxStay: null,
  closedToArrival: false,
  closedToDeparture: false,
  stopSell: false,
};

export type RestrictionChangeTarget = {
  ratePlanId: string;
  date: string;
};

export type RestrictionChangeFields = {
  minStay?: number | null;
  maxStay?: number | null;
  closedToArrival?: boolean;
  closedToDeparture?: boolean;
  stopSell?: boolean;
};

export type RestrictionChangeOperation =
  | { type: "SET_FIELDS"; fields: RestrictionChangeFields }
  | { type: "CLEAR_ALL" };

export type RestrictionChangeExpectedVersion = {
  ratePlanId: string;
  date: string;
  expectedVersion: string;
};

export type RestrictionChangeRequest = {
  restaurantId: string;
  targets: RestrictionChangeTarget[];
  operation: RestrictionChangeOperation;
  expectedVersions?: RestrictionChangeExpectedVersion[];
  reason?: string | null;
  source?: RestrictionChangeSource;
};

export type RestrictionPlanSnapshot = {
  id: string;
  code: string;
  name: string;
  roomTypeId: string;
  roomTypeName: string;
  active: boolean;
};

export type RestrictionRowSnapshot = RestrictionState & {
  updatedAt: string | null;
};

export type RestrictionChangePreviewItem = {
  date: string;
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  roomTypeId: string;
  roomTypeName: string;
  before: RestrictionState;
  after: RestrictionState;
  changedFields: RestrictionFieldKey[];
  expectedVersion: string;
  validationStatus: "valid" | "invalid";
  validationMessages: string[];
  noOp: boolean;
};

export type RestrictionChangePreview = {
  restaurantId: string;
  operation: RestrictionChangeOperation;
  reason: string | null;
  items: RestrictionChangePreviewItem[];
  valid: boolean;
};

export type RestrictionChangeApplyResult = {
  operationId: string;
  actionType: RestrictionActionType;
  appliedCount: number;
  deletedCount: number;
  upsertedCount: number;
};

export type RestrictionHistoryRow = {
  id: string;
  restaurantId: string;
  operationId: string;
  actionType: RestrictionActionType;
  ratePlanId: string;
  ratePlanCode: string | null;
  ratePlanName: string | null;
  roomTypeId: string;
  roomTypeName: string | null;
  stayDate: string;
  previous: RestrictionState;
  next: RestrictionState;
  reason: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  source: string;
  createdAt: string;
};

export type RestrictionHistoryPage = {
  rows: RestrictionHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type RestrictionHistoryQuery = {
  restaurantId: string;
  from?: string | null;
  to?: string | null;
  stayDate?: string | null;
  ratePlanId?: string | null;
  roomTypeId?: string | null;
  actionType?: RestrictionActionType | null;
  actorMembershipId?: string | null;
  page?: number;
  pageSize?: number;
};

export type RestrictionOperationDetail = {
  operationId: string;
  actionType: RestrictionActionType;
  createdAt: string;
  reason: string | null;
  source: string;
  actorMembershipId: string | null;
  actorName: string | null;
  restaurantId: string;
  events: RestrictionHistoryRow[];
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const restrictionChangeTargetSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: isoDateSchema,
});

export const restrictionChangeFieldsSchema = z.object({
  minStay: z.number().int().nullable().optional(),
  maxStay: z.number().int().nullable().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
  stopSell: z.boolean().optional(),
});

export const restrictionChangeOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SET_FIELDS"), fields: restrictionChangeFieldsSchema }),
  z.object({ type: z.literal("CLEAR_ALL") }),
]);

export const restrictionChangeExpectedVersionSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: isoDateSchema,
  expectedVersion: z.string().min(1),
});

export const restrictionChangeRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  targets: z.array(restrictionChangeTargetSchema).min(1).max(RESTRICTION_CHANGE_MAX_TARGETS),
  operation: restrictionChangeOperationSchema,
  reason: z.string().max(500).nullable().optional(),
  expectedVersions: z.array(restrictionChangeExpectedVersionSchema).optional(),
  source: z.enum(RESTRICTION_CHANGE_SOURCES).optional(),
});

export const restrictionChangeHistoryQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  stayDate: isoDateSchema.optional(),
  ratePlanId: z.string().uuid().optional(),
  roomTypeId: z.string().uuid().optional(),
  actionType: z.enum(RESTRICTION_ACTION_TYPES).optional(),
  actorMembershipId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(RESTRICTION_HISTORY_MAX_PAGE_SIZE).optional(),
});

export const restrictionChangeOperationQuerySchema = z
  .object({
    restaurantId: z.string().uuid(),
    operationId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.operationId || value.eventId), {
    message: "Provide operationId or eventId.",
  });

export function restrictionVersionToken(updatedAt: string | null | undefined): string {
  return updatedAt && updatedAt.length > 0 ? updatedAt : ABSENT_RESTRICTION_VERSION;
}

export function emptyRestrictionState(): RestrictionState {
  return { ...EMPTY_RESTRICTION_STATE };
}

export function isEmptyRestriction(state: RestrictionState): boolean {
  return (
    state.minStay == null &&
    state.maxStay == null &&
    state.closedToArrival === false &&
    state.closedToDeparture === false &&
    state.stopSell === false
  );
}

export function restrictionStatesEqual(a: RestrictionState, b: RestrictionState): boolean {
  return (
    a.minStay === b.minStay &&
    a.maxStay === b.maxStay &&
    a.closedToArrival === b.closedToArrival &&
    a.closedToDeparture === b.closedToDeparture &&
    a.stopSell === b.stopSell
  );
}

export function restrictionChangedFields(
  before: RestrictionState,
  after: RestrictionState,
): RestrictionFieldKey[] {
  return RESTRICTION_FIELD_KEYS.filter((key) => before[key] !== after[key]);
}

export function isRestrictionChangeSource(value: string): value is RestrictionChangeSource {
  return (RESTRICTION_CHANGE_SOURCES as readonly string[]).includes(value);
}

export function restrictionFieldCount(fields: RestrictionChangeFields): number {
  return RESTRICTION_FIELD_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(fields, key))
    .length;
}

function stayIntegerValid(value: number | null | undefined): boolean {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= RESTRICTION_STAY_LIMIT);
}

export function applyRestrictionFields(
  current: RestrictionState,
  fields: RestrictionChangeFields,
): RestrictionState {
  return {
    minStay: Object.prototype.hasOwnProperty.call(fields, "minStay")
      ? fields.minStay ?? null
      : current.minStay,
    maxStay: Object.prototype.hasOwnProperty.call(fields, "maxStay")
      ? fields.maxStay ?? null
      : current.maxStay,
    closedToArrival: Object.prototype.hasOwnProperty.call(fields, "closedToArrival")
      ? Boolean(fields.closedToArrival)
      : current.closedToArrival,
    closedToDeparture: Object.prototype.hasOwnProperty.call(fields, "closedToDeparture")
      ? Boolean(fields.closedToDeparture)
      : current.closedToDeparture,
    stopSell: Object.prototype.hasOwnProperty.call(fields, "stopSell")
      ? Boolean(fields.stopSell)
      : current.stopSell,
  };
}

export function proposedRestrictionState(
  current: RestrictionState,
  operation: RestrictionChangeOperation,
): RestrictionState {
  if (operation.type === "CLEAR_ALL") return emptyRestrictionState();
  return applyRestrictionFields(current, operation.fields);
}

function fieldValidationCode(fields: RestrictionChangeFields): string | null {
  if (Object.prototype.hasOwnProperty.call(fields, "minStay") && !stayIntegerValid(fields.minStay)) {
    return "RESTRICTION_MIN_STAY_INVALID";
  }
  if (Object.prototype.hasOwnProperty.call(fields, "maxStay") && !stayIntegerValid(fields.maxStay)) {
    return "RESTRICTION_MAX_STAY_INVALID";
  }
  if (Object.prototype.hasOwnProperty.call(fields, "closedToArrival") && typeof fields.closedToArrival !== "boolean") {
    return "RESTRICTION_CHANGE_UNSUPPORTED";
  }
  if (
    Object.prototype.hasOwnProperty.call(fields, "closedToDeparture") &&
    typeof fields.closedToDeparture !== "boolean"
  ) {
    return "RESTRICTION_CHANGE_UNSUPPORTED";
  }
  if (Object.prototype.hasOwnProperty.call(fields, "stopSell") && typeof fields.stopSell !== "boolean") {
    return "RESTRICTION_CHANGE_UNSUPPORTED";
  }
  return null;
}

export function validateRestrictionChangeRequest(request: RestrictionChangeRequest): string | null {
  if (!request.restaurantId) return "RESTRICTION_CHANGE_FORBIDDEN";
  if (!Array.isArray(request.targets) || request.targets.length === 0) {
    return "RESTRICTION_CHANGE_EMPTY";
  }
  if (request.targets.length > RESTRICTION_CHANGE_MAX_TARGETS) {
    return "RESTRICTION_TARGET_LIMIT";
  }
  if (request.source && !isRestrictionChangeSource(request.source)) {
    return "RESTRICTION_CHANGE_UNSUPPORTED";
  }

  const seen = new Set<string>();
  for (const target of request.targets) {
    if (!target.ratePlanId) return "RESTRICTION_PLAN_NOT_FOUND";
    if (!isIsoDate(target.date)) return "RESTRICTION_INVALID_DATE";
    const key = targetKey(target.ratePlanId, target.date);
    if (seen.has(key)) return "RESTRICTION_DUPLICATE_TARGET";
    seen.add(key);
  }

  if (request.operation.type === "SET_FIELDS") {
    if (restrictionFieldCount(request.operation.fields) < 1) return "RESTRICTION_NO_FIELDS";
    return fieldValidationCode(request.operation.fields);
  }

  return null;
}

export function restrictionActionType(
  operation: RestrictionChangeOperation,
  targetCount: number,
): RestrictionActionType {
  if (operation.type === "CLEAR_ALL") return "clear_restriction";
  return targetCount === 1 ? "single_restriction_change" : "bulk_restriction_change";
}

export function buildRestrictionChangePreview(input: {
  restaurantId: string;
  targets: RestrictionChangeTarget[];
  operation: RestrictionChangeOperation;
  reason?: string | null;
  source?: RestrictionChangeSource;
  plans: Map<string, RestrictionPlanSnapshot>;
  current: Map<string, RestrictionRowSnapshot>;
  expectedVersions?: Map<string, string>;
}): RestrictionChangePreview {
  const requestError = validateRestrictionChangeRequest({
    restaurantId: input.restaurantId,
    targets: input.targets,
    operation: input.operation,
    reason: input.reason,
    source: input.source,
  });

  const items = input.targets.map((target) => {
    const plan = input.plans.get(target.ratePlanId);
    const row = input.current.get(targetKey(target.ratePlanId, target.date));
    const before = row
      ? {
          minStay: row.minStay,
          maxStay: row.maxStay,
          closedToArrival: row.closedToArrival,
          closedToDeparture: row.closedToDeparture,
          stopSell: row.stopSell,
        }
      : emptyRestrictionState();
    const after = proposedRestrictionState(before, input.operation);
    const changedFields = restrictionChangedFields(before, after);
    const expectedVersion = restrictionVersionToken(row?.updatedAt);
    const messages: string[] = [];

    if (requestError) messages.push(requestError);
    if (!plan) messages.push("RESTRICTION_PLAN_NOT_FOUND");
    if (after.minStay != null && after.maxStay != null && after.maxStay < after.minStay) {
      messages.push("RESTRICTION_STAY_RANGE_INVALID");
    }
    const submittedVersion = input.expectedVersions?.get(targetKey(target.ratePlanId, target.date));
    if (submittedVersion && submittedVersion !== expectedVersion) {
      messages.push("RESTRICTION_CHANGE_STALE");
    }

    return {
      date: target.date,
      ratePlanId: target.ratePlanId,
      ratePlanCode: plan?.code ?? "",
      ratePlanName: plan?.name ?? "",
      roomTypeId: plan?.roomTypeId ?? "",
      roomTypeName: plan?.roomTypeName ?? "",
      before,
      after,
      changedFields,
      expectedVersion,
      validationStatus: (messages.length > 0 ? "invalid" : "valid") as "valid" | "invalid",
      validationMessages: [...new Set(messages)],
      noOp: changedFields.length === 0,
    };
  });

  return {
    restaurantId: input.restaurantId,
    operation: input.operation,
    reason: normalizeReason(input.reason),
    items,
    valid: items.length > 0 && items.every((item) => item.validationStatus === "valid"),
  };
}

export type RestrictionAtomicApplyDecision =
  | { ok: true; items: RestrictionChangePreviewItem[]; actionType: RestrictionActionType }
  | { ok: false; error: string; items: [] };

export function decideAtomicRestrictionApply(
  preview: RestrictionChangePreview,
): RestrictionAtomicApplyDecision {
  if (!preview.valid) {
    const first = preview.items.find((item) => item.validationStatus === "invalid");
    return {
      ok: false,
      error: first?.validationMessages[0] ?? "RESTRICTION_CHANGE_UNSUPPORTED",
      items: [],
    };
  }
  return {
    ok: true,
    items: preview.items,
    actionType: restrictionActionType(preview.operation, preview.items.length),
  };
}

export function restrictionHistoryPageBounds(query: { page?: number; pageSize?: number }): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(
    RESTRICTION_HISTORY_MAX_PAGE_SIZE,
    Math.max(1, query.pageSize ?? RESTRICTION_HISTORY_DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

export function groupRestrictionHistoryByOperation(
  rows: RestrictionHistoryRow[],
): RestrictionOperationDetail[] {
  const byOp = new Map<string, RestrictionHistoryRow[]>();
  for (const row of rows) {
    const list = byOp.get(row.operationId) ?? [];
    list.push(row);
    byOp.set(row.operationId, list);
  }
  return [...byOp.entries()].map(([operationId, events]) => ({
    operationId,
    actionType: events[0]?.actionType ?? "single_restriction_change",
    createdAt: events[0]?.createdAt ?? "",
    reason: events[0]?.reason ?? null,
    source: events[0]?.source ?? "rate_revenue",
    actorMembershipId: events[0]?.actorMembershipId ?? null,
    actorName: events[0]?.actorName ?? null,
    restaurantId: events[0]?.restaurantId ?? "",
    events,
  }));
}

export { normalizeReason, targetKey };
