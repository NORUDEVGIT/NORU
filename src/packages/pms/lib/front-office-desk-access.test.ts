import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { PMS_PERMISSIONS, parentViewPermission, roleGrantErrors } from "./pms-permissions.ts";
import { foRackBarMenuItems } from "./fo-rack-bar-menu.ts";
import { frontOfficeDeskAccess } from "./front-office-desk-access.ts";

describe("Front Office desk actions", () => {
  it("parents a desk money code to Front Office and not Cashiering", () => {
    assert.equal(
      parentViewPermission(PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST),
      PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
    );
    assert.deepEqual(
      roleGrantErrors([
        PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
        PMS_PERMISSIONS.FRONT_OFFICE_CHARGE_POST,
      ]),
      [],
    );
  });

  it("does not treat stay edit as room assignment", () => {
    const access = frontOfficeDeskAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.FRONT_OFFICE_VIEW, PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT],
    });
    assert.equal(access.canStayEdit, true);
    assert.equal(access.canAssignRoom, false);
    assert.equal(access.canOpenFolio, false);
  });

  it("omits check-in from the rack menu when the desk grant is missing", () => {
    const grants = frontOfficeDeskAccess({
      isOwner: false,
      codes: [PMS_PERMISSIONS.FRONT_OFFICE_VIEW, PMS_PERMISSIONS.FRONT_OFFICE_STAY_EDIT],
    });
    const ids = foRackBarMenuItems({
      status: "confirmed",
      assigned: false,
      arrivalDate: "2026-10-26",
      businessDate: "2026-10-26",
      canOpenCashiering: false,
      maintenanceRelevant: false,
      grants,
    }).map((item) => item.id);
    assert.equal(ids.includes("check_in"), false);
    assert.equal(ids.includes("edit_stay"), true);
  });

  it("requires the checkout override permission on the settlement override", () => {
    const source = readFileSync(new URL("./fo-check-out.functions.ts", import.meta.url), "utf8");
    const start = source.indexOf("export const overrideCheckOutSettlement");
    const body = source.slice(start, start + 800);
    assert.match(body, /FRONT_OFFICE_CHECK_OUT_OVERRIDE/);
  });
});
