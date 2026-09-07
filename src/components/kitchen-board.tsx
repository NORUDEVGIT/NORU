import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Clock, LogOut, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { updateKitchenOrderStatus } from "@/lib/restaurant-orders.functions";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";

type OrderStatus = "new" | "preparing" | "ready" | "served";

type OrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
  special_instructions: string | null;
};

type KitchenOrder = {
  id: string;
  order_number: number;
  table_number: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  assigned_waiter_name_snapshot: string | null;
  order_source: string | null;
  items: OrderItem[];
};

const COLUMNS: { status: Exclude<OrderStatus, "served">; label: string; next: OrderStatus; action: string }[] = [
  { status: "new", label: "NEW", next: "preparing", action: "START PREPARING" },
  { status: "preparing", label: "PREPARING", next: "ready", action: "MARK READY" },
  { status: "ready", label: "READY", next: "served", action: "MARK SERVED" },
];

const ORDER_SELECT =
  "id, order_number, table_number, status, total, created_at, assigned_waiter_name_snapshot, order_source, order_items(id, item_name, quantity, price, special_instructions)";

function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio not permitted */
  }
}

/**
 * Tenant-scoped kitchen display. Every read, write and realtime subscription is
 * pinned to `restaurantId`, which the caller derives from the authenticated
 * user's restaurant_users membership (never from the browser URL).
 */
export function KitchenBoard({
  restaurantId,
  restaurantName,
  onSignOut,
  headerExtra,
}: {
  restaurantId: string;
  restaurantName: string;
  onSignOut: () => void | Promise<void>;
  headerExtra?: React.ReactNode;
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [alert, setAlert] = useState<{ orderNumber: number; tableNumber: string } | null>(null);
  const [flashing, setFlashing] = useState<string[]>([]);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const orderIdsRef = useRef<Set<string>>(new Set());

  const upsert = useCallback((order: KitchenOrder) => {
    setOrders((prev) => {
      const next = prev.filter((o) => o.id !== order.id);
      if (order.status === "served") return next;
      return [...next, order];
    });
  }, []);

  const fetchOrder = useCallback(
    async (id: string) => {
      const { data } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("id", id)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (!data) return;
      upsert({
        id: data.id,
        order_number: data.order_number,
        table_number: data.table_number,
        status: data.status as OrderStatus,
        total: Number(data.total),
        created_at: data.created_at,
        assigned_waiter_name_snapshot: data.assigned_waiter_name_snapshot ?? null,
        order_source: data.order_source ?? null,
        items: (data.order_items ?? []) as OrderItem[],
      });
    },
    [restaurantId, upsert],
  );

  useEffect(() => {
    orderIdsRef.current = new Set(orders.map((o) => o.id));
  }, [orders]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setOrders([]);
    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("restaurant_id", restaurantId)
        .neq("status", "served")
        .order("created_at", { ascending: true });
      if (!active) return;
      setOrders(
        (data ?? []).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          table_number: o.table_number,
          status: o.status as OrderStatus,
          total: Number(o.total),
          created_at: o.created_at,
          assigned_waiter_name_snapshot: o.assigned_waiter_name_snapshot ?? null,
          order_source: o.order_source ?? null,
          items: (o.order_items ?? []) as OrderItem[],
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    const filter = `restaurant_id=eq.${restaurantId}`;
    const channel = supabase
      .channel(`kitchen-orders-${restaurantId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter }, (payload) => {
        const row = payload.new as { id: string; order_number: number; table_number: string };
        void fetchOrder(row.id);
        setAlert({ orderNumber: row.order_number, tableNumber: row.table_number });
        setFlashing((prev) => (prev.includes(row.id) ? prev : [...prev, row.id]));
        setTimeout(() => setFlashing((prev) => prev.filter((id) => id !== row.id)), 20000);
        if (soundRef.current) playChime();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter }, (payload) => {
        void fetchOrder((payload.new as { id: string }).id);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_items" }, (payload) => {
        // order_items carries no restaurant_id; only react to orders we already hold.
        const orderId = (payload.new as { order_id: string }).order_id;
        if (orderIdsRef.current.has(orderId)) void fetchOrder(orderId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchOrder, restaurantId]);

  const advance = useCallback(
    async (order: KitchenOrder, next: OrderStatus) => {
      setOrders((prev) =>
        next === "served"
          ? prev.filter((o) => o.id !== order.id)
          : prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
      );
      // Goes through the trusted server action so package + membership checks
      // always apply; the browser can no longer write order status directly.
      const result = await updateKitchenOrderStatus({
        data: {
          restaurantId,
          orderId: order.id,
          status: next as "preparing" | "ready" | "served",
        },
      }).catch(() => ({ ok: false as const }));
      if (!result.ok) {
        setOrders((prev) =>
          prev.some((o) => o.id === order.id)
            ? prev.map((o) => (o.id === order.id ? order : o))
            : [...prev, order],
        );
      }
    },
    [restaurantId],
  );


  const grouped = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return COLUMNS.map((col) => ({
      ...col,
      orders: sorted.filter((o) => o.status === col.status),
    }));
  }, [orders]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-serif text-2xl font-semibold tracking-tight text-foreground">
              {restaurantName}
            </p>
            <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Kitchen Orders
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {headerExtra}
            <div className="rounded-lg border border-border px-4 py-2 text-center">
              <p className="text-3xl font-bold leading-none text-foreground">{orders.length}</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active orders
              </p>
            </div>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setSoundOn((s) => !s)}
              aria-label={soundOn ? "Mute notification sound" : "Unmute notification sound"}
            >
              {soundOn ? <Bell className="size-5" /> : <BellOff className="size-5" />}
              <span className="ml-2 hidden sm:inline">{soundOn ? "Sound on" : "Sound off"}</span>
            </Button>
            <Button variant="outline" size="lg" onClick={() => void onSignOut()}>
              <LogOut className="size-5" />
              <span className="ml-2 hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      {alert && (
        <div className="sticky top-[86px] z-10 px-5 pt-4">
          <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 rounded-xl border-2 border-primary bg-primary px-5 py-4 text-primary-foreground shadow-lg">
            <p className="text-lg font-bold uppercase tracking-wide sm:text-2xl">
              New order #{alert.orderNumber} — Table {alert.tableNumber}
            </p>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setAlert(null)}
              className="shrink-0 text-base font-bold"
            >
              <X className="mr-1 size-5" /> Dismiss
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1800px] px-5 py-6">
        {loading ? (
          <p className="text-lg text-muted-foreground">Loading orders…</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            {grouped.map((col) => (
              <section key={col.status} className="rounded-xl bg-muted/40 p-3">
                <h2 className="mb-3 flex items-center justify-between px-1 text-xl font-bold uppercase tracking-widest text-foreground">
                  {col.label}
                  <span className="rounded-md bg-foreground px-2 py-0.5 text-base text-background">
                    {col.orders.length}
                  </span>
                </h2>
                <div className="space-y-4">
                  {col.orders.length === 0 && (
                    <p className="px-1 py-6 text-base text-muted-foreground">No orders.</p>
                  )}
                  {col.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      actionLabel={col.action}
                      isNew={flashing.includes(order.id)}
                      onAdvance={() => void advance(order, col.next)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({
  order,
  actionLabel,
  isNew,
  onAdvance,
}: {
  order: KitchenOrder;
  actionLabel: string;
  isNew: boolean;
  onAdvance: () => void;
}) {
  const clock = useRestaurantTime();
  const money = useMoney();
  const notes = order.items
    .filter((i) => i.special_instructions)
    .map((i) => `${i.item_name}: ${i.special_instructions}`);

  return (
    <article
      className={cn(
        "rounded-xl border-2 border-border bg-card p-4 shadow-sm transition-all",
        isNew && "border-primary ring-4 ring-primary/30",
      )}
    >
      {isNew && (
        <p className="mb-2 inline-block rounded bg-primary px-2 py-1 text-xs font-bold uppercase tracking-widest text-primary-foreground">
          New order
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-foreground">#{order.order_number}</p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-4" /> {clock.time(order.created_at)}
          </p>
          {order.assigned_waiter_name_snapshot ? (
            <p className="text-sm text-muted-foreground">Waiter: {order.assigned_waiter_name_snapshot}</p>
          ) : null}
        </div>
        <div className="rounded-lg bg-foreground px-4 py-2 text-center text-background">
          <p className="text-xs font-bold uppercase tracking-widest">Table</p>
          <p className="text-4xl font-extrabold leading-none">{order.table_number}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 text-lg font-semibold text-foreground">
            <span>
              {item.quantity} × {item.item_name}
            </span>
            <span className="text-muted-foreground">{money(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      {notes.length > 0 && (
        <div className="mt-3 rounded-lg bg-accent/40 p-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Special instructions
          </p>
          {notes.map((note) => (
            <p key={note} className="text-base font-medium text-foreground">
              {note}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {order.status}
        </span>
        <span className="text-2xl font-bold text-foreground">{money(order.total)}</span>
      </div>

      <Button onClick={onAdvance} size="lg" className="mt-4 h-14 w-full text-lg font-bold uppercase tracking-wide">
        {actionLabel}
      </Button>
    </article>
  );
}