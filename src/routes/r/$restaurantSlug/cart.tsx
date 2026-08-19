import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuantityStepper } from "@/components/quantity-stepper";
import { formatPrice } from "@/data/menu";
import { useRestaurant } from "@/state/restaurant-context";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug/cart")({
  head: () => ({
    meta: [
      { title: "Your Order — Order to Your Table" },
      { name: "description", content: "Review the dishes in your order before sending them to the kitchen." },
      { property: "og:title", content: "Your Order — Order to Your Table" },
      { property: "og:description", content: "Review your dishes, quantities and notes before ordering." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { restaurantSlug } = Route.useParams();
  const restaurant = useRestaurant();
  const { lines, restaurantSlug: cartSlug, setQuantity, setNotes, removeLine, subtotal, total } =
    useOrder();

  // Never render another restaurant's cart: the layout resets the cart when the
  // URL tenant changes, so anything mismatched here is treated as empty.
  const visibleLines = cartSlug === restaurant.slug ? lines : [];

  return (
    <div className="min-h-dvh bg-background pb-32">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link
          to="/r/$restaurantSlug"
          params={{ restaurantSlug }}
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Back to menu
        </Link>
        <h1 className="font-display text-3xl">Your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">{restaurant.name}</p>

        {visibleLines.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-border p-10 text-center">
            <p className="text-lg font-medium">Your order is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a few dishes from the menu to get started.
            </p>
            <Button asChild size="lg" className="mt-6 h-13 rounded-full px-6">
              <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
                Browse the menu
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-5 space-y-4">
              {visibleLines.map((line) => (
                <li key={line.lineId} className="rounded-3xl border border-border/70 bg-card p-4">
                  <div className="flex gap-4">
                    <img
                      src={line.item.image ?? ""}
                      alt={line.item.name}
                      loading="lazy"
                      width={800}
                      height={600}
                      className="size-20 shrink-0 rounded-2xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-base font-semibold">{line.item.name}</h2>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${line.item.name}`}
                          className="size-10 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(line.lineId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {formatPrice(line.item.price)} each
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <QuantityStepper
                          size="sm"
                          quantity={line.quantity}
                          min={0}
                          onChange={(value) => setQuantity(line.lineId, value)}
                        />
                        <span className="text-lg font-semibold tabular-nums">
                          {formatPrice(line.item.price * line.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Input
                    value={line.notes ?? ""}
                    onChange={(event) => setNotes(line.lineId, event.target.value)}
                    placeholder="Special instructions (optional)"
                    className="mt-3 h-12 rounded-2xl bg-surface text-base"
                  />
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-3xl border border-border/70 bg-card p-5">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <div className="mt-3 flex justify-between text-xl font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
            </div>
          </>
        )}
      </main>

      {visibleLines.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur-md">
          <Button asChild size="lg" className="mx-auto flex h-14 w-full max-w-2xl rounded-full text-base">
            <Link to="/r/$restaurantSlug/table" params={{ restaurantSlug }}>
              Continue to order · {formatPrice(total)}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
