/**
 * Night Audit / End of Day server functions.
 *
 * Permissions gate each action. The business date always comes from the property row,
 * never from the browser; every id is revalidated against the property before
 * it is used. The close itself runs inside a locked SECURITY DEFINER function.
 *
 * End of Day is a control center: it reads source modules, classifies every
 * finding as a blocker or information, persists blockers on the run, and closes
 * the date through close_business_date. It never posts, checks in, checks out,
 * settles, or changes housekeeping.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit, callerMembership } from "@/core/lib/workforce.server";
import { requirePmsPackage } from "./pms-package.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import {
  hasEffectivePermission,
  requirePmsActor,
  resolveEffectivePermissions,
} from "./pms-permissions.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { NA1_STALE_BUSINESS_DATE, nextBusinessDate } from "./na1";
import {
  FINANCIAL_UNAVAILABLE_MESSAGE,
  presentNightAuditFinancials,
  type DrawerRow,
  type NightAuditFinancialReconciliation,
  type TaxCurrencyRow,
} from "./night-audit-financial";
import { loadNightAuditFinancialReconciliation } from "./night-audit-financial.server";
import {
  OPERATIONAL_UNAVAILABLE_MESSAGE,
  presentNightAuditOperations,
  type DayActivitySummary,
  type NightAuditOperationalReconciliation,
} from "./night-audit-operational";
import { loadNightAuditOperationalReconciliation } from "./night-audit-operational.server";
import { exceptionSyncKey, planExceptionSync } from "./night-audit-exceptions";
import { selectAll } from "./night-audit-read";
import {
  canRetryOtbSnapshot,
  canSyncRunExceptions,
  closedByThisRequest,
  FISCAL_OVERRIDE_REASON_CATEGORIES,
  fiscalStatusForException,
  isFiscalOverrideableException,
  persistedCloseFacts,
  type PersistedCloseRow,
  type FiscalOverride,
  type WarningReview,
  historyRange,
  historySearchDates,
  presentExceptionMessage,
  presentRunSummary,
  type HistoryPageSize,
} from "./night-audit-workflow";
import type { OtbCaptureResult } from "./revenue/demand-snapshot";
import {
  NIGHT_AUDIT_INVALID_WINDOW,
  NIGHT_AUDIT_OUTSIDE_WINDOW,
  evaluateNightAuditWindow,
  nightAuditWindowConfig,
  outsideWindowCloseRecord,
  type NightAuditWindowState,
  type OutsideWindowClose,
} from "./night-audit-window";
import { nightAuditError, type AreaCheck, type AuditFinance } from "./nightaudit.server";
import {
  END_OF_DAY_STEP_IDS,
  closeBlockedCopy,
  conditionFromIssue,
  endOfDayAuditStatus,
  endOfDayDomains,
  endOfDayPolicyFromBlockers,
  endOfDaySteps,
  informationItems,
  openBlockers,
  persistedBlockerRows,
  sortConditions,
  unavailableSourceConditions,
  type EndOfDayAuditStatus,
  type EndOfDayCondition,
  type EndOfDayDomainView,
  type EndOfDayPolicy,
  type EndOfDaySource,
  type EndOfDayStepId,
  type EndOfDayStepView,
} from "./night-audit-steps";
import { legacyAuditFinance, type DayFinance } from "./night-audit-day-finance";
import { parseBusinessDateBlockers } from "./pms-property-setup-card1";

const idSchema = z.string().uuid();
const stepSchema = z.enum(END_OF_DAY_STEP_IDS as [EndOfDayStepId, ...EndOfDayStepId[]]);
const NOTE_MAX = 500;

/** A stored exception row as History shows it. */
export interface AuditException {
  id: string;
  exceptionType: string;
  severity: "warning" | "blocking";
  referenceType: string | null;
  referenceId: string | null;
  message: string;
  status: "open" | "resolved" | "ignored";
  resolvedAt: string | null;
  resolutionNote: string | null;
  /** Detected at. */
  createdAt: string | null;
  /** The ACTIVE fiscal-only close exemption. The underlying source remains open. */
  fiscalOverride: FiscalOverride | null;
  /** Every override event ever authorized for this exception row, oldest first. History only. */
  fiscalOverrideHistory: FiscalOverride[];
  /** Pre-redesign warning reviews for this row. History only; no new reviews are written. */
  warningReviewHistory?: WarningReview[];
}

export type NightAuditOtbState = "captured" | "not_captured" | "unknown";

export interface NightAuditRunRow {
  id: string;
  businessDate: string;
  status: "open" | "ready" | "closed" | "failed" | "superseded";
  startedAt: string;
  closedAt: string | null;
  startedBy: string | null;
  closedBy: string | null;
  summary: AuditSummary | null;
  notes?: string | null;
  otb?: NightAuditOtbState;
  currentStep?: EndOfDayStepId | null;
  progressUpdatedAt?: string | null;
}

/** What close wrote. Older summaries omit later fields; nothing is recomputed for History. */
export interface AuditSummary {
  finance?: AuditFinance;
  /** Pre-redesign warning count. Always 0 on End of Day closes. */
  warnings?: number;
  blockingResolved?: number;
  inHouse?: number;
  overstays?: number;
  checks?: AreaCheck[];
  previousBusinessDate?: string;
  nextBusinessDate?: string;
  financialBlockerCount?: number;
  financialWarningCount?: number;
  openDrawerCount?: number;
  fiscalProblemCount?: number;
  fiscalOverrideCount?: number;
  taxByCurrency?: Array<{ currency: string; tax: number; serviceCharge: number }>;
  operationalBlockerCount?: number;
  operationalWarningCount?: number;
  unresolvedArrivalCount?: number;
  overstayCount?: number;
  roomConflictCount?: number;
  overbookingIssueCount?: number;
  /** Set only when an authorized user closed outside the configured Night Audit Window. */
  nightAuditWindow?: OutsideWindowClose | null;
  /** Set only when Business Date Recovery safely supersedes an open run. */
  businessDateRecovery?: {
    superseded: true;
    adjustmentId: string;
    oldBusinessDate: string;
    newBusinessDate: string;
    reason: string;
    supersededByMembershipId: string;
    supersededAt: string;
  };
  /** Present on End of Day closes (nine-step workflow). */
  endOfDay?: EndOfDaySummary;
}

export type EndOfDaySummary = {
  version: 2;
  steps: Array<{ id: EndOfDayStepId; status: string; blockerCount: number; informationCount: number }>;
  /** Blocker rows detected on this run and cleared at source before close. */
  blockersResolved: number;
  informationCount: number;
  policy: EndOfDayPolicy;
  cashier: {
    openShifts: number;
    closedShifts: number;
    expected: number | null;
    counted: number | null;
    variance: number | null;
  };
  dayFinance: DayFinance | null;
  fiscal: { overrides: number; blockers: number };
  groupBlockRelease?: "released" | "none" | "failed";
};

export type EndOfDayAccess = {
  canStart: boolean;
  canClose: boolean;
  canOverrideWindow: boolean;
  canAuthorizeFiscal: boolean;
  canRetryOtb: boolean;
  canRecover: boolean;
  financialDetail: boolean;
  operationalDetail: boolean;
};

export type EndOfDayLastClose = {
  runId: string;
  businessDate: string;
  nextBusinessDate: string;
  startedAt: string;
  startedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  summary: AuditSummary | null;
  notes: string | null;
  otb: NightAuditOtbState;
  canRetryOtb: boolean;
};

/** Everything the End of Day workspace renders. One read; no run is created. */
export type NightAuditWorkspaceData = {
  businessDate: string;
  nextBusinessDate: string;
  persistedBusinessDate: string | null;
  currency: string;
  timezone: string;
  checkedAt: string;
  window: NightAuditWindowState;
  policy: EndOfDayPolicy;
  run: NightAuditRunRow | null;
  auditStatus: EndOfDayAuditStatus;
  evaluation: { failed: boolean; unavailable: EndOfDaySource[]; message: string | null };
  steps: EndOfDayStepView[];
  domains: EndOfDayDomainView[];
  conditions: EndOfDayCondition[];
  blockerCount: number;
  informationCount: number;
  dayActivity: DayActivitySummary;
  inHouseCount: number | null;
  folios: NightAuditFinancialReconciliation["folioSummary"] | null;
  cashier: { access: "detail" | "summary"; shifts: DrawerRow[] } | null;
  reconcile: {
    access: "detail" | "summary";
    dayFinance: DayFinance | null;
    taxSummary: TaxCurrencyRow[];
    fiscalConfigured: boolean;
    fiscal: { registered: number; pending: number; problems: number; overridden: number };
  } | null;
  access: EndOfDayAccess;
  lastClosed: EndOfDayLastClose | null;
};

/* ----------------------------------------------------------------- helpers */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function loadProperty(admin: Admin, restaurantId: string) {
  const { data } = await admin
    .from("restaurants")
    .select("id, timezone, currency_code, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("Property not found.");
  const row = data as {
    id: string;
    timezone: string;
    currency_code: string;
    business_date: string | null;
  };
  const persistedBusinessDate = row.business_date ? row.business_date.slice(0, 10) : null;
  return {
    timezone: row.timezone,
    currency: row.currency_code,
    /** Resolved clock: persisted date, or property-local today when the column is null. */
    businessDate: resolvePropertyBusinessDate(persistedBusinessDate, row.timezone),
    /** Null until the first close. Never a caller-supplied date. */
    persistedBusinessDate,
  };
}

/**
 * Night Audit Window and the property End of Day policy. An unreadable config uses the
 * setup default window (never "always open") and the default policy (open shifts block).
 */
async function loadEndOfDayConfig(admin: Admin, restaurantId: string) {
  const { data, error } = await admin
    .from("restaurants")
    .select("business_date_config, business_date_blockers")
    .eq("id", restaurantId)
    .maybeSingle();
  const row = error
    ? null
    : (data as { business_date_config?: unknown; business_date_blockers?: unknown } | null);
  return {
    window: nightAuditWindowConfig(row?.business_date_config),
    policy: endOfDayPolicyFromBlockers(parseBusinessDateBlockers(row?.business_date_blockers)),
  };
}

/** Same financial read every step shows. Failure stays unavailable and never looks ready. */
async function readFinancialReconciliation(
  admin: Admin,
  restaurantId: string,
  businessDate: string,
  timezone: string,
  currency: string,
): Promise<
  { ok: true; result: NightAuditFinancialReconciliation } | { ok: false; status: "unavailable" }
> {
  try {
    return {
      ok: true,
      result: await loadNightAuditFinancialReconciliation(
        admin,
        restaurantId,
        businessDate,
        timezone,
        currency,
      ),
    };
  } catch {
    return { ok: false, status: "unavailable" };
  }
}

/** Same operational read every step shows. Failure stays unavailable. */
async function readOperationalReconciliation(
  admin: Admin,
  restaurantId: string,
  businessDate: string,
  timezone: string,
): Promise<
  { ok: true; result: NightAuditOperationalReconciliation } | { ok: false; status: "unavailable" }
> {
  try {
    return {
      ok: true,
      result: await loadNightAuditOperationalReconciliation(
        admin,
        restaurantId,
        businessDate,
        timezone,
      ),
    };
  } catch {
    return { ok: false, status: "unavailable" };
  }
}

type Evaluation = {
  financial: Awaited<ReturnType<typeof readFinancialReconciliation>>;
  operational: Awaited<ReturnType<typeof readOperationalReconciliation>>;
  unavailable: EndOfDaySource[];
  /** Unredacted. Used for persistence and the close gate only. */
  conditions: EndOfDayCondition[];
};

function conditionsFor(
  financial: NightAuditFinancialReconciliation | null,
  operational: NightAuditOperationalReconciliation | null,
  unavailable: readonly EndOfDaySource[],
  policy: EndOfDayPolicy,
): EndOfDayCondition[] {
  const rows: EndOfDayCondition[] = [];
  const seen = new Set<string>();
  const push = (row: EndOfDayCondition | null) => {
    if (!row || seen.has(row.key)) return;
    seen.add(row.key);
    rows.push(row);
  };
  for (const issue of operational?.issues ?? []) push(conditionFromIssue(issue, policy));
  for (const issue of financial?.issues ?? []) push(conditionFromIssue(issue, policy));
  for (const row of unavailableSourceConditions(unavailable)) push(row);
  return rows;
}

/** One evaluation for the workspace and the close gate. Reads only. */
async function evaluateEndOfDay(
  admin: Admin,
  restaurantId: string,
  businessDate: string,
  property: { timezone: string; currency: string },
  policy: EndOfDayPolicy,
): Promise<Evaluation> {
  const [financial, operational] = await Promise.all([
    readFinancialReconciliation(admin, restaurantId, businessDate, property.timezone, property.currency),
    readOperationalReconciliation(admin, restaurantId, businessDate, property.timezone),
  ]);
  const unavailable: EndOfDaySource[] = [
    ...(operational.ok ? [] : (["operational"] as const)),
    ...(financial.ok ? [] : (["financial"] as const)),
  ];
  return {
    financial,
    operational,
    unavailable,
    conditions: conditionsFor(
      financial.ok ? financial.result : null,
      operational.ok ? operational.result : null,
      unavailable,
      policy,
    ),
  };
}

/** Analytics follow-up after a completed close. Never throws. */
async function captureOtbAfterClose(
  supabaseAdmin: Admin,
  restaurantId: string,
  asOfBusinessDate: string,
): Promise<OtbCaptureResult> {
  const { captureOtbSnapshotAfterClose } = await import("./revenue/demand-snapshot.server");
  return captureOtbSnapshotAfterClose(supabaseAdmin, restaurantId, asOfBusinessDate);
}

/** End of Day audit events reuse restaurant_staff_audit_log. A failed write never fails the action. */
async function auditEndOfDay(
  admin: Admin,
  context: unknown,
  restaurantId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  try {
    await audit(admin, {
      restaurantId,
      actorUserId: (context as { userId: string }).userId,
      targetUserId: null,
      action,
      metadata: { section: "night_audit", ...metadata },
    });
  } catch (error) {
    console.error("[night-audit] audit", error instanceof Error ? error.message : error);
  }
}

type ExceptionRow = {
  id: string;
  exception_type: string;
  severity: "warning" | "blocking";
  reference_type: string | null;
  reference_id: string | null;
  message: string;
  status: "open" | "resolved" | "ignored";
  resolved_at: string | null;
  resolution_note: string | null;
  created_at?: string | null;
};

type FiscalOverrideRow = {
  id: string;
  exception_id: string;
  fiscal_status: string;
  fiscal_reference: string | null;
  reason: string;
  reason_category: FiscalOverride["reasonCategory"];
  overridden_by_membership_id: string;
  overridden_at: string;
  invalidated_at: string | null;
  invalidated_reason: string | null;
};

const FISCAL_OVERRIDE_COLUMNS =
  "id, exception_id, fiscal_status, fiscal_reference, reason, reason_category, overridden_by_membership_id, overridden_at, invalidated_at, invalidated_reason";

async function exceptionRowsForRun(admin: Admin, runId: string): Promise<ExceptionRow[]> {
  return selectAll<ExceptionRow>((from, to) =>
    admin
      .from("night_audit_exceptions")
      .select("*")
      .eq("night_audit_run_id", runId)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Only the ACTIVE override per exception. This is what the close gate and current-state UI use. */
async function fiscalOverridesForRun(
  admin: Admin,
  restaurantId: string,
  runId: string,
): Promise<Map<string, FiscalOverrideRow>> {
  const rows = await selectAll<FiscalOverrideRow>((from, to) =>
    admin
      .from("night_audit_fiscal_overrides")
      .select(FISCAL_OVERRIDE_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("night_audit_run_id", runId)
      .is("invalidated_at", null)
      .order("overridden_at", { ascending: true })
      .range(from, to),
  );
  // The partial unique index guarantees at most one active row per exception_id.
  return new Map(rows.map((row) => [row.exception_id, row]));
}

/** Every override event ever authorized on this run, active or invalidated. History display only. */
async function fiscalOverrideHistoryForRun(
  admin: Admin,
  restaurantId: string,
  runId: string,
): Promise<Map<string, FiscalOverrideRow[]>> {
  const rows = await selectAll<FiscalOverrideRow>((from, to) =>
    admin
      .from("night_audit_fiscal_overrides")
      .select(FISCAL_OVERRIDE_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .eq("night_audit_run_id", runId)
      .order("overridden_at", { ascending: true })
      .range(from, to),
  );
  const byException = new Map<string, FiscalOverrideRow[]>();
  for (const row of rows) {
    const list = byException.get(row.exception_id) ?? [];
    list.push(row);
    byException.set(row.exception_id, list);
  }
  return byException;
}

type WarningReviewRow = {
  id: string;
  exception_id: string;
  reviewed_by_membership_id: string;
  reviewed_at: string;
  review_note: string | null;
  invalidated_at: string | null;
  invalidated_reason: string | null;
};

/** Pre-redesign warning reviews. Read for History only; the table is never written. */
async function warningReviewHistoryForRun(
  admin: Admin,
  restaurantId: string,
  runId: string,
): Promise<Map<string, WarningReviewRow[]>> {
  try {
    const rows = await selectAll<WarningReviewRow>((from, to) =>
      admin
        .from("night_audit_warning_reviews")
        .select(
          "id, exception_id, reviewed_by_membership_id, reviewed_at, review_note, invalidated_at, invalidated_reason",
        )
        .eq("restaurant_id", restaurantId)
        .eq("night_audit_run_id", runId)
        .order("reviewed_at", { ascending: true })
        .range(from, to),
    );
    const byException = new Map<string, WarningReviewRow[]>();
    for (const row of rows) {
      const list = byException.get(row.exception_id) ?? [];
      list.push(row);
      byException.set(row.exception_id, list);
    }
    return byException;
  } catch {
    return new Map();
  }
}

const RESOLVED_NOTE = "Cleared automatically — the underlying issue was fixed.";
const LEGACY_INFORMATION_NOTE =
  "No longer tracked — informational items do not block End of Day.";

/**
 * Persist this evaluation's blockers on the run. Information is never stored.
 * A legacy open warning row resolves with a note; it is never deleted. A closed
 * run's rows are frozen history and are not touched.
 */
async function syncRunExceptions(
  admin: Admin,
  restaurantId: string,
  runId: string,
  conditions: readonly EndOfDayCondition[],
): Promise<void> {
  const { data: current, error: currentError } = await admin
    .from("night_audit_runs")
    .select("status")
    .eq("id", runId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || !canSyncRunExceptions((current as { status: string }).status)) return;

  const existingRows = await exceptionRowsForRun(admin, runId);
  const plan = planExceptionSync(
    existingRows.map((row) => ({
      id: row.id,
      exceptionType: row.exception_type,
      severity: row.severity,
      referenceId: row.reference_id,
      message: row.message,
      status: row.status,
    })),
    persistedBlockerRows(conditions),
  );

  if (plan.inserts.length > 0) {
    const inserted = await admin.from("night_audit_exceptions").insert(
      plan.inserts.map((row) => ({
        restaurant_id: restaurantId,
        night_audit_run_id: runId,
        exception_type: row.exceptionType,
        severity: row.severity,
        reference_type: row.referenceType,
        reference_id: row.referenceId,
        message: row.message,
      })),
    );
    // A concurrent recheck inserted the same row first: the next read sees it.
    if (inserted.error && !/duplicate key/i.test(String(inserted.error.message))) {
      throw inserted.error;
    }
  }

  for (const row of plan.updates) {
    const updated = await admin
      .from("night_audit_exceptions")
      .update({
        severity: row.severity,
        message: row.message,
        ...(row.reopen ? { status: "open", resolved_at: null, resolution_note: null } : {}),
      })
      .eq("id", row.id);
    if (updated.error) throw updated.error;
  }

  if (plan.resolveIds.length > 0) {
    const severityById = new Map(existingRows.map((row) => [row.id, row.severity]));
    const now = new Date().toISOString();
    for (const [severity, note] of [
      ["blocking", RESOLVED_NOTE],
      ["warning", LEGACY_INFORMATION_NOTE],
    ] as const) {
      const ids = plan.resolveIds.filter((id) => severityById.get(id) === severity);
      if (ids.length === 0) continue;
      const resolved = await admin
        .from("night_audit_exceptions")
        .update({ status: "resolved", resolved_at: now, resolution_note: note })
        .in("id", ids);
      if (resolved.error) throw resolved.error;
    }

    // The source condition is gone: an active fiscal override for these exact
    // exceptions is invalidated. A later reopen needs a fresh authorization.
    const invalidated = await admin
      .from("night_audit_fiscal_overrides")
      .update({ invalidated_at: now, invalidated_reason: "Source fiscal condition resolved." })
      .in("exception_id", plan.resolveIds)
      .is("invalidated_at", null);
    if (invalidated.error) throw invalidated.error;

    // Legacy warning reviews on resolved rows are closed out the same way.
    const invalidatedReviews = await admin
      .from("night_audit_warning_reviews")
      .update({ invalidated_at: now, invalidated_reason: "Source warning condition resolved." })
      .in("exception_id", plan.resolveIds)
      .is("invalidated_at", null);
    if (invalidatedReviews.error) throw invalidatedReviews.error;
  }
}

function toFiscalOverride(row: FiscalOverrideRow, names: ReadonlyMap<string, string>): FiscalOverride {
  return {
    id: row.id,
    fiscalStatus: row.fiscal_status,
    fiscalReference: row.fiscal_reference,
    reason: row.reason,
    reasonCategory: row.reason_category,
    overriddenBy: names.get(row.overridden_by_membership_id) ?? null,
    overriddenAt: row.overridden_at,
    invalidatedAt: row.invalidated_at,
    invalidatedReason: row.invalidated_reason,
  };
}

function toWarningReview(row: WarningReviewRow, names: ReadonlyMap<string, string>): WarningReview {
  const reviewerName = names.get(row.reviewed_by_membership_id) ?? null;
  return {
    id: row.id,
    exceptionId: row.exception_id,
    reviewedBy: reviewerName,
    reviewerName,
    reviewedByMembershipId: row.reviewed_by_membership_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    invalidatedAt: row.invalidated_at,
    invalidatedReason: row.invalidated_reason,
  };
}

/** Attach persisted exception ids and active fiscal overrides to live blockers. */
function attachPersisted(
  conditions: readonly EndOfDayCondition[],
  rows: readonly ExceptionRow[],
  overrides: ReadonlyMap<string, FiscalOverrideRow>,
  names: ReadonlyMap<string, string>,
): EndOfDayCondition[] {
  const byKey = new Map(
    rows
      .filter((row) => row.status === "open")
      .map((row) => [exceptionSyncKey(row.exception_type, row.reference_id), row]),
  );
  return conditions.map((condition) => {
    if (condition.kind !== "blocker") return condition;
    const row = byKey.get(condition.key);
    if (!row) return condition;
    const override = overrides.get(row.id);
    return {
      ...condition,
      exceptionId: row.id,
      fiscalOverride:
        override && condition.fiscalOverrideable
          ? {
              reason: override.reason,
              reasonCategory: override.reason_category,
              overriddenBy: names.get(override.overridden_by_membership_id) ?? null,
              overriddenAt: override.overridden_at,
            }
          : null,
    };
  });
}

/** OTB rows captured as of each closed business date. A read failure is unknown, not missing. */
async function otbStates(
  admin: Admin,
  restaurantId: string,
  runs: ReadonlyArray<{ business_date: string; status: string }>,
): Promise<Map<string, NightAuditOtbState>> {
  const states = new Map<string, NightAuditOtbState>();
  await Promise.all(
    runs
      .filter((run) => run.status === "closed")
      .map(async (run) => {
        const date = run.business_date.slice(0, 10);
        const { count, error } = await admin
          .from("hotel_revenue_otb_snapshots")
          .select("as_of_business_date", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .eq("as_of_business_date", date);
        states.set(date, error ? "unknown" : (count ?? 0) > 0 ? "captured" : "not_captured");
      }),
  );
  return states;
}

async function staffNames(admin: Admin, restaurantId: string, membershipIds: string[]) {
  const names = new Map<string, string>();
  const ids = Array.from(new Set(membershipIds.filter(Boolean)));
  if (ids.length === 0) return names;
  const { data: members } = await admin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  if (memberRows.length === 0) return names;
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in(
      "id",
      memberRows.map((m) => m.user_id),
    );
  const profileRows = (profiles ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>;
  for (const m of memberRows) {
    const p = profileRows.find((x) => x.id === m.user_id);
    const label = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
    names.set(m.id, label || p?.email || "Staff");
  }
  return names;
}

/**
 * Effective grants for this caller. detailRole is a data-shaping label for the
 * reconcilers' redaction (money, guest names); it never authorizes an action.
 */
async function nightAuditActorFlags(
  context: Parameters<typeof resolveEffectivePermissions>[0],
  restaurantId: string,
) {
  const resolved = await resolveEffectivePermissions(context, restaurantId);
  const has = (code: (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS]) =>
    hasEffectivePermission(resolved, code);
  const financial = has(PMS_PERMISSIONS.CASHIERING_VIEW);
  const operational = has(PMS_PERMISSIONS.FRONT_OFFICE_VIEW) || has(PMS_PERMISSIONS.RESERVATION_VIEW);
  const detailRole =
    financial && operational ? "owner" : financial ? "cashier" : operational ? "receptionist" : "housekeeper";
  return {
    financial,
    operational,
    detailRole,
    canRun: has(PMS_PERMISSIONS.NIGHT_AUDIT_RUN),
    canException: has(PMS_PERMISSIONS.NIGHT_AUDIT_EXCEPTION_EDIT),
    canClose: has(PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE),
    canOverrideWindow: has(PMS_PERMISSIONS.NIGHT_AUDIT_WINDOW_OVERRIDE),
    canAuthorizeFiscal: has(PMS_PERMISSIONS.NIGHT_AUDIT_FISCAL_AUTHORIZE),
    canRecover: has(PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE),
  };
}

async function requireNightAuditView(
  context: Parameters<typeof resolveEffectivePermissions>[0],
  restaurantId: string,
) {
  return requirePmsActor(context, restaurantId, PMS_PERMISSIONS.NIGHT_AUDIT_VIEW);
}

type LiveRunRecord = {
  id: string;
  business_date: string;
  status: NightAuditRunRow["status"];
  started_at: string;
  closed_at: string | null;
  started_by_membership_id: string | null;
  closed_by_membership_id: string | null;
  summary: unknown;
  notes: string | null;
  current_step?: string | null;
  progress_updated_at?: string | null;
};

/** The live (non-superseded) run for one date, or null. Never creates one. */
async function liveRunForDate(admin: Admin, restaurantId: string, businessDate: string) {
  const { data, error } = await admin
    .from("night_audit_runs")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("business_date", businessDate)
    .neq("status", "superseded")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw nightAuditError(error.message);
  return (data as LiveRunRecord | null) ?? null;
}

function currentStepOf(value: unknown): EndOfDayStepId | null {
  return typeof value === "string" && (END_OF_DAY_STEP_IDS as string[]).includes(value)
    ? (value as EndOfDayStepId)
    : null;
}

export const getPropertyBusinessDate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await callerMembership(context as never, data.restaurantId);
    await requirePmsPackage(data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadProperty(supabaseAdmin, data.restaurantId);
  });

/* --------------------------------------------------------------- workspace */

/**
 * The End of Day workspace. Viewing never creates a run. When a run exists and
 * the caller may run End of Day, this evaluation also re-syncs the run's
 * blockers (Recheck). Information is computed live and never stored.
 */
export const getNightAuditWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditWorkspaceData> => {
    await requireNightAuditView(context as never, data.restaurantId);
    const flags = await nightAuditActorFlags(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);
    const config = await loadEndOfDayConfig(supabaseAdmin, data.restaurantId);
    const checkedAt = new Date().toISOString();
    const businessDate = property.businessDate;

    let run = await liveRunForDate(supabaseAdmin, data.restaurantId, businessDate);

    let evaluation: Evaluation | null = null;
    let evaluationMessage: string | null = null;
    try {
      evaluation = await evaluateEndOfDay(
        supabaseAdmin,
        data.restaurantId,
        businessDate,
        property,
        config.policy,
      );
    } catch (error) {
      evaluationMessage = error instanceof Error ? error.message : "End of Day could not be evaluated.";
    }

    let rows: ExceptionRow[] = [];
    let overrides = new Map<string, FiscalOverrideRow>();
    if (run && evaluation) {
      const live = run.status === "open" || run.status === "ready";
      // A failed source read never syncs, so a real blocker cannot auto-resolve.
      if (live && flags.canRun && evaluation.unavailable.length === 0) {
        try {
          await syncRunExceptions(supabaseAdmin, data.restaurantId, run.id, evaluation.conditions);
        } catch (error) {
          evaluationMessage =
            error instanceof Error ? error.message : "End of Day blockers could not be saved.";
        }
      }
      rows = await exceptionRowsForRun(supabaseAdmin, run.id);
      overrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, run.id);
    }

    const overrideNames = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      [...overrides.values()].map((row) => row.overridden_by_membership_id),
    );

    // Display copy is shaped by the caller's grants; keys match the raw conditions.
    const displayConditions = evaluation
      ? sortConditions(
          attachPersisted(
            conditionsFor(
              evaluation.financial.ok
                ? presentNightAuditFinancials(evaluation.financial.result, flags.detailRole)
                : null,
              evaluation.operational.ok
                ? presentNightAuditOperations(evaluation.operational.result, flags.detailRole)
                : null,
              evaluation.unavailable,
              config.policy,
            ),
            rows,
            overrides,
            overrideNames,
          ),
        )
      : unavailableSourceConditions(["operational", "financial"]);
    const blockerCount = openBlockers(displayConditions).length;

    if (run && evaluation && flags.canRun && (run.status === "open" || run.status === "ready")) {
      const nextStatus = blockerCount === 0 && evaluation.unavailable.length === 0 ? "ready" : "open";
      if (nextStatus !== run.status) {
        await supabaseAdmin
          .from("night_audit_runs")
          .update({ status: nextStatus })
          .eq("id", run.id)
          .in("status", ["open", "ready"]);
        run = { ...run, status: nextStatus };
      }
    }

    const { data: lastClosedRow } = await supabaseAdmin
      .from("night_audit_runs")
      .select(RUN_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "closed")
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastClosedRaw = (lastClosedRow as RunRecord | null) ?? null;

    const names = await staffNames(supabaseAdmin, data.restaurantId, [
      run?.started_by_membership_id ?? "",
      run?.closed_by_membership_id ?? "",
      lastClosedRaw?.started_by_membership_id ?? "",
      lastClosedRaw?.closed_by_membership_id ?? "",
    ]);
    const lastClosedOtb: NightAuditOtbState | null = lastClosedRaw
      ? ((
          await otbStates(supabaseAdmin, data.restaurantId, [
            { business_date: lastClosedRaw.business_date, status: "closed" },
          ])
        ).get(lastClosedRaw.business_date.slice(0, 10)) ?? "unknown")
      : null;
    const lastClosedSummary = lastClosedRaw
      ? presentRunSummary((lastClosedRaw.summary as AuditSummary | null) ?? null, flags.detailRole)
      : null;

    const financialResult = evaluation?.financial.ok
      ? presentNightAuditFinancials(evaluation.financial.result, flags.detailRole)
      : null;
    const operationalResult = evaluation?.operational.ok ? evaluation.operational.result : null;
    const runStatus = run?.status ?? null;
    const fiscalRows = financialResult?.fiscal ?? [];

    return {
      businessDate,
      nextBusinessDate: nextBusinessDate(businessDate),
      persistedBusinessDate: property.persistedBusinessDate,
      currency: property.currency,
      timezone: property.timezone,
      checkedAt,
      window: evaluateNightAuditWindow({
        ...config.window,
        timezone: property.timezone,
        canOverride: flags.canOverrideWindow,
      }),
      policy: config.policy,
      run: run
        ? {
            id: run.id,
            businessDate: run.business_date,
            status: run.status,
            startedAt: run.started_at,
            closedAt: run.closed_at,
            startedBy: run.started_by_membership_id
              ? (names.get(run.started_by_membership_id) ?? null)
              : null,
            closedBy: run.closed_by_membership_id
              ? (names.get(run.closed_by_membership_id) ?? null)
              : null,
            summary: presentRunSummary((run.summary as AuditSummary | null) ?? null, flags.detailRole),
            notes: run.notes ?? null,
            currentStep: currentStepOf(run.current_step),
            progressUpdatedAt: run.progress_updated_at ?? null,
          }
        : null,
      auditStatus: endOfDayAuditStatus({
        runStatus,
        evaluationFailed: evaluation == null,
        blockerCount,
      }),
      evaluation: {
        failed: evaluation == null,
        unavailable: evaluation?.unavailable ?? ["operational", "financial"],
        message: evaluationMessage,
      },
      steps: endOfDaySteps({ runStatus, conditions: displayConditions }),
      domains: endOfDayDomains(displayConditions),
      conditions: displayConditions,
      blockerCount,
      informationCount: informationItems(displayConditions).length,
      dayActivity: operationalResult?.dayActivity ?? { state: "unavailable" },
      inHouseCount: operationalResult?.summary.inHouseCount ?? null,
      folios: financialResult?.folioSummary ?? null,
      cashier: financialResult ? { access: financialResult.access, shifts: financialResult.drawers } : null,
      reconcile: financialResult
        ? {
            access: financialResult.access,
            dayFinance: financialResult.dayFinance,
            taxSummary: financialResult.taxSummary,
            fiscalConfigured: financialResult.fiscalConfigured,
            fiscal: {
              registered: fiscalRows.filter((row) => row.status === "pass" || row.status === "info").length,
              pending: fiscalRows.filter((row) => row.fiscalStatus === "PENDING").length,
              problems: fiscalRows.filter((row) => row.status === "blocker").length,
              overridden: displayConditions.filter((row) => row.fiscalOverride != null).length,
            },
          }
        : null,
      access: {
        canStart: flags.canRun,
        canClose: flags.canClose,
        canOverrideWindow: flags.canOverrideWindow,
        canAuthorizeFiscal: flags.canAuthorizeFiscal,
        canRetryOtb: flags.canException,
        canRecover: flags.canRecover,
        financialDetail: flags.financial,
        operationalDetail: flags.operational,
      },
      lastClosed: lastClosedRaw
        ? {
            runId: lastClosedRaw.id,
            businessDate: lastClosedRaw.business_date.slice(0, 10),
            nextBusinessDate:
              lastClosedSummary?.nextBusinessDate ?? nextBusinessDate(lastClosedRaw.business_date.slice(0, 10)),
            startedAt: lastClosedRaw.started_at,
            startedBy: lastClosedRaw.started_by_membership_id
              ? (names.get(lastClosedRaw.started_by_membership_id) ?? null)
              : null,
            closedAt: lastClosedRaw.closed_at,
            closedBy: lastClosedRaw.closed_by_membership_id
              ? (names.get(lastClosedRaw.closed_by_membership_id) ?? null)
              : null,
            summary: lastClosedSummary,
            notes: lastClosedRaw.notes ?? null,
            otb: lastClosedOtb ?? "unknown",
            canRetryOtb:
              flags.canException &&
              lastClosedOtb === "not_captured" &&
              canRetryOtbSnapshot({
                runStatus: "closed",
                runBusinessDate: lastClosedRaw.business_date.slice(0, 10),
                persistedBusinessDate: property.persistedBusinessDate,
              }),
          }
        : null,
    };
  });

/* ------------------------------------------------------------ start/resume */

/**
 * Start End of Day for the current business date, or resume the run that
 * already exists. Concurrent starts converge on one run: the partial unique
 * index allows one live run per date and a losing insert re-reads the winner.
 */
export const startNightAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string; expectedBusinessDate?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        expectedBusinessDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; runId: string; resumed: boolean } | { ok: false; message: string }
    > => {
      const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.NIGHT_AUDIT_RUN);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const property = await loadProperty(supabaseAdmin, data.restaurantId);
      if (data.expectedBusinessDate && data.expectedBusinessDate !== property.businessDate) {
        return { ok: false, message: NA1_STALE_BUSINESS_DATE };
      }
      const existing = await liveRunForDate(supabaseAdmin, data.restaurantId, property.businessDate);
      if (existing) return { ok: true, runId: existing.id, resumed: true };

      const now = new Date().toISOString();
      const inserted = await supabaseAdmin
        .from("night_audit_runs")
        .insert({
          restaurant_id: data.restaurantId,
          business_date: property.businessDate,
          status: "open",
          started_by_membership_id: me.id,
          current_step: "prepare",
          progress_updated_at: now,
        } as never)
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (!/duplicate key/i.test(inserted.error.message)) {
          return { ok: false, message: nightAuditError(inserted.error.message).message };
        }
        const winner = await liveRunForDate(supabaseAdmin, data.restaurantId, property.businessDate);
        if (!winner) return { ok: false, message: "End of Day could not be started. Try again." };
        return { ok: true, runId: winner.id, resumed: true };
      }
      const runId = (inserted.data as { id: string }).id;
      await auditEndOfDay(supabaseAdmin, context, data.restaurantId, "night_audit_started", {
        runId,
        businessDate: property.businessDate,
        membershipId: me.id,
      });
      return { ok: true, runId, resumed: false };
    },
  );

/** Autosave the open step and the End of Day note. Never touches check results. */
export const saveNightAuditProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string; runId: string; currentStep?: string; notes?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        runId: idSchema,
        currentStep: stepSchema.optional(),
        notes: z.string().max(NOTE_MAX).optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; savedAt: string } | { ok: false; message: string }> => {
      await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.NIGHT_AUDIT_RUN);
      if (data.currentStep === undefined && data.notes === undefined) {
        return { ok: true, savedAt: new Date().toISOString() };
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const savedAt = new Date().toISOString();
      const patch: { progress_updated_at: string; current_step?: string; notes?: string | null } = {
        progress_updated_at: savedAt,
      };
      if (data.currentStep !== undefined) patch.current_step = data.currentStep;
      if (data.notes !== undefined) patch.notes = data.notes.trim() || null;
      const { data: updated, error } = await supabaseAdmin
        .from("night_audit_runs")
        .update(patch as never)
        .eq("id", data.runId)
        .eq("restaurant_id", data.restaurantId)
        .in("status", ["open", "ready"])
        .select("id");
      if (error) return { ok: false, message: nightAuditError(error.message).message };
      if (!updated || updated.length === 0) {
        return { ok: false, message: "This End of Day run is closed or no longer current." };
      }
      return { ok: true, savedAt };
    },
  );

/* ----------------------------------------------------------- fiscal override */

/**
 * A deliberately narrow authorization: exempt one canonical fiscal blocker from
 * the close gate for this open business-date run. It never updates the fiscal
 * document, its exception severity/status, or a non-fiscal finding.
 */
export const authorizeFiscalCloseOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      restaurantId: string;
      exceptionId: string;
      reason: string;
      reasonCategory?: (typeof FISCAL_OVERRIDE_REASON_CATEGORIES)[number];
    }) =>
      z
        .object({
          restaurantId: idSchema,
          exceptionId: idSchema,
          reason: z.string().trim().min(1, "An override reason is required.").max(500),
          reasonCategory: z.enum(FISCAL_OVERRIDE_REASON_CATEGORIES).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.NIGHT_AUDIT_FISCAL_AUTHORIZE,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);
    const { data: row } = await supabaseAdmin
      .from("night_audit_exceptions")
      .select(
        "id, exception_type, severity, status, reference_type, reference_id, night_audit_run_id",
      )
      .eq("id", data.exceptionId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Fiscal exception not found for this property." };
    const exception = row as {
      id: string;
      exception_type: string;
      severity: "warning" | "blocking";
      status: "open" | "resolved" | "ignored";
      reference_type: string | null;
      reference_id: string | null;
      night_audit_run_id: string;
    };
    if (
      !isFiscalOverrideableException({
        exceptionType: exception.exception_type,
        severity: exception.severity,
        status: exception.status,
      })
    ) {
      return {
        ok: false,
        message: "Only an open canonical fiscal blocker can receive a fiscal close override.",
      };
    }
    const { data: run } = await supabaseAdmin
      .from("night_audit_runs")
      .select("id, restaurant_id, business_date, status")
      .eq("id", exception.night_audit_run_id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!run) return { ok: false, message: "Night Audit run not found for this property." };
    const runRow = run as { id: string; business_date: string; status: string };
    if (runRow.status === "closed")
      return { ok: false, message: "Closed Night Audit runs cannot be modified." };
    if (runRow.status !== "open" && runRow.status !== "ready") {
      return { ok: false, message: "This Night Audit run cannot receive an override." };
    }
    // Match the authoritative effective date used to create and display the
    // run. A property's first close has no persisted business_date yet, so
    // comparing the raw nullable column would incorrectly reject today's run.
    if (property.businessDate !== runRow.business_date.slice(0, 10)) {
      return { ok: false, message: NA1_STALE_BUSINESS_DATE };
    }
    const fiscalStatus = fiscalStatusForException(exception.exception_type);
    if (!fiscalStatus) return { ok: false, message: "This fiscal status is not overrideable." };
    const inserted = await (supabaseAdmin as Admin).from("night_audit_fiscal_overrides").insert({
      restaurant_id: data.restaurantId,
      night_audit_run_id: runRow.id,
      exception_id: exception.id,
      business_date: runRow.business_date,
      exception_type: exception.exception_type,
      fiscal_status: fiscalStatus,
      fiscal_reference: exception.reference_id ?? exception.reference_type,
      reason: data.reason.trim(),
      ...(data.reasonCategory ? { reason_category: data.reasonCategory } : {}),
      overridden_by_membership_id: me.id,
    });
    if (inserted.error) {
      if (/duplicate key/i.test(inserted.error.message)) return { ok: true };
      return { ok: false, message: nightAuditError(inserted.error.message).message };
    }
    await auditEndOfDay(supabaseAdmin, context, data.restaurantId, "night_audit_fiscal_override_authorized", {
      runId: runRow.id,
      exceptionId: exception.id,
      businessDate: runRow.business_date,
      fiscalStatus,
      reasonCategory: data.reasonCategory ?? null,
      membershipId: me.id,
    });
    return { ok: true };
  });

/* -------------------------------------------------------------- day close */

export const NIGHT_AUDIT_BLOCKED = "NIGHT_AUDIT_BLOCKED";

type GroupRelease = "released" | "none" | "failed";

export type CloseBusinessDateResult =
  | {
      ok: true;
      runId: string;
      businessDate: string;
      nextBusinessDate: string;
      alreadyClosed: boolean;
      otbSnapshotStatus?: "captured" | "already_present" | "failed";
      otbSnapshotError?: string | null;
      /** From the persisted run. Never the current caller unless they won the close. */
      closedAt: string | null;
      closedBy: string | null;
      closedByMembershipId: string | null;
      /** False when this request did not close the run, or the note write failed after close. */
      noteSaved: boolean;
      groupBlockRelease: GroupRelease;
    }
  | {
      ok: false;
      message: string;
      code?:
        | typeof NIGHT_AUDIT_OUTSIDE_WINDOW
        | typeof NIGHT_AUDIT_INVALID_WINDOW
        | typeof NIGHT_AUDIT_BLOCKED;
      blockerCount?: number;
    };

export const closeBusinessDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { restaurantId: string; runId: string; notes?: string; expectedBusinessDate?: string }) =>
      z
        .object({
          restaurantId: idSchema,
          runId: idSchema,
          notes: z.string().max(NOTE_MAX).optional(),
          expectedBusinessDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CloseBusinessDateResult> => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE,
    );
    const flags = await nightAuditActorFlags(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);

    type RunCloseRow = PersistedCloseRow & {
      id: string;
      summary: (AuditSummary & { closeRequestId?: string }) | null;
    };
    const readRun = async (): Promise<RunCloseRow | null> => {
      const { data: row } = await supabaseAdmin
        .from("night_audit_runs")
        .select("id, business_date, status, closed_at, closed_by_membership_id, summary")
        .eq("id", data.runId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      return (row as RunCloseRow | null) ?? null;
    };

    // Expired group allotments release once the date is closed. Release only
    // touches the remaining allotment of active blocks past cutoff, so a retry
    // (double click, second browser, network replay) is a no-op.
    const releaseGroupBlocks = async (runDate: string): Promise<GroupRelease> => {
      try {
        const { releaseGroupBlocksPastCutoff } = await import("./groups.functions");
        const result = await releaseGroupBlocksPastCutoff(supabaseAdmin, me.id, data.restaurantId, runDate);
        return (result?.released ?? 0) > 0 ? "released" : "none";
      } catch (error) {
        console.error(
          "[night-audit] group block release",
          error instanceof Error ? error.message : error,
        );
        return "failed";
      }
    };

    // Everything here comes from the persisted closed run, never from this request.
    // OTB capture is insert-once, so a retry reuses the existing snapshot.
    const alreadyClosedResult = async (closedRun: RunCloseRow): Promise<CloseBusinessDateResult> => {
      const facts = persistedCloseFacts(closedRun);
      const groupBlockRelease = await releaseGroupBlocks(closedRun.business_date.slice(0, 10));
      const snapshot = await captureOtbAfterClose(
        supabaseAdmin,
        data.restaurantId,
        closedRun.business_date,
      );
      const closer = facts.closedByMembershipId
        ? ((await staffNames(supabaseAdmin, data.restaurantId, [facts.closedByMembershipId])).get(
            facts.closedByMembershipId,
          ) ?? null)
        : null;
      return {
        ok: true,
        runId: closedRun.id,
        businessDate: facts.businessDate,
        nextBusinessDate: facts.nextBusinessDate,
        alreadyClosed: true,
        otbSnapshotStatus: snapshot.status,
        otbSnapshotError: snapshot.error ?? null,
        closedAt: facts.closedAt,
        closedBy: closer,
        closedByMembershipId: facts.closedByMembershipId,
        noteSaved: false,
        groupBlockRelease,
      };
    };

    // A request that lost a close race reports the winning close, not its own rejection.
    const rejected = async (
      message: string,
      extra: { code?: typeof NIGHT_AUDIT_BLOCKED; blockerCount?: number } = {},
    ): Promise<CloseBusinessDateResult> => {
      const latest = await readRun();
      if (latest?.status === "closed") return alreadyClosedResult(latest);
      return { ok: false, message, ...extra };
    };

    const run = await readRun();
    if (!run) return { ok: false, message: "Night audit run not found for this property." };
    const runDate = run.business_date.slice(0, 10);

    // Duplicate request or refresh after close: report the stored close, never close twice.
    if (run.status === "closed") return alreadyClosedResult(run);

    if (data.expectedBusinessDate && data.expectedBusinessDate !== runDate) {
      return rejected(NA1_STALE_BUSINESS_DATE);
    }
    if (property.persistedBusinessDate != null && property.persistedBusinessDate !== runDate) {
      return rejected(NA1_STALE_BUSINESS_DATE);
    }
    if (run.status !== "open" && run.status !== "ready") {
      return { ok: false, message: "This night audit run cannot be closed." };
    }
    const { data: laterClosed, error: laterClosedError } = await supabaseAdmin
      .from("night_audit_runs")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "closed")
      .gt("business_date", runDate)
      .limit(1);
    if (laterClosedError) {
      return rejected("Night Audit could not confirm this business date. Close stays unavailable.");
    }
    if ((laterClosed ?? []).length > 0) {
      return rejected(NA1_STALE_BUSINESS_DATE);
    }

    // Additional condition only: the window override bypasses the time, never a blocker.
    const config = await loadEndOfDayConfig(supabaseAdmin, data.restaurantId);
    const closeWindow = evaluateNightAuditWindow({
      ...config.window,
      timezone: property.timezone,
      canOverride: flags.canOverrideWindow,
    });
    if (!closeWindow.allowsClose) {
      return {
        ok: false,
        message: closeWindow.message,
        code: closeWindow.configValid ? NIGHT_AUDIT_OUTSIDE_WINDOW : NIGHT_AUDIT_INVALID_WINDOW,
      };
    }

    // Re-evaluate every source now. A failed read does not sync and does not advance the date.
    const evaluation = await evaluateEndOfDay(
      supabaseAdmin,
      data.restaurantId,
      runDate,
      property,
      config.policy,
    );
    if (!evaluation.financial.ok) return rejected(FINANCIAL_UNAVAILABLE_MESSAGE);
    if (!evaluation.operational.ok) return rejected(OPERATIONAL_UNAVAILABLE_MESSAGE);
    const financial = evaluation.financial.result;
    const operational = evaluation.operational.result;

    try {
      await syncRunExceptions(supabaseAdmin, data.restaurantId, run.id, evaluation.conditions);
    } catch {
      return rejected("End of Day blockers could not be saved. Close stays unavailable.");
    }
    let closeRows: ExceptionRow[];
    let closeOverrides: Map<string, FiscalOverrideRow>;
    try {
      closeRows = await exceptionRowsForRun(supabaseAdmin, run.id);
      closeOverrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, run.id);
    } catch {
      return rejected("Blocking exceptions could not be confirmed. Close stays unavailable.");
    }
    const conditions = attachPersisted(evaluation.conditions, closeRows, closeOverrides, new Map());
    const liveBlockers = openBlockers(conditions);
    // The RPC repeats this on the stored rows; checking both keeps the screen honest.
    const storedBlockers = closeRows.filter(
      (row) => row.severity === "blocking" && row.status === "open" && !closeOverrides.has(row.id),
    );
    const blockerCount = Math.max(liveBlockers.length, storedBlockers.length);
    if (blockerCount > 0) {
      return rejected(closeBlockedCopy(blockerCount), { code: NIGHT_AUDIT_BLOCKED, blockerCount });
    }

    const steps = endOfDaySteps({ runStatus: "ready", conditions });
    const hotelShifts = financial.drawers;
    const closedShifts = hotelShifts.filter((row) => row.state === "closed");
    const sum = (values: Array<number | null>) =>
      values.every((value) => value == null)
        ? null
        : Math.round(values.reduce<number>((total, value) => total + (value ?? 0), 0) * 100) / 100;
    const rolledTo = nextBusinessDate(runDate);
    const closeRequestId = crypto.randomUUID();
    const summary: AuditSummary & { closeRequestId: string } = {
      ...(financial.dayFinance ? { finance: legacyAuditFinance(financial.dayFinance) } : {}),
      warnings: 0,
      blockingResolved: closeRows.filter((row) => row.severity === "blocking").length,
      inHouse: operational.summary.inHouseCount,
      overstays: operational.summary.overstayCount,
      checks: [],
      previousBusinessDate: runDate,
      nextBusinessDate: rolledTo,
      financialBlockerCount: 0,
      fiscalOverrideCount: closeOverrides.size,
      financialWarningCount: 0,
      openDrawerCount: financial.summary.openDrawerCount,
      fiscalProblemCount: financial.summary.fiscalProblemCount,
      taxByCurrency: financial.taxSummary.map((row) => ({
        currency: row.currency,
        tax: row.tax,
        serviceCharge: row.serviceCharge,
      })),
      operationalBlockerCount: 0,
      operationalWarningCount: 0,
      unresolvedArrivalCount: operational.summary.unresolvedArrivalCount,
      overstayCount: operational.summary.overstayCount,
      roomConflictCount: operational.summary.roomConflictCount,
      overbookingIssueCount: operational.summary.overbookingIssueCount,
      endOfDay: {
        version: 2,
        steps: steps
          .filter((step) => step.id !== "finalize")
          .map((step) => ({
            id: step.id,
            status: step.id === "business_date" ? "completed" : step.status,
            blockerCount: step.blockerCount,
            informationCount: step.informationCount,
          })),
        blockersResolved: closeRows.filter((row) => row.severity === "blocking" && row.status === "resolved")
          .length,
        informationCount: informationItems(conditions).length,
        policy: config.policy,
        cashier: {
          openShifts: hotelShifts.filter((row) => row.state === "open").length,
          closedShifts: closedShifts.length,
          expected: sum(closedShifts.map((row) => row.expectedCash)),
          counted: sum(closedShifts.map((row) => row.closingCount)),
          variance: sum(closedShifts.map((row) => row.variance)),
        },
        dayFinance: financial.dayFinance,
        fiscal: {
          overrides: closeOverrides.size,
          blockers: conditions.filter((row) => row.kind === "blocker" && row.code.startsWith("fiscal_")).length,
        },
      },
      closeRequestId,
      nightAuditWindow: outsideWindowCloseRecord(closeWindow, me.id, new Date().toISOString()),
    };

    const { data: closedRow, error } = await supabaseAdmin.rpc("close_business_date", {
      _restaurant_id: data.restaurantId,
      _run_id: run.id,
      _summary: summary as never,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: nightAuditError(error.message).message };

    // The RPC returns an already-closed run unchanged. Only the request whose
    // summary was written closed it; any other request reports that close.
    const persisted = (closedRow as RunCloseRow | null) ?? (await readRun());
    if (!closedByThisRequest(persisted, closeRequestId)) {
      if (persisted?.status === "closed") return alreadyClosedResult(persisted);
      return {
        ok: false,
        message: "Night Audit could not confirm the close result. Refresh before trying again.",
      };
    }
    const closed = persistedCloseFacts(persisted!);

    // The note belongs to the winning close only. The filter on this request's id
    // means a losing concurrent request can never write over it.
    const note = (data.notes ?? "").trim();
    let noteSaved = true;
    if (note) {
      const noted = await supabaseAdmin
        .from("night_audit_runs")
        .update({ notes: note })
        .eq("id", run.id)
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "closed")
        .eq("summary->>closeRequestId", closeRequestId);
      noteSaved = !noted.error;
    }

    const groupBlockRelease = await releaseGroupBlocks(runDate);

    // Analytics only. Never roll back a completed close if snapshot capture fails.
    const snapshot = await captureOtbAfterClose(supabaseAdmin, data.restaurantId, run.business_date);
    await auditEndOfDay(supabaseAdmin, context, data.restaurantId, "night_audit_business_date_closed", {
      runId: run.id,
      previousBusinessDate: runDate,
      nextBusinessDate: closed.nextBusinessDate,
      membershipId: me.id,
      outsideWindow: summary.nightAuditWindow != null,
      fiscalOverrides: closeOverrides.size,
      groupBlockRelease,
      otbSnapshotStatus: snapshot.status,
    });
    const closer = closed.closedByMembershipId
      ? ((await staffNames(supabaseAdmin, data.restaurantId, [closed.closedByMembershipId])).get(
          closed.closedByMembershipId,
        ) ?? null)
      : null;
    return {
      ok: true,
      runId: run.id,
      businessDate: closed.businessDate,
      nextBusinessDate: closed.nextBusinessDate,
      alreadyClosed: false,
      otbSnapshotStatus: snapshot.status,
      otbSnapshotError: snapshot.error ?? null,
      closedAt: closed.closedAt,
      closedBy: closer,
      closedByMembershipId: closed.closedByMembershipId,
      noteSaved,
      groupBlockRelease,
    };
  });

/* ------------------------------------------------------------ OTB recovery */

/**
 * Re-runs the insert-once OTB capture for the latest close only, while the
 * house is still on the date that close opened. It never closes, never
 * changes the run, and returns already_present when rows exist.
 */
export const retryNightAuditOtbSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string; runId: string }) =>
    z.object({ restaurantId: idSchema, runId: idSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; status: "captured" | "already_present" | "failed"; error: string | null }
      | { ok: false; message: string }
    > => {
      const me = await requirePmsActor(
        context as never,
        data.restaurantId,
        PMS_PERMISSIONS.NIGHT_AUDIT_EXCEPTION_EDIT,
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const property = await loadProperty(supabaseAdmin, data.restaurantId);
      const { data: runRow } = await supabaseAdmin
        .from("night_audit_runs")
        .select("id, business_date, status")
        .eq("id", data.runId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!runRow) return { ok: false, message: "Night audit run not found for this property." };
      const run = runRow as { id: string; business_date: string; status: string };
      if (
        !canRetryOtbSnapshot({
          runStatus: run.status,
          runBusinessDate: run.business_date.slice(0, 10),
          persistedBusinessDate: property.persistedBusinessDate,
        })
      ) {
        return {
          ok: false,
          message:
            "OTB snapshot can only be retried for the latest close on its next business date.",
        };
      }
      const snapshot = await captureOtbAfterClose(
        supabaseAdmin,
        data.restaurantId,
        run.business_date,
      );
      await auditEndOfDay(supabaseAdmin, context, data.restaurantId, "night_audit_otb_retried", {
        runId: run.id,
        businessDate: run.business_date.slice(0, 10),
        status: snapshot.status,
        membershipId: me.id,
      });
      return { ok: true, status: snapshot.status, error: snapshot.error ?? null };
    },
  );

/* ------------------------------------------------------------------ history */

export const listNightAuditRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditRunRow[]> => {
    await requireNightAuditView(context as never, data.restaurantId);
    const flags = await nightAuditActorFlags(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("night_audit_runs")
      .select(RUN_COLUMNS)
      .eq("restaurant_id", data.restaurantId)
      .order("business_date", { ascending: false })
      .limit(60);
    const list = (rows ?? []) as RunRecord[];
    const names = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      list.flatMap((r) => [r.started_by_membership_id ?? "", r.closed_by_membership_id ?? ""]),
    );
    return list.map((r) => toRunRow(r, names, flags.detailRole));
  });

const RUN_COLUMNS =
  "id, business_date, status, started_at, closed_at, started_by_membership_id, closed_by_membership_id, summary, notes";

type RunRecord = {
  id: string;
  business_date: string;
  status: "open" | "ready" | "closed" | "failed" | "superseded";
  started_at: string;
  closed_at: string | null;
  started_by_membership_id: string | null;
  closed_by_membership_id: string | null;
  summary: unknown;
  notes?: string | null;
};

/** Stored run as one caller may see it. The summary is what close wrote; it is never recomputed. */
function toRunRow(
  r: RunRecord,
  names: ReadonlyMap<string, string>,
  role: string,
  otb?: NightAuditOtbState,
): NightAuditRunRow {
  return {
    id: r.id,
    businessDate: r.business_date,
    status: r.status,
    startedAt: r.started_at,
    closedAt: r.closed_at,
    startedBy: r.started_by_membership_id ? (names.get(r.started_by_membership_id) ?? null) : null,
    closedBy: r.closed_by_membership_id ? (names.get(r.closed_by_membership_id) ?? null) : null,
    summary: presentRunSummary((r.summary as AuditSummary | null) ?? null, role),
    notes: r.notes ?? null,
    ...(otb ? { otb } : {}),
  };
}

export type NightAuditHistoryPage = {
  rows: NightAuditRunRow[];
  total: number;
  page: number;
  pageSize: HistoryPageSize;
  closers: Array<{ id: string; name: string }>;
};

/** Night Audit History. Filters and paging run in SQL; at most 50 runs per page. */
export const listNightAuditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      restaurantId: string;
      page?: number;
      pageSize?: number;
      status?: string;
      from?: string;
      to?: string;
      closedBy?: string;
      search?: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          page: z.number().int().min(1).max(10000).optional(),
          pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).optional(),
          status: z.enum(["all", "open", "ready", "closed", "failed", "superseded"]).optional(),
          from: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          to: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          closedBy: idSchema.optional(),
          search: z.string().max(80).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<NightAuditHistoryPage> => {
    await requireNightAuditView(context as never, data.restaurantId);
    const flags = await nightAuditActorFlags(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = (data.pageSize ?? 25) as HistoryPageSize;
    const range = historyRange(data.page ?? 1, pageSize);

    const closerRows = await selectAll<{ closed_by_membership_id: string | null }>((from, to) =>
      supabaseAdmin
        .from("night_audit_runs")
        .select("closed_by_membership_id")
        .eq("restaurant_id", data.restaurantId)
        .not("closed_by_membership_id", "is", null)
        .order("business_date", { ascending: false })
        .range(from, to),
    );
    const closerIds = [
      ...new Set(closerRows.map((row) => row.closed_by_membership_id ?? "").filter(Boolean)),
    ];
    const closerNames = await staffNames(supabaseAdmin, data.restaurantId, closerIds);

    const search = (data.search ?? "").trim();
    const searchDates = search ? historySearchDates(search) : null;
    let nameMatches: string[] | null = null;
    if (search && !searchDates) {
      const needle = search.toLowerCase();
      nameMatches = closerIds.filter((id) =>
        (closerNames.get(id) ?? "").toLowerCase().includes(needle),
      );
    }

    let query = supabaseAdmin
      .from("night_audit_runs")
      .select(RUN_COLUMNS, { count: "exact" })
      .eq("restaurant_id", data.restaurantId);
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.from) query = query.gte("business_date", data.from);
    if (data.to) query = query.lte("business_date", data.to);
    if (data.closedBy) query = query.eq("closed_by_membership_id", data.closedBy);
    if (searchDates)
      query = query.gte("business_date", searchDates.from).lte("business_date", searchDates.to);
    if (nameMatches) {
      if (nameMatches.length === 0) {
        return {
          rows: [],
          total: 0,
          page: range.page,
          pageSize,
          closers: closerList(closerIds, closerNames),
        };
      }
      query = query.in("closed_by_membership_id", nameMatches);
    }
    const {
      data: rows,
      count,
      error,
    } = await query.order("business_date", { ascending: false }).range(range.from, range.to);
    if (error) throw nightAuditError("Night Audit history is unavailable.");

    const list = (rows ?? []) as RunRecord[];
    const names = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      list.flatMap((r) => [r.started_by_membership_id ?? "", r.closed_by_membership_id ?? ""]),
    );
    const otb = await otbStates(supabaseAdmin, data.restaurantId, list);
    return {
      rows: list.map((r) =>
        toRunRow(
          r,
          names,
          flags.detailRole,
          r.status === "closed" ? (otb.get(r.business_date.slice(0, 10)) ?? "unknown") : undefined,
        ),
      ),
      total: count ?? list.length,
      page: range.page,
      pageSize,
      closers: closerList(closerIds, closerNames),
    };
  });

function closerList(
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
): Array<{ id: string; name: string }> {
  return ids
    .map((id) => ({ id, name: names.get(id) ?? "Staff" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const getNightAuditRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string; runId: string }) =>
    z.object({ restaurantId: idSchema, runId: idSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      run: NightAuditRunRow;
      exceptions: AuditException[];
      currency: string;
    } | null> => {
      await requireNightAuditView(context as never, data.restaurantId);
      const flags = await nightAuditActorFlags(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const property = await loadProperty(supabaseAdmin, data.restaurantId);
      const { data: row, error: runError } = await supabaseAdmin
        .from("night_audit_runs")
        .select(RUN_COLUMNS)
        .eq("id", data.runId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (runError) throw nightAuditError("This Night Audit run could not be loaded.");
      if (!row) return null;
      const r = row as RunRecord;
      const names = await staffNames(supabaseAdmin, data.restaurantId, [
        r.started_by_membership_id ?? "",
        r.closed_by_membership_id ?? "",
      ]);
      // Persisted rows only. A closed day is never re-reconciled to rebuild its history.
      const exRows = await selectAll<ExceptionRow>((from, to) =>
        supabaseAdmin
          .from("night_audit_exceptions")
          .select("*")
          .eq("night_audit_run_id", r.id)
          .eq("restaurant_id", data.restaurantId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      const otb =
        r.status === "closed"
          ? ((await otbStates(supabaseAdmin, data.restaurantId, [r])).get(
              r.business_date.slice(0, 10),
            ) ?? "unknown")
          : undefined;
      const overrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, r.id);
      const history = await fiscalOverrideHistoryForRun(supabaseAdmin, data.restaurantId, r.id);
      const reviews = await warningReviewHistoryForRun(supabaseAdmin, data.restaurantId, r.id);
      const staffIds = [
        ...[...history.values()].flat().map((override) => override.overridden_by_membership_id),
        ...[...reviews.values()].flat().map((review) => review.reviewed_by_membership_id),
      ];
      const otherNames = await staffNames(supabaseAdmin, data.restaurantId, staffIds);
      return {
        currency: property.currency,
        run: toRunRow(r, names, flags.detailRole, otb),
        exceptions: exRows.map((ex) => {
          const override = overrides.get(ex.id);
          return {
            id: ex.id,
            exceptionType: ex.exception_type,
            severity: ex.severity,
            referenceType: ex.reference_type,
            referenceId: ex.reference_id,
            message: presentExceptionMessage(ex.exception_type, ex.message, flags.detailRole),
            status: ex.status,
            resolvedAt: ex.resolved_at,
            resolutionNote: ex.resolution_note,
            createdAt: ex.created_at ?? null,
            fiscalOverride: override ? toFiscalOverride(override, otherNames) : null,
            fiscalOverrideHistory: (history.get(ex.id) ?? []).map((item) => toFiscalOverride(item, otherNames)),
            warningReviewHistory: (reviews.get(ex.id) ?? []).map((item) => toWarningReview(item, otherNames)),
          };
        }),
      };
    },
  );
