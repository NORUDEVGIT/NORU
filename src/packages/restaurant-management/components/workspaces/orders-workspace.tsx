import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, RefreshCw, Search } from "lucide-react";

import { OrderStatusBadge } from "@/packages/restaurant-management/components/order-status-badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/shared/lib/utils";
import { listRestaurantOrders, ORDER_PERIODS, ORDER_SORTS, type OrderListResult, type OrderListRow } from "@/packages/restaurant-management/lib/restaurant-orders.functions";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRmRoutes } from "@/packages/restaurant-management/lib/rm-routes";
import { useMoney } from "@/core/state/restaurant-context";
import { PageHeading } from "@/core/state/pms-context";
import { useRestaurantTime } from "@/core/state/restaurant-context";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "new", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const PERIOD_TABS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "custom", label: "Custom" },
] as const;

const SORT_LABELS: Record<(typeof ORDER_SORTS)[number], string> = {
  newest: "Newest",
  oldest: "Oldest",
  value_desc: "Highest Order Value",
  value_asc: "Lowest Order Value",
};

export interface OrdersSearch {
  status: string;
  period: (typeof ORDER_PERIODS)[number];
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  sort: (typeof ORDER_SORTS)[number];
  page: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared by the canonical and legacy Orders routes so both parse the same URL. */
export function validateOrdersSearch(search: Record<string, unknown>): OrdersSearch {
  const status = String(search['status'] ?? "all");
  const period = String(search['period'] ?? "today") as OrdersSearch["period"];
  const sort = String(search['sort'] ?? "newest") as OrdersSearch["sort"];
  const from = typeof search['from'] === "string" && DATE_RE.test(search['from']) ? search['from'] : undefined;
  const to = typeof search['to'] === "string" && DATE_RE.test(search['to']) ? search['to'] : undefined;
  const q = typeof search['q'] === "string" && search['q'].trim() ? search['q'].trim().slice(0, 60) : undefined;
  const page = Math.max(1, Math.min(400, Number(search['page']) || 1));
  return {
    status: STATUS_TABS.some((t) => t.value === status) ? status : "all",
    period: (ORDER_PERIODS as readonly string[]).includes(period) ? period : "today",
    sort: (ORDER_SORTS as readonly string[]).includes(sort) ? sort : "newest",
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(q ? { q } : {}),
    page,
  };
}



export function OrdersBody({
  membership,
  search,
  basePath,
}: {
  membership: RestaurantMembership;
  search: OrdersSearch;
  /** The address of the Orders page rendering this workspace (canonical or legacy). */
  basePath: string;
}) {
  const rm = useRmRoutes();
  const clock = useRestaurantTime();
  const money = useMoney();
  const restaurantId = membership.restaurantId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchOrders = useServerFn(listRestaurantOrders);
  const tzOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const [searchInput, setSearchInput] = useState(search.q ?? "");
  // The same workspace renders at two addresses, so navigation targets are passed in.
  const go = (next: OrdersSearch, replace = false) =>
    void (navigate as unknown as (opts: unknown) => void)({ to: basePath, search: next, replace });
  const [pendingUpdates, setPendingUpdates] = useState(0);

  // Debounce the search box rather than navigating on every keystroke.
  useEffect(() => {
    const current = search.q ?? "";
    if (searchInput.trim() === current) return;
    const id = setTimeout(() => {
      const next = { ...search, page: 1 } as OrdersSearch;
      if (searchInput.trim()) next.q = searchInput.trim();
      else delete next.q;
      go(next, true);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search.q]);

  const queryKey = [
    "restaurant-orders",
    restaurantId,
    search.status,
    search.period,
    search.from ?? null,
    search.to ?? null,
    search.q ?? null,
    search.sort,
    search.page,
  ];

  const query = useQuery<OrderListResult>({
    queryKey,
    queryFn: () =>
      fetchOrders({
        data: {
          restaurantId,
          status: search.status,
          period: search.period,
          from: search.from ?? null,
          to: search.to ?? null,
          search: search.q ?? null,
          sort: search.sort,
          page: search.page,
          tzOffsetMinutes,
        },
      }),
    retry: false,
    staleTime: 10_000,
  });

  // Realtime, scoped strictly to this restaurant's orders.
  useEffect(() => {
    const filter = `restaurant_id=eq.${restaurantId}`;
    const channel = supabase
      .channel(`orders-page-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter }, () => {
        setPendingUpdates((n) => n + 1);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  function refresh() {
    setPendingUpdates(0);
    void queryClient.invalidateQueries({ queryKey: ["restaurant-orders", restaurantId] });
  }

  function setParam(patch: Partial<OrdersSearch>, resetPage = true) {
    go({ ...search, ...patch, ...(resetPage ? { page: 1 } : {}) } as OrdersSearch);
  }

  function clearFilters() {
    setSearchInput("");
    go({ status: "all", period: "today", sort: "newest", page: 1 } as OrdersSearch);
  }

  const d = query.data;
  const s = d?.summary;
  const loading = query.isLoading;
  const hasFilters =
    search.status !== "all" || search.period !== "today" || !!search.q || search.sort !== "newest";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl leading-tight">
            <PageHeading fallback="Orders" />
          </h1>

          <p className="text-sm text-muted-foreground">Search, review and manage restaurant orders.</p>
        </div>
        <div className="flex items-center gap-2">
          {s ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {s.total} {s.total === 1 ? "order" : "orders"} in range
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw className={cn("mr-2 size-4", query.isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {pendingUpdates > 0 ? (
        <button
          type="button"
          onClick={refresh}
          className="flex w-full items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm text-primary"
        >
          <Bell className="size-4" />
          {pendingUpdates} new {pendingUpdates === 1 ? "update" : "updates"} — show
        </button>
      ) : null}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total Orders" value={s ? String(s.total) : null} loading={loading} />
        <Stat label="Active" value={s ? String(s.active) : null} loading={loading} />
        <Stat label="Preparing" value={s ? String(s.preparing) : null} loading={loading} />
        <Stat label="Ready" value={s ? String(s.ready) : null} loading={loading} />
        <Stat label="Completed" value={s ? String(s.completed) : null} loading={loading} />
        <Stat label="Cancelled" value={s ? String(s.cancelled) : null} loading={loading} />
        <Stat label="Order Value" value={s ? money(s.orderValue) : null} loading={loading} />
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <Chip
              key={tab.value}
              active={search.status === tab.value}
              onClick={() => setParam({ status: tab.value })}
            >
              {tab.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PERIOD_TABS.map((tab) => (
            <Chip
              key={tab.value}
              active={search.period === tab.value}
              onClick={() => setParam({ period: tab.value })}
            >
              {tab.label}
            </Chip>
          ))}
          {search.period === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted-foreground" htmlFor="orders-from">From</label>
              <Input
                id="orders-from"
                type="date"
                className="h-9 w-[9.5rem]"
                value={search.from ?? ""}
                onChange={(e) => setParam({ from: e.target.value || undefined })}
              />
              <label className="text-xs text-muted-foreground" htmlFor="orders-to">To</label>
              <Input
                id="orders-to"
                type="date"
                className="h-9 w-[9.5rem]"
                value={search.to ?? ""}
                onChange={(e) => setParam({ to: e.target.value || undefined })}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search order number or table"
              aria-label="Search orders"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <select
            aria-label="Sort orders"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={search.sort}
            onChange={(e) => setParam({ sort: e.target.value as OrdersSearch["sort"] })}
          >
            {ORDER_SORTS.map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : null}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card">
        {query.isError ? (
          <div className="flex flex-wrap items-center gap-3 p-6 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            <span className="text-destructive">Unable to load orders.</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button>
          </div>
        ) : loading ? (
          <ListSkeleton />
        ) : !d || d.rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">
              {hasFilters ? "No orders match these filters." : "No orders today."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Orders placed from your table QR codes will appear here.
            </p>
            {hasFilters ? (
              <Button className="mt-4" size="sm" variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">Order</th>
                    <th className="px-4 py-3 font-medium">Date / Time</th>
                    <th className="px-4 py-3 font-medium">Table</th>
                    <th className="px-4 py-3 font-medium">Items</th>
                    <th className="px-4 py-3 font-medium">Order Value</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Customer Type</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.rows.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3 font-semibold tabular-nums">#{o.orderNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{clock.dateTime(o.createdAt)}</td>
                      <td className="px-4 py-3">Table {o.tableNumber}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {o.itemCount} {o.itemCount === 1 ? "item" : "items"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{money(o.total)}</td>
                      <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {o.source === "waiter_assisted" ? "Waiter-assisted" : o.isGuest ? "Guest" : "Registered Customer"}
                        {o.waiterName ? <span className="block text-xs">Waiter: {o.waiterName}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={rm.orderDetail} params={{ orderId: o.id }}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {d.rows.map((o) => (
                <MobileCard key={o.id} order={o} />
              ))}
            </ul>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {d.page} of {d.totalPages} · {d.totalCount} {d.totalCount === 1 ? "order" : "orders"}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={d.page <= 1}
                  onClick={() => setParam({ page: d.page - 1 }, false)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={d.page >= d.totalPages}
                  onClick={() => setParam({ page: d.page + 1 }, false)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MobileCard({ order }: { order: OrderListRow }) {
  const rm = useRmRoutes();
  const clock = useRestaurantTime();
  const money = useMoney();
  return (
    <li className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums">#{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {clock.dateTime(order.createdAt)} · Table {order.tableNumber}
      </p>
      <p className="text-sm text-muted-foreground">
        {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
        {order.source === "waiter_assisted" ? "Waiter-assisted" : order.isGuest ? "Guest" : "Registered Customer"}
        {order.waiterName ? ` · ${order.waiterName}` : ""}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-medium tabular-nums">{money(order.total)}</span>
        <Button asChild size="sm" variant="outline">
          <Link to={rm.orderDetail} params={{ orderId: order.id }}>View Order</Link>
        </Button>
      </div>
    </li>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, loading }: { label: string; value: string | null; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading || value === null ? (
        <div className="mt-1.5 h-5 w-12 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
