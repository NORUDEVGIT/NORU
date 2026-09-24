/**
 * Rate & Revenue config adapter — READ ONLY.
 * Reuses Property Setup loaders. Does not write masters or operational rows.
 */

import { propertyToday } from "../reservation-dates";
import { loadCommercialCard3Snapshot } from "../commercial-card3.functions";
import { loadMealsCard3Snapshot } from "../meals-card3.functions";
import { loadCorporateCard3Snapshot } from "../corporate-card3.functions";
import { loadSet6Snapshot } from "../pms-set6-sales-distribution.functions";
import {
  CARD3_COMMERCIAL_UNAVAILABLE,
} from "../commercial-card3.server";
import { CARD3_MEALS_UNAVAILABLE } from "../meals-card3.server";
import { CARD3_CORPORATE_UNAVAILABLE } from "../corporate-card3.server";
import type {
  RevenueBaseConfig,
  RevenueCatalogueConfig,
  RevenueCommercialMasters,
  RevenueCorporateConfig,
  RevenuePackageConfig,
  RevenueRatePlan,
  RevenueRoomType,
} from "./revenue-config.types";

// Card 3 / SET6 loaders already isolate untyped table access.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

function isUnavailableMessage(error: unknown, messages: string[]) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return messages.some((item) => message.includes(item));
}

async function optionalLoad<T>(load: () => Promise<T>, fallback: T, unavailable: string[]): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isUnavailableMessage(error, unavailable)) return fallback;
    throw error;
  }
}

export async function assertOwnedId(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  message: string,
) {
  const result = await db.from(table).select("id").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error(message);
}

/**
 * Trusted-server read. Callers must already have run requireRateManager
 * and must pass supabaseAdmin — authenticated clients cannot SELECT restaurants.
 */
export async function loadRevenueProperty(
  db: DbClient,
  restaurantId: string,
  fallbackName: string,
): Promise<RevenueBaseConfig["property"]> {
  const result = await db
    .from("restaurants")
    .select("id, name, timezone, currency_code, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data as {
    id: string;
    name: string;
    timezone: string;
    currency_code: string;
    business_date: string | null;
  } | null;
  if (!row) throw new Error("Property not found.");
  return {
    propertyId: row.id,
    propertyName: row.name || fallbackName,
    timezone: row.timezone,
    businessDate: row.business_date ?? propertyToday(row.timezone),
    currency: row.currency_code,
  };
}

export async function loadRevenueRoomTypes(
  db: DbClient,
  restaurantId: string,
): Promise<RevenueRoomType[]> {
  const result = await db
    .from("room_types")
    .select("id, code, name, active, sellable")
    .eq("restaurant_id", restaurantId)
    .order("code");
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    active: row.active !== false,
    sellable: row.sellable !== false,
  }));
}

export async function loadRevenueRateCategories(db: DbClient, restaurantId: string) {
  const result = await db
    .from("hotel_rate_categories")
    .select("id, code, name, description, active")
    .eq("restaurant_id", restaurantId)
    .order("code");
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    active: row.active !== false,
  }));
}

const PLAN_SELECT = `
  id, code, name, rate_category_id, room_type_id, currency, base_rate,
  valid_from, valid_to, active,
  hotel_rate_categories!hotel_rate_plans_category_same_property ( name ),
  room_types!hotel_rate_plans_type_same_property ( name )
`;

export async function loadRevenueRatePlans(
  db: DbClient,
  restaurantId: string,
  roomTypeId?: string,
): Promise<RevenueRatePlan[]> {
  if (roomTypeId) {
    await assertOwnedId(
      db,
      "room_types",
      restaurantId,
      roomTypeId,
      "That room type does not belong to this property.",
    );
  }
  let query = db
    .from("hotel_rate_plans")
    .select(PLAN_SELECT)
    .eq("restaurant_id", restaurantId);
  if (roomTypeId) query = query.eq("room_type_id", roomTypeId) as typeof query;
  const result = await query.order("code");
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const category = row.hotel_rate_categories as { name?: string } | null;
    const roomType = row.room_types as { name?: string } | null;
    return {
      id: String(row.id),
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      categoryId: String(row.rate_category_id ?? ""),
      categoryName: category?.name ?? "Category",
      roomTypeId: String(row.room_type_id ?? ""),
      roomTypeName: roomType?.name ?? "Room type",
      currency: String(row.currency ?? ""),
      baseRate: Number(row.base_rate ?? 0),
      validFrom: (row.valid_from as string | null) ?? null,
      validTo: (row.valid_to as string | null) ?? null,
      active: row.active !== false,
    };
  });
}

export async function loadRevenueBaseConfig(
  db: DbClient,
  restaurantId: string,
  fallbackName: string,
): Promise<RevenueBaseConfig> {
  const [property, roomTypes, rateCategories, ratePlans] = await Promise.all([
    loadRevenueProperty(db, restaurantId, fallbackName),
    loadRevenueRoomTypes(db, restaurantId),
    loadRevenueRateCategories(db, restaurantId),
    loadRevenueRatePlans(db, restaurantId),
  ]);
  return { property, roomTypes, rateCategories, ratePlans };
}

export async function loadRevenueCatalogues(
  supabaseAdmin: Parameters<typeof loadSet6Snapshot>[0],
  restaurantId: string,
): Promise<RevenueCatalogueConfig> {
  const snapshot = await loadSet6Snapshot(supabaseAdmin, restaurantId);
  return {
    available:
      snapshot.marketSegmentsAvailable ||
      snapshot.sourceCodesAvailable ||
      snapshot.salesChannelsAvailable,
    marketSegments: snapshot.marketSegments.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
    })),
    bookingSources: snapshot.sourceCodes.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
    })),
    salesChannels: snapshot.salesChannels.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: row.active,
    })),
  };
}

export async function loadRevenueCommercialMasters(
  db: DbClient,
  restaurantId: string,
): Promise<RevenueCommercialMasters> {
  return optionalLoad(
    async () => {
      const snapshot = await loadCommercialCard3Snapshot(db, restaurantId);
      return {
        available: true,
        restrictionMasters: snapshot.restrictions.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          restrictionKind: row.restrictionKind,
          restrictionKindLabel: row.restrictionKindLabel,
          minStayNights: row.minStayNights,
          validFrom: row.validFrom,
          validTo: row.validTo,
          description: row.description,
          active: row.active,
          roomTypeIds: row.roomTypeIds,
        })),
        promotions: snapshot.promotions.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          promoKind: row.promoKind,
          promoKindLabel: row.promoKindLabel,
          promoValue: row.promoValue,
          validFrom: row.validFrom,
          validTo: row.validTo,
          conditions: row.conditions,
          description: row.description,
          active: row.active,
          roomTypeIds: row.roomTypeIds,
        })),
        seasons: snapshot.seasons.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          seasonType: row.seasonType,
          seasonTypeLabel: row.seasonTypeLabel,
          startDate: row.validFrom,
          endDate: row.validTo,
          rateAdjustmentPercent: row.rateAdjustmentPercent,
          active: row.active,
          roomTypeIds: row.roomTypeIds,
        })),
      };
    },
    { available: false, restrictionMasters: [], promotions: [], seasons: [] },
    [CARD3_COMMERCIAL_UNAVAILABLE],
  );
}

export async function loadRevenuePackages(
  db: DbClient,
  restaurantId: string,
): Promise<RevenuePackageConfig> {
  return optionalLoad(
    async () => {
      const snapshot = await loadMealsCard3Snapshot(db, restaurantId);
      return {
        available: true,
        packages: snapshot.packages.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          packagePrice: row.packagePrice,
          typeLabel: row.typeLabel,
          active: row.active,
          roomTypeIds: row.roomTypeIds,
          ratePlanIds: row.ratePlanIds,
        })),
      };
    },
    { available: false, packages: [] },
    [CARD3_MEALS_UNAVAILABLE],
  );
}

export async function loadRevenueCorporateAgreements(
  db: DbClient,
  restaurantId: string,
): Promise<RevenueCorporateConfig> {
  return optionalLoad(
    async () => {
      const snapshot = await loadCorporateCard3Snapshot(db, restaurantId);
      return {
        available: true,
        corporateAgreements: snapshot.agreements.map((row) => ({
          id: row.id,
          companyId: row.companyId,
          companyName: row.companyLabel,
          code: row.code,
          name: row.name,
          active: row.active,
          validFrom: row.validFrom,
          validTo: row.validTo,
          currency: row.currencyCode,
        })),
      };
    },
    { available: false, corporateAgreements: [] },
    [CARD3_CORPORATE_UNAVAILABLE],
  );
}
