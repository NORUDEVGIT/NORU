import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { pmsSettingsCardVisible } from "./pms-client-access.ts";
import {
  PMS_PERMISSION_DENIED,
  PMS_PERMISSIONS,
  permissionRisk,
} from "./pms-permissions.ts";
import { CARD5_TABS, isCard5WorkspaceHash, STAFF_ACCESS_HREF } from "./pms-property-setup-card5.ts";
import {
  ACTIVE_STAFF_NEEDS_ROLE,
  CRITICAL_CONFIRM,
  GRANT_OUTSIDE_ACTOR,
  PERMISSION_OUTSIDE_ACTOR,
  ROLE_DEACTIVATE_WARNING,
  ROLE_OUTSIDE_ACTOR,
  STAFF_ACCESS_MODULES,
  STAFF_ACCESS_TEMPLATES,
  accessCounts,
  actorCanGrantCode,
  applyModulePreset,
  auditActionLabel,
  canOfferAddStaff,
  friendlyAccessError,
  moduleTriState,
  modulesMatchingSearch,
  roleCodeFromName,
  roleFitsActor,
  staffAccessStepVisible,
  templatePermissionCodes,
  unionPermissionDetail,
  withPermissionDisabled,
  withPermissionEnabled,
} from "./staff-access.ts";

const P = PMS_PERMISSIONS;

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const members = read("../components/settings/staff-access-members.tsx");
const roles = read("../components/settings/staff-access-roles.tsx");
const matrix = read("../components/settings/staff-access-matrix.tsx");
const workspace = read("../components/settings/staff-access-workspace.tsx");
const card5 = read("../components/settings/pms-property-setup-card5-section.tsx");
const card7 = read("../components/settings/pms-card7-security-roles-tab.tsx");
const admin = read("../components/workspaces/pms-administration-workspace.tsx");
const model = read("./staff-access.ts");
const staffFns = read("./pms-staff.functions.ts");
const roleFns = read("./security-roles-card7.functions.ts");
const fbStaff = read("../../../routes/restaurant/staff.tsx");

const nightAudit = STAFF_ACCESS_MODULES.find((module) => module.id === "night-audit");
const cashiering = STAFF_ACCESS_MODULES.find((module) => module.id === "cashiering");

describe("Staff & Access visibility", () => {
  it("opens Card 5 for staff view or roles view and keeps the organization steps", () => {
    const staffOnly = { isOwner: false, codes: [P.STAFF_VIEW] };
    const rolesOnly = { isOwner: false, codes: [P.ROLES_VIEW] };
    const roomsOnly = { isOwner: false, codes: [P.CONFIG_ROOMS_OPS_VIEW] };
    assert.equal(pmsSettingsCardVisible(staffOnly, 5), true);
    assert.equal(pmsSettingsCardVisible(rolesOnly, 5), true);
    assert.equal(pmsSettingsCardVisible(roomsOnly, 5), false);
    assert.equal(staffAccessStepVisible(true, false), true);
    assert.equal(staffAccessStepVisible(false, true), true);
    assert.equal(staffAccessStepVisible(false, false), false);
    assert.equal(isCard5WorkspaceHash("#staff-access"), true);
    assert.equal(isCard5WorkspaceHash("#departments"), false);
    assert.equal(CARD5_TABS.length, 3);
    assert.match(card5, /StaffAccessWorkspace/);
    assert.match(card5, /Staff & Access/);
    assert.match(card5, /Card5DepartmentsTab/);
    assert.match(card5, /Card5OutletsTab/);
    assert.match(card5, /Card5SalesEventsTab/);
    assert.match(workspace, /Staff Members/);
    assert.match(workspace, /Roles & Permissions/);
    assert.match(workspace, /PMS_PERMISSIONS.STAFF_VIEW/);
    assert.match(workspace, /PMS_PERMISSIONS.ROLES_VIEW/);
  });
});

describe("role templates and permission matrix rules", () => {
  it("preselects operational defaults and leaves critical actions off", () => {
    const frontDesk = templatePermissionCodes("front-desk");
    assert.equal(frontDesk.includes(P.FRONT_OFFICE_CHECK_IN), true);
    assert.equal(frontDesk.includes(P.RESERVATION_CREATE), true);
    assert.equal(frontDesk.includes(P.RESERVATION_CANCEL), false);
    assert.equal(frontDesk.includes(P.RESERVATION_RATE_OVERRIDE), false);
    assert.equal(frontDesk.includes(P.RESERVATION_OVERBOOKING_AUTHORIZE), false);
    assert.equal(frontDesk.includes(P.CASHIERING_WRITE_OFF), false);

    const reservations = templatePermissionCodes("reservation-agent");
    assert.equal(reservations.includes(P.RESERVATION_CANCEL), true);
    assert.equal(reservations.includes(P.FRONT_OFFICE_CHECK_IN), false);
    assert.equal(reservations.includes(P.CASHIERING_VIEW), false);
    assert.equal(reservations.includes(P.RESERVATION_RATE_OVERRIDE), false);

    const cashier = templatePermissionCodes("cashier");
    assert.equal(cashier.includes(P.CASHIERING_PAYMENT_POST), true);
    assert.equal(cashier.includes(P.CASHIERING_CHARGE_POST), false);
    assert.equal(cashier.includes(P.CASHIERING_REFUND), false);
    assert.equal(cashier.includes(P.CASHIERING_WRITE_OFF), false);
    assert.equal(cashier.includes(P.CASHIERING_SHIFT_AUTHORIZE), false);
    assert.equal(cashier.includes(P.CASHIERING_INVOICE_AUTHORIZE), false);

    const housekeeping = templatePermissionCodes("housekeeping-staff");
    assert.equal(housekeeping.includes(P.HOUSEKEEPING_TASK_EDIT), true);
    assert.equal(housekeeping.includes(P.HOUSEKEEPING_INSPECTION_EDIT), false);
    assert.equal(housekeeping.includes(P.ROOM_RESTRICTION_EDIT), false);

    const night = templatePermissionCodes("night-auditor");
    assert.equal(night.includes(P.NIGHT_AUDIT_RUN), true);
    assert.equal(night.includes(P.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(night.includes(P.NIGHT_AUDIT_FISCAL_AUTHORIZE), false);
    assert.equal(night.includes(P.NIGHT_AUDIT_RECOVER_DATE), false);

    for (const code of templatePermissionCodes("general-manager")) {
      assert.notEqual(permissionRisk(code), "CRITICAL");
    }
    assert.equal(STAFF_ACCESS_TEMPLATES.some((item) => item.id === "blank"), true);
    assert.deepEqual(templatePermissionCodes("blank"), []);
  });

  it("keeps View as the parent and excludes critical permissions from Full Access", () => {
    assert.ok(nightAudit);
    assert.ok(cashiering);
    const withWriteOff = withPermissionEnabled([], P.CASHIERING_WRITE_OFF);
    assert.equal(withWriteOff.has(P.CASHIERING_VIEW), true);
    assert.equal(withWriteOff.has(P.CASHIERING_WRITE_OFF), true);
    const cleared = withPermissionDisabled(withWriteOff, P.CASHIERING_VIEW);
    assert.equal(cleared.has(P.CASHIERING_VIEW), false);
    assert.equal(cleared.has(P.CASHIERING_WRITE_OFF), false);

    const full = applyModulePreset([], nightAudit, "full");
    assert.equal(full.has(P.NIGHT_AUDIT_VIEW), true);
    assert.equal(full.has(P.NIGHT_AUDIT_RUN), true);
    assert.equal(full.has(P.NIGHT_AUDIT_EXCEPTION_EDIT), true);
    assert.equal(full.has(P.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(full.has(P.NIGHT_AUDIT_FISCAL_AUTHORIZE), false);
    assert.equal(full.has(P.NIGHT_AUDIT_RECOVER_DATE), false);
    assert.equal(moduleTriState(full, nightAudit), "all");
    assert.equal(moduleTriState([], nightAudit), "none");
    assert.equal(moduleTriState(applyModulePreset([], nightAudit, "view"), nightAudit), "partial");
    assert.equal(moduleTriState(applyModulePreset(full, nightAudit, "none"), nightAudit), "none");

    const counts = accessCounts(full);
    assert.equal(counts.modules, 1);
    assert.equal(counts.critical, 0);
    assert.equal(counts.actions > 0, true);
    assert.deepEqual(modulesMatchingSearch("Business Date Recovery"), ["night-audit"]);
    assert.equal(STAFF_ACCESS_MODULES[0]?.label, "Dashboard");
    assert.equal(STAFF_ACCESS_MODULES.at(-1)?.label, "Role & Permission Management");
    assert.match(model, /Property & Business/);
    assert.doesNotMatch(model, /Card 5|Card 7/);
  });
});

describe("privilege subset, multi-role access, and owner safety", () => {
  it("unions active roles once and blocks grants outside the actor", () => {
    const detail = unionPermissionDetail([
      { name: "Cashier", active: true, codes: [P.CASHIERING_VIEW, P.CASHIERING_PAYMENT_POST] },
      { name: "Reservation Agent", active: true, codes: [P.RESERVATION_VIEW, P.CASHIERING_VIEW] },
      { name: "Manager", active: true, codes: [P.DASHBOARD_VIEW] },
      { name: "Inactive Night", active: false, codes: [P.NIGHT_AUDIT_CLOSE_DATE] },
    ]);
    const folioView = detail.filter((row) => row.code === P.CASHIERING_VIEW);
    assert.equal(folioView.length, 1);
    assert.deepEqual(folioView[0]?.grantedBy, ["Cashier", "Reservation Agent"]);
    assert.equal(detail.some((row) => row.code === P.NIGHT_AUDIT_CLOSE_DATE), false);
    assert.equal(detail.filter((row) => row.code === P.DASHBOARD_VIEW).length, 1);

    const limited = { isOwner: false, codes: [P.CASHIERING_VIEW] };
    assert.equal(actorCanGrantCode(limited, P.CASHIERING_WRITE_OFF), false);
    assert.equal(roleFitsActor(limited, [P.CASHIERING_VIEW, P.CASHIERING_WRITE_OFF]), false);
    assert.equal(actorCanGrantCode({ isOwner: true, codes: [] }, P.CASHIERING_WRITE_OFF), true);
    assert.equal(canOfferAddStaff(true, false), false);
    assert.equal(canOfferAddStaff(true, true), true);
    assert.equal(friendlyAccessError("Active hotel staff need at least one role."), ACTIVE_STAFF_NEEDS_ROLE);
    assert.equal(friendlyAccessError(PMS_PERMISSION_DENIED), GRANT_OUTSIDE_ACTOR);
    assert.equal(friendlyAccessError("That role does not belong to this property."), PMS_PERMISSION_DENIED);
    assert.equal(roleCodeFromName("Front Desk", []), "FRONT_DESK");
    assert.equal(roleCodeFromName("Front Desk", ["FRONT_DESK"]), "FRONT_DESK_2");
    assert.match(ROLE_OUTSIDE_ACTOR, /cannot assign this role/);
    assert.match(PERMISSION_OUTSIDE_ACTOR, /cannot grant it/);
    assert.match(CRITICAL_CONFIRM, /sensitive operational or financial authority/);
    assert.match(ROLE_DEACTIVATE_WARNING, /immediately remove these permissions/);
  });

  it("separates staff and role authorities and invalidates the current permission query", () => {
    assert.match(members, /canOfferAddStaff/);
    assert.match(members, /disabled=\{!creating && !canEdit\}/);
    assert.match(members, /disabled=\{!canAssignRoles && !creating\}/);
    assert.match(members, /Owner · Full Access/);
    assert.match(members, /!row\.isOwner && canActivate/);
    assert.match(members, /!row\.isOwner && canReset/);
    assert.match(members, /invalidatePmsPermissions/);
    assert.match(members, /Temporary Password/);
    assert.match(members, /Existing account linked to this property/);
    assert.match(roles, /readOnly=\{!canAssignPermissions\}/);
    assert.match(roles, /invalidatePmsPermissions/);
    assert.match(roles, /templatePermissionCodes/);
    assert.match(matrix, /critical-permission-confirm/);
    assert.match(matrix, /Expand All/);
    assert.match(matrix, /Collapse All/);
    assert.match(matrix, /PERMISSION_OUTSIDE_ACTOR/);
    assert.equal(auditActionLabel("role_activated"), "Role activated");
    assert.match(staffFns, /must_change_password: true/);
    assert.match(staffFns, /assertOwnerMembershipUntouched/);
    assert.match(roleFns, /role_activated/);
    assert.match(roleFns, /PMS_PERMISSIONS.ROLES_ACTIVATE/);
    assert.match(roleFns, /PMS_PERMISSIONS.ROLES_ASSIGN_PERMISSIONS/);
  });
});

describe("legacy role editors are not a second authorization path", () => {
  it("points Card 7 and PMS administration at Staff & Access and leaves F&B staff alone", () => {
    assert.match(card7, /Open Staff & Access/);
    assert.doesNotMatch(card7, /Add Role|saveCard7HotelRole|staff_module_access|organization/);
    assert.match(admin, /STAFF_ACCESS_HREF/);
    assert.match(admin, /settings#payment-methods/);
    assert.match(admin, /settings#financial-commercial/);
    assert.doesNotMatch(admin, /StaffManager|ROLE_MODULES/);
    assert.equal(STAFF_ACCESS_HREF.endsWith("#staff-access"), true);
    assert.doesNotMatch(fbStaff, /STAFF_ACCESS_HREF|staff-access/);

    const freshUi = [members, roles, matrix, workspace, model].join("\n");
    assert.doesNotMatch(freshUi, /hotel_role_id/);
    assert.doesNotMatch(freshUi, /STAFF_ROLES/);
    assert.doesNotMatch(freshUi, /role === "manager"|role === "cashier"/);
    assert.doesNotMatch(freshUi, /canEditSet1|staff_module_access|configuration\.security\.configure/);
  });
});
