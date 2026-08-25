import { useEffect, useMemo } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ChefHat,
  CheckCircle2,
  Clock,
  PauseCircle,
  QrCode,
  ReceiptText,
  RefreshCw,
  Settings,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { DashboardAnalytics } from "@/components/dashboard-analytics";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/data/menu";
import { cn } from "@/lib/utils";
import {
  getRestaurantDashboard,
  type DashboardOrder,
  type RestaurantDashboard,
} from "@/lib/dashboard.functions";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Restaurant Dashboard — Garden Table Platform" },
      { name: "description", content: "Live restaurant operations overview: today's orders, revenue, kitchen status, tables and menu availability." },
      { property: "og:title", content: "Restaurant Dashboard — Garden Table Platform" },
      { property: "og:description", content: "Live restaurant operations overview for your venue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantDashboardRoute,
});

function RestaurantDashboardRoute() {
  return (
    <RestaurantShell active="Dashboard">
      {(membership) => <DashboardBody membership={membership} />}
    </RestaurantShell>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function DashboardBody({ membership }: { membership: RestaurantMembership }) {
  const restaurant = membership.restaurant;
  const restaurantId = membership.restaurantId;
  const fetchDashboard = useServerFn(getRestaurantDashboard);
  const queryClient = useQueryClient();
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const query = useQuery<RestaurantDashboard>({
    queryKey: ["restaurant-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId, tzOffsetMinutes } }),
    retry: false,
    staleTime: 15_000,
  });

  // Realtime refresh, scoped strictly to this restaurant's orders.
  useEffect(() => {
    const filter = `restaurant_id=eq.${restaurantId}`;
    const channel = supabase
      .channel(`dashboard-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, () => {
        void queryClient.invalidateQueries({ queryKey: ["restaurant-dashboard", restaurantId] });
        void queryClient.invalidateQueries({ queryKey: ["restaurant-analytics", restaurantId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, restaurantId]);

  const d = query.data;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{greeting()}</p>
          <h1 className="font-display text-2xl leading-tight">{restaurant.name}</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening at your restaurant today.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusNote status={restaurant.status} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("mr-2 size-4", query.isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {restaurant.status === "pending" ? (
        <p className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
          Your restaurant is pending approval. You can keep setting things up, but your menu isn't publicly visible and
          customers can't order yet.
        </p>
      ) : null}
      {restaurant.status === "suspended" ? (
        <div className="rounded-xl bg-orange-500/10 p-4 text-sm text-orange-800 dark:text-orange-300">
          <p className="font-semibold">Your restaurant is currently suspended.</p>
          <p className="mt-1">New customer orders are disabled and your menu is hidden. Your data is preserved.</p>
          {restaurant.suspensionReason ? <p className="mt-2">Reason: {restaurant.suspensionReason}</p> : null}
        </div>
      ) : null}
      {restaurant.status === "rejected" ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Your restaurant application was not approved.</p>
          {restaurant.rejectionReason ? <p className="mt-1">Reason: {restaurant.rejectionReason}</p> : null}
        </div>
      ) : null}

      {query.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="size-4 text-destructive" />
          <span className="text-destructive">Unable to load dashboard data.</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      ) : null}

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Today's Order Value" value={d ? formatPrice(d.today.revenue) : null} loading={query.isLoading} />
        <Metric label="Today's Orders" value={d ? String(d.today.orders) : null} loading={query.isLoading} />
        <Metric label="Active Orders" value={d ? String(d.counts.active) : null} loading={query.isLoading} />
        <Metric
          label="Average Order Value"
          value={d ? formatPrice(d.today.averageOrderValue) : null}
          loading={query.isLoading}
        />
      </div>

      {/* Secondary operational metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SmallMetric label="Preparing" value={d ? String(d.counts.preparing) : null} loading={query.isLoading} />
        <SmallMetric label="Ready" value={d ? String(d.counts.ready) : null} loading={query.isLoading} />
        <SmallMetric label="Active Tables" value={d ? String(d.tables.active) : null} loading={query.isLoading} />
        <SmallMetric
          label="Unavailable Items"
          value={d ? String(d.menu.unavailable) : null}
          loading={query.isLoading}
        />
      </div>

      {/* Analytics: revenue, order status, order volume */}
      <DashboardAnalytics restaurantId={restaurantId} />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Live orders */}
        <Panel
          className="xl:col-span-2"
          title="Live Orders"
          action={<PanelLink to="/restaurant/kitchen" label="Open Kitchen" />}
        >
          {query.isLoading ? (
            <SkeletonRows />
          ) : !d ? null : d.liveOrders.length === 0 ? (
            <Empty
              title="No active orders"
              body="New customer orders will appear here as soon as they're placed."
            />
          ) : (
            <ul className="divide-y divide-border">
              {d.liveOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="font-semibold tabular-nums">#{order.orderNumber}</span>
                  <span className="text-sm">Table {order.tableNumber}</span>
                  <span className="text-sm text-muted-foreground">{timeOf(order.createdAt)}</span>
                  <span className="text-sm text-muted-foreground">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </span>
                  <span className="text-sm font-medium tabular-nums">{formatPrice(order.total)}</span>
                  <OrderStatusBadge status={order.status} />
                  <span className="ml-auto flex items-center gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/restaurant/orders/$orderId" params={{ orderId: order.id }}>View Order</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/restaurant/kitchen">Open Kitchen</Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Kitchen status + quick actions */}
        <div className="space-y-4">
          <Panel title="Kitchen Status" action={<PanelLink to="/restaurant/kitchen" label="Open Kitchen" />}>
            {query.isLoading ? (
              <SkeletonRows rows={1} />
            ) : d ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="New" value={d.counts.new} />
                <MiniStat label="Preparing" value={d.counts.preparing} />
                <MiniStat label="Ready" value={d.counts.ready} />
              </div>
            ) : null}
          </Panel>

          <Panel title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <QuickAction to="/restaurant/menu" icon={UtensilsCrossed} label="Manage Menu" />
              <QuickAction to="/restaurant/kitchen" icon={ChefHat} label="Open Kitchen" />
              <QuickAction to="/restaurant/tables" icon={QrCode} label="Tables & QR" />
              <QuickAction to="/restaurant/settings" icon={Settings} label="Settings" />
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Recent orders */}
        <Panel className="xl:col-span-2" title="Recent Orders">
          {query.isLoading ? (
            <SkeletonRows />
          ) : !d ? null : d.recentOrders.length === 0 ? (
            <Empty title="No orders yet" body="Orders placed from your table QR codes will show up here." />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Order</th>
                      <th className="py-2 pr-3 font-medium">Table</th>
                      <th className="py-2 pr-3 font-medium">Items</th>
                      <th className="py-2 pr-3 font-medium">Total</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 pr-3 font-semibold tabular-nums">#{o.orderNumber}</td>
                        <td className="py-2.5 pr-3">{o.tableNumber}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{o.itemCount}</td>
                        <td className="py-2.5 pr-3 tabular-nums">{formatPrice(o.total)}</td>
                        <td className="py-2.5 pr-3"><OrderStatusBadge status={o.status} /></td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{timeOf(o.createdAt)}</td>
                        <td className="py-2.5 text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/restaurant/orders/$orderId" params={{ orderId: o.id }}>View Order</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <ul className="space-y-2 sm:hidden">
                {d.recentOrders.map((o) => (
                  <MobileOrderCard key={o.id} order={o} />
                ))}
              </ul>
            </>
          )}
        </Panel>

        <div className="space-y-4">
          {/* Tables */}
          <Panel title="Table Overview" action={<PanelLink to="/restaurant/tables" label="Manage Tables" />}>
            {query.isLoading ? (
              <SkeletonRows rows={1} />
            ) : !d ? null : d.tables.total === 0 ? (
              <Empty
                title="No tables configured"
                body="Add tables and generate QR codes to begin dine-in ordering."
                action={<Button asChild size="sm"><Link to="/restaurant/tables">Add tables</Link></Button>}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <MiniStat label="Configured" value={d.tables.total} />
                  <MiniStat label="Active" value={d.tables.active} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.tables.labels.map((t) => (
                    <span
                      key={t.tableNumber}
                      title={t.active ? "Active" : "Inactive"}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums",
                        t.active
                          ? "border-border bg-background"
                          : "border-dashed border-border text-muted-foreground/70",
                      )}
                    >
                      {t.tableNumber}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Menu availability */}
          <Panel title="Menu Availability" action={<PanelLink to="/restaurant/menu" label="Manage Menu" />}>
            {query.isLoading ? (
              <SkeletonRows rows={1} />
            ) : !d ? null : d.menu.total === 0 ? (
              <Empty
                title="No menu items yet"
                body="Add categories and dishes so guests can order."
                action={<Button asChild size="sm"><Link to="/restaurant/menu">Add menu items</Link></Button>}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Items" value={d.menu.total} />
                  <MiniStat label="Available" value={d.menu.available} />
                  <MiniStat label="Unavailable" value={d.menu.unavailable} />
                </div>
                {d.menu.unavailable === 0 ? (
                  <p className="text-sm text-muted-foreground">All menu items are currently available.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.menu.unavailableItems.map((name) => (
                      <li key={name} className="flex items-center justify-between gap-2">
                        <span className="truncate">{name}</span>
                        <span className="shrink-0 text-xs font-semibold text-muted-foreground">Unavailable</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function MobileOrderCard({ order }: { order: DashboardOrder }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">#{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Table {order.tableNumber} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
        {timeOf(order.createdAt)}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium tabular-nums">{formatPrice(order.total)}</span>
        <Button asChild size="sm" variant="ghost">
          <Link to="/restaurant/orders/$orderId" params={{ orderId: order.id }}>View Order</Link>
        </Button>
      </div>
    </li>
  );
}

function Metric({ label, value, loading }: { label: string; value: string | null; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading || value === null ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      )}
    </div>
  );
}

function SmallMetric({ label, value, loading }: { label: string; value: string | null; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading || value === null ? (
        <div className="mt-1.5 h-5 w-10 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/60 px-2 py-2">
      <p className="font-display text-xl tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={to}>{label}</Link>
    </Button>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof ChefHat;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-sm font-medium transition-colors hover:bg-muted"
    >
      <Icon className="size-4 text-primary" />
      {label}
    </Link>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border p-5">
      <div className="flex items-center gap-2">
        <ReceiptText className="size-4 text-muted-foreground" />
        <p className="font-medium">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function StatusNote({ status }: { status: RestaurantMembership["restaurant"]["status"] }) {
  const map = {
    approved: { icon: CheckCircle2, label: "Active", className: "bg-primary/10 text-primary" },
    pending: { icon: Clock, label: "Pending Approval", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    suspended: { icon: PauseCircle, label: "Suspended", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
    rejected: { icon: XCircle, label: "Not Approved", className: "bg-destructive/10 text-destructive" },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", map.className)}>
      <map.icon className="size-4" /> {map.label}
    </span>
  );
}
