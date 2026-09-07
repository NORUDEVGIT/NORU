import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { DietaryBadges } from "@/components/dietary-badges";
import type { MenuItem } from "@/data/menu";
import { useMoney } from "@/core/state/restaurant-context";

export function MenuItemCard({
  item,
  onOpen,
  onAdd,
}: {
  item: MenuItem;
  onOpen: (item: MenuItem) => void;
  onAdd: (item: MenuItem) => void;
}) {
  const money = useMoney();
  return (
    <article className="group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full text-left"
        aria-label={`View ${item.name}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <img
            src={item.image ?? ""}
            alt={item.name}
            loading="lazy"
            width={800}
            height={600}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div className="space-y-2 p-4 pb-3">
          <h3 className="text-lg leading-tight font-semibold">{item.name}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          <DietaryBadges tags={item.dietaryTags} />
        </div>
      </button>
      <div className="flex items-center justify-between gap-3 px-4 pb-4">
        <span className="text-lg font-semibold tabular-nums">{money(item.price)}</span>
        <Button
          size="lg"
          className="h-12 rounded-full px-5 text-base"
          onClick={() => onAdd(item)}
          aria-label={`Add ${item.name} to order`}
        >
          <Plus className="size-5" />
          Add
        </Button>
      </div>
    </article>
  );
}
