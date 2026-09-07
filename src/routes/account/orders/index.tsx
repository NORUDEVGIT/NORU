import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { SiteHeader } from "@/core/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { MenuLink } from "@/components/menu-link";
import { formatPrice } from "@/data/menu";
import { getMyOrders } from "@/core/lib/customer.functions";
import { statusLabel } from "@/lib/order-status";
import { useAuth } from "@/core/state/auth-store";

export const Route = createFileRoute("/account/orders/")({
  head: () => ({
    meta: [
      { title: "Your Orders — NORU" },
      { name: "description", content: "See every order you've placed across restaurants on the platform." },
      { property: "og:title", content: "Your Orders — NORU" },
      { property: "og:description", content: "Your NORU order history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const fetchOrders = useServerFn(getMyOrders);
  const { session } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: 20000,
    enabled: !!session,
    retry: false,
  });

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-display text-3xl">Your orders</h1>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading your orders…</p>
        ) : isError ? (
          <p className="mt-6 text-sm text-destructive">We couldn't load your orders right now.</p>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">You haven't placed any orders yet.</p>
            <Button asChild size="lg" className="mt-4 h-12 rounded-full px-6">
              <MenuLink>Browse the menu</MenuLink>
            </Button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {data!.map((order) => (
              <li key={order.id}>
                <Link
                  to="/account/orders/$orderId"
                  params={{ orderId: order.id }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
                >
                  <div className="min-w-0">
                    <p className="font-display text-lg">{order.restaurantName}</p>
                    <p className="text-sm text-muted-foreground">
                      Order #{order.orderNumber} · Table {order.tableNumber}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPrice(order.total)}</p>
                    <p className="text-sm text-muted-foreground">{statusLabel(order.status)}</p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
