/**
 * RR-P5-UI-01 — Commercial Overview / Promotions read compose.
 * Rate Manager only. Batched reads. Does not write pms_promotions.
 */

import { loadRevenueProperty } from "./revenue-config.server.ts";
import { listPackageActivations } from "./commercial-package-activation.server.ts";
import { listCommercialChangeHistory } from "./commercial-history.server.ts";
import { loadPromotionEligibilityContexts } from "./commercial-promotion.server.ts";
import { loadPackageAttributedStays } from "./commercial-packages.server.ts";
import {
  PACKAGE_PERFORMANCE_NOTE,
  summarizePackagePerformance,
} from "./commercial-packages-ui.ts";
import {
  activationMatchesScopeFilter,
  buildCommercialAttention,
  buildCommercialPromotionRows,
  buildPromotionMasterRow,
  commercialOperationalStatus,
  commercialPerformancePeriodLabel,
  COMMERCIAL_PERFORMANCE_NOTE,
  COMMERCIAL_RECENT_ACTIVITY_LIMIT,
  emptyCommercialPerformance,
  reservationStayOverlapsRange,
  stayNightsOverlappingRange,
  summarizeAttributedPerformance,
  toPromotionActivationWorkspaceRow,
  type CommercialOverviewWorkspace,
  type CommercialPerformanceTotals,
  type CommercialPromotionInput,
  type PromotionWorkspaceMaster,
  type PromotionsWorkspace,
  type PromotionPerformanceSummary,
} from "./commercial-overview.ts";
import type { CommercialPromoKind } from "./commercial-engine.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

export type CommercialOverviewQuery = {
  restaurantId: string;
  fromDate?: string | null;
  toDate?: string | null;
  roomTypeId?: string | null;
  ratePlanId?: string | null;
};

type AttributionStay = {
  reservationId: string;
  activationId: string;
  discountAmount: number;
  roomSubtotalAfterPromotion: number;
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

async function loadAttributedStays(db: DbClient, restaurantId: string): Promise<AttributionStay[]> {
  const attributions = await db
    .from("hotel_reservation_promotions")
    .select("reservation_id, promotion_activation_id, discount_amount, room_subtotal_after_promotion")
    .eq("restaurant_id", restaurantId);
  if (attributions.error) throw new Error(attributions.error.message);
  const rows = (attributions.data ?? []) as Array<{
    reservation_id: string;
    promotion_activation_id: string;
    discount_amount: number | string;
    room_subtotal_after_promotion: number | string;
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
        activationId: row.promotion_activation_id,
        discountAmount: Number(row.discount_amount),
        roomSubtotalAfterPromotion: Number(row.room_subtotal_after_promotion),
        arrivalDate: stay.arrival_date,
        departureDate: stay.departure_date,
        roomTypeId: stay.room_type_id,
        ratePlanId: stay.rate_plan_id,
      },
    ];
  });
}

function filterAttributedStays(
  rows: AttributionStay[],
  query: CommercialOverviewQuery,
): AttributionStay[] {
  return rows.filter((row) => {
    if (!reservationStayOverlapsRange(row.arrivalDate, row.departureDate, query.fromDate, query.toDate)) {
      return false;
    }
    if (query.roomTypeId && row.roomTypeId !== query.roomTypeId) return false;
    if (query.ratePlanId && row.ratePlanId !== query.ratePlanId) return false;
    return true;
  });
}

function performanceByActivation(
  rows: AttributionStay[],
  query: CommercialOverviewQuery,
): Map<string, CommercialPerformanceTotals> {
  const grouped = new Map<string, AttributionStay[]>();
  for (const row of rows) {
    const current = grouped.get(row.activationId) ?? [];
    current.push(row);
    grouped.set(row.activationId, current);
  }
  const totals = new Map<string, CommercialPerformanceTotals>();
  for (const [activationId, group] of grouped) {
    totals.set(
      activationId,
      summarizeAttributedPerformance(group, query.fromDate, query.toDate),
    );
  }
  return totals;
}

async function loadPromotionInputs(db: DbClient, restaurantId: string): Promise<CommercialPromotionInput[]> {
  const contexts = await loadPromotionEligibilityContexts(db, restaurantId);
  return contexts
    .filter((row) => row.activation)
    .map((row) => {
      const activation = row.activation!;
      return {
        activationId: activation.id,
        promotionId: activation.promotionId,
        code: activation.promotionCode,
        name: activation.promotionName,
        kind: activation.promoKind,
        value: activation.promoValue,
        active: activation.active,
        masterActive: row.master?.active !== false,
        validFrom: activation.validFrom,
        validTo: activation.validTo,
        bookingFrom: activation.bookingFrom,
        bookingTo: activation.bookingTo,
        priority: activation.priority,
        roomTypeIds: [...activation.scope.roomTypeIds],
        ratePlanIds: [...activation.scope.ratePlanIds],
        masterRoomTypeIds: [...activation.masterRoomTypeIds],
        createdAt: activation.createdAt,
        updatedAt: activation.updatedAt,
      };
    });
}

async function loadPromotionMasters(
  db: DbClient,
  restaurantId: string,
): Promise<PromotionWorkspaceMaster[]> {
  const [masters, rooms] = await Promise.all([
    db
      .from("pms_promotions")
      .select("id, code, name, promo_kind, promo_value, valid_from, valid_to, active")
      .eq("restaurant_id", restaurantId),
    db.from("pms_promotion_room_types").select("promotion_id, room_type_id").eq("restaurant_id", restaurantId),
  ]);
  if (masters.error) throw new Error(masters.error.message);
  if (rooms.error) throw new Error(rooms.error.message);
  const roomMap = new Map<string, string[]>();
  for (const row of (rooms.data ?? []) as Array<{ promotion_id: string; room_type_id: string }>) {
    const current = roomMap.get(row.promotion_id) ?? [];
    current.push(row.room_type_id);
    roomMap.set(row.promotion_id, current);
  }
  return ((masters.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    promo_kind: CommercialPromoKind;
    promo_value: number | string;
    valid_from: string;
    valid_to: string;
    active: boolean | null;
  }>).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.promo_kind,
    value: Number(row.promo_value),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active !== false,
    roomTypeIds: roomMap.get(row.id) ?? [],
  }));
}

async function loadPromotionWorkspaceRows(db: DbClient, query: CommercialOverviewQuery) {
  const [property, inputs, stays, names, masters] = await Promise.all([
    loadRevenueProperty(db, query.restaurantId, ""),
    loadPromotionInputs(db, query.restaurantId),
    loadAttributedStays(db, query.restaurantId),
    loadCatalogNames(db, query.restaurantId),
    loadPromotionMasters(db, query.restaurantId),
  ]);
  const filteredStays = filterAttributedStays(stays, query);
  const activationRows = buildCommercialPromotionRows(inputs, {
    businessDate: property.businessDate,
    performanceByActivation: performanceByActivation(filteredStays, query),
    roomNames: names.roomNames,
    planNames: names.planNames,
    roomTypeId: query.roomTypeId,
    ratePlanId: query.ratePlanId,
  });
  const activatedIds = new Set(activationRows.map((row) => row.promotionId));
  const masterRows = masters
    .filter((master) => !activatedIds.has(master.id))
    .map((master) => buildPromotionMasterRow(master, names))
    .filter((row) =>
      activationMatchesScopeFilter(
        {
          roomTypeIds: row.roomTypeIds,
          ratePlanIds: row.ratePlanIds,
          masterRoomTypeIds: row.masterRoomTypeIds,
        },
        query.roomTypeId,
        query.ratePlanId,
      ),
    );
  const rows = [...activationRows.map(toPromotionActivationWorkspaceRow), ...masterRows].sort(
    (left, right) => left.code.localeCompare(right.code) || left.rowKey.localeCompare(right.rowKey),
  );
  return {
    property,
    rows,
    activationRows,
    masters,
    filteredStays,
    names,
  };
}

export async function loadCommercialOverviewWorkspace(
  db: DbClient,
  query: CommercialOverviewQuery,
): Promise<CommercialOverviewWorkspace> {
  const [{ property, activationRows, filteredStays }, packages, packageStays, history] = await Promise.all([
    loadPromotionWorkspaceRows(db, query),
    listPackageActivations(db, { restaurantId: query.restaurantId }),
    loadPackageAttributedStays(db, query.restaurantId),
    listCommercialChangeHistory(db, {
      restaurantId: query.restaurantId,
      page: 1,
      pageSize: COMMERCIAL_RECENT_ACTIVITY_LIMIT,
    }),
  ]);
  const performance = summarizeAttributedPerformance(filteredStays, query.fromDate, query.toDate);
  const packageTotals = summarizePackagePerformance(
    packageStays.filter((row) => {
      if (!reservationStayOverlapsRange(row.arrivalDate, row.departureDate, query.fromDate, query.toDate)) {
        return false;
      }
      if (query.roomTypeId && row.roomTypeId !== query.roomTypeId) return false;
      if (query.ratePlanId && row.ratePlanId !== query.ratePlanId) return false;
      return true;
    }),
  );
  const activePackages = packages.filter(
    (row) => commercialOperationalStatus(row, property.businessDate) === "active",
  ).length;
  return {
    businessDate: property.businessDate,
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    currency: property.currency,
    kpis: {
      activePromotions: activationRows.filter((row) => row.operationalStatus === "active").length,
      upcomingPromotions: activationRows.filter((row) => row.operationalStatus === "upcoming").length,
      expiringSoon: activationRows.filter((row) => row.expiringSoon).length,
      activePackages,
    },
    performance: {
      ...performance,
      periodLabel: commercialPerformancePeriodLabel(query.fromDate, query.toDate),
      note: COMMERCIAL_PERFORMANCE_NOTE,
    },
    packagePerformance: {
      bookings: packageTotals.bookings,
      revenue: packageTotals.revenue,
      periodLabel: commercialPerformancePeriodLabel(query.fromDate, query.toDate),
      note: PACKAGE_PERFORMANCE_NOTE,
    },
    activePromotions: activationRows.filter((row) => row.operationalStatus === "active"),
    attention: buildCommercialAttention(activationRows),
    recentActivity: history.rows,
    empty: activationRows.length === 0 && packages.length === 0,
  };
}

export async function loadPromotionsWorkspace(
  db: DbClient,
  query: CommercialOverviewQuery,
): Promise<PromotionsWorkspace> {
  const { property, rows, masters, activationRows } = await loadPromotionWorkspaceRows(db, query);
  return {
    businessDate: property.businessDate,
    fromDate: query.fromDate ?? null,
    toDate: query.toDate ?? null,
    currency: property.currency,
    rows,
    masters,
    hasMasters: masters.length > 0,
    hasActivations: activationRows.length > 0,
  };
}

export async function loadPromotionPerformanceSummary(
  db: DbClient,
  query: CommercialOverviewQuery & { activationId?: string },
): Promise<PromotionPerformanceSummary> {
  const stays = filterAttributedStays(await loadAttributedStays(db, query.restaurantId), query).filter(
    (row) => !query.activationId || row.activationId === query.activationId,
  );
  return {
    activationId: query.activationId ?? null,
    ...summarizeAttributedPerformance(stays, query.fromDate, query.toDate),
    periodLabel: commercialPerformancePeriodLabel(query.fromDate, query.toDate),
    note: COMMERCIAL_PERFORMANCE_NOTE,
  };
}

export { emptyCommercialPerformance, stayNightsOverlappingRange };
