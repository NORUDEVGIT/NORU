import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Circle, Dot } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/data/menu";
import { getMyOrder } from "@/lib/customer.functions";
import { CUSTOMER_STATUS_FLOW, normaliseStatus, statusLabel } from "@/lib/order-status";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/state/auth-store";

export const Route = createFileRoute("/account/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "Order Details — The Garden Table" },
      { name: "description", content: "See the items, totals and live status of your order." },
      { property: "og:title", content: "Order Details — The Garden Table" },
      { property: "og:description", content: "Track your Garden Table order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchOrder = useServerFn(getMyOrder);
  const { session } = useAuth();

  const { data: order, isLoading } = useQuery({
    queryKey: ["my-order", orderId],
    queryFn: () => fetchOrder({ data: { orderId } }),
    enabled: !!session,
    retry: false,
  });

  // Realtime status updates. RLS restricts the customer's stream to their own
  // orders, so no other customer's order can ever arrive here.
  useEffect(() => {
    const channel = supabase
      .channel(`customer-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["my-order", orderId] });
          void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted-foreground">Loading order…</main>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Order not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">This order isn't available on your account.</p>
          <Button asChild size="lg" className="mt-6 h-12 rounded-full px-6">
            <Link to="/account/orders">Back to your orders</Link>
          </Button>
        </main>
      </div>
    );
  }

  const current = normaliseStatus(order.status);
  const currentIndex = CUSTOMER_STATUS_FLOW.indexOf(current as (typeof CUSTOMER_STATUS_FLOW)[number]);
  const cancelled = current === "cancelled";

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link to="/account/orders" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Your orders
        </Link>

        <h1 className="font-display text-3xl">{order.restaurantName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order #{order.orderNumber} · Table {order.tableNumber} ·{" "}
          {new Date(order.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        <section className="mt-5 rounded-3xl border border-border/70 bg-card p-5">
          {cancelled ? (
            <p className="font-semibold text-destructive">Cancelled</p>
          ) : (
            <ol className="space-y-3">
              {CUSTOMER_STATUS_FLOW.map((step, index) => {
                const done = index < currentIndex;
                const active = index === currentIndex;
                return (
                  <li key={step} className="flex items-center gap-3">
                    {done ? (
                      <Check className="size-5 text-accent" />
                    ) : active ? (
                      <Dot className="size-5 text-accent" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/50" />
                    )}
                    <span className={active ? "font-semibold" : done ? "" : "text-muted-foreground"}>
                      {statusLabel(step)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="mt-4 divide-y divide-border rounded-3xl border border-border/70 bg-card px-5">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {item.quantity} × {item.name}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">{formatPrice(item.price)} each</p>
                {item.specialInstructions ? (
                  <p className="mt-1 text-sm italic text-muted-foreground">“{item.specialInstructions}”</p>
                ) : null}
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatPrice(item.lineTotal)}</p>
            </div>
          ))}
        </section>

        <div className="mt-4 flex justify-between rounded-3xl border border-border/70 bg-card p-5 text-xl font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(order.total)}</span>
        </div>
      </main>
    </div>
  );
}
