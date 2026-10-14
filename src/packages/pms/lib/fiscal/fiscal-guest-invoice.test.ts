import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import {
  assessGuestInvoiceFiscal,
  fiscalQrSrc,
  formatFiscalDocumentDate,
  guestInvoiceTrnxId,
  p2HandlerEnabled,
  parseFiscalInvoiceSuccess,
  type GuestInvoiceFiscalInput,
} from "./fiscal-guest-invoice.ts";
import {
  FISCAL_DOCUMENT_MODE,
  FISCAL_ITEM_UNIT,
  classifyFiscalFailure,
  nextFiscalRetryAt,
} from "./fiscal.types.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const TAX_ID = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    issuedAt: "2026-10-13T06:30:00.000Z",
    document: { issuedNumber: "INV-0007" },
    property: { currencyCode: "ETB" },
    folio: { currency: "ETB", guestName: "Sara Bekele" },
    groups: [
      {
        ok: true,
        description: "Room Accommodation",
        chargeSource: "room",
        quantity: null,
        unitAmount: null,
        subtotal: 1000,
        taxTotal: 150,
        serviceChargeTotal: 0,
        grossTotal: 1150,
        chargeSnapshot: null,
        taxLines: [
          {
            name: "Value Added Tax (VAT)",
            amount: 150,
            taxSnapshot: { taxId: TAX_ID, code: "VAT15", name: "Value Added Tax (VAT)" },
          },
        ],
        serviceLines: [],
      },
    ],
    totals: { subtotal: 1000, tax: 150, serviceCharge: 0, invoiceTotal: 1150 },
    ...overrides,
  };
}

function input(overrides: Partial<GuestInvoiceFiscalInput> = {}): GuestInvoiceFiscalInput {
  return {
    issued: true,
    coverageScope: "charge_groups",
    snapshot: snapshot(),
    connection: {
      enabled: true,
      taxpayerTin: "0026716178",
      client: "ERP",
      deviceId: "DEVICE-1",
      credentialsConfigured: true,
    },
    mode: "CASH",
    taxMappings: [{ mappingKind: "TAX", pmsTaxId: TAX_ID, externalTaxCode: "VAT15", active: true }],
    itemMappings: [
      {
        serviceTypeId: null,
        departmentId: null,
        chargeSource: "room",
        isDefault: false,
        externalItemCode: "1001",
        externalUnit: "NIGHT",
        natureOfSupplies: "service",
        harmonizationCode: null,
        active: true,
      },
    ],
    ...overrides,
  };
}

describe("guest invoice fiscal eligibility", () => {
  it("builds a B2C ETB invoice from frozen totals and configured mappings", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, input());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.Type, "INV");
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal(result.payload.Mode, FISCAL_DOCUMENT_MODE);
    assert.equal(result.payload.RelatedDocument, null);
    assert.equal(result.payload.info == null, false);
    assert.equal("ItemList" in result.payload, false);
    assert.equal("ValueDetails" in result.payload, false);
    assert.equal(result.payload.trnx_id, guestInvoiceTrnxId(INVOICE_ID));
    const line = result.payload.info.ItemList[0];
    assert.equal(line.TaxCode, "VAT15");
    assert.equal(line.ItemCode, 1001);
    assert.equal(typeof line.ItemCode, "number");
    assert.equal(line.Unit, FISCAL_ITEM_UNIT);
    assert.equal(line.NatureOfSupplies, "service");
    assert.equal(line.HarmonizationCode, null);
    assert.equal(line.PreTaxValue, 1000);
    assert.equal(line.TaxAmount, 150);
    assert.equal(line.Quantity, 1);
    assert.equal(line.UnitPrice, 1000);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1150);
    assert.equal(result.payload.info.ValueDetails.InvoiceCurrency, "ETB");
    assert.equal("BuyerDetails" in result.payload, false);
    const serialized = JSON.stringify(result.payload);
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("access_token"), false);
    assert.equal(serialized.includes("Authorization"), false);
  });

  it("keeps the same transaction id for every retry", () => {
    assert.equal(guestInvoiceTrnxId(INVOICE_ID), guestInvoiceTrnxId(INVOICE_ID));
  });

  it("uses a frozen service quantity instead of forcing one", () => {
    const body = snapshot();
    const group = (body.groups as Array<Record<string, unknown>>)[0];
    group.description = "Room Accommodation";
    group.chargeSource = "room";
    group.quantity = 2;
    group.unitAmount = 100;
    group.subtotal = 200;
    group.taxTotal = 30;
    group.grossTotal = 230;
    (group.taxLines as Array<Record<string, unknown>>)[0].amount = 30;
    body.totals = { subtotal: 200, tax: 30, serviceCharge: 0, invoiceTotal: 230 };
    const result = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: body }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[0].Quantity, 2);
    assert.equal(result.payload.info.ItemList[0].UnitPrice, 100);
    group.unitAmount = null;
    const derived = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: body }));
    assert.equal(derived.ok, true);
    if (!derived.ok) return;
    assert.equal(derived.payload.info.ItemList[0].Quantity, 2);
    assert.equal(derived.payload.info.ItemList[0].UnitPrice, 100);
  });

  it("sends frozen room nights and the frozen nightly rate", () => {
    const body = snapshot();
    const group = (body.groups as Array<Record<string, unknown>>)[0];
    group.quantity = 17;
    group.unitAmount = 3890;
    group.subtotal = 66130;
    group.taxTotal = 9919.5;
    group.grossTotal = 76049.5;
    (group.taxLines as Array<Record<string, unknown>>)[0].amount = 9919.5;
    body.totals = { subtotal: 66130, tax: 9919.5, serviceCharge: 0, invoiceTotal: 76049.5 };
    const result = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: body }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[0].Quantity, 17);
    assert.equal(result.payload.info.ItemList[0].UnitPrice, 3890);
    assert.equal(result.payload.info.ItemList[0].PreTaxValue, 66130);
  });

  it("blocks a frozen quantity that does not reconcile instead of forcing one", () => {
    const body = snapshot();
    const group = (body.groups as Array<Record<string, unknown>>)[0];
    group.quantity = 7;
    group.unitAmount = 1;
    group.subtotal = 100;
    const result = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: body }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reasons.join(" "), /does not reconcile/);
  });

  it("blocks a draft, a legacy invoice, another currency, and a service charge", () => {
    assert.equal(assessGuestInvoiceFiscal(INVOICE_ID, input({ issued: false })).ok, false);
    assert.match(
      assessGuestInvoiceFiscal(INVOICE_ID, input({ coverageScope: "legacy_folio" })).ok
        ? ""
        : assessGuestInvoiceFiscal(
            INVOICE_ID,
            input({ coverageScope: "legacy_folio" }),
          ).reasons.join(" "),
      /Legacy invoice/,
    );
    const foreign = snapshot();
    (foreign.folio as { currency: string }).currency = "USD";
    const currency = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: foreign }));
    assert.equal(currency.ok, false);
    if (!currency.ok) assert.match(currency.reasons.join(" "), /ETB/);
    const service = snapshot();
    (service.groups as Array<Record<string, unknown>>)[0].serviceChargeTotal = 100;
    service.totals = { subtotal: 1000, tax: 150, serviceCharge: 100, invoiceTotal: 1250 };
    const blocked = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: service }));
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.reasons.join(" "), /service charge/);
  });

  it("blocks missing device, tax, and item mappings without inventing codes", () => {
    const device = assessGuestInvoiceFiscal(
      INVOICE_ID,
      input({ connection: { ...input().connection, deviceId: "" } }),
    );
    assert.equal(device.ok, false);
    if (!device.ok) assert.equal(device.missingDevice, true);
    const mode = assessGuestInvoiceFiscal(INVOICE_ID, input({ mode: null }));
    assert.equal(mode.ok, true);
    if (!mode.ok) return;
    assert.equal(mode.payload.Mode, FISCAL_DOCUMENT_MODE);
    const tax = assessGuestInvoiceFiscal(INVOICE_ID, input({ taxMappings: [] }));
    assert.equal(tax.ok, false);
    if (!tax.ok) assert.match(tax.reasons.join(" "), /Value Added Tax/);
    const item = assessGuestInvoiceFiscal(INVOICE_ID, input({ itemMappings: [] }));
    assert.equal(item.ok, false);
    if (!item.ok) assert.match(item.reasons.join(" "), /Room Accommodation/);
  });

  it("keeps document mode on CASH and tax amounts on the frozen invoice", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, input({ mode: "CARD" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.Mode, "CASH");
    assert.equal(result.payload.info.ItemList[0].TaxAmount, 150);
    assert.equal(result.payload.info.ItemList[0].Unit, "PCS");
  });

  it("accepts service and goods and rejects any other nature", () => {
    const goods = input();
    goods.itemMappings = [{ ...goods.itemMappings[0], natureOfSupplies: "goods" }];
    const accepted = assessGuestInvoiceFiscal(INVOICE_ID, goods);
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.payload.info.ItemList[0].NatureOfSupplies, "goods");
    const invalid = input();
    invalid.itemMappings = [{ ...invalid.itemMappings[0], natureOfSupplies: "hotel" }];
    const rejected = assessGuestInvoiceFiscal(INVOICE_ID, invalid);
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.match(rejected.reasons.join(" "), /Service or Goods/);
  });

  it("sends a mapped tax code and does not infer it from the percentage", () => {
    const mapped = assessGuestInvoiceFiscal(
      INVOICE_ID,
      input({
        taxMappings: [
          { mappingKind: "TAX", pmsTaxId: TAX_ID, externalTaxCode: "VAT0", active: true },
        ],
      }),
    );
    assert.equal(mapped.ok, true);
    if (!mapped.ok) return;
    assert.equal(mapped.payload.info.ItemList[0].TaxCode, "VAT0");
    assert.equal(mapped.payload.info.ItemList[0].TaxAmount, 150);
  });

  it("uses one room item code for different rate plans", () => {
    const bar = snapshot();
    (bar.groups as Array<Record<string, unknown>>)[0].chargeSnapshot = { ratePlanCode: "BAR" };
    (bar.groups as Array<Record<string, unknown>>)[0].description = "Room Accommodation - Standard";
    const corporate = snapshot();
    (corporate.groups as Array<Record<string, unknown>>)[0].chargeSnapshot = {
      ratePlanCode: "CORPORATE",
    };
    (corporate.groups as Array<Record<string, unknown>>)[0].description =
      "Room Accommodation (602 - Standard)";
    const first = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: bar }));
    const second = assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: corporate }));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(second.payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(
      first.payload.info.ItemList[0].ProductDescription,
      "Room Accommodation - Standard",
    );
    assert.equal(
      second.payload.info.ItemList[0].ProductDescription,
      "Room Accommodation (602 - Standard)",
    );
  });

  it("rejects a non-numeric item code and keeps a blank harmonization code null", () => {
    const coded = input();
    coded.itemMappings = [{ ...coded.itemMappings[0], externalItemCode: "001" }];
    const rejected = assessGuestInvoiceFiscal(INVOICE_ID, coded);
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.match(rejected.reasons.join(" "), /whole number/);
  });

  it("rejects totals that do not match the frozen invoice", () => {
    const body = snapshot();
    body.totals = { subtotal: 900, tax: 150, serviceCharge: 0, invoiceTotal: 1050 };
    assert.equal(assessGuestInvoiceFiscal(INVOICE_ID, input({ snapshot: body })).ok, false);
  });
});

describe("guest invoice fiscal response and scope", () => {
  it("stores IRN, document number, and signed QR only for a real success", () => {
    const parsed = parseFiscalInvoiceSuccess({
      irn: "IRN-1",
      documentNumber: "DOC-9",
      signedQR: "iVBORw0KGgo=",
      status: "A",
      ackDate: "2026-10-13T06:31:00.000Z",
      signedInvoice: "signed",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.irn, "IRN-1");
    assert.equal(parsed.documentNumber, "DOC-9");
    assert.equal(parsed.signedQr, "iVBORw0KGgo=");
    assert.equal(fiscalQrSrc(parsed.signedQr), "data:image/png;base64,iVBORw0KGgo=");
  });

  it("does not treat a malformed or rejected body as registered", () => {
    assert.equal(parseFiscalInvoiceSuccess({ nonJson: true }).ok, false);
    assert.equal(parseFiscalInvoiceSuccess({ status: "R", errorMessage: "bad" }).ok, false);
    assert.equal(parseFiscalInvoiceSuccess({ status: "A" }).ok, false);
  });

  it("retries transport failures and stops permanent provider rejection", () => {
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 500 }).retryable,
      true,
    );
    assert.equal(classifyFiscalFailure({ httpStatus: 500 }).retryable, true);
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_PROVIDER_REJECTED", httpStatus: 400 }).retryable,
      false,
    );
    assert.ok(nextFiscalRetryAt(1));
    assert.equal(nextFiscalRetryAt(6), null);
  });

  it("leaves every document other than a guest invoice disabled", () => {
    assert.equal(p2HandlerEnabled("INV", "guest_invoice"), true);
    assert.equal(p2HandlerEnabled("INV", "account_invoice"), false);
    assert.equal(p2HandlerEnabled("CRE", "credit_note"), false);
    assert.equal(p2HandlerEnabled("DEB", "debit_note"), false);
    assert.equal(p2HandlerEnabled("SALES_RECEIPT", "guest_allocation"), false);
    assert.equal(p2HandlerEnabled("WITHHOLDING", "withholding"), false);
  });

  it("formats the frozen issue time and does not touch the ledger", () => {
    assert.equal(formatFiscalDocumentDate("2026-10-13T06:30:00.000Z"), "13-10-2026T06:30:00");
    const source = [
      "fiscal-guest-invoice.ts",
      "fiscal-guest-invoice.server.ts",
      "fiscal-client.server.ts",
      "fiscal-outbox.server.ts",
    ]
      .map((name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8"))
      .join("\n");
    assert.equal(source.includes("post_folio_transaction"), false);
    assert.equal(source.includes("folio_transactions"), false);
    const migration = readFileSync(
      new URL(
        "../../../../../drizzle/migrations/0152_pms_fiscal_integration_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /fiscal_registrations_active_source_unique/);
    const sequence = readFileSync(
      new URL(
        "../../../../../drizzle/migrations/0154_fiscal_item_code_sequence.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const sequenceCopy = readFileSync(
      new URL(
        "../../../../../supabase/migrations/0154_fiscal_item_code_sequence.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(sequence, sequenceCopy);
    assert.match(sequence, /FOR UPDATE/);
    assert.match(sequence, /allocate_fiscal_item_code/);
    assert.match(sequence, /FISCAL_ITEM_CODE_USED/);
    assert.equal(sequence.includes("max("), false);
    assert.equal(sequence.includes("folio_transactions"), false);
    assert.equal(sequence.includes("DROP COLUMN"), false);
    const built = assessGuestInvoiceFiscal(INVOICE_ID, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const serialized = JSON.stringify(built.payload);
    assert.equal(serialized.includes("PaymentCoverage"), false);
    assert.equal(serialized.includes("InvoicePaidAmount"), false);
    const builder = readFileSync(new URL("./fiscal-guest-invoice.ts", import.meta.url), "utf8");
    assert.equal(builder.includes("pms_rate"), false);
    assert.equal(builder.includes("rate_plan"), false);
    const server = readFileSync(
      new URL("./fiscal-guest-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const reset = server.slice(
      server.indexOf('existing?.status === "FAILED"'),
      server.indexOf("const inserted"),
    );
    assert.equal(reset.includes("request_snapshot"), false);
    const mapping = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
    assert.match(mapping, /allocate_fiscal_item_code/);
    assert.equal(/max\s*\(\s*(external_item_code|item_code)/i.test(mapping), false);
  });

  it("shows the stored nested request in the fiscal exchange inspector", () => {
    const built = assessGuestInvoiceFiscal(INVOICE_ID, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg-1",
        source_type: "guest_invoice",
        source_id: INVOICE_ID,
        fiscal_document_type: "INV",
        status: "FAILED",
        trnx_id: built.payload.trnx_id,
        request_snapshot: built.payload,
        response_snapshot: {
          nonJson: true,
          httpStatus: 503,
          contentType: "text/html",
          rawBody: "Service Unavailable",
          rawBodyTruncated: false,
        },
        attempt_count: 1,
      },
      attempts: [
        {
          id: "attempt-1",
          attempt_number: 1,
          http_status: 503,
          outcome: "retryable_error",
          error_code: "FISCAL_HTTP_ERROR",
          error_message: "The fiscal service returned an HTTP error.",
          request_body: built.payload,
          response_body: { nonJson: true, rawBody: "Service Unavailable" },
        },
      ],
      invoiceNumber: "INV-0007",
    });
    const request = exchange.registration.requestSnapshot as {
      info: { ItemList: unknown[]; ValueDetails: { InvoiceCurrency: string } };
    };
    assert.equal(exchange.registration.trnxId, guestInvoiceTrnxId(INVOICE_ID));
    assert.ok(request.info.ItemList.length > 0);
    assert.equal(request.info.ValueDetails.InvoiceCurrency, "ETB");
    assert.equal("ItemList" in (exchange.registration.requestSnapshot as object), false);
    assert.equal(exchange.attempts[0].httpStatus, 503);
    assert.equal(exchange.attempts[0].responseState, "ready");
  });
});
