/**
 * Phase 8G2C — Back Office Inventory / Warehouse.
 *
 * Back Office is the canonical home for central inventory governance: the item
 * master, property-wide movement history and the units reference. It reads and
 * writes the SAME records as Restaurant Management's operational Inventory
 * screen, through the same server functions and the same single stock ledger
 * (`apply_inventory_movement`). Nothing is copied, and there is no second
 * posting path.
 *
 * Recipe ingredient mapping and recipe costing stay in Restaurant Management.
 * Suppliers, purchase orders and goods receiving stay in Back Office
 * Procurement; Inventory only shows the stock movements they produce.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Boxes,
  History,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Truck,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  ItemFormDialog,
  MovementDialog,
  MovementHistoryDialog,
  type ItemFormValues,
} from "@/components/inventory/inventory-dialogs";
import { ItemList } from "@/components/inventory/item-list";
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
import { getMyModuleAccess } from "@/lib/module-access.functions";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";

const MOVEMENT_LABEL: Record<string, string> = {
  opening_balance: "Opening balance",
  purchase_received: "Received",
  usage: "Usage",
  waste: "Waste",
  loss: "Loss",
  adjustment_in: "Adjustment in",
  adjustment_out: "Adjustment out",
  stocktake_adjustment: "Stocktake",
};

function Header({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Back Office · Inventory / Warehouse
      </p>
      <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{blurb}</p>
    </header>
  );
}

/**
 * The Back Office package on its own grants nothing here: the person still
 * needs the existing Inventory module access for this property.
 */
function InventoryGate({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: React.ReactNode;
}) {
  const fetchModuleAccess = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModuleAccess({ data: { restaurantId } }),
    retry: false,
  });

  if (access.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!access.data?.modules.includes("inventory")) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You don&apos;t have Inventory access for this property. Ask an owner or manager to give you
        access.
      </div>
    );
  }
  return <>{children}</>;
}

// --------------------------------------------------------------- home

export function BackOfficeInventoryHome({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-6">
      <Header
        title="Inventory / Warehouse"
        blurb="Central control of what the property holds in stock: the item master, the movement ledger and the units every package measures in."
      />
      <InventoryGate restaurantId={restaurantId}>
        <HomeBody restaurantId={restaurantId} />
      </InventoryGate>
    </div>
  );
}

function HomeBody({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const fetchOverview = useServerFn(getInventoryOverview);
  const overview = useQuery({
    queryKey: ["bo-inventory-overview", restaurantId],
    queryFn: () => fetchOverview({ data: { restaurantId } }),
    retry: false,
  });
  const o = overview.data;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Active items" value={o ? String(o.totalItems) : "—"} />
        <Figure label="Low stock" value={o ? String(o.lowStock) : "—"} />
        <Figure label="Out of stock" value={o ? String(o.outOfStock) : "—"} />
        <Figure
          label="Stock at last known cost"
          value={o ? money(o.estimatedValue) : "—"}
          note="Quantity × unit cost. Not a valuation method."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NavCard
          icon={Boxes}
          title="Item master"
          body="Every ingredient and consumable the property holds, with current balance, minimum level and cost. Create, edit and adjust stock here."
          to="/restaurant/back-office/inventory/items"
          cta="Open item master"
        />
        <NavCard
          icon={History}
          title="Movement history"
          body="The property-wide stock ledger: receipts, usage, waste, loss, corrections and stocktakes, with who recorded each one."
          to="/restaurant/back-office/inventory/movements"
          cta="Open movement history"
        />
        <NavCard
          icon={Ruler}
          title="Units"
          body="The shared measurement reference used by items, recipes and purchasing across every package."
          to="/restaurant/back-office/inventory/units"
          cta="View units"
        />
        <NavCard
          icon={Truck}
          title="Procurement"
          body="Suppliers, purchase orders and goods receiving. Receiving a delivery writes one movement into this same stock ledger."
          to="/restaurant/back-office/procurement"
          cta="Open in Back Office · Procurement"
        />
      </div>

      <section className="rounded-2xl border border-dashed border-border p-5">
        <h2 className="font-display text-lg">Not built yet</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Stock valuation.</span> There is no
            costing method, period valuation or closing stock figure. The figure above is only
            quantity multiplied by the last known unit cost.
          </li>
          <li>
            <span className="font-medium text-foreground">Warehouses and transfers.</span> Stock is
            held once per property. There are no storage locations, central warehouse issues or
            inter-outlet transfers.
          </li>
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">
        Restaurant operational stock, operating assets and recipe cost stay in Restaurant
        Management. Both places read and write the same items and the same movement ledger.
      </p>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function NavCard({
  icon: Icon,
  title,
  body,
  to,
  cta,
}: {
  icon: typeof Boxes;
  title: string;
  body: string;
  to:
    | "/restaurant/back-office/inventory/items"
    | "/restaurant/back-office/inventory/movements"
    | "/restaurant/back-office/inventory/units"
    | "/restaurant/back-office/procurement";
  cta: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {cta}
        <ArrowUpRight className="size-4" />
      </Link>
    </section>
  );
}

// --------------------------------------------------------------- items

export function BackOfficeInventoryItems({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-6">
      <Header
        title="Item master"
        blurb="Every stock item the property holds. The same records Restaurant Management works with day to day."
      />
      <InventoryGate restaurantId={restaurantId}>
        <ItemsBody restaurantId={restaurantId} />
      </InventoryGate>
    </div>
  );
}

function ItemsBody({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const fetchItems = useServerFn(listInventoryItems);
  const fetchUnits = useServerFn(listInventoryUnits);
  const fetchMovements = useServerFn(listInventoryMovements);
  const saveItem = useServerFn(createInventoryItem);
  const editItem = useServerFn(updateInventoryItem);
  const recordMovement = useServerFn(createInventoryMovement);

  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "ingredient" | "consumable">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [movementTarget, setMovementTarget] = useState<{
    item: InventoryItem;
    type: MovementType;
  } | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["inventory-items", restaurantId, showInactive],
    queryFn: () => fetchItems({ data: { restaurantId, includeInactive: showInactive } }),
  });
  const unitsQuery = useQuery({ queryKey: ["inventory-units"], queryFn: () => fetchUnits() });
  const historyQuery = useQuery({
    queryKey: ["inventory-history", restaurantId, historyItem?.id],
    queryFn: () => fetchMovements({ data: { restaurantId, itemId: historyItem!.id, limit: 200 } }),
    enabled: !!historyItem,
  });

  const canManage = !!itemsQuery.data?.permissions?.canManage;

  function refresh() {
    for (const key of [
      "inventory-items",
      "inventory-history",
      "bo-inventory-overview",
      "bo-inventory-movements",
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key, restaurantId] });
    }
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
      if (!result.ok) return void toast.error(result.message);
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
      if (!result.ok) return void toast.error(result.message);
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
      if (!result.ok) return void toast.error(result.message);
      toast.success(`Stock updated — new balance ${result.balance}.`);
      setMovementTarget(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = itemsQuery.data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (type === "all" || i.inventoryType === type) &&
        (q ? i.name.toLowerCase().includes(q) : true),
    );
  }, [items, search, type]);

  return (
    <div className="space-y-4">
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
        {(["all", "ingredient", "consumable"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={type === t ? "default" : "outline"}
            onClick={() => setType(t)}
          >
            {t === "all" ? "All" : t === "ingredient" ? "Ingredients" : "Consumables"}
          </Button>
        ))}
        {canManage ? (
          <Button variant="outline" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
        ) : null}
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

      {itemsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : itemsQuery.isError ? (
        <p className="text-sm text-destructive">
          {(itemsQuery.error as Error)?.message ?? "We couldn't load the item master."}
        </p>
      ) : (
        <ItemList
          items={filtered}
          canManage={canManage}
          money={money}
          dateTime={dateTime}
          showType
          emptyLabel="No stock items match this view."
          onAction={(item, action) => {
            if (action === "history") return setHistoryItem(item);
            if (action === "recipes") {
              toast.info("Recipe use lives in Restaurant Management · Recipes & Cost.");
              return;
            }
            if (action === "edit") {
              setEditing(item);
              setFormOpen(true);
              return;
            }
            setMovementTarget({ item, type: action });
          }}
        />
      )}

      <ItemFormDialog
        open={formOpen}
        item={editing}
        defaultType="ingredient"
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

// ----------------------------------------------------------- movements

export function BackOfficeInventoryMovements({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-6">
      <Header
        title="Movement history"
        blurb="Every stock movement recorded for this property, whichever screen or package recorded it. This is the single stock ledger."
      />
      <InventoryGate restaurantId={restaurantId}>
        <MovementsBody restaurantId={restaurantId} />
      </InventoryGate>
    </div>
  );
}

function MovementsBody({ restaurantId }: { restaurantId: string }) {
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const fetchMovements = useServerFn(listInventoryMovements);
  const [search, setSearch] = useState("");

  const movementsQuery = useQuery({
    queryKey: ["bo-inventory-movements", restaurantId],
    queryFn: () => fetchMovements({ data: { restaurantId, limit: 200 } }),
    retry: false,
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (movementsQuery.data ?? []).filter((m) =>
      q ? m.itemName.toLowerCase().includes(q) : true,
    );
  }, [movementsQuery.data, search]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filter by item"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {movementsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading movements…</p>
      ) : movementsQuery.isError ? (
        <p className="text-sm text-destructive">
          {(movementsQuery.error as Error)?.message ?? "We couldn't load movement history."}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No stock movements recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Movement</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Balance after</th>
                <th className="px-4 py-3">Unit cost</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Recorded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {dateTime(m.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium">{m.itemName}</td>
                  <td className="px-4 py-3">{MOVEMENT_LABEL[m.movementType] ?? m.movementType}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {m.unitCode}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{m.balanceAfter ?? "—"}</td>
                  <td className="px-4 py-3">{m.unitCost === null ? "—" : money(m.unitCost)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.recordedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Goods received against a purchase order appear here as a single received movement —
        Procurement records the purchase, Inventory records the stock.
      </p>
    </div>
  );
}

// --------------------------------------------------------------- units

export function BackOfficeInventoryUnits({ restaurantId }: { restaurantId: string }) {
  return (
    <div className="space-y-6">
      <Header
        title="Units"
        blurb="The shared measurement reference. Items, recipes and purchasing all measure in these units."
      />
      <InventoryGate restaurantId={restaurantId}>
        <UnitsBody />
      </InventoryGate>
    </div>
  );
}

function UnitsBody() {
  const fetchUnits = useServerFn(listInventoryUnits);
  const unitsQuery = useQuery({ queryKey: ["inventory-units"], queryFn: () => fetchUnits() });
  const units = unitsQuery.data ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, typeof units>();
    for (const u of units) map.set(u.unitType, [...(map.get(u.unitType) ?? []), u]);
    return [...map.entries()];
  }, [units]);

  if (unitsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading units…</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(([type, list]) => (
          <section key={type} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-lg capitalize">{type}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {list.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3">
                  <span>{u.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{u.code}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Units are a platform reference list and are read-only here.
      </p>
    </div>
  );
}
