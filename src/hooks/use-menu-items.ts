import { useEffect, useState } from "react";
import { getMenuItems } from "@/lib/orders.functions";
import { MENU_ITEMS, type MenuCategory, type MenuItem } from "@/data/menu";

/**
 * Uses menu_items from the database when rows exist, otherwise falls back to
 * the local menu. Database rows carry UUID ids, so orders placed from them
 * link back to menu_items automatically.
 */
export function useMenuItems(): MenuItem[] {
  const [items, setItems] = useState<MenuItem[]>(MENU_ITEMS);

  useEffect(() => {
    let active = true;
    getMenuItems()
      .then((rows) => {
        if (!active || !rows || rows.length === 0) return;
        const byCategory = new Map(MENU_ITEMS.map((m) => [m.category, m.image] as const));
        setItems(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description ?? "",
            price: Number(row.price),
            category: row.category as MenuCategory,
            image: row.image_url ?? byCategory.get(row.category as MenuCategory) ?? "",
            dietaryTags: undefined,
          })),
        );
      })
      .catch(() => {
        // keep the local menu
      });
    return () => {
      active = false;
    };
  }, []);

  return items;
}
