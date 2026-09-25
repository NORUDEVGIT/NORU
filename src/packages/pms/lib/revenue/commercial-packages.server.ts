/**
 * RR-P5-UI-02 — Packages workspace / performance compose.
 * Rate Manager only. Batched reads. Does not write pms_packages.
 */

import { loadRevenueProperty } from "./revenue-config.server.ts";
import { loadPackageEligibilityContexts } from "./commercial-package.server.ts";
import { listCommercialChangeHistory } from "./commercial-history.server.ts";
import { COMMERCIAL_RECENT_ACTIVITY_LIMIT } from "./commercial-overview.ts";
import {
  attributedStayOverlaps,
  buildPackageActivationRow,
  buildPackageMasterRow,
  countPackageOperationalStatuses,
  emptyPackagePerformance,
  packageActivationMatchesScopeFilter,
  PACKAGE_PERFORMANCE_NOTE,
  packagePerformancePeriodLabel,
  summarizePackagePerformance,
  type PackagePerformanceSummary,
  type PackagePerformanceTotals,
  type PackageWorkspaceMaster,
  type PackageWorkspaceRow,
  type PackagesWorkspace,
} from "./commercial-packages-ui.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type PackagesWorkspaceQuery = {
  restaurantId: string;
  fromDate?: string | null;
  toDate?: string | null;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
};

type PackageAttributionStay = {
  reservationId: string;
  activationId: string;
  packageId: string;
  appliedAmount: number;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
};

async function loadCatalogNames(db: DbClient, restaurantId: string) {
  const [rooms, plans] = await Promise.all([
    db.from("room_types").select("id, name").eq("restaurant_id", restaurantId),
    db.from("hotel_rate_plans").select("id, code, name").eq("restaurant_id", restaurantId),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);
  const roomNames = new Map(
    ((rooms.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      row.name || "Room type",
    ]),
  );
  const planNames = new Map(
    ((plans.data ?? []) as Array<{ id: string; code: string; name: string | null }>).map((row) => [
      row.id,
      row.code || row.name || "Plan",
    ]),
  );
  return { roomNames, planNames };
}

async function loadPackageMasters(
  db: DbClient,
  restaurantId: string,
): Promise<PackageWorkspaceMaster[]> {
  const [masters, rooms, plans, components] = await Promise.all([
    db
      .from("pms_packages")
      .select("id, code, name, type, package_price, active")
      .eq("restaurant_id", restaurantId),
    db.from("pms_package_room_types").select("package_id, room_type_id").eq("restaurant_id", restaurantId),
    db.from("pms_package_rate_plans").select("package_id, rate_plan_id").eq("restaurant_id", restaurantId),
    db.from("pms_package_components").select("package_id").eq("restaurant_id", restaurantId),
  ]);
  if (masters.error) throw new Error(masters.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  if (plans.error) throw new Error(plans.error.message);
  if (components.error) throw new Error(components.error.message);

  const roomMap = new Map<string, string[]>();
  for (const row of (rooms.data ?? []) as Array<{ package_id: string; room_type_id: string }>) {
    const current = roomMap.get(row.package_id) ?? [];
    current.push(row.room_type_id);
    roomMap.set(row.package_id, current);
  }
  const planMap = new Map<string, string[]>();
  for (const row of (plans.data ?? []) as Array<{ package_id: string; rate_plan_id: string }>) {
    const current = planMap.get(row.package_id) ?? [];
    current.push(row.rate_plan_id);
    planMap.set(row.package_id, current);
  }
  const componentCount = new Map<string, number>();
  for (const row of (components.data ?? []) as Array<{ package_id: string }>) {
    componentCount.set(row.package_id, (componentCount.get(row.package_id) ?? 0) + 1);
  }

  return ((masters.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: string | null;
    package_price: number | string;
    active: boolean | null;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    packagePrice: Number(row.package_price),
    active: row.active !== false,
    roomTypeIds: roomMap.get(row.id) ?? [],
    ratePlanIds: planMap.get(row.id) ?? [],
    componentCount: componentCount.get(row.id) ?? 0,
  }));
}

export async function loadPackageAttributedStays(
  db: DbClient,
  restaurantId: string,
): Promise<PackageAttributionStay[]> {
  const attributions = await db
    .from("hotel_reservation_packages")
    .select("reservation_id, package_activation_id, package_id, applied_amount")
    .eq("restaurant_id", restaurantId);
  if (attributions.error) throw new Error(attributions.error.message);
  const rows = (attributions.data ?? []) as Array<{
    reservation_id: string;
    package_activation_id: string;
    package_id: string;
    applied_amount: number | string;
  }>;
  if (rows.length === 0) return [];

  const reservationIds = [...new Set(rows.map((row) => row.reservation_id))];
  const reservations = await db
    .from("hotel_reservations")
    .select("id, arrival_date, departure_date, room_type_id, rate_plan_id")
    .eq("restaurant_id", restaurantId)
    .in("id", reservationIds);
  if (reservations.error) throw new Error(reservations.error.message);
  const stays = new Map(
    ((reservations.data ?? []) as Array<{
      id: string;
      arrival_date: string;
      departure_date: string;
      room_type_id: string | null;
      rate_plan_id: string | null;
    }>).map((row) => [row.id, row]),
  );

  return rows.flatMap((row) => {
    const stay = stays.get(row.reservation_id);
    if (!stay) return [];
    return [
      {
        reservationId: row.reservation_id,
        activationId: row.package_activation_id,
        packageId: row.package_id,
        appliedAmount: Number(row.applied_amount),
        arrivalDate: stay.arrival_date,
        departureDate: stay.departure_date,
        roomTypeId: stay.room_type_id,
        ratePlanId: stay.rate_plan_id,
      },
    ];
  });
}

function filterPackageStays(
  rows: PackageAttributionStay[],
  query: PackagesWorkspaceQuery,
): PackageAttributionStay[] {
  return rows.filter((row) => {
    if (!attributedStayOverlaps(row.arrivalDate, row.departureDate, query.fromDate, query.toDate)) {
      return false;
    }
    if (query.roomTypeId && row.roomTypeId !== query.roomTypeId) return false;
    if (query.ratePlanId && row.ratePlanId !== query.ratePlanId) return false;
    return true;
  });
}

function performanceByActivation(
  rows: PackageAttributionStay[],
): Map<string, PackagePerformanceTotals> {
  const grouped = new Map<string, PackageAttributionStay[]>();
  for (const row of rows) {
    const current = grouped.get(row.activationId) ?? [];
    current.push(row);
    grouped.set(row.activationId, current);
  }
  const totals = new Map<string, PackagePerformanceTotals>();
  for (const [activationId, group] of grouped) {
    totals.set(activationId, summarizePackagePerformance(group));
  }
  return totals;
}

export async function loadPackagesWorkspace(
  db: DbClient,
  query: PackagesWorkspaceQuery,
): Promise<PackagesWorkspace> {
  const [property, masters, contexts, stays, names, history] = await Promise.all([
    loadRevenueProperty(db, query.restaurantId, ""),
    loadPackageMasters(db, query.restaurantId),
    loadPackageEligibilityContexts(db, query.restaurantId),
    loadPackageAttributedStays(db, query.restaurantId),
    loadCatalogNames(db, query.restaurantId),
    listCommercialChangeHistory(db, {
      restaurantId: query.restaurantId,
      entityType: "package_activation",
      page: 1,
      pageSize: COMMERCIAL_RECENT_ACTIVITY_LIMIT,
    }),
  ]);

  const filteredStays = filterPackageStays(stays, query);
  const performance = performanceByActivation(filteredStays);
  const masterById = new Map(masters.map((row) => [row.id, row]));
  const activatedIds = new Set<string>();

  const activationRows: PackageWorkspaceRow[] = contexts
    .filter((row) => row.activation)
    .map((row) => {
      const activation = row.activation!;
      activatedIds.add(activation.packageId);
      const master = masterById.get(activation.packageId);
      return buildPackageActivationRow(
        {
          activationId: activation.id,
          packageId: activation.packageId,
          code: activation.packageCode,
          name: activation.packageName,
          type: activation.packageType,
          configuredPrice: activation.packagePrice,
          masterPrice: master?.packagePrice ?? activation.packagePrice,
          masterActive: row.master?.active !== false,
          active: activation.active,
          validFrom: activation.validFrom,
          validTo: activation.validTo,
          roomTypeIds: [...activation.scope.roomTypeIds],
          ratePlanIds: [...activation.scope.ratePlanIds],
          masterRoomTypeIds: [...activation.masterRoomTypeIds],
          masterRatePlanIds: [...activation.masterRatePlanIds],
          components: [...activation.components],
          createdAt: activation.createdAt,
          updatedAt: activation.updatedAt,
        },
        {
          businessDate: property.businessDate,
          performance: performance.get(activation.id) ?? emptyPackagePerformance(),
          roomNames: names.roomNames,
          planNames: names.planNames,
        },
      );
    })
    .filter((row) => packageActivationMatchesScopeFilter(row, query.roomTypeId, query.ratePlanId));

  const masterRows = masters
    .filter((master) => !activatedIds.has(master.id))
    .map((master) =>
      buildPackageMasterRow(master, { roomNames: names.roomNames, planNames: names.planNames }),
    )
    .filter((row) => packageActivationMatchesScopeFilter(row, query.roomTypeId, query.ratePlanId));

  const rows = [...activationRows, ...masterRows].sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      (left.validFrom ?? "").localeCompare(right.validFrom ?? "") ||
      left.rowKey.localeCompare(right.rowKey),
  );
  const operational = countPackageOperationalStatuses(rows);
  const totals = summarizePackagePerformance(filteredStays);

  return {
    businessDate: property.businessDate,
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    currency: property.currency,
    kpis: {
      ...operational,
      packageBookings: totals.bookings,
      packageRevenue: totals.revenue,
    },
    rows,
    masters,
    recentActivity: history.rows,
    hasMasters: masters.length > 0,
    hasActivations: contexts.some((row) => Boolean(row.activation)),
  };
}

export async function loadPackagePerformanceSummary(
  db: DbClient,
  query: PackagesWorkspaceQuery & { packageId?: string; activationId?: string },
): Promise<PackagePerformanceSummary> {
  const stays = filterPackageStays(await loadPackageAttributedStays(db, query.restaurantId), query).filter(
    (row) =>
      (!query.activationId || row.activationId === query.activationId) &&
      (!query.packageId || row.packageId === query.packageId),
  );
  return {
    packageId: query.packageId ?? null,
    activationId: query.activationId ?? null,
    ...summarizePackagePerformance(stays),
    periodLabel: packagePerformancePeriodLabel(query.fromDate, query.toDate),
    note: PACKAGE_PERFORMANCE_NOTE,
  };
}
