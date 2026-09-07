import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/core/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { TableContextBar } from "@/components/table-context-bar";
import { OrderLines } from "@/components/order-lines";
import { useRestaurant, useMoney } from "@/core/state/restaurant-context";
import { useOrder } from "@/core/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug/review")({
  head: () => ({
    meta: [
      { title: "Review Your Order — Order to Your Table" },
      { name: "description", content: "Check your dishes, table number and total before placing your order." },
      { property: "og:title", content: "Review Your Order — Order to Your Table" },
      { property: "og:description", content: "One last look before your order goes to the kitchen." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const money = useMoney();
  const { restaurantSlug } = Route.useParams();
  const navigate = useNavigate();
  const restaurant = useRestaurant();
  const {
    lines,
    restaurantSlug: cartSlug,
    tableNumber,
    tableSource,
    subtotal,
    total,
    placeOrder,
  } = useOrder();
  const [submitting, setSubmitting] = useState(false);

  const tenantMismatch = Boolean(cartSlug) && cartSlug !== restaurant.slug;

  if (lines.length === 0 || tenantMismatch || !tableNumber) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Order not ready</h1>
          <p className="mt-2 text-muted-foreground">
            {lines.length === 0 || tenantMismatch
              ? "Your order is empty."
              : "We still need your table number."}
          </p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            {lines.length === 0 || tenantMismatch ? (
              <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
                Browse the menu
              </Link>
            ) : (
              <Link to="/r/$restaurantSlug/table" params={{ restaurantSlug }}>
                Enter table number
              </Link>
            )}
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-32">
      <SiteHeader />
      <TableContextBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link
          to="/r/$restaurantSlug/cart"
          params={{ restaurantSlug }}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Back to your order
        </Link>
        <h1 className="font-display text-3xl">Review your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">{restaurant.name}</p>

        <div className="mt-5 flex items-center justify-between rounded-3xl border border-border/70 bg-card px-5 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Table</p>
            <p className="font-display text-2xl">{tableNumber}</p>
          </div>
          {tableSource === "qr" ? (
            // Scanned tables are already verified server-side: no editable input.
            <span className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              Verified by QR
            </span>
          ) : (
            <Button asChild variant="outline" size="lg" className="h-12 rounded-full">
              <Link to="/r/$restaurantSlug/table" params={{ restaurantSlug }}>
                Change
              </Link>
            </Button>
          )}
        </div>

        <div className="mt-4 rounded-3xl border border-border/70 bg-card px-5 py-2">
          <OrderLines lines={lines} />
        </div>

        <div className="mt-4 rounded-3xl border border-border/70 bg-card p-5">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="mt-3 flex justify-between text-xl font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur-md">
        <Button
          size="lg"
          disabled={submitting}
          className="mx-auto flex h-14 w-full max-w-2xl rounded-full text-base"
          onClick={async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await placeOrder(restaurant.slug);
              navigate({ to: "/r/$restaurantSlug/confirmation", params: { restaurantSlug } });
            } catch (error) {
              toast.error(
                error instanceof Error && error.message
                  ? `We couldn't place that order. ${error.message}`
                  : "We couldn't place that order. Please check your connection and try again.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? "Sending to the kitchen…" : `Place order · ${money(total)}`}
        </Button>
      </div>
    </div>
  );
}
