import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import {
  ANALYTICS_PERIODS,
  getRestaurantAnalytics,
  type AnalyticsPeriod,
  type RestaurantAnalytics,
} from "@/packages/restaurant-management/lib/analytics.functions";

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  today: "Today",
  "7d": "7 Days",
  "30d": "30 Days",
};

/** Aligned with OrderStatusBadge hues so the dashboard stays consistent. */
const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "var(--primary)" },
  accepted: { label: "Accepted", color: "oklch(0.68 0.13 232)" },
  preparing: { label: "Preparing", color: "oklch(0.75 0.15 75)" },
  ready: { label: "Ready", color: "oklch(0.68 0.15 155)" },
  served: { label: "Served", color: "var(--muted-foreground)" },
  cancelled: { label: "Cancelled", color: "var(--destructive)" },
};

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11 };

export function DashboardAnalytics({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const [period, setPeriod] = useState<AnalyticsPeriod>("today");
  const fetchAnalytics = useServerFn(getRestaurantAnalytics);
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const query = useQuery<RestaurantAnalytics>({
    queryKey: ["restaurant-analytics", restaurantId, period],
    queryFn: () => fetchAnalytics({ data: { restaurantId, tzOffsetMinutes, period } }),
    retry: false,
    staleTime: 15_000,
  });

  const a = query.data;
  const loading = query.isLoading;
  const hasRevenue = !!a && a.series.some((p) => p.value > 0);
  const hasOrders = !!a && a.series.some((p) => p.orders > 0);
  const statusSegments = (a?.statuses ?? []).filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Analytics</h2>
        <div
          role="group"
          aria-label="Analytics period"
          className="inline-flex rounded-xl border border-border bg-card p-1"
        >
          {ANALYTICS_PERIODS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "ghost"}
              aria-pressed={period === p}
              className="h-8 px-3 text-xs"
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Revenue Overview"
          subtitle="Non-cancelled order value — not settled payments."
          right={
            loading || !a ? null : (
              <div className="text-right">
                <p className="font-display text-xl tabular-nums">{money(a.totals.orderValue)}</p>
                <Comparison pct={a.comparison.orderValuePct} label={a.comparison.label} />
              </div>
            )
          }
        >
          <ChartFrame loading={loading} empty={!hasRevenue} emptyText="No revenue data for this period.">
            {a ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" {...AXIS} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => money(v)}
                    {...AXIS}
                  />
                  <Tooltip content={<PointTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </ChartFrame>
        </Card>

        <Card title="Order Status" subtitle={`Orders in the selected period`}>
          <ChartFrame loading={loading} empty={statusSegments.length === 0} emptyText="No order activity for this period.">
            {a ? (
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusSegments}
                      dataKey="count"
                      nameKey="status"
                      innerRadius="62%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusSegments.map((s) => (
                        <Cell key={s.status} fill={STATUS_META[s.status]?.color ?? "var(--muted-foreground)"} />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-2xl tabular-nums">{a.totals.allOrders}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.totals.allOrders === 1 ? "Order" : "Orders"}
                  </span>
                </div>
              </div>
            ) : null}
          </ChartFrame>
          {a && statusSegments.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {statusSegments.map((s) => (
                <li key={s.status} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: STATUS_META[s.status]?.color }}
                  />
                  <span className="text-muted-foreground">{STATUS_META[s.status]?.label ?? s.status}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <Card
        title="Orders by Time"
        subtitle={period === "today" ? "Order count by hour" : "Order count by day"}
        right={
          loading || !a ? null : (
            <div className="text-right">
              <p className="font-display text-xl tabular-nums">{a.totals.orders}</p>
              <Comparison pct={a.comparison.ordersPct} label={a.comparison.label} />
            </div>
          )
        }
      >
        <ChartFrame loading={loading} empty={!hasOrders} emptyText="No orders for this period.">
          {a ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" {...AXIS} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} {...AXIS} />
                <Tooltip content={<PointTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
                <Bar dataKey="orders" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </ChartFrame>
      </Card>
    </div>
  );
}

function Comparison({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return <p className="text-[11px] text-muted-foreground">No previous-period comparison</p>;
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p
      className={cn(
        "flex items-center justify-end gap-1 text-[11px] font-semibold",
        up ? "text-primary" : "text-destructive",
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {pct}% <span className="font-normal text-muted-foreground">{label}</span>
    </p>
  );
}

interface TooltipPayload {
  active?: boolean;
  payload?: { payload: { fullLabel: string; value: number; orders: number } }[];
}

function PointTooltip({ active, payload }: TooltipPayload) {
  const money = useMoney();
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{point.fullLabel}</p>
      <p className="mt-1 text-muted-foreground">
        Order Value: <span className="font-medium text-foreground tabular-nums">{money(point.value)}</span>
      </p>
      <p className="text-muted-foreground">
        Orders: <span className="font-medium text-foreground tabular-nums">{point.orders}</span>
      </p>
    </div>
  );
}

function StatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { status: string; count: number } }[];
}) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{STATUS_META[s.status]?.label ?? s.status}</p>
      <p className="text-muted-foreground">
        Orders: <span className="font-medium text-foreground tabular-nums">{s.count}</span>
      </p>
    </div>
  );
}

/** Fixed-height chart area so loading/empty states never shift the layout. */
function ChartFrame({
  loading,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-[220px] w-full sm:h-[260px]">
      {loading ? (
        <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
      ) : empty ? (
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg leading-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
