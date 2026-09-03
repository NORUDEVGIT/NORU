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
  canManageCashiering,
  requireCashierManager,
  requireCashieringAccess,
} from "./cashiering.server";
import { callerMembership } from "./workforce.server";
import { propertyToday } from "./reservation-dates";
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
}

export interface NightAuditRunRow {
  id: string;
  businessDate: string;
  status: "open" | "ready" | "closed" | "failed";
  startedAt: string;
  closedAt: string | null;
  startedBy: string | null;
  closedBy: string | null;
  summary: AuditSummary | null;
}

export interface AuditSummary {
  finance: AuditFinance;
  warnings: number;
  blockingResolved: number;
  inHouse: number;
  checks: AreaCheck[];
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
  finance: AuditFinance;
  canClose: boolean;
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
  return {
    timezone: row.timezone,
    currency: row.currency_code,
    businessDate: row.business_date ?? propertyToday(row.timezone),
  };
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
};

function toException(row: ExceptionRow): AuditException {
  return {
    id: row.id,
    exceptionType: row.exception_type,
    severity: row.severity,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    message: row.message,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    canIgnore: row.severity === "warning" && !NON_IGNORABLE_TYPES.has(row.exception_type),
  };
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

/* ------------------------------------------------------------------ access */

export const getNightAuditAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    return { canManage: canManageCashiering(me.role), role: me.role };
  });

/* -------------------------------------------------------------- run / sync */

export const runNightAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditState> => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const property = await loadProperty(supabaseAdmin, data.restaurantId);

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
      status: "open" | "ready" | "closed" | "failed";
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
    );

    // A closed business date is immutable — report it, never re-derive it.
    if (run.status !== "closed") {
      const { data: existingRows } = await supabaseAdmin
        .from("night_audit_exceptions")
        .select("*")
        .eq("night_audit_run_id", run.id);
      const existing = (existingRows ?? []) as ExceptionRow[];
      const key = (t: string, r: string | null) => `${t}::${r ?? ""}`;
      const derivedKeys = new Set(
        evaluation.exceptions.map((e) => key(e.exceptionType, e.referenceId)),
      );

      const inserts = evaluation.exceptions
        .filter(
          (e) =>
            !existing.some(
              (x) => key(x.exception_type, x.reference_id) === key(e.exceptionType, e.referenceId),
            ),
        )
        .map((e) => ({
          restaurant_id: data.restaurantId,
          night_audit_run_id: run.id,
          exception_type: e.exceptionType,
          severity: e.severity,
          reference_type: e.referenceType,
          reference_id: e.referenceId,
          message: e.message,
        }));
      if (inserts.length > 0) await supabaseAdmin.from("night_audit_exceptions").insert(inserts);

      // Conditions that no longer hold resolve themselves; never deleted.
      const cleared = existing
        .filter(
          (x) => x.status === "open" && !derivedKeys.has(key(x.exception_type, x.reference_id)),
        )
        .map((x) => x.id);
      if (cleared.length > 0) {
        await supabaseAdmin
          .from("night_audit_exceptions")
          .update({
            status: "resolved",
            resolved_at: new Date().toISOString(),
            resolution_note: "Cleared automatically — the underlying issue was fixed.",
          })
          .in("id", cleared);
      }

      // A blocking condition that came back reopens, whatever a human recorded.
      const reopen = existing
        .filter(
          (x) =>
            x.status !== "open" &&
            x.severity === "blocking" &&
            derivedKeys.has(key(x.exception_type, x.reference_id)),
        )
        .map((x) => x.id);
      if (reopen.length > 0) {
        await supabaseAdmin
          .from("night_audit_exceptions")
          .update({ status: "open", resolved_at: null, resolution_note: null })
          .in("id", reopen);
      }
    }

    const { data: finalRows } = await supabaseAdmin
      .from("night_audit_exceptions")
      .select("*")
      .eq("night_audit_run_id", run.id)
      .order("severity", { ascending: true })
      .order("created_at", { ascending: true });
    const exceptions = ((finalRows ?? []) as ExceptionRow[]).map(toException);

    const blockingCount = exceptions.filter(
      (e) => e.severity === "blocking" && e.status === "open",
    ).length;
    const warningCount = exceptions.filter(
      (e) => e.severity === "warning" && e.status === "open",
    ).length;

    if (run.status !== "closed") {
      const nextStatus = blockingCount === 0 ? "ready" : "open";
      if (nextStatus !== run.status) {
        await supabaseAdmin
          .from("night_audit_runs")
          .update({ status: nextStatus })
          .eq("id", run.id);
        run.status = nextStatus;
      }
    }

    const names = await staffNames(supabaseAdmin, data.restaurantId, [
      run.started_by_membership_id ?? "",
      run.closed_by_membership_id ?? "",
    ]);

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
        summary: (run.summary as AuditSummary | null) ?? null,
      },
      checks: evaluation.checks,
      exceptions,
      blockingCount,
      warningCount,
      noShows: evaluation.noShows,
      overstays: evaluation.overstays,
      shifts: evaluation.shifts,
      finance: evaluation.finance,
      canClose: run.status !== "closed" && blockingCount === 0,
    };
  });

/* --------------------------------------------------------- exception admin */

export const updateException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
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
      .select("id, exception_type, severity, status")
      .eq("id", data.exceptionId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) return { ok: false, message: "Exception not found for this property." };
    const exception = row as { exception_type: string; severity: string; status: string };

    if (data.action === "ignore") {
      if (exception.severity === "blocking" || NON_IGNORABLE_TYPES.has(exception.exception_type)) {
        return {
          ok: false,
          message: "This integrity exception can't be ignored — fix the underlying record.",
        };
      }
    } else if (exception.severity === "blocking") {
      return {
        ok: false,
        message: "Blocking exceptions clear themselves once the underlying record is corrected.",
      };
    }

    const { error } = await supabaseAdmin
      .from("night_audit_exceptions")
      .update({
        status: data.action === "ignore" ? "ignored" : "resolved",
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
  .inputValidator((d: { restaurantId: string; runId: string }) =>
    z.object({ restaurantId: idSchema, runId: idSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; businessDate: string; nextBusinessDate: string; alreadyClosed: boolean }
      | { ok: false; message: string }
    > => {
      const me = await requireCashierManager(context as never, data.restaurantId);
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

      if (run.status === "closed") {
        return {
          ok: true,
          businessDate: run.business_date,
          nextBusinessDate: property.businessDate,
          alreadyClosed: true,
        };
      }

      // Never trust the browser's view of the checklist — re-derive everything.
      const evaluation = await evaluateAudit(
        supabaseAdmin,
        data.restaurantId,
        run.business_date,
        property.currency,
      );
      if (evaluation.exceptions.some((e) => e.severity === "blocking")) {
        return {
          ok: false,
          message:
            "Blocking exceptions are still open. Refresh the audit and resolve them before closing.",
        };
      }

      const { data: openBlocking } = await supabaseAdmin
        .from("night_audit_exceptions")
        .select("id")
        .eq("night_audit_run_id", run.id)
        .eq("severity", "blocking")
        .eq("status", "open");
      if ((openBlocking ?? []).length > 0) {
        return { ok: false, message: "Blocking exceptions are still open for this business date." };
      }

      const { data: allExceptions } = await supabaseAdmin
        .from("night_audit_exceptions")
        .select("severity, status")
        .eq("night_audit_run_id", run.id);
      const rows = (allExceptions ?? []) as Array<{ severity: string; status: string }>;

      const summary = {
        finance: evaluation.finance,
        warnings: rows.filter((r) => r.severity === "warning").length,
        blockingResolved: rows.filter((r) => r.severity === "blocking").length,
        inHouse: evaluation.overstays.length,
        checks: evaluation.checks,
      };

      const { error } = await supabaseAdmin.rpc("close_business_date", {
        _restaurant_id: data.restaurantId,
        _run_id: run.id,
        _summary: summary as never,
        _membership_id: me.id,
      });
      if (error) return { ok: false, message: nightAuditError(error.message).message };

      const after = await loadProperty(supabaseAdmin, data.restaurantId);
      return {
        ok: true,
        businessDate: run.business_date,
        nextBusinessDate: after.businessDate,
        alreadyClosed: false,
      };
    },
  );

/* ------------------------------------------------------------------ history */

export const listNightAuditRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<NightAuditRunRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("night_audit_runs")
      .select(
        "id, business_date, status, started_at, closed_at, started_by_membership_id, closed_by_membership_id, summary",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("business_date", { ascending: false })
      .limit(60);
    const list = (rows ?? []) as Array<{
      id: string;
      business_date: string;
      status: "open" | "ready" | "closed" | "failed";
      started_at: string;
      closed_at: string | null;
      started_by_membership_id: string | null;
      closed_by_membership_id: string | null;
      summary: unknown;
    }>;
    const names = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      list.flatMap((r) => [r.started_by_membership_id ?? "", r.closed_by_membership_id ?? ""]),
    );
    return list.map((r) => ({
      id: r.id,
      businessDate: r.business_date,
      status: r.status,
      startedAt: r.started_at,
      closedAt: r.closed_at,
      startedBy: r.started_by_membership_id
        ? (names.get(r.started_by_membership_id) ?? null)
        : null,
      closedBy: r.closed_by_membership_id ? (names.get(r.closed_by_membership_id) ?? null) : null,
      summary: (r.summary as AuditSummary | null) ?? null,
    }));
  });

export const getNightAuditRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; runId: string }) =>
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
      await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const property = await loadProperty(supabaseAdmin, data.restaurantId);
      const { data: row } = await supabaseAdmin
        .from("night_audit_runs")
        .select(
          "id, business_date, status, started_at, closed_at, started_by_membership_id, closed_by_membership_id, summary",
        )
        .eq("id", data.runId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!row) return null;
      const r = row as {
        id: string;
        business_date: string;
        status: "open" | "ready" | "closed" | "failed";
        started_at: string;
        closed_at: string | null;
        started_by_membership_id: string | null;
        closed_by_membership_id: string | null;
        summary: unknown;
      };
      const names = await staffNames(supabaseAdmin, data.restaurantId, [
        r.started_by_membership_id ?? "",
        r.closed_by_membership_id ?? "",
      ]);
      const { data: exRows } = await supabaseAdmin
        .from("night_audit_exceptions")
        .select("*")
        .eq("night_audit_run_id", r.id)
        .order("created_at", { ascending: true });
      return {
        currency: property.currency,
        run: {
          id: r.id,
          businessDate: r.business_date,
          status: r.status,
          startedAt: r.started_at,
          closedAt: r.closed_at,
          startedBy: r.started_by_membership_id
            ? (names.get(r.started_by_membership_id) ?? null)
            : null,
          closedBy: r.closed_by_membership_id
            ? (names.get(r.closed_by_membership_id) ?? null)
            : null,
          summary: (r.summary as AuditSummary | null) ?? null,
        },
        exceptions: ((exRows ?? []) as ExceptionRow[]).map(toException),
      };
    },
  );
