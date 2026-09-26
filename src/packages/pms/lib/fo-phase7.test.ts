import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FO_CONTROL_ACTION_LABELS,
  buildFrontOfficeExceptionList,
  filterFrontOfficeExceptions,
  mergeFrontOfficeExceptions,
  type FoControlStayContext,
} from "./fo-control.ts";
import { foGuestServiceSignals } from "./fo-guest-services.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function stay(id: string, extra: Partial<FoControlStayContext> = {}): FoControlStayContext {
  return {
    id,
    guestId: `guest-${id}`,
    guestName: "Ada Smith",
    confirmationNumber: `NORU-${id}`,
    roomId: extra.roomId ?? null,
    roomNumber: extra.roomNumber ?? null,
    status: extra.status ?? "confirmed",
    ...extra,
  };
}

describe("FO Phase 7 — aggregator and ownership", () => {
  it("normalizes existing signals through getFrontOfficeExceptions", () => {
    const fns = readRel("./fo-control.functions.ts");
    const frame = readRel("../components/frontoffice/fo-exceptions-frame.tsx");
    assert.match(fns, /export const getFrontOfficeExceptions/);
    assert.match(fns, /foArrivalExceptionKeys/);
    assert.match(fns, /foInHouseExceptionKeys/);
    assert.match(fns, /foDepartureExceptionKeys/);
    assert.match(fns, /loadFrontOfficeRoomOpsQueue/);
    assert.match(fns, /foGuestServiceSignals/);
    assert.match(fns, /requireReservationManager/);
    assert.match(frame, /getFrontOfficeExceptions/);
    assert.doesNotMatch(fns, /listArrivals\(/);
  });

  it("does not persist exceptions or add resolve/dismiss/HK/folio/GS writers", () => {
    const fns = readRel("./fo-control.functions.ts");
    const control = readRel("./fo-control.ts");
    const frame = readRel("../components/frontoffice/fo-exceptions-frame.tsx");
    for (const src of [fns, control, frame]) {
      assert.doesNotMatch(src, /CREATE TABLE/i);
      assert.doesNotMatch(src, /fo_exceptions|exception_queue/);
      assert.doesNotMatch(src, /resolveDiscrepancy/);
      assert.doesNotMatch(src, /\bDismiss\b|\bResolve\b/);
      assert.doesNotMatch(src, /from\("hotel_rooms"\)\.update/);
      assert.doesNotMatch(src, /folio_transactions/);
      assert.doesNotMatch(src, /createGuestServiceRequest/);
    }
    const repoRoot = join(here, "../../../..");
    const extra = [...readdirSync(join(repoRoot, "drizzle/migrations")), ...readdirSync(join(repoRoot, "supabase/migrations"))].filter(
      (name) => name.startsWith("0101_") || name.startsWith("0102_"),
    );
    assert.equal(extra.length, 0);
  });
});

describe("FO Phase 7 — derived items", () => {
  it("creates unassigned arrival, room not ready, and deposit blockers", () => {
    const items = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [
        { stay: stay("a1"), keys: ["unassigned"] },
        { stay: stay("a2", { roomId: "r1", roomNumber: "101" }), keys: ["room_not_ready", "payment_issue"] },
      ],
      inHouse: [],
      departures: [],
      guestServices: [],
      roomOps: [],
    });
    assert.equal(items.some((row) => row.key === "unassigned" && row.actionHint === "assign_room"), true);
    assert.equal(items.some((row) => row.key === "room_not_ready" && row.actionHint === "open_housekeeping"), true);
    assert.equal(items.some((row) => row.key === "payment_issue" && row.actionHint === "open_folio"), true);
    assert.equal(FO_CONTROL_ACTION_LABELS.assign_room, "Assign Room");
  });

  it("maps in-house OOO/maintenance and departure settlement", () => {
    const items = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [],
      inHouse: [
        {
          stay: stay("i1", { status: "checked_in", roomId: "r2", roomNumber: "202" }),
          keys: ["room_unavailable", "maintenance"],
        },
      ],
      departures: [
        {
          stay: stay("d1", { status: "checked_in", roomId: "r3", roomNumber: "303" }),
          keys: ["unsettled_folio"],
        },
      ],
      guestServices: [],
      roomOps: [],
    });
    assert.equal(items.some((row) => row.key === "room_unavailable" && row.ownerModule === "room_inventory"), true);
    assert.equal(items.some((row) => row.key === "maintenance" && row.actionHint === "open_maintenance"), true);
    assert.equal(items.some((row) => row.key === "unsettled_folio" && row.actionHint === "open_folio"), true);
  });

  it("maps urgent guest requests from Phase 6 signals", () => {
    const signals = foGuestServiceSignals(
      [{ status: "requested", priority: "urgent", preferredAt: null }],
      Date.now(),
    );
    const items = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [],
      inHouse: [],
      departures: [],
      guestServices: [{ stay: stay("g1", { status: "checked_in" }), signals }],
      roomOps: [],
    });
    assert.equal(items.some((row) => row.key === "urgent_guest_request" && row.actionHint === "open_guest_services"), true);
  });

  it("deduplicates the same stay+key and room-not-ready from room ops", () => {
    const merged = mergeFrontOfficeExceptions(
      buildFrontOfficeExceptionList({
        businessDate: "2026-09-26",
        arrivals: [{ stay: stay("a1", { roomId: "r1", roomNumber: "101" }), keys: ["room_not_ready"] }],
        inHouse: [],
        departures: [],
        guestServices: [],
        roomOps: [
          {
            id: "assigned_not_ready:a1",
            kind: "assigned_not_ready",
            label: "Assigned room not ready",
            reason: "Dirty",
            roomId: "r1",
            roomNumber: "101",
            stayId: "a1",
            guestName: "Ada Smith",
            confirmationNumber: "NORU-a1",
          },
        ],
      }),
    );
    assert.equal(merged.filter((row) => row.key === "room_not_ready").length, 1);
  });

  it("drops an exception when the source signal disappears", () => {
    const withIssue = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [{ stay: stay("a1"), keys: ["unassigned"] }],
      inHouse: [],
      departures: [],
      guestServices: [],
      roomOps: [],
    });
    const without = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [{ stay: stay("a1"), keys: [] }],
      inHouse: [],
      departures: [],
      guestServices: [],
      roomOps: [],
    });
    assert.equal(withIssue.length, 1);
    assert.equal(without.length, 0);
  });

  it("filters by guest/confirmation/room and severity", () => {
    const items = buildFrontOfficeExceptionList({
      businessDate: "2026-09-26",
      arrivals: [
        { stay: stay("a1", { guestName: "Ada Smith", confirmationNumber: "NORU-1", roomNumber: "101" }), keys: ["unassigned"] },
      ],
      inHouse: [],
      departures: [],
      guestServices: [],
      roomOps: [],
    });
    assert.equal(filterFrontOfficeExceptions(items, { search: "noru-1" }).length, 1);
    assert.equal(filterFrontOfficeExceptions(items, { search: "zzz" }).length, 0);
    assert.equal(filterFrontOfficeExceptions(items, { severity: "critical" }).length, 1);
    assert.equal(filterFrontOfficeExceptions(items, { severity: "info" }).length, 0);
  });
});
