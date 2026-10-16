import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("guest folio operations", () => {
  it("uses the canonical folio route and redirects the legacy page", () => {
    const page = read("../../../routes/restaurant/pms/cashiering.folios.$folioId.tsx");
    const legacy = read("../../../routes/restaurant/cashiering/folios/$folioId.tsx");
    assert.match(page, /\/restaurant\/pms\/cashiering\/folios\/\$folioId/);
    assert.match(legacy, /to: "\/restaurant\/pms\/cashiering\/folios\/\$folioId"/);
    assert.match(legacy, /replace: true/);
  });

  it("records ledger lines without claiming tax, allocation, or capture", () => {
    const dialogs = read("../components/cashiering/folio-dialogs.tsx");
    const page = read("../components/cashiering/guest-folio-page.tsx");
    assert.match(dialogs, /This records a ledger line/);
    assert.match(dialogs, /folio credit/);
    assert.match(dialogs, /close_guest_folio|balance is zero/);
    assert.match(page, /not an issued invoice/);
    assert.match(page, /Add deposit credit/);
    assert.doesNotMatch(`${dialogs}\n${page}`, /allocated|captured|tax calculated/i);
  });

  it("keeps close and posting on the existing writers", () => {
    const writer = read("./cashiering.functions.ts");
    const close = writer.slice(
      writer.indexOf("export const closeFolio"),
      writer.indexOf("export const listCashierShifts"),
    );
    const post = writer.slice(
      writer.indexOf("export const postFolioEntry"),
      writer.indexOf("export const closeFolio"),
    );
    assert.match(close, /close_guest_folio/);
    assert.match(post, /callPostFolioTransaction/);
    assert.match(post, /idempotencyKey/);
  });

  it("opens the folio page from the quick view instead of posting there", () => {
    const desk = read("../components/cashiering/cashiering-desk.tsx");
    const quick = desk.slice(
      desk.indexOf("function FolioQuickView"),
      desk.indexOf("function PaymentsPanel"),
    );
    assert.match(quick, /Open folio/);
    assert.match(quick, /\/restaurant\/pms\/cashiering\/folios\/\$folioId/);
    assert.doesNotMatch(quick, /postFolioEntry|FolioEntryDialog/);
  });
});
