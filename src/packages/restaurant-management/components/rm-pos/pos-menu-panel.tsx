import { Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import type { PosMenuItem } from "@/packages/restaurant-management/lib/rm-pos.functions";

/**
 * Touch menu grid. Every tile is one tap = one item added; targets stay well
 * above the 44px minimum and nothing depends on hover.
 */
export function PosMenuPanel({
  items,
  categories,
  categoryId,
  onCategory,
  search,
  onSearch,
  onAdd,
  money,
}: {
  items: PosMenuItem[];
  categories: { id: string; name: string }[];
  categoryId: string;
  onCategory: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  onAdd: (item: PosMenuItem) => void;
  money: (value: number) => string;
}) {
  const term = search.trim().toLowerCase();
  const visible = items.filter((item) => {
    const inCategory = categoryId === "all" || item.categoryId === categoryId;
    const matches = term === "" || item.name.toLowerCase().includes(term);
    return inCategory && matches;
  });

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search the menu"
          aria-label="Search the menu"
          className="h-14 rounded-2xl pl-12 text-base"
        />
      </div>

      <div className="shrink-0 overflow-x-auto pb-1">
        <div className="flex gap-2">
          {[{ id: "all", name: "All" }, ...categories].map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategory(category.id)}
              className={cn(
                "h-12 shrink-0 rounded-2xl border px-5 text-sm font-semibold transition-colors active:scale-[0.98]",
                categoryId === category.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground">No items match this view.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAdd(item)}
                className="flex h-28 flex-col justify-between rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.97] active:border-primary"
              >
                <span className="line-clamp-3 text-sm font-semibold leading-tight">{item.name}</span>
                <span className="text-base font-bold tabular-nums text-primary">
                  {money(item.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
