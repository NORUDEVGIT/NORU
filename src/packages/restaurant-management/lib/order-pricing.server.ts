import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IncomingLine {
  menuItemId?: string | null | undefined;
  /** Display-only; the server never persists a browser-supplied name. */
  name?: string | undefined;
  quantity: number;
  specialInstructions?: string | null | undefined;
}

export interface ResolvedLine {
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  price: number;
  special_instructions: string | null;
}

export { publicServerClient } from "@/core/lib/public-client.server";

/**
 * Prices and names are NEVER taken from the browser. Every line is rebuilt from
 * the menu_items rows that belong to the resolved restaurant. There is no mock
 * catalog fallback: an item that is not in this restaurant's database menu
 * cannot be ordered.
 */
export async function resolveOrderLines(
  lines: IncomingLine[],
  restaurantId: string,
): Promise<{ resolved: ResolvedLine[]; total: number }> {
  const ids = lines
    .map((l) => l.menuItemId)
    .filter((id): id is string => !!id && UUID_RE.test(id));

  if (ids.length !== lines.length) {
    throw new Error("One of the items in your order is no longer on the menu.");
  }

  const supabase = publicServerClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, price, available")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error("Could not verify the menu right now. Please try again.");

  const byId = new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, name: row.name, price: Number(row.price), available: row.available !== false },
    ]),
  );

  const resolved = lines.map((line) => {
    const item = byId.get(line.menuItemId ?? "");
    if (!item) throw new Error("One of the items in your order is no longer on the menu.");
    if (!item.available) throw new Error(`"${item.name}" is no longer available.`);
    return {
      menu_item_id: item.id,
      item_name: item.name,
      quantity: line.quantity,
      price: item.price,
      special_instructions: line.specialInstructions?.trim() || null,
    };
  });

  const total = Number(resolved.reduce((sum, l) => sum + l.price * l.quantity, 0).toFixed(2));
  return { resolved, total };
}
