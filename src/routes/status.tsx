import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { MenuLink } from "@/components/menu-link";
import { StatusTracker } from "@/components/status-tracker";
import { formatPrice } from "@/data/menu";
import { ORDER_STATUS_STEPS, useOrder } from "@/state/order-store";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Order Status — The Garden Table" },
      { name: "description", content: "Follow your order from the kitchen to your table in real time." },
      { property: "og:title", content: "Order Status — The Garden Table" },
      { property: "og:description", content: "Received, preparing, ready, served — track every step." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  const { order, status, advanceStatus, setStatus } = useOrder();

  if (!order) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">No active order</h1>
          <p className="mt-2 text-muted-foreground">Place an order to follow its progress.</p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <MenuLink>Browse the menu</MenuLink>
          </Button>
        </main>
      </div>
    );
  }

  const isLast = status === ORDER_STATUS_STEPS[ORDER_STATUS_STEPS.length - 1]!.key;

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl">Order #{order.orderNumber}</h1>
        <p className="mt-1 text-muted-foreground">
          Table {order.tableNumber} · {formatPrice(order.total)}
        </p>

        <div className="mt-8 rounded-3xl border border-border/70 bg-card p-6">
          <StatusTracker status={status} />
        </div>

        <div className="mt-6 rounded-3xl border border-dashed border-border p-5">
          <p className="text-sm font-medium">Demo controls</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Simulate the kitchen updating your order.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-13 flex-1 rounded-full"
              onClick={advanceStatus}
              disabled={isLast}
            >
              {isLast ? "Order served" : "Advance status"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-13 flex-1 rounded-full"
              onClick={() => setStatus("received")}
            >
              Reset
            </Button>
          </div>
        </div>

        <Button asChild variant="outline" size="lg" className="mt-6 h-14 w-full rounded-full text-base">
          <MenuLink>Back to menu</MenuLink>
        </Button>
      </main>
    </div>
  );
}
