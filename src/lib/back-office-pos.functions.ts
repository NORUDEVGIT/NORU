/**
 * Phase 8H8 — Back Office reads Standalone POS.
 *
 * Standalone POS stays authoritative for its own transactions. Back Office is a
 * READ-ONLY consumer: nothing here writes, copies or mirrors a POS row, and no
 * accounting posting, journal or settlement is created. Every figure comes from
 * `buildPosReport` — the same aggregation the POS dashboard and reports screens
 * use — so Back Office can never drift from the till's own numbers.
 *
 * Access order matters and never escalates:
 *   1. the caller must already hold the Back Office finance/report read gate,
 *   2. the `pos` package must be enabled for the property (fail-closed),
 *   3. only then is any POS table read.
 * Holding a Back Office summary NEVER grants operational POS access; whether the
 * caller may follow an operational POS link is reported separately as
 * `operationalAccess`, derived from the `standalone_pos` module + role.
 *
 * Refund date semantics (two distinct, both preserved):
 *   - sales-cohort: refunds are attributed to the business date of the ORIGINAL
 *     receipt, so gross − refunds = net always reconciles inside a range.
 *   - cash activity: `refundsProcessed` counts refunds by when they were
 *     physically processed (`pos_refunds.created_at`) inside the property day.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireBackOfficeFinanceRead, sourceAvailable } from "./back-office-finance.server";
import { resolveCallerAccess } from "./module-access.server";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, zonedMoment, addDaysIso } from "./restaurant-time";
import { propertyToday } from "./reservation-dates";
import { STANDALONE_POS_READ_ROLES } from "./module-access";

const idSchema = z.string().uuid();

export interface BackOfficePosTender {
  method: string;
  taken: number;
  refunded: number;
  net: number;
}

export interface BackOfficePosSummary {
  /** "available" only when the POS package is on and figures were read. */
  state: "available" | "unavailable";
  currency: string;
  businessDate: string;
  /** Sales-cohort figures for the property business date. */
  sales: number;
  gross: number;
  refunds: number;
  net: number;
  /** Cash-activity figure: refunds physically processed during the property day. */
  refundsProcessed: number;
  refundsProcessedCount: number;
  tenders: BackOfficePosTender[];
  openShifts: number;
  /** True only when the caller also holds operational Standalone POS access. */
  operationalAccess: boolean;
}

const UNAVAILABLE = (currency: string, businessDate: string): BackOfficePosSummary => ({
  state: "unavailable",
  currency,
  businessDate,
  sales: 0,
  gross: 0,
  refunds: 0,
  net: 0,
  refundsProcessed: 0,
  refundsProcessedCount: 0,
  tenders: [],
  openShifts: 0,
  operationalAccess: false,
});

/**
 * Narrow, read-only Standalone POS summary for Back Office Reports and
 * Accounting & Finance. Deliberately returns no receipt, line or customer
 * detail — only totals a consolidation layer needs.
 */
export const getBackOfficePosSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { restaurantId: string; businessDate?: string | null }) =>
    z
      .object({
        restaurantId: idSchema,
        businessDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BackOfficePosSummary> => {
    // 1. Back Office read gate (module access + role + back_office package).
    await requireBackOfficeFinanceRead(context as never, data.restaurantId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };

    const { data: property } = await db
      .from("restaurants")
      .select("currency_code, timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const currency = (property?.currency_code as string) || DEFAULT_CURRENCY;
    const timezone = (property?.timezone as string) || DEFAULT_TIMEZONE;
    const businessDate = data.businessDate || propertyToday(timezone);

    // 2. POS package, fail-closed. When off, nothing POS-owned is queried.
    if (!(await sourceAvailable(data.restaurantId, "pos"))) {
      return UNAVAILABLE(currency, businessDate);
    }

    // 3. Same aggregation the till itself reports from. Membership names are
    //    not needed for a summary, so none are resolved.
    const { buildPosReport } = await import("./standalone-pos-reporting.server");
    const report = await buildPosReport(
      db,
      data.restaurantId,
      { fromDate: businessDate, toDate: businessDate },
      currency,
      async () => new Map<string, string>(),
    );

    // Cash-activity view: refunds processed during the property day, by the
    // moment they happened — a different question from the cohort figure above.
    const dayStart = zonedMoment(businessDate, "00:00:00", timezone).toISOString();
    const dayEnd = zonedMoment(addDaysIso(businessDate, 1), "00:00:00", timezone).toISOString();
    const { data: processedRows } = await db
      .from("pos_refunds")
      .select("amount")
      .eq("restaurant_id", data.restaurantId)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd);
    const processed = (processedRows ?? []) as { amount: number | string }[];

    const { data: openShiftRows } = await db
      .from("pos_cashier_shifts")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");

    // Operational access is a separate question from the Back Office read.
    let operationalAccess = false;
    try {
      const access = await resolveCallerAccess(context as never, data.restaurantId);
      operationalAccess =
        access.modules.includes("standalone_pos") &&
        (STANDALONE_POS_READ_ROLES as readonly string[]).includes(access.membership.role);
    } catch {
      operationalAccess = false;
    }

    return {
      state: "available",
      currency,
      businessDate,
      sales: report.summary.sales,
      gross: report.summary.gross,
      refunds: report.summary.refunds,
      net: report.summary.net,
      refundsProcessed:
        Math.round(processed.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100,
      refundsProcessedCount: processed.length,
      tenders: report.tenders.map((t) => ({
        method: t.method,
        taken: t.taken,
        refunded: t.refunded,
        net: t.net,
      })),
      openShifts: (openShiftRows ?? []).length,
      operationalAccess,
    };
  });
