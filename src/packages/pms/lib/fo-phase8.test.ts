import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FO_NAV_ITEMS } from "./front-office-shell.ts";
import { foInHouseActionHints, inHouseMenuItems } from "./fo-inhouse.ts";
import {
  evaluateFoApprovalRequirement,
  foAuthorizationButtonLabel,
  foLateCheckoutRequiresApproval,
  foRequiresApprovalLabel,
  FO_AUTHORIZATION_META,
} from "./fo-approvals.ts";

const here = dirname(fileURLToPath(import.meta.url));
function readRel(rel: string) {
  return readFileSync(join(here, rel), "utf8");
}

function requirement(
  extra: Partial<Parameters<typeof evaluateFoApprovalRequirement>[0]> & { actionKey: Parameters<typeof evaluateFoApprovalRequirement>[0]["actionKey"] },
) {
  return evaluateFoApprovalRequirement({
    staffRole: "receptionist",
    catalogueConfigured: true,
    ruleActive: false,
    approverRoleName: null,
    thresholdAmount: null,
    thresholdUnit: null,
    amount: null,
    policyNeedsApproval: extra.actionKey === "late_checkout.authorize" ? true : null,
    ...extra,
  });
}

describe("FO Phase 8 — approval rule lookup", () => {
  it("reads pms_approval_rules for display and keeps live staff-role authz", () => {
    const fns = readRel("./fo-approvals.functions.ts");
    assert.match(fns, /export const getFrontOfficeApprovalRequirement/);
    assert.match(fns, /from\("pms_approval_rules"\)/);
    assert.match(fns, /from\("pms_permissions"\)/);
    assert.match(fns, /requireReservationManager/);
    assert.match(fns, /membership\.role/);
    assert.match(fns, /late_checkout_needs_approval/);
    assert.doesNotMatch(fns, /pms_approval_requests/);
    assert.doesNotMatch(fns, /service_role/);
  });

  it("reuses catalogue permission codes already defined in Settings", () => {
    assert.equal(FO_AUTHORIZATION_META["front_office.check_in.override"].permissionCode, "front_office.check_in.override");
    assert.equal(FO_AUTHORIZATION_META["front_office.check_out.override"].permissionCode, "front_office.check_out.override");
    assert.equal(FO_AUTHORIZATION_META["front_office.fee.override"].permissionCode, "front_office.fee.override");
    assert.equal(FO_AUTHORIZATION_META["cashiering.room_charge.override"].foCommand, false);
    assert.equal(FO_AUTHORIZATION_META["rates.calendar.override"].foCommand, false);
    assert.equal(FO_AUTHORIZATION_META["guest.restriction.authorize"].foCommand, false);
  });
});

describe("FO Phase 8 — direct permission vs approval required", () => {
  it("allows a live owner/manager and requires authorization for a receptionist", () => {
    const manager = requirement({
      actionKey: "front_office.check_in.override",
      staffRole: "manager",
    });
    assert.equal(manager.directPermission, true);
    assert.equal(manager.approvalRequired, false);
    assert.equal(manager.canCurrentUserAuthorize, true);
    assert.equal(manager.state, "authorized");
    assert.equal(foAuthorizationButtonLabel(manager), "Authorize");

    const agent = requirement({ actionKey: "front_office.check_in.override" });
    assert.equal(agent.directPermission, false);
    assert.equal(agent.approvalRequired, true);
    assert.equal(agent.canCurrentUserAuthorize, false);
    assert.equal(agent.state, "authorization_required");
    assert.equal(foAuthorizationButtonLabel(agent), "Requires approval");
  });

  it("does not invent a queued pending/approved/rejected state", () => {
    const agent = requirement({ actionKey: "front_office.check_out.override" });
    assert.equal(["authorized", "authorization_required", "not_authorized", "not_configured", "unsupported"].includes(agent.state), true);
    assert.notEqual(agent.state, "pending");
  });
});

describe("FO Phase 8 — writers remain the authority", () => {
  it("keeps deposit waiver on waiveCheckInDeposit with a server supervisor gate", () => {
    const checkIn = readRel("./fo-check-in.functions.ts");
    assert.match(checkIn, /export const waiveCheckInDeposit/);
    assert.match(checkIn, /requireSupervisor\(me\.role\)/);
    assert.match(checkIn, /requireReservationManager/);
    assert.match(checkIn, /deposit_waived: true/);
    assert.match(checkIn, /recordReservationEvent/);
    const stepper = readRel("../components/frontoffice/fo-check-in-stepper.tsx");
    assert.match(stepper, /waiveCheckInDeposit/);
    assert.match(stepper, /FoAuthorizationCard/);
    assert.match(stepper, /getFrontOfficeApprovalRequirement/);
    assert.doesNotMatch(stepper, /canWaive &&/);
  });

  it("does not override hard check-in or check-out lifecycle", () => {
    const checkIn = readRel("./fo-check-in.functions.ts");
    assert.match(checkIn, /Only confirmed stays can be checked in/);
    assert.match(checkIn, /check_in_hotel_reservation/);
    const checkOut = readRel("./fo-check-out.functions.ts");
    assert.match(checkOut, /export const completeFoCheckOut/);
    assert.match(checkOut, /Only in-house stays can be checked out/);
    assert.match(checkOut, /requireSupervisor\(me\.role\)/);
    assert.match(checkOut, /overrideCheckOutSettlement/);
    const checkoutUi = readRel("../components/frontoffice/fo-check-out-stepper.tsx");
    assert.match(checkoutUi, /FoAuthorizationCard/);
    assert.match(checkoutUi, /overrideCheckOutSettlement/);
  });

  it("does not add a service_role shortcut or a client-only permission gate", () => {
    const card = readRel("../components/frontoffice/fo-authorization-card.tsx");
    assert.match(card, /canCurrentUserAuthorize/);
    assert.doesNotMatch(card, /localStorage/);
    assert.doesNotMatch(card, /sessionStorage/);
    for (const rel of [
      "./fo-check-in.functions.ts",
      "./fo-check-out.functions.ts",
      "./fo-cancel-noshow.functions.ts",
      "./arrivals-departures.functions.ts",
      "./fo-approvals.functions.ts",
    ]) {
      assert.doesNotMatch(readRel(rel), /service_role/);
    }
    const cancel = readRel("./fo-cancel-noshow.functions.ts");
    assert.match(cancel, /export const waiveCancelOrNoShowFee/);
    assert.match(cancel, /requireSupervisor\(me\.role\)/);
    const late = readRel("./arrivals-departures.functions.ts");
    assert.match(late, /requireLateCheckoutApprover/);
    assert.match(late, /export const setLateCheckout/);
  });
});

describe("FO Phase 8 — Model B workspace honesty", () => {
  it("does not add a fake Approvals inbox or request table", () => {
    assert.equal(FO_NAV_ITEMS.some((item) => /approv/i.test(item.id) || /approv/i.test(item.label)), false);
    const fns = readRel("./fo-approvals.functions.ts");
    const ts = readRel("./fo-approvals.ts");
    const card = readRel("../components/frontoffice/fo-authorization-card.tsx");
    for (const src of [fns, ts, card]) {
      assert.doesNotMatch(src, /pending approval/i);
      assert.doesNotMatch(src, /CREATE TABLE/i);
    }
    const repoRoot = join(here, "../../../..");
    const extra = [...readdirSync(join(repoRoot, "drizzle/migrations")), ...readdirSync(join(repoRoot, "supabase/migrations"))].filter(
      (name) => name.startsWith("0101_") || name.startsWith("0102_"),
    );
    assert.equal(extra.length, 0);
    assert.match(card, /will not queue a request/);
  });

  it("marks Cashiering / Rates / guest restriction keys as unsupported FO commands", () => {
    const charge = requirement({ actionKey: "cashiering.room_charge.override", staffRole: "owner" });
    assert.equal(charge.foCommand, false);
    assert.equal(charge.state, "unsupported");
    assert.equal(foAuthorizationButtonLabel(charge), "Not a Front Office command");
  });

  it("labels late checkout as requiring approval without hiding the action", () => {
    assert.equal(foLateCheckoutRequiresApproval(true, "receptionist"), true);
    assert.equal(foLateCheckoutRequiresApproval(true, "manager"), false);
    assert.equal(foLateCheckoutRequiresApproval(false, "receptionist"), false);
    const live = foInHouseActionHints({
      status: "checked_in",
      assigned: true,
      folioId: "f1",
      guestId: "g1",
      blockingKeys: [],
      lateCheckoutNeedsApproval: true,
      staffRole: "receptionist",
    });
    const item = inHouseMenuItems(live).find((row) => row.id === "late_checkout");
    assert.equal(item?.label, foRequiresApprovalLabel("Late Checkout", true));
    const policyOff = requirement({
      actionKey: "late_checkout.authorize",
      policyNeedsApproval: false,
    });
    assert.equal(policyOff.approvalRequired, false);
    assert.equal(policyOff.state, "authorized");
    const dialogs = readRel("../components/workspaces/arrivals-departures-dialogs.tsx");
    assert.match(dialogs, /setLateCheckout/);
    assert.match(dialogs, /FoAuthorizationCard/);
    assert.match(dialogs, /late_checkout.authorize/);
    const cancelUi = readRel("../components/frontoffice/fo-cancel-noshow-stepper.tsx");
    assert.match(cancelUi, /front_office.fee.override/);
    assert.match(cancelUi, /waiveCancelOrNoShowFee/);
  });
});
