import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FO_ACTIONS,
  actionsForMenu,
  shouldSuppressRestaurantPmsRail,
} from "./front-office-shell.ts";
import {
  COMPANIONS_UNAVAILABLE,
  GUEST_REQUESTS_UNAVAILABLE,
  NAMED_PARTY_EXCEEDED,
  RATE_IMPACT_UNAVAILABLE,
  REASON_MIN_CHARS,
  SPECIAL_REQUEST_CATEGORY_UNAVAILABLE,
  amendmentEventLabel,
  canConfirmAmend,
  canConfirmGuestRequest,
  canConfirmGuests,
  canConfirmService,
  canConfirmSpecialRequest,
  canConfirmUpgrade,
  companionTypeFromDob,
  companionsPersistError,
  guestRequestPersistError,
  guestSearchEmpty,
  hasPersistedRate,
  isReasonComplete,
  namedPartyExceeded,
  occupancyBlockMessage,
  occupancyExceeded,
  rateImpact,
  servicePostsToFolio,
  stayGuestLine,
  targetRoomRequired,
  upgradeRoomBlocked,
} from "./fo-amendments.ts";

describe("FO-FS4 reason gating", () => {
  it("blocks Confirm until the reason is at least 3 characters", () => {
    assert.equal(REASON_MIN_CHARS, 3);
    assert.equal(isReasonComplete("ab"), false);
    assert.equal(isReasonComplete("abc"), true);
    assert.equal(canConfirmAmend({ formValid: true, reasonOk: false }), false);
    assert.equal(canConfirmAmend({ formValid: true, reasonOk: true }), true);
    assert.equal(
      canConfirmUpgrade({
        targetRoomTypeId: "type-2",
        currentRoomTypeId: "type-1",
        targetRoomId: "room-2",
        roomRequired: true,
        roomBlocked: false,
        reason: "ab",
      }),
      false,
    );
    assert.equal(
      canConfirmUpgrade({
        targetRoomTypeId: "type-2",
        currentRoomTypeId: "type-1",
        targetRoomId: "room-2",
        roomRequired: true,
        roomBlocked: false,
        reason: "Guest asked for a sea view",
      }),
      true,
    );
  });

  it("Guest Request uses the request text as the auditable statement", () => {
    assert.equal(canConfirmGuestRequest({ text: "ab" }), false);
    assert.equal(canConfirmGuestRequest({ text: "Extra towels please" }), true);
  });
});

describe("FO-FS4 capacity block", () => {
  it("blocks Confirm when adults + children exceed max occupancy", () => {
    assert.equal(occupancyExceeded(2, 1, 2), true);
    assert.equal(occupancyExceeded(2, 0, 2), false);
    assert.match(occupancyBlockMessage(2, 1, 2) ?? "", /maximum occupancy/);
    assert.equal(
      canConfirmGuests({ adults: 3, children: 1, maxOccupancy: 3, reason: "Family arrived" }),
      false,
    );
    assert.equal(
      canConfirmGuests({ adults: 2, children: 1, maxOccupancy: 3, reason: "Family arrived" }),
      true,
    );
    assert.equal(namedPartyExceeded(3, 3), true);
    assert.equal(namedPartyExceeded(2, 3), false);
    assert.equal(
      canConfirmGuests({
        adults: 2,
        children: 0,
        maxOccupancy: 2,
        reason: "Add companion",
        companionCount: 2,
        pendingAttach: true,
      }),
      false,
    );
    assert.match(NAMED_PARTY_EXCEEDED, /companions/);
    assert.equal(companionTypeFromDob(null), null);
    assert.equal(companionTypeFromDob("2010-01-01", "2026-09-12"), "Child");
    assert.equal(companionTypeFromDob("1990-01-01", "2026-09-12"), "Adult");
    assert.equal(stayGuestLine("Jane Doe", null), "Jane Doe");
    assert.equal(stayGuestLine("Jane Doe", "Adult"), "Jane Doe · Adult");
    assert.equal(guestSearchEmpty({ search: "xyz", results: [], loading: false }), true);
    assert.equal(
      companionsPersistError({ message: "Could not find the table 'public.fo_stay_companions' in the schema cache" })
        .message,
      COMPANIONS_UNAVAILABLE,
    );
  });
});

describe("FO-FS4 rate-unavailable honesty", () => {
  it("never invents a rate when snapshot and subtotal are missing", () => {
    assert.equal(hasPersistedRate({ roomSubtotal: null, nightlyRates: [] }), false);
    assert.deepEqual(rateImpact({ roomSubtotal: null, nightlyRates: [] }), {
      kind: "unavailable",
      label: RATE_IMPACT_UNAVAILABLE,
    });
    assert.equal(RATE_IMPACT_UNAVAILABLE, "Rate impact unavailable");
    const available = rateImpact({
      roomSubtotal: 180,
      nightlyRates: [{ date: "2026-09-12", rate: 90 }],
      nextRoomSubtotal: null,
    });
    assert.equal(available.kind, "available");
    if (available.kind === "available") {
      assert.equal(available.previous, 180);
      assert.equal(available.next, null);
    }
  });
});

describe("FO-FS4 service post honesty", () => {
  it("posts to folio only when amount is greater than zero", () => {
    assert.equal(servicePostsToFolio(12.5), true);
    assert.equal(servicePostsToFolio(0), false);
    assert.equal(canConfirmService({ name: "Late checkout", amount: 0, quantity: 1, reason: "Guest asked" }), true);
    assert.equal(canConfirmService({ name: "", amount: 10, quantity: 1, reason: "Guest asked" }), false);
  });

  it("service wrapper posts charge when amount > 0 and skips the RPC when amount is 0", () => {
    const fns = readFileSync(new URL("./fo-amendments.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /post_folio_transaction/);
    assert.match(fns, /_type: "charge"/);
    assert.match(fns, /_category: "manual"/);
    assert.match(fns, /open_folio_for_reservation/);
    assert.match(fns, /servicePostsToFolio/);
    assert.doesNotMatch(fns, /menu_items/);
    assert.doesNotMatch(fns, /_type: "refund"/);
    assert.doesNotMatch(fns, /yield|reprice|repric/i);
    const addService = fns.slice(fns.indexOf("export const addStayService"));
    assert.ok(addService.indexOf("servicePostsToFolio") < addService.indexOf("post_folio_transaction"));
  });
});

describe("FO-FS4 upgrade persist", () => {
  it("uses amend + assign of the new type and never calls moveReservationRoom", () => {
    const fns = readFileSync(new URL("./fo-amendments.functions.ts", import.meta.url), "utf8");
    assert.match(fns, /amend_hotel_reservation/);
    assert.match(fns, /assignReservationRoom|listAssignableRooms/);
    assert.doesNotMatch(fns, /moveReservationRoom/);
    assert.doesNotMatch(fns, /move_hotel_reservation_room/);
    assert.doesNotMatch(fns, /amend_hotel_reservation_priced/);
    assert.equal(targetRoomRequired({ status: "checked_in", roomId: "r1" }), true);
    assert.equal(targetRoomRequired({ status: "pending", roomId: null }), false);
    assert.equal(upgradeRoomBlocked({ status: "out_of_order" }).blocked, true);
    assert.equal(upgradeRoomBlocked({ status: "out_of_service" }).blocked, true);
    assert.equal(upgradeRoomBlocked({ status: "available" }).blocked, false);
  });
});

describe("FO-FS4 special request + guest request", () => {
  it("requires category and text, and fails clearly when 0043 is missing", () => {
    assert.equal(
      canConfirmSpecialRequest({ category: "", text: "Near lift", reason: "Guest asked" }),
      false,
    );
    assert.equal(
      canConfirmSpecialRequest({ category: "accessibility", text: "Near lift", reason: "Guest asked" }),
      true,
    );
    assert.equal(
      guestRequestPersistError({ message: "Could not find the table 'public.fo_guest_requests' in the schema cache" })
        .message,
      GUEST_REQUESTS_UNAVAILABLE,
    );
    assert.equal(SPECIAL_REQUEST_CATEGORY_UNAVAILABLE.includes("0043"), true);
  });
});

describe("FO-FS4 history labels", () => {
  it("covers live event types including room_moved and stay date changes", () => {
    assert.equal(amendmentEventLabel("room_moved"), "Room moved");
    assert.equal(amendmentEventLabel("stay_extended"), "Stay extended");
    assert.equal(amendmentEventLabel("stay_shortened"), "Stay shortened");
    assert.equal(amendmentEventLabel("stay_dates_changed"), "Stay dates changed");
    assert.equal(amendmentEventLabel("check_in"), "Checked in");
    assert.equal(amendmentEventLabel("check_out"), "Checked out");
    assert.equal(amendmentEventLabel("repriced"), "Repriced");
    assert.equal(amendmentEventLabel("amended"), "Amended");
  });
});

describe("FO-FS4 action lanes", () => {
  it("flips the five amend types Live and cancel_fees Live", () => {
    const live = ["upgrade_downgrade", "add_remove_guest", "add_service", "add_special_request", "guest_request"];
    for (const id of live) {
      const action = FO_ACTIONS.find((a) => a.id === id);
      assert.ok(action, id);
      assert.equal(action?.lane, "live");
    }
    assert.equal(FO_ACTIONS.find((a) => a.id === "cancel_fees")?.lane, "live");
    assert.equal(FO_ACTIONS.find((a) => a.id === "room_move")?.lane, "live");
    assert.equal(FO_ACTIONS.find((a) => a.id === "extend_stay")?.lane, "live");
    assert.equal(FO_ACTIONS.find((a) => a.id === "amend_notes")?.lane, "live");
    assert.ok(actionsForMenu("quick").some((a) => a.id === "guest_request" && a.lane === "live"));
    assert.ok(actionsForMenu("sheet").some((a) => a.id === "upgrade_downgrade" && a.lane === "live"));
  });
});

describe("FO-FS0 rail lock", () => {
  it("shouldSuppressRestaurantPmsRail(\"front-office\") still true", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("dashboard"), false);
    const shell = readFileSync(new URL("../../../core/components/restaurant-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /shouldSuppressRestaurantPmsRail/);
    assert.match(shell, /hidePackageRail/);
  });
});

describe("FO-FS4 source locks", () => {
  it("does not add Void, yield rebuild, or restaurant extras catalogue", () => {
    const sheet = readFileSync(new URL("../components/frontoffice/fo-amend-sheet.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(sheet, /\bVoid\b/);
    assert.doesNotMatch(sheet, /menu_items/);
    assert.doesNotMatch(sheet, /yield|reprice/i);
    assert.match(sheet, /RATE_IMPACT_UNAVAILABLE/);
    assert.match(sheet, /FoAmendUpgradeSheet/);
    assert.match(sheet, /FoAmendGuestsSheet/);
    assert.match(sheet, /FoAmendServiceSheet/);
    assert.match(sheet, /FoAmendSpecialRequestSheet/);
    assert.match(sheet, /FoGuestRequestSheet/);

    const frames = readFileSync(new URL("../components/frontoffice/front-office-frames.tsx", import.meta.url), "utf8");
    assert.match(frames, /Upgrade \/ Downgrade/);
    assert.match(frames, /Add Service/);
    assert.match(frames, /Guest Request/);
    assert.match(frames, /FoAmendUpgradeSheet/);

    const workspace = readFileSync(
      new URL("../components/workspaces/front-office-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(workspace, /shouldSuppressRestaurantPmsRail/);
  });
});
