import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  computeExclusiveTaxLines,
  computeTaxComponentAmount,
  splitInclusiveGross,
} from "./cashiering-tax.ts";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0135_cashiering_phase4_tax_on_post.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql",
    import.meta.url,
  ),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const folioPage = readFileSync(
  new URL("../components/cashiering/guest-folio-page.tsx", import.meta.url),
  "utf8",
);
const folioBits = readFileSync(
  new URL("../components/cashiering/folio-bits.tsx", import.meta.url),
  "utf8",
);
const taxesUi = readFileSync(
  new URL("../components/settings/pms-property-setup-card3-taxes.tsx", import.meta.url),
  "utf8",
);
const taxesFns = readFileSync(new URL("./taxes-card3.functions.ts", import.meta.url), "utf8");

describe("Cashiering Phase 4 tax on post", () => {
  it("keeps dual-lane SQL and ledger primitives for tax lines", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /tax_snapshot jsonb/);
    assert.match(sql, /'tax','service_charge'/);
    assert.match(sql, /default_room_tax_group_id/);
    assert.match(sql, /resolve_folio_tax_rows/);
    assert.match(sql, /resolve_folio_service_charge_rows/);
    assert.match(sql, /post_folio_charge_with_tax/);
    assert.match(sql, /append_folio_tax_and_service_lines/);
    assert.match(sql, /WHEN 'room' THEN 'room' ELSE 'folio' END/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
  });

  it("routes manual charges through the tax-aware RPC", () => {
    const entry = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(entry, /callPostFolioTransaction/);
    assert.match(sql, /_category IN \('manual', 'room'\)/);
  });

  it("rounds exclusive and inclusive fixtures per line", () => {
    const exclusive = computeExclusiveTaxLines(100, [{ code: "VAT", rate: 20 }]);
    assert.equal(exclusive.netBase, 100);
    assert.equal(exclusive.lines[0]?.amount, 20);

    const inclusive = splitInclusiveGross(120, [
      { chargeType: "percentage", rate: 20, calculation: "inclusive" },
    ]);
    assert.equal(inclusive.lines[0], 20);
    assert.equal(inclusive.netBase, 100);

    assert.equal(
      computeTaxComponentAmount(100, {
        chargeType: "percentage",
        rate: 20,
        calculation: "exclusive",
      }),
      20,
    );
  });

  it("surfaces tax lines in folio UI and default room tax group in Settings", () => {
    assert.match(folioBits, /tax: "Tax"/);
    assert.match(folioBits, /service_charge: "Service charge"/);
    assert.match(folioPage, /Settings at post time/);
    assert.match(taxesUi, /card3-default-room-tax-group/);
    assert.match(taxesUi, /Default room tax group/);
    assert.match(taxesFns, /saveDefaultRoomTaxGroupCard3/);
    assert.match(taxesFns, /default_room_tax_group_id/);
  });
});
