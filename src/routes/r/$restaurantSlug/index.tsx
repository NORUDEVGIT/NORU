import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { TableContextBar } from "@/components/table-context-bar";
import { MenuItemCard } from "@/components/menu-item-card";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "@/data/menu";
import { getPublicMenu } from "@/lib/menu.functions";
import { useRestaurant, useMoney } from "@/state/restaurant-context";
import { useOrder } from "@/state/order-store";
import heroImage from "@/assets/hero.jpg";

export const Route = createFileRoute("/r/$restaurantSlug/")({
  head: () => ({
    meta: [
      { title: "Restaurant Menu — Order to Your Table" },
      {
        name: "description",
        content:
          "Browse the seasonal menu and order straight to your table. No queue, no app, no account.",
      },
      { property: "og:title", content: "Restaurant Menu — Order to Your Table" },
      { property: "og:description", content: "Browse the menu and order from your seat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RestaurantMenuPage,
});

function RestaurantMenuPage() {
  const money = useMoney();
  const { restaurantSlug } = Route.useParams();
  const restaurant = useRestaurant();
  const { addItem, itemCount, total } = useOrder();
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);

  const fetchMenu = useServerFn(getPublicMenu);
  const { data: menu = [], isLoading } = useQuery({
    queryKey: ["public-menu", restaurantSlug],
    // Availability edits should reach diners quickly without a realtime channel.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => fetchMenu({ data: { slug: restaurantSlug } }),
  });

  const categories = useMemo(() => menu.map((c) => c.name), [menu]);
  const activeCategory = category && categories.includes(category) ? category : (categories[0] ?? "");

  const items = useMemo(() => {
    const all: MenuItem[] = menu.flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        category: group.name,
        image: item.image,
      })),
    );
    const query = search.trim().toLowerCase();
    if (query) {
      return all.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query),
      );
    }
    return all.filter((item) => item.category === activeCategory);
  }, [menu, search, activeCategory]);

  const handleAdd = (item: MenuItem, quantity = 1, notes = "") => {
    addItem(item, quantity, notes);
    toast.success(`${quantity} × ${item.name} added to your order`);
  };

  return (
    <div className="min-h-dvh bg-background pb-28">
      <SiteHeader
        categories={categories}
        restaurantName={restaurant.name}
        search={search}
        onSearchChange={setSearch}
        onSelectCategory={(value) => {
          setSearch("");
          setCategory(value);
        }}
      />

      <TableContextBar />

      <section className="relative mx-auto max-w-6xl px-4 pt-4">
        <div className="relative overflow-hidden rounded-3xl">
          <img
            src={heroImage}
            alt={`The dining room at ${restaurant.name}`}
            width={1600}
            height={900}
            className="h-48 w-full object-cover sm:h-72"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <h1 className="font-display text-3xl text-background sm:text-5xl">
              {restaurant.name}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-background/85 sm:text-base">
              Order straight to your table{restaurant.city ? ` in ${restaurant.city}` : ""}.
            </p>
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <nav
          aria-label="Menu categories"
          className="sticky top-[68px] z-30 mt-4 bg-background/90 py-2 backdrop-blur-md"
        >
          <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4">
            {categories.map((name) => {
              const active = !search && name === activeCategory;
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
      ) : null}

      <main className="mx-auto max-w-6xl px-4 pt-4">
        <h2 className="sr-only">{search ? "Search results" : activeCategory}</h2>
        {isLoading ? (
          <p className="py-16 text-center text-muted-foreground">Loading the menu…</p>
        ) : menu.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            This restaurant has not published a menu yet.
          </p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            {search ? `No dishes match “${search}”.` : "Nothing in this category yet."}
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
            <Link to="/r/$restaurantSlug/cart" params={{ restaurantSlug }}>
              <ShoppingBag className="size-5" />
              View order · {itemCount} {itemCount === 1 ? "item" : "items"} ·{" "}
              {money(total)}
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
