import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PMS_PERMISSIONS } from "./pms-permissions.ts";
import {
  OPEN_CASHIER_SHIFT_RULE,
  OPEN_SHIFT_UNAUTHORIZED_COPY,
  canManageOpenCashierShift,
  conditionFromIssue,
  endOfDayPolicyFromBlockers,
  openBlockers,
} from "./night-audit-steps.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../../../../supabase/migrations/0210_open_cashier_shift_hard_block.sql");
const drizzle = read("../../../../drizzle/migrations/0210_open_cashier_shift_hard_block.sql");
const closeFn = read("./nightaudit.functions.ts");
const parts = read("../components/nightaudit/end-of-day-parts.tsx");

const OWN = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";

describe("open cashier shift is never configurable", () => {
  it("ignores a legacy do-not-block list", () => {
    assert.deepEqual(endOfDayPolicyFromBlockers([]), { openCashierShifts: "block" });
    assert.deepEqual(endOfDayPolicyFromBlockers(["unsettled_folios"]), { openCashierShifts: "block" });
    assert.equal(OPEN_CASHIER_SHIFT_RULE, "Open cashier shifts must be closed before End of Day.");
  });

  it("stays a blocker with no fiscal override for every role", () => {
    const row = conditionFromIssue(
      {
        code: "open_cashier_shift",
        severity: "blocking",
        title: "Cashier shift is still open",
        description: "This shift must be closed before End of Day can continue.",
        referenceType: "cashier_shift",
        referenceId: "shift-1",
        route: "/restaurant/pms/cashiering",
        search: { tab: "cashier-shift", shift: "shift-1", action: "close" },
        shiftMembershipId: OWN,
      },
      { openCashierShifts: "do_not_block" },
    );
    assert.ok(row);
    assert.equal(row.kind, "blocker");
    assert.equal(row.fiscalOverrideable, false);
    assert.equal(row.shiftMembershipId, OWN);
    assert.equal(row.actions[0]?.label, "Open Cashier Shift");
    assert.equal(openBlockers([row]).length, 1);
  });
});

describe("who can open the existing shift screen", () => {
  it("lets the owner of the shift use edit, and anyone with authorize", () => {
    assert.equal(
      canManageOpenCashierShift({
        shiftMembershipId: OWN,
        actorMembershipId: OWN,
        canEdit: true,
        canAuthorize: false,
      }),
      true,
    );
    assert.equal(
      canManageOpenCashierShift({
        shiftMembershipId: OTHER,
        actorMembershipId: OWN,
        canEdit: true,
        canAuthorize: false,
      }),
      false,
    );
    assert.equal(
      canManageOpenCashierShift({
        shiftMembershipId: OTHER,
        actorMembershipId: OWN,
        canEdit: false,
        canAuthorize: true,
      }),
      true,
    );
    assert.equal(
      canManageOpenCashierShift({
        shiftMembershipId: OWN,
        actorMembershipId: OWN,
        canEdit: false,
        canAuthorize: false,
      }),
      false,
    );
    assert.equal(OPEN_SHIFT_UNAUTHORIZED_COPY, "This shift must be closed by an authorized staff member.");
    assert.match(parts, /OPEN_SHIFT_UNAUTHORIZED_COPY/);
    assert.match(parts, /end-of-day-close-shift/);
    assert.equal(PMS_PERMISSIONS.CASHIERING_SHIFT_AUTHORIZE, "cashiering.shift.authorize");
  });
});

describe("open shift database gate", () => {
  it("ships identical dual-lane SQL", () => {
    assert.equal(drizzle, sql);
  });

  it("rechecks open shifts inside the close lock and does not honour a role", () => {
    const close = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.close_business_date"));
    assert.match(close, /FOR UPDATE/);
    assert.match(close, /status = 'open'/);
    assert.match(close, /RAISE EXCEPTION 'OPEN_CASHIER_SHIFT'/);
    assert.doesNotMatch(close, /open_cashier_shifts|do_not_block|membership role|is_owner/i);
    const recovery = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.adjust_business_date"));
    assert.match(recovery, /RAISE EXCEPTION 'OPEN_CASHIER_SHIFT'/);
    assert.match(recovery, /business_date IS DISTINCT FROM _new_business_date/);
  });

  it("rejects cash on a stale shift and still allows the shift to be closed", () => {
    assert.match(sql, /RAISE EXCEPTION 'CASHIER_SHIFT_CLOSED_DATE'/);
    assert.match(sql, /movement_type'\) IN \('opening', 'close_count'\)/);
    assert.match(sql, /folio_transactions_current_shift/);
    assert.match(sql, /hotel_drawer_movements_current_shift/);
    assert.match(sql, /hotel_cashier_shifts_open_property_idx/);
    assert.match(sql, /open_cashier_shifts is deprecated and ignored/);
  });

  it("the close server function re-evaluates before the RPC", () => {
    const body = closeFn.slice(closeFn.indexOf("export const closeBusinessDate"));
    assert.ok(body.indexOf("evaluateEndOfDay(") < body.indexOf('rpc("close_business_date"'));
    assert.match(body, /openBlockers\(conditions\)/);
  });
});
