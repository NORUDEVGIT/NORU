import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describe, it } from "vitest";

import {
  getReservationActions,
  type ReservationActionHints,
  type ReservationActionInput,
} from "./reservation-actions.ts";

const helper = readFileSync(new URL("./reservation-actions.ts", import.meta.url), "utf8");
const dates = readFileSync(new URL("./reservation-dates.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./reservations.server.ts", import.meta.url), "utf8");
const commands = readFileSync(new URL("./reservations.functions.ts", import.meta.url), "utf8");
const detail = readFileSync(
  new URL("../components/workspaces/reservation-detail-workspace.tsx", import.meta.url),
  "utf8",
);
const deskMenu = readFileSync(
  new URL("../components/reservations/reservation-context-actions.ts", import.meta.url),
  "utf8",
);

const BUSINESS_DATE = "2026-10-11";

function hints(overrides: Partial<ReservationActionHints> = {}): ReservationActionHints {
  return {
    canEdit: true,
    canAssignRoom: true,
    canChangeRoom: false,
    canConfirm: true,
    canCancel: true,
    canCheckIn: false,
    canCheckOut: false,
    canNoShow: false,
    canReactivate: false,
    canCopyStay: true,
    canOpenFolio: false,
    canPrint: true,
    ...overrides,
  };
}

function input(overrides: Partial<ReservationActionInput> = {}): ReservationActionInput {
  return {
    status: "pending",
    businessDate: BUSINESS_DATE,
    arrivalDate: "2026-10-14",
    departureDate: "2026-10-16",
    roomAssigned: false,
    role: "receptionist",
    actionHints: hints(),
    ...overrides,
  };
}

function ids(overrides: Partial<ReservationActionInput> = {}) {
  return getReservationActions(input(overrides)).actions.map((action) => action.id);
}

describe("reservation action eligibility", () => {
  it("keeps a pending future stay editable and confirmable", () => {
    const result = getReservationActions(input());
    assert.equal(result.editable, true);
    assert.equal(result.historical, false);
    assert.equal(result.primaryAction?.id, "confirm");
    assert.equal(ids().includes("confirm"), true);
    assert.equal(ids().includes("edit"), true);
    assert.equal(ids().includes("cancel"), true);
    assert.equal(ids().includes("assign_room"), true);
    assert.equal(ids().includes("copy"), true);
    assert.equal(ids().includes("print"), true);
    assert.equal(ids().includes("check_in"), false);
    assert.equal(
      ids({ roomAssigned: true, actionHints: hints({ canChangeRoom: true }) }).includes(
        "change_room",
      ),
      false,
    );
  });

  it("hides cancel when the hint refuses it", () => {
    assert.equal(ids({ actionHints: hints({ canCancel: false }) }).includes("cancel"), false);
  });

  it("treats a pending stay that already departed as stale", () => {
    const result = getReservationActions(
      input({
        arrivalDate: "2026-10-01",
        departureDate: "2026-10-04",
        actionHints: hints({ canCheckIn: true, canNoShow: true }),
      }),
    );
    assert.equal(result.editable, false);
    assert.equal(result.historical, true);
    assert.equal(result.primaryAction, null);
    assert.equal(
      result.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "confirm"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "assign_room"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "cancel"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "check_in"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "print"),
      true,
    );
    assert.equal(result.warnings.length > 0, true);
  });

  it("keeps a confirmed current stay editable until check-in is the primary action", () => {
    const future = getReservationActions(
      input({
        status: "confirmed",
        actionHints: hints({ canConfirm: false, canCheckIn: false }),
      }),
    );
    assert.equal(future.editable, true);
    assert.equal(future.primaryAction, null);
    assert.equal(
      future.actions.some((action) => action.id === "edit"),
      true,
    );

    const eligible = getReservationActions(
      input({
        status: "confirmed",
        arrivalDate: "2026-10-11",
        departureDate: "2026-10-14",
        actionHints: hints({ canConfirm: false, canCheckIn: true, canNoShow: true }),
      }),
    );
    assert.equal(eligible.primaryAction?.id, "check_in");
    assert.equal(
      eligible.actions.some((action) => action.id === "check_in"),
      true,
    );
    assert.equal(
      eligible.actions.some((action) => action.id === "no_show"),
      true,
    );
    assert.equal(
      eligible.actions.some((action) => action.id === "confirm"),
      false,
    );
  });

  it("does not offer no-show from the date alone", () => {
    const dated = getReservationActions(
      input({
        status: "confirmed",
        arrivalDate: "2026-10-10",
        departureDate: "2026-10-14",
        actionHints: hints({ canConfirm: false, canNoShow: false, canCheckIn: true }),
      }),
    );
    assert.equal(
      dated.actions.some((action) => action.id === "no_show"),
      false,
    );
    assert.equal(dated.primaryAction?.id, "check_in");
  });

  it("removes edit from a confirmed stay that departed before the business date", () => {
    const result = getReservationActions(
      input({
        status: "confirmed",
        arrivalDate: "2026-10-01",
        departureDate: "2026-10-08",
        actionHints: hints({
          canConfirm: false,
          canCheckIn: true,
          canCancel: true,
          canEdit: true,
          canNoShow: true,
        }),
      }),
    );
    assert.equal(result.editable, false);
    assert.equal(result.historical, true);
    assert.equal(
      result.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "check_in"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "no_show"),
      true,
    );
    assert.equal(result.primaryAction, null);
  });

  it("keeps an in-house stay operational without normal edit", () => {
    const result = getReservationActions(
      input({
        status: "checked_in",
        arrivalDate: "2026-10-08",
        departureDate: "2026-10-12",
        roomAssigned: true,
        actionHints: hints({
          canEdit: true,
          canConfirm: false,
          canCancel: false,
          canAssignRoom: false,
          canCheckOut: true,
          canChangeRoom: true,
          canOpenFolio: true,
        }),
      }),
    );
    assert.equal(result.editable, false);
    assert.equal(result.historical, false);
    assert.equal(result.primaryAction?.id, "check_out");
    assert.equal(
      result.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "check_out"),
      true,
    );
    assert.equal(
      result.actions.some((action) => action.id === "change_room"),
      true,
    );
    assert.equal(
      result.actions.some((action) => action.id === "assign_room"),
      false,
    );
    assert.equal(
      result.actions.some((action) => action.id === "open_folio"),
      true,
    );
    assert.equal(
      getReservationActions(
        input({
          status: "checked_in",
          arrivalDate: "2026-10-08",
          departureDate: "2026-10-09",
          roomAssigned: true,
          actionHints: hints({
            canEdit: true,
            canConfirm: false,
            canCancel: false,
            canCheckOut: false,
            canChangeRoom: false,
          }),
        }),
      ).historical,
      false,
    );
  });

  it("keeps checked-out, cancelled, and no-show read-only except hinted utilities", () => {
    const checkedOut = getReservationActions(
      input({
        status: "checked_out",
        arrivalDate: "2026-10-08",
        departureDate: "2026-10-10",
        roomAssigned: true,
        actionHints: hints({
          canEdit: true,
          canConfirm: false,
          canCancel: false,
          canCheckIn: true,
          canCheckOut: true,
          canOpenFolio: false,
        }),
      }),
    );
    assert.equal(checkedOut.editable, false);
    assert.equal(checkedOut.historical, true);
    assert.equal(checkedOut.primaryAction, null);
    assert.deepEqual(
      checkedOut.actions.map((action) => action.id),
      ["open", "print"],
    );
    const withFolio = getReservationActions(
      input({
        status: "checked_out",
        arrivalDate: "2026-10-08",
        departureDate: "2026-10-10",
        actionHints: hints({
          canEdit: false,
          canConfirm: false,
          canCancel: false,
          canOpenFolio: true,
        }),
      }),
    );
    assert.equal(
      withFolio.actions.some((action) => action.id === "open_folio"),
      true,
    );
    assert.equal(withFolio.editable, false);

    const cancelled = getReservationActions(
      input({
        status: "cancelled",
        actionHints: hints({ canEdit: true, canConfirm: true, canReactivate: false }),
      }),
    );
    assert.equal(cancelled.editable, false);
    assert.equal(
      cancelled.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      cancelled.actions.some((action) => action.id === "reactivate"),
      false,
    );
    assert.equal(
      getReservationActions(
        input({
          status: "cancelled",
          actionHints: hints({
            canEdit: true,
            canConfirm: false,
            canCancel: false,
            canReactivate: true,
          }),
        }),
      ).actions.some((action) => action.id === "reactivate"),
      true,
    );

    const noShow = getReservationActions(
      input({
        status: "no_show",
        arrivalDate: "2026-10-10",
        departureDate: "2026-10-12",
        actionHints: hints({
          canEdit: true,
          canConfirm: false,
          canCancel: false,
          canOpenFolio: true,
        }),
      }),
    );
    assert.equal(noShow.editable, false);
    assert.equal(
      noShow.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      noShow.actions.some((action) => action.id === "print"),
      true,
    );
    assert.equal(
      noShow.actions.some((action) => action.id === "open_folio"),
      true,
    );
  });

  it("lets a refused hint or a non-managing role block an otherwise valid action", () => {
    assert.equal(
      ids({
        status: "confirmed",
        arrivalDate: BUSINESS_DATE,
        departureDate: "2026-10-14",
        actionHints: hints({ canConfirm: false, canCheckIn: false }),
      }).includes("check_in"),
      false,
    );
    const blocked = getReservationActions(input({ role: "housekeeping" }));
    assert.equal(blocked.editable, false);
    assert.equal(
      blocked.actions.some((action) => action.id === "confirm"),
      false,
    );
    assert.equal(
      blocked.actions.some((action) => action.id === "edit"),
      false,
    );
    assert.equal(
      blocked.actions.some((action) => action.id === "print"),
      true,
    );
    assert.equal(getReservationActions(input({ role: "owner" })).editable, true);
    assert.equal(getReservationActions(input({ role: "manager" })).editable, true);
  });

  it("compares stay dates to the supplied business date and does not treat print as edit", () => {
    const departingToday = getReservationActions(
      input({ arrivalDate: "2026-10-09", departureDate: BUSINESS_DATE }),
    );
    assert.equal(departingToday.historical, false);
    assert.equal(departingToday.editable, true);
    const departedYesterday = getReservationActions(
      input({ arrivalDate: "2026-10-08", departureDate: "2026-10-10" }),
    );
    assert.equal(departedYesterday.historical, true);
    assert.equal(departedYesterday.editable, false);
    assert.equal(helper.includes("new Date("), false);
    assert.match(dates, /export function canManageReservations/);
    assert.match(server, /canManageReservations/);
    assert.match(server, /RESERVATION_MANAGE_ROLES/);
  });

  it("includes copy stay only as the implemented reservation command", () => {
    assert.match(commands, /export const copyReservation/);
    assert.equal(ids().includes("copy"), true);
    assert.equal(ids({ actionHints: hints({ canCopyStay: false }) }).includes("copy"), false);
    assert.equal(helper.includes("amend_history"), false);
    assert.equal(helper.includes("force_checkout"), false);
    assert.equal(helper.includes("reopen_stay"), false);
    assert.doesNotMatch(helper, /supabase|mutate\(|setReservationStatus|window\.print/);
  });

  it("leaves the desk menu on its own presenter", () => {
    assert.equal(detail.includes("getReservationActions"), true);
    assert.match(deskMenu, /export function getReservationContextActions/);
    assert.equal(deskMenu.includes("getReservationActions"), false);
  });
});
