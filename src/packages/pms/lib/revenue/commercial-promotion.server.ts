/**
 * P5A-02 — Promotion loaders and quote compose.
 * Reads activations in batch. Calls price_hotel_stay for the room quote.
 * Does not write attribution; persist is the 0105 RPC path.
 */

import type { StayQuote } from "../rates.server";
import { toQuote } from "../rates.server";
import type { PromotionActivation } from "./commercial-engine.ts";
import {
  composeCommercialQuote,
  type AppliedPackageQuoteItem,
  type EligiblePackageListItem,
} from "./commercial-package.ts";
import {
  evaluateStoredSelectedPackages,
  listStoredEligiblePackages,
} from "./commercial-package.server.ts";
import {
  evaluatePromotionEligibility,
  listEligiblePromotionItems,
  type EligiblePromotionListItem,
  type PromotionEligibilityContext,
  type PromotionEligibilityInput,
  type PromotionEligibilityResult,
  type PromotionMasterRecord,
} from "./commercial-promotion.ts";

// Operational tables added in 0104 are not in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ActivationRow = {
  id: string;
  restaurant_id: string;
  promotion_id: string;
  valid_from: string;
  valid_to: string;
  booking_from: string;
  booking_to: string;
  active: boolean;
  priority: number;
  reason: string | null;
  created_by_membership_id: string | null;
  created_at: string;
  updated_at: string;
  promotion_code: string;
  promotion_name: string;
  promo_kind: string;
  promo_value: number | string;
  master_valid_from: string | null;
  master_valid_to: string | null;
  master_room_type_ids: unknown;
};

type MasterRow = {
  id: string;
  restaurant_id: string;
  active: boolean;
};

export type CommercialStayQuote = {
  room: StayQuote;
  baseRoomSubtotal: number;
  promotionDiscount: number;
  roomSubtotalAfterPromotion: number;
  packages: AppliedPackageQuoteItem[];
  packagesSubtotal: number;
  grandCommercialSubtotal: number;
  appliedPromotion: EligiblePromotionListItem | null;
  eligiblePromotions: EligiblePromotionListItem[];
  eligiblePackages: EligiblePackageListItem[];
  commercialWarnings: string[];
  selectedPromotion: PromotionEligibilityResult | null;
};

export type ReservationPromotionAttributionRow = {
  id: string;
  restaurantId: string;
  reservationId: string;
  promotionActivationId: string;
  promotionId: string;
  promotionCode: string;
  promotionName: string;
  promoKind: string;
  promoValue: number;
  baseRoomSubtotal: number;
  discountAmount: number;
  roomSubtotalAfterPromotion: number;
  appliedAt: string;
  snapshot: Record<string, unknown>;
};

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toActivation(
  row: ActivationRow,
  roomTypeIds: string[],
  ratePlanIds: string[],
): PromotionActivation {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    promotionId: row.promotion_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    bookingFrom: row.booking_from,
    bookingTo: row.booking_to,
    active: row.active !== false,
    priority: Number(row.priority ?? 100),
    reason: row.reason,
    createdByMembershipId: row.created_by_membership_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    promotionCode: row.promotion_code,
    promotionName: row.promotion_name,
    promoKind: row.promo_kind as PromotionActivation["promoKind"],
    promoValue: Number(row.promo_value),
    masterValidFrom: row.master_valid_from,
    masterValidTo: row.master_valid_to,
    masterRoomTypeIds: asIdArray(row.master_room_type_ids),
    scope: { roomTypeIds, ratePlanIds },
  };
}

async function loadScopeMaps(db: DbClient, restaurantId: string, activationIds: string[]) {
  const roomTypeIds = new Map<string, string[]>();
  const ratePlanIds = new Map<string, string[]>();
  if (activationIds.length === 0) return { roomTypeIds, ratePlanIds };

  const [rooms, plans] = await Promise.all([
    db
      .from("hotel_promotion_activation_room_types")
      .select("activation_id, room_type_id")
      .eq("restaurant_id", restaurantId)
      .in("activation_id", activationIds),
    db
      .from("hotel_promotion_activation_rate_plans")
      .select("activation_id, rate_plan_id")
      .eq("restaurant_id", restaurantId)
      .in("activation_id", activationIds),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);

  for (const row of rooms.data ?? []) {
    const current = roomTypeIds.get(row.activation_id) ?? [];
    current.push(row.room_type_id);
    roomTypeIds.set(row.activation_id, current);
  }
  for (const row of plans.data ?? []) {
    const current = ratePlanIds.get(row.activation_id) ?? [];
    current.push(row.rate_plan_id);
    ratePlanIds.set(row.activation_id, current);
  }
  return { roomTypeIds, ratePlanIds };
}

async function loadMasters(db: DbClient, restaurantId: string, promotionIds: string[]) {
  const masters = new Map<string, PromotionMasterRecord>();
  if (promotionIds.length === 0) return masters;
  const result = await db
    .from("pms_promotions")
    .select("id, restaurant_id, active")
    .eq("restaurant_id", restaurantId)
    .in("id", promotionIds);
  if (result.error) throw new Error(result.error.message);
  for (const row of (result.data ?? []) as MasterRow[]) {
    masters.set(row.id, {
      id: row.id,
      restaurantId: row.restaurant_id,
      active: row.active !== false,
    });
  }
  return masters;
}

export async function loadPromotionEligibilityContexts(
  db: DbClient,
  restaurantId: string,
  activationIds?: string[],
): Promise<PromotionEligibilityContext[]> {
  let query = db
    .from("hotel_promotion_activations")
    .select(
      "id, restaurant_id, promotion_id, valid_from, valid_to, booking_from, booking_to, active, priority, reason, created_by_membership_id, created_at, updated_at, promotion_code, promotion_name, promo_kind, promo_value, master_valid_from, master_valid_to, master_room_type_ids",
    )
    .eq("restaurant_id", restaurantId);
  if (activationIds && activationIds.length > 0) query = query.in("id", activationIds);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as ActivationRow[];
  const ids = rows.map((row) => row.id);
  const [scopes, masters] = await Promise.all([
    loadScopeMaps(db, restaurantId, ids),
    loadMasters(db, restaurantId, rows.map((row) => row.promotion_id)),
  ]);

  return rows.map((row) => ({
    activation: toActivation(row, scopes.roomTypeIds.get(row.id) ?? [], scopes.ratePlanIds.get(row.id) ?? []),
    master: masters.get(row.promotion_id) ?? null,
  }));
}

export async function evaluateStoredPromotion(
  db: DbClient,
  input: PromotionEligibilityInput,
): Promise<PromotionEligibilityResult> {
  const contexts = await loadPromotionEligibilityContexts(db, input.restaurantId, [input.promotionActivationId]);
  return evaluatePromotionEligibility(input, contexts[0] ?? { activation: null, master: null });
}

export async function listStoredEligiblePromotions(
  db: DbClient,
  input: Omit<PromotionEligibilityInput, "promotionActivationId">,
): Promise<EligiblePromotionListItem[]> {
  const contexts = await loadPromotionEligibilityContexts(db, input.restaurantId);
  return listEligiblePromotionItems(input, contexts);
}

export async function loadPropertyBusinessDate(db: DbClient, restaurantId: string): Promise<string> {
  const result = await db
    .from("restaurants")
    .select("business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const value = result.data?.business_date;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

export async function priceHotelStayRoom(
  db: DbClient,
  input: { restaurantId: string; ratePlanId: string; roomTypeId: string; arrivalDate: string; departureDate: string },
): Promise<StayQuote> {
  const result = await db.rpc("price_hotel_stay", {
    _restaurant_id: input.restaurantId,
    _rate_plan_id: input.ratePlanId,
    _room_type_id: input.roomTypeId,
    _arrival: input.arrivalDate,
    _departure: input.departureDate,
  });
  if (result.error) throw result.error;
  return toQuote(result.data);
}

export async function quoteHotelStayCommercial(
  db: DbClient,
  input: {
    restaurantId: string;
    ratePlanId: string;
    roomTypeId: string;
    arrivalDate: string;
    departureDate: string;
    promotionActivationId?: string | null;
    packageActivationIds?: string[];
    includeEligible?: boolean;
  },
): Promise<CommercialStayQuote> {
  const room = await priceHotelStayRoom(db, input);
  const bookingBusinessDate = await loadPropertyBusinessDate(db, input.restaurantId);
  const listInput = {
    restaurantId: input.restaurantId,
    bookingBusinessDate,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
    baseRoomSubtotal: room.subtotal,
  };
  const packageInput = {
    restaurantId: input.restaurantId,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    roomTypeId: input.roomTypeId,
    ratePlanId: input.ratePlanId,
  };
  const [eligiblePromotions, eligiblePackages] = input.includeEligible === false
    ? [[], []]
    : await Promise.all([
      listStoredEligiblePromotions(db, listInput),
      listStoredEligiblePackages(db, packageInput),
    ]);

  let selected: PromotionEligibilityResult | null = null;
  if (input.promotionActivationId) {
    selected = await evaluateStoredPromotion(db, {
      ...listInput,
      promotionActivationId: input.promotionActivationId,
    });
  }
  const selectedPackages = input.packageActivationIds?.length
    ? await evaluateStoredSelectedPackages(db, packageInput, input.packageActivationIds)
    : { applied: [], warnings: [], failedReason: null };
  if (selectedPackages.failedReason) {
    throw new Error(selectedPackages.failedReason);
  }
  return {
    ...composeCommercialQuote(
      room,
      selected,
      eligiblePromotions,
      selectedPackages.applied,
      eligiblePackages,
      selectedPackages.warnings,
    ),
    selectedPromotion: selected,
  };
}

export async function getReservationPromotionAttribution(
  db: DbClient,
  input: { restaurantId: string; reservationId: string },
): Promise<ReservationPromotionAttributionRow | null> {
  const result = await db
    .from("hotel_reservation_promotions")
    .select(
      "id, restaurant_id, reservation_id, promotion_activation_id, promotion_id, promotion_code, promotion_name, promo_kind, promo_value, base_room_subtotal, discount_amount, room_subtotal_after_promotion, applied_at, snapshot",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data;
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    reservationId: row.reservation_id,
    promotionActivationId: row.promotion_activation_id,
    promotionId: row.promotion_id,
    promotionCode: row.promotion_code,
    promotionName: row.promotion_name,
    promoKind: row.promo_kind,
    promoValue: Number(row.promo_value),
    baseRoomSubtotal: Number(row.base_room_subtotal),
    discountAmount: Number(row.discount_amount),
    roomSubtotalAfterPromotion: Number(row.room_subtotal_after_promotion),
    appliedAt: row.applied_at,
    snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
  };
}
