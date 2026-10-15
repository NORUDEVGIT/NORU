import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  deriveFiscalDocumentMode,
  eligiblePaymentTotal,
  FISCAL_CASH_REASON,
  FISCAL_CREDIT_REASON,
  fiscalSettlementSummary,
  type EligibleAllocationRow,
} from "./fiscal-document-mode.ts";
import { assessGuestInvoiceFiscal, type GuestInvoiceFiscalInput } from "./fiscal-guest-invoice.ts";
import { MANUAL_NATURE_MIXED } from "./fiscal-manual-item.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const TAX_ID = "22222222-2222-4222-8222-222222222222";

function row(
  id: string,
  amount: number,
  sourceKind: EligibleAllocationRow["sourceKind"],
  reversesAllocationId: string | null = null,
): EligibleAllocationRow {
  return { id, amount, sourceKind, reversesAllocationId };
}

describe("fiscal document mode", () => {
  it("derives CREDIT until eligible payments cover the original total", () => {
    assert.equal(deriveFiscalDocumentMode(1000, 0), "CREDIT");
    assert.equal(deriveFiscalDocumentMode(1000, 400), "CREDIT");
    assert.equal(deriveFiscalDocumentMode(1000, 800), "CREDIT");
    assert.equal(deriveFiscalDocumentMode(1000, 1000), "CASH");
    assert.equal(deriveFiscalDocumentMode(1000, 1000.005), "CASH");
  });

  it("counts only positive non-reversed payment allocations", () => {
    const rows = [
      row("pay", 1000, "payment"),
      row("deposit", 1000, "deposit"),
      row("write-off", 1000, "other"),
      row("transfer", 1000, "other"),
      row("withholding", 300, "other"),
      row("zero", 0, "payment"),
      row("reversed", 50, "payment"),
      row("reverser", 50, "payment", "reversed"),
    ];
    assert.equal(eligiblePaymentTotal(rows), 1000);
    const cash = fiscalSettlementSummary(1000, eligiblePaymentTotal([row("pay", 1000, "payment")]));
    assert.equal(cash.mode, "CASH");
    assert.equal(cash.unpaid, 0);
    assert.equal(cash.reason, FISCAL_CASH_REASON);
    const credit = fiscalSettlementSummary(1000, 300);
    assert.equal(credit.mode, "CREDIT");
    assert.equal(credit.unpaid, 700);
    assert.equal(credit.reason, FISCAL_CREDIT_REASON);
    assert.equal(fiscalSettlementSummary(1000, 0).mode, "CREDIT");
    assert.equal(
      fiscalSettlementSummary(1000, eligiblePaymentTotal([row("deposit", 1000, "deposit")])).mode,
      "CREDIT",
    );
  });

  it("does not insert a payment while deriving mode or allocating an item code", () => {
    const guest = readFileSync(
      new URL("./fiscal-guest-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const company = readFileSync(
      new URL("./fiscal-company-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const settlement = readFileSync(
      new URL("./fiscal-settlement.server.ts", import.meta.url),
      "utf8",
    );
    assert.match(guest, /loadFiscalSettlement/);
    assert.match(company, /loadFiscalSettlement/);
    assert.match(settlement, /allocate_fiscal_item_code/);
    assert.equal(/from\("folio_transactions"\)[\s\S]{0,120}\.insert/.test(guest), false);
    assert.equal(company.includes("folio_transactions"), false);
    assert.equal(/\.insert\(/.test(settlement), false);
    assert.equal(settlement.includes("post_folio_transaction"), false);
  });
});

function guestInput(overrides: Partial<GuestInvoiceFiscalInput> = {}): GuestInvoiceFiscalInput {
  return {
    issued: true,
    coverageScope: "charge_groups",
    snapshot: {
      version: 2,
      issuedAt: "2026-10-13T06:30:00.000Z",
      document: { issuedNumber: "INV-0007" },
      property: { currencyCode: "ETB" },
      folio: { currency: "ETB", guestName: "Sara Bekele" },
      groups: [
        {
          ok: true,
          description: "Late additional accommodation amount",
          chargeSource: "manual",
          parentTransactionId: "manual-1",
          quantity: null,
          unitAmount: null,
          subtotal: 200,
          taxTotal: 0,
          serviceChargeTotal: 0,
          grossTotal: 200,
          chargeSnapshot: null,
          taxLines: [],
          serviceLines: [],
        },
      ],
      totals: { subtotal: 200, tax: 0, serviceCharge: 0, invoiceTotal: 200 },
    },
    connection: {
      enabled: true,
      taxpayerTin: "0026716178",
      client: "ERP",
      deviceId: "DEVICE-1",
      credentialsConfigured: true,
    },
    mode: null,
    taxMappings: [
      {
        mappingKind: "NO_TAX",
        pmsTaxId: null,
        externalTaxCode: "VAT0",
        active: true,
      },
    ],
    itemMappings: [],
    documentMode: "CREDIT",
    ...overrides,
  };
}

describe("manual charge fiscal identity", () => {
  it("assigns a supplied item code, PCS, and quantity 1 without a catalogue mapping", () => {
    const result = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ manualItemCodes: { "manual-1": "1004" } }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(result.payload.Mode, "CREDIT");
    assert.equal(result.payload.info.ValueDetails.TotalValue, 200);
    assert.equal(line.ItemCode, 1004);
    assert.equal(line.Unit, "PCS");
    assert.equal(line.Quantity, 1);
    assert.equal(line.UnitPrice, 200);
    assert.equal(line.PreTaxValue, 200);
    assert.equal(line.TaxCode, "VAT0");
    assert.equal(line.TaxAmount, 0);
    assert.equal(line.NatureOfSupplies, "service");
    assert.equal(line.ProductDescription, "Late additional accommodation amount");
    const again = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ manualItemCodes: { "manual-1": "1004" } }),
    );
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.payload.info.ItemList[0].ItemCode, 1004);
  });

  it("keeps a missing catalogue charge blocked and does not invent an item code", () => {
    const missing = assessGuestInvoiceFiscal(INVOICE_ID, guestInput());
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.reasons.join(" "), /Missing item mapping/);
    const room = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({
        allowPreviewManualCode: true,
        snapshot: {
          ...(guestInput().snapshot as Record<string, unknown>),
          groups: [
            {
              ok: true,
              description: "Room Accommodation",
              chargeSource: "room",
              parentTransactionId: "room-1",
              subtotal: 200,
              taxTotal: 0,
              serviceChargeTotal: 0,
              grossTotal: 200,
              chargeSnapshot: null,
              taxLines: [],
              serviceLines: [],
            },
          ],
        },
      }),
    );
    assert.equal(room.ok, false);
    if (room.ok) return;
    assert.match(room.reasons.join(" "), /Missing item mapping/);
  });

  it("uses frozen tax rows and refuses a mixed goods and service default", () => {
    const taxed = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({
        manualItemCodes: { "manual-1": "1004" },
        taxMappings: [
          {
            mappingKind: "TAX",
            pmsTaxId: TAX_ID,
            externalTaxCode: "VAT15",
            active: true,
          },
          { mappingKind: "NO_TAX", pmsTaxId: null, externalTaxCode: "VAT0", active: true },
        ],
        snapshot: {
          ...(guestInput().snapshot as Record<string, unknown>),
          groups: [
            {
              ok: true,
              description: "Late additional accommodation amount",
              chargeSource: "manual",
              parentTransactionId: "manual-1",
              subtotal: 200,
              taxTotal: 30,
              serviceChargeTotal: 0,
              grossTotal: 230,
              chargeSnapshot: null,
              taxLines: [
                {
                  name: "Value Added Tax (VAT)",
                  amount: 30,
                  taxSnapshot: { taxId: TAX_ID, name: "Value Added Tax (VAT)" },
                },
              ],
              serviceLines: [],
            },
          ],
          totals: { subtotal: 200, tax: 30, serviceCharge: 0, invoiceTotal: 230 },
        },
      }),
    );
    assert.equal(taxed.ok, true);
    if (!taxed.ok) return;
    assert.equal(taxed.payload.info.ItemList[0].TaxCode, "VAT15");
    assert.equal(taxed.payload.info.ItemList[0].TaxAmount, 30);
    assert.equal(taxed.payload.info.ValueDetails.TotalValue, 230);

    const mixed = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({
        allowPreviewManualCode: true,
        itemMappings: [
          {
            serviceTypeId: null,
            departmentId: null,
            chargeSource: "room",
            isDefault: false,
            externalItemCode: "1001",
            externalUnit: "PCS",
            natureOfSupplies: "service",
            harmonizationCode: null,
            active: true,
          },
          {
            serviceTypeId: null,
            departmentId: null,
            chargeSource: "minibar",
            isDefault: false,
            externalItemCode: "1002",
            externalUnit: "PCS",
            natureOfSupplies: "goods",
            harmonizationCode: null,
            active: true,
          },
        ],
        snapshot: {
          ...(guestInput().snapshot as Record<string, unknown>),
          groups: [
            {
              ok: true,
              description: "Room",
              chargeSource: "room",
              parentTransactionId: "room-1",
              subtotal: 100,
              taxTotal: 0,
              serviceChargeTotal: 0,
              grossTotal: 100,
              chargeSnapshot: null,
              taxLines: [],
              serviceLines: [],
            },
            {
              ok: true,
              description: "Minibar",
              chargeSource: "minibar",
              parentTransactionId: "goods-1",
              subtotal: 50,
              taxTotal: 0,
              serviceChargeTotal: 0,
              grossTotal: 50,
              chargeSnapshot: null,
              taxLines: [],
              serviceLines: [],
            },
            {
              ok: true,
              description: "Late additional accommodation amount",
              chargeSource: "manual",
              parentTransactionId: "manual-1",
              subtotal: 50,
              taxTotal: 0,
              serviceChargeTotal: 0,
              grossTotal: 50,
              chargeSnapshot: null,
              taxLines: [],
              serviceLines: [],
            },
          ],
          totals: { subtotal: 200, tax: 0, serviceCharge: 0, invoiceTotal: 200 },
        },
      }),
    );
    assert.equal(mixed.ok, false);
    if (mixed.ok) return;
    assert.equal(mixed.reasons.includes(MANUAL_NATURE_MIXED), true);
  });

  it("does not ask the operator for an item code, unit, or catalogue service on a manual charge", () => {
    const dialog = readFileSync(
      new URL("../../components/cashiering/post-charge-dialog.tsx", import.meta.url),
      "utf8",
    );
    const poster = readFileSync(new URL("../cashiering.functions.ts", import.meta.url), "utf8");
    const entry = poster.slice(poster.indexOf("export const postFolioEntry"));
    const manual = entry.slice(0, entry.indexOf("const { supabaseAdmin }"));
    const service = poster.slice(poster.indexOf("export const postFolioServiceCharge"));
    assert.equal(dialog.includes("ItemCode"), false);
    assert.equal(dialog.includes('id="post-charge-unit"'), false);
    assert.equal(dialog.includes("NatureOfSupplies"), false);
    assert.match(manual, /description: z\.string\(\)\.min\(1\)\.max\(200\)/);
    assert.match(manual, /amount: z\.number\(\)\.finite\(\)/);
    assert.equal(manual.includes("serviceTypeId"), false);
    assert.match(manual, /requireCashierManager/);
    assert.match(service, /serviceTypeId: idSchema/);
  });
});
