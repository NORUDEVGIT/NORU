import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug/status")({
  head: () => ({
    meta: [
      { title: "Order Status — Order to Your Table" },
      { name: "description", content: "Follow your order from the kitchen to your table in real time." },
      { property: "og:title", content: "Order Status — Order to Your Table" },
      { property: "og:description", content: "Received, preparing, ready, served — track every step." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatusRedirectPage,
});

/**
 * Legacy entry point. Order status now lives on a per-order route guarded by
 * the guest tracking token (or account ownership), so this simply forwards to
 * the last order placed in this browser session.
 */
function StatusRedirectPage() {
  const { restaurantSlug } = Route.useParams();
  const navigate = useNavigate();
  const { order } = useOrder();

  useEffect(() => {
    if (!order?.id) return;
    void navigate({
      to: "/r/$restaurantSlug/order/$orderId",
      params: { restaurantSlug, orderId: order.id },
      replace: true,
    });
  }, [order?.id, restaurantSlug, navigate]);

  if (order?.id) return null;

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl">No active order</h1>
        <p className="mt-2 text-muted-foreground">Place an order to follow its progress.</p>
        <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
          <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
            Browse the menu
          </Link>
        </Button>
      </main>
    </div>
  );
}
