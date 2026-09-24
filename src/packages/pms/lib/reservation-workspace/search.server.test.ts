import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolvePropertyBusinessDate } from "./business-date.ts";
import {
  OPERATIONAL_RESERVATION_DEFAULT_PAGE_SIZE,
  OPERATIONAL_RESERVATION_MAX_PAGE_SIZE,
  effectiveOperationalStatuses,
  normalizeOperationalSearchTerm,
  operationalReservationSearchInputSchema,
  operationalViewStatuses,
  toReservationOperationalSummary,
} from "./search.server.ts";
import {
  OPERATIONAL_RESERVATION_SORT_FIELDS,
  OPERATIONAL_RESERVATION_VIEWS,
} from "./shared-read-models.ts";

const source = readFileSync(new URL("./search.server.ts", import.meta.url), "utf8");

const completeRow = {
  id: "00000000-0000-4000-8000-000000000001",
  confirmation_number: "NORU-2401",
  arrival_date: "2026-09-23",
  departure_date: "2026-09-26",
  adults: 2,
  children: 1,
  status: "confirmed",
  source: "staff",
  room_type_id: "00000000-0000-4000-8000-000000000002",
  room_id: "00000000-0000-4000-8000-000000000003",
  guest_id: "00000000-0000-4000-8000-000000000004",
  rate_plan_id: "00000000-0000-4000-8000-000000000005",
  room_subtotal: 450,
  currency: "GBP",
  company_master_id: "00000000-0000-4000-8000-000000000006",
  travel_agent_master_id: "00000000-0000-4000-8000-000000000007",
  group_account_master_id: "00000000-0000-4000-8000-000000000008",
  commercial_booking_source: "corporate",
  market_segment: "business",
  external_reference: "EXT-22",
  guarantee_method: "card",
  special_requests: "High floor",
  notes: "Late arrival",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-22T10:00:00Z",
  guest_profiles: {
    first_name: "Ada",
    last_name: "Lovelace",
    phone: "+44 20 0000 0000",
    email: "ada@example.test",
    vip_status: true,
  },
  room_types: { name: "Deluxe King" },
  hotel_rooms: { room_number: "404" },
  rate_plan: { name: "Flexible" },
  company: { name: "Analytical Engines Ltd" },
  travel_agent: { name: "North Star Travel" },
  group_account: { name: "Autumn Conference" },
};

describe("DB-04I-01 shared operational Reservation read model", () => {
  it("exposes only the approved operational views and sort fields", () => {
    assert.deepEqual(
      [...OPERATIONAL_RESERVATION_VIEWS],
      ["all", "arrivals", "departures", "in_house", "unassigned", "pending", "groups"],
    );
    assert.deepEqual(
      [...OPERATIONAL_RESERVATION_SORT_FIELDS],
      ["arrival_date", "departure_date", "confirmation_number", "created_at"],
    );
    assert.doesNotMatch(source, /waitlist/i);
  });

  it("uses property business date and preserves the established timezone fallback", () => {
    assert.equal(resolvePropertyBusinessDate("2026-09-30", "Pacific/Auckland"), "2026-09-30");
    assert.match(source, /\.select\("business_date, timezone"\)/);
    assert.match(source, /resolvePropertyBusinessDate/);
  });

  it("locks view status semantics and intersects explicit status filters", () => {
    assert.deepEqual(operationalViewStatuses("arrivals"), ["pending", "confirmed"]);
    assert.deepEqual(operationalViewStatuses("departures"), ["confirmed", "checked_in"]);
    assert.deepEqual(operationalViewStatuses("in_house"), ["checked_in"]);
    assert.deepEqual(operationalViewStatuses("unassigned"), ["pending", "confirmed"]);
    assert.deepEqual(operationalViewStatuses("pending"), ["pending"]);
    assert.deepEqual(operationalViewStatuses("groups"), ["pending", "confirmed", "checked_in"]);
    assert.equal(operationalViewStatuses("all"), null);
    assert.deepEqual(effectiveOperationalStatuses("arrivals", ["confirmed", "checked_in"]), [
      "confirmed",
    ]);
    assert.deepEqual(effectiveOperationalStatuses("departures", ["checked_out"]), []);
  });

  it("applies business-date view predicates on the server", () => {
    assert.match(source, /view === "arrivals"[\s\S]*\.eq\("arrival_date", businessDate\)/);
    assert.match(source, /view === "departures"[\s\S]*\.eq\("departure_date", businessDate\)/);
    assert.match(source, /view === "unassigned"[\s\S]*\.is\("room_id", null\)/);
    assert.match(source, /view === "groups"[\s\S]*\.not\("group_account_master_id", "is", null\)/);
  });

  it("validates every current supported filter and rejects incomplete overlap ranges", () => {
    const parsed = operationalReservationSearchInputSchema.parse({
      restaurantId: "00000000-0000-4000-8000-000000000001",
      search: "NORU-",
      statuses: ["pending", "confirmed"],
      arrivalFrom: "2026-09-01",
      arrivalTo: "2026-09-30",
      departureFrom: "2026-09-02",
      departureTo: "2026-10-01",
      stayOverlapStart: "2026-09-10",
      stayOverlapEnd: "2026-09-17",
      roomTypeId: "00000000-0000-4000-8000-000000000002",
      roomId: "00000000-0000-4000-8000-000000000003",
      unassigned: false,
      guestId: "00000000-0000-4000-8000-000000000004",
      vip: true,
      source: "staff",
      commercialBookingSource: "corporate",
      marketSegment: "business",
      ratePlanId: "00000000-0000-4000-8000-000000000005",
      companyMasterId: "00000000-0000-4000-8000-000000000006",
      travelAgentMasterId: "00000000-0000-4000-8000-000000000007",
      groupAccountMasterId: "00000000-0000-4000-8000-000000000008",
      page: 2,
      pageSize: 100,
      sortBy: "created_at",
      sortDirection: "desc",
    });
    assert.equal(parsed.pageSize, 100);
    assert.throws(() =>
      operationalReservationSearchInputSchema.parse({
        restaurantId: "00000000-0000-4000-8000-000000000001",
        stayOverlapStart: "2026-09-10",
      }),
    );
    assert.throws(() =>
      operationalReservationSearchInputSchema.parse({
        restaurantId: "00000000-0000-4000-8000-000000000001",
        pageSize: 101,
      }),
    );
  });

  it("performs tenant-scoped full-result search for confirmation, guest, phone/email and room", () => {
    assert.equal(normalizeOperationalSearchTerm(`  NORU-24,("%_  `), "NORU-24");
    assert.match(source, /confirmation_number\.eq\.\$\{term\}/);
    assert.match(source, /confirmation_number\.ilike\.\$\{term\}%/);
    assert.match(source, /external_reference\.ilike\.\$\{term\}%/);
    assert.match(source, /first_name\.ilike/);
    assert.match(source, /last_name\.ilike/);
    assert.match(source, /phone\.ilike/);
    assert.match(source, /email\.ilike/);
    assert.match(source, /\.ilike\("room_number", `\$\{term\}%`\)/);
    assert.match(source, /guest_id\.in/);
    assert.match(source, /room_id\.in/);
    assert.doesNotMatch(source, /if \(term && list\.length === 0\)/);

    for (const table of ["guest_profiles", "hotel_rooms", "hotel_reservations"]) {
      const tableStart = source.indexOf(`.from("${table}")`);
      assert.ok(tableStart >= 0);
      assert.match(source.slice(tableStart, tableStart + 700), /\.eq\("restaurant_id",/);
    }
  });

  it("maps relational enrichment in one page query with no per-row reads", () => {
    const row = toReservationOperationalSummary(completeRow as never);
    assert.equal(row.guestName, "Ada Lovelace");
    assert.equal(row.guestVip, true);
    assert.equal(row.roomNumber, "404");
    assert.equal(row.roomTypeName, "Deluxe King");
    assert.equal(row.ratePlanName, "Flexible");
    assert.equal(row.companyName, "Analytical Engines Ltd");
    assert.equal(row.travelAgentName, "North Star Travel");
    assert.equal(row.groupName, "Autumn Conference");
    assert.equal(row.nights, 3);

    assert.match(source, /rate_plan:hotel_rate_plans!/);
    assert.match(source, /company:guest_account_masters!/);
    assert.match(source, /travel_agent:guest_account_masters!/);
    assert.match(source, /group_account:guest_account_masters!/);
    assert.doesNotMatch(source, /getReservationGuestMasters/);
    assert.doesNotMatch(source, /guest_folios|folio_transactions|pms_evaluate_room_assignment/);
  });

  it("preserves honest nulls for unpriced, unassigned and Section 7-held rows", () => {
    const row = toReservationOperationalSummary({
      ...completeRow,
      room_id: null,
      hotel_rooms: null,
      rate_plan_id: null,
      rate_plan: null,
      room_subtotal: null,
      currency: null,
      company_master_id: null,
      company: null,
      travel_agent_master_id: null,
      travel_agent: null,
      group_account_master_id: null,
      group_account: null,
      commercial_booking_source: null,
      market_segment: null,
      external_reference: null,
      guarantee_method: null,
      notes: null,
    } as never);
    assert.equal(row.roomId, null);
    assert.equal(row.roomNumber, null);
    assert.equal(row.ratePlanName, null);
    assert.equal(row.roomSubtotal, null);
    assert.equal(row.commercialBookingSource, null);
    assert.equal(row.guaranteeMethod, null);
    assert.equal(row.notes, null);
  });

  it("uses bounded offset pagination and returns total plus hasMore", () => {
    assert.equal(OPERATIONAL_RESERVATION_DEFAULT_PAGE_SIZE, 25);
    assert.equal(OPERATIONAL_RESERVATION_MAX_PAGE_SIZE, 100);
    assert.match(source, /\.select\(OPERATIONAL_RESERVATION_SELECT, \{ count: "exact" \}\)/);
    assert.match(source, /\.range\(from, from \+ pageSize - 1\)/);
    assert.match(source, /hasMore: from \+ rows\.length < total/);
    assert.match(source, /\.order\(sortBy, \{ ascending \}\)/);
    assert.match(source, /\.order\("id", \{ ascending: true \}\)/);
  });
});
