import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { folioCapabilities } from "./folio-workspace";
import { getReservationActions } from "./reservation-actions";
import { reservationDetailActionAccess } from "./reservation-detail-actions";
import { PMS_PERMISSIONS } from "./pms-permissions";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("current PMS action visibility", () => {
  it("hides folio menu actions unless that specific permission is granted", () => {
    const desk = read("../components/cashiering/cashiering-desk.tsx");
    const workspace = read("../components/workspaces/cashiering-workspace.tsx");
    const standaloneMenu = read("../components/cashiering/folio-action-menu.tsx");
    assert.match(workspace, /charge: accessQuery\.data\.canCharge/);
    assert.match(workspace, /refund: accessQuery\.data\.canRefund/);
    assert.match(workspace, /close: accessQuery\.data\.canClose/);
    assert.match(standaloneMenu, /allow\("charge"/);
    assert.match(standaloneMenu, /allow\("refund"/);
    assert.doesNotMatch(standaloneMenu, /disabled=\{!canManage/);
    const menu = desk.slice(desk.indexOf("function FolioActionMenu"), desk.indexOf("function FolioPageItem"));
    assert.match(menu, /useCashieringGrants/);
    assert.doesNotMatch(desk, /Owner or Manager authorization required/);
  });

  it("splits folio capabilities by granular grant instead of one manage bundle", () => {
    const refundOnly = folioCapabilities({
      open: true,
      balance: 10,
      canManage: false,
      canOperate: false,
      hasInvoice: false,
      hasLines: true,
      invoiceSettingsAvailable: true,
      legacyFolioInvoice: false,
      grants: {
        charge: false,
        payment: false,
        deposit: false,
        refund: true,
        adjustment: false,
        discount: false,
        transfer: false,
        writeOff: false,
        close: false,
        invoiceEdit: false,
        invoiceAuthorize: false,
      },
    });
    assert.equal(refundOnly.canRefund, true);
    assert.equal(refundOnly.canWriteOff, false);
    assert.equal(refundOnly.canClose, false);
    assert.equal(refundOnly.canPostCharge, false);
  });

  it("does not show overbooking controls from an Owner or Manager label", () => {
    const page = read("../components/bookings/create-reservation-room-type.tsx");
    const decision = page.slice(page.indexOf("export function OverbookingDecision"));
    assert.match(decision, /canAuthorizeOverbooking/);
    assert.doesNotMatch(decision, /Owner or Manager/);
  });

  it("hides room restriction and block actions when the permission is absent", () => {
    const panel = read("../components/rooms/room-detail-panel.tsx");
    assert.match(panel, /canBlockEdit/);
    assert.match(panel, /canManageRestrictions/);
    const helper = panel.slice(panel.indexOf("function ActionWithPermission"));
    assert.match(helper, /if \(!allowed\) return null/);
    const blocks = read("../components/rooms/room-inventory-blocks.tsx");
    assert.match(blocks, /canBlockEdit/);
    assert.match(blocks, /canMutate/);
  });

  it("maps reservation detail actions to explicit permissions", () => {
    const limited = reservationDetailActionAccess({ isOwner: false, codes: [PMS_PERMISSIONS.DASHBOARD_VIEW] });
    const result = getReservationActions({
      status: "confirmed",
      businessDate: "2026-01-10",
      arrivalDate: "2026-01-10",
      departureDate: "2026-01-12",
      roomAssigned: true,
      role: "manager",
      access: limited,
      actionHints: {
        canEdit: true,
        canAssignRoom: true,
        canChangeRoom: true,
        canConfirm: true,
        canCancel: true,
        canCheckIn: true,
        canCheckOut: true,
        canNoShow: true,
        canReactivate: true,
        canCopyStay: true,
        canOpenFolio: true,
        canPrint: true,
      },
    });
    assert.equal(result.editable, false);
    assert.deepEqual(
      result.actions.map((a) => a.id),
      ["open", "open_folio"],
    );
  });

  it("wires reservation detail workspace to permission access not role manage", () => {
    const workspace = read("../components/workspaces/reservation-detail-workspace.tsx");
    assert.match(workspace, /reservationDetailActionAccess/);
    assert.match(workspace, /PMS_PERMISSIONS\.RESERVATION_EDIT/);
    assert.doesNotMatch(workspace, /canManage = accessQuery\.data/);
  });

  it("does not use a role to flash account write-off before permissions load", () => {
    const panel = read("../components/cashiering/financial-account-payments-panel.tsx");
    assert.match(panel, /writeOff: false/);
    assert.match(panel, /caps\.canWriteOff \?/);
  });

  it("splits rate and revenue commercial actions from view-only grants", () => {
    const server = read("./revenue/revenue-access.server.ts");
    const promotions = read("../components/rates/promotions/promotions-view.tsx");
    const ratesAccess = read("./rates.functions.ts");
    assert.match(server, /canConfigureRates: has\(PMS_PERMISSIONS\.RATES_CONFIGURE\)/);
    assert.match(server, /canApprove: has\(PMS_PERMISSIONS\.RATES_ACTIVATE\)/);
    assert.match(promotions, /const canManage = access\.canApprove/);
    assert.match(ratesAccess, /canConfigure:/);
    assert.match(ratesAccess, /canEditCalendar:/);
  });

  it("uses front-office desk grants instead of bookings canManage on FO workspaces", () => {
    const walk = read("../components/workspaces/walk-ins-workspace.tsx");
    const ad = read("../components/workspaces/arrivals-departures-workspace.tsx");
    const helper = read("./front-office-desk-access.ts");
    assert.match(helper, /FRONT_OFFICE_CHECK_IN/);
    assert.match(walk, /frontOfficeDeskAccess/);
    assert.doesNotMatch(walk, /getBookingsAccess/);
    assert.match(ad, /foAccess\.canCheckOut/);
    assert.match(ad, /foAccess\.canCheckIn/);
  });

  it("splits guest commercial directory view from create, edit, and activate", () => {
    const helper = read("./guest-account-access.ts");
    const company = read("../components/guests/guest-company-directory.tsx");
    assert.match(helper, /GUEST_ACCOUNT_VIEW/);
    assert.match(helper, /GUEST_ACCOUNT_CREATE/);
    assert.match(helper, /GUEST_ACCOUNT_EDIT/);
    assert.match(company, /guestAccountAccess/);
    assert.match(company, /accountAccess\.canView/);
    assert.match(company, /accountAccess\.canCreate/);
    assert.match(company, /canEdit=\{accountAccess\.canEdit\}/);
    assert.doesNotMatch(company, /canManage = permissions\.can\(PMS_PERMISSIONS\.GUEST_ACCOUNT_VIEW\)/);
  });

  it("gates housekeeping task, inspection, and maintenance CTAs on explicit grants", () => {
    const workspace = read("../components/workspaces/housekeeping-workspace.tsx");
    const board = read("../components/housekeeping/housekeeping-board.tsx");
    const tabs = read("../components/housekeeping/housekeeping-tabs.tsx");
    assert.match(workspace, /canCreateTask: accessQuery\.data\.canCreateTask/s);
    assert.match(workspace, /\{\.\.\.hkGrants\}/);
    assert.match(workspace, /canInspect=\{hkGrants\.canInspect\}/);
    assert.match(board, /scope === "supervisor" && canCreateTask/);
    assert.match(board, /canEditTask/);
    assert.match(tabs, /isSupervisor && canCreateTask/);
    assert.match(tabs, /isSupervisor && canCancelTask/);
    assert.match(tabs, /canInspect \?/);
    assert.match(tabs, /canCreateMaintenance \?/);
    assert.match(tabs, /canEditMaintenance && m\.status/);
  });

  it("uses stay row action menu and permission-backed grants on guest profile Stays tab", () => {
    const staysView = read("../components/guests/guest-stays-reservations-view.tsx");
    const stayActions = read("../components/guests/guest-stay-actions.tsx");
    const guestsFunctions = read("./guests.functions.ts");
    assert.match(staysView, /presentation="menu"/);
    assert.match(staysView, /canCreateGuestStayReservation\(access\)/);
    assert.match(stayActions, /bookingRowActions/);
    assert.match(stayActions, /guest-stay-action-modify/);
    assert.match(guestsFunctions, /FRONT_OFFICE_CHECK_IN\)/);
    assert.match(guestsFunctions, /RESERVATION_EDIT\)/);
    assert.match(guestsFunctions, /guestStayAccessForActor/);
  });
});
