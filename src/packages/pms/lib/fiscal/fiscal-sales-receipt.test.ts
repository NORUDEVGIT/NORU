import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { p4HandlerEnabled } from "./fiscal-debit-note.ts";
import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import { postFiscalReceiveRequest } from "./fiscal-client.server.ts";
import { parseFiscalInvoiceSuccess, parseFiscalRuleValidation } from "./fiscal-guest-invoice.ts";
import { p2HandlerEnabled } from "./fiscal-guest-invoice.ts";
import { p3HandlerEnabled } from "./fiscal-credit-note.ts";
import {
  assessSalesReceiptFiscal,
  p5HandlerEnabled,
  salesReceiptTrnxId,
  type SalesReceiptFiscalInput,
} from "./fiscal-sales-receipt.ts";
import {
  getGuestInvoiceSalesReceipts,
  queueGuestAllocationSalesReceipt,
  sendClaimedSalesReceipt,
} from "./fiscal-sales-receipt.server.ts";
import {
  classifyFiscalFailure,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_INVOICE = "dddddddd-dddd-4ddd-8ddd-ddddddddddde";
const PAYMENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ALLOC_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const ALLOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const ALLOC_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const IRN = "test-cee018e0a23aaef10422f4448380fad7ed4593eb21aac7c83cb807911ad04327";

function originalRequest(overrides: Record<string, unknown> = {}) {
  return {
    Date: "13-10-2026T06:30:00",
    Mode: "CASH",
    Type: "INV",
    info: {
      ItemList: [{ ProductDescription: "Room Accommodation" }],
      ValueDetails: { TotalValue: 12, InvoiceCurrency: "ETB" },
    },
    client: "ERP",
    trnx_id: `gi-${INVOICE_ID}`,
    TransactionType: "B2C",
    ...overrides,
  };
}

function input(overrides: Partial<SalesReceiptFiscalInput> = {}): SalesReceiptFiscalInput {
  return {
    amount: 5,
    createdAt: "2026-10-13T10:00:00.000Z",
    reversed: false,
    reversalRow: false,
    paymentKind: "payment",
    currency: "ETB",
    invoiceNumber: "INV-0012",
    timezone: "Africa/Addis_Ababa",
    hasAdjustingNotes: false,
    priors: [],
    connection: {
      enabled: true,
      taxpayerTin: "0026716178",
      client: "ERP",
      deviceId: "001096",
      credentialsConfigured: true,
    },
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "2821",
      requestSnapshot: originalRequest(),
    },
    ...overrides,
  };
}

describe("fiscal sales receipt eligibility and payload", () => {
  it("builds the confirmed partial receipt from one allocation", () => {
    const result = assessSalesReceiptFiscal(ALLOC_A, input());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.InvoicePaidAmount, 5);
    assert.equal(result.payload.invoice_total_amount, 12);
    assert.equal(result.payload.RemainingAmount, 7);
    assert.equal(result.payload.PaymentCoverage, "PARTIAL");
    assert.equal(result.payload.InvoiceIRN, IRN);
    assert.equal(result.payload.invoice_document_no, "2821");
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal(result.payload.trnx_id, `gsr-${ALLOC_A}`);
    assert.equal(result.payload.ReceiptDate, "2026-10-13");
    assert.equal(result.payload.source_date, "2026-10-13");
    assert.equal(result.payload.client, "ERP");
    assert.equal(result.payload.device_id, "001096");
    assert.equal(result.payload.tax_payer_tin, "0026716178");
    assert.deepEqual(result.payload.info, {});
    assert.equal("BuyerDetails" in result.payload.info, false);
    assert.equal("BuyerDetails" in result.payload, false);
    assert.equal("Mode" in result.payload, false);
    assert.equal("ItemList" in result.payload, false);
    assert.equal("ValueDetails" in result.payload, false);
    assert.equal(JSON.stringify(result.payload).includes("payment_method"), false);
    assert.equal(JSON.stringify(result.payload).includes("INV-0012"), false);
  });

  it("uses FULL only when the remaining amount is zero", () => {
    const finalPayment = assessSalesReceiptFiscal(
      ALLOC_B,
      input({ amount: 7, priors: [{ amount: 5, fiscalRegistered: true }] }),
    );
    assert.equal(finalPayment.ok, true);
    if (!finalPayment.ok) return;
    assert.equal(finalPayment.payload.InvoicePaidAmount, 7);
    assert.equal(finalPayment.payload.RemainingAmount, 0);
    assert.equal(finalPayment.payload.PaymentCoverage, "FULL");
    assert.match(
      readFileSync(new URL("./fiscal-sales-receipt.ts", import.meta.url), "utf8"),
      /FULL, with remaining 0, is the[\s\S]*live provider check/,
    );
  });

  it("keeps one payment's invoices and one invoice's payments separate and ordered", () => {
    const total100 = {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "2821",
      requestSnapshot: originalRequest({
        info: { ValueDetails: { TotalValue: 100 } },
      }),
    };
    const first = assessSalesReceiptFiscal(
      ALLOC_A,
      input({ amount: 40, originalRegistration: total100 }),
    );
    const secondInvoice = assessSalesReceiptFiscal(
      ALLOC_OTHER,
      input({
        amount: 60,
        invoiceNumber: "INV-0060",
        originalRegistration: {
          status: "REGISTERED",
          irn: "IRN-B",
          documentNumber: "2822",
          requestSnapshot: originalRequest({
            info: { ValueDetails: { TotalValue: 60 } },
          }),
        },
      }),
    );
    assert.equal(first.ok, true);
    assert.equal(secondInvoice.ok, true);
    if (!first.ok || !secondInvoice.ok) return;
    assert.equal(first.payload.InvoicePaidAmount, 40);
    assert.equal(first.payload.InvoiceIRN, IRN);
    assert.equal(secondInvoice.payload.InvoicePaidAmount, 60);
    assert.equal(secondInvoice.payload.InvoiceIRN, "IRN-B");
    const waiting = assessSalesReceiptFiscal(
      ALLOC_B,
      input({
        amount: 30,
        originalRegistration: total100,
        priors: [{ amount: 40, fiscalRegistered: false }],
      }),
    );
    assert.equal(waiting.ok, false);
    if (waiting.ok) return;
    assert.match(waiting.reasons.join(" "), /earlier payment allocation/);
    const middle = assessSalesReceiptFiscal(
      ALLOC_B,
      input({
        amount: 30,
        originalRegistration: total100,
        priors: [{ amount: 40, fiscalRegistered: true }],
      }),
    );
    assert.equal(middle.ok, true);
    if (!middle.ok) return;
    assert.equal(middle.payload.InvoicePaidAmount, 30);
    assert.equal(middle.payload.RemainingAmount, 30);
    assert.equal(middle.payload.PaymentCoverage, "PARTIAL");
    assert.notEqual(middle.payload.trnx_id, first.payload.trnx_id);
  });

  it("freezes the property-local allocation date and blocks unsupported sources", () => {
    const nextDay = assessSalesReceiptFiscal(
      ALLOC_A,
      input({ createdAt: "2026-10-13T21:30:00.000Z" }),
    );
    assert.equal(nextDay.ok, true);
    if (!nextDay.ok) return;
    assert.equal(nextDay.payload.ReceiptDate, "2026-10-14");
    assert.equal(nextDay.payload.source_date, "2026-10-14");
    const cases: Array<[Partial<SalesReceiptFiscalInput>, RegExp]> = [
      [{ originalRegistration: null }, /not been fiscally registered/],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: " ",
            documentNumber: "2821",
            requestSnapshot: originalRequest(),
          },
        },
        /IRN is missing/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: " ",
            requestSnapshot: originalRequest(),
          },
        },
        /document number is missing/,
      ],
      [{ currency: "USD" }, /ETB/],
      [{ amount: 0 }, /greater than zero/],
      [{ reversed: true }, /reversed/],
      [{ reversalRow: true, amount: -5 }, /reversal row/],
      [{ paymentKind: "deposit" }, /Deposits are not fiscal sales receipts/],
      [{ hasAdjustingNotes: true }, /Credit\/Debit Notes/],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: "2821",
            requestSnapshot: { ...originalRequest(), TransactionType: "B2B" },
          },
        },
        /B2C/,
      ],
    ];
    for (const [override, pattern] of cases) {
      const blocked = assessSalesReceiptFiscal(ALLOC_A, input(override));
      assert.equal(blocked.ok, false, JSON.stringify(override));
      if (blocked.ok) continue;
      assert.match(blocked.reasons.join(" "), pattern);
    }
    const legacy = originalRequest() as Record<string, unknown>;
    legacy.ValueDetails = (legacy.info as { ValueDetails: unknown }).ValueDetails;
    legacy.info = null;
    const oldShape = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "2821",
          requestSnapshot: legacy,
        },
      }),
    );
    assert.equal(oldShape.ok, false);
    if (oldShape.ok) return;
    assert.match(oldShape.reasons.join(" "), /legacy request format/);
  });
});

describe("fiscal sales receipt registration safety", () => {
  it("posts sales receipts to sales_receipt and keeps invoice posts on receive_request", async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url);
      assert.match(init?.headers?.Authorization ?? "", /^Bearer /);
      return new Response("{}", { status: 503 });
    };
    await postFiscalReceiveRequest({
      baseUrl: "https://fiscal.test/",
      accessToken: "token",
      payload: { Type: "INV" },
      fetchImpl,
    });
    await postFiscalReceiveRequest({
      baseUrl: "https://fiscal.test/",
      accessToken: "token",
      payload: { PaymentCoverage: "PARTIAL" },
      path: "sales_receipt",
      fetchImpl,
    });
    assert.deepEqual(calls, [
      "https://fiscal.test/receive_request",
      "https://fiscal.test/sales_receipt",
    ]);
  });

  it("treats rule validation as fatal and transport failures as retryable", () => {
    const message = parseFiscalRuleValidation({
      body: [{ portion: "ReferenceDetails", errorMessage: ["7020: amount is not correct"] }],
      message: "RULE VALIDATION ERROR",
      statusCode: 406,
    });
    assert.match(message ?? "", /ReferenceDetails/);
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_PROVIDER_REJECTED", httpStatus: 406 }).retryable,
      false,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 503 }).retryable,
      true,
    );
    assert.equal(classifyFiscalFailure({ code: "FISCAL_TIMEOUT" }).retryable, true);
    const success = parseFiscalInvoiceSuccess({
      body: {
        irn: "IRN-SR",
        status: "A",
        ackDate: "2026-10-13T12:00:00.000Z",
        signedQR: "iVBORw0KGgo=",
        documentNumber: "9001",
        signedInvoice: "signed",
      },
      message: "SUCCESS",
      statusCode: 200,
    });
    assert.equal(success.ok, true);
    if (!success.ok) return;
    assert.equal(success.irn, "IRN-SR");
    assert.equal(success.documentNumber, "9001");
    assert.equal(success.signedQr, "iVBORw0KGgo=");
  });

  it("shows the stored sales receipt in the fiscal exchange", () => {
    const built = assessSalesReceiptFiscal(ALLOC_A, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg-sr",
        source_type: "guest_allocation",
        source_id: ALLOC_A,
        fiscal_document_type: "SALES_RECEIPT",
        status: "PENDING",
        trnx_id: built.payload.trnx_id,
        request_snapshot: built.payload,
        response_snapshot: null,
        attempt_count: 0,
      },
      attempts: [],
      invoiceNumber: "INV-0012",
    });
    const request = exchange.registration.requestSnapshot as {
      PaymentCoverage: string;
      InvoiceIRN: string;
      InvoicePaidAmount: number;
    };
    assert.equal(exchange.registration.documentType, "SALES_RECEIPT");
    assert.equal(exchange.registration.invoiceNumber, "INV-0012");
    assert.equal(request.PaymentCoverage, "PARTIAL");
    assert.equal(request.InvoiceIRN, IRN);
    assert.equal(request.InvoicePaidAmount, 5);
    assert.equal("ItemList" in (exchange.registration.requestSnapshot as object), false);
  });

  it("queues one receipt per allocation and does not write financial rows", async () => {
    assert.equal(salesReceiptTrnxId(ALLOC_A), `gsr-${ALLOC_A}`);
    assert.equal(p5HandlerEnabled("SALES_RECEIPT", "guest_allocation"), true);
    assert.equal(p5HandlerEnabled("WITHHOLDING", "withholding"), false);
    assert.equal(p5HandlerEnabled("INV", "guest_invoice"), false);
    assert.equal(p2HandlerEnabled("INV", "guest_invoice"), true);
    assert.equal(p2HandlerEnabled("SALES_RECEIPT", "guest_allocation"), false);
    assert.equal(p3HandlerEnabled("CRE", "credit_note"), true);
    assert.equal(p4HandlerEnabled("DEB", "debit_note"), true);
    const server = readFileSync(
      new URL("./fiscal-sales-receipt.server.ts", import.meta.url),
      "utf8",
    );
    assert.match(server, /sendStoredFiscalRequest\([\s\S]*"sales_receipt"\)/);
    assert.equal(
      /from\("guest_payment_invoice_allocations"\)[\s\S]{0,240}\.update/.test(server),
      false,
    );
    assert.equal(/from\("guest_folio_invoices"\)[\s\S]{0,180}\.update/.test(server), false);
    assert.equal(/from\("folio_transactions"\)[\s\S]{0,180}\.update/.test(server), false);
    assert.equal(server.includes("post_folio_transaction"), false);
    const reset = server.slice(
      server.indexOf('existing?.status === "FAILED"'),
      server.indexOf("const inserted"),
    );
    assert.equal(reset.includes("request_snapshot"), false);
    const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
    const view = functions.slice(
      functions.indexOf("export const getGuestInvoiceSalesReceiptFiscal"),
      functions.indexOf("export const registerGuestAllocationSalesReceipt"),
    );
    const register = functions.slice(
      functions.indexOf("export const registerGuestAllocationSalesReceipt"),
      functions.indexOf("async function allocationInvoiceId"),
    );
    assert.match(view, /requireCashieringAccess/);
    assert.doesNotMatch(view, /requireCashierManager/);
    assert.match(register, /requireCashierManager/);

    memoryDb();
    const beforeAllocations = JSON.stringify(sharedTables().guest_payment_invoice_allocations);
    const beforeInvoices = JSON.stringify(sharedTables().guest_folio_invoices);
    const beforePayments = JSON.stringify(sharedTables().folio_transactions);
    const first = await queueGuestAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_A,
    });
    const second = await queueGuestAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_A,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.equal(second.registration?.id, first.registration?.id);
    assert.equal(second.registration?.trnxId, salesReceiptTrnxId(ALLOC_A));
    assert.equal(second.preview?.ReceiptDate ?? second.preview?.receiptDate, "2026-10-13");
    const stored = sharedTables().fiscal_registrations.find((row) => row.source_id === ALLOC_A);
    const frozen = JSON.stringify(stored?.request_snapshot);
    assert.match(frozen, /"InvoicePaidAmount":5/);
    assert.match(frozen, /"RemainingAmount":7/);
    assert.match(frozen, /"PaymentCoverage":"PARTIAL"/);
    assert.match(frozen, /"info":\{\}/);
    assert.equal(frozen.includes("BuyerDetails"), false);
    const listed = await getGuestInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: INVOICE_ID,
    });
    assert.equal(listed.lines[0]?.status, "queued");
    assert.equal(listed.lines[1]?.status, "not_eligible");
    assert.match(listed.lines[1]?.reasons.join(" ") ?? "", /earlier payment allocation/);
    if (stored) stored.status = "REGISTERED";
    const afterFirst = await getGuestInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: INVOICE_ID,
    });
    assert.equal(afterFirst.lines[1]?.status, "not_registered");
    assert.equal(afterFirst.lines[1]?.preview?.coverage, "FULL");
    assert.equal(afterFirst.lines[1]?.preview?.remaining, 0);
    assert.equal(afterFirst.lines[1]?.canRegister, true);
    const finalReceipt = await queueGuestAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_B,
    });
    assert.equal(finalReceipt.status, "queued");
    assert.equal(finalReceipt.preview?.coverage, "FULL");
    assert.equal(finalReceipt.preview?.paid, 7);
    assert.equal(
      JSON.stringify(
        sharedTables().fiscal_registrations.find((row) => row.source_id === ALLOC_A)
          ?.request_snapshot,
      ),
      frozen,
    );
    assert.equal(
      sharedTables().fiscal_registrations.filter(
        (row) => row.fiscal_document_type === "SALES_RECEIPT",
      ).length,
      2,
    );
    const other = await queueGuestAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_OTHER,
    });
    assert.equal(other.status, "queued");
    assert.equal(other.preview?.paid, 60);
    assert.equal(other.preview?.invoiceIrn, "IRN-B");
    assert.equal(
      JSON.stringify(sharedTables().guest_payment_invoice_allocations),
      beforeAllocations,
    );
    assert.equal(JSON.stringify(sharedTables().guest_folio_invoices), beforeInvoices);
    assert.equal(JSON.stringify(sharedTables().folio_transactions), beforePayments);
    sharedTables().guest_payment_invoice_allocations.push({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      restaurant_id: PROPERTY,
      invoice_id: INVOICE_ID,
      payment_transaction_id: PAYMENT_ID,
      amount: -5,
      created_at: "2026-10-13T12:00:00.000Z",
      reverses_allocation_id: ALLOC_A,
    });
    const preserved = await getGuestInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: INVOICE_ID,
    });
    assert.equal(preserved.lines[0]?.status, "registered");
    assert.match(preserved.lines[0]?.warning ?? "", /cancellation is not yet implemented/);
    assert.equal(
      JSON.stringify(
        sharedTables().fiscal_registrations.find((row) => row.source_id === ALLOC_A)
          ?.request_snapshot,
      ),
      frozen,
    );
    let called = false;
    await sendClaimedSalesReceipt(
      memoryDb(sharedTables()),
      {
        id: "pending-reversed",
        source_id: ALLOC_A,
        restaurant_id: PROPERTY,
        attempt_count: 0,
        request_snapshot: { PaymentCoverage: "PARTIAL" },
        request_hash: "hash",
      },
      async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    );
    assert.equal(called, false);
  });
});

function sharedTables() {
  return tables;
}

const tables: Record<string, Record<string, unknown>[]> = {};
let receiptSequence = 0;

function seedTables() {
  receiptSequence = 0;
  tables.restaurants = [{ id: PROPERTY, timezone: "Africa/Addis_Ababa" }];
  tables.guest_folio_invoices = [
    {
      id: INVOICE_ID,
      restaurant_id: PROPERTY,
      issued_number: "INV-0012",
      snapshot: { property: { currencyCode: "ETB" }, totals: { invoiceTotal: 12 } },
    },
    {
      id: OTHER_INVOICE,
      restaurant_id: PROPERTY,
      issued_number: "INV-0060",
      snapshot: { property: { currencyCode: "ETB" }, totals: { invoiceTotal: 60 } },
    },
  ];
  tables.folio_transactions = [
    {
      id: PAYMENT_ID,
      restaurant_id: PROPERTY,
      transaction_type: "payment",
      amount: -100,
    },
  ];
  tables.guest_payment_invoice_allocations = [
    allocation(ALLOC_A, INVOICE_ID, 5, "2026-10-13T10:00:00.000Z"),
    allocation(ALLOC_B, INVOICE_ID, 7, "2026-10-13T11:00:00.000Z"),
    allocation(ALLOC_OTHER, OTHER_INVOICE, 60, "2026-10-13T10:30:00.000Z"),
  ];
  tables.invoice_credit_notes = [];
  tables.fiscal_registrations = [
    registration(INVOICE_ID, "guest_invoice", "INV", originalRequest(), "inv-reg", IRN, "2821"),
    registration(
      OTHER_INVOICE,
      "guest_invoice",
      "INV",
      originalRequest({ info: { ValueDetails: { TotalValue: 60 } } }),
      "inv-other",
      "IRN-B",
      "2822",
    ),
  ];
  tables.pms_integrations = [
    {
      id: "integration-1",
      restaurant_id: PROPERTY,
      category: "fiscal",
      provider: "erp_fiscal",
      enabled: true,
      config: { taxpayerTin: "0026716178", client: "ERP", deviceId: "001096" },
    },
  ];
  tables.fiscal_credential_refs = [{ integration_id: "integration-1" }];
}

function allocation(id: string, invoiceId: string, amount: number, createdAt: string) {
  return {
    id,
    restaurant_id: PROPERTY,
    invoice_id: invoiceId,
    payment_transaction_id: PAYMENT_ID,
    amount,
    created_at: createdAt,
    reverses_allocation_id: null,
  };
}

function registration(
  sourceId: string,
  sourceType: string,
  documentType: string,
  snapshot: unknown,
  id: string,
  irn: string,
  documentNumber: string,
) {
  return {
    id,
    restaurant_id: PROPERTY,
    source_type: sourceType,
    source_id: sourceId,
    fiscal_document_type: documentType,
    status: "REGISTERED",
    trnx_id: `gi-${sourceId}`,
    external_irn: irn,
    external_document_number: documentNumber,
    request_snapshot: snapshot,
  };
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
        receiptSequence += 1;
        inserted = { id: `sr-${receiptSequence}`, ...values };
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
