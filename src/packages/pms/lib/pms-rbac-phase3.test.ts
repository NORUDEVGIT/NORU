import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getReservationContextActions } from "../components/reservations/reservation-context-actions";
import {
  getFirstAccessiblePmsRoute,
  pmsActionAvailable,
  pmsCan,
  pmsCanAll,
  pmsCanAny,
  pmsKpiVisible,
  pmsModuleVisible,
  pmsSettingsCardEditable,
  pmsSettingsCardVisible,
  pmsSettingsHubVisible,
  PMS_MODULE_VIEW_PERMISSION,
  PMS_QUICK_ACTIONS,
} from "./pms-client-access";
import { PMS_PERMISSIONS } from "./pms-permissions";

const none = { isOwner: false, codes: [] as string[] };
const owner = { isOwner: true, codes: [] as string[] };

function hints(over: Partial<{ canAssignRoom: boolean; canConfirm: boolean; canCancel: boolean; canCheckIn: boolean; canCheckOut: boolean }> = {}) {
  return {
    canOpen: false,
    canAssignRoom: false,
    canConfirm: false,
    canCancel: false,
    canCheckIn: false,
    canCheckOut: false,
    ...over,
  };
}

describe("PMS RBAC phase 3 client access", () => {
  it("owner can do every checked permission without grant rows", () => {
    assert.equal(pmsCan(owner, PMS_PERMISSIONS.DASHBOARD_VIEW), true);
    assert.equal(pmsCan(owner, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), true);
    assert.equal(pmsCanAny(owner, [PMS_PERMISSIONS.ROLES_VIEW]), true);
    assert.equal(pmsCanAll(owner, [PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE, PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE]), true);
  });

  it("a role named Manager with only dashboard.view cannot open other modules", () => {
    const managerNameIrrelevant = { isOwner: false, codes: [PMS_PERMISSIONS.DASHBOARD_VIEW] };
    assert.equal(pmsCan(managerNameIrrelevant, PMS_PERMISSIONS.DASHBOARD_VIEW), true);
    assert.equal(pmsModuleVisible(managerNameIrrelevant, "reservations"), false);
    assert.equal(pmsModuleVisible(managerNameIrrelevant, "cashiering"), false);
    assert.equal(pmsModuleVisible(managerNameIrrelevant, "night-audit"), false);
    assert.equal(pmsSettingsHubVisible(managerNameIrrelevant), false);
  });

  it("unions multi-role codes without a combined role", () => {
    const combined = {
      isOwner: false,
      codes: [
        PMS_PERMISSIONS.RESERVATION_VIEW,
        PMS_PERMISSIONS.RESERVATION_CREATE,
        PMS_PERMISSIONS.CASHIERING_PAYMENT_POST,
      ],
    };
    assert.equal(pmsCan(combined, PMS_PERMISSIONS.RESERVATION_VIEW), true);
    assert.equal(pmsCan(combined, PMS_PERMISSIONS.RESERVATION_CREATE), true);
    assert.equal(pmsCan(combined, PMS_PERMISSIONS.CASHIERING_PAYMENT_POST), true);
    assert.equal(pmsCan(combined, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), false);
    assert.equal(pmsSettingsHubVisible(combined), false);
    assert.equal(pmsModuleVisible(combined, "night-audit"), false);
  });

  it("maps modules and quick actions to view or action permissions", () => {
    assert.equal(PMS_MODULE_VIEW_PERMISSION.reservations, PMS_PERMISSIONS.RESERVATION_VIEW);
    assert.equal(PMS_MODULE_VIEW_PERMISSION.distribution, PMS_PERMISSIONS.CONFIG_INTEGRATION_VIEW);
    assert.equal(PMS_QUICK_ACTIONS.newReservation, PMS_PERMISSIONS.RESERVATION_CREATE);
    assert.equal(PMS_QUICK_ACTIONS.walkIn, PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN);
    assert.equal(PMS_QUICK_ACTIONS.checkIn, PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN);
    assert.equal(PMS_QUICK_ACTIONS.checkOut, PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT);
    assert.equal(PMS_QUICK_ACTIONS.postPayment, PMS_PERMISSIONS.CASHIERING_PAYMENT_POST);
    const viewOnly = { isOwner: false, codes: [PMS_PERMISSIONS.RESERVATION_VIEW] };
    assert.equal(pmsModuleVisible(viewOnly, "reservations"), true);
    assert.equal(pmsCan(viewOnly, PMS_QUICK_ACTIONS.newReservation), false);
    assert.equal(pmsModuleVisible(none, "cashiering"), false);
    assert.equal(pmsModuleVisible(owner, "housekeeping"), true);
    assert.equal(pmsModuleVisible(owner, "property-setup"), true);
  });

  it("sends a dashboard-less user to the first allowed module", () => {
    const rooms = { isOwner: false, codes: [PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW, PMS_PERMISSIONS.ROOM_INVENTORY_VIEW] };
    assert.equal(getFirstAccessiblePmsRoute(rooms, "/restaurant/pms"), "/restaurant/pms/room-inventory");
    assert.equal(getFirstAccessiblePmsRoute(owner), "/restaurant/pms");
    assert.equal(getFirstAccessiblePmsRoute(none), null);
  });

  it("settings cards follow view permissions and edit is separate", () => {
    const roomsAdmin = { isOwner: false, codes: [PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE] };
    assert.equal(pmsSettingsHubVisible(roomsAdmin), true);
    assert.equal(pmsSettingsCardVisible(roomsAdmin, 2), true);
    assert.equal(pmsSettingsCardEditable(roomsAdmin, 2), true);
    for (const card of [1, 3, 4, 5, 6]) {
      assert.equal(pmsSettingsCardVisible(roomsAdmin, card), false);
    }
    assert.equal(pmsSettingsCardVisible(roomsAdmin, 7), false);
    const viewer = { isOwner: false, codes: [PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW] };
    assert.equal(pmsSettingsCardVisible(viewer, 1), true);
    assert.equal(pmsSettingsCardEditable(viewer, 1), false);
  });

  it("critical permissions are assignable to non-owners", () => {
    const critical = {
      isOwner: false,
      codes: [
        PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE,
        PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE,
        PMS_PERMISSIONS.CASHIERING_WRITE_OFF,
        PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE,
      ],
    };
    assert.equal(pmsCan(critical, PMS_PERMISSIONS.NIGHT_AUDIT_RECOVER_DATE), true);
    assert.equal(pmsCan(critical, PMS_PERMISSIONS.CONFIG_PROPERTY_ACTIVATE), true);
    assert.equal(pmsCan(critical, PMS_PERMISSIONS.CASHIERING_WRITE_OFF), true);
    assert.equal(pmsCan(critical, PMS_PERMISSIONS.NIGHT_AUDIT_CLOSE_DATE), true);
  });

  it("composes permission with domain state", () => {
    assert.equal(pmsActionAvailable(true, true), true);
    assert.equal(pmsActionAvailable(true, false), false);
    assert.equal(pmsActionAvailable(false, true), false);
    const view = { isOwner: false, codes: [PMS_PERMISSIONS.RESERVATION_VIEW] };
    const edit = { isOwner: false, codes: [PMS_PERMISSIONS.RESERVATION_EDIT] };
    const base = {
      status: "confirmed" as const,
      roomId: null,
      arrivalDate: "2026-11-04",
      businessDate: "2026-11-04",
      hints: hints({ canCancel: true }),
      canManage: false,
    };
    const viewIds = getReservationContextActions({
      ...base,
      capabilities: {
        edit: pmsCan(view, PMS_PERMISSIONS.RESERVATION_EDIT),
        create: false,
        cancel: false,
        assign: false,
        stayEdit: false,
        checkIn: false,
        checkOut: false,
        noShow: false,
        folio: false,
      },
    }).map((action) => action.id);
    assert.deepEqual(viewIds, ["open"]);
    const editIds = getReservationContextActions({
      ...base,
      capabilities: {
        edit: pmsCan(edit, PMS_PERMISSIONS.RESERVATION_EDIT),
        create: false,
        cancel: false,
        assign: false,
        stayEdit: false,
        checkIn: false,
        checkOut: false,
        noShow: false,
        folio: false,
      },
    }).map((action) => action.id);
    assert.ok(editIds.includes("edit"));
    assert.equal(editIds.includes("cancel"), false);
  });

  it("keeps KPI visibility on the source view, not a new permission", () => {
    const stay = { isOwner: false, codes: [PMS_PERMISSIONS.FRONT_OFFICE_VIEW] };
    assert.equal(pmsKpiVisible(stay, "stay"), true);
    assert.equal(pmsKpiVisible(stay, "cash"), false);
    assert.equal(pmsKpiVisible(stay, "housekeeping"), false);
  });

  it("does not authorize PMS navigation from staff_module_access or canEditSet1", () => {
    const home = readFileSync(new URL("../components/pms/pms-home-desk.tsx", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
    const propertyHome = readFileSync(new URL("../../../routes/restaurant/home.tsx", import.meta.url), "utf8");
    const dashboard = readFileSync(new URL("../../../routes/restaurant/pms/dashboard.tsx", import.meta.url), "utf8");
    assert.equal(home.includes("getMyModuleAccess"), false);
    assert.equal(shell.includes("pmsModuleVisible"), true);
    assert.equal(shell.includes("canEditSet1"), false);
    assert.equal(shell.includes("pmsSettingsHubVisible"), true);
    assert.equal(propertyHome.includes("canEditSet1"), false);
    assert.equal(dashboard.includes("PmsRouteGate"), true);
    assert.equal(dashboard.includes("DASHBOARD_VIEW"), true);
  });
});
