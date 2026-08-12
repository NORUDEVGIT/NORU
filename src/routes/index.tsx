import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { MenuItemCard } from "@/components/menu-item-card";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { Button } from "@/components/ui/button";
import { CATEGORIES, MENU_ITEMS, RESTAURANT, formatPrice, type MenuItem } from "@/data/menu";
import { useOrder } from "@/state/order-store";
import heroImage from "@/assets/hero.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Garden Table — Order to Your Table" },
      {
        name: "description",
        content:
          "Browse the seasonal menu at The Garden Table and order straight to your table. No queue, no app, no account.",
      },
      { property: "og:title", content: "The Garden Table — Order to Your Table" },
      {
        property: "og:description",
        content: "Seasonal plates, wood fire and garden greens, ordered from your seat.",
      },
    ],
  }),
  component: MenuPage,
});

function MenuPage() {
  const { addItem, itemCount, total } = useOrder();
  const [category, setCategory] = useState<string>(CATEGORIES[0]!);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query) {
      return MENU_ITEMS.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query),
      );
    }
    return MENU_ITEMS.filter((item) => item.category === category);
  }, [category, search]);

  const handleAdd = (item: MenuItem, quantity = 1, notes = "") => {
    addItem(item, quantity, notes);
    toast.success(`${quantity} × ${item.name} added to your order`);
  };

  return (
    <div className="min-h-dvh bg-background pb-28">
      <SiteHeader
        search={search}
        onSearchChange={setSearch}
        onSelectCategory={(value) => {
          setSearch("");
          setCategory(value);
        }}
      />

      <section className="relative mx-auto max-w-6xl px-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl">
          <img
            src={heroImage}
            alt="The dining room at The Garden Table"
            width={1600}
            height={900}
            className="h-48 w-full object-cover sm:h-72"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <h1 className="font-display text-3xl text-background sm:text-5xl">
              {RESTAURANT.name}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-background/85 sm:text-base">
              {RESTAURANT.tagline}
            </p>
          </div>
        </div>
      </section>

      <nav
        aria-label="Menu categories"
        className="sticky top-[68px] z-30 mt-4 bg-background/90 py-2 backdrop-blur-md"
      >
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4">
          {CATEGORIES.map((name) => {
            const active = !search && name === category;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setSearch("");
                  setCategory(name);
                }}
                className={[
                  "h-11 shrink-0 rounded-full border px-5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                ].join(" ")}
              >
                {name}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 pt-4">
        <h2 className="sr-only">{search ? "Search results" : category}</h2>
        {items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            No dishes match “{search}”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="fade-up">
                <MenuItemCard item={item} onOpen={setSelected} onAdd={(value) => handleAdd(value)} />
              </div>
            ))}
          </div>
        )}
      </main>

      <ItemDetailDialog
        item={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        onAdd={handleAdd}
      />

      {itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur-md">
          <Button asChild size="lg" className="mx-auto flex h-14 w-full max-w-2xl rounded-full text-base">
            <Link to="/cart">
              <ShoppingBag className="size-5" />
              View order · {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
              {formatPrice(total)}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
