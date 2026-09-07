import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Utensils } from "lucide-react";
import { SiteHeader } from "@/core/components/site-header";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { resolveManualTable } from "@/lib/tables.functions";
import { useOrder } from "@/core/state/order-store";
import { useMoney } from "@/core/state/restaurant-context";

export const Route = createFileRoute("/r/$restaurantSlug/table")({
  head: () => ({
    meta: [
      { title: "Your Table — Order to Your Table" },
      { name: "description", content: "Tell us where you are sitting so we can bring your order to the right table." },
      { property: "og:title", content: "Your Table — Order to Your Table" },
      { property: "og:description", content: "Enter your table number to send your order to the kitchen." },
    ],
  }),
  component: TablePage,
});

function TablePage() {
  const money = useMoney();
  const { restaurantSlug } = Route.useParams();
  const navigate = useNavigate();
  const { lines, tableNumber, setTableNumber, setTableContext, total } = useOrder();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const resolveTable = useServerFn(resolveManualTable);

  if (lines.length === 0) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Nothing to order yet</h1>
          <p className="mt-2 text-muted-foreground">Add a dish before choosing your table.</p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/r/$restaurantSlug" params={{ restaurantSlug }}>
              Browse the menu
            </Link>
          </Button>
        </main>
      </div>
    );
  }

  // Fallback flow: the typed number is never authoritative. The server matches
  // it against this restaurant's real, active table records and returns the
  // canonical restaurant_table_id whenever tables are configured.
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = tableNumber.trim();
    if (!value) {
      setError("Please enter your table number.");
      return;
    }
    setChecking(true);
    try {
      const result = await resolveTable({ data: { restaurantSlug, tableNumber: value } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setTableContext({
        slug: restaurantSlug,
        tableId: result.tableId,
        tableNumber: result.tableNumber,
        source: "manual",
      });
      navigate({ to: "/r/$restaurantSlug/review", params: { restaurantSlug } });
    } catch {
      setError("We couldn't check that table number. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-8">
        <Link
          to="/r/$restaurantSlug/cart"
          params={{ restaurantSlug }}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Back to your order
        </Link>

        <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Utensils className="size-6" />
        </div>
        <h1 className="mt-5 font-display text-3xl">Where are you sitting?</h1>
        <p className="mt-2 text-muted-foreground">
          Enter your table number — no account needed. Tip: scanning the QR code on your table
          fills this in for you.
        </p>

        <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-4">
          <Input
            autoFocus
            inputMode="text"
            value={tableNumber}
            onChange={(event) => {
              setTableNumber(event.target.value.slice(0, 20));
              setError("");
            }}
            placeholder="Table number"
            aria-label="Table number"
            aria-invalid={Boolean(error)}
            className="h-20 rounded-3xl bg-card text-center font-display text-4xl tabular-nums md:text-4xl"
          />
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" disabled={checking} className="h-14 w-full rounded-full text-base">
            {checking ? "Checking your table…" : `Continue · ${money(total)}`}
          </Button>
        </form>
      </main>
    </div>
  );
}
