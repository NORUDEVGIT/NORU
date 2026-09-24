/**
 * Rate Change domain — shared preview/apply calculation and validation.
 *
 * Preview and apply use these functions. Apply still recalculates on the server
 * (SQL ROUND(numeric, 2)); the browser never supplies the proposed nightly rate.
 *
 * Rounding: calculate percentages at full precision, then round the final nightly
 * rate to 2 decimal places (numeric(12,2)). Half-up via Math.round for values >= 0,
 * matching Postgres ROUND(numeric, 2) for non-negative hotel rates.
 *
 * Open product decisions (do not invent here):
 * - Past-date / Night Audit-closed date edits are not blocked.
 * - reason-required policy remains a UI/product decision for a later Phase 2 prompt.
 */

import { z } from "zod";

export const RATE_CHANGE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const RATE_CHANGE_MAX_NIGHTLY = 10_000_000;
export const RATE_CHANGE_MAX_PERCENT = 1000;
export const RATE_CHANGE_MAX_TARGETS = 366;
export const RATE_CHANGE_HISTORY_PAGE_SIZE = 25;
export const RATE_CHANGE_HISTORY_MAX_PAGE_SIZE = 100;
export const ABSENT_CALENDAR_VERSION = "absent";

export const RATE_CHANGE_RULE_TYPES = [
  "SET_RATE",
  "PERCENT_INCREASE",
  "PERCENT_DECREASE",
  "RESET_OVERRIDE",
  "COPY_FROM_DATE",
] as const;

export type RateChangeRuleType = (typeof RATE_CHANGE_RULE_TYPES)[number];

export const RATE_CHANGE_ACTION_TYPES = [
  "single_rate_change",
  "bulk_rate_change",
  "reset_override",
  "copy_rate",
] as const;

export type RateChangeActionType = (typeof RATE_CHANGE_ACTION_TYPES)[number];

export const RATE_CHANGE_SOURCES = ["rate_revenue", "rate_calendar"] as const;
export type RateChangeSource = (typeof RATE_CHANGE_SOURCES)[number];

export type RateChangeTarget = {
  ratePlanId: string;
  date: string;
};

export type RateChangeRule =
  | { type: "SET_RATE"; value: number }
  | { type: "PERCENT_INCREASE"; value: number }
  | { type: "PERCENT_DECREASE"; value: number }
  | { type: "RESET_OVERRIDE" }
  | { type: "COPY_FROM_DATE"; sourceDate: string };

export type RateChangeExpectedVersion = {
  ratePlanId: string;
  date: string;
  expectedVersion: string;
};

export type RateChangeRequest = {
  restaurantId: string;
  targets: RateChangeTarget[];
  rule: RateChangeRule;
  reason?: string | null;
  expectedVersions?: RateChangeExpectedVersion[];
  source?: RateChangeSource;
};

export type RateChangePlanSnapshot = {
  id: string;
  restaurantId: string;
  code: string;
  name: string;
  roomTypeId: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
};

export type RateChangeOverrideSnapshot = {
  nightlyRate: number;
  updatedAt: string;
};

export type RateChangeRestrictionContext = {
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export type RateChangeValidationStatus = "valid" | "invalid";

export type RateChangePreviewItem = {
  date: string;
  ratePlanId: string;
  ratePlanCode: string | null;
  ratePlanName: string | null;
  roomTypeId: string | null;
  roomTypeName: string | null;
  currency: string | null;
  baseRate: number | null;
  currentOverrideRate: number | null;
  currentEffectiveRate: number | null;
  proposedOverrideRate: number | null;
  proposedEffectiveRate: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
  validationStatus: RateChangeValidationStatus;
  validationMessages: string[];
  expectedVersion: string;
};

export type RateChangePreview = {
  rule: RateChangeRule;
  reason: string | null;
  valid: boolean;
  items: RateChangePreviewItem[];
};

export type RateChangeApplyResult = {
  operationId: string;
  actionType: RateChangeActionType;
  appliedCount: number;
};

export type RateChangeHistoryRow = {
  id: string;
  operationId: string;
  actionType: RateChangeActionType;
  ratePlanId: string;
  ratePlanCode: string | null;
  ratePlanName: string | null;
  roomTypeId: string;
  roomTypeName: string | null;
  stayDate: string;
  previousBaseRate: number;
  previousOverrideRate: number | null;
  previousEffectiveRate: number;
  newOverrideRate: number | null;
  newEffectiveRate: number;
  absoluteDelta: number;
  percentageDelta: number | null;
  currency: string;
  reason: string | null;
  actorMembershipId: string | null;
  source: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type RateChangeHistoryPage = {
  rows: RateChangeHistoryRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type RateChangeOperationDetail = {
  operationId: string;
  actionType: RateChangeActionType;
  source: string;
  reason: string | null;
  actorMembershipId: string | null;
  createdAt: string;
  restaurantId: string;
  events: RateChangeHistoryRow[];
  affectedDates: string[];
  affectedRatePlanIds: string[];
  affectedRoomTypeIds: string[];
};

const isoDateSchema = z.string().regex(RATE_CHANGE_ISO_DATE, "Use a YYYY-MM-DD date.");

export const rateChangeTargetSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: isoDateSchema,
});

export const rateChangeRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SET_RATE"), value: z.number() }),
  z.object({ type: z.literal("PERCENT_INCREASE"), value: z.number() }),
  z.object({ type: z.literal("PERCENT_DECREASE"), value: z.number() }),
  z.object({ type: z.literal("RESET_OVERRIDE") }),
  z.object({ type: z.literal("COPY_FROM_DATE"), sourceDate: isoDateSchema }),
]);

export const rateChangeExpectedVersionSchema = z.object({
  ratePlanId: z.string().uuid(),
  date: isoDateSchema,
  expectedVersion: z.string().min(1),
});

export const rateChangeRequestSchema = z.object({
  restaurantId: z.string().uuid(),
  targets: z.array(rateChangeTargetSchema).min(1).max(RATE_CHANGE_MAX_TARGETS),
  rule: rateChangeRuleSchema,
  reason: z.string().max(500).nullable().optional(),
  expectedVersions: z.array(rateChangeExpectedVersionSchema).optional(),
  source: z.enum(RATE_CHANGE_SOURCES).optional(),
});

export const rateChangeHistoryQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  ratePlanId: z.string().uuid().optional(),
  roomTypeId: z.string().uuid().optional(),
  actionType: z.enum(RATE_CHANGE_ACTION_TYPES).optional(),
  actorMembershipId: z.string().uuid().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(RATE_CHANGE_HISTORY_MAX_PAGE_SIZE).optional(),
});

export const rateChangeOperationQuerySchema = z
  .object({
    restaurantId: z.string().uuid(),
    operationId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.operationId || value.eventId), {
    message: "Provide operationId or eventId.",
  });

export function isIsoDate(value: string): boolean {
  if (!RATE_CHANGE_ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === (month ?? 1) - 1 &&
    dt.getUTCDate() === day
  );
}

export function normalizeReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function targetKey(ratePlanId: string, date: string): string {
  return `${ratePlanId}|${date}`;
}

export function calendarVersionToken(updatedAt: string | null | undefined): string {
  return updatedAt && updatedAt.length > 0 ? updatedAt : ABSENT_CALENDAR_VERSION;
}

/** Round a nightly rate to numeric(12,2). Prefer this over leaving IEEE leftovers. */
export function roundNightlyRate(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("RATE_CHANGE_UNSUPPORTED");
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function effectiveNightlyRate(baseRate: number, overrideRate: number | null): number {
  return overrideRate ?? baseRate;
}

export function resolveRateChangeActionType(
  rule: RateChangeRule,
  targetCount: number,
): RateChangeActionType {
  if (rule.type === "RESET_OVERRIDE") return "reset_override";
  if (rule.type === "COPY_FROM_DATE") return "copy_rate";
  return targetCount > 1 ? "bulk_rate_change" : "single_rate_change";
}

export function rateChangeDeltas(
  currentEffective: number,
  proposedEffective: number,
): { absoluteDelta: number; percentageDelta: number | null } {
  const absoluteDelta = roundNightlyRate(proposedEffective - currentEffective);
  if (currentEffective === 0) {
    return { absoluteDelta, percentageDelta: proposedEffective === 0 ? 0 : null };
  }
  return {
    absoluteDelta,
    percentageDelta: roundNightlyRate((absoluteDelta / currentEffective) * 100),
  };
}

export type ProposedRateResult =
  | { ok: true; proposedOverrideRate: number | null; proposedEffectiveRate: number }
  | { ok: false; code: string };

export function proposedRateFromRule(
  rule: RateChangeRule,
  baseRate: number,
  currentOverrideRate: number | null,
  sourceEffectiveRate: number | null,
): ProposedRateResult {
  const currentEffective = effectiveNightlyRate(baseRate, currentOverrideRate);

  if (rule.type === "RESET_OVERRIDE") {
    return { ok: true, proposedOverrideRate: null, proposedEffectiveRate: baseRate };
  }

  let proposed: number;
  if (rule.type === "SET_RATE") {
    if (!Number.isFinite(rule.value)) return { ok: false, code: "RATE_CHANGE_UNSUPPORTED" };
    if (rule.value < 0) return { ok: false, code: "RATE_CHANGE_NEGATIVE" };
    if (rule.value > RATE_CHANGE_MAX_NIGHTLY) return { ok: false, code: "RATE_CHANGE_OVER_MAX" };
    proposed = roundNightlyRate(rule.value);
  } else if (rule.type === "PERCENT_INCREASE") {
    if (!Number.isFinite(rule.value) || rule.value < 0 || rule.value > RATE_CHANGE_MAX_PERCENT) {
      return { ok: false, code: "RATE_CHANGE_UNSUPPORTED" };
    }
    proposed = roundNightlyRate(currentEffective * (1 + rule.value / 100));
  } else if (rule.type === "PERCENT_DECREASE") {
    if (!Number.isFinite(rule.value) || rule.value < 0 || rule.value > RATE_CHANGE_MAX_PERCENT) {
      return { ok: false, code: "RATE_CHANGE_UNSUPPORTED" };
    }
    proposed = roundNightlyRate(currentEffective * (1 - rule.value / 100));
  } else if (rule.type === "COPY_FROM_DATE") {
    if (sourceEffectiveRate === null || !Number.isFinite(sourceEffectiveRate)) {
      return { ok: false, code: "RATE_CHANGE_SOURCE_INVALID" };
    }
    proposed = roundNightlyRate(sourceEffectiveRate);
  } else {
    return { ok: false, code: "RATE_CHANGE_UNSUPPORTED" };
  }

  if (proposed < 0) return { ok: false, code: "RATE_CHANGE_NEGATIVE" };
  if (proposed > RATE_CHANGE_MAX_NIGHTLY) return { ok: false, code: "RATE_CHANGE_OVER_MAX" };
  return { ok: true, proposedOverrideRate: proposed, proposedEffectiveRate: proposed };
}

export function validateRateChangeRule(rule: RateChangeRule): string | null {
  if (rule.type === "SET_RATE") {
    if (!Number.isFinite(rule.value)) return "RATE_CHANGE_UNSUPPORTED";
    if (rule.value < 0) return "RATE_CHANGE_NEGATIVE";
    if (rule.value > RATE_CHANGE_MAX_NIGHTLY) return "RATE_CHANGE_OVER_MAX";
    return null;
  }
  if (rule.type === "PERCENT_INCREASE" || rule.type === "PERCENT_DECREASE") {
    if (!Number.isFinite(rule.value) || rule.value < 0 || rule.value > RATE_CHANGE_MAX_PERCENT) {
      return "RATE_CHANGE_UNSUPPORTED";
    }
    return null;
  }
  if (rule.type === "COPY_FROM_DATE") {
    if (!isIsoDate(rule.sourceDate)) return "RATE_CHANGE_SOURCE_INVALID";
    return null;
  }
  if (rule.type === "RESET_OVERRIDE") return null;
  return "RATE_CHANGE_UNSUPPORTED";
}

export function findDuplicateTargets(targets: RateChangeTarget[]): RateChangeTarget[] {
  const seen = new Set<string>();
  const duplicates: RateChangeTarget[] = [];
  for (const target of targets) {
    const key = targetKey(target.ratePlanId, target.date);
    if (seen.has(key)) duplicates.push(target);
    else seen.add(key);
  }
  return duplicates;
}

export function restrictionWarnings(restriction: RateChangeRestrictionContext | null): string[] {
  if (!restriction) return [];
  const warnings: string[] = [];
  if (restriction.stopSell) {
    warnings.push("Stop sell is in effect. The nightly rate can still be changed.");
  }
  if (restriction.closedToArrival) {
    warnings.push("Closed to arrival is in effect. The nightly rate can still be changed.");
  }
  if (restriction.closedToDeparture) {
    warnings.push("Closed to departure is in effect. The nightly rate can still be changed.");
  }
  if (restriction.minStay != null) {
    warnings.push(`Minimum stay of ${restriction.minStay} night(s) is in effect.`);
  }
  if (restriction.maxStay != null) {
    warnings.push(`Maximum stay of ${restriction.maxStay} night(s) is in effect.`);
  }
  return warnings;
}

export type RateChangePreviewInput = {
  targets: RateChangeTarget[];
  rule: RateChangeRule;
  reason?: string | null;
  restaurantId: string;
  plans: Map<string, RateChangePlanSnapshot>;
  overrides: Map<string, RateChangeOverrideSnapshot>;
  restrictions: Map<string, RateChangeRestrictionContext>;
  expectedVersions?: Map<string, string>;
};

function emptyPreviewItem(
  target: RateChangeTarget,
  messages: string[],
  extra?: Partial<RateChangePreviewItem>,
): RateChangePreviewItem {
  return {
    date: target.date,
    ratePlanId: target.ratePlanId,
    ratePlanCode: extra?.ratePlanCode ?? null,
    ratePlanName: extra?.ratePlanName ?? null,
    roomTypeId: extra?.roomTypeId ?? null,
    roomTypeName: extra?.roomTypeName ?? null,
    currency: extra?.currency ?? null,
    baseRate: extra?.baseRate ?? null,
    currentOverrideRate: extra?.currentOverrideRate ?? null,
    currentEffectiveRate: extra?.currentEffectiveRate ?? null,
    proposedOverrideRate: extra?.proposedOverrideRate ?? null,
    proposedEffectiveRate: extra?.proposedEffectiveRate ?? null,
    absoluteDelta: extra?.absoluteDelta ?? null,
    percentageDelta: extra?.percentageDelta ?? null,
    minStay: extra?.minStay ?? null,
    maxStay: extra?.maxStay ?? null,
    closedToArrival: extra?.closedToArrival ?? false,
    closedToDeparture: extra?.closedToDeparture ?? false,
    stopSell: extra?.stopSell ?? false,
    validationStatus: "invalid",
    validationMessages: messages,
    expectedVersion: extra?.expectedVersion ?? ABSENT_CALENDAR_VERSION,
  };
}

export function buildRateChangePreview(input: RateChangePreviewInput): RateChangePreview {
  const reason = normalizeReason(input.reason);
  const items: RateChangePreviewItem[] = [];
  const ruleError = validateRateChangeRule(input.rule);
  const duplicates = new Set(
    findDuplicateTargets(input.targets).map((target) => targetKey(target.ratePlanId, target.date)),
  );

  for (const target of input.targets) {
    const key = targetKey(target.ratePlanId, target.date);
    const plan = input.plans.get(target.ratePlanId);
    const override = input.overrides.get(key);
    const restriction = input.restrictions.get(key) ?? null;
    const expectedVersion = calendarVersionToken(override?.updatedAt);
    const warnings = restrictionWarnings(restriction);

    if (!isIsoDate(target.date)) {
      items.push(emptyPreviewItem(target, ["RATE_CHANGE_INVALID_DATE"], { expectedVersion }));
      continue;
    }

    if (duplicates.has(key)) {
      items.push(emptyPreviewItem(target, ["RATE_CHANGE_DUPLICATE"], { expectedVersion }));
      continue;
    }

    if (ruleError) {
      items.push(emptyPreviewItem(target, [ruleError], { expectedVersion }));
      continue;
    }

    if (!plan || plan.restaurantId !== input.restaurantId) {
      items.push(emptyPreviewItem(target, ["RATE_PLAN_NOT_FOUND"], { expectedVersion }));
      continue;
    }

    const messages: string[] = [];
    if (!plan.active) messages.push("RATE_PLAN_INACTIVE");
    if (
      (plan.validFrom && target.date < plan.validFrom) ||
      (plan.validTo && target.date > plan.validTo)
    ) {
      messages.push("RATE_PLAN_OUT_OF_RANGE");
    }

    let sourceEffective: number | null = null;
    if (input.rule.type === "COPY_FROM_DATE") {
      if (!isIsoDate(input.rule.sourceDate)) {
        messages.push("RATE_CHANGE_SOURCE_INVALID");
      } else if (
        (plan.validFrom && input.rule.sourceDate < plan.validFrom) ||
        (plan.validTo && input.rule.sourceDate > plan.validTo)
      ) {
        messages.push("RATE_CHANGE_SOURCE_INVALID");
      } else {
        const sourceOverride = input.overrides.get(targetKey(plan.id, input.rule.sourceDate));
        sourceEffective = effectiveNightlyRate(plan.baseRate, sourceOverride?.nightlyRate ?? null);
      }
    }

    const proposed = proposedRateFromRule(
      input.rule,
      plan.baseRate,
      override?.nightlyRate ?? null,
      sourceEffective,
    );
    if (!proposed.ok) messages.push(proposed.code);

    const submittedVersion = input.expectedVersions?.get(key);
    if (submittedVersion && submittedVersion !== expectedVersion) {
      messages.push("RATE_CHANGE_STALE");
    }

    const currentEffective = effectiveNightlyRate(plan.baseRate, override?.nightlyRate ?? null);
    const proposedOverride = proposed.ok ? proposed.proposedOverrideRate : null;
    const proposedEffective = proposed.ok ? proposed.proposedEffectiveRate : null;
    const deltas =
      proposedEffective == null ? null : rateChangeDeltas(currentEffective, proposedEffective);

    items.push({
      date: target.date,
      ratePlanId: plan.id,
      ratePlanCode: plan.code,
      ratePlanName: plan.name,
      roomTypeId: plan.roomTypeId,
      roomTypeName: plan.roomTypeName,
      currency: plan.currency,
      baseRate: plan.baseRate,
      currentOverrideRate: override?.nightlyRate ?? null,
      currentEffectiveRate: currentEffective,
      proposedOverrideRate: proposedOverride,
      proposedEffectiveRate: proposedEffective,
      absoluteDelta: deltas?.absoluteDelta ?? null,
      percentageDelta: deltas?.percentageDelta ?? null,
      minStay: restriction?.minStay ?? null,
      maxStay: restriction?.maxStay ?? null,
      closedToArrival: restriction?.closedToArrival ?? false,
      closedToDeparture: restriction?.closedToDeparture ?? false,
      stopSell: restriction?.stopSell ?? false,
      validationStatus: messages.length === 0 ? "valid" : "invalid",
      validationMessages: [...messages, ...warnings],
      expectedVersion,
    });
  }

  return {
    rule: input.rule,
    reason,
    valid: items.length > 0 && items.every((item) => item.validationStatus === "valid"),
    items,
  };
}

export type AtomicApplyDecision =
  | { ok: true; items: RateChangePreviewItem[]; actionType: RateChangeActionType }
  | { ok: false; error: string; items: [] };

/**
 * Shared atomicity rule: if any target is invalid or stale, apply nothing.
 * The SQL RPC implements the same rule inside one transaction.
 */
export function decideAtomicRateChangeApply(preview: RateChangePreview): AtomicApplyDecision {
  if (!preview.valid) {
    const first = preview.items.find((item) => item.validationStatus === "invalid");
    const error =
      first?.validationMessages.find((message) => !message.includes("is in effect")) ??
      "RATE_CHANGE_UNSUPPORTED";
    return { ok: false, error, items: [] };
  }
  return {
    ok: true,
    items: preview.items,
    actionType: resolveRateChangeActionType(preview.rule, preview.items.length),
  };
}

export function historyDeltasForRow(row: {
  previousEffectiveRate: number;
  newEffectiveRate: number;
}): { absoluteDelta: number; percentageDelta: number | null } {
  return rateChangeDeltas(row.previousEffectiveRate, row.newEffectiveRate);
}

export function paginateRateChangeHistory<T>(
  rows: T[],
  page = 1,
  pageSize = RATE_CHANGE_HISTORY_PAGE_SIZE,
): { rows: T[]; page: number; pageSize: number; total: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(
    RATE_CHANGE_HISTORY_MAX_PAGE_SIZE,
    Math.max(1, pageSize),
  );
  const total = rows.length;
  const start = (safePage - 1) * safeSize;
  return {
    rows: rows.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total,
  };
}

export function groupHistoryByOperation(rows: RateChangeHistoryRow[]): RateChangeOperationDetail[] {
  const byOp = new Map<string, RateChangeHistoryRow[]>();
  for (const row of rows) {
    const list = byOp.get(row.operationId) ?? [];
    list.push(row);
    byOp.set(row.operationId, list);
  }
  return [...byOp.entries()].map(([operationId, events]) => ({
    operationId,
    actionType: events[0]?.actionType ?? "single_rate_change",
    source: events[0]?.source ?? "rate_revenue",
    reason: events[0]?.reason ?? null,
    actorMembershipId: events[0]?.actorMembershipId ?? null,
    createdAt: events[0]?.createdAt ?? "",
    restaurantId: "",
    events,
    affectedDates: [...new Set(events.map((event) => event.stayDate))],
    affectedRatePlanIds: [...new Set(events.map((event) => event.ratePlanId))],
    affectedRoomTypeIds: [...new Set(events.map((event) => event.roomTypeId))],
  }));
}
