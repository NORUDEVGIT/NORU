/**
 * P5A-04 — Package activation loaders, preview, apply, and list/detail.
 * Apply writes through 0107. Preview is read-only.
 */

import type { PackageActivation, PackageComponentSnapshot } from "./commercial-engine.ts";
import { loadPackageEligibilityContexts } from "./commercial-package.server.ts";
import {
  packageActivationPreviewCanApply,
  previewPackageActivation,
  type PackageActivationPreview,
  type PackageActivationPreviewInput,
  type PackageMasterPreview,
} from "./commercial-package-activation.ts";

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

export async function loadPackageMasterPreview(
  db: DbClient,
  restaurantId: string,
  packageId: string,
): Promise<PackageMasterPreview | null> {
  const result = await db
    .from("pms_packages")
    .select("id, restaurant_id, code, name, type, package_price, active")
    .eq("restaurant_id", restaurantId)
    .eq("id", packageId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const row = result.data;
  if (!row) return null;
  const [rooms, plans, components] = await Promise.all([
    db.from("pms_package_room_types").select("room_type_id").eq("restaurant_id", restaurantId).eq("package_id", packageId),
    db.from("pms_package_rate_plans").select("rate_plan_id").eq("restaurant_id", restaurantId).eq("package_id", packageId),
    db.from("pms_package_components")
      .select("component_kind, meal_plan_id, room_amenity_id, fo_service_id, quantity, pms_meal_plans(name), room_amenities(name)")
      .eq("restaurant_id", restaurantId)
      .eq("package_id", packageId)
      .order("sort_order"),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);
  if (components.error) throw new Error(components.error.message);
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    code: row.code,
    name: row.name,
    type: row.type,
    packagePrice: Number(row.package_price),
    active: row.active !== false,
    roomTypeIds: ((rooms.data ?? []) as Array<{ room_type_id: string }>).map((item) => item.room_type_id),
    ratePlanIds: ((plans.data ?? []) as Array<{ rate_plan_id: string }>).map((item) => item.rate_plan_id),
    components: ((components.data ?? []) as Array<Record<string, unknown>>).map((item) => {
      const meal = item.pms_meal_plans as { name?: string } | null;
      const amenity = item.room_amenities as { name?: string } | null;
      const snapshot: PackageComponentSnapshot = {
        componentType: String(item.component_kind ?? ""),
        componentId: String(item.meal_plan_id ?? item.room_amenity_id ?? item.fo_service_id ?? ""),
        label: meal?.name ?? amenity?.name ?? String(item.component_kind ?? ""),
        quantity: Number(item.quantity ?? 1),
      };
      return snapshot;
    }),
  };
}

async function activationFromContext(
  db: DbClient,
  restaurantId: string,
  activationId?: string,
): Promise<PackageActivation | null> {
  if (!activationId) return null;
  const contexts = await loadPackageEligibilityContexts(db, restaurantId, [activationId]);
  return contexts[0]?.activation ?? null;
}

export async function previewStoredPackageActivation(
  db: DbClient,
  input: PackageActivationPreviewInput,
): Promise<PackageActivationPreview> {
  const current = await activationFromContext(db, input.restaurantId, input.activationId);
  const packageId = input.packageId ?? current?.packageId;
  const [master, existingContexts, property] = await Promise.all([
    packageId ? loadPackageMasterPreview(db, input.restaurantId, packageId) : Promise.resolve(null),
    loadPackageEligibilityContexts(db, input.restaurantId),
    loadPropertyScope(db, input.restaurantId),
  ]);
  return previewPackageActivation(input, {
    master,
    current,
    existing: existingContexts.map((row) => row.activation).filter((row): row is PackageActivation => Boolean(row)),
    ...property,
  });
}

export async function applyStoredPackageActivation(
  db: DbClient,
  input: PackageActivationPreviewInput,
  membershipId: string,
): Promise<{ operationId: string; activationId: string; actionType: string; expectedVersion: string; preview: PackageActivationPreview }> {
  const preview = await previewStoredPackageActivation(db, input);
  if (!packageActivationPreviewCanApply(preview) || !preview.proposedActivation) {
    throw new Error(preview.errors[0] ?? "COMMERCIAL_OPERATION_INVALID");
  }
  const result = await db.rpc("apply_hotel_package_activation", {
    _restaurant_id: input.restaurantId,
    _membership_id: membershipId,
    _payload: {
      operation: input.operation,
      activationId: input.activationId ?? null,
      packageId: preview.proposedActivation.packageId,
      validFrom: preview.proposedActivation.validFrom,
      validTo: preview.proposedActivation.validTo,
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

export async function listPackageActivations(
  db: DbClient,
  input: { restaurantId: string },
) {
  const contexts = await loadPackageEligibilityContexts(db, input.restaurantId);
  return contexts
    .filter((row) => row.activation)
    .map((row) => {
      const activation = row.activation as PackageActivation;
      return {
        activationId: activation.id,
        packageId: activation.packageId,
        code: activation.packageCode,
        name: activation.packageName,
        type: activation.packageType,
        chargeBasis: activation.chargeBasis,
        configuredPrice: activation.packagePrice,
        active: activation.active,
        validFrom: activation.validFrom,
        validTo: activation.validTo,
        roomTypeIds: [...activation.scope.roomTypeIds],
        ratePlanIds: [...activation.scope.ratePlanIds],
        createdAt: activation.createdAt,
        updatedAt: activation.updatedAt,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code) || left.validFrom.localeCompare(right.validFrom));
}

export async function getPackageActivationDetail(
  db: DbClient,
  input: { restaurantId: string; activationId: string },
) {
  const preview = await previewStoredPackageActivation(db, {
    restaurantId: input.restaurantId,
    operation: "EDIT",
    activationId: input.activationId,
  });
  return {
    master: preview.master,
    activation: preview.currentActivation,
    components: preview.currentActivation?.components ?? [],
    scope: {
      roomTypeIds: preview.currentActivation?.scope.roomTypeIds ?? [],
      ratePlanIds: preview.currentActivation?.scope.ratePlanIds ?? [],
    },
    expectedVersion: preview.expectedVersion,
  };
}
