/**
 * P5A-04 — Promotion activation loaders, preview, apply, and list/detail.
 * Apply writes through 0107. Preview is read-only.
 */

import type { PromotionActivation } from "./commercial-engine.ts";
import {
  loadPromotionEligibilityContexts,
} from "./commercial-promotion.server.ts";
import {
  previewPromotionActivation,
  promotionActivationPreviewCanApply,
  type PromotionActivationPreview,
  type PromotionActivationPreviewInput,
  type PromotionMasterPreview,
} from "./commercial-promotion-activation.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

async function loadPropertyScope(db: DbClient, restaurantId: string) {
  const [rooms, plans] = await Promise.all([
    db.from("room_types").select("id").eq("restaurant_id", restaurantId),
    db.from("hotel_rate_plans").select("id").eq("restaurant_id", restaurantId),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);
  return {
    propertyRoomTypeIds: ((rooms.data ?? []) as Array<{ id: string }>).map((row) => row.id),
    propertyRatePlanIds: ((plans.data ?? []) as Array<{ id: string }>).map((row) => row.id),
  };
}

export async function loadPromotionMasterPreview(
  db: DbClient,
  restaurantId: string,
  promotionId: string,
): Promise<PromotionMasterPreview | null> {
  const result = await db
    .from("pms_promotions")
    .select("id, restaurant_id, code, name, promo_kind, promo_value, valid_from, valid_to, active, conditions")
    .eq("restaurant_id", restaurantId)
    .eq("id", promotionId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data;
  if (!row) return null;
  const rooms = await db
    .from("pms_promotion_room_types")
    .select("room_type_id")
    .eq("restaurant_id", restaurantId)
    .eq("promotion_id", promotionId);
  if (rooms.error) throw new Error(rooms.error.message);
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    code: row.code,
    name: row.name,
    promoKind: row.promo_kind,
    promoValue: Number(row.promo_value),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active !== false,
    roomTypeIds: ((rooms.data ?? []) as Array<{ room_type_id: string }>).map((item) => item.room_type_id),
    conditions: typeof row.conditions === "string" && row.conditions.trim() ? row.conditions.trim() : null,
  };
}

async function activationFromContext(
  db: DbClient,
  restaurantId: string,
  activationId?: string,
): Promise<PromotionActivation | null> {
  if (!activationId) return null;
  const contexts = await loadPromotionEligibilityContexts(db, restaurantId, [activationId]);
  return contexts[0]?.activation ?? null;
}

export async function previewStoredPromotionActivation(
  db: DbClient,
  input: PromotionActivationPreviewInput,
): Promise<PromotionActivationPreview> {
  const current = await activationFromContext(db, input.restaurantId, input.activationId);
  const promotionId = input.promotionId ?? current?.promotionId;
  const [master, existingContexts, property] = await Promise.all([
    promotionId ? loadPromotionMasterPreview(db, input.restaurantId, promotionId) : Promise.resolve(null),
    loadPromotionEligibilityContexts(db, input.restaurantId),
    loadPropertyScope(db, input.restaurantId),
  ]);
  return previewPromotionActivation(input, {
    master,
    current,
    existing: existingContexts.map((row) => row.activation).filter((row): row is PromotionActivation => Boolean(row)),
    ...property,
  });
}

export async function applyStoredPromotionActivation(
  db: DbClient,
  input: PromotionActivationPreviewInput,
  membershipId: string,
): Promise<{ operationId: string; activationId: string; actionType: string; expectedVersion: string; preview: PromotionActivationPreview }> {
  const preview = await previewStoredPromotionActivation(db, input);
  if (!promotionActivationPreviewCanApply(preview) || !preview.proposedActivation) {
    throw new Error(preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID");
  }
  const result = await db.rpc("apply_hotel_promotion_activation", {
    _restaurant_id: input.restaurantId,
    _membership_id: membershipId,
    _payload: {
      operation: input.operation,
      activationId: input.activationId ?? null,
      promotionId: preview.proposedActivation.promotionId,
      validFrom: preview.proposedActivation.validFrom,
      validTo: preview.proposedActivation.validTo,
      bookingFrom: preview.proposedActivation.bookingFrom,
      bookingTo: preview.proposedActivation.bookingTo,
      priority: preview.proposedActivation.priority,
      roomTypeIds: preview.proposedActivation.roomTypeIds,
      ratePlanIds: preview.proposedActivation.ratePlanIds,
      reason: preview.proposedActivation.reason,
      expectedVersion: preview.expectedVersion,
    },
  });
  if (result.error) throw new Error(result.error.message);
  const payload = result.data as { operationId: string; activationId: string; actionType: string; expectedVersion: string };
  return { ...payload, preview };
}

export async function listPromotionActivations(
  db: DbClient,
  input: { restaurantId: string },
) {
  const contexts = await loadPromotionEligibilityContexts(db, input.restaurantId);
  return contexts
    .filter((row) => row.activation)
    .map((row) => {
      const activation = row.activation as PromotionActivation;
      return {
        activationId: activation.id,
        promotionId: activation.promotionId,
        code: activation.promotionCode,
        name: activation.promotionName,
        kind: activation.promoKind,
        value: activation.promoValue,
        active: activation.active,
        validFrom: activation.validFrom,
        validTo: activation.validTo,
        bookingFrom: activation.bookingFrom,
        bookingTo: activation.bookingTo,
        priority: activation.priority,
        roomTypeIds: [...activation.scope.roomTypeIds],
        ratePlanIds: [...activation.scope.ratePlanIds],
        createdAt: activation.createdAt,
        updatedAt: activation.updatedAt,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code) || left.validFrom.localeCompare(right.validFrom));
}

export async function getPromotionActivationDetail(
  db: DbClient,
  input: { restaurantId: string; activationId: string },
) {
  const preview = await previewStoredPromotionActivation(db, {
    restaurantId: input.restaurantId,
    operation: "EDIT",
    activationId: input.activationId,
  });
  return {
    master: preview.master,
    activation: preview.currentActivation,
    scope: {
      roomTypeIds: preview.currentActivation?.scope.roomTypeIds ?? [],
      ratePlanIds: preview.currentActivation?.scope.ratePlanIds ?? [],
    },
    overlapWarnings: preview.warnings,
    expectedVersion: preview.expectedVersion,
    eligibility: {
      executable: preview.master ? ["percent", "fixed"].includes(preview.master.promoKind) : false,
      fullStayRequired: true,
      stacking: false,
    },
  };
}
