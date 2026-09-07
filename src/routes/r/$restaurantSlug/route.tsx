import { useEffect, useRef } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getPublicRestaurant } from "@/lib/public-restaurant.functions";
import { RestaurantProvider } from "@/state/restaurant-context";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug")({
  component: RestaurantLayout,
});

function RestaurantLayout() {
  const { restaurantSlug } = Route.useParams();
  const { restaurantSlug: cartSlug, lines, setRestaurantSlug } = useOrder();
  const notified = useRef<string | null>(null);

  const restaurantQuery = useQuery({
    queryKey: ["public-restaurant", restaurantSlug],
    queryFn: () => getPublicRestaurant({ data: { slug: restaurantSlug } }),
    retry: false,
  });
  const restaurant = restaurantQuery.data ?? null;

  // The URL is the source of truth for the tenant. Session state only caches it,
  // and a cart from another restaurant is cleared (with a notice) on arrival.
  useEffect(() => {
    if (!restaurant) return;
    if (cartSlug && cartSlug !== restaurant.slug && lines.length > 0 && notified.current !== restaurant.slug) {
      notified.current = restaurant.slug;
      toast.info(`Your previous order was cleared — you're now ordering from ${restaurant.name}.`);
    }
    setRestaurantSlug(restaurant.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.slug]);

  if (restaurantQuery.isLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-48 w-full animate-pulse rounded-3xl bg-muted sm:h-72" />
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Restaurant not available</h1>
          <p className="mt-2 text-muted-foreground">
            We couldn't find a restaurant taking orders at this address.
          </p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/">Back to home</Link>
          </Button>
        </main>
      </div>
    );
  }

  // Phase 8D2 — every page under /r/:slug inherits this gate, so no menu or
  // order data is fetched once ordering is unavailable. The message stays
  // neutral: nothing about packages, expiry or billing is shown.
  if (!restaurant.serviceAvailable) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Online ordering is currently unavailable</h1>
          <p className="mt-2 text-muted-foreground">
            Please ask a member of staff for help with your order.
          </p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/">Back to home</Link>
          </Button>
        </main>
      </div>
    );
  }


  return (
    <RestaurantProvider restaurant={restaurant}>
      <Outlet />
    </RestaurantProvider>
  );
}
