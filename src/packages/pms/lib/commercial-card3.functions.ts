import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_COMMERCIAL_AUDIT_SECTION,
  CARD3_COMMERCIAL_UNAVAILABLE,
  PROMO_KIND_LABELS,
  PROMO_KINDS,
  RESTRICTION_KIND_LABELS,
  RESTRICTION_KINDS,
  SEASON_TYPE_LABELS,
  SEASON_TYPES,
  evaluateCommercialCard3Readiness,
  type CommercialOverbookingOverlay,
  type CommercialPromotionRow,
  type CommercialRestrictionRow,
  type CommercialRoomTypeRef,
  type CommercialSeasonRow,
  type PromoKind,
  type RestrictionKind,
  type SeasonType,
} from "./commercial-card3.server";

// 0076 is intentionally not represented in generated types.ts until its approved apply.
// Keep the untyped database boundary isolated to this functions module.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_]{1,20}$/.test(value), "Use 1–20 letters, numbers, or underscores.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const descriptionSchema = z.string().trim().max(500).optional();
const roomTypeIdsSchema = z.array(idSchema).default([]);

const restrictionSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    restrictionKind: z.enum(RESTRICTION_KINDS),
    minStayNights: z.number().int().min(1).nullable().optional(),
    validFrom: isoDate,
    validTo: isoDate,
    description: descriptionSchema,
    active: z.boolean(),
    roomTypeIds: roomTypeIdsSchema,
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "Valid to must be on or after valid from.",
    path: ["validTo"],
  })
  .superRefine((data, ctx) => {
    if (data.restrictionKind === "min_stay") {
      if (data.minStayNights == null || data.minStayNights < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["minStayNights"],
          message: "Minimum stay nights must be 1 or more.",
        });
      }
    } else if (data.minStayNights != null) {
      ctx.addIssue({
        code: "custom",
        path: ["minStayNights"],
        message: "Minimum stay nights is only used for min stay restrictions.",
      });
    }
  });

const promotionSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    promoKind: z.enum(PROMO_KINDS),
    promoValue: z.number().min(0).max(10_000_000),
    validFrom: isoDate,
    validTo: isoDate,
    conditions: descriptionSchema,
    description: descriptionSchema,
    active: z.boolean(),
    roomTypeIds: roomTypeIdsSchema,
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "Valid to must be on or after valid from.",
    path: ["validTo"],
  })
  .superRefine((data, ctx) => {
    if (data.promoKind === "percent" && data.promoValue > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["promoValue"],
        message: "Percent promotions cannot exceed 100.",
      });
    }
    if (
      data.promoKind === "free_night" &&
      (data.promoValue < 1 || !Number.isInteger(data.promoValue))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["promoValue"],
        message: "Free-night promotions must be a whole number of nights of 1 or more.",
      });
    }
  });

const seasonSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(120),
    seasonType: z.enum(SEASON_TYPES),
    validFrom: isoDate,
    validTo: isoDate,
    rateAdjustmentPercent: z.number().min(-100).max(100).nullable().optional(),
    description: descriptionSchema,
    active: z.boolean(),
    roomTypeIds: roomTypeIdsSchema,
  })
  .refine((data) => data.validTo >= data.validFrom, {
    message: "Valid to must be on or after valid from.",
    path: ["validTo"],
  });

function unavailable(error: { code?: string; message?: string } | null): never {
  if (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204"
  ) {
    throw new Error(CARD3_COMMERCIAL_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_COMMERCIAL_UNAVAILABLE);
}

function isMissingSchema(error: { code?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST205" ||
    error?.code === "PGRST204"
  );
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asRestrictionKind(value: unknown): RestrictionKind {
  return (RESTRICTION_KINDS as readonly string[]).includes(String(value))
    ? (value as RestrictionKind)
    : "min_stay";
}

function asPromoKind(value: unknown): PromoKind {
  return (PROMO_KINDS as readonly string[]).includes(String(value))
    ? (value as PromoKind)
    : "percent";
}

function asSeasonType(value: unknown): SeasonType {
  return (SEASON_TYPES as readonly string[]).includes(String(value))
    ? (value as SeasonType)
    : "custom";
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: CARD3_COMMERCIAL_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-commercial] audit", result.error.message);
}

function mapRoomType(row: any): CommercialRoomTypeRef {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
  };
}

function groupRoomTypeIds(
  rows: Array<{ parent_id?: string; restriction_id?: string; promotion_id?: string; season_id?: string; room_type_id?: string }>,
  parentKey: "restriction_id" | "promotion_id" | "season_id",
) {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = String(row[parentKey] ?? "");
    const roomTypeId = String(row.room_type_id ?? "");
    if (!parentId || !roomTypeId) continue;
    const current = map.get(parentId) ?? [];
    current.push(roomTypeId);
    map.set(parentId, current);
  }
  return map;
}

async function loadOverbooking(
  db: DbClient,
  restaurantId: string,
): Promise<CommercialOverbookingOverlay | null> {
  const result = await db
    .from("pms_inventory_rules")
    .select(
      "overbooking_allowed, maximum_overbooking, percentage_limit, room_type_limit_enabled, date_based_limit_enabled, manager_approval_required, override_permission_required, overbooking_reason_required, overbooking_alert_enabled",
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (isMissingSchema(result.error)) return null;
  if (result.error) unavailable(result.error);
  if (!result.data) return null;
  const row = result.data;
  return {
    overbookingAllowed: Boolean(row.overbooking_allowed),
    maximumOverbooking:
      row.maximum_overbooking == null ? null : Number(row.maximum_overbooking),
    percentageLimit: row.percentage_limit == null ? null : Number(row.percentage_limit),
    roomTypeLimitEnabled: Boolean(row.room_type_limit_enabled),
    dateBasedLimitEnabled: Boolean(row.date_based_limit_enabled),
    managerApprovalRequired: Boolean(row.manager_approval_required),
    overridePermissionRequired: Boolean(row.override_permission_required),
    overbookingReasonRequired: Boolean(row.overbooking_reason_required),
    overbookingAlertEnabled: Boolean(row.overbooking_alert_enabled),
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string) {
  const [roomTypes, restrictions, promotions, seasons, restrictionMaps, promoMaps, seasonMaps, overbooking] =
    await Promise.all([
      db
        .from("room_types")
        .select("id, code, name, active")
        .eq("restaurant_id", restaurantId)
        .order("code"),
      db
        .from("pms_commercial_restrictions")
        .select(
          "id, code, name, restriction_kind, min_stay_nights, valid_from, valid_to, description, active",
        )
        .eq("restaurant_id", restaurantId)
        .order("code"),
      db
        .from("pms_promotions")
        .select(
          "id, code, name, promo_kind, promo_value, valid_from, valid_to, conditions, description, active",
        )
        .eq("restaurant_id", restaurantId)
        .order("code"),
      db
        .from("pms_seasons")
        .select(
          "id, code, name, season_type, valid_from, valid_to, rate_adjustment_percent, description, active",
        )
        .eq("restaurant_id", restaurantId)
        .order("code"),
      db
        .from("pms_commercial_restriction_room_types")
        .select("restriction_id, room_type_id")
        .eq("restaurant_id", restaurantId),
      db
        .from("pms_promotion_room_types")
        .select("promotion_id, room_type_id")
        .eq("restaurant_id", restaurantId),
      db
        .from("pms_season_room_types")
        .select("season_id, room_type_id")
        .eq("restaurant_id", restaurantId),
      loadOverbooking(db, restaurantId),
    ]);
  if (roomTypes.error) unavailable(roomTypes.error);
  if (restrictions.error) unavailable(restrictions.error);
  if (promotions.error) unavailable(promotions.error);
  if (seasons.error) unavailable(seasons.error);
  if (restrictionMaps.error) unavailable(restrictionMaps.error);
  if (promoMaps.error) unavailable(promoMaps.error);
  if (seasonMaps.error) unavailable(seasonMaps.error);

  const roomTypeRows = (roomTypes.data ?? []).map(mapRoomType);
  const restrictionRooms = groupRoomTypeIds(restrictionMaps.data ?? [], "restriction_id");
  const promoRooms = groupRoomTypeIds(promoMaps.data ?? [], "promotion_id");
  const seasonRooms = groupRoomTypeIds(seasonMaps.data ?? [], "season_id");

  const restrictionRows: CommercialRestrictionRow[] = (restrictions.data ?? []).map((row: any) => {
    const restrictionKind = asRestrictionKind(row.restriction_kind);
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      restrictionKind,
      restrictionKindLabel: RESTRICTION_KIND_LABELS[restrictionKind],
      minStayNights: row.min_stay_nights == null ? null : Number(row.min_stay_nights),
      validFrom: String(row.valid_from ?? ""),
      validTo: String(row.valid_to ?? ""),
      description: String(row.description ?? ""),
      active: row.active !== false,
      roomTypeIds: restrictionRooms.get(String(row.id)) ?? [],
    };
  });

  const promotionRows: CommercialPromotionRow[] = (promotions.data ?? []).map((row: any) => {
    const promoKind = asPromoKind(row.promo_kind);
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      promoKind,
      promoKindLabel: PROMO_KIND_LABELS[promoKind],
      promoValue: Number(row.promo_value ?? 0),
      validFrom: String(row.valid_from ?? ""),
      validTo: String(row.valid_to ?? ""),
      conditions: String(row.conditions ?? ""),
      description: String(row.description ?? ""),
      active: row.active !== false,
      roomTypeIds: promoRooms.get(String(row.id)) ?? [],
    };
  });

  const seasonRows: CommercialSeasonRow[] = (seasons.data ?? []).map((row: any) => {
    const seasonType = asSeasonType(row.season_type);
    return {
      id: row.id,
      code: String(row.code ?? "").toUpperCase(),
      name: String(row.name ?? ""),
      seasonType,
      seasonTypeLabel: SEASON_TYPE_LABELS[seasonType],
      validFrom: String(row.valid_from ?? ""),
      validTo: String(row.valid_to ?? ""),
      rateAdjustmentPercent:
        row.rate_adjustment_percent == null ? null : Number(row.rate_adjustment_percent),
      description: String(row.description ?? ""),
      active: row.active !== false,
      roomTypeIds: seasonRooms.get(String(row.id)) ?? [],
    };
  });

  return {
    roomTypes: roomTypeRows,
    restrictions: restrictionRows,
    promotions: promotionRows,
    seasons: seasonRows,
    overbooking,
  };
}

export { loadSnapshot as loadCommercialCard3Snapshot };

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_COMMERCIAL_AUDIT_SECTION })
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) return [];
  return (result.data ?? []).map((row: any) => ({
    id: row.id,
    action: String(row.action ?? ""),
    createdAt: String(row.created_at ?? ""),
    detail: typeof row.metadata?.detail === "string" ? row.metadata.detail : null,
  }));
}

async function requireOwnedIds(
  db: DbClient,
  table: string,
  restaurantId: string,
  ids: string[],
  message: string,
) {
  if (ids.length === 0) return;
  const result = await db.from(table).select("id").eq("restaurant_id", restaurantId).in("id", ids);
  if (result.error) unavailable(result.error);
  if ((result.data ?? []).length !== ids.length) throw new Error(message);
}

async function requireOwnedRecord(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  message: string,
) {
  const result = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error(message);
}

async function replaceRoomTypeMappings(
  db: DbClient,
  restaurantId: string,
  table: string,
  parentColumn: string,
  parentId: string,
  roomTypeIds: string[],
) {
  const removed = await db
    .from(table)
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq(parentColumn, parentId);
  if (removed.error) unavailable(removed.error);
  if (roomTypeIds.length === 0) return;
  const inserted = await db.from(table).insert(
    roomTypeIds.map((roomTypeId) => ({
      restaurant_id: restaurantId,
      [parentColumn]: parentId,
      room_type_id: roomTypeId,
    })),
  );
  if (inserted.error) unavailable(inserted.error);
}

export const getCommercialCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCommercialCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveCommercialRestrictionCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => restrictionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireOwnedIds(
      db,
      "room_types",
      data.restaurantId,
      data.roomTypeIds,
      "Restrictions must use Card 2 room types for this property.",
    );
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_commercial_restrictions",
        data.restaurantId,
        data.id,
        "That restriction doesn't belong to this property.",
      );
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      restriction_kind: data.restrictionKind,
      min_stay_nights: data.restrictionKind === "min_stay" ? data.minStayNights : null,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      description: data.description?.trim() ? data.description.trim() : null,
      active: data.active,
    };
    let restrictionId = data.id;
    if (data.id) {
      const updated = await db
        .from("pms_commercial_restrictions")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) {
        if (updated.error.code === "23505") throw new Error("That restriction code is already used.");
        unavailable(updated.error);
      }
    } else {
      const inserted = await db
        .from("pms_commercial_restrictions")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (inserted.error.code === "23505") throw new Error("That restriction code is already used.");
        unavailable(inserted.error);
      }
      restrictionId = inserted.data?.id;
    }
    if (!restrictionId) throw new Error("Restriction could not be saved.");
    await replaceRoomTypeMappings(
      db,
      data.restaurantId,
      "pms_commercial_restriction_room_types",
      "restriction_id",
      restrictionId,
      data.roomTypeIds,
    );
    await writeAudit(db, data.restaurantId, context.userId, "card3_commercial_restriction_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCommercialCard3Readiness(snapshot) };
  });

export const saveCommercialPromotionCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => promotionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireOwnedIds(
      db,
      "room_types",
      data.restaurantId,
      data.roomTypeIds,
      "Promotions must use Card 2 room types for this property.",
    );
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_promotions",
        data.restaurantId,
        data.id,
        "That promotion doesn't belong to this property.",
      );
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      promo_kind: data.promoKind,
      promo_value: data.promoValue,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      conditions: data.conditions?.trim() ? data.conditions.trim() : null,
      description: data.description?.trim() ? data.description.trim() : null,
      active: data.active,
    };
    let promotionId = data.id;
    if (data.id) {
      const updated = await db
        .from("pms_promotions")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) {
        if (updated.error.code === "23505") throw new Error("That promotion code is already used.");
        unavailable(updated.error);
      }
    } else {
      const inserted = await db.from("pms_promotions").insert(payload).select("id").maybeSingle();
      if (inserted.error) {
        if (inserted.error.code === "23505") throw new Error("That promotion code is already used.");
        unavailable(inserted.error);
      }
      promotionId = inserted.data?.id;
    }
    if (!promotionId) throw new Error("Promotion could not be saved.");
    await replaceRoomTypeMappings(
      db,
      data.restaurantId,
      "pms_promotion_room_types",
      "promotion_id",
      promotionId,
      data.roomTypeIds,
    );
    await writeAudit(db, data.restaurantId, context.userId, "card3_promotion_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCommercialCard3Readiness(snapshot) };
  });

export const saveCommercialSeasonCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => seasonSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    await requireOwnedIds(
      db,
      "room_types",
      data.restaurantId,
      data.roomTypeIds,
      "Seasons must use Card 2 room types for this property.",
    );
    if (data.id) {
      await requireOwnedRecord(
        db,
        "pms_seasons",
        data.restaurantId,
        data.id,
        "That season doesn't belong to this property.",
      );
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      season_type: data.seasonType,
      valid_from: data.validFrom,
      valid_to: data.validTo,
      rate_adjustment_percent: data.rateAdjustmentPercent ?? null,
      description: data.description?.trim() ? data.description.trim() : null,
      active: data.active,
    };
    let seasonId = data.id;
    if (data.id) {
      const updated = await db
        .from("pms_seasons")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) {
        if (updated.error.code === "23505") throw new Error("That season code is already used.");
        unavailable(updated.error);
      }
    } else {
      const inserted = await db.from("pms_seasons").insert(payload).select("id").maybeSingle();
      if (inserted.error) {
        if (inserted.error.code === "23505") throw new Error("That season code is already used.");
        unavailable(inserted.error);
      }
      seasonId = inserted.data?.id;
    }
    if (!seasonId) throw new Error("Season could not be saved.");
    await replaceRoomTypeMappings(
      db,
      data.restaurantId,
      "pms_season_room_types",
      "season_id",
      seasonId,
      data.roomTypeIds,
    );
    await writeAudit(db, data.restaurantId, context.userId, "card3_season_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateCommercialCard3Readiness(snapshot) };
  });
