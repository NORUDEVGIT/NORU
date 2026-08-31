import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  Armchair,
  Boxes,
  Flame,
  PackageX,
  ShieldAlert,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import { cn } from "@/lib/utils";
import {
  getAssetAnalytics,
  getInventoryDashboard,
  getInventoryMovementAnalytics,
  getRecentInventoryActivity,
  getStockAttentionItems,
  getWasteLossReport,
} from "@/lib/inventory-reporting.functions";

type Preset = "today" | "7d" | "30d" | "custom";

const PRESET_LABEL: Record<Preset, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  under_maintenance: "Under maintenance",
  out_of_service: "Out of service",
  disposed: "Disposed",
};

const STATUS_COLOR: Record<string, string> = {
  // SVG presentation attributes can't read CSS vars, so these mirror the NORU palette.
  active: "#436436",
  under_maintenance: "#C89933",
  out_of_service: "#B3261E",
  disposed: "#9A9186",
};

export function InventoryOverviewDashboard({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rangeInput = {
    restaurantId,
    preset,
    ...(preset === "custom" && from ? { from } : {}),
    ...(preset === "custom" && to ? { to } : {}),
  };
  const rangeKey = [preset, preset === "custom" ? from : "", preset === "custom" ? to : ""].join(":");
  const customIncomplete = preset === "custom" && (!from || !to);

  const fetchDashboard = useServerFn(getInventoryDashboard);
  const fetchTrend = useServerFn(getInventoryMovementAnalytics);
  const fetchWaste = useServerFn(getWasteLossReport);
  const fetchAttention = useServerFn(getStockAttentionItems);
  const fetchAssets = useServerFn(getAssetAnalytics);
  const fetchActivity = useServerFn(getRecentInventoryActivity);

  const dashboard = useQuery({
    queryKey: ["inventory-dashboard", restaurantId, rangeKey],
    queryFn: () => fetchDashboard({ data: rangeInput }),
    enabled: !customIncomplete,
  });
  const trend = useQuery({
    queryKey: ["inventory-trend", restaurantId, rangeKey],
    queryFn: () => fetchTrend({ data: rangeInput }),
    enabled: !customIncomplete,
  });
  const waste = useQuery({
    queryKey: ["inventory-waste", restaurantId, rangeKey],
    queryFn: () => fetchWaste({ data: { ...rangeInput, limit: 50 } }),
    enabled: !customIncomplete,
  });
  const attention = useQuery({
    queryKey: ["inventory-attention", restaurantId],
    queryFn: () => fetchAttention({ data: { restaurantId, limit: 50 } }),
  });
  const assets = useQuery({
    queryKey: ["inventory-asset-analytics", restaurantId],
    queryFn: () => fetchAssets({ data: { restaurantId } }),
  });
  const activity = useQuery({
    queryKey: ["inventory-activity", restaurantId],
    queryFn: () => fetchActivity({ data: { restaurantId, limit: 20 } }),
  });

  const perms = dashboard.data?.permissions;
  const showMoney = perms?.canViewFinancials ?? false;
  const showReports = perms?.canViewReports ?? false;
  const stock = dashboard.data?.stock;
  const assetStats = dashboard.data?.assets;

  const trendData = (trend.data?.days ?? []).map((d) => ({
    ...d,
    label: d.date.slice(5),
  }));
  const useValueTrend = trend.data?.hasValue ?? false;

  const statusData = Object.entries(assets.data?.statusCounts ?? {})
    .filter(([, count]) => (count as number) > 0)
    .map(([status, count]) => ({ name: STATUS_LABEL[status] ?? status, value: count as number, status }));

  return (
    <div className="space-y-4">
      {/* Date range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {(["today", "7d", "30d", "custom"] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                preset === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        ) : null}
        {dashboard.data ? (
          <p className="text-xs text-muted-foreground">
            {dashboard.data.range.from} → {dashboard.data.range.to} · {dashboard.data.timezone}
          </p>
        ) : null}
      </div>

      {/* Stock KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total items" value={stock?.totalItems ?? "—"} icon={Boxes} />
        <Kpi label="Low stock" value={stock?.lowStock ?? "—"} icon={AlertTriangle} tone="warning" />
        <Kpi label="Out of stock" value={stock?.outOfStock ?? "—"} icon={PackageX} tone="danger" />
        <Kpi
          label="Stock value"
          value={showMoney && stock?.stockValue != null ? money(stock.stockValue) : "—"}
          hint={
            showMoney && stock && stock.uncostedItems > 0
              ? `${stock.uncostedItems} item${stock.uncostedItems === 1 ? "" : "s"} without a cost`
              : !showMoney
                ? "Restricted"
                : undefined
          }
          icon={Wallet}
        />
      </div>

      {/* Range KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Waste in period"
          value={showMoney && dashboard.data?.waste.value != null ? money(dashboard.data.waste.value) : dashboard.data ? `${dashboard.data.waste.events}` : "—"}
          hint={dashboard.data ? `${dashboard.data.waste.events} event${dashboard.data.waste.events === 1 ? "" : "s"}` : undefined}
          icon={Trash2}
          tone="warning"
        />
        <Kpi
          label="Loss in period"
          value={showMoney && dashboard.data?.loss.value != null ? money(dashboard.data.loss.value) : dashboard.data ? `${dashboard.data.loss.events}` : "—"}
          hint={dashboard.data ? `${dashboard.data.loss.events} event${dashboard.data.loss.events === 1 ? "" : "s"}` : undefined}
          icon={Flame}
          tone="danger"
        />
        <Kpi label="Operating assets" value={assetStats?.operatingAssets ?? "—"} icon={Armchair} />
        <Kpi label="Equipment" value={assetStats?.equipment ?? "—"} icon={Wrench} />
      </div>

      {/* Trend + value breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-lg">Stock movement trend</h2>
            <p className="text-xs text-muted-foreground">
              {useValueTrend ? "By value" : "By movement count"}
            </p>
          </div>
          {trend.isLoading ? (
            <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted" />
          ) : trendData.length === 0 || (trend.data?.totalMovements ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No stock movements in this period.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip
                    formatter={(value: any) => (useValueTrend ? money(Number(value)) : String(value))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--card-foreground)" }}
                  />
                  <Legend />
                  <Bar
                    stackId="a"
                    name="Received"
                    dataKey={useValueTrend ? "stockInValue" : "stockInCount"}
                    fill="#436436"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    stackId="a"
                    name="Usage"
                    dataKey={useValueTrend ? "usageValue" : "usageCount"}
                    fill="#251605"
                  />
                  <Bar
                    stackId="a"
                    name="Waste"
                    dataKey={useValueTrend ? "wasteValue" : "wasteCount"}
                    fill="#C89933"
                  />
                  <Bar
                    stackId="a"
                    name="Loss"
                    dataKey={useValueTrend ? "lossValue" : "lossCount"}
                    fill="#B3261E"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {trend.data?.truncated ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the most recent movements only — narrow the date range for a complete picture.
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Asset status</h2>
          {assets.isLoading ? (
            <div className="mt-4 h-56 animate-pulse rounded-xl bg-muted" />
          ) : statusData.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No assets recorded yet.</p>
          ) : (
            <div className="mt-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                    {statusData.map((d) => (
                      <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? "hsl(var(--muted-foreground))"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--card-foreground)" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <MiniStat label="Warranty expired" value={assets.data?.warranty.expired ?? 0} tone="danger" />
            <MiniStat label="Expiring soon" value={assets.data?.warranty.expiring ?? 0} tone="warning" />
          </div>
        </div>
      </div>

      {showMoney && stock ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <ValueCard label="Ingredients value" value={money(stock.ingredientValue ?? 0)} />
          <ValueCard label="Consumables value" value={money(stock.consumableValue ?? 0)} />
          <ValueCard
            label="Items without cost"
            value={`${stock.uncostedItems}`}
            hint="Excluded from valuation"
          />
        </div>
      ) : null}

      {/* Reports */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" />
            <h2 className="font-display text-lg">Needs attention</h2>
          </div>
          {attention.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (attention.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Every active item is above its minimum level.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(attention.data ?? []).slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Min {i.minimumStockLevel} {i.unitCode} · {i.inventoryType === "ingredient" ? "Ingredient" : "Consumable"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      i.status === "out"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {i.quantity} {i.unitCode}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <h2 className="font-display text-lg">Recent activity</h2>
          </div>
          {activity.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {(activity.data ?? []).slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.event}
                      {a.detail ? ` · ${a.detail}` : ""} · {dateTime(a.createdAt)}
                      {a.actor ? ` · ${a.actor}` : ""}
                    </p>
                  </div>
                  {a.value != null ? (
                    <span className="text-sm font-semibold tabular-nums">{money(a.value)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showReports ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Waste &amp; loss report</h2>
          <Tabs defaultValue="summary" className="mt-3">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="entries">Entries</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="mt-3 grid gap-4 md:grid-cols-2">
              <RankedList title="Top waste" rows={waste.data?.topWaste ?? []} money={money} />
              <RankedList title="Top loss" rows={waste.data?.topLoss ?? []} money={money} />
            </TabsContent>
            <TabsContent value="entries" className="mt-3">
              {(waste.data?.entries ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No waste or loss recorded in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">When</th>
                        <th className="py-2 pr-3 font-medium">Item</th>
                        <th className="py-2 pr-3 font-medium">Type</th>
                        <th className="py-2 pr-3 font-medium">Qty</th>
                        <th className="py-2 pr-3 font-medium">Value</th>
                        <th className="py-2 pr-3 font-medium">Reason</th>
                        <th className="py-2 font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(waste.data?.entries ?? []).map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{dateTime(e.createdAt)}</td>
                          <td className="py-2 pr-3 font-medium">{e.itemName}</td>
                          <td className="py-2 pr-3 capitalize">{e.kind}</td>
                          <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                            {e.quantity} {e.unitCode}
                          </td>
                          <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                            {e.value == null ? "—" : money(e.value)}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{e.reason ?? "—"}</td>
                          <td className="py-2 text-muted-foreground">{e.recordedBy ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {waste.data?.hasMore ? (
                <p className="mt-2 text-xs text-muted-foreground">Showing the 50 most recent entries.</p>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {dashboard.isError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          We couldn't load inventory reporting.{" "}
          <Button variant="link" className="h-auto p-0 text-destructive" onClick={() => dashboard.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RankedList({
  title,
  rows,
  money,
}: {
  title: string;
  rows: { itemId: string; itemName: string; quantity: number; unitCode: string; value: number; events: number }[];
  money: (value: number) => string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing recorded.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={`${title}-${r.itemId}`} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.itemName}</span>
              <span className="text-muted-foreground tabular-nums">
                {r.quantity} {r.unitCode}
              </span>
              <span className="font-semibold tabular-nums">{money(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string | undefined;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon
          className={cn(
            "size-4",
            tone === "danger" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-muted-foreground",
          )}
        />
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border border-border p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("font-semibold", tone === "danger" ? "text-destructive" : "text-amber-600")}>{value}</p>
    </div>
  );
}

function ValueCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
