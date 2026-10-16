import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatDepositPolicyResult } from "./payments-card3.server.ts";
import {
  TENDER_NOT_ACTIVE,
  TENDER_NOT_FOLIO,
  cashieringTenderOptions,
  folioTenderFromCatalogue,
} from "./pms-polish1-payment-admin.ts";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0112_cashiering_phase4_tender_required.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0112_cashiering_phase4_tender_required.sql",
    import.meta.url,
  ),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const checkout = readFileSync(
  new URL("../components/frontoffice/fo-check-out-stepper.tsx", import.meta.url),
  "utf8",
);
const dialogs = readFileSync(
  new URL("../components/cashiering/folio-dialogs.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 4 settings-backed posting", () => {
  it("rejects an inactive method and a city-ledger method before a row exists", () => {
    const inactive = folioTenderFromCatalogue("cheque", [
      { code: "card", active: true, typeClass: "card" },
    ]);
    assert.equal(inactive.ok, false);
    assert.equal(inactive.ok ? "" : inactive.message, TENDER_NOT_ACTIVE);

    const city = folioTenderFromCatalogue("city", [
      { code: "city", active: true, typeClass: "city_ledger" },
    ]);
    assert.equal(city.ok, false);
    assert.equal(city.ok ? "" : city.message, TENDER_NOT_FOLIO);

    assert.deepEqual(
      cashieringTenderOptions({
        available: true,
        methods: [
          { code: "cash", name: "Cash", active: true, typeClass: "cash" },
          { code: "city", name: "Account", active: true, typeClass: "city_ledger" },
          { code: "card", name: "Card", active: false, typeClass: "card" },
        ],
      }),
      [{ code: "cash", name: "Cash" }],
    );

    const entry = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const closeFolio"),
    );
    assert.ok(
      entry.indexOf("folioTenderFromCatalogue") < entry.indexOf("callPostFolioTransaction"),
    );
    assert.match(entry, /if \(!tender\.ok\) return/);
  });

  it("requires a payment method and stores the entered signed amount for tenders", () => {
    const entry = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(entry, /Math\.round\(data\.amount \* 100\) \/ 100/);
    assert.equal(sql, supabaseSql);
    assert.match(sql, /PAYMENT_METHOD_REQUIRED/);
    assert.match(sql, /signed := _amount/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
  });

  it("shows the deposit policy result and active checkout methods without posting the policy amount", () => {
    const summary = formatDepositPolicyResult(
      { name: "Standard", required: true, depositType: "fixed", depositValue: 200 },
      "GBP",
    );
    assert.match(summary ?? "", /Standard: a fixed GBP 200/);
    assert.match(summary ?? "", /not posted automatically/);
    assert.match(dialogs, /depositPolicySummary/);
    assert.doesNotMatch(dialogs, /setAmount\(depositPolicy/);
    assert.match(checkout, /cashieringTenderOptions/);
    assert.doesNotMatch(checkout, /SETTLEMENT_METHOD_CHIPS/);
  });
});
