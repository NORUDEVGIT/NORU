/**
 * Phase 6I — Night Audit & business date close server functions.
 *
 * Owner/manager only. The business date always comes from the property row,
 * never from the browser; every id is revalidated against the property before
 * it is used. The close itself runs inside a locked SECURITY DEFINER function.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CASHIER_ACCESS_ROLES,
  canManageCashiering,
  requireCashierManager,
  requireCashieringAccess,
} from "./cashiering.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireReservationManager } from "./reservations.server";
import { requirePmsPackage } from "./pms-package.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { evaluateNa1Blockers } from "./na1.server";
import {
  NA1_STALE_BUSINESS_DATE,
  canConfirmNightAudit,
  canEnableConfirm,
  integrityBlockerCounts,
  nightAuditFeedCounts,
  nextBusinessDate,
  persistedNightAuditExceptions,
  remainingBlockerCount,
  snapshotBlockers,
  workspaceStatus,
  type Na1BlockerSnapshot,
  type NaBlockerRow,
  type NaDerivedException,
  type NaFolioLane,
  type NaLastClosed,
  type NaWorkspaceStatus,
} from "./na1";
import {
  FINANCIAL_UNAVAILABLE_MESSAGE,
  canViewNightAuditFinancialDetail,
  financialAllowsClose,
  financialIssuesToExceptions,
  mergeAuditExceptions,
  presentNightAuditFinancials,
  type NightAuditFinancialReconciliation,
  type NightAuditFinancialStatus,
} from "./night-audit-financial";
import { loadNightAuditFinancialReconciliation } from "./night-audit-financial.server";
import {
  OPERATIONAL_UNAVAILABLE_MESSAGE,
  nightAuditAllowsClose,
  nightAuditOverallStatus,
  operationalAllowsClose,
  operationalIssuesToExceptions,
  presentNightAuditOperations,
  withoutOperationalOwnedTypes,
  type NightAuditOperationalReconciliation,
  type NightAuditOperationalStatus,
  type NightAuditOverallStatus,
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
  canViewNightAuditOperationalDetail,
  historyRange,
  historySearchDates,
  presentExceptionMessage,
  presentRunSummary,
  type ExceptionSource,
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
import {
  NON_IGNORABLE_TYPES,
  evaluateAudit,
  nightAuditError,
  type AreaCheck,
  type AuditFinance,
  type NoShowCandidate,
  type OverstayStay,
  type ShiftReconciliation,
} from "./nightaudit.server";

const idSchema = z.string().uuid();

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
  canIgnore: boolean;
  /** Detected at. */
  createdAt: string | null;
  /** Live owner-module link from the current reconciliation. Null on rows no longer derived. */
  source: ExceptionSource | null;
  /** The currently ACTIVE fiscal-only close exemption. The underlying source remains open. */
  fiscalOverride: FiscalOverride | null;
  /** Every override event ever authorized for this exception row, oldest first. History only. */
  fiscalOverrideHistory: FiscalOverride[];
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
}

export interface AuditSummary {
  finance: AuditFinance;
  warnings: number;
  blockingResolved: number;
  inHouse: number;
  /** Present on closes after NA-P1. Older summaries omit it; do not treat inHouse as overstays. */
  overstays?: number;
  checks: AreaCheck[];
  blockers?: Na1BlockerSnapshot[];
  previousBusinessDate?: string;
  nextBusinessDate?: string;
  /** Present on closes after NA-P2. Counts only — not transaction rows. */
  financialBlockerCount?: number;
  financialWarningCount?: number;
  openDrawerCount?: number;
  fiscalProblemCount?: number;
  fiscalOverrideCount?: number;
  taxByCurrency?: Array<{ currency: string; tax: number; serviceCharge: number }>;
  /** Present on closes after NA-P3. Older summaries omit them. */
  operationalBlockerCount?: number;
  operationalWarningCount?: number;
  unresolvedArrivalCount?: number;
  overstayCount?: number;
  roomConflictCount?: number;
  overbookingIssueCount?: number;
  /** Set only when an owner closed outside the configured Night Audit Window. */
  nightAuditWindow?: OutsideWindowClose | null;
  /** Set only when Owner Business Date recovery safely supersedes an open run. */
  businessDateRecovery?: {
    superseded: true;
    adjustmentId: string;
    oldBusinessDate: string;
    newBusinessDate: string;
    reason: string;
    supersededByMembershipId: string;
    supersededAt: string;
  };
}

export interface NightAuditState {
  businessDate: string;
  currency: string;
  timezone: string;
  run: NightAuditRunRow;
  checks: AreaCheck[];
  exceptions: AuditException[];
  blockingCount: number;
  warningCount: number;
  noShows: NoShowCandidate[];
  overstays: OverstayStay[];
  shifts: ShiftReconciliation[];
  /** Null for roles without NA-P2 financial detail. */
  finance: AuditFinance | null;
  canClose: boolean;
  blockers: NaBlockerRow[];
  workspaceStatus: NaWorkspaceStatus;
  lastClosed: NaLastClosed | null;
  lastClosedRunId: string | null;
  /** The status closeBusinessDate also gates on. */
  overallStatus: NightAuditOverallStatus;
  financialStatus: NightAuditFinancialStatus;
  operationalStatus: NightAuditOperationalStatus;
  /** When this server recheck ran. */
  checkedAt: string;
  persistedBusinessDate: string | null;
  lastClosedOtb: NightAuditOtbState | null;
  canRetryOtb: boolean;
  /** Configured close window evaluated for this caller in the property timezone. */
  nightAuditWindow: NightAuditWindowState;
}

/* ----------------------------------------------------------------- helpers */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProperty(admin: any, restaurantId: string) {
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

/** Configured Night Audit Window. An unreadable config uses the setup default, never "always open". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadNightAuditWindowConfig(admin: any, restaurantId: string) {
  const { data, error } = await admin
    .from("restaurants")
    .select("business_date_config")
    .eq("id", restaurantId)
    .maybeSingle();
  return nightAuditWindowConfig(
    error ? null : (data as { business_date_config?: unknown } | null)?.business_date_config,
  );
}

/** Same financial read the workspace shows. Failure stays unavailable and does not look ready. */
async function readFinancialReconciliation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
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

/** Same operational read the Operations workspace shows. Failure stays unavailable. */
async function readOperationalReconciliation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
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

/** NA-1 board rows, financial issues, and unit-level operational issues as one exception set. */
function auditExceptionSet(
  blockers: NaBlockerRow[],
  evaluationExceptions: readonly NaDerivedException[],
  financial: NightAuditFinancialReconciliation,
  operational: NightAuditOperationalReconciliation,
): NaDerivedException[] {
  return mergeAuditExceptions(
    mergeAuditExceptions(
      withoutOperationalOwnedTypes(persistedNightAuditExceptions(blockers, evaluationExceptions)),
      financialIssuesToExceptions(financial.issues),
    ),
    operationalIssuesToExceptions(operational.issues),
  );
}

function liveExceptionSources(
  financial: NightAuditFinancialReconciliation | null,
  operational: NightAuditOperationalReconciliation | null,
): Map<string, ExceptionSource> {
  const sources = new Map<string, ExceptionSource>();
  const add = (
    issue: {
      route: string;
      search?: Record<string, string> | undefined;
      confirmationNumber?: string | null;
      reservationId?: string | null;
      roomId?: string | null;
    },
    exception: NaDerivedException | undefined,
  ) => {
    if (!exception) return;
    const extra: Record<string, string> = {};
    if (issue.confirmationNumber) extra.q = issue.confirmationNumber;
    if (issue.reservationId) extra.reservationId = issue.reservationId;
    if (issue.roomId) extra.room = issue.roomId;

    const mergedSearch = {
      ...(issue.search ?? {}),
      ...extra,
    };

    sources.set(exceptionSyncKey(exception.exceptionType, exception.referenceId), {
      route: issue.route,
      ...(Object.keys(mergedSearch).length > 0 ? { search: mergedSearch } : {}),
    });
  };
  for (const issue of financial?.issues ?? []) add(issue, financialIssuesToExceptions([issue])[0]);
  for (const issue of operational?.issues ?? [])
    add(issue, operationalIssuesToExceptions([issue])[0]);
  return sources;
}

/** A required board row that did not load. Designed unavailable rows do not count. */
function boardUnavailable(blockers: readonly NaBlockerRow[]): boolean {
  return remainingBlockerCount(blockers) === 0 && !canEnableConfirm(blockers);
}

/** Analytics follow-up after a completed close. Never throws. */
async function captureOtbAfterClose(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  restaurantId: string,
  asOfBusinessDate: string,
): Promise<OtbCaptureResult> {
  const { captureOtbSnapshotAfterClose } = await import("./revenue/demand-snapshot.server");
  return captureOtbSnapshotAfterClose(supabaseAdmin, restaurantId, asOfBusinessDate);
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

/** Only the ACTIVE override per exception. This is what the close gate and current-state UI must use. */
async function fiscalOverridesForRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
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

function effectiveFinancialStatus(
  financial: NightAuditFinancialReconciliation,
  exceptionRows: readonly ExceptionRow[],
  overrides: ReadonlyMap<string, FiscalOverrideRow>,
): NightAuditFinancialStatus {
  const overridden = new Set(
    exceptionRows
      .filter((row) => overrides.has(row.id))
      .map((row) => exceptionSyncKey(row.exception_type, row.reference_id)),
  );
  const remainingFinancialBlockers = financial.issues.some((issue) => {
    if (issue.severity !== "blocking") return false;
    const exception = financialIssuesToExceptions([issue])[0];
    return (
      !exception ||
      !overridden.has(exceptionSyncKey(exception.exceptionType, exception.referenceId))
    );
  });
  if (remainingFinancialBlockers) return "blocked";
  return financial.summary.warningCount > 0 ? "warning" : "ready";
}

function presentFinancialWithFiscalOverrides(
  financial: NightAuditFinancialReconciliation,
  exceptionRows: readonly ExceptionRow[],
  overrides: ReadonlyMap<string, FiscalOverrideRow>,
  names: ReadonlyMap<string, string>,
): NightAuditFinancialReconciliation {
  const byKey = new Map(
    exceptionRows.map((row) => [exceptionSyncKey(row.exception_type, row.reference_id), row]),
  );
  const overridesByFiscalReference = new Map<string, FiscalOverrideRow>();
  for (const issue of financial.issues) {
    const exception = financialIssuesToExceptions([issue])[0];
    if (!exception) continue;
    const persisted = byKey.get(exceptionSyncKey(exception.exceptionType, exception.referenceId));
    const override = persisted ? overrides.get(persisted.id) : undefined;
    if (override && exception.referenceId)
      overridesByFiscalReference.set(exception.referenceId, override);
  }
  const fiscalOverrideCount = overrides.size;
  return {
    ...financial,
    status: effectiveFinancialStatus(financial, exceptionRows, overrides) as Exclude<
      NightAuditFinancialStatus,
      "unavailable"
    >,
    summary: {
      ...financial.summary,
      blockerCount: Math.max(0, financial.summary.blockerCount - fiscalOverrideCount),
      fiscalOverrideCount,
    },
    fiscal: financial.fiscal.map((row) => {
      const override = overridesByFiscalReference.get(row.id);
      return {
        ...row,
        nightAuditOverride: override
          ? {
              reason: override.reason,
              reasonCategory: override.reason_category,
              overriddenBy: names.get(override.overridden_by_membership_id) ?? null,
              overriddenAt: override.overridden_at,
            }
          : null,
      };
    }),
  };
}

async function syncRunExceptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  restaurantId: string,
  runId: string,
  derived: readonly NaDerivedException[],
): Promise<void> {
  // A closed run's exception history is frozen; a later recheck must not resolve or reopen it.
  const { data: current, error: currentError } = await admin
    .from("night_audit_runs")
    .select("status")
    .eq("id", runId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current || !canSyncRunExceptions((current as { status: string }).status)) return;

  const existingRows = await selectAll<ExceptionRow>((from, to) =>
    admin
      .from("night_audit_exceptions")
      .select("*")
      .eq("night_audit_run_id", runId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const plan = planExceptionSync(
    existingRows.map((row) => ({
      id: row.id,
      exceptionType: row.exception_type,
      severity: row.severity,
      referenceId: row.reference_id,
      message: row.message,
      status: row.status,
    })),
    derived,
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
    if (inserted.error) throw inserted.error;
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
    const resolved = await admin
      .from("night_audit_exceptions")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolution_note: "Cleared automatically — the underlying issue was fixed.",
      })
      .in("id", plan.resolveIds);
    if (resolved.error) throw resolved.error;

    // The source condition is actually gone: any active fiscal override for
    // these exact exceptions is invalidated. A later reopen of the same row
    // starts with no active override and requires a fresh authorization.
    // Scoped to these ids only — unrelated exceptions are never touched.
    const invalidated = await admin
      .from("night_audit_fiscal_overrides")
      .update({
        invalidated_at: new Date().toISOString(),
        invalidated_reason: "Source fiscal condition resolved.",
      })
      .in("exception_id", plan.resolveIds)
      .is("invalidated_at", null);
    if (invalidated.error) throw invalidated.error;
  }
}

function toFiscalOverride(
  row: FiscalOverrideRow,
  names: ReadonlyMap<string, string>,
): FiscalOverride {
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

function toException(
  row: ExceptionRow,
  role: string,
  sources: ReadonlyMap<string, ExceptionSource> = new Map(),
  /** ACTIVE override only — never an invalidated one. */
  overrides: ReadonlyMap<string, FiscalOverrideRow> = new Map(),
  names: ReadonlyMap<string, string> = new Map(),
  /** All override events (active + invalidated) for this exception. History screens only. */
  history: ReadonlyMap<string, FiscalOverrideRow[]> = new Map(),
): AuditException {
  const override = overrides.get(row.id);
  return {
    id: row.id,
    exceptionType: row.exception_type,
    severity: row.severity,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    message: presentExceptionMessage(row.exception_type, row.message, role),
    status: row.status,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    canIgnore: row.severity === "warning" && !NON_IGNORABLE_TYPES.has(row.exception_type),
    createdAt: row.created_at ?? null,
    source:
      row.status === "open"
        ? (sources.get(exceptionSyncKey(row.exception_type, row.reference_id)) ?? null)
        : null,
    fiscalOverride: override ? toFiscalOverride(override, names) : null,
    fiscalOverrideHistory: (history.get(row.id) ?? []).map((item) => toFiscalOverride(item, names)),
  };
}

/** OTB rows captured as of each closed business date. A read failure is unknown, not missing. */
async function otbStates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function staffNames(admin: any, restaurantId: string, membershipIds: string[]) {
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

function folioLaneForRole(role: string): NaFolioLane {
  return (CASHIER_ACCESS_ROLES as readonly string[]).includes(role) ? "live" : "unavailable";
}

async function requireNightAuditView(
  context: Parameters<typeof requireCashieringAccess>[0],
  restaurantId: string,
) {
  try {
    return await requireCashieringAccess(context, restaurantId);
  } catch (cashErr) {
    try {
      return await requireReservationManager(context, restaurantId);
    } catch {
      throw cashErr;
    }
  }
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

/* ------------------------------------------------------------------ access */

export const getNightAuditAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireNightAuditView(context as never, data.restaurantId);
    return {
      canManage: canManageCashiering(me.role),
      canConfirm: canConfirmNightAudit(me.role),
      role: me.role,
    };
  });

export const getNightAuditFinancials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditFinancialReconciliation> => {
    const me = await requireNightAuditView(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);
    try {
      const result = await loadNightAuditFinancialReconciliation(
        supabaseAdmin,
        data.restaurantId,
        property.businessDate,
        property.timezone,
        property.currency,
      );
      const { data: runRow } = await supabaseAdmin
        .from("night_audit_runs")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("business_date", property.businessDate)
        .maybeSingle();
      if (!runRow) return presentNightAuditFinancials(result, me.role);
      const runId = (runRow as { id: string }).id;
      const exceptionRows = await selectAll<ExceptionRow>((from, to) =>
        supabaseAdmin
          .from("night_audit_exceptions")
          .select("*")
          .eq("night_audit_run_id", runId)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const overrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, runId);
      const names = await staffNames(
        supabaseAdmin,
        data.restaurantId,
        [...overrides.values()].map((override) => override.overridden_by_membership_id),
      );
      return presentNightAuditFinancials(
        presentFinancialWithFiscalOverrides(result, exceptionRows, overrides, names),
        me.role,
      );
    } catch (error) {
      throw nightAuditError(error instanceof Error ? error.message : FINANCIAL_UNAVAILABLE_MESSAGE);
    }
  });

export const getNightAuditOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditOperationalReconciliation> => {
    const me = await requireNightAuditView(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);
    try {
      const result = await loadNightAuditOperationalReconciliation(
        supabaseAdmin,
        data.restaurantId,
        property.businessDate,
        property.timezone,
      );
      return presentNightAuditOperations(result, me.role);
    } catch {
      throw new Error(OPERATIONAL_UNAVAILABLE_MESSAGE);
    }
  });

/* -------------------------------------------------------------- run / sync */

export const runNightAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditState> => {
    const me = await requireNightAuditView(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);
    const folioLane = folioLaneForRole(me.role);
    const financialDetail = canViewNightAuditFinancialDetail(me.role);
    const stayDetail = canViewNightAuditOperationalDetail(me.role);
    const checkedAt = new Date().toISOString();

    // One run per property/business date.
    let { data: runRow } = await supabaseAdmin
      .from("night_audit_runs")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("business_date", property.businessDate)
      .maybeSingle();

    if (!runRow) {
      const inserted = await supabaseAdmin
        .from("night_audit_runs")
        .insert({
          restaurant_id: data.restaurantId,
          business_date: property.businessDate,
          status: "open",
          started_by_membership_id: me.id,
        })
        .select("*")
        .maybeSingle();
      if (inserted.error && !/duplicate key/i.test(inserted.error.message)) {
        throw nightAuditError(inserted.error.message);
      }
      runRow =
        inserted.data ??
        (
          await supabaseAdmin
            .from("night_audit_runs")
            .select("*")
            .eq("restaurant_id", data.restaurantId)
            .eq("business_date", property.businessDate)
            .maybeSingle()
        ).data;
    }

    const run = runRow as {
      id: string;
      business_date: string;
      status: "open" | "ready" | "closed" | "failed" | "superseded";
      started_at: string;
      closed_at: string | null;
      started_by_membership_id: string | null;
      closed_by_membership_id: string | null;
      summary: unknown;
    };

    const evaluation = await evaluateAudit(
      supabaseAdmin,
      data.restaurantId,
      property.businessDate,
      property.currency,
      property.timezone,
    );
    const blockers = await evaluateNa1Blockers(
      supabaseAdmin,
      data.restaurantId,
      property.businessDate,
      folioLane,
      integrityBlockerCounts(evaluation.exceptions),
      nightAuditFeedCounts(evaluation.exceptions),
    );

    // A closed business date is immutable — report it, never re-derive it.
    // Open runs persist the board plus the same financial and operational issues the workspace shows.
    // A failed read does not sync, so a real blocker cannot be auto-resolved.
    const financial = await readFinancialReconciliation(
      supabaseAdmin,
      data.restaurantId,
      property.businessDate,
      property.timezone,
      property.currency,
    );
    const operational = await readOperationalReconciliation(
      supabaseAdmin,
      data.restaurantId,
      property.businessDate,
      property.timezone,
    );
    if ((run.status === "open" || run.status === "ready") && financial.ok && operational.ok) {
      await syncRunExceptions(
        supabaseAdmin,
        data.restaurantId,
        run.id,
        auditExceptionSet(blockers, evaluation.exceptions, financial.result, operational.result),
      );
    }

    const finalRows = await selectAll<ExceptionRow>((from, to) =>
      supabaseAdmin
        .from("night_audit_exceptions")
        .select("*")
        .eq("night_audit_run_id", run.id)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const overrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, run.id);
    const overrideNames = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      [...overrides.values()].map((row) => row.overridden_by_membership_id),
    );
    const sources =
      run.status === "open" || run.status === "ready"
        ? liveExceptionSources(
            financial.ok ? financial.result : null,
            operational.ok ? operational.result : null,
          )
        : new Map<string, ExceptionSource>();
    const exceptions = finalRows
      .slice()
      .sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id))
      .map((row) => toException(row, me.role, sources, overrides, overrideNames));

    const blockingCount = exceptions.filter(
      (e) => e.severity === "blocking" && e.status === "open" && !e.fiscalOverride,
    ).length;
    const warningCount = exceptions.filter(
      (e) => e.severity === "warning" && e.status === "open",
    ).length;

    const financialStatus: NightAuditFinancialStatus = financial.ok
      ? effectiveFinancialStatus(financial.result, finalRows, overrides)
      : "unavailable";
    const operationalStatus: NightAuditOperationalStatus = operational.ok
      ? operational.result.status
      : "unavailable";
    const overallStatus = nightAuditOverallStatus({
      closed: run.status === "closed",
      boardBlockers: remainingBlockerCount(blockers),
      boardUnavailable: boardUnavailable(blockers),
      openBlockingExceptions: blockingCount,
      financial: financialStatus,
      operational: operationalStatus,
      warnings: warningCount,
    });
    if (run.status === "open" || run.status === "ready") {
      const nextStatus =
        nightAuditAllowsClose(overallStatus) &&
        financialAllowsClose(financialStatus) &&
        operationalAllowsClose(operationalStatus)
          ? "ready"
          : "open";
      if (nextStatus !== run.status) {
        await supabaseAdmin
          .from("night_audit_runs")
          .update({ status: nextStatus })
          .eq("id", run.id);
        run.status = nextStatus;
      }
    }

    const { data: lastClosedRow } = await supabaseAdmin
      .from("night_audit_runs")
      .select("id, business_date, closed_at, closed_by_membership_id, summary")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "closed")
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastClosedRaw = lastClosedRow as {
      id: string;
      business_date: string;
      closed_at: string | null;
      closed_by_membership_id: string | null;
      summary: AuditSummary | null;
    } | null;

    const names = await staffNames(supabaseAdmin, data.restaurantId, [
      run.started_by_membership_id ?? "",
      run.closed_by_membership_id ?? "",
      lastClosedRaw?.closed_by_membership_id ?? "",
    ]);
    const lastClosedOtb: NightAuditOtbState | null = lastClosedRaw
      ? ((
          await otbStates(supabaseAdmin, data.restaurantId, [
            { business_date: lastClosedRaw.business_date, status: "closed" },
          ])
        ).get(lastClosedRaw.business_date.slice(0, 10)) ?? "unknown")
      : null;

    const lastClosed: NaLastClosed | null = lastClosedRaw
      ? {
          who: lastClosedRaw.closed_by_membership_id
            ? (names.get(lastClosedRaw.closed_by_membership_id) ?? null)
            : null,
          when: lastClosedRaw.closed_at,
          previousBusinessDate:
            lastClosedRaw.summary?.previousBusinessDate ?? lastClosedRaw.business_date,
          nextBusinessDate:
            lastClosedRaw.summary?.nextBusinessDate ??
            nextBusinessDate(lastClosedRaw.business_date),
        }
      : null;

    return {
      businessDate: property.businessDate,
      currency: property.currency,
      timezone: property.timezone,
      run: {
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
        summary: presentRunSummary((run.summary as AuditSummary | null) ?? null, me.role),
      },
      checks: presentRunSummary({ checks: evaluation.checks }, me.role)?.checks ?? [],
      exceptions,
      blockingCount,
      warningCount,
      noShows: stayDetail ? evaluation.noShows : [],
      overstays: stayDetail ? evaluation.overstays : [],
      shifts: financialDetail ? evaluation.shifts : [],
      finance: financialDetail ? evaluation.finance : null,
      canClose:
        (run.status === "open" || run.status === "ready") && nightAuditAllowsClose(overallStatus),
      blockers,
      workspaceStatus: workspaceStatus({ closed: run.status === "closed", rows: blockers }),
      lastClosed,
      lastClosedRunId: lastClosedRaw?.id ?? null,
      overallStatus,
      financialStatus,
      operationalStatus,
      checkedAt,
      persistedBusinessDate: property.persistedBusinessDate,
      lastClosedOtb,
      canRetryOtb:
        canConfirmNightAudit(me.role) &&
        lastClosedRaw != null &&
        lastClosedOtb === "not_captured" &&
        canRetryOtbSnapshot({
          runStatus: "closed",
          runBusinessDate: lastClosedRaw.business_date.slice(0, 10),
          persistedBusinessDate: property.persistedBusinessDate,
        }),
      nightAuditWindow: evaluateNightAuditWindow({
        ...(await loadNightAuditWindowConfig(supabaseAdmin, data.restaurantId)),
        timezone: property.timezone,
        role: me.role,
      }),
    };
  });

/* --------------------------------------------------------- exception admin */

/**
 * A deliberately narrow authorization: owner/manager may exempt one canonical
 * fiscal blocker from the close gate for this open business-date run. It never
 * updates the fiscal document, its exception severity/status, or a non-fiscal
 * finding.
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
    // requireCashierManager is owner/manager only and verifies property membership.
    const me = await requireCashierManager(context as never, data.restaurantId);
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
    const inserted = await (supabaseAdmin as any).from("night_audit_fiscal_overrides").insert({
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
    return { ok: true };
  });

export const updateException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      restaurantId: string;
      exceptionId: string;
      action: "resolve" | "ignore";
      note?: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          exceptionId: idSchema,
          action: z.enum(["resolve", "ignore"]),
          note: z.string().max(300).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("night_audit_exceptions")
      .select("id, exception_type, severity, status, night_audit_run_id")
      .eq("id", data.exceptionId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Exception not found for this property." };
    const exception = row as {
      exception_type: string;
      severity: string;
      status: string;
      night_audit_run_id: string;
    };

    // No manual "resolved": rows resolve only when a recheck no longer derives them.
    if (data.action === "resolve") {
      return {
        ok: false,
        message:
          "Exceptions clear automatically once the underlying record is corrected and Night Audit is rechecked.",
      };
    }
    if (exception.severity === "blocking" || NON_IGNORABLE_TYPES.has(exception.exception_type)) {
      return {
        ok: false,
        message: "This integrity exception can't be ignored — fix the underlying record.",
      };
    }
    const { data: runRow } = await supabaseAdmin
      .from("night_audit_runs")
      .select("status")
      .eq("id", exception.night_audit_run_id)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!runRow || !canSyncRunExceptions((runRow as { status: string }).status)) {
      return { ok: false, message: "This run is closed. Its exceptions are history." };
    }

    const { error } = await supabaseAdmin
      .from("night_audit_exceptions")
      .update({
        status: "ignored",
        resolved_by_membership_id: me.id,
        resolved_at: new Date().toISOString(),
        resolution_note: (data.note ?? "").trim() || null,
      })
      .eq("id", data.exceptionId)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false, message: nightAuditError(error.message).message };
    return { ok: true };
  });

/* -------------------------------------------------------------- day close */

export const closeBusinessDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { restaurantId: string; runId: string; notes?: string; expectedBusinessDate?: string }) =>
      z
        .object({
          restaurantId: idSchema,
          runId: idSchema,
          notes: z.string().max(500).optional(),
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
      | {
          ok: true;
          businessDate: string;
          nextBusinessDate: string;
          alreadyClosed: boolean;
          otbSnapshotStatus?: "captured" | "already_present" | "failed";
          otbSnapshotError?: string | null;
          /** From the persisted run. Never the current caller unless they won the close. */
          closedAt: string | null;
          closedBy: string | null;
          closedByMembershipId: string | null;
          financialStatus: NightAuditFinancialStatus | null;
          operationalStatus: NightAuditOperationalStatus | null;
          warningCount: number | null;
          /** False when this request did not close the run, or the note write failed after close. */
          noteSaved: boolean;
        }
      | {
          ok: false;
          message: string;
          code?: typeof NIGHT_AUDIT_OUTSIDE_WINDOW | typeof NIGHT_AUDIT_INVALID_WINDOW;
        }
    > => {
      const me = await requireCashierManager(context as never, data.restaurantId);
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

      // Everything here comes from the persisted closed run, never from this request.
      // OTB capture is insert-once, so a retry reuses the existing snapshot.
      const alreadyClosedResult = async (closedRun: PersistedCloseRow) => {
        const facts = persistedCloseFacts(closedRun);
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
          ok: true as const,
          businessDate: facts.businessDate,
          nextBusinessDate: facts.nextBusinessDate,
          alreadyClosed: true,
          otbSnapshotStatus: snapshot.status,
          otbSnapshotError: snapshot.error ?? null,
          closedAt: facts.closedAt,
          closedBy: closer,
          closedByMembershipId: facts.closedByMembershipId,
          financialStatus: null,
          operationalStatus: null,
          warningCount: facts.warningCount,
          noteSaved: false,
        };
      };

      // A request that lost a close race reports the winning close, not its own rejection.
      const rejected = async (message: string) => {
        const latest = await readRun();
        if (latest?.status === "closed") return alreadyClosedResult(latest);
        return { ok: false as const, message };
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
        return rejected(
          "Night Audit could not confirm this business date. Close stays unavailable.",
        );
      }
      if ((laterClosed ?? []).length > 0) {
        return rejected(NA1_STALE_BUSINESS_DATE);
      }

      // Additional condition only: an owner bypasses the time, never a blocker or check below.
      const closeWindow = evaluateNightAuditWindow({
        ...(await loadNightAuditWindowConfig(supabaseAdmin, data.restaurantId)),
        timezone: property.timezone,
        role: me.role,
      });
      if (!closeWindow.allowsClose) {
        return {
          ok: false,
          message: closeWindow.message,
          code: closeWindow.configValid ? NIGHT_AUDIT_OUTSIDE_WINDOW : NIGHT_AUDIT_INVALID_WINDOW,
        };
      }

      // Re-read the same financial reconciliation the workspace shows, then sync it
      // before the close RPC. A failed read does not sync and does not advance the date.
      const evaluation = await evaluateAudit(
        supabaseAdmin,
        data.restaurantId,
        runDate,
        property.currency,
        property.timezone,
      );
      const blockers = await evaluateNa1Blockers(
        supabaseAdmin,
        data.restaurantId,
        runDate,
        folioLaneForRole(me.role),
        integrityBlockerCounts(evaluation.exceptions),
        nightAuditFeedCounts(evaluation.exceptions),
      );
      const financial = await readFinancialReconciliation(
        supabaseAdmin,
        data.restaurantId,
        runDate,
        property.timezone,
        property.currency,
      );
      if (!financial.ok) {
        return rejected(FINANCIAL_UNAVAILABLE_MESSAGE);
      }
      const operational = await readOperationalReconciliation(
        supabaseAdmin,
        data.restaurantId,
        runDate,
        property.timezone,
      );
      if (!operational.ok) {
        return rejected(OPERATIONAL_UNAVAILABLE_MESSAGE);
      }
      await syncRunExceptions(
        supabaseAdmin,
        data.restaurantId,
        run.id,
        auditExceptionSet(blockers, evaluation.exceptions, financial.result, operational.result),
      );
      const closeExceptionRows = await selectAll<ExceptionRow>((from, to) =>
        supabaseAdmin
          .from("night_audit_exceptions")
          .select("*")
          .eq("night_audit_run_id", run.id)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const closeOverrides = await fiscalOverridesForRun(supabaseAdmin, data.restaurantId, run.id);
      const closeFinancialStatus = effectiveFinancialStatus(
        financial.result,
        closeExceptionRows,
        closeOverrides,
      );
      if (
        remainingBlockerCount(blockers) > 0 ||
        !financialAllowsClose(closeFinancialStatus) ||
        !operationalAllowsClose(operational.result.status)
      ) {
        return rejected(
          "Live blockers are still open. Clear them in Front Office, Housekeeping, Room & Inventory, or Cashiering before closing.",
        );
      }

      let openBlockingRows: Array<{ id: string }> = [];
      try {
        openBlockingRows = await selectAll<{ id: string }>((from, to) =>
          supabaseAdmin
            .from("night_audit_exceptions")
            .select("id")
            .eq("night_audit_run_id", run.id)
            .eq("severity", "blocking")
            .eq("status", "open")
            .order("id", { ascending: true })
            .range(from, to),
        );
      } catch {
        return rejected("Blocking exceptions could not be confirmed. Close stays unavailable.");
      }
      const openBlocking = openBlockingRows.filter((row) => !closeOverrides.has(row.id));
      if (openBlocking.length > 0) {
        return rejected("Blocking exceptions are still open for this business date.");
      }
      const overallStatus = nightAuditOverallStatus({
        closed: false,
        boardBlockers: remainingBlockerCount(blockers),
        boardUnavailable: boardUnavailable(blockers),
        openBlockingExceptions: openBlocking.length,
        financial: closeFinancialStatus,
        operational: operational.result.status,
        warnings: 0,
      });
      if (!nightAuditAllowsClose(overallStatus)) {
        return rejected("A required Night Audit check is unavailable. Close stays blocked.");
      }

      let rows: Array<{ severity: string; status: string }> = [];
      try {
        rows = await selectAll<{ severity: string; status: string }>((from, to) =>
          supabaseAdmin
            .from("night_audit_exceptions")
            .select("severity, status")
            .eq("night_audit_run_id", run.id)
            .order("id", { ascending: true })
            .range(from, to),
        );
      } catch {
        return rejected(
          "Night Audit could not confirm this business date. Close stays unavailable.",
        );
      }

      const rolledTo = nextBusinessDate(runDate);
      const closeRequestId = crypto.randomUUID();
      const summary = {
        finance: evaluation.finance,
        warnings: rows.filter((r) => r.severity === "warning").length,
        blockingResolved: rows.filter((r) => r.severity === "blocking").length,
        inHouse: evaluation.inHouseUnits,
        overstays: evaluation.overstays.length,
        checks: evaluation.checks,
        blockers: snapshotBlockers(blockers),
        previousBusinessDate: runDate,
        nextBusinessDate: rolledTo,
        financialBlockerCount: Math.max(
          0,
          financial.result.summary.blockerCount - closeOverrides.size,
        ),
        fiscalOverrideCount: closeOverrides.size,
        financialWarningCount: financial.result.summary.warningCount,
        openDrawerCount: financial.result.summary.openDrawerCount,
        fiscalProblemCount: financial.result.summary.fiscalProblemCount,
        taxByCurrency: financial.result.taxSummary.map((row) => ({
          currency: row.currency,
          tax: row.tax,
          serviceCharge: row.serviceCharge,
        })),
        operationalBlockerCount: operational.result.summary.blockerCount,
        operationalWarningCount: operational.result.summary.warningCount,
        unresolvedArrivalCount: operational.result.summary.unresolvedArrivalCount,
        overstayCount: operational.result.summary.overstayCount,
        roomConflictCount: operational.result.summary.roomConflictCount,
        overbookingIssueCount: operational.result.summary.overbookingIssueCount,
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

      // Analytics only. Never roll back a completed close if snapshot capture fails.
      const snapshot = await captureOtbAfterClose(
        supabaseAdmin,
        data.restaurantId,
        run.business_date,
      );
      const closer = closed.closedByMembershipId
        ? ((await staffNames(supabaseAdmin, data.restaurantId, [closed.closedByMembershipId])).get(
            closed.closedByMembershipId,
          ) ?? null)
        : null;
      return {
        ok: true,
        businessDate: closed.businessDate,
        nextBusinessDate: closed.nextBusinessDate,
        alreadyClosed: false,
        otbSnapshotStatus: snapshot.status,
        otbSnapshotError: snapshot.error ?? null,
        closedAt: closed.closedAt,
        closedBy: closer,
        closedByMembershipId: closed.closedByMembershipId,
        noteSaved,
        financialStatus: financial.result.status,
        operationalStatus: operational.result.status,
        warningCount: rows.filter((r) => r.severity === "warning" && r.status === "open").length,
      };
    },
  );

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
      await requireCashierManager(context as never, data.restaurantId);
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
      return { ok: true, status: snapshot.status, error: snapshot.error ?? null };
    },
  );

/* ------------------------------------------------------------------ history */

export const listNightAuditRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditRunRow[]> => {
    const me = await requireNightAuditView(context as never, data.restaurantId);
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
    return list.map((r) => toRunRow(r, names, me.role));
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

/** Stored run as one role may see it. The summary is what close wrote; it is never recomputed. */
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
    const me = await requireNightAuditView(context as never, data.restaurantId);
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
          me.role,
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
      const me = await requireNightAuditView(context as never, data.restaurantId);
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
      const overrideNames = await staffNames(
        supabaseAdmin,
        data.restaurantId,
        [...history.values()].flat().map((override) => override.overridden_by_membership_id),
      );
      return {
        currency: property.currency,
        run: toRunRow(r, names, me.role, otb),
        exceptions: exRows.map((ex) =>
          toException(ex, me.role, new Map(), overrides, overrideNames, history),
        ),
      };
    },
  );
