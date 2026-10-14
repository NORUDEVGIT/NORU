import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { p3HandlerEnabled } from "./fiscal-credit-note.ts";
import {
  assessDebitNoteFiscal,
  debitNoteTrnxId,
  p4HandlerEnabled,
  type DebitNoteFiscalInput,
} from "./fiscal-debit-note.ts";
import { getDebitNoteFiscalState, queueDebitNoteFiscal } from "./fiscal-debit-note.server.ts";
import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import { parseFiscalInvoiceSuccess, parseFiscalRuleValidation } from "./fiscal-guest-invoice.ts";
import { p2HandlerEnabled } from "./fiscal-guest-invoice.ts";
import {
  classifyFiscalFailure,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_GROUP = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const DEBIT_SOURCE = "abababab-abab-4bab-8bab-abababababab";
const IRN = "IRN-ORIGINAL-1001";
const ROOM = "Room Accommodation (302 - Deluxe Double Room)";

function originalLine(overrides: Record<string, unknown> = {}) {
  return {
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
    ProductDescription: ROOM,
    ...overrides,
  };
}

function originalRequest(lines = [originalLine()]) {
  return {
    Date: "13-10-2026T06:30:00",
    Mode: "CASH",
    Type: "INV",
    info: {
      ItemList: lines,
      ValueDetails: { InvoiceCurrency: "ETB", TaxValue: 15, TotalValue: 115 },
    },
    client: "ERP",
    trnx_id: `gi-${INVOICE_ID}`,
    TransactionType: "B2C",
  };
}

function debitGroup(overrides: Record<string, unknown> = {}) {
  return {
    sourceGroupId: DEBIT_SOURCE,
    description: "Laundry extra",
    quantity: 2,
    unitAmount: 10,
    subtotal: 20,
    tax: 1,
    serviceCharge: 0,
    gross: 21,
    ...overrides,
  };
}

function debitSnapshot(groups = [debitGroup()]) {
  return {
    version: 1,
    noteType: "debit",
    document: {
      noteNumber: "DN-000001",
      originalInvoiceNumber: "INV-0007",
      currency: "ETB",
    },
    groups,
  };
}

function invoiceSnapshot(ids: string[] = [GROUP_ID]) {
  return {
    version: 2,
    groups: ids.map((id) => ({ parentTransactionId: id, description: "ignored" })),
  };
}

function input(overrides: Partial<DebitNoteFiscalInput> = {}): DebitNoteFiscalInput {
  return {
    guestInvoiceId: INVOICE_ID,
    currency: "ETB",
    issuedAt: "2026-10-13T10:00:00.000Z",
    noteNumber: "DN-000001",
    totalDelta: 21,
    debitSnapshot: debitSnapshot(),
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

describe("fiscal debit note eligibility and payload", () => {
  it("registers an issued guest debit from the original fiscal line", () => {
    const result = assessDebitNoteFiscal(NOTE_ID, input());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(result.payload.Type, "DEB");
    assert.equal(result.payload.Mode, "CASH");
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal(result.payload.RelatedDocument, IRN);
    assert.equal(result.payload.trnx_id, `gd-${NOTE_ID}`);
    assert.equal(result.payload.Date, "13-10-2026T10:00:00");
    assert.equal(result.payload.client, "ERP");
    assert.equal(line.ItemCode, 1001);
    assert.equal(line.ProductDescription, ROOM);
    assert.equal(line.TaxCode, "VAT15");
    assert.equal(line.Unit, "PCS");
    assert.equal(line.NatureOfSupplies, "service");
    assert.equal(line.HarmonizationCode, null);
    assert.equal(line.Quantity, 1);
    assert.equal(line.UnitPrice, 20);
    assert.equal(line.PreTaxValue, 20);
    assert.equal(line.TaxAmount, 1);
    assert.equal(line.TotalLineAmount, 21);
    assert.equal(line.LineNumber, 1);
    assert.equal(fiscalMoneyProduct(line.Quantity, line.UnitPrice), line.PreTaxValue);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 1);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 21);
    assert.equal(result.payload.info.ValueDetails.Discount, 0);
    assert.equal(result.payload.info.ValueDetails.ExciseValue, 0);
    assert.equal(result.payload.info.ValueDetails.IncomeWithholdValue, 0);
    assert.equal(result.payload.info.ValueDetails.TransactionWithholdValue, 0);
    assert.equal(result.payload.info.ValueDetails.InvoiceCurrency, "ETB");
    assert.equal("ItemList" in result.payload, false);
    const serialized = JSON.stringify(result.payload);
    assert.equal(serialized.includes("Partial Debit Note"), false);
    assert.equal(serialized.includes("Laundry"), false);
    assert.equal(serialized.includes("2005"), false);
    assert.equal(serialized.includes("SOMETHING_NEW"), false);
    assert.equal(serialized.includes(IRN), true);
    assert.equal(serialized.includes("INV-0007"), false);
    assert.equal(serialized.includes(`gi-${INVOICE_ID}`), false);
  });

  it("copies a changed original identity and ignores later settings", () => {
    const result = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: originalRequest([
            originalLine({
              ItemCode: 1001,
              TaxCode: "VAT0",
              Unit: "KG",
              NatureOfSupplies: "goods",
              HarmonizationCode: "HS-100",
              ProductDescription: ROOM,
            }),
          ]),
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(line.ItemCode, 1001);
    assert.equal(line.TaxCode, "VAT0");
    assert.equal(line.Unit, "KG");
    assert.equal(line.NatureOfSupplies, "goods");
    assert.equal(line.HarmonizationCode, "HS-100");
    assert.equal(line.ProductDescription, ROOM);
    assert.equal(line.TaxAmount, 1);
  });

  it("uses positive debit amounts and allows a debit above the original line", () => {
    const larger = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: 230,
        debitSnapshot: debitSnapshot([
          debitGroup({ subtotal: 200, tax: 30, gross: 230, quantity: null, unitAmount: null }),
        ]),
      }),
    );
    assert.equal(larger.ok, true);
    if (!larger.ok) return;
    assert.equal(larger.payload.info.ItemList[0].PreTaxValue, 200);
    assert.equal(larger.payload.info.ItemList[0].TaxAmount, 30);
    assert.equal(larger.payload.info.ValueDetails.TotalValue, 230);
    const negative = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: -21,
        debitSnapshot: debitSnapshot([debitGroup({ subtotal: -20, tax: -1 })]),
      }),
    );
    assert.equal(negative.ok, true);
    if (!negative.ok) return;
    assert.equal(negative.payload.info.ItemList[0].PreTaxValue, 20);
    assert.equal(negative.payload.info.ItemList[0].TaxAmount, 1);
    assert.equal(negative.payload.info.ItemList[0].Quantity, 1);
  });

  it("uses a frozen quantity only when the debit group is the original invoice line", () => {
    const monetary = assessDebitNoteFiscal(NOTE_ID, input());
    assert.equal(monetary.ok, true);
    if (!monetary.ok) return;
    assert.equal(monetary.payload.info.ItemList[0].Quantity, 1);
    assert.equal(monetary.payload.info.ItemList[0].UnitPrice, 20);
    const added = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: 115,
        debitSnapshot: debitSnapshot([
          debitGroup({
            sourceGroupId: GROUP_ID,
            quantity: 2,
            unitAmount: 50,
            subtotal: 100,
            tax: 15,
            gross: 115,
          }),
        ]),
      }),
    );
    assert.equal(added.ok, true);
    if (!added.ok) return;
    assert.equal(added.payload.info.ItemList[0].Quantity, 2);
    assert.equal(added.payload.info.ItemList[0].UnitPrice, 50);
    assert.equal(added.payload.info.ItemList[0].PreTaxValue, 100);
    assert.equal(
      fiscalMoneyProduct(
        added.payload.info.ItemList[0].Quantity,
        added.payload.info.ItemList[0].UnitPrice,
      ),
      100,
    );
  });

  it("keeps several debit groups on the single original fiscal line", () => {
    const result = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: 36,
        debitSnapshot: debitSnapshot([
          debitGroup({ subtotal: 20, tax: 1, gross: 21 }),
          debitGroup({
            sourceGroupId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
            description: "Minibar",
            subtotal: 10,
            tax: 5,
            gross: 15,
          }),
        ]),
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList.length, 2);
    assert.equal(result.payload.info.ItemList[0].ProductDescription, ROOM);
    assert.equal(result.payload.info.ItemList[1].ProductDescription, ROOM);
    assert.equal(result.payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(result.payload.info.ItemList[1].LineNumber, 2);
    assert.equal(result.payload.info.ItemList[0].PreTaxValue, 20);
    assert.equal(result.payload.info.ItemList[1].PreTaxValue, 10);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 6);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 36);
  });

  it("matches an explicit source group on a multi-line invoice in original order", () => {
    const request = originalRequest([
      originalLine(),
      originalLine({
        ItemCode: 1002,
        LineNumber: 2,
        ProductDescription: "Airport Transfer",
        PreTaxValue: 50,
        TaxAmount: 7.5,
        UnitPrice: 50,
        TotalLineAmount: 57.5,
      }),
    ]);
    const unmatched = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        invoiceSnapshot: invoiceSnapshot([GROUP_ID, OTHER_GROUP]),
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: request,
        },
      }),
    );
    assert.equal(unmatched.ok, false);
    if (unmatched.ok) return;
    assert.match(unmatched.reasons.join(" "), /cannot be matched/);
    const matched = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        totalDelta: 33,
        debitSnapshot: debitSnapshot([
          debitGroup({ sourceGroupId: OTHER_GROUP, subtotal: 10, tax: 2, gross: 12 }),
          debitGroup({ sourceGroupId: GROUP_ID, subtotal: 20, tax: 1, gross: 21 }),
        ]),
        invoiceSnapshot: invoiceSnapshot([GROUP_ID, OTHER_GROUP]),
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: request,
        },
      }),
    );
    assert.equal(matched.ok, true);
    if (!matched.ok) return;
    assert.equal(matched.payload.info.ItemList[0].ProductDescription, ROOM);
    assert.equal(matched.payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(matched.payload.info.ItemList[0].LineNumber, 1);
    assert.equal(matched.payload.info.ItemList[1].ProductDescription, "Airport Transfer");
    assert.equal(matched.payload.info.ItemList[1].ItemCode, 1002);
    assert.equal(matched.payload.info.ItemList[1].LineNumber, 2);
  });

  it("blocks a debit note whose source invoice cannot support DEB", () => {
    const missing = assessDebitNoteFiscal(NOTE_ID, input({ originalRegistration: null }));
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.reasons.join(" "), /not been fiscally registered/);
    const noIrn = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: "  ",
          documentNumber: "2823",
          requestSnapshot: originalRequest(),
        },
      }),
    );
    assert.equal(noIrn.ok, false);
    if (noIrn.ok) return;
    assert.match(noIrn.reasons.join(" "), /IRN is missing/);
    const noSnapshot = assessDebitNoteFiscal(
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
    legacy.ItemList = (legacy.info as { ItemList: unknown }).ItemList;
    legacy.info = null;
    const oldShape = assessDebitNoteFiscal(
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
    const foreign = assessDebitNoteFiscal(NOTE_ID, input({ currency: "USD" }));
    assert.equal(foreign.ok, false);
    if (foreign.ok) return;
    assert.match(foreign.reasons.join(" "), /ETB/);
    const account = assessDebitNoteFiscal(NOTE_ID, input({ guestInvoiceId: null }));
    assert.equal(account.ok, false);
    if (account.ok) return;
    assert.match(account.reasons.join(" "), /guest debit note/);
    const company = originalRequest();
    company.TransactionType = "B2B";
    const business = assessDebitNoteFiscal(
      NOTE_ID,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2823",
          requestSnapshot: company,
        },
      }),
    );
    assert.equal(business.ok, false);
    if (business.ok) return;
    assert.match(business.reasons.join(" "), /BuyerDetails/);
    const service = assessDebitNoteFiscal(
      NOTE_ID,
      input({ debitSnapshot: debitSnapshot([debitGroup({ serviceCharge: 4 })]) }),
    );
    assert.equal(service.ok, false);
    if (service.ok) return;
    assert.match(service.reasons.join(" "), /service charge/);
    const mismatch = assessDebitNoteFiscal(NOTE_ID, input({ totalDelta: 999 }));
    assert.equal(mismatch.ok, false);
    if (mismatch.ok) return;
    assert.match(mismatch.reasons.join(" "), /does not match the issued debit note total/);
  });
});

describe("fiscal debit note response and safety", () => {
  it("treats provider 406 as fatal and 503 as retryable, and stores a successful body", () => {
    const message = parseFiscalRuleValidation({
      body: [
        {
          portion: "ReferenceDetails",
          errorMessage: [
            "7020: amount is not correct for Debit / Credit. : Item mismatch at line 1",
          ],
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
        irn: "IRN-DEB",
        status: "A",
        ackDate: "2026-10-13T10:05:00.000Z",
        signedQR: "iVBORw0KGgo=",
        errorMessage: null,
        signedInvoice: "signed",
        documentNumber: "2825",
      },
      message: "SUCCESS",
      statusCode: 200,
    });
    assert.equal(success.ok, true);
    if (!success.ok) return;
    assert.equal(success.irn, "IRN-DEB");
    assert.equal(success.documentNumber, "2825");
    assert.equal(success.signedQr, "iVBORw0KGgo=");
    const server = readFileSync(new URL("./fiscal-debit-note.server.ts", import.meta.url), "utf8");
    assert.match(server, /sendStoredFiscalRequest\([\s\S]*"debit note"\)/);
  });

  it("shows the stored DEB request in the fiscal exchange", () => {
    const built = assessDebitNoteFiscal(NOTE_ID, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg-deb",
        source_type: "debit_note",
        source_id: NOTE_ID,
        fiscal_document_type: "DEB",
        status: "PENDING",
        trnx_id: built.payload.trnx_id,
        request_snapshot: built.payload,
        response_snapshot: null,
        attempt_count: 0,
      },
      attempts: [],
      invoiceNumber: "DN-000001",
    });
    const request = exchange.registration.requestSnapshot as {
      Type: string;
      RelatedDocument: string;
      info: { ItemList: Array<{ ProductDescription: string }> };
    };
    assert.equal(request.Type, "DEB");
    assert.equal(request.RelatedDocument, IRN);
    assert.equal(request.info.ItemList[0].ProductDescription, ROOM);
    assert.equal(exchange.registration.invoiceNumber, "DN-000001");
    assert.equal("ItemList" in (exchange.registration.requestSnapshot as object), false);
  });

  it("reuses one debit transaction id and does not write the ledger", async () => {
    assert.equal(debitNoteTrnxId(NOTE_ID), `gd-${NOTE_ID}`);
    assert.equal(debitNoteTrnxId(NOTE_ID), debitNoteTrnxId(NOTE_ID));
    assert.equal(p4HandlerEnabled("DEB", "debit_note"), true);
    assert.equal(p4HandlerEnabled("CRE", "credit_note"), false);
    assert.equal(p4HandlerEnabled("INV", "guest_invoice"), false);
    assert.equal(p4HandlerEnabled("SALES_RECEIPT", "guest_allocation"), false);
    assert.equal(p4HandlerEnabled("WITHHOLDING", "withholding"), false);
    assert.equal(p3HandlerEnabled("CRE", "credit_note"), true);
    assert.equal(p3HandlerEnabled("DEB", "debit_note"), false);
    assert.equal(p2HandlerEnabled("INV", "guest_invoice"), true);
    assert.equal(p2HandlerEnabled("DEB", "debit_note"), false);
    const builder = readFileSync(new URL("./fiscal-debit-note.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("./fiscal-debit-note.server.ts", import.meta.url), "utf8");
    assert.equal(builder.includes("fiscal_item_mappings"), false);
    assert.equal(builder.includes("fiscal_tax_code_mappings"), false);
    assert.equal(builder.includes("Partial Debit Note"), false);
    assert.equal(builder.includes("FISCAL_ITEM_UNIT"), false);
    assert.equal(server.includes("fiscal_item_mappings"), false);
    assert.equal(server.includes("fiscal_tax_code_mappings"), false);
    assert.equal(server.includes("folio_transactions"), false);
    assert.equal(server.includes("post_folio_transaction"), false);
    assert.equal(/from\("guest_folio_invoices"\)[\s\S]{0,160}\.update/.test(server), false);
    assert.equal(/from\("invoice_credit_notes"\)[\s\S]{0,280}\.update/.test(server), false);
    const reset = server.slice(
      server.indexOf('existing?.status === "FAILED"'),
      server.indexOf("const inserted"),
    );
    assert.equal(reset.includes("request_snapshot"), false);
    const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
    const view = functions.slice(
      functions.indexOf("export const getDebitNoteFiscal"),
      functions.indexOf("export const registerDebitNoteFiscal"),
    );
    const register = functions.slice(
      functions.indexOf("export const registerDebitNoteFiscal"),
      functions.indexOf("export const getGuestInvoiceFiscal"),
    );
    assert.match(view, /requireCashieringAccess/);
    assert.doesNotMatch(view, /requireCashierManager/);
    assert.match(register, /requireCashierManager/);
    memoryDb();
    const beforeInvoice = JSON.stringify(sharedTables().guest_folio_invoices);
    const beforeNote = JSON.stringify(sharedTables().invoice_credit_notes);
    const first = await queueDebitNoteFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: NOTE_ID,
    });
    const second = await queueDebitNoteFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: NOTE_ID,
    });
    const viewed = await getDebitNoteFiscalState(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: NOTE_ID,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.equal(viewed.status, "queued");
    assert.equal(second.registration?.id, first.registration?.id);
    assert.equal(viewed.registration?.trnxId, debitNoteTrnxId(NOTE_ID));
    const registrations = sharedTables().fiscal_registrations.filter(
      (row) => row.fiscal_document_type === "DEB",
    );
    assert.equal(registrations.length, 1);
    assert.equal((registrations[0].request_snapshot as { Type: string }).Type, "DEB");
    assert.equal(JSON.stringify(sharedTables().guest_folio_invoices), beforeInvoice);
    assert.equal(JSON.stringify(sharedTables().invoice_credit_notes), beforeNote);
    registrations[0].status = "REGISTERED";
    registrations[0].external_irn = "IRN-DEB";
    const again = await queueDebitNoteFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: NOTE_ID,
    });
    assert.equal(again.status, "registered");
    assert.equal(again.canRegister, false);
    assert.equal(
      sharedTables().fiscal_registrations.filter((row) => row.fiscal_document_type === "DEB")
        .length,
      1,
    );
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
      note_type: "debit",
      guest_invoice_id: INVOICE_ID,
      account_invoice_id: null,
      currency: "ETB",
      issued_at: "2026-10-13T10:00:00.000Z",
      note_number: "DN-000001",
      total_delta: 21,
      snapshot: debitSnapshot(),
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
        inserted = { id: "deb-reg", ...values };
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
