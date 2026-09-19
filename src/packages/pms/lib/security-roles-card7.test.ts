import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CARD7_EMPTY_CATALOGUE_COPY,
  CARD7_LIVE_AUTHZ_COPY,
  CARD7_PERMISSION_ACTIONS,
  emptyHotelRoleDraft,
  emptySecuritySnapshot,
  evaluateCard7SecurityReadiness,
  groupPermissionsByModule,
  type Card7Permission,
  type Card7SecuritySnapshot,
} from "./security-roles-card7.server.ts";
import {
  CARD7_PROGRAMME_CARD_ID,
  buildCard7ValidationReport,
  card7FinishActivatesProperty,
  evaluateCard7Overall,
  mergeCard7Status,
} from "./card7-readiness.server.ts";
import { emptyPropertySetupStatus, evaluateProgrammeCardStatus } from "./pms-property-setup-card1.ts";

function permission(partial: Partial<Card7Permission> & { id: string; code: string }): Card7Permission {
  return {
    module: "front_office",
    functionKey: "reservation",
    action: "create",
    name: "Create reservation",
    description: "",
    sensitive: false,
    active: true,
    ...partial,
  };
}

function readySnapshot(): Card7SecuritySnapshot {
  return {
    ...emptySecuritySnapshot(),
    roles: [
      emptyHotelRoleDraft({
        id: "role-1",
        code: "FO_AGENT",
        name: "Front office agent",
        departmentId: "dept-1",
      }),
    ],
    permissions: [
      permission({
        id: "perm-1",
        code: "front_office.reservation.create",
      }),
    ],
    mappings: [
      {
        id: "map-1",
        roleId: "role-1",
        permissionId: "perm-1",
        allowed: true,
        dataScope: "department",
      },
    ],
    departments: [{ id: "dept-1", name: "Front office", code: "FO", active: true }],
    memberships: [
      {
        membershipId: "mem-1",
        userId: "user-1",
        name: "Ada",
        staffRole: "receptionist",
        hotelRoleId: "role-1",
        active: true,
      },
    ],
  };
}

describe("Card 7 Security & Roles readiness", () => {
  it("blocks until an active hotel role exists", () => {
    const result = evaluateCard7SecurityReadiness(emptySecuritySnapshot());
    assert.equal(result.status, "not_started");
    assert.equal(result.ready, false);
    assert.match(result.blockers.join(" "), /at least one active hotel role/);
    assert.ok(result.warnings.includes(CARD7_LIVE_AUTHZ_COPY));
  });

  it("blocks an empty permission catalogue and keeps overall incomplete", () => {
    const snapshot: Card7SecuritySnapshot = {
      ...emptySecuritySnapshot(),
      roles: [emptyHotelRoleDraft({ id: "role-1", code: "FO", name: "Front office" })],
    };
    const security = evaluateCard7SecurityReadiness(snapshot);
    assert.equal(security.status, "in_progress");
    assert.match(security.blockers.join(" "), /Permission catalogue is empty/);
    const overall = evaluateCard7Overall(security);
    assert.equal(overall.status, "in_progress");
    assert.equal(overall.ready, false);
    assert.equal(CARD7_EMPTY_CATALOGUE_COPY.includes("cannot add custom permission keys"), true);
  });

  it("requires department scope to use a Card 5 department on the role", () => {
    const snapshot = readySnapshot();
    const role = snapshot.roles[0];
    assert.ok(role);
    snapshot.roles = [{ ...role, departmentId: null }];
    const result = evaluateCard7SecurityReadiness(snapshot);
    assert.equal(result.ready, false);
    assert.match(result.blockers.join(" "), /department scope/);
  });

  it("marks Security & Roles complete without completing Card 7", () => {
    const snapshot = readySnapshot();
    const report = buildCard7ValidationReport(snapshot);
    assert.equal(report.security.verdict, "PASS");
    assert.equal(report.audit.verdict, "FAIL");
    assert.equal(report.reports.verdict, "FAIL");
    assert.equal(report.importDomain.verdict, "FAIL");
    assert.equal(report.overall.verdict, "PARTIAL");
    assert.equal(report.overall.status, "in_progress");
    assert.equal(card7FinishActivatesProperty(), false);
    const stored = mergeCard7Status(emptyPropertySetupStatus(), report.overall);
    assert.equal(stored.cards[CARD7_PROGRAMME_CARD_ID], "in_progress");
    assert.equal(
      evaluateProgrammeCardStatus(CARD7_PROGRAMME_CARD_ID, stored, "complete"),
      "in_progress",
    );
  });

  it("groups catalogue rows by module and function", () => {
    const groups = groupPermissionsByModule([
      permission({
        id: "a",
        code: "front_office.reservation.view",
        action: "view",
        name: "View",
      }),
      permission({
        id: "b",
        code: "front_office.reservation.create",
        action: "create",
        name: "Create",
      }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.module, "front_office");
    assert.equal(groups[0]?.functions[0]?.functionKey, "reservation");
    assert.equal(groups[0]?.functions[0]?.permissions.length, 2);
  });
});

describe("Card 7 Security & Roles ownership", () => {
  it("uses the approved permission-action vocabulary without update", () => {
    assert.deepEqual([...CARD7_PERMISSION_ACTIONS], [
      "view",
      "create",
      "edit",
      "delete",
      "cancel",
      "approve",
      "post",
      "refund",
      "export",
      "print",
      "configure",
      "activate",
      "override",
      "authorize",
    ]);
    assert.equal((CARD7_PERMISSION_ACTIONS as readonly string[]).includes("update"), false);
  });

  it("does not rewrite live authz helpers or STAFF_ROLES", () => {
    const functions = readFileSync(new URL("./security-roles-card7.functions.ts", import.meta.url), "utf8");
    const staff = readFileSync(new URL("../../../core/lib/staff.functions.ts", import.meta.url), "utf8");
    const access = readFileSync(new URL("../../../core/lib/module-access.ts", import.meta.url), "utf8");
    assert.match(functions, /hotel_role_id: data\.hotelRoleId/);
    assert.doesNotMatch(functions, /update\(\{[^}]*\brole:/);
    assert.doesNotMatch(functions, /\.from\("staff_module_access"\)/);
    assert.doesNotMatch(functions, /CREATE OR REPLACE FUNCTION public\.has_restaurant_role/);
    assert.match(staff, /STAFF_ROLES/);
    assert.match(access, /export const STAFF_ROLES/);
  });
});
