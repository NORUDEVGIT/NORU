/**
 * Phase 8H7 — Standalone POS reports.
 *
 * Same aggregation as the dashboard, over any business-date range. Reads only
 * this till's own records.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import { getStandalonePosReport } from "@/packages/standalone-pos/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PosHeader, ErrorNotice, ReadOnlyNotice } from "./pos-shared";
import { DataTable, Metric, Panel, SALE_STATUS_LABELS, tenderName } from "./report-shared";

type Preset = "today" | "yesterday" | "last7" | "last30" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "custom", label: "Custom" },
];

const TABS = [
  { key: "sales", label: "Sales" },
  { key: "payments", label: "Payments" },
  { key: "products", label: "Products" },
  { key: "tills", label: "Registers & cashiers" },
  { key: "refunds", label: "Refunds" },
  { key: "shifts", label: "Shifts" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = Date.UTC(y!, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

export function StandalonePosReports({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const load = useServerFn(getStandalonePosReport);

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tab, setTab] = useState<Tab>("sales");

  // The property's own business date decides every preset — never the browser's.
  const anchor = useQuery({
    queryKey: ["pos-report-anchor", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
  });
  const today = anchor.data?.propertyBusinessDate ?? null;

  const range = useMemo(() => {
    if (preset === "custom") {
      return customFrom && customTo ? { fromDate: customFrom, toDate: customTo } : null;
    }
    if (!today) return null;
    if (preset === "today") return { fromDate: today, toDate: today };
    if (preset === "yesterday") {
      const y = shiftDate(today, -1);
      return { fromDate: y, toDate: y };
    }
    const days = preset === "last7" ? 6 : 29;
    return { fromDate: shiftDate(today, -days), toDate: today };
  }, [preset, customFrom, customTo, today]);

  const report = useQuery({
    queryKey: ["pos-report", restaurantId, range?.fromDate, range?.toDate],
    queryFn: () => load({ data: { restaurantId, ...range! } }),
    enabled: Boolean(range),
  });

  const d = report.data;
  const s = d?.summary;

  return (
    <div className="space-y-6">
      <PosHeader
        title="POS reports"
        crumb="Reports"
        propertyName={membership.restaurant.name}
        description="Sales, payments, products, tills, refunds and shifts for this property's own point of sale."
      />

      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={preset === p.key ? "default" : "outline"}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </Button>
        ))}
        {preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="pos-report-from" className="text-xs">From</Label>
              <Input
                id="pos-report-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pos-report-to" className="text-xs">To</Label>
              <Input
                id="pos-report-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {preset === "custom" && !range ? (
        <ReadOnlyNotice>Choose both a start and an end date to see figures.</ReadOnlyNotice>
      ) : null}
      {report.isFetching ? <p className="text-sm text-muted-foreground">Loading figures…</p> : null}
      <ErrorNotice message={report.error ? (report.error as Error).message : null} />

      {d && s ? (
        <>
          <ReadOnlyNotice>
            Business dates {d.range.fromDate} to {d.range.toDate}. Refunds are counted against the business date of
            the receipt they belong to, so gross minus refunds always equals net.
          </ReadOnlyNotice>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Sales" value={String(s.sales)} />
            <Metric label="Gross" value={money(s.gross)} />
            <Metric label="Refunds" value={money(s.refunds)} />
            <Metric label="Net POS sales" value={money(s.net)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? "secondary" : "ghost"}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "sales" ? (
            <Panel
              title="Sales by business date"
              description={`Average sale ${money(s.averageSale)} across ${s.sales} finished ${
                s.sales === 1 ? "receipt" : "receipts"
              }. ${s.openSales} parked and ${s.voidedSales} voided sales are excluded.`}
            >
              <DataTable
                head={["Business date", "Sales", "Gross", "Refunds", "Net"]}
                empty="No finished sales in this range."
                rows={d.daily.map((r) => [
                  r.businessDate,
                  String(r.sales),
                  money(r.gross),
                  money(r.refunds),
                  money(r.net),
                ])}
              />
            </Panel>
          ) : null}

          {tab === "payments" ? (
            <Panel
              title="Payments by tender"
              description="Each part of a split payment is counted once, against its own tender. These are recorded till takings, not bank settlement."
            >
              <DataTable
                head={["Tender", "Payments", "Taken", "Refunded", "Net"]}
                empty="No payments in this range."
                rows={d.tenders.map((t) => [
                  tenderName(t.method),
                  String(t.payments),
                  money(t.taken),
                  money(t.refunded),
                  money(t.net),
                ])}
              />
            </Panel>
          ) : null}

          {tab === "products" ? (
            <Panel
              title="Products sold"
              description="Names, codes and prices as they were on the receipt. Refunds are recorded against a receipt and its tender, so they can't be attributed to individual products."
            >
              <DataTable
                head={["Product", "Code", "Qty", "Discount", "Value"]}
                empty="Nothing sold in this range."
                rows={d.products.map((p) => [
                  p.name,
                  p.sku ?? "—",
                  String(p.quantity),
                  money(p.discount),
                  money(p.value),
                ])}
              />
            </Panel>
          ) : null}

          {tab === "tills" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Registers">
                <DataTable
                  head={["Register", "Sales", "Gross", "Refunds", "Net"]}
                  empty="No sales in this range."
                  rows={d.registers.map((r) => [
                    r.label,
                    String(r.sales),
                    money(r.gross),
                    money(r.refunds),
                    money(r.net),
                  ])}
                />
              </Panel>
              <Panel title="Cashiers" description="A record of till use, not a performance score.">
                <DataTable
                  head={["Cashier", "Sales", "Gross", "Refunds", "Net"]}
                  empty="No sales in this range."
                  rows={d.cashiers.map((c) => [
                    c.label,
                    String(c.sales),
                    money(c.gross),
                    money(c.refunds),
                    money(c.net),
                  ])}
                />
              </Panel>
            </div>
          ) : null}

          {tab === "refunds" ? (
            <Panel
              title="Refunds"
              description={`${s.refundCount} refunds, ${money(s.refunds)} in total. ${s.partiallyRefundedSales} receipts partly refunded, ${s.refundedSales} fully refunded.`}
            >
              <DataTable
                head={["Receipt", "Business date", "Processed", "By", "Tender", "Reason", "Receipt now", "Amount"]}
                empty="No refunds in this range."
                rows={d.refunds.map((r) => [
                  r.reference ?? "—",
                  r.businessDate,
                  dateTime(r.processedAt),
                  r.processedBy,
                  tenderName(r.method),
                  r.reason ?? "—",
                  SALE_STATUS_LABELS[r.saleStatus] ?? r.saleStatus,
                  money(r.amount),
                ])}
              />
            </Panel>
          ) : null}

          {tab === "shifts" ? (
            <Panel title="Cashier shifts" description="Cash expected is the opening float plus cash taken, less cash refunded.">
              <DataTable
                head={[
                  "Register",
                  "Cashier",
                  "Business date",
                  "Opened",
                  "Closed",
                  "Float",
                  "Cash sales",
                  "Cash refunds",
                  "Expected",
                  "Counted",
                  "Difference",
                ]}
                empty="No shifts in this range."
                rows={d.shifts.map((sh) => [
                  sh.registerName,
                  sh.openedBy,
                  sh.businessDate,
                  dateTime(sh.openedAt),
                  sh.closedAt ? dateTime(sh.closedAt) : "Open",
                  money(sh.openingFloat),
                  money(sh.cashSales),
                  money(sh.cashRefunds),
                  sh.expectedCash === null ? "—" : money(sh.expectedCash),
                  sh.closingCash === null ? "—" : money(sh.closingCash),
                  sh.variance === null ? "—" : money(sh.variance),
                ])}
              />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
