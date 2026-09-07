import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Restaurant-side order history. Every query is pinned to a restaurant the
 * caller has a verified active membership in, and runs through the caller's
 * own RLS context. restaurant_id from the browser is never trusted on its own.
 */

/** Statuses that mean "still in the operational pipeline". */
export const ACTIVE_ORDER_STATUSES = ["new", "placed", "accepted", "preparing", "ready"] as const;
export const ORDER_STATUS_VALUES = [
  "new",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
] as const;

export const ORDER_SORTS = ["newest", "oldest", "value_desc", "value_asc"] as const;
export const ORDER_PERIODS = ["today", "yesterday", "7d", "30d", "custom"] as const;
export const ORDER_PAGE_SIZE = 25;

const listSchema = z.object({
  restaurantId: z.string().uuid(),
  status: z.enum(["all", "active", ...ORDER_STATUS_VALUES]).default("all"),
  period: z.enum(ORDER_PERIODS).default("today"),
  from: z.string().date().optional().nullable(),
  to: z.string().date().optional().nullable(),
  search: z.string().trim().max(60).optional().nullable(),
  sort: z.enum(ORDER_SORTS).default("newest"),
  page: z.number().int().min(1).max(400).default(1),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
});

const detailSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
});

export interface OrderListRow {
  id: string;
  orderNumber: number;
  tableNumber: string;
  status: string;
  total: number;
  createdAt: string;
  /** "customer_qr" | "waiter_assisted" */
  source: string;
  /** Snapshot of the waiter responsible for the table, if any. */
  waiterName: string | null;
  itemCount: number;
  isGuest: boolean;
}

export interface OrderSummary {
  total: number;
  active: number;
  preparing: number;
  ready: number;
  completed: number;
  cancelled: number;
  orderValue: number;
}

export interface OrderListResult {
  rows: OrderListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  summary: OrderSummary;
}

export interface OrderDetail {
  id: string;
  orderNumber: number;
  tableNumber: string;
  status: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  isGuest: boolean;
  source: string;
  waiterName: string | null;
  createdByStaffName: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
    specialInstructions: string | null;
  }[];
  timeline: { id: string; status: string; createdAt: string }[];
}

/** Midnight (in the operator's local day) expressed as a UTC instant. */
function startOfLocalDay(offsetMinutes: number, daysAgo = 0): Date {
  const local = new Date(Date.now() - offsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(local.getTime() + offsetMinutes * 60_000);
}

function localDateToInstant(date: string, offsetMinutes: number, endOfDay: boolean): Date {
  const base = new Date(`${date}T00:00:00.000Z`);
  if (endOfDay) base.setUTCDate(base.getUTCDate() + 1);
  return new Date(base.getTime() + offsetMinutes * 60_000);
}

function resolveRange(
  input: z.infer<typeof listSchema>,
): { start: string; end: string | null } {
  const tz = input.tzOffsetMinutes;
  switch (input.period) {
    case "yesterday":
      return {
        start: startOfLocalDay(tz, 1).toISOString(),
        end: startOfLocalDay(tz, 0).toISOString(),
      };
    case "7d":
      return { start: startOfLocalDay(tz, 6).toISOString(), end: null };
    case "30d":
      return { start: startOfLocalDay(tz, 29).toISOString(), end: null };
    case "custom": {
      const start = input.from
        ? localDateToInstant(input.from, tz, false)
        : startOfLocalDay(tz, 29);
      const end = input.to ? localDateToInstant(input.to, tz, true) : null;
      return { start: start.toISOString(), end: end ? end.toISOString() : null };
    }
    case "today":
    default:
      return { start: startOfLocalDay(tz, 0).toISOString(), end: null };
  }
}

async function assertMembership(
  supabase: { from: (t: "restaurant_users") => any },
  userId: string,
  restaurantId: string,
) {
  const { data: membership } = await supabase
    .from("restaurant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  if (!membership) throw new Error("Order not found.");
  // Phase 8E1: order data is a Restaurant Management surface.
  const { requireRestaurantManagement } = await import("./restaurant-package.server");
  await requireRestaurantManagement(restaurantId);
  return membership as { role: string };
}


export const listRestaurantOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input))
  .handler(async ({ data, context }): Promise<OrderListResult> => {
    const supabase = context.supabase;
    await assertMembership(supabase as never, context.userId, data.restaurantId);

    const { start, end } = resolveRange(data);

    /** Applies tenant + date scope shared by the list and the summary. */
    const scoped = (query: any) => {
      let q = query.eq("restaurant_id", data.restaurantId).gte("created_at", start);
      if (end) q = q.lt("created_at", end);
      return q;
    };

    const applySearch = (query: any) => {
      const term = (data.search ?? "").trim();
      if (!term) return query;
      const numeric = term.replace(/[^0-9]/g, "");
      const table = term.replace(/^table\s*/i, "").trim();
      const filters: string[] = [];
      if (numeric) filters.push(`order_number.eq.${Number(numeric)}`);
      // Table label snapshot lives on the order row itself.
      filters.push(`table_number.ilike.%${table.replace(/[%,()]/g, "")}%`);
      return query.or(filters.join(","));
    };

    const applyStatus = (query: any) => {
      if (data.status === "all") return query;
      if (data.status === "active") {
        return query.in("status", ACTIVE_ORDER_STATUSES as unknown as string[]);
      }
      return query.eq("status", data.status);
    };

    const rangeFrom = (data.page - 1) * ORDER_PAGE_SIZE;

    let listQuery = applySearch(
      applyStatus(
        scoped(
          supabase
            .from("orders")
            .select("id, order_number, table_number, status, total, created_at, customer_id, order_source, assigned_waiter_name_snapshot, order_items(id)", {
              count: "exact",
            }),
        ),
      ),
    );

    switch (data.sort) {
      case "oldest":
        listQuery = listQuery.order("created_at", { ascending: true });
        break;
      case "value_desc":
        listQuery = listQuery.order("total", { ascending: false });
        break;
      case "value_asc":
        listQuery = listQuery.order("total", { ascending: true });
        break;
      default:
        listQuery = listQuery.order("created_at", { ascending: false });
    }

    // Summary reflects the selected date range (and search), not the status tab.
    const summaryQuery = applySearch(scoped(supabase.from("orders").select("status, total")));

    const [listRes, summaryRes] = await Promise.all([
      listQuery.range(rangeFrom, rangeFrom + ORDER_PAGE_SIZE - 1),
      summaryQuery,
    ]);

    if (listRes.error || summaryRes.error) {
      console.error("[listRestaurantOrders]", (listRes.error ?? summaryRes.error)?.message);
      throw new Error("Unable to load orders.");
    }

    const summaryRows: { status: string; total: number | string }[] = summaryRes.data ?? [];
    const count = (s: string) => summaryRows.filter((r) => r.status === s).length;
    const summary: OrderSummary = {
      total: summaryRows.length,
      active: summaryRows.filter((r) =>
        (ACTIVE_ORDER_STATUSES as readonly string[]).includes(r.status),
      ).length,
      preparing: count("preparing"),
      ready: count("ready"),
      completed: count("served"),
      cancelled: count("cancelled"),
      orderValue: Number(
        summaryRows
          .filter((r) => r.status !== "cancelled")
          .reduce((sum, r) => sum + Number(r.total), 0)
          .toFixed(2),
      ),
    };

    const totalCount = listRes.count ?? 0;
    return {
      rows: (listRes.data ?? []).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        tableNumber: o.table_number,
        status: o.status,
        total: Number(o.total),
        createdAt: o.created_at,
        source: o.order_source ?? "customer_qr",
        waiterName: o.assigned_waiter_name_snapshot ?? null,
        itemCount: (o.order_items ?? []).length,
        // Only the boolean is exposed — never the customer UUID.
        isGuest: !o.customer_id,
      })),
      page: data.page,
      pageSize: ORDER_PAGE_SIZE,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / ORDER_PAGE_SIZE)),
      summary,
    };
  });

export const getRestaurantOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => detailSchema.parse(input))
  .handler(async ({ data, context }): Promise<OrderDetail> => {
    const supabase = context.supabase;
    await assertMembership(supabase as never, context.userId, data.restaurantId);

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_number, table_number, status, total, created_at, updated_at, customer_id, restaurant_id, order_source, assigned_waiter_name_snapshot, created_by_staff_name_snapshot")
      .eq("id", data.orderId)
      // Tenant boundary: an order from another restaurant simply doesn't exist.
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();

    if (error) {
      console.error("[getRestaurantOrderDetail]", error.message);
      throw new Error("Order not found.");
    }
    if (!order) throw new Error("Order not found.");

    const [itemsRes, historyRes] = await Promise.all([
      supabase
        .from("order_items")
        .select("id, item_name, quantity, price, line_total, special_instructions")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("order_status_history")
        .select("id, status, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
    ]);

    if (itemsRes.error || historyRes.error) {
      console.error("[getRestaurantOrderDetail]", (itemsRes.error ?? historyRes.error)?.message);
      throw new Error("Order not found.");
    }

    return {
      id: order.id,
      orderNumber: order.order_number,
      tableNumber: order.table_number,
      status: order.status,
      total: Number(order.total),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      isGuest: !order.customer_id,
      source: (order as any).order_source ?? "customer_qr",
      // Prefer the snapshot taken at order time; never expose UUIDs.
      waiterName: (order as any).assigned_waiter_name_snapshot ?? null,
      createdByStaffName: (order as any).created_by_staff_name_snapshot ?? null,
      items: (itemsRes.data ?? []).map((i) => ({
        id: i.id,
        // Snapshot values as stored at order time — never current menu pricing.
        name: i.item_name,
        quantity: i.quantity,
        price: Number(i.price),
        lineTotal: i.line_total == null ? Number(i.price) * i.quantity : Number(i.line_total),
        specialInstructions: i.special_instructions,
      })),
      timeline: (historyRes.data ?? []).map((h) => ({
        id: h.id,
        status: h.status,
        createdAt: h.created_at,
      })),
    };
  });
