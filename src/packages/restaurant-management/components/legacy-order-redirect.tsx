import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useOrder } from "@/packages/restaurant-management/state/order-store";

type LegacyPage = "cart" | "table" | "review" | "confirmation" | "status";

const PAGE_ROUTES = {
  cart: "/r/$restaurantSlug/cart",
  table: "/r/$restaurantSlug/table",
  review: "/r/$restaurantSlug/review",
  confirmation: "/r/$restaurantSlug/confirmation",
  status: "/r/$restaurantSlug/status",
} as const;

/**
 * Temporary backward compatibility for the old global ordering routes.
 * Redirects to the nested route only when a restaurant context is cached in the
 * session; otherwise it goes to the platform homepage — never to a default
 * restaurant.
 */
export function LegacyOrderRedirect({ page }: { page: LegacyPage }) {
  const navigate = useNavigate();
  const { restaurantSlug } = useOrder();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (restaurantSlug) {
        navigate({ to: PAGE_ROUTES[page], params: { restaurantSlug }, replace: true });
      } else {
        navigate({ to: "/", replace: true });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [navigate, page, restaurantSlug]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 text-center">
      <p className="text-muted-foreground">Taking you to your order…</p>
    </div>
  );
}
