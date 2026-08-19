import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { resolveRestaurantTable } from "@/lib/tables.functions";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/r/$restaurantSlug/t/$qrToken")({
  head: () => ({
    meta: [
      { title: "Order to Your Table" },
      { name: "description", content: "Scan complete — browse the menu and order straight to your table." },
      { property: "og:title", content: "Order to Your Table" },
      { property: "og:description", content: "Your table is ready. Browse the menu and order." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TableQrPage,
});

function TableQrPage() {
  const { restaurantSlug, qrToken } = Route.useParams();
  const navigate = useNavigate();
  const { setTableContext } = useOrder();
  const resolve = useServerFn(resolveRestaurantTable);

  const { data, isLoading } = useQuery({
    queryKey: ["table-qr", restaurantSlug, qrToken],
    queryFn: () => resolve({ data: { restaurantSlug, qrToken } }),
    retry: false,
  });

  // The resolved table id — not the scanned URL — becomes the order's table.
  useEffect(() => {
    if (!data?.ok) return;
    setTableContext({
      slug: data.table.restaurantSlug,
      tableId: data.table.tableId,
      tableNumber: data.table.tableNumber,
    });
    void navigate({ to: "/r/$restaurantSlug", params: { restaurantSlug }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading || data?.ok) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="text-muted-foreground">Opening your table…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="font-display text-3xl">This table is not available.</h1>
        <p className="mt-2 text-muted-foreground">
          Please ask a member of staff, or enter your table number manually.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild size="lg" className="h-14 rounded-full">
            <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
              Browse the menu
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 rounded-full">
            <Link to="/r/$restaurantSlug/table" params={{ restaurantSlug }}>
              Enter table number
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
