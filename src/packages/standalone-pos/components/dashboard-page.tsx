/**
 * Phase 8H7 — Standalone POS dashboard.
 *
 * Everything here comes from this till's own sales, lines, tenders, refunds,
 * shifts and registers. Nothing is read from Restaurant Management, PMS or
 * Back Office, so the figures stand on their own with any other package off.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/shared/components/ui/button";
import { useMoney, useRestaurantTime } from "@/core/state/restaurant-context";
import { getStandalonePosDashboard } from "@/packages/standalone-pos/lib/standalone-pos.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PosHeader, ErrorNotice, ReadOnlyNotice } from "./pos-shared";
import { DataTable, Metric, Panel, SALE_STATUS_LABELS, tenderName } from "./report-shared";

export function StandalonePosDashboard({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime, date } = useRestaurantTime();
  const load = useServerFn(getStandalonePosDashboard);

  const query = useQuery({
    queryKey: ["pos-dashboard", restaurantId],
    queryFn: () => load({ data: { restaurantId } }),
    refetchInterval: 60_000,
  });

  const d = query.data;
  const s = d?.summary;

  return (
    <div className="space-y-6">
      <PosHeader
        title="POS dashboard"
        crumb="Dashboard"
        propertyName={membership.restaurant.name}
        description="Today's trading at this property's own till, straight from its own receipts."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/restaurant/pos/reports">Reports</Link>
          </Button>
        }
      />

      {query.isPending ? <p className="text-sm text-muted-foreground">Loading today's figures…</p> : null}
      <ErrorNotice message={query.error ? (query.error as Error).message : null} />

      {d && s ? (
        <>
          <ReadOnlyNotice>
            Business date {date(`${d.businessDate}T12:00:00Z`)} ({d.businessDate}), in this property's own time
            zone. Figures cover finished receipts only.
          </ReadOnlyNotice>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Sales" value={String(s.sales)} hint={`${s.itemsSold} items sold`} />
            <Metric label="Gross takings" value={money(s.gross)} hint="Before refunds" />
            <Metric label="Refunds" value={money(s.refunds)} hint={`${s.refundCount} refunds recorded`} />
            <Metric label="Net POS sales" value={money(s.net)} hint="Gross minus refunds" />
            <Metric label="Average sale" value={money(s.averageSale)} />
            <Metric
              label="Open tills"
              value={String(d.openShifts.length)}
              hint={`${d.readiness.activeRegisters} tills, ${d.readiness.activeProducts} products on sale`}
            />
          </div>

          <Panel
            title="Tender activity"
            description="Money recorded at the till by type. This is what was rung up, not what a bank has settled."
          >
            <DataTable
              head={["Tender", "Payments", "Taken", "Refunded", "Net"]}
              empty="No payments recorded today."
              rows={d.tenders.map((t) => [
                tenderName(t.method),
                String(t.payments),
                money(t.taken),
                money(t.refunded),
                money(t.net),
              ])}
            />
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top products" description="From the names and prices stored on each receipt.">
              <DataTable
                head={["Product", "Qty", "Value"]}
                empty="Nothing sold today."
                rows={d.products.slice(0, 8).map((p) => [p.name, String(p.quantity), money(p.value)])}
              />
            </Panel>

            <Panel title="Till activity" description="Per register, for this business date.">
              <DataTable
                head={["Register", "Sales", "Gross", "Refunds", "Net"]}
                empty="No sales on any till today."
                rows={d.registers.map((r) => [
                  r.label,
                  String(r.sales),
                  money(r.gross),
                  money(r.refunds),
                  money(r.net),
                ])}
              />
            </Panel>

            <Panel title="Cashier activity" description="Who rang sales up today. A record of till use, not a performance score.">
              <DataTable
                head={["Cashier", "Sales", "Gross", "Refunds", "Net"]}
                empty="No sales recorded today."
                rows={d.cashiers.map((c) => [
                  c.label,
                  String(c.sales),
                  money(c.gross),
                  money(c.refunds),
                  money(c.net),
                ])}
              />
            </Panel>

            <Panel
              title="Refunds"
              description={`${s.partiallyRefundedSales} partly refunded, ${s.refundedSales} fully refunded.`}
            >
              <DataTable
                head={["Receipt", "Amount", "Tender", "Processed"]}
                empty="No refunds today."
                rows={d.refunds.slice(0, 8).map((r) => [
                  r.reference ?? "—",
                  money(r.amount),
                  tenderName(r.method),
                  `${r.processedBy}, ${dateTime(r.processedAt)}`,
                ])}
              />
            </Panel>
          </div>

          <Panel title="Cashier shifts" description="Drawer position for shifts on this business date.">
            <DataTable
              head={["Register", "Cashier", "Status", "Float", "Cash sales", "Cash refunds", "Expected", "Counted", "Difference"]}
              empty="No shifts on this business date."
              rows={d.shifts.map((sh) => [
                sh.registerName,
                sh.openedBy,
                sh.status === "open" ? "Open" : "Closed",
                money(sh.openingFloat),
                money(sh.cashSales),
                money(sh.cashRefunds),
                sh.expectedCash === null ? "—" : money(sh.expectedCash),
                sh.closingCash === null ? "—" : money(sh.closingCash),
                sh.variance === null ? "—" : money(sh.variance),
              ])}
            />
          </Panel>

          {s.openSales > 0 || s.voidedSales > 0 ? (
            <ReadOnlyNotice>
              {s.openSales > 0
                ? `${s.openSales} parked ${s.openSales === 1 ? "sale" : "sales"} worth ${money(s.openSalesValue)} ${
                    s.openSales === 1 ? "is" : "are"
                  } not finished, so ${s.openSales === 1 ? "it is" : "they are"} left out of every total above. `
                : ""}
              {s.voidedSales > 0
                ? `${s.voidedSales} voided ${s.voidedSales === 1 ? "sale is" : "sales are"} excluded entirely.`
                : ""}
            </ReadOnlyNotice>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {SALE_STATUS_LABELS["completed"]}, partly refunded and refunded receipts count towards gross. Refunds
            are shown against the business date of the original receipt so the three figures always add up.
          </p>
        </>
      ) : null}
    </div>
  );
}
