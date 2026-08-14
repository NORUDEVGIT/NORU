import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lineSchema = z.object({
  menuItemId: z.string().nullable().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  specialInstructions: z.string().nullable().optional(),
});

const placeOrderSchema = z.object({
  tableNumber: z.number().int().positive(),
  lines: z.array(lineSchema).min(1),
});

function serverClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getMenuItems = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = serverClient();
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
    const total = Number(
      data.lines.reduce((sum, l) => sum + l.price * l.quantity, 0).toFixed(2),
    );

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({ table_number: data.tableNumber, status: "new", total })
      .select("id, order_number, table_number, total, status, created_at")
      .single();

    if (orderError || !order) {
      throw new Error(orderError?.message ?? "Could not create the order.");
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      data.lines.map((line) => ({
        order_id: order.id,
        menu_item_id: line.menuItemId && UUID_RE.test(line.menuItemId) ? line.menuItemId : null,
        item_name: line.name,
        quantity: line.quantity,
        price: line.price,
        special_instructions: line.specialInstructions || null,
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
