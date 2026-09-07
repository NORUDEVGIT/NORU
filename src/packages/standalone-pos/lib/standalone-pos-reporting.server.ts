/**
 * Phase 8H7 — Standalone POS reporting aggregation, server-only.
 *
 * One place computes every POS figure, so the dashboard and the reports
 * screen can never disagree. Reads ONLY this package's own tables:
 * pos_sales, pos_sale_items, pos_payments, pos_refunds, pos_cashier_shifts,
 * pos_registers. Never Restaurant Management orders/payments, never the
 * restaurant's own cashier shifts, never PMS folios.
 *
 * Definitions (frozen, mirrored in docs/standalone-pos-architecture.md):
 *   Gross        = sum of totals of sales with status completed,
 *                  partially_refunded or refunded. Voided and open
 *                  (parked) sales are excluded.
 *   Refunds      = sum of recorded pos_refunds amounts, attributed to the
 *                  business date of the ORIGINAL sale so that gross, refunds
 *                  and net always reconcile inside one range.
 *   Net          = gross − refunds. Original sale totals are never rewritten.
 *   Average sale = gross ÷ completed sale count.
 * Tender figures are recorded POS tender activity, not bank settlement.
 */
import { round2 } from "./standalone-pos-pricing.server";

export const COUNTED_STATUSES = ["completed", "partially_refunded", "refunded"] as const;

export interface PosReportRange {
  fromDate: string;
  toDate: string;
}

export interface PosMoneyRow {
  key: string;
  label: string;
  sales: number;
  gross: number;
  refunds: number;
  net: number;
}

export interface PosReportData {
  range: PosReportRange;
  currency: string;
  summary: {
    sales: number;
    gross: number;
    refunds: number;
    net: number;
    averageSale: number;
    itemsSold: number;
    voidedSales: number;
    openSales: number;
    openSalesValue: number;
    refundCount: number;
    partiallyRefundedSales: number;
    refundedSales: number;
  };
  daily: { businessDate: string; sales: number; gross: number; refunds: number; net: number }[];
  tenders: { method: string; payments: number; taken: number; refunded: number; net: number }[];
  products: {
    name: string;
    sku: string | null;
    quantity: number;
    discount: number;
    value: number;
  }[];
  registers: PosMoneyRow[];
  cashiers: PosMoneyRow[];
  refunds: {
    id: string;
    saleId: string;
    reference: string | null;
    businessDate: string;
    amount: number;
    method: string;
    reason: string | null;
    processedBy: string;
    processedAt: string;
    saleStatus: string;
  }[];
  shifts: {
    id: string;
    registerName: string;
    businessDate: string;
    status: string;
    openedBy: string;
    closedBy: string | null;
    openedAt: string;
    closedAt: string | null;
    openingFloat: number;
    cashSales: number;
    cashRefunds: number;
    expectedCash: number | null;
    closingCash: number | null;
    variance: number | null;
  }[];
}

const sum = (rows: number[]) => round2(rows.reduce((a, b) => a + b, 0));

/**
 * Build every reporting figure for one property and one business-date range.
 * `names` resolves membership ids to display names (injected so this module
 * stays free of any auth/membership concerns).
 */
export async function buildPosReport(
  db: any,
  restaurantId: string,
  range: PosReportRange,
  currency: string,
  names: (ids: string[]) => Promise<Map<string, string>>,
): Promise<PosReportData> {
  const salesQuery = db
    .from("pos_sales")
    .select(
      "id, sale_reference, status, business_date, total, refunded_amount, register_id, shift_id, completed_by_membership_id, opened_by_membership_id, cashier_name_snapshot, completed_at, created_at",
    )
    .eq("restaurant_id", restaurantId)
    .gte("business_date", range.fromDate)
    .lte("business_date", range.toDate);

  const [{ data: saleRows }, { data: registerRows }, { data: shiftRows }] = await Promise.all([
    salesQuery,
    db.from("pos_registers").select("id, name").eq("restaurant_id", restaurantId),
    db
      .from("pos_cashier_shifts")
      .select(
        "id, register_id, business_date, status, opening_float, expected_cash, closing_cash, variance, opened_at, closed_at, opened_by_membership_id, closed_by_membership_id",
      )
      .eq("restaurant_id", restaurantId)
      .gte("business_date", range.fromDate)
      .lte("business_date", range.toDate)
      .order("opened_at", { ascending: false }),
  ]);

  const sales = (saleRows ?? []) as any[];
  const counted = sales.filter((s) => (COUNTED_STATUSES as readonly string[]).includes(s.status));
  const countedIds = counted.map((s) => s.id as string);
  const open = sales.filter((s) => s.status === "open");

  const [{ data: itemRows }, { data: paymentRows }, { data: refundRows }] = await Promise.all([
    countedIds.length
      ? db
          .from("pos_sale_items")
          .select("sale_id, product_name_snapshot, sku_snapshot, quantity, discount_amount, line_total")
          .in("sale_id", countedIds)
      : Promise.resolve({ data: [] }),
    countedIds.length
      ? db
          .from("pos_payments")
          .select("sale_id, payment_method, amount, status")
          .eq("restaurant_id", restaurantId)
          .in("sale_id", countedIds)
      : Promise.resolve({ data: [] }),
    countedIds.length
      ? db
          .from("pos_refunds")
          .select("id, sale_id, shift_id, amount, method, reason, created_at, processed_by_membership_id")
          .eq("restaurant_id", restaurantId)
          .in("sale_id", countedIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const items = (itemRows ?? []) as any[];
  const payments = ((paymentRows ?? []) as any[]).filter((p) => p.status !== "voided");
  const refunds = (refundRows ?? []) as any[];
  const shifts = (shiftRows ?? []) as any[];

  const registerName = new Map<string, string>(
    ((registerRows ?? []) as any[]).map((r) => [r.id as string, r.name as string]),
  );

  const membershipIds = [
    ...counted.map((s) => (s.completed_by_membership_id ?? s.opened_by_membership_id) as string),
    ...refunds.map((r) => r.processed_by_membership_id as string),
    ...shifts.map((s) => s.opened_by_membership_id as string),
    ...shifts.map((s) => s.closed_by_membership_id as string),
  ].filter(Boolean);
  const nameMap = await names(membershipIds);
  const nameOf = (id: string | null | undefined) =>
    (id ? nameMap.get(id) : undefined) ?? "A team member";

  /* ------------------------------------------------------------ summary */
  const gross = sum(counted.map((s) => Number(s.total)));
  const refundTotal = sum(refunds.map((r) => Number(r.amount)));
  const net = round2(gross - refundTotal);

  /* -------------------------------------------------------------- daily */
  const dayMap = new Map<string, { sales: number; gross: number; refunds: number }>();
  const dayOf = new Map<string, string>();
  for (const s of counted) {
    const key = s.business_date as string;
    dayOf.set(s.id as string, key);
    const row = dayMap.get(key) ?? { sales: 0, gross: 0, refunds: 0 };
    row.sales += 1;
    row.gross = round2(row.gross + Number(s.total));
    dayMap.set(key, row);
  }
  for (const r of refunds) {
    const key = dayOf.get(r.sale_id as string);
    if (!key) continue;
    const row = dayMap.get(key) ?? { sales: 0, gross: 0, refunds: 0 };
    row.refunds = round2(row.refunds + Number(r.amount));
    dayMap.set(key, row);
  }
  const daily = [...dayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([businessDate, v]) => ({
      businessDate,
      sales: v.sales,
      gross: v.gross,
      refunds: v.refunds,
      net: round2(v.gross - v.refunds),
    }));

  /* ------------------------------------------------------------ tenders */
  const tenderMap = new Map<string, { payments: number; taken: number; refunded: number }>();
  for (const p of payments) {
    const key = p.payment_method as string;
    const row = tenderMap.get(key) ?? { payments: 0, taken: 0, refunded: 0 };
    row.payments += 1;
    row.taken = round2(row.taken + Number(p.amount));
    tenderMap.set(key, row);
  }
  for (const r of refunds) {
    const key = r.method as string;
    const row = tenderMap.get(key) ?? { payments: 0, taken: 0, refunded: 0 };
    row.refunded = round2(row.refunded + Number(r.amount));
    tenderMap.set(key, row);
  }
  const tenders = [...tenderMap.entries()]
    .map(([method, v]) => ({
      method,
      payments: v.payments,
      taken: v.taken,
      refunded: v.refunded,
      net: round2(v.taken - v.refunded),
    }))
    .sort((a, b) => b.taken - a.taken);

  /* ----------------------------------------------------------- products */
  const productMap = new Map<string, { name: string; sku: string | null; quantity: number; discount: number; value: number }>();
  let itemsSold = 0;
  for (const i of items) {
    const name = (i.product_name_snapshot as string) ?? "Item";
    const sku = (i.sku_snapshot as string) ?? null;
    const key = `${name}::${sku ?? ""}`;
    const row = productMap.get(key) ?? { name, sku, quantity: 0, discount: 0, value: 0 };
    row.quantity = round2(row.quantity + Number(i.quantity));
    row.discount = round2(row.discount + Number(i.discount_amount ?? 0));
    row.value = round2(row.value + Number(i.line_total));
    productMap.set(key, row);
    itemsSold = round2(itemsSold + Number(i.quantity));
  }
  const products = [...productMap.values()].sort((a, b) => b.value - a.value);

  /* ------------------------------------------ registers and cashiers */
  const bucket = (
    keyOf: (s: any) => string,
    labelOf: (s: any) => string,
  ): PosMoneyRow[] => {
    const map = new Map<string, { label: string; sales: number; gross: number; refunds: number }>();
    const keyBySale = new Map<string, string>();
    for (const s of counted) {
      const key = keyOf(s);
      keyBySale.set(s.id as string, key);
      const row = map.get(key) ?? { label: labelOf(s), sales: 0, gross: 0, refunds: 0 };
      row.sales += 1;
      row.gross = round2(row.gross + Number(s.total));
      map.set(key, row);
    }
    for (const r of refunds) {
      const key = keyBySale.get(r.sale_id as string);
      if (!key) continue;
      const row = map.get(key);
      if (!row) continue;
      row.refunds = round2(row.refunds + Number(r.amount));
    }
    return [...map.entries()]
      .map(([key, v]) => ({
        key,
        label: v.label,
        sales: v.sales,
        gross: v.gross,
        refunds: v.refunds,
        net: round2(v.gross - v.refunds),
      }))
      .sort((a, b) => b.gross - a.gross);
  };

  const registers = bucket(
    (s) => (s.register_id as string) ?? "none",
    (s) => registerName.get(s.register_id as string) ?? "Unassigned till",
  );
  const cashiers = bucket(
    (s) => ((s.completed_by_membership_id ?? s.opened_by_membership_id) as string) ?? "none",
    (s) =>
      (s.cashier_name_snapshot as string) ??
      nameOf((s.completed_by_membership_id ?? s.opened_by_membership_id) as string),
  );

  /* ------------------------------------------------------------ refunds */
  const saleById = new Map(counted.map((s) => [s.id as string, s]));
  const refundRowsOut = refunds.map((r) => {
    const sale = saleById.get(r.sale_id as string);
    return {
      id: r.id as string,
      saleId: r.sale_id as string,
      reference: (sale?.sale_reference as string) ?? null,
      businessDate: (sale?.business_date as string) ?? "",
      amount: Number(r.amount),
      method: r.method as string,
      reason: (r.reason as string) ?? null,
      processedBy: nameOf(r.processed_by_membership_id as string),
      processedAt: r.created_at as string,
      saleStatus: (sale?.status as string) ?? "completed",
    };
  });

  /* ------------------------------------------------------------- shifts */
  const cashByShift = new Map<string, { sales: number; refunds: number }>();
  const shiftOfSale = new Map<string, string>(counted.map((s) => [s.id as string, s.shift_id as string]));
  for (const p of payments) {
    if (p.payment_method !== "cash" || p.status !== "captured") continue;
    const shiftId = shiftOfSale.get(p.sale_id as string);
    if (!shiftId) continue;
    const row = cashByShift.get(shiftId) ?? { sales: 0, refunds: 0 };
    row.sales = round2(row.sales + Number(p.amount));
    cashByShift.set(shiftId, row);
  }
  for (const r of refunds) {
    if (r.method !== "cash") continue;
    const shiftId = (r.shift_id as string) ?? shiftOfSale.get(r.sale_id as string);
    if (!shiftId) continue;
    const row = cashByShift.get(shiftId) ?? { sales: 0, refunds: 0 };
    row.refunds = round2(row.refunds + Number(r.amount));
    cashByShift.set(shiftId, row);
  }

  const shiftsOut = shifts.map((s) => {
    const cash = cashByShift.get(s.id as string) ?? { sales: 0, refunds: 0 };
    return {
      id: s.id as string,
      registerName: registerName.get(s.register_id as string) ?? "Register",
      businessDate: s.business_date as string,
      status: s.status as string,
      openedBy: nameOf(s.opened_by_membership_id as string),
      closedBy: s.closed_by_membership_id ? nameOf(s.closed_by_membership_id as string) : null,
      openedAt: s.opened_at as string,
      closedAt: (s.closed_at as string) ?? null,
      openingFloat: Number(s.opening_float),
      cashSales: cash.sales,
      cashRefunds: cash.refunds,
      expectedCash:
        s.expected_cash === null || s.expected_cash === undefined
          ? round2(Number(s.opening_float) + cash.sales - cash.refunds)
          : Number(s.expected_cash),
      closingCash: s.closing_cash === null || s.closing_cash === undefined ? null : Number(s.closing_cash),
      variance: s.variance === null || s.variance === undefined ? null : Number(s.variance),
    };
  });

  return {
    range,
    currency,
    summary: {
      sales: counted.length,
      gross,
      refunds: refundTotal,
      net,
      averageSale: counted.length ? round2(gross / counted.length) : 0,
      itemsSold,
      voidedSales: sales.filter((s) => s.status === "voided").length,
      openSales: open.length,
      openSalesValue: sum(open.map((s) => Number(s.total))),
      refundCount: refunds.length,
      partiallyRefundedSales: counted.filter((s) => s.status === "partially_refunded").length,
      refundedSales: counted.filter((s) => s.status === "refunded").length,
    },
    daily,
    tenders,
    products,
    registers,
    cashiers,
    refunds: refundRowsOut,
    shifts: shiftsOut,
  };
}
