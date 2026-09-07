import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/core/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { resolveRestaurantTable } from "@/packages/restaurant-management/lib/tables.functions";
import { useOrder } from "@/core/state/order-store";

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
  const {
    setTableContext,
    lines,
    restaurantSlug: cartSlug,
    restaurantTableId,
    tableNumber,
  } = useOrder();
  const resolve = useServerFn(resolveRestaurantTable);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["table-qr", restaurantSlug, qrToken],
    queryFn: () => resolve({ data: { restaurantSlug, qrToken } }),
    retry: false,
  });

  const goToMenu = () =>
    void navigate({ to: "/r/$restaurantSlug", params: { restaurantSlug }, replace: true });

  // The resolved table id — not the scanned URL — becomes the order's table.
  useEffect(() => {
    if (!data?.ok) return;
    const table = data.table;
    // Scanning a different table in the SAME restaurant while a cart exists is
    // never applied silently: the diner confirms the move first.
    const switchingWithinRestaurant =
      lines.length > 0 &&
      cartSlug === table.restaurantSlug &&
      Boolean(restaurantTableId) &&
      restaurantTableId !== table.tableId;

    if (switchingWithinRestaurant) {
      setNeedsConfirm(true);
      return;
    }

    setTableContext({
      slug: table.restaurantSlug,
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      source: "qr",
    });
    goToMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (needsConfirm && data?.ok) {
    const table = data.table;
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Switch table?</h1>
          <p className="mt-3 text-muted-foreground">
            You currently have an order for Table {tableNumber}. Switch to Table{" "}
            {table.tableNumber}?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your items stay in your order — only the table changes.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button
              size="lg"
              className="h-14 rounded-full"
              onClick={() => {
                setTableContext({
                  slug: table.restaurantSlug,
                  tableId: table.tableId,
                  tableNumber: table.tableNumber,
                  source: "qr",
                });
                goToMenu();
              }}
            >
              Switch to Table {table.tableNumber}
            </Button>
            <Button variant="outline" size="lg" className="h-14 rounded-full" onClick={goToMenu}>
              Stay on Table {tableNumber}
            </Button>
          </div>
        </main>
      </div>
    );
  }

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
