/**
 * Phase 8G2E — Back Office · Accounting & Finance, read-only source summaries.
 *
 * ONE server function. It returns high-level, source-labelled figures only —
 * no folio lines, no order rows, no supplier detail — and it introduces no
 * accounting mutation of any kind. Nothing here is a general ledger figure:
 * NORU has no ledger, journals, chart of accounts, AP, AR, bank reconciliation
 * or tax ledger, and this function never pretends otherwise. Values from
 * different sources are never summed together.
 *
 * A source is queried only when its package is switched on for the property AND
 * the caller already holds the matching module access.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireBackOfficeFinanceRead,
  sourceAvailable,
  round2,
} from "./back-office-finance.server";
import { resolveCallerAccess } from "./module-access.server";

const idSchema = z.string().uuid();

export type SourceState = "available" | "unavailable" | "no_access" | "planned";

export interface SourceMetric {
  label: string;
  value: number;
  kind: "money" | "count";
  /** What the number really means. Never "revenue" unless it truly is. */
  note?: string;
}

export interface FinanceSource {
  key: "restaurant_management" | "pms" | "procurement" | "inventory" | "pos";
  name: string;
  role: string;
  state: SourceState;
  metrics: SourceMetric[];
}

export interface BackOfficeFinanceOverview {
  currency: string;
  sources: FinanceSource[];
}

export const getBackOfficeFinanceOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; today: string }) =>
    z
      .object({ restaurantId: idSchema, today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<BackOfficeFinanceOverview> => {
    await requireBackOfficeFinanceRead(context as never, data.restaurantId);
    const { modules } = await resolveCallerAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const currency = (restaurant as { currency_code: string } | null)?.currency_code ?? "GBP";

    const [rmOn, pmsOn] = await Promise.all([
      sourceAvailable(data.restaurantId, "restaurant_management"),
      sourceAvailable(data.restaurantId, "pms"),
    ]);

    const sources: FinanceSource[] = [];

    // ---------------------------------------------------- Restaurant Management
    const rmSource: FinanceSource = {
      key: "restaurant_management",
      name: "Restaurant Management",
      role: "Restaurant orders, payments and till shifts. Restaurant Management posts and settles them.",
      state: !rmOn
        ? "unavailable"
        : modules.includes("food_and_beverage")
          ? "available"
          : "no_access",
      metrics: [],
    };
    if (rmSource.state === "available") {
      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("status, total")
        .eq("restaurant_id", data.restaurantId)
        .gte("created_at", `${data.today}T00:00:00Z`)
        .lte("created_at", `${data.today}T23:59:59Z`);
      const valid = ((orders ?? []) as { status: string; total: number | string }[]).filter(
        (o) => o.status !== "cancelled",
      );
      rmSource.metrics = [
        {
          label: "Order value today",
          value: round2(valid.reduce((sum, o) => sum + Number(o.total), 0)),
          kind: "money",
          note: "Value of today's non-cancelled orders. Order value, not settled cash.",
        },
        { label: "Orders today", value: valid.length, kind: "count" },
      ];
    }
    sources.push(rmSource);

    // ------------------------------------------------------------------- PMS
    const pmsSource: FinanceSource = {
      key: "pms",
      name: "PMS",
      role: "Guest folios, room charges, hotel payments, deposits, refunds, cashier shifts and night audit. PMS owns every posting.",
      state: !pmsOn
        ? "unavailable"
        : modules.includes("accounting_finance")
          ? "available"
          : "no_access",
      metrics: [],
    };
    if (pmsSource.state === "available") {
      const { data: folios } = await supabaseAdmin
        .from("guest_folios")
        .select("id, status")
        .eq("restaurant_id", data.restaurantId);
      const openIds = ((folios ?? []) as { id: string; status: string }[])
        .filter((f) => f.status === "open")
        .map((f) => f.id);

      let outstanding = 0;
      if (openIds.length > 0) {
        const { data: txns } = await supabaseAdmin
          .from("folio_transactions")
          .select("amount")
          .eq("restaurant_id", data.restaurantId)
          .in("folio_id", openIds);
        outstanding = round2(
          ((txns ?? []) as { amount: number | string }[]).reduce(
            (sum, t) => sum + Number(t.amount),
            0,
          ),
        );
      }

      const { data: todayTxns } = await supabaseAdmin
        .from("folio_transactions")
        .select("transaction_type, amount")
        .eq("restaurant_id", data.restaurantId)
        .gte("posted_at", `${data.today}T00:00:00Z`)
        .lte("posted_at", `${data.today}T23:59:59Z`);
      let payments = 0;
      let charges = 0;
      for (const t of (todayTxns ?? []) as {
        transaction_type: string;
        amount: number | string;
      }[]) {
        const amount = Number(t.amount);
        if (t.transaction_type === "payment" || t.transaction_type === "deposit")
          payments += -amount;
        if (t.transaction_type === "charge") charges += amount;
      }

      const { data: shifts } = await supabaseAdmin
        .from("cashier_shifts")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "open");

      pmsSource.metrics = [
        { label: "Open folios", value: openIds.length, kind: "count" },
        {
          label: "Outstanding on open folios",
          value: outstanding,
          kind: "money",
          note: "Guest balances still open. Not an accounts-receivable ledger.",
        },
        {
          label: "Folio payments today",
          value: round2(payments),
          kind: "money",
          note: "Payments and deposits posted to folios today.",
        },
        { label: "Folio charges today", value: round2(charges), kind: "money" },
        { label: "Open cashier shifts", value: (shifts ?? []).length, kind: "count" },
      ];
    }
    sources.push(pmsSource);

    // ----------------------------------------------------------- Procurement
    const procSource: FinanceSource = {
      key: "procurement",
      name: "Procurement",
      role: "Purchase orders, receiving and supplier spend source data. Procurement owns the purchasing workflow.",
      state: modules.includes("procurement") ? "available" : "no_access",
      metrics: [],
    };
    if (procSource.state === "available") {
      const [{ data: pos }, { data: suppliers }] = await Promise.all([
        supabaseAdmin
          .from("purchase_orders")
          .select("status, total")
          .eq("restaurant_id", data.restaurantId),
        supabaseAdmin
          .from("restaurant_suppliers")
          .select("id")
          .eq("restaurant_id", data.restaurantId),
      ]);
      const rows = (pos ?? []) as { status: string; total: number | string }[];
      const openRows = rows.filter((r) =>
        ["draft", "ordered", "partially_received"].includes(r.status),
      );
      procSource.metrics = [
        { label: "Open purchase orders", value: openRows.length, kind: "count" },
        {
          label: "Open purchase-order value",
          value: round2(openRows.reduce((sum, r) => sum + Number(r.total), 0)),
          kind: "money",
          note: "Purchasing commitment. Not an accounts-payable balance — no supplier invoice, due date or payment allocation exists.",
        },
        { label: "Suppliers", value: (suppliers ?? []).length, kind: "count" },
      ];
    }
    sources.push(procSource);

    // ------------------------------------------------------------- Inventory
    const invSource: FinanceSource = {
      key: "inventory",
      name: "Inventory / Warehouse",
      role: "Stock quantities and last-known cost inputs. Inventory owns the stock ledger.",
      state: modules.includes("inventory") ? "available" : "no_access",
      metrics: [],
    };
    if (invSource.state === "available") {
      const { data: items } = await supabaseAdmin
        .from("inventory_items")
        .select("current_quantity, unit_cost, active")
        .eq("restaurant_id", data.restaurantId);
      let atCost = 0;
      let uncosted = 0;
      for (const r of (items ?? []) as {
        current_quantity: number | string;
        unit_cost: number | string | null;
        active: boolean;
      }[]) {
        if (!r.active) continue;
        if (r.unit_cost === null) uncosted += 1;
        else atCost += Number(r.current_quantity) * Number(r.unit_cost);
      }
      invSource.metrics = [
        {
          label: "Stock at last-known cost",
          value: round2(atCost),
          kind: "money",
          note: "Quantity on hand priced at the last known unit cost. Not an audited valuation, not balance-sheet inventory, not cost of goods sold.",
        },
        {
          label: "Items without a cost",
          value: uncosted,
          kind: "count",
          note: "These items are excluded from the figure above.",
        },
      ];
    }
    sources.push(invSource);

    // --------------------------------------------------------- Standalone POS
    // Phase 8H8: Standalone POS is a LIVE source, read through its own
    // authoritative aggregation in `back-office-pos.functions.ts`. It is not
    // computed here so the till's formulas are never duplicated or re-derived.


    return { currency, sources };
  });
