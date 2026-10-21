import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MEAL_EXCEL_COLUMNS,
  SERVICE_EXCEL_MIME,
  serviceWorkbookRows,
} from "./service-entitlement-export.ts";
import {
  assembleServiceEntitlementReport,
  type ServiceEntitlementSourceRow,
} from "./service-entitlement-report.ts";
import {
  EXPLICIT_DEFAULT_MEAL_POLICY,
  compareRoomNumbers,
  expectedEntitlements,
  mealPax,
  reconcileEntitlements,
  type MealApplicabilityPolicy,
  type ReservationRoomSource,
} from "./service-entitlement.ts";
import {
  serviceClearedSearch,
  serviceFilterSearch,
  serviceReportRequest,
} from "./service-entitlement-report-view.ts";

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const POLICY: MealApplicabilityPolicy = {
  breakfast: { ...EXPLICIT_DEFAULT_MEAL_POLICY.breakfast },
  lunch: { ...EXPLICIT_DEFAULT_MEAL_POLICY.lunch },
  dinner: { ...EXPLICIT_DEFAULT_MEAL_POLICY.dinner },
  countInfants: false,
  breakfastDepartmentId: "dept-restaurant",
  lunchDepartmentId: null,
  dinnerDepartmentId: null,
};

function room(overrides: Partial<ReservationRoomSource> = {}): ReservationRoomSource {
  return {
    id: "room-201",
    restaurantId: PROPERTY,
    reservationId: "res-1",
    unitSequence: 1,
    reservationStatus: "confirmed",
    arrivalDate: "2026-10-21",
    departureDate: "2026-10-23",
    adults: 2,
    children: 1,
    infants: 1,
    guestId: "guest-1",
    guestName: "Abebe Kebede",
    roomNumber: "201",
    building: "Main",
    floor: "2",
    specialRequests: "Quiet room",
    mealPlan: {
      id: "meal-bb",
      name: "Bed and Breakfast",
      includesBreakfast: true,
      includesLunch: false,
      includesDinner: false,
    },
    packages: [],
    ...overrides,
  };
}

function dates(rows: ReturnType<typeof expectedEntitlements>, meal = "BREAKFAST") {
  return rows.filter((row) => row.mealCode === meal).map((row) => row.serviceDate);
}

describe("service entitlement engine", () => {
  it("creates no meal for a room-only plan", () => {
    const rows = expectedEntitlements(
      [
        room({
          mealPlan: {
            id: "ro",
            name: "Room Only",
            includesBreakfast: false,
            includesLunch: false,
            includesDinner: false,
          },
        }),
      ],
      POLICY,
    );
    assert.equal(rows.length, 0);
  });

  it("uses inclusion flags and the configured meal dates, not the plan type name", () => {
    const rows = expectedEntitlements([room()], POLICY);
    assert.deepEqual(dates(rows), ["2026-10-22", "2026-10-23"]);
    assert.equal(
      rows.every((row) => row.sourceType === "RATE_PLAN_MEAL"),
      true,
    );
    assert.equal(rows[0]?.adultQuantity, 2);
    assert.equal(rows[0]?.childQuantity, 1);
    assert.equal(rows[0]?.totalQuantity, 3);
    assert.equal(mealPax(room(), POLICY).infants, 0);
  });

  it("honors an arrival-day breakfast rule and a departure-day dinner rule", () => {
    const custom: MealApplicabilityPolicy = {
      ...POLICY,
      breakfast: { includeArrival: true, includeStay: false, includeDeparture: false },
      dinner: { includeArrival: false, includeStay: false, includeDeparture: true },
    };
    const rows = expectedEntitlements(
      [
        room({
          mealPlan: {
            id: "fb",
            name: "Full Board",
            includesBreakfast: true,
            includesLunch: true,
            includesDinner: true,
          },
        }),
      ],
      custom,
    );
    assert.deepEqual(dates(rows, "BREAKFAST"), ["2026-10-21"]);
    assert.deepEqual(dates(rows, "DINNER"), ["2026-10-23"]);
    assert.ok(dates(rows, "LUNCH").includes("2026-10-21"));
    assert.equal(dates(rows, "LUNCH").includes("2026-10-23"), false);
  });

  it("keeps multi-room and group stays as separate room rows", () => {
    const rows = expectedEntitlements(
      [
        room({ id: "a", roomNumber: "201", adults: 2, children: 0 }),
        room({ id: "b", roomNumber: "202", unitSequence: 2, adults: 1, children: 1 }),
      ],
      POLICY,
    );
    const breakfast = rows.filter((row) => row.serviceDate === "2026-10-22");
    assert.deepEqual(
      breakfast.map((row) => [row.roomNumber, row.totalQuantity]),
      [
        ["201", 2],
        ["202", 2],
      ],
    );
  });

  it("does not generate a financial-only package component", () => {
    const rows = expectedEntitlements(
      [
        room({
          mealPlan: null,
          packages: [
            {
              assignmentId: "asg",
              reservationRoomId: null,
              componentId: "cmp",
              requiresFulfillment: false,
              departmentId: "transport",
              serviceDateRule: "ON_ARRIVAL",
              kind: "fo_service",
              serviceReferenceId: "svc",
              serviceName: "Airport Pickup",
              quantity: 1,
              mealPlan: null,
            },
          ],
        }),
      ],
      POLICY,
    );
    assert.equal(rows.length, 0);
  });

  it("generates a fulfillment package on the primary room and keeps a separate source from a rate meal", () => {
    const rows = expectedEntitlements(
      [room(), room({ id: "b", unitSequence: 2, roomNumber: "202" })].map((unit, index) =>
        index === 0
          ? {
              ...unit,
              packages: [
                {
                  assignmentId: "asg",
                  reservationRoomId: null,
                  componentId: "pickup",
                  requiresFulfillment: true,
                  departmentId: "transport",
                  serviceDateRule: "ON_ARRIVAL" as const,
                  kind: "fo_service" as const,
                  serviceReferenceId: "svc-pickup",
                  serviceName: "Airport Pickup",
                  quantity: 1,
                  mealPlan: null,
                },
              ],
            }
          : unit,
      ),
      POLICY,
    );
    const pickups = rows.filter((row) => row.serviceNameSnapshot === "Airport Pickup");
    assert.equal(pickups.length, 1);
    assert.equal(pickups[0]?.reservationRoomId, "room-201");
    assert.equal(pickups[0]?.sourceType, "PACKAGE");
    assert.equal(pickups[0]?.departmentId, "transport");
    const breakfast = rows.filter(
      (row) => row.mealCode === "BREAKFAST" && row.serviceDate === "2026-10-22",
    );
    assert.equal(new Set(breakfast.map((row) => row.generationKey)).size, breakfast.length);
  });

  it("is idempotent and preserves completed rows when the source disappears", () => {
    const first = expectedEntitlements([room()], POLICY);
    const stored = first.map((row, index) => ({
      id: `id-${index}`,
      generationKey: row.generationKey,
      status: index === 0 ? ("COMPLETED" as const) : ("PENDING" as const),
    }));
    const again = reconcileEntitlements(first, stored);
    assert.equal(again.insert.length, 0);
    assert.equal(again.cancelIds.length, 0);
    const removed = reconcileEntitlements([], stored);
    assert.deepEqual(removed.cancelIds, ["id-1"]);
    assert.equal(removed.cancelIds.includes("id-0"), false);
  });

  it("cancels future pending meals after a room-only rate change and a cancellation", () => {
    const before = expectedEntitlements([room()], POLICY);
    const after = expectedEntitlements(
      [
        room({
          mealPlan: {
            id: "ro",
            name: "Room Only",
            includesBreakfast: false,
            includesLunch: false,
            includesDinner: false,
          },
        }),
      ],
      POLICY,
    );
    const stored = before.map((row, index) => ({
      id: `id-${index}`,
      generationKey: row.generationKey,
      status: "PENDING" as const,
    }));
    const changed = reconcileEntitlements(after, stored);
    assert.equal(changed.cancelIds.length, stored.length);
    const cancelledStay = expectedEntitlements([room({ reservationStatus: "cancelled" })], POLICY);
    assert.equal(cancelledStay.length, 0);
    const noShow = expectedEntitlements([room({ reservationStatus: "no_show" })], POLICY);
    assert.equal(noShow.length, 0);
  });

  it("sorts room numbers naturally", () => {
    assert.deepEqual(["12", "2", "101"].sort(compareRoomNumbers), ["2", "12", "101"]);
  });
});

describe("service entitlement report", () => {
  const breakfast: ServiceEntitlementSourceRow = {
    id: "b",
    restaurantId: PROPERTY,
    roomNumber: "201",
    guestName: "Abebe",
    adultQuantity: 2,
    childQuantity: 0,
    totalQuantity: 2,
    serviceName: "Breakfast",
    mealCode: "BREAKFAST",
    mealPlanName: "Bed and Breakfast",
    serviceDate: "2026-10-22",
    departmentId: null,
    departmentName: null,
    status: "PENDING",
    notes: null,
    building: null,
    floor: null,
    stayStatus: "checked_in",
    serviceKind: "MEAL",
    serviceReferenceId: "meal-bb",
  };

  it("shows only breakfast for the service date and excludes cancelled by default", () => {
    const result = assembleServiceEntitlementReport({
      restaurantId: PROPERTY,
      businessDate: "2026-10-22",
      timezone: "Africa/Addis_Ababa",
      filters: { serviceDate: "2026-10-22", category: "MEAL", meal: "BREAKFAST" },
      rows: [
        breakfast,
        { ...breakfast, id: "lunch", mealCode: "LUNCH", serviceName: "Lunch" },
        { ...breakfast, id: "old", serviceDate: "2026-10-21" },
        { ...breakfast, id: "cancelled", status: "CANCELLED" },
        { ...breakfast, id: "other", restaurantId: "22222222-2222-4222-8222-222222222222" },
      ],
    });
    assert.deepEqual(
      result.rows.map((row) => row.id),
      ["b"],
    );
    assert.equal(result.summary.totalPax, 2);
    assert.equal("folio" in result.rows[0]!, false);
  });

  it("keeps only checked-in rooms when the handoff filter is in house", () => {
    const rows = [
      breakfast,
      { ...breakfast, id: "arriving", roomNumber: "105", stayStatus: "confirmed" },
      { ...breakfast, id: "departed", roomNumber: "106", stayStatus: "checked_out" },
    ];
    const result = assembleServiceEntitlementReport({
      restaurantId: PROPERTY,
      businessDate: "2026-10-22",
      timezone: "Africa/Addis_Ababa",
      filters: {
        serviceDate: "2026-10-22",
        category: "MEAL",
        meal: "BREAKFAST",
        stay: "IN_HOUSE",
        export: true,
      },
      rows,
    });
    assert.deepEqual(
      result.rows.map((row) => row.roomNumber),
      ["201"],
    );
    assert.equal(result.context.stay, "IN_HOUSE");
    const request = serviceReportRequest({
      restaurantId: PROPERTY,
      category: "MEAL",
      serviceDate: "2026-10-22",
      meal: "BREAKFAST",
      status: "OPEN",
      stay: "IN_HOUSE",
      page: 1,
      pageSize: 25,
      exportAll: true,
      action: "print",
    });
    assert.equal(request.stay, "IN_HOUSE");
    assert.equal(request.export, true);
    const cleared = serviceFilterSearch({
      report: "meal-service",
      serviceDate: "2026-10-22",
      meal: "BREAKFAST",
      stay: "IN_HOUSE",
    });
    assert.equal(cleared.stay, "in-house");
  });

  it("paginates and export returns the full filtered set", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      ...breakfast,
      id: `row-${index}`,
      roomNumber: String(index + 1),
    }));
    const page = assembleServiceEntitlementReport({
      restaurantId: PROPERTY,
      businessDate: "2026-10-22",
      timezone: "Africa/Addis_Ababa",
      filters: {
        serviceDate: "2026-10-22",
        category: "MEAL",
        meal: "BREAKFAST",
        page: 2,
        pageSize: 10,
      },
      rows,
    });
    assert.equal(page.rows.length, 2);
    const exported = assembleServiceEntitlementReport({
      restaurantId: PROPERTY,
      businessDate: "2026-10-22",
      timezone: "Africa/Addis_Ababa",
      filters: {
        serviceDate: "2026-10-22",
        category: "MEAL",
        meal: "BREAKFAST",
        page: 2,
        pageSize: 10,
        export: true,
      },
      rows,
    });
    assert.equal(exported.rows.length, 12);
  });

  it("writes meal and fulfillment URL defaults and a real xlsx shape", () => {
    const cleared = serviceClearedSearch("meal-service", "2026-10-22");
    assert.equal(cleared.report, "meal-service");
    assert.equal(cleared.serviceDate, "2026-10-22");
    assert.equal(cleared.meal, "BREAKFAST");
    const printed = serviceReportRequest({
      restaurantId: PROPERTY,
      category: "MEAL",
      serviceDate: "2026-10-22",
      meal: "BREAKFAST",
      status: "OPEN",
      page: 2,
      pageSize: 25,
      exportAll: true,
      action: "print",
    });
    assert.equal(printed.export, true);
    const sheet = serviceWorkbookRows(
      assembleServiceEntitlementReport({
        restaurantId: PROPERTY,
        businessDate: "2026-10-22",
        timezone: "Africa/Addis_Ababa",
        filters: { serviceDate: "2026-10-22", category: "MEAL", meal: "BREAKFAST", export: true },
        rows: [breakfast],
      }),
      "NORU",
      "2026-10-22 08:00",
    );
    assert.ok(sheet.flat().some((cell) => cell.kind === "number" && cell.value === 2));
    assert.ok(MEAL_EXCEL_COLUMNS.includes("Room"));
    assert.equal(
      SERVICE_EXCEL_MIME,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const source = readFileSync(
      new URL("./service-entitlement-report.functions.ts", import.meta.url),
      "utf8",
    );
    const audit = readFileSync(new URL("./service-entitlement-export.ts", import.meta.url), "utf8");
    assert.match(source, /requireFrontOfficeAccess/);
    assert.match(audit, /meal-service/);
    assert.match(audit, /service-fulfillment/);
    assert.doesNotMatch(
      readFileSync(new URL("./service-entitlement.ts", import.meta.url), "utf8"),
      /folio_transactions/,
    );
  });
});
