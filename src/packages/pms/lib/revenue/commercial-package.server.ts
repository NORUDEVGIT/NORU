/**
 * P5A-03 — Package loaders and reservation commercial attribution reads.
 * Batch-loads activations. Persist is the 0106 RPC path.
 */

import type { PackageActivation, PackageComponentSnapshot } from "./commercial-engine.ts";
import {
  evaluatePackageEligibility,
  evaluateSelectedPackages,
  listEligiblePackageItems,
  type AppliedPackageQuoteItem,
  type EligiblePackageListItem,
  type PackageEligibilityContext,
  type PackageEligibilityInput,
  type PackageEligibilityResult,
  type PackageMasterRecord,
} from "./commercial-package.ts";
import type { ReservationPromotionAttributionRow } from "./commercial-promotion.server.ts";

// Operational tables added in 0104 are not in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

type ActivationRow = {
  id: string;
  restaurant_id: string;
  package_id: string;
  valid_from: string;
  valid_to: string;
  active: boolean;
  reason: string | null;
  created_by_membership_id: string | null;
  created_at: string;
  updated_at: string;
  package_code: string;
  package_name: string;
  package_type: string | null;
  package_price: number | string;
  charge_basis: string;
  components_snapshot: unknown;
  master_room_type_ids: unknown;
  master_rate_plan_ids: unknown;
};

type MasterRow = {
  id: string;
  restaurant_id: string;
  active: boolean;
};

export type ReservationPackageAttributionRow = {
  id: string;
  restaurantId: string;
  reservationId: string;
  packageActivationId: string;
  packageId: string;
  packageCode: string;
  packageName: string;
  chargeBasis: string;
  quantity: number;
  unitAmount: number;
  appliedAmount: number;
  components: PackageComponentSnapshot[];
  appliedAt: string;
  snapshot: Record<string, unknown>;
};

export type ReservationCommercialAttribution = {
  promotion: ReservationPromotionAttributionRow | null;
  packages: ReservationPackageAttributionRow[];
  promotionDiscount: number;
  packagesSubtotal: number;
  roomSubtotalAfterPromotion: number | null;
  grandCommercialSubtotal: number | null;
};

function asIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function asComponents(value: unknown): PackageComponentSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      componentType: String(item.componentType ?? item.component_kind ?? ""),
      componentId: item.componentId == null && item.component_id == null ? null : String(item.componentId ?? item.component_id),
      label: String(item.label ?? ""),
      quantity: Number(item.quantity ?? 1),
    };
  });
}

function toActivation(
  row: ActivationRow,
  roomTypeIds: string[],
  ratePlanIds: string[],
): PackageActivation {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    packageId: row.package_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active !== false,
    reason: row.reason,
    createdByMembershipId: row.created_by_membership_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    packageCode: row.package_code,
    packageName: row.package_name,
    packageType: row.package_type,
    packagePrice: Number(row.package_price),
    chargeBasis: row.charge_basis as PackageActivation["chargeBasis"],
    components: asComponents(row.components_snapshot),
    masterRoomTypeIds: asIdArray(row.master_room_type_ids),
    masterRatePlanIds: asIdArray(row.master_rate_plan_ids),
    scope: { roomTypeIds, ratePlanIds },
  };
}

async function loadScopeMaps(db: DbClient, restaurantId: string, activationIds: string[]) {
  const roomTypeIds = new Map<string, string[]>();
  const ratePlanIds = new Map<string, string[]>();
  if (activationIds.length === 0) return { roomTypeIds, ratePlanIds };

  const [rooms, plans] = await Promise.all([
    db
      .from("hotel_package_activation_room_types")
      .select("activation_id, room_type_id")
      .eq("restaurant_id", restaurantId)
      .in("activation_id", activationIds),
    db
      .from("hotel_package_activation_rate_plans")
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

async function loadMasters(db: DbClient, restaurantId: string, packageIds: string[]) {
  const masters = new Map<string, PackageMasterRecord>();
  if (packageIds.length === 0) return masters;
  const result = await db
    .from("pms_packages")
    .select("id, restaurant_id, active")
    .eq("restaurant_id", restaurantId)
    .in("id", packageIds);
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

export async function loadPackageEligibilityContexts(
  db: DbClient,
  restaurantId: string,
  activationIds?: string[],
): Promise<PackageEligibilityContext[]> {
  let query = db
    .from("hotel_package_activations")
    .select(
      "id, restaurant_id, package_id, valid_from, valid_to, active, reason, created_by_membership_id, created_at, updated_at, package_code, package_name, package_type, package_price, charge_basis, components_snapshot, master_room_type_ids, master_rate_plan_ids",
    )
    .eq("restaurant_id", restaurantId);
  if (activationIds && activationIds.length > 0) query = query.in("id", activationIds);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as ActivationRow[];
  const ids = rows.map((row) => row.id);
  const [scopes, masters] = await Promise.all([
    loadScopeMaps(db, restaurantId, ids),
    loadMasters(db, restaurantId, rows.map((row) => row.package_id)),
  ]);
  return rows.map((row) => ({
    activation: toActivation(row, scopes.roomTypeIds.get(row.id) ?? [], scopes.ratePlanIds.get(row.id) ?? []),
    master: masters.get(row.package_id) ?? null,
  }));
}

export async function evaluateStoredPackage(
  db: DbClient,
  input: PackageEligibilityInput,
): Promise<PackageEligibilityResult> {
  const contexts = await loadPackageEligibilityContexts(db, input.restaurantId, [input.packageActivationId]);
  return evaluatePackageEligibility(input, contexts[0] ?? { activation: null, master: null });
}

export async function listStoredEligiblePackages(
  db: DbClient,
  input: Omit<PackageEligibilityInput, "packageActivationId">,
): Promise<EligiblePackageListItem[]> {
  const contexts = await loadPackageEligibilityContexts(db, input.restaurantId);
  return listEligiblePackageItems(input, contexts);
}

export async function evaluateStoredSelectedPackages(
  db: DbClient,
  input: Omit<PackageEligibilityInput, "packageActivationId">,
  selectedIds: string[],
): Promise<{
  applied: AppliedPackageQuoteItem[];
  warnings: string[];
  failedReason: string | null;
}> {
  const contexts = await loadPackageEligibilityContexts(db, input.restaurantId, selectedIds);
  const evaluated = evaluateSelectedPackages(input, selectedIds, contexts);
  if (!evaluated.ok) {
    return { applied: [], warnings: [evaluated.reasonCode], failedReason: evaluated.reasonCode };
  }
  return { applied: evaluated.applied, warnings: [], failedReason: null };
}

export async function getReservationPackageAttributions(
  db: DbClient,
  input: { restaurantId: string; reservationId: string },
): Promise<ReservationPackageAttributionRow[]> {
  const result = await db
    .from("hotel_reservation_packages")
    .select(
      "id, restaurant_id, reservation_id, package_activation_id, package_id, package_code, package_name, charge_basis, quantity, unit_amount, applied_amount, components_snapshot, applied_at, snapshot",
    )
    .eq("restaurant_id", input.restaurantId)
    .eq("reservation_id", input.reservationId)
    .order("created_at");
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    restaurantId: String(row.restaurant_id),
    reservationId: String(row.reservation_id),
    packageActivationId: String(row.package_activation_id),
    packageId: String(row.package_id),
    packageCode: String(row.package_code),
    packageName: String(row.package_name),
    chargeBasis: String(row.charge_basis),
    quantity: Number(row.quantity),
    unitAmount: Number(row.unit_amount),
    appliedAmount: Number(row.applied_amount),
    components: asComponents(row.components_snapshot),
    appliedAt: String(row.applied_at),
    snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
  }));
}

export async function getReservationCommercialAttribution(
  db: DbClient,
  input: { restaurantId: string; reservationId: string; roomSubtotal?: number | null },
): Promise<ReservationCommercialAttribution> {
  const { getReservationPromotionAttribution } = await import("./commercial-promotion.server.ts");
  const [promotion, packages] = await Promise.all([
    getReservationPromotionAttribution(db, input),
    getReservationPackageAttributions(db, input),
  ]);
  const promotionDiscount = promotion?.discountAmount ?? 0;
  const roomSubtotalAfterPromotion =
    promotion?.roomSubtotalAfterPromotion ?? (input.roomSubtotal == null ? null : Number(input.roomSubtotal));
  const packagesSubtotal = packages.reduce((sum, row) => sum + row.appliedAmount, 0);
  return {
    promotion,
    packages,
    promotionDiscount,
    packagesSubtotal,
    roomSubtotalAfterPromotion,
    grandCommercialSubtotal:
      roomSubtotalAfterPromotion == null
        ? null
        : Math.round((roomSubtotalAfterPromotion + packagesSubtotal + Number.EPSILON) * 100) / 100,
  };
}
