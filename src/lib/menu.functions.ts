import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Roles allowed to manage a restaurant's menu. Kitchen/waiter cannot edit. */
const MANAGE_ROLES = ["owner", "manager"] as const;

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  categoryId: string | null;
  category: string;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: PublicMenuItem[];
}

export interface ManagedCategory {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ManagedItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string | null;
  imageRef: string | null;
  imageUrl: string | null;
  available: boolean;
}

const slugSchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9-]+$/i),
});

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(80);
const descSchema = z.string().trim().max(500).optional().nullable();

/**
 * Public, database-backed menu for /r/:restaurantSlug. Only approved AND active
 * restaurants resolve; only active categories and available items are returned.
 * Everything is scoped by restaurant_id in the query — never filtered in the
 * browser.
 */
export const getPublicMenu = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }): Promise<PublicMenuCategory[]> => {
    const { publicServerClient } = await import("./order-pricing.server");
    const { resolveImageUrls } = await import("./menu-images.server");
    const supabase = publicServerClient();

    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id, approved, active")
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    if (!restaurant || !restaurant.approved || !restaurant.active) return [];

    const [{ data: categories }, { data: items }] = await Promise.all([
      supabase
        .from("menu_categories")
        .select("id, name, description, sort_order")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id, category")
        .eq("restaurant_id", restaurant.id)
        .eq("available", true)
        .order("name", { ascending: true }),
    ]);

    const signed = await resolveImageUrls((items ?? []).map((i) => i.image_url));
    const byCategory = new Map<string, PublicMenuItem[]>();
    for (const row of items ?? []) {
      const list = byCategory.get(row.category_id ?? "") ?? [];
      list.push({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        price: Number(row.price),
        image: row.image_url ? (signed.get(row.image_url) ?? row.image_url) : null,
        categoryId: row.category_id,
        category: row.category ?? "",
      });
      byCategory.set(row.category_id ?? "", list);
    }

    const result: PublicMenuCategory[] = (categories ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        items: (byCategory.get(c.id) ?? []).map((i) => ({ ...i, category: c.name })),
      }))
      .filter((c) => c.items.length > 0);

    return result;
  });

/** Confirms the caller manages this restaurant. Never trusts the browser. */
async function assertManager(
  supabase: { from: (t: string) => any },
  userId: string,
  restaurantId: string,
) {
  const { data } = await supabase
    .from("restaurant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (!role || !MANAGE_ROLES.includes(role as (typeof MANAGE_ROLES)[number])) {
    throw new Error("You don't have permission to manage this menu.");
  }
  // Phase 8E1: menu management is a Restaurant Management action. Checked here,
  // before any menu read or write, so every mutation below inherits the gate.
  const { requireRestaurantManagement } = await import("./restaurant-package.server");
  await requireRestaurantManagement(restaurantId);
  return role;
}


export const getManagedMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<{ categories: ManagedCategory[]; items: ManagedItem[] }> => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { resolveImageUrls } = await import("./menu-images.server");

    const [{ data: categories }, { data: items }] = await Promise.all([
      context.supabase
        .from("menu_categories")
        .select("id, name, description, sort_order, active")
        .eq("restaurant_id", data.restaurantId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      context.supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id, available")
        .eq("restaurant_id", data.restaurantId)
        .order("name", { ascending: true }),
    ]);

    const signed = await resolveImageUrls((items ?? []).map((i) => i.image_url));
    return {
      categories: (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        sortOrder: c.sort_order,
        active: c.active,
      })),
      items: (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: Number(i.price),
        categoryId: i.category_id,
        imageRef: i.image_url,
        imageUrl: i.image_url ? (signed.get(i.image_url) ?? i.image_url) : null,
        available: i.available,
      })),
    };
  });

const categoryInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: nameSchema,
  description: descSchema,
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoryInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const payload = {
      // restaurant_id always comes from the authorized context above.
      restaurant_id: data.restaurantId,
      name: data.name,
      description: data.description?.trim() || null,
      sort_order: data.sortOrder,
      active: data.active,
    };

    const query = data.id
      ? context.supabase
          .from("menu_categories")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : context.supabase.from("menu_categories").insert(payload);

    const { error } = await query;
    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, message: "You already have an active category with that name." };
      }
      return { ok: false as const, message: "Could not save the category." };
    }
    return { ok: true as const };
  });

export const setCategoryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { error } = await context.supabase
      .from("menu_categories")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the category." };
    return { ok: true as const };
  });

export const moveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, direction: z.enum(["up", "down"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { data: rows } = await context.supabase
      .from("menu_categories")
      .select("id, sort_order")
      .eq("restaurant_id", data.restaurantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    const list = rows ?? [];
    const index = list.findIndex((r) => r.id === data.id);
    const swapWith = data.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= list.length) return { ok: true as const };

    const a = list[index]!;
    const b = list[swapWith]!;
    await context.supabase
      .from("menu_categories")
      .update({ sort_order: b.sort_order })
      .eq("id", a.id)
      .eq("restaurant_id", data.restaurantId);
    await context.supabase
      .from("menu_categories")
      .update({ sort_order: a.sort_order })
      .eq("id", b.id)
      .eq("restaurant_id", data.restaurantId);
    return { ok: true as const };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { count } = await context.supabase
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("category_id", data.id);
    if ((count ?? 0) > 0) {
      return {
        ok: false as const,
        message: "This category still contains items. Move or remove them first, or just deactivate it.",
      };
    }
    const { error } = await context.supabase
      .from("menu_categories")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not delete the category." };
    return { ok: true as const };
  });

const itemInput = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: nameSchema,
  description: descSchema,
  price: z.number().nonnegative().max(10000),
  categoryId: idSchema,
  imageRef: z.string().trim().max(500).optional().nullable(),
  available: z.boolean(),
});

export const saveMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => itemInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);

    // The category must belong to the same restaurant: a browser cannot attach
    // an item to another tenant's category.
    const { data: category } = await context.supabase
      .from("menu_categories")
      .select("id, name")
      .eq("id", data.categoryId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!category) return { ok: false as const, message: "That category doesn't belong to this restaurant." };

    // Image references are either a CDN/absolute URL or a storage ref inside
    // this restaurant's own namespace.
    let imageRef = data.imageRef?.trim() || null;
    if (imageRef?.startsWith("storage:") && !imageRef.startsWith(`storage:${data.restaurantId}/`)) {
      return { ok: false as const, message: "Invalid image reference." };
    }

    const payload = {
      restaurant_id: data.restaurantId,
      category_id: category.id,
      category: category.name,
      name: data.name,
      description: data.description?.trim() || null,
      price: Number(data.price.toFixed(2)),
      image_url: imageRef,
      available: data.available,
    };

    const query = data.id
      ? context.supabase
          .from("menu_items")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : context.supabase.from("menu_items").insert(payload);

    const { error } = await query;
    if (error) return { ok: false as const, message: "Could not save the menu item." };
    return { ok: true as const };
  });

export const setItemAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, available: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { error } = await context.supabase
      .from("menu_items")
      .update({ available: data.available })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update availability." };
    return { ok: true as const };
  });

/**
 * Removes an item. Items referenced by historical orders are archived
 * (unavailable) instead of deleted so order snapshots stay intact.
 */
export const deleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { error } = await context.supabase
      .from("menu_items")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      const { error: archiveError } = await context.supabase
        .from("menu_items")
        .update({ available: false })
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (archiveError) return { ok: false as const, message: "Could not remove the item." };
      return { ok: true as const, archived: true };
    }
    return { ok: true as const, archived: false };
  });

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Issues a one-shot signed upload URL inside the caller's own restaurant
 * namespace. The path is generated server-side; the original filename is never
 * trusted.
 */
export const createMenuImageUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
        size: z.number().int().positive().max(5 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.restaurantId}/${crypto.randomUUID()}.${EXT_BY_TYPE[data.contentType]}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("menu-images")
      .createSignedUploadUrl(path);
    if (error || !signed) return { ok: false as const, message: "Could not start the upload." };
    return { ok: true as const, path, token: signed.token, imageRef: `storage:${path}` };
  });
