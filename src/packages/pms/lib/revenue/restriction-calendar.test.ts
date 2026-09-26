import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ABSENT_RESTRICTION_VERSION } from "./restriction-change.ts";
import {
  buildRateCalendarModel,
  type RateCalendarBuildInput,
  type RateCalendarPlan,
} from "./rate-calendar.ts";
import {
  RESTRICTION_CALENDAR_STALE_COPY,
  changedRestrictionFields,
  formatRestrictionFieldValue,
  hasOperationalRestriction,
  humanizeRestrictionCalendarError,
  restrictionMarks,
  restrictionStateFromCell,
  toRestrictionCalendar,
  toRestrictionCalendarCell,
} from "./restriction-calendar.ts";

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

function cellAt(input: RateCalendarBuildInput, planId = BAR, date = "2026-09-24") {
  const model = toRestrictionCalendar(buildRateCalendarModel(input));
  return model.groups
    .flatMap((group) => group.rows)
    .find((row) => row.plan.id === planId)
    ?.cells.find((cell) => cell.date === date);
}

describe("RR-P3-02 — restriction grid", () => {
  it("shows an open cell when no restriction row exists", () => {
    const cell = cellAt(baseInput());
    assert.equal(cell?.hasRestriction, false);
    assert.deepEqual(cell?.marks, []);
    assert.equal(cell?.restrictionExpectedVersion, ABSENT_RESTRICTION_VERSION);
    assert.equal(hasOperationalRestriction(cell!.restriction), false);
  });

  it("marks CTA, CTD, stop sell, min stay, and max stay", () => {
    const cell = cellAt(
      baseInput({
        restrictions: [
          {
            ratePlanId: BAR,
            date: "2026-09-24",
            minStay: 2,
            maxStay: 5,
            closedToArrival: true,
            closedToDeparture: true,
            stopSell: true,
            updatedAt: "2026-09-24T10:00:00.000Z",
          },
        ],
      }),
    );
    assert.deepEqual(
      cell?.marks.map((mark) => mark.label),
      ["SS", "CTA", "CTD", "Min 2", "Max 5"],
    );
    assert.equal(cell?.restrictionExpectedVersion, "2026-09-24T10:00:00.000Z");
    assert.equal(restrictionMarks(cell!.restriction).some((mark) => mark.kind === "stopSell"), true);
  });

  it("can show a single CTA, CTD, stop sell, min, or max mark", () => {
    assert.deepEqual(
      restrictionMarks({
        minStay: null,
        maxStay: null,
        closedToArrival: true,
        closedToDeparture: false,
        stopSell: false,
      }).map((mark) => mark.label),
      ["CTA"],
    );
    assert.deepEqual(
      restrictionMarks({
        minStay: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: true,
        stopSell: false,
      }).map((mark) => mark.label),
      ["CTD"],
    );
    assert.deepEqual(
      restrictionMarks({
        minStay: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: true,
      }).map((mark) => mark.label),
      ["SS"],
    );
    assert.deepEqual(
      restrictionMarks({
        minStay: 3,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
      }).map((mark) => mark.label),
      ["Min 3"],
    );
    assert.deepEqual(
      restrictionMarks({
        minStay: null,
        maxStay: 7,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
      }).map((mark) => mark.label),
      ["Max 7"],
    );
  });

  it("filters by room type and rate plan", () => {
    const byType = toRestrictionCalendar(buildRateCalendarModel(baseInput({ roomTypeId: DELUXE })));
    assert.equal(byType.groups.length, 1);
    assert.equal(byType.groups[0]?.roomType.id, DELUXE);
    const byPlan = toRestrictionCalendar(buildRateCalendarModel(baseInput({ ratePlanId: CORP })));
    assert.equal(byPlan.groups.length, 1);
    assert.equal(byPlan.groups[0]?.rows[0]?.plan.id, CORP);
  });

  it("keeps the requested date range on the composed model", () => {
    const model = toRestrictionCalendar(
      buildRateCalendarModel(baseInput({ fromDate: "2026-09-24", toDate: "2026-10-20", requestedTo: "2026-10-20" })),
    );
    assert.equal(model.dates.length <= 14, true);
    assert.equal(model.fromDate, "2026-09-24");
  });
});

describe("RR-P3-02 — drawer and edit helpers", () => {
  it("opens from a selected cell with overview values", () => {
    const source = buildRateCalendarModel(
      baseInput({
        restrictions: [
          {
            ratePlanId: BAR,
            date: "2026-09-24",
            minStay: 2,
            maxStay: null,
            closedToArrival: true,
            closedToDeparture: false,
            stopSell: false,
          },
        ],
      }),
    );
    const cell = toRestrictionCalendarCell(source.groups[0]!.rows[0]!.cells[0]!);
    assert.equal(cell.ratePlanId, BAR);
    assert.equal(cell.restriction.minStay, 2);
    assert.equal(cell.restriction.closedToArrival, true);
    assert.equal(formatRestrictionFieldValue("closedToArrival", true), "Closed");
    assert.equal(formatRestrictionFieldValue("minStay", 2), "2 nights");
    assert.equal(formatRestrictionFieldValue("stopSell", false), "Off");
  });

  it("treats a missing row as empty draft state", () => {
    const cell = cellAt(baseInput());
    assert.deepEqual(restrictionStateFromCell(cell!.restriction), {
      minStay: null,
      maxStay: null,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
    });
  });

  it("patches only changed fields for SET_FIELDS", () => {
    const current = {
      minStay: 2,
      maxStay: 7,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
    };
    assert.deepEqual(changedRestrictionFields(current, { ...current, closedToArrival: true }), {
      closedToArrival: true,
    });
    assert.deepEqual(changedRestrictionFields(current, { ...current, minStay: null }), {
      minStay: null,
    });
    assert.deepEqual(changedRestrictionFields(current, { ...current, minStay: 3, maxStay: 5 }), {
      minStay: 3,
      maxStay: 5,
    });
  });

  it("maps stale errors to the restriction calendar copy", () => {
    assert.equal(humanizeRestrictionCalendarError("RESTRICTION_CHANGE_STALE"), RESTRICTION_CALENDAR_STALE_COPY);
    assert.match(RESTRICTION_CALENDAR_STALE_COPY, /Refresh and review again/);
    assert.equal(humanizeRestrictionCalendarError("RESTRICTION_MIN_STAY_INVALID"), "RESTRICTION_MIN_STAY_INVALID");
  });
});

describe("RR-P3-02 — wiring, ownership, and UI locks", () => {
  const view = readRel("../../components/rates/restrictions/restriction-calendar-view.tsx");
  const grid = readRel("../../components/rates/restrictions/restriction-calendar-grid.tsx");
  const cell = readRel("../../components/rates/restrictions/restriction-calendar-cell.tsx");
  const toolbar = readRel("../../components/rates/restrictions/restriction-calendar-toolbar.tsx");
  const legend = readRel("../../components/rates/restrictions/restriction-calendar-legend.tsx");
  const drawer = readRel("../../components/rates/restriction-detail/restriction-detail-drawer.tsx");
  const overview = readRel("../../components/rates/restriction-detail/restriction-detail-overview.tsx");
  const edit = readRel("../../components/rates/restriction-detail/restriction-edit-form.tsx");
  const history = readRel("../../components/rates/restriction-detail/restriction-detail-history.tsx");
  const workspace = readRel("../../components/workspaces/rates-workspace.tsx");
  const server = readRel("./rate-calendar.server.ts");
  const functions = readRel("./restriction-change.functions.ts");
  const historyServer = readRel("./restriction-change.server.ts");
  const adapter = readRel("./restriction-calendar.ts");

  it("mounts UI-07 on view=restrictions and no longer mounts RateRestrictionsTab", () => {
    assert.match(workspace, /<RestrictionCalendarView/);
    assert.match(workspace, /case "restrictions"/);
    assert.doesNotMatch(workspace, /<RateRestrictionsTab/);
    assert.match(workspace, /requestedView !== "rate-calendar" && requestedView !== "restrictions"/);
    assert.doesNotMatch(workspace, /if \(requestedView !== "restrictions"\) return;/);
  });

  it("wires official preview/apply and CLEAR_ALL", () => {
    assert.match(view, /getRevenueRateCalendar/);
    assert.match(view, /toRestrictionCalendar/);
    assert.match(drawer, /listRestrictionChangeHistory/);
    assert.match(drawer, /stayDate: cell.date/);
    assert.match(edit, /previewRestrictionChanges/);
    assert.match(edit, /applyRestrictionChanges/);
    assert.match(edit, /type: "SET_FIELDS"/);
    assert.match(edit, /type: "CLEAR_ALL"/);
    assert.match(edit, /source: "restriction_calendar"/);
    assert.match(edit, /restrictionExpectedVersion/);
    assert.match(edit, /invalidateQueries\(\{ queryKey: \["revenue-rate-calendar"\] \}\)/);
    assert.match(edit, /invalidateQueries\(\{ queryKey: \["revenue-control"\] \}\)/);
    assert.match(edit, /invalidateQueries\(\{ queryKey: \["restriction-change-history"\] \}\)/);
    assert.match(edit, /invalidateQueries\(\{ queryKey: \["rate-restrictions"\] \}\)/);
    assert.doesNotMatch(edit, /saveRateRestriction/);
    assert.doesNotMatch(view, /saveRateRestriction/);
    assert.match(functions, /export const previewRestrictionChanges/);
    assert.match(functions, /export const applyRestrictionChanges/);
    assert.match(historyServer, /if \(query.stayDate\) request = request.eq\("stay_date"/);
  });

  it("loads restriction updated_at for concurrency and history stayDate", () => {
    assert.match(server, /updated_at/);
    assert.match(server, /stop_sell, updated_at/);
    assert.match(overview, /No restrictions applied/);
    assert.match(overview, /RESTRICTION_CALENDAR_HISTORY_EMPTY/);
    assert.match(history, /View Full Restriction History/);
    assert.match(history, /restriction-history/);
    assert.match(drawer, /Select a restriction cell/);
  });

  it("does not present approvals, OTA, forecast, or master CRUD", () => {
    const files = [view, grid, cell, toolbar, legend, drawer, overview, history, adapter];
    for (const source of files) {
      assert.doesNotMatch(source, /Publish Restrictions/);
      assert.doesNotMatch(source, /Submit for Approval/);
      assert.doesNotMatch(source, /Sync OTA/);
      assert.doesNotMatch(source, /Revenue Impact/);
      assert.doesNotMatch(source, /Forecast Impact/);
      assert.doesNotMatch(source, /saveRateRestriction/);
      assert.doesNotMatch(source, /pms_commercial_restrictions/);
      assert.doesNotMatch(source, /template_id|commercial_restriction_id/);
    }
    assert.match(edit, /SUBMIT_FOR_APPROVAL_LABEL|Submit for Approval/);
    assert.match(toolbar, /Apply Restriction/);
    assert.match(toolbar, /Restriction History/);
    assert.match(legend, /Operational restrictions, not demand/);
    assert.match(adapter, /Template prefill is deferred/);
  });

  it("does not add a migration, RPC, or change 0016 pricing", () => {
    const migrations = readdirSync(join(here, "../../../../../drizzle/migrations"));
    assert.ok(migrations.includes("0102_pms_rate_restriction_change_events.sql"));
    assert.ok(!migrations.some((name) => /p3-02|restriction.calendar.ui|restriction.detail/i.test(name)));
    const pricing = readRel("../../../../../drizzle/migrations/0016_create_hotel_rates.sql");
    assert.match(pricing, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(view, /CREATE OR REPLACE FUNCTION public\.price_hotel_stay/);
    assert.doesNotMatch(edit, /apply_hotel_rate_restrictions/);
  });
});
