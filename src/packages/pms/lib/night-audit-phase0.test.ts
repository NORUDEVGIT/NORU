import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  NA1_STALE_BUSINESS_DATE,
  buildNa1Blockers,
  canEnableConfirm,
  closeBlockingExceptions,
  emptyIntegrityCounts,
  integrityBlockerCounts,
  persistedNightAuditExceptions,
  remainingBlockerCount,
  type NaDerivedException,
} from "./na1.ts";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0115_night_audit_phase0_close_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0115_night_audit_phase0_close_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
const closeFn = readFileSync(new URL("./nightaudit.functions.ts", import.meta.url), "utf8");

function board(partial: {
  arrivalsPendingCount?: number;
  overstayCount?: number;
  unpaid?: number;
  openCount?: number;
  hkRooms?: number;
  integrity?: Partial<ReturnType<typeof emptyIntegrityCounts>>;
}) {
  const integrity = { ...emptyIntegrityCounts(), ...partial.integrity };
  return buildNa1Blockers({
    arrivalsPendingCount: partial.arrivalsPendingCount ?? 0,
    overstayCount: partial.overstayCount ?? 0,
    unpaidFolios: { lane: "live", count: partial.unpaid ?? 0 },
    openShift: { tillUsed: true, openCount: partial.openCount ?? 0 },
    hkConflict: {
      discrepancyLane: "live",
      discrepancyCount: 0,
      roomUnavailableCount: partial.hkRooms ?? 0,
    },
    integrity,
  });
}

describe("Night Audit Phase 0 close contract", () => {
  it("ships the same close guard on both migration lanes", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /RAISE EXCEPTION 'STALE_BUSINESS_DATE'/);
    assert.match(sql, /RAISE EXCEPTION 'AUDIT_RUN_NOT_FOUND'/);
    assert.match(sql, /RAISE EXCEPTION 'AUDIT_RUN_NOT_CLOSABLE'/);
    assert.match(sql, /RAISE EXCEPTION 'BLOCKING_EXCEPTIONS_OPEN'/);
    assert.match(sql, /IF _run\.status = 'closed' THEN/);
    assert.match(sql, /IF _run\.status NOT IN \('open', 'ready'\) THEN/);
    assert.match(sql, /_house_date IS NOT NULL AND _house_date <> _run\.business_date/);
    assert.match(sql, /business_date > _run\.business_date/);
    assert.match(sql, /SET business_date = _run\.business_date \+ 1/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.close_business_date/);
    assert.doesNotMatch(sql, /folio_transactions|hotel_reservations|hotel_rooms|housekeeping_/);
    assert.doesNotMatch(sql, /open_business_date/);
  });

  it("refuses a stale run in the app before the RPC", () => {
    assert.match(closeFn, /persistedBusinessDate/);
    assert.match(closeFn, /NA1_STALE_BUSINESS_DATE/);
    assert.equal(
      NA1_STALE_BUSINESS_DATE,
      "This run is not the current business date. Refresh Night Audit and close the current date.",
    );
    assert.doesNotMatch(
      closeFn,
      /evaluation\.exceptions\.some\(\(e\) => e\.severity === "blocking"\)/,
    );
    assert.match(closeFn, /remainingBlockerCount\(blockers\)/);
    assert.match(closeFn, /persistedNightAuditExceptions/);
  });

  it("blocks close for each integrity condition and shows that row", () => {
    const cases = [
      ["checked_in_without_room", { checkedInWithoutRoom: 2 }],
      ["room_double_occupancy", { doubleOccupancy: 1 }],
      ["closed_folio_nonzero_balance", { closedFolioNonzero: 1 }],
      ["closed_folio_post_activity", { closedFolioPostActivity: 3 }],
      ["duplicate_room_charge", { duplicateRoomCharge: 1 }],
    ] as const;
    for (const [id, integrity] of cases) {
      const rows = board({ integrity });
      const row = rows.find((item) => item.id === id);
      assert.equal(row?.state, "block");
      assert.ok((row?.clear.length ?? 0) > 0);
      assert.equal(canEnableConfirm(rows), false);
      const stored = closeBlockingExceptions(rows, []);
      assert.equal(
        stored.some((item) => item.exceptionType === id && item.severity === "blocking"),
        true,
      );
    }
  });

  it("does not let warnings or the unavailable no-show row block close", () => {
    const rows = board({});
    assert.equal(rows.find((row) => row.id === "cancel_noshow_pending")?.state, "unavailable");
    assert.equal(canEnableConfirm(rows), true);
    assert.equal(remainingBlockerCount(rows), 0);
    const warnings: NaDerivedException[] = [
      {
        exceptionType: "dirty_room_without_task",
        severity: "warning",
        referenceType: "room",
        referenceId: "room-1",
        message: "Vacant and dirty.",
      },
      {
        exceptionType: "pending_arrival",
        severity: "warning",
        referenceType: "reservation",
        referenceId: "stay-1",
        message: "Still pending.",
      },
    ];
    const persisted = persistedNightAuditExceptions(rows, warnings);
    assert.equal(persisted.some((row) => row.severity === "blocking"), false);
    assert.equal(
      persisted.some((row) => row.exceptionType === "dirty_room_without_task"),
      true,
    );
    assert.equal(
      persisted.some((row) => row.exceptionType === "pending_arrival"),
      false,
    );
  });

  it("stores pending arrivals as blocking when the arrivals row blocks", () => {
    const rows = board({ arrivalsPendingCount: 1 });
    const source: NaDerivedException[] = [
      {
        exceptionType: "pending_arrival",
        severity: "warning",
        referenceType: "reservation",
        referenceId: "stay-1",
        message: "Pending arrival.",
      },
    ];
    const blocking = closeBlockingExceptions(rows, source);
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0]?.exceptionType, "pending_arrival");
    assert.equal(blocking[0]?.severity, "blocking");
    assert.equal(blocking[0]?.referenceId, "stay-1");
  });

  it("counts integrity blockers from the audit evaluation", () => {
    const counts = integrityBlockerCounts([
      { exceptionType: "checked_in_without_room" },
      { exceptionType: "checked_in_without_room" },
      { exceptionType: "open_folio_balance" },
      { exceptionType: "duplicate_room_charge" },
    ]);
    assert.equal(counts.checkedInWithoutRoom, 2);
    assert.equal(counts.duplicateRoomCharge, 1);
    assert.equal(counts.closedFolioNonzero, 0);
    const rows = board({ integrity: counts });
    assert.equal(rows.find((row) => row.id === "checked_in_without_room")?.count, 2);
    assert.equal(rows.find((row) => row.id === "duplicate_room_charge")?.state, "block");
    assert.equal(canEnableConfirm(rows), false);
  });
});
