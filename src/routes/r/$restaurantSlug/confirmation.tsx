import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { OrderLines } from "@/components/order-lines";
import { formatPrice } from "@/data/menu";
import { useRestaurant } from "@/state/restaurant-context";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug/confirmation")({
  head: () => ({
    meta: [
      { title: "Order Confirmed — Order to Your Table" },
      { name: "description", content: "Your order has been sent to the kitchen." },
      { property: "og:title", content: "Order Confirmed — Order to Your Table" },
      { property: "og:description", content: "Order sent to the kitchen with your table number." },
    ],
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { restaurantSlug } = Route.useParams();
  const restaurant = useRestaurant();
  const { order, resetOrder } = useOrder();

  if (!order) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">No recent order</h1>
          <p className="mt-2 text-muted-foreground">Place an order to see your confirmation.</p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
              Browse the menu
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="fade-up mx-auto max-w-2xl px-4 py-8">
        <div className="text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary/12 text-primary">
            <CheckCircle2 className="size-9" />
          </div>
          <h1 className="mt-5 font-display text-3xl sm:text-4xl">Order Confirmed!</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you. Your order has been sent to {restaurant.name}.
          </p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-border/70 bg-card p-5">
            <p className="text-sm text-muted-foreground">Order number</p>
            <p className="font-display text-2xl">#{order.orderNumber}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-card p-5">
            <p className="text-sm text-muted-foreground">Table</p>
            <p className="font-display text-2xl">{order.tableNumber}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-3xl border border-accent/30 bg-accent/10 p-5">
          <Clock className="size-5 shrink-0 text-accent" />
          <p className="text-sm">
            Estimated preparation time:{" "}
            <span className="font-semibold">{order.prepMinutes}–{order.prepMinutes + 5} minutes</span>
          </p>
        </div>

        <div className="mt-3 rounded-3xl border border-border/70 bg-card px-5 py-2">
          <OrderLines lines={order.lines} />
        </div>

        <div className="mt-3 flex justify-between rounded-3xl border border-border/70 bg-card p-5 text-xl font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(order.total)}</span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-14 flex-1 rounded-full text-base">
            <Link to="/r/$restaurantSlug/status" params={{ restaurantSlug }}>
              Track your order
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 flex-1 rounded-full text-base">
            <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
              Back to menu
            </Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={resetOrder}
          className="mx-auto mt-6 block text-sm text-muted-foreground underline underline-offset-4"
        >
          Start a new order
        </button>
      </main>
    </div>
  );
}
