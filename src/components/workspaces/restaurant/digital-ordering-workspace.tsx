import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getWaiterOrderContext, placeWaiterAssistedOrder } from "@/lib/waiter-orders.functions";
import { formatShiftTime } from "@/lib/workforce-rules";
import { cn } from "@/lib/utils";
import { useMoney } from "@/state/restaurant-context";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";


type CartLine = { menuItemId: string; name: string; price: number; quantity: number; note: string };


export function WaiterOrder({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const loadContext = useServerFn(getWaiterOrderContext);
  const submitOrder = useServerFn(placeWaiterAssistedOrder);

  const money = useMoney();
  const [tableId, setTableId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [placed, setPlaced] = useState<{ orderNumber: number; tableNumber: string; total: number } | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["waiter-context", restaurantId],
    queryFn: () => loadContext({ data: { restaurantId } }),
    retry: false,
    refetchInterval: 60_000,
  });

  const activeTable = data?.tables.find((t) => t.id === tableId) ?? null;

  const filteredMenu = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = data?.menu ?? [];
    return term ? items.filter((i) => i.name.toLowerCase().includes(term)) : items;
  }, [data?.menu, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredMenu>();
    for (const item of filteredMenu) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [filteredMenu]);

  const total = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  function addItem(item: { id: string; name: string; price: number }) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, note: "" }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  const mutation = useMutation({
    mutationFn: () =>
      submitOrder({
        data: {
          restaurantId,
          restaurantTableId: tableId!,
          lines: cart.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            specialInstructions: l.note.trim() || null,
          })),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPlaced({ orderNumber: result.orderNumber, tableNumber: result.tableNumber, total: result.total });
      setCart([]);
      void queryClient.invalidateQueries({ queryKey: ["waiter-context", restaurantId] });
    },
    onError: () => {
      toast.error("We couldn't send that order. Please try again.");
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading your tables…</p>;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Take an order</h1>
        <p className="mt-2 text-sm text-destructive">
          {(error as Error)?.message ?? "You don't have permission to take orders here."}
        </p>
      </div>
    );
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <ShoppingBag className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 font-display text-2xl">Order #{placed.orderNumber} sent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Table {placed.tableNumber} · {money(placed.total)} · now with the kitchen.
        </p>
        <Button className="mt-5 w-full" onClick={() => setPlaced(null)}>
          Take another order
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-32">
      <header>
        <h1 className="font-display text-2xl">Take an order</h1>
        <p className="text-sm text-muted-foreground">
          {data?.shift
            ? `Shift ${formatShiftTime(data.shift.startTime)}–${formatShiftTime(data.shift.endTime)} · ${data.shiftMessage}`
            : data?.isManager
              ? "Manager access — any active table"
              : (data?.shiftMessage ?? "No shift scheduled today")}
        </p>
      </header>

      {!data?.canOrder ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {data?.blockedReason ?? "You can't take orders right now."}
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {data.isManager ? "Table" : "My tables"}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.tables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTableId(t.id)}
                  className={cn(
                    "min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors",
                    tableId === t.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu"
              className="mb-4"
            />
            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">No available menu items.</p>
            ) : (
              <div className="space-y-5">
                {grouped.map(([category, items]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {category}
                    </h3>
                    <ul className="mt-2 divide-y divide-border">
                      {items.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{money(item.price)}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => addItem(item)}>
                            <Plus className="size-4" /> Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {cart.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Order</h2>
              <ul className="mt-3 space-y-4">
                {cart.map((line) => (
                  <li key={line.menuItemId} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{line.name}</p>
                        <p className="text-xs text-muted-foreground">{money(line.price * line.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Remove one ${line.name}`}
                          onClick={() => changeQty(line.menuItemId, -1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Add one ${line.name}`}
                          onClick={() => changeQty(line.menuItemId, 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={line.note}
                      rows={1}
                      maxLength={500}
                      placeholder="Special instructions (optional)"
                      onChange={(e) =>
                        setCart((prev) =>
                          prev.map((l) =>
                            l.menuItemId === line.menuItemId ? { ...l, note: e.target.value } : l,
                          ),
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center gap-4">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{money(total)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {activeTable ? activeTable.label : "Select a table"} · {cart.length} item
                  {cart.length === 1 ? "" : "s"}
                </p>
              </div>
              <Button
                size="lg"
                disabled={!tableId || cart.length === 0 || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Sending…" : "Send to kitchen"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
