import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const lineSchema = z.object({
  menuItemId: z.string().nullable().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive().max(20),
  price: z.number().nonnegative(),
  specialInstructions: z.string().max(500).nullable().optional(),
});

const placeOrderSchema = z.object({
  tableNumber: z.number().int().positive().max(999),
  lines: z.array(lineSchema).min(1).max(50),
});

export const getMenuItems = createServerFn({ method: "GET" }).handler(async () => {
  const { publicServerClient } = await import("./order-pricing.server");
  const supabase = publicServerClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, description, price, category, image_url, available")
    .eq("available", true)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data ?? [];
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    // Guests are allowed to INSERT orders, but have no SELECT policy on the
    // table, so PostgREST rejects an insert that returns the created row.
    // Use the privileged server client for this trusted, validated write.
    const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
    // Prices/names come from the authoritative catalog, never from the browser.
    const { resolveOrderLines } = await import("./order-pricing.server");
    const { resolved, total } = await resolveOrderLines(data.lines);

    // Single-tenant MVP: every order belongs to The Garden until the
    // restaurant is resolved from a table QR token in a later phase.
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id")
      .eq("slug", "the-garden")
      .single();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_number: data.tableNumber,
        status: "new",
        total,
        restaurant_id: restaurant?.id ?? null,
      })
      .select("id, order_number, table_number, total, status, created_at")
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message ?? "Could not create the order.");
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      resolved.map((line) => ({
        order_id: order.id,
        ...line,
        line_total: Number((line.price * line.quantity).toFixed(2)),
      })),
    );

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    return {
      id: order.id,
      orderNumber: order.order_number,
      tableNumber: order.table_number,
      total: Number(order.total),
    };
  });
