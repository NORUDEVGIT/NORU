import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Boxes,
  History,
  Minus,
  MoreHorizontal,
  PackageX,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  ItemFormDialog,
  MOVEMENT_LABEL,
  MovementDialog,
  MovementHistoryDialog,
  type ItemFormValues,
} from "@/components/inventory/inventory-dialogs";
import {
  createInventoryItem,
  createInventoryMovement,
  getInventoryOverview,
  listInventoryItems,
  listInventoryMovements,
  listInventoryUnits,
  updateInventoryItem,
  type InventoryItem,
} from "@/lib/inventory.functions";
import type { MovementType } from "@/lib/inventory.server";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/restaurant/inventory")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/inventory" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Inventory — NORU" },
      {
        name: "description",
        content: "Track ingredients and consumables, receive stock, record usage and waste, and watch low-stock levels.",
      },
      { property: "og:title", content: "Inventory — NORU" },
      { property: "og:description", content: "Stock control for ingredients and consumables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InventoryRoute,
});

function InventoryRoute() {
  return <RestaurantShell active="Inventory">{(m) => <InventoryPage membership={m} />}</RestaurantShell>;
}

function statusOf(item: InventoryItem): "out" | "low" | "in" {
  if (item.quantity <= 0) return "out";
  if (item.quantity <= item.minimumStockLevel) return "low";
  return "in";
}

const STATUS_STYLE = {
  out: { label: "Out of stock", className: "bg-destructive/10 text-destructive" },
  low: { label: "Low stock", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  in: { label: "In stock", className: "bg-success/15 text-success" },
} as const;

function InventoryPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const fetchItems = useServerFn(listInventoryItems);
  const fetchUnits = useServerFn(listInventoryUnits);
  const fetchOverview = useServerFn(getInventoryOverview);
  const fetchMovements = useServerFn(listInventoryMovements);
  const saveItem = useServerFn(createInventoryItem);
  const editItem = useServerFn(updateInventoryItem);
  const recordMovement = useServerFn(createInventoryMovement);

  const [tab, setTab] = useState<"overview" | "ingredient" | "consumable">("overview");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [movementTarget, setMovementTarget] = useState<{ item: InventoryItem; type: MovementType } | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["inventory-items", restaurantId, showInactive],
    queryFn: () => fetchItems({ data: { restaurantId, includeInactive: showInactive } }),
  });
  const unitsQuery = useQuery({ queryKey: ["inventory-units"], queryFn: () => fetchUnits() });
  const overviewQuery = useQuery({
    queryKey: ["inventory-overview", restaurantId],
    queryFn: () => fetchOverview({ data: { restaurantId } }),
  });
  const recentQuery = useQuery({
    queryKey: ["inventory-recent", restaurantId],
    queryFn: () => fetchMovements({ data: { restaurantId, limit: 12 } }),
  });
  const historyQuery = useQuery({
    queryKey: ["inventory-history", restaurantId, historyItem?.id],
    queryFn: () => fetchMovements({ data: { restaurantId, itemId: historyItem!.id, limit: 200 } }),
    enabled: !!historyItem,
  });

  const permissions = itemsQuery.data?.permissions;
  const canManage = !!permissions?.canManage;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["inventory-items", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-overview", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-recent", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["inventory-history", restaurantId] });
  }

  const createMutation = useMutation({
    mutationFn: (values: ItemFormValues) =>
      saveItem({
        data: {
          restaurantId,
          name: values.name,
          inventoryType: values.inventoryType,
          baseUnitId: values.baseUnitId,
          openingQuantity: values.openingQuantity,
          minimumStockLevel: values.minimumStockLevel,
          unitCost: values.unitCost,
          notes: values.notes,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      toast.success("Inventory item created.");
      setFormOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (values: ItemFormValues & { itemId: string }) =>
      editItem({
        data: {
          restaurantId,
          itemId: values.itemId,
          name: values.name,
          minimumStockLevel: values.minimumStockLevel,
          unitCost: values.unitCost,
          notes: values.notes,
          active: values.active,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      toast.success("Item updated.");
      setFormOpen(false);
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const movementMutation = useMutation({
    mutationFn: (input: {
      itemId: string;
      movementType: MovementType;
      quantity: number;
      unitCost: number | null;
      reason: string | null;
      stocktakeDirection: "in" | "out";
    }) => recordMovement({ data: { restaurantId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) return toast.error(result.message);
      toast.success(`Stock updated — new balance ${result.balance}.`);
      setMovementTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allItems = itemsQuery.data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [allItems, search]);

  const overview = overviewQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Track ingredients and consumables. Every stock change is recorded in the movement ledger.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">New item</span>
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ingredient">Ingredients</TabsTrigger>
          <TabsTrigger value="consumable">Consumables</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total items" value={overview?.totalItems ?? "—"} icon={Boxes} />
            <StatCard label="Low stock" value={overview?.lowStock ?? "—"} icon={AlertTriangle} tone="warning" />
            <StatCard label="Out of stock" value={overview?.outOfStock ?? "—"} icon={PackageX} tone="danger" />
            <StatCard
              label="Estimated value"
              value={overview ? money(overview.estimatedValue) : "—"}
              icon={SlidersHorizontal}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-lg">Recent stock movements</h2>
            {recentQuery.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading movements…</p>
            ) : (recentQuery.data ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No stock movements recorded yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {(recentQuery.data ?? []).map((m) => (
                  <li key={m.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {MOVEMENT_LABEL[m.movementType]} · {dateTime(m.createdAt)} · {m.recordedBy ?? "Unknown"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        m.quantity >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity} {m.unitCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {(["ingredient", "consumable"] as const).map((type) => (
          <TabsContent key={type} value={type} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search items"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {canManage ? (
                <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
                  {showInactive ? "Hide inactive" : "Show inactive"}
                </Button>
              ) : null}
            </div>

            {itemsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading inventory…</p>
            ) : itemsQuery.isError ? (
              <p className="text-sm text-destructive">
                {(itemsQuery.error as Error)?.message ?? "We couldn't load inventory."}
              </p>
            ) : (
              <ItemList
                items={filtered.filter((i) => i.inventoryType === type)}
                canManage={canManage}
                money={money}
                dateTime={dateTime}
                onAction={(item, action) => {
                  if (action === "history") return setHistoryItem(item);
                  if (action === "edit") {
                    setEditing(item);
                    setFormOpen(true);
                    return;
                  }
                  setMovementTarget({ item, type: action });
                }}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ItemFormDialog
        open={formOpen}
        item={editing}
        defaultType={tab === "consumable" ? "consumable" : "ingredient"}
        units={unitsQuery.data ?? []}
        submitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) =>
          editing
            ? updateMutation.mutate({ ...values, itemId: editing.id })
            : createMutation.mutate(values)
        }
      />

      <MovementDialog
        open={!!movementTarget}
        item={movementTarget?.item ?? null}
        movementType={movementTarget?.type ?? "usage"}
        canSetCost={canManage}
        submitting={movementMutation.isPending}
        onClose={() => setMovementTarget(null)}
        onSubmit={(values) =>
          movementTarget
            ? movementMutation.mutate({
                itemId: movementTarget.item.id,
                movementType: movementTarget.type,
                ...values,
              })
            : undefined
        }
      />

      <MovementHistoryDialog
        open={!!historyItem}
        item={historyItem}
        movements={historyQuery.data ?? []}
        loading={historyQuery.isLoading}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Boxes;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon
          className={cn(
            "size-4",
            tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-destructive" : "text-primary",
          )}
        />
        {label}
      </div>
      <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

type ItemAction = MovementType | "history" | "edit";

function ItemList({
  items,
  canManage,
  money,
  dateTime,
  onAction,
}: {
  items: InventoryItem[];
  canManage: boolean;
  money: (v: number) => string;
  dateTime: (iso: string) => string;
  onAction: (item: InventoryItem, action: ItemAction) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No items yet.
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
                    {!item.active ? <span className="ml-2 text-xs text-muted-foreground">(inactive)</span> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {item.quantity} {item.unitCode}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{item.minimumStockLevel}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", status.className)}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.unitCost === null ? "—" : money(item.unitCost)}</td>
                  <td className="px-4 py-3">{item.stockValue === null ? "—" : money(item.stockValue)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{dateTime(item.updatedAt)}</td>
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
            <li key={item.id} className={cn("rounded-2xl border border-border bg-card p-4", !item.active && "opacity-60")}>
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
                <span className={cn("rounded-full px-2.5 py-1 font-semibold", status.className)}>{status.label}</span>
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
            <DropdownMenuItem onSelect={() => onAction(item, "adjustment_in")}>Adjustment in</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(item, "adjustment_out")}>Adjustment out</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction(item, "stocktake_adjustment")}>
              <SlidersHorizontal className="mr-2 size-4" /> Stocktake adjustment
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAction(item, "history")}>
          <History className="mr-2 size-4" /> View history
        </DropdownMenuItem>
        {canManage ? (
          <DropdownMenuItem onSelect={() => onAction(item, "edit")}>
            <Pencil className="mr-2 size-4" /> Edit item
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
