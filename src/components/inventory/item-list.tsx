/**
 * Phase 8G2C — the stock item table, shared by Restaurant Management's
 * operational Inventory screen and Back Office's item master.
 *
 * Presentation only. Every action is handed back to the owning screen, which
 * calls the same inventory server functions — there is no second write path.
 */
import {
  AlertTriangle,
  History,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InventoryItem } from "@/lib/inventory.functions";
import type { MovementType } from "@/lib/inventory.server";
import { cn } from "@/lib/utils";

export type ItemAction = MovementType | "history" | "edit" | "recipes";

export function statusOf(item: InventoryItem): "out" | "low" | "in" {
  if (item.quantity <= 0) return "out";
  if (item.quantity <= item.minimumStockLevel) return "low";
  return "in";
}

export const STATUS_STYLE = {
  out: { label: "Out of stock", className: "bg-destructive/10 text-destructive" },
  low: { label: "Low stock", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  in: { label: "In stock", className: "bg-success/15 text-success" },
} as const;

export function ItemList({
  items,
  canManage,
  money,
  dateTime,
  onAction,
  emptyLabel = "No items yet.",
  showType = false,
}: {
  items: InventoryItem[];
  canManage: boolean;
  money: (v: number) => string;
  dateTime: (iso: string) => string;
  onAction: (item: InventoryItem, action: ItemAction) => void;
  emptyLabel?: string;
  showType?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Item</th>
              {showType ? <th className="px-4 py-3">Type</th> : null}
              <th className="px-4 py-3">Available</th>
              <th className="px-4 py-3">Minimum</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Unit cost</th>
              <th className="px-4 py-3">Stock value</th>
              <th className="px-4 py-3">Last updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const status = STATUS_STYLE[statusOf(item)];
              return (
                <tr key={item.id} className={cn(!item.active && "opacity-60")}>
                  <td className="px-4 py-3 font-medium">
                    {item.name}
                    {!item.active ? (
                      <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                    ) : null}
                  </td>
                  {showType ? (
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.inventoryType === "ingredient" ? "Ingredient" : "Consumable"}
                    </td>
                  ) : null}
                  <td className="px-4 py-3 tabular-nums">
                    {item.quantity} {item.unitCode}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {item.minimumStockLevel}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.unitCost === null ? "—" : money(item.unitCost)}</td>
                  <td className="px-4 py-3">
                    {item.stockValue === null ? "—" : money(item.stockValue)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {dateTime(item.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ItemActions item={item} canManage={canManage} onAction={onAction} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="space-y-3 lg:hidden">
        {items.map((item) => {
          const status = STATUS_STYLE[statusOf(item)];
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-2xl border border-border bg-card p-4",
                !item.active && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {item.quantity} {item.unitCode} · min {item.minimumStockLevel}
                  </p>
                </div>
                <ItemActions item={item} canManage={canManage} onAction={onAction} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={cn("rounded-full px-2.5 py-1 font-semibold", status.className)}>
                  {status.label}
                </span>
                <span className="text-muted-foreground">
                  {item.stockValue === null ? "No cost set" : `Value ${money(item.stockValue)}`}
                </span>
                <span className="text-muted-foreground">{dateTime(item.updatedAt)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ItemActions({
  item,
  canManage,
  onAction,
}: {
  item: InventoryItem;
  canManage: boolean;
  onAction: (item: InventoryItem, action: ItemAction) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {canManage ? (
          <DropdownMenuItem onSelect={() => onAction(item, "purchase_received")}>
            <Plus className="mr-2 size-4" /> Receive stock
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => onAction(item, "usage")}>
          <Minus className="mr-2 size-4" /> Record usage
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction(item, "waste")}>
          <Trash2 className="mr-2 size-4" /> Record waste
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction(item, "loss")}>
          <AlertTriangle className="mr-2 size-4" /> Record loss
        </DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction(item, "adjustment_in")}>
              Adjustment in
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(item, "adjustment_out")}>
              Adjustment out
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(item, "stocktake_adjustment")}>
              <SlidersHorizontal className="mr-2 size-4" /> Stocktake adjustment
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction(item, "history")}>
          <History className="mr-2 size-4" /> View history
        </DropdownMenuItem>
        {item.inventoryType === "ingredient" ? (
          <DropdownMenuItem onSelect={() => onAction(item, "recipes")}>
            Used in recipes
          </DropdownMenuItem>
        ) : null}
        {canManage ? (
          <DropdownMenuItem onSelect={() => onAction(item, "edit")}>
            <Pencil className="mr-2 size-4" /> Edit item
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
