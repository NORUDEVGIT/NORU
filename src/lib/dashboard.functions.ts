import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Dashboard overview is read-only and available to any active restaurant
 * member. Every query below is pinned to a restaurant_id the caller is a
 * verified member of, and runs through the user's own RLS context.
 */
const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  /** Date().getTimezoneOffset() from the browser, so "today" is the operator's day. */
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
});

/** Statuses that mean "still in the operational pipeline". */
export const ACTIVE_STATUSES = ["new", "placed", "accepted", "preparing", "ready"] as const;

export interface DashboardOrder {
  id: string;
  orderNumber: number;
  tableNumber: string;
  status: string;
  total: number;
  createdAt: string;
  itemCount: number;
}

export interface RestaurantDashboard {
  today: {
    orders: number;
    /** Sum of orders.total for today's orders, excluding cancelled. Order value, not payments. */
    revenue: number;
  };
  counts: {
    active: number;
    new: number;
    accepted: number;
    preparing: number;
    ready: number;
  };
  tables: { total: number; active: number; labels: { tableNumber: string; active: boolean }[] };
  menu: { total: number; available: number; unavailable: number; unavailableItems: string[] };
  liveOrders: DashboardOrder[];
  recentOrders: DashboardOrder[];
  ordersLast7Days: { date: string; label: string; orders: number }[];
}

function startOfLocalDay(offsetMinutes: number, daysAgo = 0): Date {
  const now = new Date();
  const local = new Date(now.getTime() - offsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(local.getTime() + offsetMinutes * 60_000);
}

const ORDER_SELECT = "id, order_number, table_number, status, total, created_at, order_items(id)";

type RawOrder = {
  id: string;
  order_number: number;
  table_number: string;
  status: string;
  total: number | string;
  created_at: string;
  order_items: { id: string }[] | null;
};

function mapOrder(o: RawOrder): DashboardOrder {
  return {
    id: o.id,
    orderNumber: o.order_number,
    tableNumber: o.table_number,
    status: o.status,
    total: Number(o.total),
    createdAt: o.created_at,
    itemCount: (o.order_items ?? []).length,
  };
}

export const getRestaurantDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<RestaurantDashboard> => {
    const supabase = context.supabase;

    // Authorisation: active membership only. Never trust the id alone.
    const { data: membership } = await supabase
      .from("restaurant_users")
      .select("role")
      .eq("user_id", context.userId)
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .maybeSingle();
    if (!membership) throw new Error("You don't have access to this restaurant.");

    const dayStart = startOfLocalDay(data.tzOffsetMinutes).toISOString();
    const weekStart = startOfLocalDay(data.tzOffsetMinutes, 6).toISOString();

    const [todayRes, activeRes, recentRes, tablesRes, menuRes, weekRes] = await Promise.all([
      // Light projection: no joins, only what the aggregates need.
      supabase
        .from("orders")
        .select("status, total")
        .eq("restaurant_id", data.restaurantId)
        .gte("created_at", dayStart),
      supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .in("status", ACTIVE_STATUSES as unknown as string[])
        .order("created_at", { ascending: true })
        .limit(12),
      supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("restaurant_tables")
        .select("table_number, active")
        .eq("restaurant_id", data.restaurantId)
        .order("table_number", { ascending: true }),
      supabase
        .from("menu_items")
        .select("name, available")
        .eq("restaurant_id", data.restaurantId),
      supabase
        .from("orders")
        .select("created_at, status")
        .eq("restaurant_id", data.restaurantId)
        .gte("created_at", weekStart),
    ]);

    const firstError =
      todayRes.error ?? activeRes.error ?? recentRes.error ?? tablesRes.error ?? menuRes.error ?? weekRes.error;
    if (firstError) {
      console.error("[getRestaurantDashboard]", firstError.message);
      throw new Error("We couldn't load your dashboard data right now.");
    }

    const todayRows = todayRes.data ?? [];
    const revenue = todayRows
      .filter((o) => o.status !== "cancelled")
      .reduce((sum, o) => sum + Number(o.total), 0);

    const activeOrders = (activeRes.data ?? []) as RawOrder[];
    const statusCount = (status: string) => activeOrders.filter((o) => o.status === status).length;

    const tables = tablesRes.data ?? [];
    const menuItems = menuRes.data ?? [];
    const unavailable = menuItems.filter((i) => !i.available);

    const buckets = new Map<string, number>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = startOfLocalDay(data.tzOffsetMinutes, i);
      buckets.set(
        new Date(d.getTime() - data.tzOffsetMinutes * 60_000).toISOString().slice(0, 10),
        0,
      );
    }
    for (const row of weekRes.data ?? []) {
      if (row.status === "cancelled") continue;
      const key = new Date(new Date(row.created_at).getTime() - data.tzOffsetMinutes * 60_000)
        .toISOString()
        .slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return {
      today: { orders: todayRows.length, revenue: Number(revenue.toFixed(2)) },
      counts: {
        active: activeOrders.length,
        new: statusCount("new") + statusCount("placed"),
        accepted: statusCount("accepted"),
        preparing: statusCount("preparing"),
        ready: statusCount("ready"),
      },
      tables: {
        total: tables.length,
        active: tables.filter((t) => t.active).length,
        labels: [...tables]
          .sort((a, b) =>
            a.table_number.localeCompare(b.table_number, undefined, { numeric: true, sensitivity: "base" }),
          )
          .slice(0, 24)
          .map((t) => ({ tableNumber: t.table_number, active: t.active })),
      },
      menu: {
        total: menuItems.length,
        available: menuItems.length - unavailable.length,
        unavailable: unavailable.length,
        unavailableItems: unavailable.slice(0, 6).map((i) => i.name),
      },
      liveOrders: activeOrders.map(mapOrder),
      recentOrders: ((recentRes.data ?? []) as RawOrder[]).map(mapOrder),
      ordersLast7Days: Array.from(buckets.entries()).map(([date, orders]) => ({
        date,
        label: new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short" }),
        orders,
      })),
    };
  });
