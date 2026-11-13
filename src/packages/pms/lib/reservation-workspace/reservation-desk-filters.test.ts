import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DESK_FILTER_ALL,
  DESK_SEARCH_DEBOUNCE_MS,
  EMPTY_ADVANCED_FILTERS,
  EMPTY_BAR_FILTERS,
  countActiveAdvancedFilters,
  deskFilterChips,
  deskTableStayWindow,
  hasActiveDeskConstraints,
  isDeskServerSearchActive,
  removeDeskFilterChip,
  toDeskSearchQuerySlice,
  validateAdvancedFilters,
  validateDateRange,
} from "./reservation-desk-filters.ts";

const helpers = readFileSync(new URL("./reservation-desk-filters.ts", import.meta.url), "utf8");
const calendar = readFileSync(
  new URL("../../components/reservations/booking-calendar.tsx", import.meta.url),
  "utf8",
);
const sheet = readFileSync(
  new URL("../../components/reservations/reservation-desk-more-filters.tsx", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../../components/workspaces/reservations-workspace.tsx", import.meta.url),
  "utf8",
);

describe("Reservation Desk search and advanced filters", () => {
  it("debounces main search at 300ms and does not request on every raw keystroke", () => {
    assert.equal(DESK_SEARCH_DEBOUNCE_MS, 300);
    assert.match(workspace, /debouncedSearch/);
    assert.match(workspace, /DESK_SEARCH_DEBOUNCE_MS/);
    assert.match(workspace, /Search confirmation, guest, phone, email or room/);
  });

  it("maps main search and compact bar through the existing Desk query", () => {
    const slice = toDeskSearchQuerySlice(
      "NR-000",
      {
        ...EMPTY_BAR_FILTERS,
        arrivalFrom: "2026-09-24",
        arrivalTo: "2026-09-25",
        status: "confirmed",
        roomTypeId: "type-1",
        source: "staff",
      },
      EMPTY_ADVANCED_FILTERS,
    );
    assert.equal(slice.search, "NR-000");
    assert.equal(slice.arrivalFrom, "2026-09-24");
    assert.equal(slice.arrivalTo, "2026-09-25");
    assert.deepEqual(slice.statuses, ["confirmed"]);
    assert.equal(slice.roomTypeId, "type-1");
    assert.equal(slice.source, "staff");
    assert.equal(
      toDeskSearchQuerySlice("N", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS).search,
      undefined,
    );
    assert.match(workspace, /arrivalFrom/);
    assert.match(workspace, /Search confirmation, guest, phone, email or room/);
  });

  it("does not apply advanced draft until Apply, and Reset only clears draft", () => {
    assert.match(sheet, /Apply Filters/);
    assert.match(sheet, /onApply\(draft\)/);
    assert.match(sheet, /setDraft\(EMPTY_ADVANCED_FILTERS\)/);
    assert.match(sheet, /if \(open\) setDraft\(applied\)/);
    assert.doesNotMatch(sheet, /Reservation Type/);
    assert.doesNotMatch(helpers, /individual|corporate|walk-in filter/i);
  });

  it("validates arrival and departure ranges without swapping dates", () => {
    assert.equal(validateDateRange("2026-09-24", "2026-09-25", "Arrival From", "Arrival To"), null);
    assert.match(
      validateDateRange("2026-09-25", "2026-09-24", "Arrival From", "Arrival To") ?? "",
      /Arrival To must be on or after Arrival From/,
    );
    assert.match(
      validateAdvancedFilters(
        { ...EMPTY_ADVANCED_FILTERS, departureFrom: "2026-09-26", departureTo: "2026-09-25" },
        "all",
      ) ?? "",
      /Departure To must be on or after Departure From/,
    );
  });

  it("blocks Assigned assignment on the Unassigned operational view", () => {
    assert.match(
      validateAdvancedFilters(
        { ...EMPTY_ADVANCED_FILTERS, assignment: "assigned" },
        "unassigned",
      ) ?? "",
      /Unassigned view cannot combine with Assigned/,
    );
    assert.equal(
      validateAdvancedFilters(
        { ...EMPTY_ADVANCED_FILTERS, assignment: "unassigned" },
        "unassigned",
      ),
      null,
    );
  });

  it("maps supported advanced filters onto the operational search slice", () => {
    const slice = toDeskSearchQuerySlice("  Abebaw  ", EMPTY_BAR_FILTERS, {
      ...EMPTY_ADVANCED_FILTERS,
      vip: "yes",
      assignment: "unassigned",
      departureFrom: "2026-09-24",
      departureTo: "2026-09-26",
      roomId: "room-1",
      ratePlanId: "rate-1",
      companyMasterId: "co-1",
      travelAgentMasterId: "ta-1",
      groupAccountMasterId: "gr-1",
      commercialBookingSource: "direct",
      marketSegment: "business",
    });
    assert.equal(slice.search, "Abebaw");
    assert.equal(slice.vip, true);
    assert.equal(slice.unassigned, true);
    assert.equal(slice.departureFrom, "2026-09-24");
    assert.equal(slice.ratePlanId, "rate-1");
    assert.equal(slice.companyMasterId, "co-1");
    assert.equal(slice.travelAgentMasterId, "ta-1");
    assert.equal(slice.groupAccountMasterId, "gr-1");
    assert.equal(slice.commercialBookingSource, "direct");
    assert.equal(slice.marketSegment, "business");
    assert.equal(
      toDeskSearchQuerySlice("", EMPTY_BAR_FILTERS, {
        ...EMPTY_ADVANCED_FILTERS,
        assignment: "assigned",
      }).unassigned,
      false,
    );
  });

  it("renders chips and updates results when a chip is removed", () => {
    const chips = deskFilterChips(
      {
        arrivalFrom: "2026-09-24",
        arrivalTo: "2026-09-25",
        status: "all",
        roomTypeId: DESK_FILTER_ALL,
        roomTypeName: "",
        source: "all",
      },
      {
        ...EMPTY_ADVANCED_FILTERS,
        vip: "yes",
        assignment: "unassigned",
        companyMasterId: "co-1",
        companyName: "Habesha Beer",
        ratePlanId: "rate-1",
        ratePlanName: "BAR",
      },
    );
    assert.equal(
      chips.some((chip) => chip.label === "VIP"),
      true,
    );
    assert.equal(
      chips.some((chip) => chip.label === "Unassigned"),
      true,
    );
    assert.equal(
      chips.some((chip) => chip.label === "Company: Habesha Beer"),
      true,
    );
    assert.equal(
      chips.some((chip) => chip.label === "Rate Plan: BAR"),
      true,
    );
    assert.equal(
      chips.some((chip) => chip.label.startsWith("Arrival:")),
      true,
    );
    assert.equal(countActiveAdvancedFilters(chips && EMPTY_ADVANCED_FILTERS), 0);
    const applied = {
      ...EMPTY_ADVANCED_FILTERS,
      vip: "yes" as const,
      companyMasterId: "co-1",
      companyName: "Habesha Beer",
    };
    assert.equal(countActiveAdvancedFilters(applied), 2);
    const next = removeDeskFilterChip("vip", EMPTY_BAR_FILTERS, applied);
    assert.equal(next.advanced.vip, "all");
    assert.equal(countActiveAdvancedFilters(next.advanced), 1);
  });

  it("does not count search text or operational view as advanced filters", () => {
    assert.equal(countActiveAdvancedFilters(EMPTY_ADVANCED_FILTERS), 0);
    assert.equal(hasActiveDeskConstraints("NR", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS), true);
    assert.equal(hasActiveDeskConstraints("", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS), false);
    assert.match(workspace, /countActiveAdvancedFilters\(advanced\)/);
    assert.doesNotMatch(helpers, /saved filter|localStorage/i);
  });

  it("Clear resets compact and advanced filters without changing the operational view", () => {
    assert.match(workspace, /function clearFilters/);
    assert.match(workspace, /setAdvanced\(EMPTY_ADVANCED_FILTERS\)/);
    assert.match(workspace, /setSearch\(""\)/);
    assert.doesNotMatch(workspace.slice(workspace.indexOf("function clearFilters")), /setView\(/);
  });

  it("layers VIP on Arrivals through the same Desk query", () => {
    const slice = toDeskSearchQuerySlice("", EMPTY_BAR_FILTERS, {
      ...EMPTY_ADVANCED_FILTERS,
      vip: "yes",
    });
    assert.equal(slice.vip, true);
    assert.match(workspace, /\.\.\.deskQuerySlice/);
    assert.match(workspace, /view,/);
    assert.doesNotMatch(workspace, /\.filter\(\(row\)/);
  });
});

describe("Reservation Desk search date scope", () => {
  const weekStart = "2026-11-09";
  const weekEnd = "2026-11-15";

  it("keeps the visible week while browsing with an empty search", () => {
    assert.deepEqual(deskTableStayWindow("", weekStart, weekEnd), {
      stayOverlapStart: weekStart,
      stayOverlapEnd: weekEnd,
    });
    assert.equal(isDeskServerSearchActive(""), false);
    assert.equal(isDeskServerSearchActive(" "), false);
    assert.equal(toDeskSearchQuerySlice("", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS).search, undefined);
  });

  it("does not widen the week for a one-character search", () => {
    assert.deepEqual(deskTableStayWindow("N", weekStart, weekEnd), {
      stayOverlapStart: weekStart,
      stayOverlapEnd: weekEnd,
    });
    assert.equal(isDeskServerSearchActive("N"), false);
  });

  it("omits the week window for an active confirmation search", () => {
    const window = deskTableStayWindow("NR-000123", weekStart, weekEnd);
    assert.equal("stayOverlapStart" in window, false);
    assert.equal("stayOverlapEnd" in window, false);
    assert.equal(
      toDeskSearchQuerySlice("NR-000123", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS).search,
      "NR-000123",
    );
  });

  it("searches all dates for a guest name", () => {
    const window = deskTableStayWindow("Abel", weekStart, weekEnd);
    assert.deepEqual(window, {});
    assert.equal(
      toDeskSearchQuerySlice("  Abel  ", EMPTY_BAR_FILTERS, EMPTY_ADVANCED_FILTERS).search,
      "Abel",
    );
  });

  it("keeps explicit status and room type filters while searching all dates", () => {
    const slice = toDeskSearchQuerySlice(
      "NR-000123",
      {
        ...EMPTY_BAR_FILTERS,
        status: "confirmed",
        roomTypeId: "type-deluxe",
        roomTypeName: "Deluxe",
      },
      EMPTY_ADVANCED_FILTERS,
    );
    assert.equal(slice.search, "NR-000123");
    assert.deepEqual(slice.statuses, ["confirmed"]);
    assert.equal(slice.roomTypeId, "type-deluxe");
    assert.deepEqual(deskTableStayWindow("NR-000123", weekStart, weekEnd), {});
  });

  it("keeps an explicit arrival range and still drops the hidden week scope", () => {
    const slice = toDeskSearchQuerySlice(
      "Abel",
      { ...EMPTY_BAR_FILTERS, arrivalFrom: "2026-12-01", arrivalTo: "2026-12-07" },
      { ...EMPTY_ADVANCED_FILTERS, departureFrom: "2026-12-08", departureTo: "2026-12-10" },
    );
    assert.equal(slice.search, "Abel");
    assert.equal(slice.arrivalFrom, "2026-12-01");
    assert.equal(slice.arrivalTo, "2026-12-07");
    assert.equal(slice.departureFrom, "2026-12-08");
    assert.equal(slice.departureTo, "2026-12-10");
    assert.equal("stayOverlapStart" in slice, false);
    assert.deepEqual(deskTableStayWindow("Abel", weekStart, weekEnd), {});
  });

  it("applies the week window only on the desk table, not the booking calendar", () => {
    assert.match(workspace, /deskTableStayWindow\(debouncedSearch, tableWeekStart, tableStayEnd\)/);
    assert.match(workspace, /rangeStart: calendarWeekStart/);
    assert.match(workspace, /horizon: calendarHorizon/);
    assert.match(workspace, /No reservations found/);
    assert.doesNotMatch(workspace, /reservation-desk-scope/);
    assert.doesNotMatch(workspace, /Stays: /);
    assert.doesNotMatch(calendar, /deskTableStayWindow/);
    assert.doesNotMatch(calendar, /stayOverlapStart/);
  });

  it("restores the week scope when search is cleared", () => {
    assert.match(workspace, /function clearFilters\(\) \{\s*setSearch\(""\);\s*setDebouncedSearch\(""\);/);
    assert.deepEqual(deskTableStayWindow("", weekStart, weekEnd), {
      stayOverlapStart: weekStart,
      stayOverlapEnd: weekEnd,
    });
    assert.doesNotMatch(workspace, /formatDeskStayScope/);
  });
});

describe("Reservations section menu", () => {
  it("renders the compact section menu instead of a page title or tab row", () => {
    assert.match(workspace, /function ReservationsBurger/);
    assert.match(workspace, /data-testid="reservation-nav-trigger"/);
    assert.match(workspace, /aria-label="Reservations navigation"/);
    assert.doesNotMatch(workspace, /reservation-page-header/);
    assert.doesNotMatch(workspace, /reservation-section-nav/);
    assert.doesNotMatch(
      workspace,
      /Manage bookings, arrivals, groups, waitlist and reservation exceptions/,
    );
    assert.doesNotMatch(workspace, /role="tablist"/);
  });

  it("offers the five sections and switches them through goWorkspaceSection", () => {
    for (const label of [
      "All Reservations",
      "Groups & Blocks",
      "Waitlist",
      "Arrivals & Departures",
      "Exceptions",
    ]) {
      assert.match(workspace, new RegExp(`label: "${label}"`));
    }
    assert.match(workspace, /<ReservationsBurger[\s\S]*onSelect=\{goWorkspaceSection\}/);
    assert.match(workspace, /onSelect\(item\.id\)/);
  });

  it("keeps New Reservation in the toolbar and the section primary slot beside it", () => {
    assert.equal(workspace.match(/data-testid="reservation-new-reservation"/g)?.length, 1);
    assert.match(workspace, /ref=\{setPrimarySlot\}/);
    assert.match(workspace, /ref=\{setToolbarSlot\}/);
  });

  it("selects the existing operational view from the reservation KPI cards", () => {
    assert.match(workspace, /active=\{view === "all"\}[\s\S]*onSelect=\{\(\) => selectView\("all"\)\}/);
    assert.match(workspace, /active=\{view === "arrivals"\}[\s\S]*onSelect=\{\(\) => selectView\("arrivals"\)\}/);
    assert.match(workspace, /active=\{view === "departures"\}[\s\S]*onSelect=\{\(\) => selectView\("departures"\)\}/);
    assert.match(workspace, /active=\{view === "in_house"\}[\s\S]*onSelect=\{\(\) => selectView\("in_house"\)\}/);
    assert.match(workspace, /active=\{view === "unassigned"\}[\s\S]*onSelect=\{\(\) => selectView\("unassigned"\)\}/);
    assert.match(workspace, /label="Available Rooms"[\s\S]{0,240}tone="bg-indigo-50 text-indigo-700"\s*\/>/);
    assert.match(workspace, /function selectView\(next: OperationalReservationView\)/);
    assert.match(workspace, /view,\s*page,/);
    assert.doesNotMatch(workspace, /label="Available Rooms"[\s\S]{0,280}onSelect=/);
  });
});
