import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { belongsToBusinessDate, propertyDayBounds } from "./cashiering-control.ts";
import { classifyIssuedGuestInvoice } from "./cashiering-guest-allocation.ts";
import {
  buildNa1Blockers,
  canEnableConfirm,
  closeBlockingExceptions,
  emptyIntegrityCounts,
  nightAuditFeedCounts,
  nightAuditOtbNotice,
  summaryRoomUnitCount,
  warningExceptionsForRun,
  NIGHT_AUDIT_OTB_FAILED_NOTICE,
} from "./na1.ts";
import { planExceptionSync } from "./night-audit-exceptions.ts";
import { selectAll } from "./night-audit-read.ts";
import {
  housekeepingNightAuditExceptions,
  NIGHT_AUDIT_IN_HOUSE_GRAIN,
  roomUnitIntegrityExceptions,
} from "./night-audit-rooms.ts";
import { folioLedgerExceptions, settlementIntegrityExceptions } from "./night-audit-settlement.ts";
import { expandStayRooms } from "./reservation-room-units.ts";
import { propertyToday } from "../../../shared/lib/property-dates.ts";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date.ts";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const server = read("./nightaudit.server.ts");
const functions = read("./nightaudit.functions.ts");
const na1Server = read("./na1.server.ts");
const card1 = read("./pms-property-setup-card1.functions.ts");
const reservations = read("./reservations.functions.ts");
const workspace = read("../components/workspaces/night-audit-workspace.tsx");
const calendar = read("../components/rooms/room-inventory-calendar.tsx");
const availability = read("../components/rooms/room-inventory-availability.tsx");
const blocks = read("../components/rooms/room-inventory-blocks.tsx");
const rules = read("../components/rooms/room-inventory-rules.tsx");
const sql = read("../../../../supabase/migrations/0115_night_audit_phase0_close_guard.sql");

const ADDIS = "Africa/Addis_Ababa";

function clearBoard() {
  return buildNa1Blockers({
    businessDate: "2026-10-21",
    arrivalsPendingCount: 0,
    overstayCount: 0,
    unpaidFolios: { lane: "live", count: 0 },
    openShift: { tillUsed: true, openCount: 0 },
    hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
    integrity: emptyIntegrityCounts(),
  });
}

function invoice(partial: {
  id?: string;
  folioId?: string;
  total?: number;
  notes?: number[];
  payment?: number;
  deposit?: number;
  cashDebit?: number;
}) {
  return {
    id: partial.id ?? "inv-1",
    folioId: partial.folioId ?? "folio-1",
    number: "INV-1",
    eligible: true,
    invoiceTotal: partial.total ?? 5000,
    noteDeltas: partial.notes ?? [],
    paymentAllocated: partial.payment ?? 0,
    depositApplied: partial.deposit ?? 0,
    cashDebitCovered: partial.cashDebit ?? 0,
  };
}

describe("NA-P1 date and ownership", () => {
  it("uses property-local midnight bounds for Addis Ababa", () => {
    const bounds = propertyDayBounds("2026-10-21", ADDIS);
    assert.equal(bounds.startIso, "2026-10-20T21:00:00.000Z");
    assert.equal(bounds.endIso, "2026-10-21T21:00:00.000Z");
    assert.equal(belongsToBusinessDate("2026-10-20T21:00:00.000Z", "2026-10-21", ADDIS), true);
    assert.equal(belongsToBusinessDate("2026-10-21T20:59:59.000Z", "2026-10-21", ADDIS), true);
    assert.equal(belongsToBusinessDate("2026-10-21T21:00:00.000Z", "2026-10-21", ADDIS), false);
  });

  it("keeps a persisted business date behind the wall clock", () => {
    assert.equal(resolvePropertyBusinessDate("2026-10-21", ADDIS), "2026-10-21");
    assert.notEqual(resolvePropertyBusinessDate("2026-10-21", ADDIS), "2026-10-22");
  });

  it("derives property-local today only when the business date is null", () => {
    assert.equal(resolvePropertyBusinessDate(null, ADDIS), propertyToday(ADDIS));
    assert.match(resolvePropertyBusinessDate(null, ADDIS), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not read dayBoundary, the audit window, or automatic rollover", () => {
    for (const source of [server, functions, na1Server]) {
      assert.doesNotMatch(source, /dayBoundary/);
      assert.doesNotMatch(source, /nightAuditWindow/);
      assert.doesNotMatch(source, /automaticRollover/);
      assert.doesNotMatch(source, /approvalRequired/);
      assert.doesNotMatch(source, /lockDuringAudit/);
    }
    assert.match(server, /propertyDayBounds\(businessDate, timezone\)/);
    assert.match(server, /belongsToBusinessDate\(t\.posted_at, businessDate, timezone\)/);
    assert.doesNotMatch(server, /\$\{businessDate\}T00:00:00/);
  });

  it("lets only close_business_date advance the business date", () => {
    assert.match(sql, /IF _house_date IS NOT NULL AND _house_date <> _run\.business_date/);
    assert.match(sql, /SET business_date = _run\.business_date \+ 1/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.close_business_date/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.close_business_date/);
    assert.match(sql, /TO service_role/);
    assert.match(functions, /rpc\("close_business_date"/);
    assert.match(functions, /requireCashierManager/);
    assert.doesNotMatch(functions, /update\(\{[^}]*business_date/);
    assert.match(card1, /if \("business_date" in patch\) delete patch\.business_date/);
    assert.match(reservations, /resolvePropertyBusinessDate\(/);
    assert.doesNotMatch(reservations, /propertyToday\(timezone/);
  });

  it("waits for the house date before painting room inventory dates", () => {
    for (const source of [calendar, availability, blocks]) {
      assert.doesNotMatch(source, /useState\(today\(\)\)/);
      assert.doesNotMatch(source, /new Date\(\)/);
    }
    assert.match(calendar, /Loading the property business date/);
    assert.match(rules, /useState<string \| null>\(null\)/);
    assert.match(rules, /enabled: Boolean\(night\)/);
  });
});

describe("NA-P1 settlement", () => {
  it("treats payment, deposit, and mixed cover as settled", () => {
    const paid = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [],
      paymentAllocated: 5000,
      depositApplied: 0,
      cashDebitCovered: 0,
    });
    const deposit = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [],
      paymentAllocated: 0,
      depositApplied: 5000,
      cashDebitCovered: 0,
    });
    const mixed = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [],
      paymentAllocated: 2000,
      depositApplied: 3000,
      cashDebitCovered: 0,
    });
    assert.equal(paid.outstanding, 0);
    assert.equal(deposit.outstanding, 0);
    assert.equal(deposit.settlementState, "PAID");
    assert.equal(mixed.outstanding, 0);
    const findings = settlementIntegrityExceptions({
      folios: [{ id: "folio-1", number: "F-1", balance: 0 }],
      invoices: [invoice({ deposit: 5000 })],
      payments: [],
      allocations: [{ id: "dep-1", invoiceId: "inv-1", amount: 5000 }],
    });
    assert.equal(findings.length, 0);
  });

  it("inherits credit and debit note deltas from the cashiering classifier", () => {
    const credit = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [-1000],
      paymentAllocated: 4000,
      depositApplied: 0,
      cashDebitCovered: 0,
    });
    const debit = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [500],
      paymentAllocated: 5500,
      depositApplied: 0,
      cashDebitCovered: 0,
    });
    const debitOpen = classifyIssuedGuestInvoice({
      eligible: true,
      invoiceTotal: 5000,
      noteDeltas: [500],
      paymentAllocated: 5000,
      depositApplied: 0,
      cashDebitCovered: 0,
    });
    assert.equal(credit.outstanding, 0);
    assert.equal(debit.outstanding, 0);
    assert.equal(debitOpen.outstanding, 500);
    const blocked = settlementIntegrityExceptions({
      folios: [{ id: "folio-1", number: "F-1", balance: 0 }],
      invoices: [invoice({ notes: [500], payment: 5000 })],
      payments: [],
      allocations: [],
    });
    assert.equal(blocked[0]?.exceptionType, "folio_invoice_contradiction");
  });

  it("warns on an open in-house balance and blocks a closed imbalance", () => {
    const open = folioLedgerExceptions({
      folios: [{ id: "folio-1", number: "F-1", status: "open", closedAt: null }],
      transactions: [
        {
          folioId: "folio-1",
          amount: 4500,
          postedAt: "2026-10-21T08:00:00.000Z",
          referenceType: null,
          referenceId: null,
        },
      ],
      missingFolios: [],
    });
    assert.equal(open.exceptions.length, 1);
    assert.equal(open.exceptions[0]?.exceptionType, "open_folio_balance");
    assert.equal(open.exceptions[0]?.severity, "warning");
    const closed = folioLedgerExceptions({
      folios: [{ id: "folio-1", number: "F-1", status: "closed", closedAt: "2026-10-21T18:00:00.000Z" }],
      transactions: [
        {
          folioId: "folio-1",
          amount: 4500,
          postedAt: "2026-10-21T08:00:00.000Z",
          referenceType: null,
          referenceId: null,
        },
      ],
      missingFolios: [],
    });
    assert.equal(closed.exceptions[0]?.exceptionType, "closed_folio_nonzero_balance");
    assert.equal(closed.exceptions[0]?.severity, "blocking");
    const warnings = warningExceptionsForRun(open.exceptions);
    assert.equal(warnings[0]?.severity, "warning");
    assert.equal(
      closeBlockingExceptions(clearBoard(), warnings).some(
        (row) => row.exceptionType === "open_folio_balance",
      ),
      false,
    );
  });

  it("blocks settlement contradictions, over-allocation, and orphan allocations", () => {
    const contradiction = settlementIntegrityExceptions({
      folios: [{ id: "folio-1", number: "F-1", balance: 0 }],
      invoices: [invoice({ payment: 0 })],
      payments: [{ id: "pay-1", face: 100, refunded: 0, allocated: 150 }],
      allocations: [{ id: "orphan-1", invoiceId: "missing-invoice", amount: 10 }],
    });
    const types = contradiction.map((row) => row.exceptionType);
    assert.ok(types.includes("folio_invoice_contradiction"));
    assert.ok(types.includes("allocation_exceeds_source"));
    assert.ok(types.includes("orphan_allocation"));
    const unallocated = settlementIntegrityExceptions({
      folios: [{ id: "folio-1", number: "F-1", balance: 5000 }],
      invoices: [invoice({ payment: 0 })],
      payments: [{ id: "pay-1", face: 5000, refunded: 0, allocated: 0 }],
      allocations: [],
    });
    assert.equal(unallocated.length, 0);
  });
});

describe("NA-P1 room units", () => {
  it("uses room units and does not let the header room hide a sibling", () => {
    assert.equal(NIGHT_AUDIT_IN_HOUSE_GRAIN, "checked_in_reservation_room_units");
    const stays = expandStayRooms(
      [
        {
          id: "res-1",
          roomId: "header-room",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
        },
      ],
      [
        {
          reservationId: "res-1",
          roomId: "room-a",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
          unitSequence: 1,
        },
        {
          reservationId: "res-1",
          roomId: null,
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
          unitSequence: 2,
        },
      ],
    );
    assert.equal(stays.length, 2);
    assert.equal(
      stays.some((stay) => stay.roomId === "header-room"),
      false,
    );
    const findings = roomUnitIntegrityExceptions({
      stays,
      reservations: [{ id: "res-1", confirmationNumber: "NORU-1" }],
      rooms: [{ id: "room-a", roomNumber: "101", status: "occupied" }],
    });
    assert.equal(findings.filter((row) => row.exceptionType === "checked_in_without_room").length, 1);
    assert.equal(summaryRoomUnitCount({ inHouse: stays.length, overstays: 0 }), 2);
  });

  it("blocks double occupancy and occupied OOO or OOS units, not ended units", () => {
    const active = expandStayRooms(
      [
        {
          id: "res-1",
          roomId: null,
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
        },
        {
          id: "res-2",
          roomId: null,
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
        },
      ],
      [
        {
          reservationId: "res-1",
          roomId: "room-a",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
          unitSequence: 1,
        },
        {
          reservationId: "res-2",
          roomId: "room-a",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
          unitSequence: 1,
        },
        {
          reservationId: "res-2",
          roomId: "room-a",
          status: "cancelled",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-22",
          unitSequence: 2,
        },
      ],
    );
    assert.equal(active.length, 2);
    const shared = roomUnitIntegrityExceptions({
      stays: active,
      reservations: [
        { id: "res-1", confirmationNumber: "A" },
        { id: "res-2", confirmationNumber: "B" },
      ],
      rooms: [{ id: "room-a", roomNumber: "101", status: "out_of_order" }],
    });
    assert.ok(shared.some((row) => row.exceptionType === "room_double_occupancy"));
    assert.ok(shared.some((row) => row.exceptionType === "occupied_restricted_room"));
    const oos = roomUnitIntegrityExceptions({
      stays: active.filter((stay) => stay.reservationId === "res-1"),
      reservations: [{ id: "res-1", confirmationNumber: "A" }],
      rooms: [{ id: "room-a", roomNumber: "101", status: "out_of_service" }],
    });
    assert.equal(oos[0]?.exceptionType, "occupied_restricted_room");
  });

  it("blocks an occupied discrepancy and warns on vacant dirty without a task", () => {
    const group = expandStayRooms(
      [
        {
          id: "group-1",
          roomId: "lead",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-23",
        },
        {
          id: "group-2",
          roomId: "lead",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-23",
        },
      ],
      [
        {
          reservationId: "group-1",
          roomId: "room-1",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-23",
          unitSequence: 1,
        },
        {
          reservationId: "group-2",
          roomId: "room-2",
          status: "checked_in",
          arrivalDate: "2026-10-20",
          departureDate: "2026-10-23",
          unitSequence: 1,
        },
      ],
    );
    assert.deepEqual(
      group.map((stay) => stay.roomId),
      ["room-1", "room-2"],
    );
    const housekeeping = housekeepingNightAuditExceptions({
      rooms: [
        {
          id: "room-1",
          roomNumber: "201",
          status: "occupied",
          housekeepingStatus: "dirty",
          restrictionReason: null,
          active: true,
        },
        {
          id: "room-9",
          roomNumber: "209",
          status: "vacant",
          housekeepingStatus: "dirty",
          restrictionReason: null,
          active: true,
        },
      ],
      occupiedRoomIds: new Set(["room-1"]),
      openTaskRoomIds: new Set(),
      discrepancies: [
        { roomId: "room-1", status: "open" },
        { roomId: "room-9", status: "open" },
      ],
    });
    assert.equal(
      housekeeping.filter((row) => row.exceptionType === "hk_conflict").length,
      1,
    );
    assert.equal(housekeeping.find((row) => row.exceptionType === "hk_conflict")?.severity, "blocking");
    assert.equal(
      housekeeping.find((row) => row.exceptionType === "dirty_room_without_task")?.severity,
      "warning",
    );
    assert.match(read("./fo-exceptions.ts"), /return status === "open" \|\| status === "unresolved"/);
  });
});

describe("NA-P1 summary, close, and completeness", () => {
  it("keeps in-house and overstay counts separate, including old summaries", () => {
    assert.equal(summaryRoomUnitCount({ inHouse: 12, overstays: 2 }), 12);
    assert.equal(summaryRoomUnitCount({ inHouse: 2 }), null);
    assert.match(functions, /inHouse: evaluation\.inHouseUnits/);
    assert.match(functions, /overstays: evaluation\.overstays\.length/);
    assert.match(server, /inHouseUnits: stayRooms\.length/);
  });

  it("reports OTB failure without treating the close as failed", () => {
    assert.equal(nightAuditOtbNotice("failed"), NIGHT_AUDIT_OTB_FAILED_NOTICE);
    assert.equal(nightAuditOtbNotice("captured"), null);
    assert.equal(nightAuditOtbNotice("already_present"), null);
    assert.match(workspace, /nightAuditOtbNotice\(result\.otbSnapshotStatus\)/);
    assert.match(workspace, /queryFn: \(\) => run\(\{ data: \{ restaurantId \} \}\)/);
    const rpcAt = functions.indexOf('rpc("close_business_date"');
    const otbAt = functions.indexOf("captureOtbAfterClose", rpcAt);
    assert.ok(rpcAt > 0 && otbAt > rpcAt);
    assert.match(functions, /Never roll back a completed close/);
  });

  it("stamps front-office links with the audit business date", () => {
    const rows = buildNa1Blockers({
      businessDate: "2026-10-21",
      arrivalsPendingCount: 1,
      overstayCount: 0,
      unpaidFolios: { lane: "live", count: 0 },
      openShift: { tillUsed: false, openCount: 0 },
      hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
      integrity: emptyIntegrityCounts(),
    });
    const link = rows.find((row) => row.id === "arrivals_pending")?.clear[0];
    assert.equal(link?.search?.date, "2026-10-21");
  });

  it("does not turn a failed housekeeping read or a short page into a pass", async () => {
    const failed = buildNa1Blockers({
      arrivalsPendingCount: 0,
      overstayCount: 0,
      unpaidFolios: { lane: "unavailable", count: 0 },
      openShift: { tillUsed: false, openCount: 0 },
      hkConflict: { discrepancyLane: "unavailable", discrepancyCount: 0, roomUnavailableCount: 0 },
      integrity: emptyIntegrityCounts(),
    });
    assert.equal(failed.find((row) => row.id === "hk_conflict")?.state, "unavailable");
    assert.equal(canEnableConfirm(failed), false);
    assert.equal(canEnableConfirm(clearBoard()), true);
    await assert.rejects(() => selectAll(async () => ({ data: null, error: { message: "db down" } })));
    const many = await selectAll<number>(async (from) => {
      if (from >= 2000) return { data: [], error: null };
      return { data: Array.from({ length: 1000 }, (_, index) => from + index), error: null };
    });
    assert.equal(many.length, 2000);
    const blockers = Array.from({ length: 1001 }, () => ({
      exceptionType: "folio_invoice_contradiction",
    }));
    assert.equal(nightAuditFeedCounts(blockers).settlementBlockers, 1001);
    assert.equal(nightAuditFeedCounts(blockers.slice(0, 25)).settlementBlockers, 25);
    const board = buildNa1Blockers({
      arrivalsPendingCount: 1842,
      overstayCount: 0,
      unpaidFolios: { lane: "live", count: nightAuditFeedCounts(blockers).settlementBlockers },
      openShift: { tillUsed: true, openCount: 0 },
      hkConflict: { discrepancyLane: "live", discrepancyCount: 0, roomUnavailableCount: 0 },
      integrity: emptyIntegrityCounts(),
    });
    assert.equal(board.find((row) => row.id === "arrivals_pending")?.count, 1842);
    assert.equal(board.find((row) => row.id === "unpaid_folios")?.count, 1001);
  });

  it("inserts, resolves, reopens, and does not duplicate exceptions", () => {
    const derived = [
      {
        exceptionType: "overstay",
        severity: "blocking" as const,
        referenceType: "reservation",
        referenceId: "stay-1",
        message: "Still in house.",
      },
    ];
    const first = planExceptionSync([], derived);
    assert.equal(first.inserts.length, 1);
    assert.equal(first.resolveIds.length, 0);
    const stored = {
      id: "ex-1",
      exceptionType: "overstay",
      severity: "blocking" as const,
      referenceId: "stay-1",
      message: "Still in house.",
      status: "open" as const,
    };
    const again = planExceptionSync([stored], derived);
    assert.equal(again.inserts.length, 0);
    assert.equal(again.updates.length, 0);
    const cleared = planExceptionSync([stored], []);
    assert.deepEqual(cleared.resolveIds, ["ex-1"]);
    const reopened = planExceptionSync([{ ...stored, status: "resolved" }], derived);
    assert.equal(reopened.updates[0]?.reopen, true);
    const ignored = planExceptionSync([{ ...stored, status: "ignored" }], derived);
    assert.equal(ignored.updates[0]?.reopen, true);
    assert.match(functions, /This integrity exception can't be ignored/);
    assert.match(na1Server, /if \(drawerResult\.error\) throw new Error/);
    assert.match(server, /if \(shiftResult\.error\) throw new Error/);
  });
});
