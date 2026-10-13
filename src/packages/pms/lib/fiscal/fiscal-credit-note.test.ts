import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import {
  assessCreditNoteFiscal,
  creditNoteTrnxId,
  p3HandlerEnabled,
  type CreditNoteFiscalInput,
} from "./fiscal-credit-note.ts";
import { queueCreditNoteFiscal } from "./fiscal-credit-note.server.ts";
import { parseFiscalInvoiceSuccess, parseFiscalRuleValidation } from "./fiscal-guest-invoice.ts";
import {
  classifyFiscalFailure,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_GROUP = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const IRN = "IRN-ORIGINAL-1001";

function originalRequest(lineOverrides: Record<string, unknown> = {}) {
  return {
    Date: "13-10-2026T06:30:00",
    Mode: "CASH",
    Type: "INV",
    info: {
      ItemList: [
        {
          Unit: "PCS",
          TaxCode: "VAT15",
          Discount: 0,
          ItemCode: 1001,
          Quantity: 1,
          TaxAmount: 15,
          UnitPrice: 100,
          LineNumber: 1,
          PreTaxValue: 100,
          ExciseTaxValue: 0,
          TotalLineAmount: 115,
          NatureOfSupplies: "service",
          HarmonizationCode: null,
          ProductDescription: "Room Accommodation (301 - Deluxe Double Room)",
          ...lineOverrides,
        },
      ],
      ValueDetails: { InvoiceCurrency: "ETB", TaxValue: 15, TotalValue: 115 },
    },
    client: "ERP",
    trnx_id: `gi-${INVOICE_ID}`,
    TransactionType: "B2C",
  };
}

function creditSnapshot(groupOverrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    issuedAt: "2026-10-13T10:00:00.000Z",
    document: {
      noteNumber: "CN-000001",
      originalInvoiceNumber: "INV-0007",
      currency: "ETB",
    },
    groups: [
      {
        sourceGroupId: GROUP_ID,
        description: "Credit",
        subtotal: 4.35,
        tax: 0.65,
        serviceCharge: 0,
        creditGross: 5,
        ...groupOverrides,
      },
    ],
  };
}

function invoiceSnapshot(ids: string[] = [GROUP_ID]) {
  return {
    version: 2,
    groups: ids.map((id) => ({ parentTransactionId: id, description: "ignored" })),
  };
}

function input(overrides: Partial<CreditNoteFiscalInput> = {}): CreditNoteFiscalInput {
  return {
    guestInvoiceId: INVOICE_ID,
    currency: "ETB",
    issuedAt: "2026-10-13T10:00:00.000Z",
    noteNumber: "CN-000001",
    totalDelta: -5,
    creditSnapshot: creditSnapshot(),
    invoiceSnapshot: invoiceSnapshot(),
    connection: {
      enabled: true,
      taxpayerTin: "0026716178",
      client: "ERP",
      deviceId: "DEVICE-1",
      credentialsConfigured: true,
    },
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "2823",
      requestSnapshot: originalRequest(),
    },
    ...overrides,
  };
}

describe("fiscal credit note eligibility", () => {
  it("builds a CRE from the original fiscal line and the credit note amounts", () => {
    const result = assessCreditNoteFiscal(NOTE_ID, input());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(result.payload.Type, "CRE");
    assert.equal(result.payload.Mode, "CASH");
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal(result.payload.RelatedDocument, IRN);
    assert.equal(result.payload.Date, "13-10-2026T10:00:00");
    assert.equal(result.payload.trnx_id, creditNoteTrnxId(NOTE_ID));
    assert.equal("ItemList" in result.payload, false);
    assert.equal(line.ItemCode, 1001);
    assert.equal(line.ProductDescription, "Room Accommodation (301 - Deluxe Double Room)");
    assert.equal(line.TaxCode, "VAT15");
    assert.equal(line.Unit, "PCS");
    assert.equal(line.NatureOfSupplies, "service");
    assert.equal(line.HarmonizationCode, null);
    assert.equal(line.Quantity, 1);
    assert.equal(line.UnitPrice, 4.35);
    assert.equal(line.PreTaxValue, 4.35);
    assert.equal(line.TaxAmount, 0.65);
    assert.equal(line.TotalLineAmount, 5);
    assert.equal(fiscalMoneyProduct(line.Quantity, line.UnitPrice), line.PreTaxValue);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 0.65);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 5);
    assert.equal(result.payload.info.ValueDetails.InvoiceCurrency, "ETB");
    assert.equal(line.ProductDescription.includes("Partial Credit"), false);
  });

  it("keeps the original item when later settings would use a different code", () => {
    const changed = originalRequest({
      ItemCode: 1001,
      TaxCode: "VAT15",
      NatureOfSupplies: "service",
    });
    const result = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: changed,
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(result.payload.info.ItemList[0].TaxCode, "VAT15");
    const source = readFileSync(new URL("./fiscal-credit-note.ts", import.meta.url), "utf8");
    assert.equal(source.includes("fiscal_item_mappings"), false);
    assert.equal(source.includes("fiscal_tax_code_mappings"), false);
  });

  it("copies a full credit and keeps a reconciling original quantity", () => {
    const result = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: -66130 - 9919.5,
        creditSnapshot: creditSnapshot({
          subtotal: 66130,
          tax: 9919.5,
          creditGross: 76049.5,
        }),
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: originalRequest({
            Quantity: 17,
            UnitPrice: 3890,
            PreTaxValue: 66130,
            TaxAmount: 9919.5,
            TotalLineAmount: 76049.5,
          }),
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[0].Quantity, 17);
    assert.equal(result.payload.info.ItemList[0].UnitPrice, 3890);
    assert.equal(result.payload.info.ItemList[0].PreTaxValue, 66130);
    assert.equal(result.payload.info.ItemList[0].TaxAmount, 9919.5);
  });

  it("turns a negative credit snapshot into a positive fiscal magnitude", () => {
    const result = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        creditSnapshot: creditSnapshot({ subtotal: -4.35, tax: -0.65 }),
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[0].PreTaxValue, 4.35);
    assert.equal(result.payload.info.ItemList[0].TaxAmount, 0.65);
  });

  it("numbers multiple lines in original invoice order", () => {
    const request = originalRequest();
    request.info.ItemList.push({
      ...request.info.ItemList[0],
      ItemCode: 1002,
      LineNumber: 2,
      ProductDescription: "Airport Transfer",
      PreTaxValue: 50,
      TaxAmount: 7.5,
      UnitPrice: 50,
      TotalLineAmount: 57.5,
    });
    const result = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: -10,
        invoiceSnapshot: invoiceSnapshot([GROUP_ID, OTHER_GROUP]),
        creditSnapshot: {
          ...creditSnapshot(),
          groups: [
            {
              sourceGroupId: OTHER_GROUP,
              subtotal: 2,
              tax: 0.3,
              serviceCharge: 0,
            },
            {
              sourceGroupId: GROUP_ID,
              subtotal: 7,
              tax: 0.7,
              serviceCharge: 0,
            },
          ],
        },
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: request,
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.payload.info.ItemList[0].ProductDescription,
      "Room Accommodation (301 - Deluxe Double Room)",
    );
    assert.equal(result.payload.info.ItemList[0].LineNumber, 1);
    assert.equal(result.payload.info.ItemList[1].ProductDescription, "Airport Transfer");
    assert.equal(result.payload.info.ItemList[1].ItemCode, 1002);
    assert.equal(result.payload.info.ItemList[1].LineNumber, 2);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 10);
  });

  it("blocks a credit note whose source invoice was not fiscalized", () => {
    const missing = assessCreditNoteFiscal(NOTE_ID, input({ originalRegistration: null }));
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.reasons.join(" "), /not been fiscally registered/);
    const noIrn = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: null,
          documentNumber: "2823",
          requestSnapshot: originalRequest(),
        },
      }),
    );
    assert.equal(noIrn.ok, false);
    if (noIrn.ok) return;
    assert.match(noIrn.reasons.join(" "), /IRN is missing/);
    const noSnapshot = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: null,
        },
      }),
    );
    assert.equal(noSnapshot.ok, false);
    if (noSnapshot.ok) return;
    assert.match(noSnapshot.reasons.join(" "), /snapshot is unavailable/);
    const legacy = originalRequest() as Record<string, unknown>;
    legacy.ItemList = legacy.info;
    legacy.info = null;
    const oldShape = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: legacy,
        },
      }),
    );
    assert.equal(oldShape.ok, false);
    if (oldShape.ok) return;
    assert.match(oldShape.reasons.join(" "), /legacy request format/);
  });

  it("blocks an unmatched line, another currency, and an amount above the original line", () => {
    const unmatched = assessCreditNoteFiscal(
      NOTE_ID,
      input({ invoiceSnapshot: invoiceSnapshot(["99999999-9999-4999-8999-999999999999"]) }),
    );
    assert.equal(unmatched.ok, false);
    if (unmatched.ok) return;
    assert.match(unmatched.reasons.join(" "), /cannot be matched/);
    const foreign = assessCreditNoteFiscal(NOTE_ID, input({ currency: "USD" }));
    assert.equal(foreign.ok, false);
    if (foreign.ok) return;
    assert.match(foreign.reasons.join(" "), /ETB/);
    const over = assessCreditNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: -200,
        creditSnapshot: creditSnapshot({ subtotal: 180, tax: 20, creditGross: 200 }),
      }),
    );
    assert.equal(over.ok, false);
    if (over.ok) return;
    assert.match(over.reasons.join(" "), /exceeds the original fiscal line/);
  });
});

describe("fiscal credit note response and safety", () => {
  it("treats a provider rule validation error as fatal and a 503 as retryable", () => {
    const message = parseFiscalRuleValidation({
      body: [
        {
          portion: "ReferenceDetails",
          errorMessage: ["7020: amount is not correct for Debit / Credit. Item mismatch at line 1"],
        },
      ],
      message: "RULE VALIDATION ERROR",
      statusCode: 406,
    });
    assert.match(message ?? "", /RULE VALIDATION ERROR/);
    assert.match(message ?? "", /ReferenceDetails/);
    assert.match(message ?? "", /7020:/);
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_PROVIDER_REJECTED", httpStatus: 406 }).retryable,
      false,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 503 }).retryable,
      true,
    );
    const success = parseFiscalInvoiceSuccess({
      body: {
        irn: "IRN-CRE",
        status: "A",
        ackDate: "2026-10-13T10:05:00.000Z",
        signedQR: "iVBORw0KGgo=",
        errorMessage: null,
        signedInvoice: "signed",
        documentNumber: "2824",
      },
      message: "SUCCESS",
      statusCode: 200,
    });
    assert.equal(success.ok, true);
    if (!success.ok) return;
    assert.equal(success.irn, "IRN-CRE");
    assert.equal(success.documentNumber, "2824");
    assert.equal(success.signedQr, "iVBORw0KGgo=");
  });

  it("shows the stored CRE request in the fiscal exchange", () => {
    const built = assessCreditNoteFiscal(NOTE_ID, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg-cre",
        source_type: "credit_note",
        source_id: NOTE_ID,
        fiscal_document_type: "CRE",
        status: "PENDING",
        trnx_id: built.payload.trnx_id,
        request_snapshot: built.payload,
        response_snapshot: null,
        attempt_count: 0,
      },
      attempts: [],
      invoiceNumber: "CN-000001",
    });
    const request = exchange.registration.requestSnapshot as {
      Type: string;
      RelatedDocument: string;
      info: { ItemList: unknown[] };
    };
    assert.equal(request.Type, "CRE");
    assert.equal(request.RelatedDocument, IRN);
    assert.equal(request.info.ItemList.length, 1);
    assert.equal("ItemList" in (exchange.registration.requestSnapshot as object), false);
  });

  it("reuses one credit-note transaction id and does not write the ledger", async () => {
    assert.equal(creditNoteTrnxId(NOTE_ID), creditNoteTrnxId(NOTE_ID));
    assert.equal(p3HandlerEnabled("CRE", "credit_note"), true);
    assert.equal(p3HandlerEnabled("DEB", "debit_note"), false);
    assert.equal(p3HandlerEnabled("SALES_RECEIPT", "guest_allocation"), false);
    const server = readFileSync(new URL("./fiscal-credit-note.server.ts", import.meta.url), "utf8");
    assert.equal(server.includes("folio_transactions"), false);
    assert.equal(server.includes("post_folio_transaction"), false);
    assert.equal(/from\("guest_folio_invoices"\)[\s\S]{0,120}\.update/.test(server), false);
    assert.equal(/from\("invoice_credit_notes"\)[\s\S]{0,240}\.update/.test(server), false);
    const reset = server.slice(
      server.indexOf('existing?.status === "FAILED"'),
      server.indexOf("const inserted"),
    );
    assert.equal(reset.includes("request_snapshot"), false);
    const first = await queueCreditNoteFiscal(memoryDb(), {
      restaurantId: PROPERTY,
      creditNoteId: NOTE_ID,
    });
    const second = await queueCreditNoteFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      creditNoteId: NOTE_ID,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.equal(second.registration?.trnxId, creditNoteTrnxId(NOTE_ID));
    const registrations = sharedTables().fiscal_registrations.filter(
      (row) => row.fiscal_document_type === "CRE",
    );
    assert.equal(registrations.length, 1);
  });
});

function fiscalMoneyProduct(quantity: number, unitPrice: number): number {
  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

function sharedTables() {
  return tables;
}

const tables: Record<string, Record<string, unknown>[]> = {};

function seedTables() {
  tables.invoice_credit_notes = [
    {
      id: NOTE_ID,
      restaurant_id: PROPERTY,
      guest_invoice_id: INVOICE_ID,
      account_invoice_id: null,
      currency: "ETB",
      issued_at: "2026-10-13T10:00:00.000Z",
      note_number: "CN-000001",
      total_delta: -5,
      snapshot: creditSnapshot(),
    },
  ];
  tables.guest_folio_invoices = [
    { id: INVOICE_ID, restaurant_id: PROPERTY, snapshot: invoiceSnapshot() },
  ];
  tables.fiscal_registrations = [
    {
      id: "inv-reg",
      restaurant_id: PROPERTY,
      source_type: "guest_invoice",
      source_id: INVOICE_ID,
      fiscal_document_type: "INV",
      status: "REGISTERED",
      external_irn: IRN,
      external_document_number: "2823",
      request_snapshot: originalRequest(),
    },
  ];
  tables.pms_integrations = [
    {
      id: "integration-1",
      restaurant_id: PROPERTY,
      category: "fiscal",
      provider: "erp_fiscal",
      enabled: true,
      config: { taxpayerTin: "0026716178", client: "ERP", deviceId: "DEVICE-1" },
    },
  ];
  tables.fiscal_credential_refs = [{ integration_id: "integration-1" }];
}

function memoryDb(existing = seedTables()): FiscalDb {
  if (existing !== tables) seedTables();
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let inserted: Record<string, unknown> | null = null;
      const query = Promise.resolve().then(() => {
        const data = inserted
          ? [inserted]
          : (tables[table] ?? []).filter((row) =>
              filters.every(([column, value]) => row[column] === value),
            );
        return { data, error: null } satisfies FiscalDbResult;
      }) as FiscalDbQuery;
      query.select = () => query;
      query.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      };
      query.insert = (values: Record<string, unknown>) => {
        inserted = { id: "cre-reg", ...values };
        tables[table] = [...(tables[table] ?? []), inserted];
        return query;
      };
      query.update = () =>
        ({
          eq: async () => ({ error: null }),
        }) as unknown as FiscalDbQuery;
      query.upsert = () => query;
      query.maybeSingle = async () => {
        const result = await query;
        const data = Array.isArray(result.data) ? result.data : [];
        return { data: data[0] ?? null, error: null };
      };
      query.single = query.maybeSingle;
      return query;
    },
    rpc: async () => ({ data: null, error: null }),
    schema() {
      return memoryDb();
    },
  };
}
