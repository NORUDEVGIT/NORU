import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChefHat } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_ORDER_STATUSES,
  getRestaurantOrderDetail,
  type OrderDetail,
} from "@/lib/restaurant-orders.functions";
import { statusLabel } from "@/lib/order-status";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useMoney } from "@/state/restaurant-context";
import { useRestaurantTime } from "@/state/restaurant-context";

export const Route = createFileRoute("/restaurant/orders/$orderId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Order Detail — Garden Table Platform" },
      {
        name: "description",
        content: "Review a single restaurant order: table, items ordered, historical pricing and status timeline.",
      },
      { property: "og:title", content: "Order Detail — Garden Table Platform" },
      { property: "og:description", content: "Restaurant order detail with items and status timeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailRoute,
});

function OrderDetailRoute() {
  return (
    <RestaurantShell active="Orders">
      {(membership) => <DetailBody membership={membership} />}
    </RestaurantShell>
  );
}

function clock.time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clock.dateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${clock.time(iso)}`;
}

function DetailBody({ membership }: { membership: RestaurantMembership }) {
  const clock = useRestaurantTime();
  const money = useMoney();
  const { orderId } = Route.useParams();
  const restaurantId = membership.restaurantId;
  const fetchDetail = useServerFn(getRestaurantOrderDetail);
  const queryClient = useQueryClient();

  const queryKey = ["restaurant-order", restaurantId, orderId];
  const query = useQuery<OrderDetail>({
    queryKey,
    queryFn: () => fetchDetail({ data: { restaurantId, orderId } }),
    retry: false,
  });

  // Realtime: refresh this order's status/timeline, scoped to the tenant.
  useEffect(() => {
    const channel = supabase
      .channel(`order-detail-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, orderId, queryClient]);

  if (query.isLoading) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl">Order not found.</h1>
        <Button asChild className="mt-4" size="sm" variant="outline">
          <Link to="/restaurant/orders" search={{ status: "all", period: "today", sort: "newest", page: 1 }}>
            Back to Orders
          </Link>
        </Button>
      </div>
    );
  }

  const order = query.data;
  const isActive = (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status);
  const subtotal = order.items.reduce((sum, i) => sum + i.lineTotal, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl leading-tight tabular-nums">Order #{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">{clock.dateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/restaurant/orders" search={{ status: "all", period: "today", sort: "newest", page: 1 }}>
              <ArrowLeft className="mr-2 size-4" /> Back to Orders
            </Link>
          </Button>
          {isActive ? (
            <Button asChild size="sm">
              <Link to="/restaurant/kitchen"><ChefHat className="mr-2 size-4" /> Open in Kitchen</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {order.status === "cancelled" ? (
        <p className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive">
          This order was cancelled.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg">Order Information</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Table" value={`Table ${order.tableNumber}`} />
              <Field label="Customer Type" value={order.isGuest ? "Guest" : "Registered Customer"} />
              <Field
                label="Order source"
                value={order.source === "waiter_assisted" ? "Waiter-assisted" : "Customer QR"}
              />
              <Field label="Waiter" value={order.waiterName ?? "Unassigned"} />
              {order.createdByStaffName ? (
                <Field label="Taken by" value={order.createdByStaffName} />
              ) : null}
              <Field label="Status" value={statusLabel(order.status)} />
              <Field label="Created" value={clock.dateTime(order.createdAt)} />
              <Field label="Last updated" value={clock.dateTime(order.updatedAt)} />
              <Field label="Order value" value={money(order.total)} />
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg">Items</h2>
            <ul className="mt-2 divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3">
                  <span className="w-8 shrink-0 font-semibold tabular-nums">{item.quantity}×</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {money(item.price)} each
                    </p>
                    {item.specialInstructions ? (
                      <p className="mt-1 text-sm text-muted-foreground">Note: {item.specialInstructions}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{money(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{money(order.total)}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg">Status Timeline</h2>
          {order.timeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No status history recorded for this order.</p>
          ) : (
            <ol className="mt-3 space-y-4">
              {order.timeline.map((entry, index) => (
                <li key={entry.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 size-2.5 shrink-0 rounded-full bg-primary" />
                    {index < order.timeline.length - 1 ? (
                      <span className="my-1 w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-medium">{statusLabel(entry.status)}</p>
                    <p className="text-xs text-muted-foreground">{clock.time(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-64 animate-pulse rounded-2xl bg-muted lg:col-span-2" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
