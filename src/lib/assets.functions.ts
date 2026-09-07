import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership, displayName, getRestaurantSettings } from "@/core/lib/workforce.server";
import { localDateInZone } from "@/core/lib/restaurant-time";
import {
  ASSET_COLUMNS,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ASSET_TYPES,
  canManageAssets,
  canViewAssets,
  diffFields,
  eventForChanges,
  loadAsset,
  warrantyState,
  type AssetCondition,
  type AssetEvent,
  type AssetStatus,
  type AssetType,
  type WarrantyState,
} from "./assets.server";

/**
 * Asset register server functions. The browser can only SELECT these tables
 * (member RLS); every write is authorized here from the caller's own
 * restaurant_users membership and written with the service-role client.
 */

export interface RestaurantAsset {
  id: string;
  assetType: AssetType;
  name: string;
  assetCode: string | null;
  quantity: number;
  condition: AssetCondition;
  status: AssetStatus;
  location: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  serialNumber: string | null;
  warrantyExpiry: string | null;
  warranty: WarrantyState;
  notes: string | null;
  updatedAt: string;
}

export type AssetValueMap = Record<string, string | number | boolean | null>;

export interface AssetHistoryEntry {
  id: string;
  eventType: AssetEvent;
  previousValues: AssetValueMap | null;
  newValues: AssetValueMap | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface AssetPermissions {
  role: string;
  canView: boolean;
  canManage: boolean;
}

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(2, "Enter an asset name.").max(120);
const codeSchema = z.string().trim().max(60).nullable().optional();
const textSchema = z.string().trim().max(200).nullable().optional();
const notesSchema = z.string().trim().max(500).nullable().optional();
const quantitySchema = z.number().finite().min(0).max(1_000_000_000);
const costSchema = z.number().finite().min(0).max(100_000_000).nullable().optional();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .nullable()
  .optional();

async function requireAssetAccess(context: any, restaurantId: string) {
  const me = await callerMembership(context, restaurantId);
  if (!canViewAssets(me.role)) {
    throw new Error("You don't have access to the asset register for this restaurant.");
  }
  return me;
}

function nullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function recordHistory(
  admin: any,
  input: {
    restaurantId: string;
    assetId: string;
    eventType: AssetEvent;
    previous: Record<string, any> | null;
    next: Record<string, any> | null;
    notes: string | null;
    membershipId: string;
  },
) {
  const { error } = await admin.from("restaurant_asset_history").insert({
    restaurant_id: input.restaurantId,
    asset_id: input.assetId,
    event_type: input.eventType,
    previous_values: input.previous,
    new_values: input.next,
    notes: input.notes,
    created_by_staff_membership_id: input.membershipId,
  });
  if (error) console.error("[assetHistory]", error.message);
}

function mapAsset(row: any, today: string): RestaurantAsset {
  return {
    id: row.id,
    assetType: row.asset_type as AssetType,
    name: row.name,
    assetCode: row.asset_code,
    quantity: Number(row.quantity),
    condition: row.condition as AssetCondition,
    status: row.status as AssetStatus,
    location: row.location,
    purchaseDate: row.purchase_date,
    purchaseCost: row.purchase_cost === null ? null : Number(row.purchase_cost),
    serialNumber: row.serial_number,
    warrantyExpiry: row.warranty_expiry,
    warranty: warrantyState(row.warranty_expiry, today),
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export const listRestaurantAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        assetType: z.enum(ASSET_TYPES).optional(),
        includeDisposed: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ permissions: AssetPermissions; assets: RestaurantAsset[]; today: string }> => {
      const me = await requireAssetAccess(context, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const settings = await getRestaurantSettings(supabaseAdmin, data.restaurantId);
      const today = localDateInZone(settings.timezone);

      let query = supabaseAdmin
        .from("restaurant_assets")
        .select(ASSET_COLUMNS)
        .eq("restaurant_id", data.restaurantId)
        .order("name", { ascending: true });
      if (data.assetType) query = query.eq("asset_type", data.assetType);
      if (!data.includeDisposed) query = query.neq("status", "disposed");

      const { data: rows, error } = await query;
      if (error) throw new Error("We couldn't load the asset register right now.");

      return {
        permissions: {
          role: me.role,
          canView: canViewAssets(me.role),
          canManage: canManageAssets(me.role),
        },
        today,
        assets: (rows ?? []).map((r) => mapAsset(r, today)),
      };
    },
  );

export const getAssetOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAssetAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("restaurant_assets")
      .select("asset_type, status")
      .eq("restaurant_id", data.restaurantId);

    let operatingAssets = 0;
    let equipment = 0;
    let underMaintenance = 0;
    let outOfService = 0;
    for (const r of rows ?? []) {
      if (r.status === "disposed") continue;
      if (r.asset_type === "equipment") equipment += 1;
      else operatingAssets += 1;
      if (r.status === "under_maintenance") underMaintenance += 1;
      if (r.status === "out_of_service") outOfService += 1;
    }
    return { operatingAssets, equipment, underMaintenance, outOfService };
  });

export const listAssetHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ restaurantId: idSchema, assetId: idSchema, limit: z.number().int().min(1).max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AssetHistoryEntry[]> => {
    await requireAssetAccess(context, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadAsset(supabaseAdmin, data.restaurantId, data.assetId);

    const { data: rows, error } = await supabaseAdmin
      .from("restaurant_asset_history")
      .select("id, event_type, previous_values, new_values, notes, created_by_staff_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("asset_id", data.assetId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error("We couldn't load the asset history right now.");

    const entries = (rows ?? []) as any[];
    const membershipIds = [...new Set(entries.map((e) => e.created_by_staff_membership_id).filter(Boolean))];
    const byMembership = new Map<string, string | null>();
    if (membershipIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id")
        .in("id", membershipIds as string[]);
      const userIds = (members ?? []).map((m: any) => m.user_id);
      const { data: profiles } = userIds.length
        ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", userIds)
        : { data: [] as any[] };
      const byUser = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
      for (const m of members ?? []) {
        const p = byUser.get((m as any).user_id);
        byMembership.set((m as any).id, displayName(p) ?? p?.email ?? null);
      }
    }

    return entries.map((e) => ({
      id: e.id,
      eventType: e.event_type as AssetEvent,
      previousValues: e.previous_values ?? null,
      newValues: e.new_values ?? null,
      notes: e.notes,
      recordedBy: e.created_by_staff_membership_id
        ? byMembership.get(e.created_by_staff_membership_id) ?? null
        : null,
      createdAt: e.created_at,
    }));
  });

export const createRestaurantAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        assetType: z.enum(ASSET_TYPES),
        name: nameSchema,
        assetCode: codeSchema,
        quantity: quantitySchema.default(0),
        condition: z.enum(ASSET_CONDITIONS),
        status: z.enum(ASSET_STATUSES),
        location: textSchema,
        purchaseDate: dateSchema,
        purchaseCost: costSchema,
        serialNumber: codeSchema,
        warrantyExpiry: dateSchema,
        notes: notesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!canManageAssets(me.role)) {
      return { ok: false as const, message: "Only owners and managers can add assets." };
    }
    if (data.status === "disposed") {
      return { ok: false as const, message: "A new asset cannot start as disposed." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const equipment = data.assetType === "equipment";

    const payload = {
      restaurant_id: data.restaurantId,
      asset_type: data.assetType,
      name: data.name,
      asset_code: nullable(data.assetCode),
      quantity: data.quantity,
      condition: data.condition,
      status: data.status,
      location: nullable(data.location),
      purchase_date: data.purchaseDate ?? null,
      purchase_cost: data.purchaseCost ?? null,
      // Serial + warranty are equipment-only fields.
      serial_number: equipment ? nullable(data.serialNumber) : null,
      warranty_expiry: equipment ? data.warrantyExpiry ?? null : null,
      notes: nullable(data.notes),
      created_by_staff_membership_id: me.id,
    };

    const { data: asset, error } = await supabaseAdmin
      .from("restaurant_assets")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error || !asset) {
      if (error && /duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "An asset with that code already exists." };
      }
      console.error("[createRestaurantAsset]", error?.message);
      return { ok: false as const, message: "We couldn't create that asset. Please try again." };
    }

    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      assetId: asset.id as string,
      eventType: "asset_created",
      previous: null,
      next: payload as unknown as Record<string, any>,
      notes: null,
      membershipId: me.id,
    });

    return { ok: true as const, assetId: asset.id as string };
  });

export const updateRestaurantAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        assetId: idSchema,
        name: nameSchema.optional(),
        assetCode: codeSchema,
        quantity: quantitySchema.optional(),
        condition: z.enum(ASSET_CONDITIONS).optional(),
        status: z.enum(ASSET_STATUSES).optional(),
        location: textSchema,
        purchaseDate: dateSchema,
        purchaseCost: costSchema,
        serialNumber: codeSchema,
        warrantyExpiry: dateSchema,
        notes: notesSchema,
        changeNote: notesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!canManageAssets(me.role)) {
      return { ok: false as const, message: "Only owners and managers can edit assets." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const asset = await loadAsset(supabaseAdmin, data.restaurantId, data.assetId);
    if (asset.status === "disposed") {
      return { ok: false as const, message: "Disposed assets are kept as a permanent record and can't be edited." };
    }

    const patch: Record<string, any> = {};
    if (data.name !== undefined) patch['name'] = data.name;
    if (data.assetCode !== undefined) patch['asset_code'] = nullable(data.assetCode);
    if (data.quantity !== undefined) patch['quantity'] = data.quantity;
    if (data.condition !== undefined) patch['condition'] = data.condition;
    if (data.status !== undefined) patch['status'] = data.status;
    if (data.location !== undefined) patch['location'] = nullable(data.location);
    if (data.purchaseDate !== undefined) patch['purchase_date'] = data.purchaseDate ?? null;
    if (data.purchaseCost !== undefined) patch['purchase_cost'] = data.purchaseCost ?? null;
    if (data.notes !== undefined) patch['notes'] = nullable(data.notes);
    if (asset.asset_type === "equipment") {
      if (data.serialNumber !== undefined) patch['serial_number'] = nullable(data.serialNumber);
      if (data.warrantyExpiry !== undefined) patch['warranty_expiry'] = data.warrantyExpiry ?? null;
    }

    if (patch['status'] === "disposed") {
      return { ok: false as const, message: "Use the dispose action to retire an asset." };
    }

    const { previous, next, changed } = diffFields(asset as unknown as Record<string, any>, patch);
    if (changed.length === 0) return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("restaurant_assets")
      .update(next as never)
      .eq("id", data.assetId)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false as const, message: "An asset with that code already exists." };
      }
      console.error("[updateRestaurantAsset]", error.message);
      return { ok: false as const, message: "We couldn't save that asset. Please try again." };
    }

    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      assetId: data.assetId,
      eventType: eventForChanges(changed),
      previous,
      next,
      notes: nullable(data.changeNote),
      membershipId: me.id,
    });

    return { ok: true as const };
  });

export const disposeRestaurantAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, assetId: idSchema, reason: notesSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context, data.restaurantId);
    if (!canManageAssets(me.role)) {
      return { ok: false as const, message: "Only owners and managers can dispose assets." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const asset = await loadAsset(supabaseAdmin, data.restaurantId, data.assetId);
    if (asset.status === "disposed") return { ok: true as const };

    const { error } = await supabaseAdmin
      .from("restaurant_assets")
      .update({ status: "disposed" } as never)
      .eq("id", data.assetId)
      .eq("restaurant_id", data.restaurantId);
    if (error) {
      console.error("[disposeRestaurantAsset]", error.message);
      return { ok: false as const, message: "We couldn't dispose that asset. Please try again." };
    }

    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      assetId: data.assetId,
      eventType: "disposed",
      previous: { status: asset.status },
      next: { status: "disposed" },
      notes: nullable(data.reason),
      membershipId: me.id,
    });

    return { ok: true as const };
  });
