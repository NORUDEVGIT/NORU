import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ABSENT_CALENDAR_VERSION } from "./rate-change.ts";
import {
  RATE_CALENDAR_HISTORY_EMPTY,
  RATE_CALENDAR_MAX_COLUMNS,
  RATE_CALENDAR_STALE_COPY,
  buildRateCalendarModel,
  clampRateCalendarRange,
  composeInventory,
  defaultRateCalendarRange,
  inventoryBand,
  type RateCalendarBuildInput,
  type RateCalendarPlan,
} from "./rate-calendar.ts";

const here = dirname(fileURLToPath(import.meta.url));

function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

const DELUXE = "rt-deluxe";
const STANDARD = "rt-standard";
const BAR = "rp-bar";
const CORP = "rp-corp";

const plans: RateCalendarPlan[] = [
  {
    id: BAR,
    code: "BAR",
    name: "BAR",
    roomTypeId: DELUXE,
    currency: "USD",
    baseRate: 100,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
  },
  {
    id: CORP,
    code: "CORP",
    name: "Corporate",
    roomTypeId: STANDARD,
    currency: "USD",
    baseRate: 80,
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    active: true,
  },
];

function baseInput(overrides: Partial<RateCalendarBuildInput> = {}): RateCalendarBuildInput {
  return {
    fromDate: "2026-09-24",
    toDate: "2026-09-25",
    requestedFrom: "2026-09-24",
    requestedTo: "2026-09-25",
    rangeClamped: false,
    roomTypeId: null,
    ratePlanId: null,
    currency: "USD",
    rooms: [
      { id: "r1", roomTypeId: DELUXE },
      { id: "r2", roomTypeId: DELUXE },
      { id: "r3", roomTypeId: STANDARD },
    ],
    roomTypes: [
      { id: DELUXE, code: "DLX", name: "Deluxe" },
      { id: STANDARD, code: "STD", name: "Standard" },
    ],
    plans,
    overrides: [],
    restrictions: [],
    reservations: [],
    ...overrides,
  };
}

describe("RR-P2-03 — Rate Calendar read model", () => {
  it("builds a base-only cell with absent version", () => {
    const model = buildRateCalendarModel(baseInput());
    const cell = model.groups.flatMap((group) => group.rows).find((row) => row.plan.id === BAR)?.cells[0];
    assert.ok(cell);
    assert.equal(cell.baseRate, 100);
    assert.equal(cell.overrideRate, null);
    assert.equal(cell.effectiveRate, 100);
    assert.equal(cell.overrideActive, false);
    assert.equal(cell.expectedVersion, ABSENT_CALENDAR_VERSION);
  });

  it("applies an override to effective rate and version", () => {
    const model = buildRateCalendarModel(
      baseInput({
        overrides: [{ ratePlanId: BAR, date: "2026-09-24", nightlyRate: 125, updatedAt: "2026-09-20T10:00:00Z" }],
      }),
    );
    const cell = model.groups.flatMap((group) => group.rows).find((row) => row.plan.id === BAR)?.cells[0];
    assert.equal(cell?.overrideRate, 125);
    assert.equal(cell?.effectiveRate, 125);
    assert.equal(cell?.expectedVersion, "2026-09-20T10:00:00Z");
  });

  it("attaches restriction flags without inventing demand", () => {
    const model = buildRateCalendarModel(
      baseInput({
        restrictions: [
          {
            ratePlanId: BAR,
            date: "2026-09-24",
            minStay: 2,
            maxStay: null,
            closedToArrival: true,
            closedToDeparture: false,
            stopSell: true,
          },
        ],
      }),
    );
    const cell = model.groups.flatMap((group) => group.rows).find((row) => row.plan.id === BAR)?.cells[0];
    assert.equal(cell?.restriction.stopSell, true);
    assert.equal(cell?.restriction.closedToArrival, true);
    assert.match(cell?.restrictionLabel ?? "", /Stop Sell/);
    assert.match(cell?.restrictionLabel ?? "", /CTA/);
  });

  it("composes inventory from matching room-type occupancy", () => {
    const model = buildRateCalendarModel(
      baseInput({
        reservations: [{ roomTypeId: DELUXE, arrivalDate: "2026-09-24", departureDate: "2026-09-25" }],
      }),
    );
    const deluxe = model.groups.flatMap((group) => group.rows).find((row) => row.plan.id === BAR)?.cells[0];
    const standard = model.groups.flatMap((group) => group.rows).find((row) => row.plan.id === CORP)?.cells[0];
    assert.equal(deluxe?.inventory.roomsSold, 1);
    assert.equal(deluxe?.inventory.roomsAvailable, 2);
    assert.equal(deluxe?.inventory.occupancyPercent, 50);
    assert.equal(standard?.inventory.roomsSold, 0);
    assert.equal(standard?.inventory.roomsAvailable, 1);
  });

  it("filters by room type and rate plan", () => {
    const byType = buildRateCalendarModel(baseInput({ roomTypeId: DELUXE }));
    assert.equal(byType.groups.length, 1);
    assert.equal(byType.groups[0]?.roomType.id, DELUXE);
    const byPlan = buildRateCalendarModel(baseInput({ ratePlanId: CORP }));
    assert.equal(byPlan.groups.length, 1);
    assert.equal(byPlan.groups[0]?.rows[0]?.plan.id, CORP);
  });

  it("clamps long ranges to 14 columns", () => {
    const clamped = clampRateCalendarRange("2026-01-01", "2026-03-01");
    assert.equal(clamped.rangeClamped, true);
    assert.equal(clamped.fromDate, "2026-01-01");
    assert.ok(clamped.toDate < "2026-03-01");
    assert.equal(RATE_CALENDAR_MAX_COLUMNS, 14);
    const model = buildRateCalendarModel(
      baseInput({
        fromDate: clamped.fromDate,
        toDate: clamped.toDate,
        requestedFrom: clamped.requestedFrom,
        requestedTo: clamped.requestedTo,
        rangeClamped: true,
      }),
    );
    assert.ok(model.dates.length <= 14);
  });

  it("uses Room & Inventory remaining bands, not demand labels", () => {
    assert.equal(inventoryBand(5, 10), "available");
    assert.equal(inventoryBand(1, 10), "limited");
    assert.equal(inventoryBand(0, 10), "low-remaining");
    assert.equal(composeInventory(10, 10).band, "low-remaining");
    const today = defaultRateCalendarRange("2026-09-24");
    assert.equal(today.fromDate, "2026-09-24");
    assert.equal(today.toDate, "2026-09-30");
  });
});

describe("RR-P2-03 — wiring, drawer and no fake product", () => {
  const view = readRel("../../components/rates/rate-calendar/rate-calendar-view.tsx");
  const grid = readRel("../../components/rates/rate-calendar/rate-calendar-grid.tsx");
  const toolbar = readRel("../../components/rates/rate-calendar/rate-calendar-toolbar.tsx");
  const legend = readRel("../../components/rates/rate-calendar/rate-calendar-legend.tsx");
  const drawer = readRel("../../components/rates/rate-detail/rate-detail-drawer.tsx");
  const edit = readRel("../../components/rates/rate-detail/rate-edit-form.tsx");
  const history = readRel("../../components/rates/rate-detail/rate-detail-history.tsx");
  const functions = readRel("./rate-calendar.functions.ts");
  const server = readRel("./rate-calendar.server.ts");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const changeFunctions = readRel("./rate-change.functions.ts");
  const changeServer = readRel("./rate-change.server.ts");

  it("rejects foreign properties by requiring rate manager then admin reads", () => {
    assert.match(functions, /requireRateManager/);
    assert.match(functions, /supabaseAdmin/);
    assert.match(functions, /loadRevenueRateCalendar\(supabaseAdmin/);
    assert.doesNotMatch(functions, /loadRevenueRateCalendar\(context\.supabase/);
  });

  it("opens a selected cell in the Rate Detail drawer", () => {
    assert.match(view, /RateDetailDrawer/);
    assert.match(view, /setSelected\(cell\)/);
    assert.match(drawer, /Rate Detail & Edit/);
    assert.match(drawer, /Overview/);
    assert.match(drawer, /Edit Rate/);
    assert.match(drawer, /Restrictions/);
    assert.match(drawer, /History/);
    assert.match(history, /RATE_CALENDAR_HISTORY_EMPTY/);
    assert.equal(RATE_CALENDAR_HISTORY_EMPTY, "No recorded rate-change history for this date.");
    assert.match(edit, /This rate plan is inactive/);
    assert.match(grid, /RateCalendarCell/);
  });

  it("routes single-cell edits through official applyRateChanges", () => {
    assert.match(edit, /previewRateChanges/);
    assert.match(edit, /applyRateChanges/);
    assert.match(edit, /SET_RATE/);
    assert.match(edit, /RESET_OVERRIDE/);
    assert.match(edit, /PERCENT_INCREASE/);
    assert.match(edit, /PERCENT_DECREASE/);
    assert.match(edit, /COPY_FROM_DATE/);
    assert.match(edit, /expectedVersion/);
    assert.match(edit, /RATE_CALENDAR_STALE_COPY/);
    assert.equal(RATE_CALENDAR_STALE_COPY, "The rate changed after this preview. Refresh and review again.");
    assert.doesNotMatch(edit, /saveRateOverride/);
    assert.match(changeFunctions, /export const applyRateChanges/);
    assert.match(changeServer, /stay_date/);
  });

  it("does not present demand, forecast, approvals or publish workflow", () => {
    const files = [view, grid, toolbar, legend, drawer, edit];
    for (const source of files) {
      assert.doesNotMatch(source, /High Demand|Low Demand|Normal Demand/);
      assert.doesNotMatch(source, /Publish Changes/);
      assert.doesNotMatch(source, /approval queue/i);
      assert.doesNotMatch(source, /Forecast 87%/);
      assert.doesNotMatch(source, /Add Rate Plan/);
      assert.doesNotMatch(source, /saveRateOverride/);
    }
    assert.match(legend, /Low Remaining/);
    assert.match(legend, /Inventory bands, not demand/);
    assert.match(toolbar, /Bulk Rate Change/);
    assert.match(workspace, /RateCalendarView/);
    assert.doesNotMatch(workspace, /<RateCalendarTab/);
    assert.match(workspace, /requestedView !== "restrictions"/);
  });

  it("does not add a migration or change 0016 pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0101_pms_rate_change_events.sql"));
    assert.ok(!migrations.some((name) => /p2-03|rate.calendar.ui|rate.detail/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(server, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.match(server, /Promise\.all/);
  });
});
