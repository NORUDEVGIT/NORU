import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import {
  FO_FEE_AMOUNT_NEGATIVE,
  FO_FEE_DEFAULTS_AUDIT_ACTION,
  FO_FEE_DEFAULTS_DENIED,
  FO_FEE_DEFAULTS_HINT,
  FO_FEE_DEFAULTS_SECTION,
  FO_FEE_REQUIRED_UNSET,
  canEditFoFeeDefaults,
  feeDefaultAmountAllowed,
  foFeeDefaultsBeforeAfter,
  normalizeFoFeeDefaults,
  validateFoFeeDefaults,
} from "./fo-fee-defaults.ts";

const before = {
  cancelFeeRequired: true,
  cancelFeeDefault: 0,
  noshowFeeRequired: true,
  noshowFeeDefault: 25,
};

describe("FO-CLEAN1 fee defaults validation", () => {
  it("blocks negative amounts and requires both booleans", () => {
    assert.equal(feeDefaultAmountAllowed(0), true);
    assert.equal(feeDefaultAmountAllowed(12.5), true);
    assert.equal(feeDefaultAmountAllowed(-0.01), false);
    assert.equal(feeDefaultAmountAllowed(Number.NaN), false);
    assert.equal(
      validateFoFeeDefaults({ ...before, cancelFeeDefault: -1 }),
      FO_FEE_AMOUNT_NEGATIVE,
    );
    assert.equal(
      validateFoFeeDefaults({ ...before, noshowFeeDefault: -5 }),
      FO_FEE_AMOUNT_NEGATIVE,
    );
    assert.equal(validateFoFeeDefaults(before), null);
    assert.equal(
      validateFoFeeDefaults({
        ...before,
        cancelFeeRequired: undefined as unknown as boolean,
      }),
      FO_FEE_REQUIRED_UNSET,
    );
  });

  it("gates the editor to supervisor / manager / property admin", () => {
    assert.equal(canEditFoFeeDefaults("owner"), true);
    assert.equal(canEditFoFeeDefaults("manager"), true);
    assert.equal(canEditFoFeeDefaults("receptionist"), false);
    assert.equal(canEditFoFeeDefaults("waiter"), false);
    assert.equal(FO_FEE_DEFAULTS_DENIED.includes("Coming soon"), false);
  });

  it("builds Confirm Before→After for the four existing fields", () => {
    const after = normalizeFoFeeDefaults({
      cancelFeeRequired: false,
      cancelFeeDefault: 10,
      noshowFeeRequired: true,
      noshowFeeDefault: 25,
    });
    const rows = foFeeDefaultsBeforeAfter(before, after);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((r) => r.id),
      ["cancelFeeRequired", "cancelFeeDefault", "noshowFeeRequired", "noshowFeeDefault"],
    );
    assert.equal(rows[0]?.previous, "Required");
    assert.equal(rows[0]?.next, "Not required");
    assert.equal(rows[1]?.previous, "0.00");
    assert.equal(rows[1]?.next, "10.00");
    assert.equal(FO_FEE_DEFAULTS_HINT, "Used when FO cancel / no-show runs (policy A).");
    assert.equal(FO_FEE_DEFAULTS_SECTION, "Cancel & no-show fees");
  });
});

describe("FO-CLEAN1 fee editor source locks", () => {
  it("Confirm Before→After and FO agent cannot edit; no new columns", () => {
    const editor = readFileSync(
      new URL("../components/settings/fo-fee-defaults-editor.tsx", import.meta.url),
      "utf8",
    );
    assert.match(editor, /Before → After/);
    assert.match(editor, /PermissionDeniedPanel/);
    assert.match(editor, /#C89933/);
    assert.match(editor, /#251605/);
    assert.match(editor, /#436436/);
    assert.match(editor, /#CCCCCC/);
    assert.doesNotMatch(editor, /ComingSoon/);
    assert.match(editor, /canEditFoFeeDefaults/);

    const fns = readFileSync(new URL("./fo-fee-defaults.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /fo_cancel_fee_required/);
    assert.match(fns, /fo_cancel_fee_default/);
    assert.match(fns, /fo_noshow_fee_required/);
    assert.match(fns, /fo_noshow_fee_default/);
    assert.match(fns, /FO_FEE_DEFAULTS_AUDIT_ACTION/);
    assert.equal(FO_FEE_DEFAULTS_AUDIT_ACTION, "fo_fee_defaults_updated");
    assert.match(fns, /restaurant_staff_audit_log/);
    assert.doesNotMatch(fns, /ADD COLUMN/);
    assert.doesNotMatch(fns, /FoAuditViewer/);
    assert.match(fns, /canEditFoFeeDefaults/);

    const settings = readFileSync(
      new URL("../../../core/components/workspaces/settings-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.match(settings, /FoFeeDefaultsEditor/);
  });

  it("FO-FS0 rail lock is unchanged", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("cashiering"), false);
  });
});
