import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin } from "lucide-react";
import { useRestaurant } from "@/packages/restaurant-management/state/restaurant-context";
import { useOrder } from "@/packages/restaurant-management/state/order-store";

/**
 * Small persistent indicator so a diner always knows which restaurant and which
 * table their order is going to. Only human-readable values are shown — never
 * the table id or the QR token.
 */
export function TableContextBar() {
  const restaurant = useRestaurant();
  const { tableNumber, tableSource, restaurantSlug } = useOrder();
  const hasTable = Boolean(tableNumber);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <MapPin className="size-4 shrink-0 text-accent" />
          <p className="min-w-0 truncate text-sm">
            <span className="font-medium">{restaurant.name}</span>
            {hasTable ? (
              <>
                <span className="text-muted-foreground"> · </span>
                <span className="font-semibold">Table {tableNumber}</span>
              </>
            ) : (
              <span className="text-muted-foreground"> · No table selected</span>
            )}
          </p>
          {hasTable && tableSource === "qr" ? (
            <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Table verified by QR code" />
          ) : null}
        </div>
        {hasTable ? null : (
          <Link
            to="/r/$restaurantSlug/table"
            params={{ restaurantSlug: restaurantSlug || restaurant.slug }}
            className="shrink-0 text-sm font-medium text-primary underline underline-offset-4"
          >
            Select your table
          </Link>
        )}
      </div>
    </div>
  );
}
