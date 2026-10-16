import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0138_cashiering_service_charges.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0138_cashiering_service_charges.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const dialog = readFileSync(
  new URL("../components/cashiering/post-charge-dialog.tsx", import.meta.url),
  "utf8",
);
const panels = readFileSync(
  new URL("../components/cashiering/folio-workspace-panels.tsx", import.meta.url),
  "utf8",
);
const invoiceSqlStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.build_guest_folio_invoice_snapshot");
const previewSql = sql.slice(
  sql.indexOf("CREATE OR REPLACE FUNCTION public.preview_folio_service_charge"),
  sql.indexOf("CREATE OR REPLACE FUNCTION public.post_folio_service_charge"),
);
const listSql = sql.slice(
  sql.indexOf("CREATE OR REPLACE FUNCTION public.list_chargeable_guest_services"),
  sql.indexOf("CREATE OR REPLACE FUNCTION public.preview_folio_service_charge"),
);

describe("structured guest-service folio charges", () => {
  it("keeps the service-charge SQL dual-lane and server-derived", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /chargeable_to_folio boolean NOT NULL DEFAULT false/);
    assert.match(sql, /is_billing_department boolean NOT NULL DEFAULT false/);
    assert.match(sql, /pms_guest_service_billing_dept_unique/);
    assert.match(sql, /charge_source/);
    assert.match(sql, /charge_snapshot jsonb/);
    assert.match(previewSql, /resolve_chargeable_guest_service/);
    assert.match(previewSql, /preview_folio_charge/);
    assert.doesNotMatch(previewSql, /INSERT INTO public\.folio_transactions/);
    assert.doesNotMatch(listSql, /INSERT INTO public\.folio_transactions/);
    assert.match(listSql, /'chargeable', t\.chargeable_to_folio/);
    assert.match(listSql, /'priced'/);
    assert.match(listSql, /'currencyMatches'/);
    assert.match(listSql, /LEFT JOIN public\.pms_guest_service_pricing/);
    assert.doesNotMatch(listSql, /t\.chargeable_to_folio = true/);
    assert.match(sql, /post_folio_charge_with_tax/);
    assert.match(sql, /'service'/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.preview_folio_service_charge\(uuid, uuid, uuid, integer\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.post_folio_service_charge\(uuid, uuid, uuid, integer, text, uuid, text\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(sql.slice(invoiceSqlStart), /'chargeSnapshot', t\.charge_snapshot/);
    assert.match(sql.slice(invoiceSqlStart), /'quantity', t\.quantity/);
    assert.match(sql.slice(invoiceSqlStart), /'unitAmount', t\.unit_amount/);
  });

  it("lists, previews, and posts through manager server functions", () => {
    const block = poster.slice(
      poster.indexOf("export const listChargeableGuestServices"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(block, /requireCashierManager/);
    assert.match(block, /list_chargeable_guest_services/);
    assert.match(block, /preview_folio_service_charge/);
    assert.match(block, /post_folio_service_charge/);
    assert.doesNotMatch(block, /unitAmount:\s*data\.|departmentId:\s*data\./);
  });

  it("lets the cashier choose a service or a manual charge without typing the unit price", () => {
    assert.match(dialog, /Service/);
    assert.match(dialog, /Manual/);
    assert.match(dialog, /listChargeableGuestServices/);
    assert.match(dialog, /previewFolioServiceCharge/);
    assert.match(dialog, /postFolioServiceCharge/);
    assert.match(dialog, /data-testid="service-unit-price"/);
    assert.match(dialog, /id="post-charge-department"/);
    assert.match(dialog, /id="post-charge-service"/);
    assert.match(dialog, /blockReason/);
    assert.match(poster, /Turn on Chargeable to folio in Guest & Services/);
    assert.match(poster, /Add an active price in the folio currency/);
    assert.match(poster, /different currency than the folio/);
    assert.doesNotMatch(dialog, /Save as Draft/);
    assert.doesNotMatch(dialog, /id="post-charge-unit/);
    assert.doesNotMatch(dialog, /allocated|captured|tax calculated/i);
    assert.match(panels, />Department</);
    assert.match(panels, />Unit price</);
    assert.match(panels, /departmentName/);
  });
});
