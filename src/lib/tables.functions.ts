import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Roles allowed to create/edit tables. Kitchen and waiter are read-only. */
const MANAGE_ROLES = ["owner", "manager"];
/** Roles allowed to see the table list (and therefore the QR tokens). */
const READ_ROLES = ["owner", "manager", "kitchen", "waiter"];

const idSchema = z.string().uuid();
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/i);
/** Opaque capability token: hex only, fixed generation length. */
const tokenSchema = z
  .string()
  .trim()
  .min(20)
  .max(128)
  .regex(/^[a-f0-9]+$/i);
const tableNumberSchema = z.string().trim().min(1).max(20);

export interface ManagedTable {
  id: string;
  tableNumber: string;
  name: string | null;
  qrToken: string;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ResolvedTable {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  tableId: string;
  tableNumber: string;
  tableName: string | null;
}

/** Cryptographically strong, opaque, unguessable QR token. */
function newQrToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Membership is always derived from restaurant_users, never from the browser. */
async function assertRole(
  supabase: { from: (t: string) => any },
  userId: string,
  restaurantId: string,
  allowed: string[],
) {
  const { data } = await supabase
    .from("restaurant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (!role || !allowed.includes(role)) {
    throw new Error("You don't have permission to manage tables for this restaurant.");
  }
  return role;
}

export const listRestaurantTables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<{ role: string; tables: ManagedTable[] }> => {
    const role = await assertRole(context.supabase, context.userId, data.restaurantId, READ_ROLES);
    const { data: rows, error } = await context.supabase
      .from("restaurant_tables")
      .select("id, table_number, name, qr_token, active, created_at, updated_at")
      .eq("restaurant_id", data.restaurantId);

    if (error) throw new Error("We couldn't load your tables right now.");

    const tables = (rows ?? [])
      .map((r) => ({
        id: r.id,
        tableNumber: r.table_number,
        name: r.name,
        qrToken: r.qr_token,
        active: r.active,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? null,
      }))
      .sort((a, b) =>
        a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: "base" }),
      );

    return { role, tables };
  });

export const saveRestaurantTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema.optional(),
        tableNumber: tableNumberSchema,
        name: z.string().trim().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId, data.restaurantId, MANAGE_ROLES);

    // Duplicate check is case-insensitive and scoped to this restaurant only.
    const { data: clash } = await context.supabase
      .from("restaurant_tables")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .ilike("table_number", data.tableNumber)
      .maybeSingle();
    if (clash && clash.id !== data.id) {
      return { ok: false as const, message: "You already have a table with that number." };
    }

    const payload = {
      // restaurant_id always comes from the authorized context above.
      restaurant_id: data.restaurantId,
      table_number: data.tableNumber,
      name: data.name?.trim() || null,
    };

    const { error } = data.id
      ? await context.supabase
          .from("restaurant_tables")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await context.supabase
          .from("restaurant_tables")
          .insert({ ...payload, qr_token: newQrToken(), active: true });

    if (error) {
      if (error.code === "23505") {
        return { ok: false as const, message: "You already have a table with that number." };
      }
      return { ok: false as const, message: "Could not save the table." };
    }
    return { ok: true as const };
  });

export const setTableActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId, data.restaurantId, MANAGE_ROLES);
    const { error } = await context.supabase
      .from("restaurant_tables")
      .update({ active: data.active })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not update the table." };
    return { ok: true as const };
  });

/**
 * Rotates a leaked/copied QR code. The previous token stops resolving
 * immediately; printed codes must be replaced.
 */
export const regenerateTableToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId, data.restaurantId, MANAGE_ROLES);
    const { error } = await context.supabase
      .from("restaurant_tables")
      .update({ qr_token: newQrToken() })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not regenerate the QR code." };
    return { ok: true as const };
  });

/**
 * Deletion is only allowed when no order references the table; otherwise the
 * caller is told to deactivate so historical orders stay intact.
 */
export const deleteRestaurantTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, id: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, context.userId, data.restaurantId, MANAGE_ROLES);
    const { count } = await context.supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("restaurant_table_id", data.id);
    if ((count ?? 0) > 0) {
      return {
        ok: false as const,
        message: "This table has historical orders. Deactivate it instead of deleting it.",
      };
    }
    const { error } = await context.supabase
      .from("restaurant_tables")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (error) return { ok: false as const, message: "Could not delete the table." };
    return { ok: true as const };
  });

/**
 * Public QR resolution for /r/:restaurantSlug/t/:qrToken.
 *
 * The token is a capability: a customer holding one physical code resolves
 * exactly that table. The restaurant is re-resolved from the slug and the
 * table's own restaurant_id must match it, so a token from restaurant A can
 * never resolve under restaurant B's slug. Approval/active gating still
 * applies, and nothing beyond the table's display fields is returned.
 */
export const resolveRestaurantTable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ restaurantSlug: slugSchema, qrToken: tokenSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; table: ResolvedTable } | { ok: false }> => {
    // restaurant_tables has no public SELECT policy by design, so this trusted
    // lookup uses the privileged client behind strict server-side validation.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("id, name, slug, approved, active")
      .eq("slug", data.restaurantSlug.toLowerCase())
      .maybeSingle();
    if (!restaurant || !restaurant.approved || !restaurant.active) return { ok: false };

    const { data: table } = await supabaseAdmin
      .from("restaurant_tables")
      .select("id, table_number, name, active, restaurant_id")
      .eq("qr_token", data.qrToken)
      .maybeSingle();

    // Same generic failure for unknown, foreign and inactive tables.
    if (!table || table.restaurant_id !== restaurant.id || !table.active) return { ok: false };

    return {
      ok: true,
      table: {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        tableId: table.id,
        tableNumber: table.table_number,
        tableName: table.name,
      },
    };
  });

/**
 * Fallback for a damaged QR code: a typed table number is resolved against the
 * restaurant's real, active table records. Once a restaurant has configured
 * tables, an unknown number is rejected rather than accepted as free text.
 */
export const resolveManualTable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ restaurantSlug: slugSchema, tableNumber: tableNumberSchema }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      | { ok: true; tableId: string | null; tableNumber: string }
      | { ok: false; message: string }
    > => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: restaurant } = await supabaseAdmin
        .from("restaurants")
        .select("id, approved, active")
        .eq("slug", data.restaurantSlug.toLowerCase())
        .maybeSingle();
      if (!restaurant || !restaurant.approved || !restaurant.active) {
        return { ok: false, message: "This restaurant isn't accepting orders right now." };
      }

      const { data: table } = await supabaseAdmin
        .from("restaurant_tables")
        .select("id, table_number")
        .eq("restaurant_id", restaurant.id)
        .eq("active", true)
        .ilike("table_number", data.tableNumber)
        .maybeSingle();

      if (table) return { ok: true, tableId: table.id, tableNumber: table.table_number };

      // Restaurants that have not configured tables yet keep the legacy
      // free-text behaviour so ordering never breaks for them.
      const { count } = await supabaseAdmin
        .from("restaurant_tables")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id)
        .eq("active", true);
      if ((count ?? 0) === 0) return { ok: true, tableId: null, tableNumber: data.tableNumber };

      return { ok: false, message: "Table not found. Please check your table number." };
    },
  );
