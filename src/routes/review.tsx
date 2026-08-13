import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { OrderLines } from "@/components/order-lines";
import { formatPrice } from "@/data/menu";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review Your Order — The Garden Table" },
      { name: "description", content: "Check your dishes, table number and total before placing your order." },
      { property: "og:title", content: "Review Your Order — The Garden Table" },
      { property: "og:description", content: "One last look before your order goes to the kitchen." },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const navigate = useNavigate();
  const { lines, tableNumber, subtotal, total, placeOrder } = useOrder();
  const [submitting, setSubmitting] = useState(false);

  if (lines.length === 0 || !tableNumber) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Order not ready</h1>
          <p className="mt-2 text-muted-foreground">
            {lines.length === 0
              ? "Your order is empty."
              : "We still need your table number."}
          </p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to={lines.length === 0 ? "/" : "/table"}>
              {lines.length === 0 ? "Browse the menu" : "Enter table number"}
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background pb-32">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link to="/table" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Change table
        </Link>
        <h1 className="font-display text-3xl">Review your order</h1>

        <div className="mt-5 flex items-center justify-between rounded-3xl border border-border/70 bg-card px-5 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Table</p>
            <p className="font-display text-2xl">{tableNumber}</p>
          </div>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-full">
            <Link to="/table">Change</Link>
          </Button>
        </div>

        <div className="mt-4 rounded-3xl border border-border/70 bg-card px-5 py-2">
          <OrderLines lines={lines} />
        </div>

        <div className="mt-4 rounded-3xl border border-border/70 bg-card p-5">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          <div className="mt-3 flex justify-between text-xl font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(total)}</span>
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
              await placeOrder();
              navigate({ to: "/confirmation" });
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
          {submitting ? "Sending to the kitchen…" : `Place order · ${formatPrice(total)}`}
        </Button>
      </div>
    </div>
  );
}
