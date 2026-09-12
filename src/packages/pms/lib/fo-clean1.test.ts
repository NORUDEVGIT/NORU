import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FO_ACTIONS, shouldSuppressRestaurantPmsRail } from "./front-office-shell.ts";
import { isStayCancellable } from "./fo-cancel-noshow.ts";

describe("FO-CLEAN1 Bookings cancel host", () => {
  it("embeds FoCancelStepper and does not call setReservationStatus cancelled", () => {
    const src = readFileSync(
      new URL("../components/workspaces/reservation-detail-workspace.tsx", import.meta.url),
      "utf8",
    );
    assert.match(src, /FoCancelStepper/);
    assert.match(src, /stayFromReservation/);
    assert.match(src, /Cancel reservation/);
    assert.match(src, /setReservationStatus/);
    assert.match(src, /status:\s*"confirmed"/);
    assert.match(src, /status:\s*"pending"/);
    assert.doesNotMatch(src, /status:\s*"cancelled"/);
    assert.doesNotMatch(src, /statusMutation\.mutate\(\{[^}]*cancelled/);
    assert.doesNotMatch(src, /Process no-show/);
    assert.doesNotMatch(src, /FoNoShowStepper/);
  });
});

describe("FO-CLEAN1 cancel_fees Live", () => {
  it("marks cancel_fees Live and Side Sheet has no Coming soon for cancel/fee", () => {
    const action = FO_ACTIONS.find((a) => a.id === "cancel_fees");
    assert.equal(action?.lane, "live");
    assert.equal(action?.label, "Cancel policy / fees");

    const sheet = readFileSync(
      new URL("../components/frontoffice/reservation-side-sheet.tsx", import.meta.url),
      "utf8",
    );
    assert.match(sheet, /cancel_fees/);
    assert.match(sheet, /FoCancelStepper/);
    assert.match(sheet, /fo-cancel-fee-summary/);
    assert.match(sheet, /PermissionDeniedPanel/);
    assert.match(sheet, /Cancel & no-show fees|FO_FEE_DEFAULTS_SECTION/);
    assert.doesNotMatch(sheet, /ComingSoonButton label="Cancel policy/);
    assert.doesNotMatch(sheet, /ComingSoonChip/);
    assert.match(sheet, /action\.id === "cancel_fees"/);
    assert.doesNotMatch(sheet, /cancel_fees[\s\S]{0,80}ComingSoon/);

    const frames = readFileSync(
      new URL("../components/frontoffice/front-office-frames.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(frames, /ComingSoonChip label="Cancel fees"/);
    assert.doesNotMatch(frames, /ComingSoonChip label="No-show charges"/);

    const stepper = readFileSync(
      new URL("../components/frontoffice/fo-cancel-noshow-stepper.tsx", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(stepper, /ComingSoonChip/);
    assert.match(stepper, /REFUND_IN_CASHIERING_CTA/);
  });

  it("treats pending and confirmed as cancellable", () => {
    assert.equal(isStayCancellable("pending"), true);
    assert.equal(isStayCancellable("confirmed"), true);
    assert.equal(isStayCancellable("checked_in"), false);
    assert.equal(isStayCancellable("cancelled"), false);
    assert.equal(isStayCancellable("no_show"), false);
  });
});

describe("FO-CLEAN1 honesty locks", () => {
  it("FO-FS0 is unchanged and no migration was added", () => {
    assert.equal(shouldSuppressRestaurantPmsRail("front-office"), true);
    assert.equal(shouldSuppressRestaurantPmsRail("reservations"), false);

    const here = dirname(fileURLToPath(import.meta.url));
    const migrations = join(here, "../../../../drizzle/migrations");
    assert.equal(existsSync(join(migrations, "0045_fo_fee_defaults.sql")), false);
    const names = readdirSync(migrations);
    assert.equal(
      names.some((name) => /0045|fo_fee_defaults|clean1/i.test(name) && name !== "0042_fo_cancel_noshow_fee_defaults.sql"),
      false,
    );
  });
});
