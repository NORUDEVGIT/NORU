import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0137_cashiering_charge_preview.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0137_cashiering_charge_preview.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const dialog = readFileSync(
  new URL("../components/cashiering/post-charge-dialog.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../components/cashiering/guest-folio-page.tsx", import.meta.url),
  "utf8",
);

describe("manual charge preview", () => {
  it("keeps the preview SQL dual-lane and read-only", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /preview_folio_charge/);
    assert.match(sql, /resolve_folio_tax_rows\(_restaurant_id, 'folio', NULL\)/);
    assert.match(sql, /resolve_folio_service_charge_rows\(_restaurant_id, 'folio'\)/);
    assert.match(sql, /compute_folio_tax_component_amount/);
    assert.doesNotMatch(sql, /INSERT/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.preview_folio_charge\(uuid, uuid, numeric\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.preview_folio_charge\(uuid, uuid, numeric\) TO service_role/,
    );
  });

  it("previews through the manager server function and posts through the existing writer", () => {
    const preview = poster.slice(
      poster.indexOf("export const previewFolioCharge"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(preview, /requireCashierManager/);
    assert.match(preview, /preview_folio_charge/);
    const post = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const previewFolioCharge"),
    );
    assert.match(post, /callPostFolioTransaction/);
    assert.match(post, /categoryForType/);
    assert.match(post, /idempotencyKey/);
  });

  it("opens a manual-charge overlay from the folio workspace", () => {
    assert.match(page, /PostChargeDialog/);
    assert.match(page, /entryType === "charge"/);
    assert.match(dialog, /Manual Charge/);
    assert.match(dialog, /postFolioEntry/);
    assert.match(dialog, /previewFolioCharge/);
    assert.match(dialog, /No tax or service charge applies/);
    assert.doesNotMatch(dialog, /Save as Draft|Unit Price|Department|Quantity/);
    assert.doesNotMatch(dialog, /allocated|captured|tax calculated/i);
  });
});
