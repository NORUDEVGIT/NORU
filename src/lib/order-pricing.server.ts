import { createClient } from "@supabase/supabase-js";
import { MENU_ITEMS } from "@/data/menu";
import type { Database } from "@/integrations/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IncomingLine {
  menuItemId?: string | null | undefined;
  name: string;
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

export function publicServerClient() {
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

/**
 * Prices and names are NEVER taken from the browser. Every line is rebuilt from
 * an authoritative catalog: the menu_items table when the item exists there,
 * otherwise the server-side mock catalog that currently powers the menu.
 */
export async function resolveOrderLines(lines: IncomingLine[]): Promise<{
  resolved: ResolvedLine[];
  total: number;
}> {
  const ids = lines.map((l) => l.menuItemId).filter((id): id is string => !!id);
  const dbIds = ids.filter((id) => UUID_RE.test(id));

  const dbById = new Map<string, { id: string; name: string; price: number; available: boolean }>();
  if (dbIds.length > 0) {
    const supabase = publicServerClient();
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, price, available")
      .in("id", dbIds);
    if (error) throw new Error("Could not verify the menu right now. Please try again.");
    for (const row of data ?? []) {
      dbById.set(row.id, {
        id: row.id,
        name: row.name,
        price: Number(row.price),
        available: row.available !== false,
      });
    }
  }

  const localById = new Map(MENU_ITEMS.map((item) => [item.id, item]));

  const resolved = lines.map((line) => {
    const id = line.menuItemId ?? "";
    const dbItem = dbById.get(id);
    if (dbItem) {
      if (!dbItem.available) {
        throw new Error(`"${dbItem.name}" is no longer available.`);
      }
      return {
        menu_item_id: dbItem.id,
        item_name: dbItem.name,
        quantity: line.quantity,
        price: dbItem.price,
        special_instructions: line.specialInstructions?.trim() || null,
      };
    }

    const localItem = localById.get(id);
    if (localItem) {
      return {
        menu_item_id: null,
        item_name: localItem.name,
        quantity: line.quantity,
        price: localItem.price,
        special_instructions: line.specialInstructions?.trim() || null,
      };
    }

    throw new Error("One of the items in your order is no longer on the menu.");
  });

  const total = Number(
    resolved.reduce((sum, l) => sum + l.price * l.quantity, 0).toFixed(2),
  );

  return { resolved, total };
}
