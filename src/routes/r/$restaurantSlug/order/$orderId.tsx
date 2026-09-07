import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { getTrackedOrder } from "@/lib/order-tracking.functions";
import { CUSTOMER_STATUS_FLOW, normaliseStatus, statusLabel } from "@/lib/order-status";
import { useOrder } from "@/state/order-store";
import { useMoney } from "@/state/restaurant-context";

export const Route = createFileRoute("/r/$restaurantSlug/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Your Order Status — Order to Your Table" },
      {
        name: "description",
        content: "Follow your order live: placed, accepted by the kitchen, preparing, ready, served.",
      },
      { property: "og:title", content: "Your Order Status" },
      { property: "og:description", content: "Live progress of your order, from kitchen to table." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrderStatusPage,
});

const STEP_HINTS: Record<string, string> = {
  placed: "Your order has been sent to the kitchen.",
  accepted: "The kitchen has accepted your order.",
  preparing: "Your dishes are being cooked.",
  ready: "Plated and waiting to be brought over.",
  served: "Enjoy your meal.",
};

function OrderStatusPage() {
  const money = useMoney();
  const { restaurantSlug, orderId } = Route.useParams();
  const { order: sessionOrder } = useOrder();
  const track = useServerFn(getTrackedOrder);

  // The guest token comes from this browser's session (set when the order was
  // placed) or from an explicit ?token= link. Signed-in owners need neither.
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const token =
    (search?.get("token") ?? "") ||
    (sessionOrder?.id === orderId ? sessionOrder.trackingToken : "") ||
    null;

  const { data, isLoading } = useQuery({
    queryKey: ["tracked-order", orderId, Boolean(token)],
    queryFn: () => track({ data: { orderId, restaurantSlug, token } }),
    // Live progression. Polling (rather than an anonymous realtime channel)
    // keeps every read behind the server-side token/ownership check: guests are
    // never allowed to subscribe to arbitrary order ids.
    refetchInterval: (query) =>
      query.state.data?.ok && query.state.data.order.status === "served" ? false : 5000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-24 text-center text-muted-foreground">
          Loading your order…
        </main>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Order not available</h1>
          <p className="mt-2 text-muted-foreground">
            This order can only be viewed from the device that placed it, or by the account that
            owns it.
          </p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
              Back to the menu
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  const order = data.order;
  const current = normaliseStatus(order.status);
  const cancelled = current === "cancelled";
  const activeIndex = CUSTOMER_STATUS_FLOW.indexOf(current as (typeof CUSTOMER_STATUS_FLOW)[number]);

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-muted-foreground">{order.restaurantName}</p>
        <h1 className="mt-1 font-display text-3xl">Order #{order.orderNumber}</h1>
        <p className="mt-1 text-muted-foreground">
          Table {order.tableNumber} · {money(order.total)}
        </p>

        <div className="mt-6 rounded-3xl border border-border/70 bg-card p-6">
          {cancelled ? (
            <p className="text-lg font-semibold text-destructive">{statusLabel("cancelled")}</p>
          ) : (
            <ol className="space-y-1">
              {CUSTOMER_STATUS_FLOW.map((step, index) => {
                const done = index < activeIndex;
                const active = index === activeIndex;
                return (
                  <li key={step} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={[
                          "grid size-10 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : active
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border bg-card text-muted-foreground",
                        ].join(" ")}
                      >
                        {index + 1}
                      </span>
                      {index < CUSTOMER_STATUS_FLOW.length - 1 ? (
                        <span
                          className={`my-1 w-0.5 flex-1 rounded-full ${done ? "bg-primary" : "bg-border"}`}
                        />
                      ) : null}
                    </div>
                    <div className="pb-5">
                      <p className={`text-lg font-semibold ${active ? "text-accent" : ""}`}>
                        {statusLabel(step)}
                      </p>
                      <p className="text-sm text-muted-foreground">{STEP_HINTS[step]}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="mt-4 rounded-3xl border border-border/70 bg-card px-5 py-2">
          <ul className="divide-y divide-border">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.quantity} × {item.name}
                  </p>
                  {item.specialInstructions ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Note: {item.specialInstructions}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {money(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Button asChild variant="outline" size="lg" className="mt-6 h-14 w-full rounded-full text-base">
          <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
            Back to the menu
          </Link>
        </Button>
      </main>
    </div>
  );
}
