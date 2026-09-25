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
  hasActiveDeskConstraints,
  removeDeskFilterChip,
  toDeskSearchQuerySlice,
  validateAdvancedFilters,
  validateDateRange,
} from "./reservation-desk-filters.ts";

const helpers = readFileSync(new URL("./reservation-desk-filters.ts", import.meta.url), "utf8");
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
    assert.match(workspace, /placeholder="Confirmation, guest, phone, email or room"/);
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
    assert.match(workspace, /Confirmation, guest, phone, email or room/);
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
