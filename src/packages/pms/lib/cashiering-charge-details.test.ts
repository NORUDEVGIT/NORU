import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("charge details drawer", () => {
  it("keeps charge review read-only and off the payment dialog", () => {
    const sheet = read("../components/cashiering/charge-details-sheet.tsx");
    const panels = read("../components/cashiering/folio-workspace-panels.tsx");
    const page = read("../components/cashiering/guest-folio-page.tsx");

    assert.match(sheet, /Charge Details/);
    assert.match(sheet, /Overview/);
    assert.match(sheet, /Posting Info/);
    assert.match(sheet, /Corrections/);
    assert.match(sheet, /History/);
    assert.match(sheet, /Correct Charge/);
    assert.match(sheet, /Transfer Charge/);
    assert.match(sheet, /\/restaurant\/pms\/reservations\/\$reservationId/);
    assert.match(sheet, /\/restaurant\/pms\/guests\/\$guestId/);
    assert.doesNotMatch(sheet, /Edit Charge|Update Charge|Void|Delete/);
    assert.doesNotMatch(sheet, /allocated|captured|tax calculated/i);
    assert.doesNotMatch(sheet, /<input/);
    assert.doesNotMatch(sheet, /folio_history/);

    assert.match(panels, /bg-\[#C89933\]\/8/);
    assert.match(panels, /border-l-\[#C89933\]/);
    assert.match(panels, />Charge item</);
    assert.match(panels, /colSpan=\{5\}/);
    assert.match(panels, /stopPropagation/);
    assert.match(panels, /chargeItemTitle/);
    assert.match(page, /ChargeDetailsSheet/);
    assert.match(page, /row\.type === "charge"/);
    assert.match(page, /TransactionDetailDialog/);
    assert.match(panels, /Invoice settlement/);
    assert.doesNotMatch(`${sheet}\n${panels}\n${page}`, /captured|tax calculated/i);
  });

  it("keeps historical restaurant_order folio lines readable without RMS", () => {
    const sheet = read("../components/cashiering/charge-details-sheet.tsx");
    const cashiering = read("./cashiering.functions.ts");
    assert.match(sheet, /export function chargeItemTitle/);
    assert.match(sheet, /row\.referenceType === "restaurant_order"\) return row\.description/);
    assert.match(sheet, /row\.referenceType === "restaurant_order"\) return "POS"/);
    assert.match(cashiering, /referenceType: t\.reference_type/);
    assert.match(cashiering, /reference_type, reference_id/);
    assert.doesNotMatch(sheet, /post_order_room_charge|postOrderRoomCharge|rm-receipts/);
    assert.doesNotMatch(cashiering, /post_order_room_charge|packages\/restaurant-management/);
  });
});
