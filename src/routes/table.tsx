import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Utensils } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/data/menu";
import { useOrder } from "@/state/order-store";

export const Route = createFileRoute("/table")({
  head: () => ({
    meta: [
      { title: "Your Table — The Garden Table" },
      { name: "description", content: "Tell us where you are sitting so we can bring your order to the right table." },
      { property: "og:title", content: "Your Table — The Garden Table" },
      { property: "og:description", content: "Enter your table number to send your order to the kitchen." },
    ],
  }),
  component: TablePage,
});

function TablePage() {
  const navigate = useNavigate();
  const { lines, tableNumber, setTableNumber, total } = useOrder();
  const [error, setError] = useState("");

  if (lines.length === 0) {
    return (
      <div className="min-h-dvh bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <h1 className="font-display text-3xl">Nothing to order yet</h1>
          <p className="mt-2 text-muted-foreground">Add a dish before choosing your table.</p>
          <Button asChild size="lg" className="mt-6 h-14 rounded-full px-6">
            <Link to="/">Browse the menu</Link>
          </Button>
        </main>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = tableNumber.trim();
    if (!value) {
      setError("Please enter your table number.");
      return;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
      setError("Table numbers run from 1 to 99.");
      return;
    }
    setError("");
    navigate({ to: "/review" });
  };

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-8">
        <Link to="/cart" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" /> Back to your order
        </Link>

        <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Utensils className="size-6" />
        </div>
        <h1 className="mt-5 font-display text-3xl">Where are you sitting?</h1>
        <p className="mt-2 text-muted-foreground">
          Enter your table number — no account needed.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            value={tableNumber}
            onChange={(event) => {
              setTableNumber(event.target.value.replace(/\D/g, "").slice(0, 2));
              setError("");
            }}
            placeholder="Table number"
            aria-label="Table number"
            aria-invalid={Boolean(error)}
            className="h-20 rounded-3xl bg-card text-center font-display text-4xl tabular-nums md:text-4xl"
          />
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="h-14 w-full rounded-full text-base">
            Continue · {formatPrice(total)}
          </Button>
        </form>
      </main>
    </div>
  );
}
