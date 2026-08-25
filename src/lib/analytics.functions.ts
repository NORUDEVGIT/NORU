import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Restaurant analytics for the dashboard charts.
 *
 * NOTE ON "REVENUE": there is no payment integration yet, so every money figure
 * here is the sum of `orders.total` for non-cancelled orders — i.e. order value,
 * not settled payments.
 *
 * NOTE ON TIMEZONE: bucketing uses the browser's UTC offset passed from the
 * client. A per-restaurant timezone setting is a future improvement.
 */
export const ANALYTICS_PERIODS = ["today", "7d", "30d"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

const inputSchema = z.object({
  restaurantId: z.string().uuid(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  period: z.enum(ANALYTICS_PERIODS).default("today"),
});

export interface AnalyticsPoint {
  /** Stable bucket key (ISO date or ISO date+hour). */
  key: string;
  /** Short axis label, e.g. "14:00" or "Mon" / "24 Aug". */
  label: string;
  /** Verbose tooltip label, e.g. "Sun 24 Aug, 14:00". */
  fullLabel: string;
  /** Non-cancelled order value in the bucket. */
  value: number;
  /** Non-cancelled order count in the bucket. */
  orders: number;
}

export interface RestaurantAnalytics {
  period: AnalyticsPeriod;
  range: { start: string; end: string };
  totals: {
    /** Non-cancelled order value for the selected period. */
    orderValue: number;
    /** Non-cancelled order count for the selected period. */
    orders: number;
    /** All orders in period, including cancelled. */
    allOrders: number;
    averageOrderValue: number;
  };
  comparison: {
    /** null when the previous period has no basis for comparison. */
    orderValuePct: number | null;
    ordersPct: number | null;
    previousOrderValue: number;
    previousOrders: number;
    label: string;
  };
  series: AnalyticsPoint[];
  statuses: { status: string; count: number }[];
}

const STATUS_ORDER = ["new", "accepted", "preparing", "ready", "served", "cancelled"] as const;

/** Local-day start (in real UTC terms) for the given browser offset. */
function localDayStart(offsetMinutes: number, daysAgo = 0): Date {
  const local = new Date(Date.now() - offsetMinutes * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  return new Date(local.getTime() + offsetMinutes * 60_000);
}

/** Shift a real instant into "local wall clock" space for bucketing/labelling. */
function toLocal(iso: string, offsetMinutes: number): Date {
  return new Date(new Date(iso).getTime() - offsetMinutes * 60_000);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hourKey(d: Date): string {
  return `${dayKey(d)}T${String(d.getUTCHours()).padStart(2, "0")}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

type Row = { created_at: string; total: number | string; status: string };

export const getRestaurantAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<RestaurantAnalytics> => {
    const supabase = context.supabase;

    // Authorisation: verified active membership of this restaurant only.
    const { data: membership } = await supabase
      .from("restaurant_users")
      .select("role")
      .eq("user_id", context.userId)
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .maybeSingle();
    if (!membership) throw new Error("You don't have access to this restaurant.");

    const tz = data.tzOffsetMinutes;
    const days = data.period === "today" ? 1 : data.period === "7d" ? 7 : 30;

    const start = localDayStart(tz, days - 1);
    const prevStart = localDayStart(tz, days * 2 - 1);
    const end = new Date();

    // Only the columns the charts need, only the date range in question,
    // and no order_items joins.
    const { data: rows, error } = await supabase
      .from("orders")
      .select("created_at, total, status")
      .eq("restaurant_id", data.restaurantId)
      .gte("created_at", prevStart.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getRestaurantAnalytics]", error.message);
      throw new Error("We couldn't load your analytics right now.");
    }

    const all = (rows ?? []) as Row[];
    const startMs = start.getTime();
    const current = all.filter((r) => new Date(r.created_at).getTime() >= startMs);
    const previous = all.filter((r) => new Date(r.created_at).getTime() < startMs);

    // Build empty buckets first so charts never have gaps.
    const buckets = new Map<string, AnalyticsPoint>();
    if (data.period === "today") {
      const base = toLocal(start.toISOString(), tz);
      for (let h = 0; h < 24; h += 1) {
        const d = new Date(base);
        d.setUTCHours(h, 0, 0, 0);
        const label = `${String(h).padStart(2, "0")}:00`;
        buckets.set(hourKey(d), {
          key: hourKey(d),
          label,
          fullLabel: `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}, ${label}`,
          value: 0,
          orders: 0,
        });
      }
    } else {
      for (let i = days - 1; i >= 0; i -= 1) {
        const d = toLocal(localDayStart(tz, i).toISOString(), tz);
        const short = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
        buckets.set(dayKey(d), {
          key: dayKey(d),
          label: days === 7 ? DAY_NAMES[d.getUTCDay()]! : short,
          fullLabel: `${DAY_NAMES[d.getUTCDay()]} ${short}`,
          value: 0,
          orders: 0,
        });
      }
    }

    const statusCounts = new Map<string, number>();
    let orderValue = 0;
    let validOrders = 0;

    for (const row of current) {
      // "new" and "placed" are the same customer-facing state.
      const status = row.status === "placed" ? "new" : row.status;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
      if (row.status === "cancelled") continue;

      const local = toLocal(row.created_at, tz);
      const key = data.period === "today" ? hourKey(local) : dayKey(local);
      const bucket = buckets.get(key);
      const amount = Number(row.total);
      orderValue += amount;
      validOrders += 1;
      if (bucket) {
        bucket.value = Number((bucket.value + amount).toFixed(2));
        bucket.orders += 1;
      }
    }

    let previousValue = 0;
    let previousOrders = 0;
    for (const row of previous) {
      if (row.status === "cancelled") continue;
      previousValue += Number(row.total);
      previousOrders += 1;
    }

    return {
      period: data.period,
      range: { start: start.toISOString(), end: end.toISOString() },
      totals: {
        orderValue: Number(orderValue.toFixed(2)),
        orders: validOrders,
        allOrders: current.length,
        averageOrderValue: validOrders > 0 ? Number((orderValue / validOrders).toFixed(2)) : 0,
      },
      comparison: {
        orderValuePct: pct(orderValue, previousValue),
        ordersPct: pct(validOrders, previousOrders),
        previousOrderValue: Number(previousValue.toFixed(2)),
        previousOrders,
        label:
          data.period === "today" ? "vs yesterday" : data.period === "7d" ? "vs previous 7 days" : "vs previous 30 days",
      },
      series: [...buckets.values()],
      statuses: STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    };
  });
