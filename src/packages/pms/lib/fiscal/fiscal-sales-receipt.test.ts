import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { p4HandlerEnabled } from "./fiscal-debit-note.ts";
import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import { postFiscalReceiveRequest } from "./fiscal-client.server.ts";
import {
  fiscalQrSrc,
  parseFiscalInvoiceSuccess,
  parseFiscalRuleValidation,
} from "./fiscal-guest-invoice.ts";
import { p2HandlerEnabled } from "./fiscal-guest-invoice.ts";
import { p3HandlerEnabled } from "./fiscal-credit-note.ts";
import {
  assessSalesReceiptFiscal,
  p5HandlerEnabled,
  parseFiscalSalesReceiptSuccess,
  salesReceiptCorrectionDecision,
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
    Mode: "CREDIT",
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

describe("failed sales receipt correction", () => {
  it("allows a rejection, waits on retries, and confirms an exhausted server error", () => {
    const rejected = salesReceiptCorrectionDecision({
      status: "FAILED",
      nextAttemptAt: null,
      lastErrorCode: "FISCAL_PROVIDER_REJECTED",
      externalRrn: null,
      externalIrn: null,
      registeredAt: null,
    });
    assert.equal(rejected.canCorrect, true);
    assert.equal(rejected.needsConfirmation, false);
    const retrying = salesReceiptCorrectionDecision({
      status: "FAILED",
      nextAttemptAt: "2026-10-16T06:00:00Z",
      lastErrorCode: "FISCAL_HTTP_ERROR",
      externalRrn: null,
      externalIrn: null,
      registeredAt: null,
    });
    assert.equal(retrying.canCorrect, false);
    assert.match(retrying.reason ?? "", /Retry this receipt/);
    const exhausted = salesReceiptCorrectionDecision({
      status: "FAILED",
      nextAttemptAt: null,
      lastErrorCode: "FISCAL_HTTP_ERROR",
      externalRrn: null,
      externalIrn: null,
      registeredAt: null,
    });
    assert.equal(exhausted.canCorrect, true);
    assert.equal(exhausted.needsConfirmation, true);
    assert.match(exhausted.reason ?? "", /provider portal/);
    assert.equal(
      salesReceiptCorrectionDecision({
        status: "REGISTERED",
        nextAttemptAt: null,
        lastErrorCode: null,
        externalRrn: "rrn",
        externalIrn: null,
        registeredAt: "2026-10-16T00:00:00Z",
      }).canCorrect,
      false,
    );
  });

  it("replaces the allocation without posting a folio transaction", () => {
    const sql = readFileSync(
      new URL(
        "../../../../../supabase/migrations/0162_correct_failed_sales_receipt_allocation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const drizzle = readFileSync(
      new URL(
        "../../../../../drizzle/migrations/0162_correct_failed_sales_receipt_allocation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal(sql, drizzle);
    assert.match(sql, /FISCAL_RECEIPT_UNCERTAIN/);
    assert.match(sql, /FISCAL_RECEIPT_CONFIRMATION_REQUIRED/);
    assert.match(sql, /status = 'BLOCKED'/);
    assert.doesNotMatch(sql, /INSERT INTO public\.folio_transactions/);
    const guest = sql.slice(
      sql.indexOf("FUNCTION public.correct_failed_guest_sales_receipt_allocation"),
      sql.indexOf("FUNCTION public.correct_failed_company_sales_receipt_allocation"),
    );
    assert.match(guest, /-remaining/);
    assert.match(guest, /guest_invoice_deposit_cover/);
  });
});

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
    assert.equal(result.payload.ReceiptNumber, "GSR-bbbbbbbbbbbb4bbb");
    assert.equal(result.payload.ReceiptNumber.length <= 20, true);
    assert.match(
      result.payload.ReceiptDate,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
    );
    assert.equal(result.payload.ReceiptDate, "2026-10-13T13:00:00+03:00");
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

  it("blocks a receipt when the original invoice was registered as CASH", () => {
    const blocked = (documentType: "CRE" | "DEB" | null) =>
      assessSalesReceiptFiscal(
        ALLOC_A,
        input({
          fiscalEnvironment: "TEST",
          hasAdjustingNotes: documentType != null,
          noteAdjustments: documentType ? [{ documentType, status: "REGISTERED", total: 10 }] : [],
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: "2821",
            requestSnapshot: originalRequest({ Mode: "CASH" }),
          },
        }),
      );
    for (const result of [blocked(null), blocked("CRE"), blocked("DEB")]) {
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(
        result.reasons.includes(
          "Sales Receipt is not applicable because the original fiscal invoice was registered as CASH.",
        ),
        true,
      );
    }
  });

  it("keeps the receipt number and RFC3339 date stable on a second build", () => {
    const first = assessSalesReceiptFiscal(ALLOC_A, input());
    const second = assessSalesReceiptFiscal(ALLOC_A, input());
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.payload.ReceiptNumber, first.payload.ReceiptNumber);
    assert.equal(second.payload.ReceiptDate, first.payload.ReceiptDate);
    assert.equal(second.payload.invoice_total_amount, 12);
    assert.equal(second.payload.InvoicePaidAmount, 5);
    assert.equal(second.payload.RemainingAmount, 7);
    assert.notEqual(first.payload.ReceiptNumber, first.payload.trnx_id);
    const named = assessSalesReceiptFiscal(ALLOC_A, input({ receiptNumber: "SR-000014" }));
    assert.equal(named.ok, true);
    if (!named.ok) return;
    assert.equal(named.payload.ReceiptNumber, "SR-000014");
    assert.equal(named.payload.ReceiptDate, first.payload.ReceiptDate);
  });

  it("uses a short TEST transaction id and omits ReceiptNumber", () => {
    const allocationId = "59e15d53-77fa-4f2b-9620-34d40cb1d16a";
    const first = assessSalesReceiptFiscal(allocationId, input({ fiscalEnvironment: "TEST" }));
    const second = assessSalesReceiptFiscal(allocationId, input({ fiscalEnvironment: "TEST" }));
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.payload.trnx_id, "GSR59E15D5377FA4F2B");
    assert.equal(first.payload.trnx_id.length <= 20, true);
    assert.equal(second.payload.trnx_id, first.payload.trnx_id);
    assert.equal(second.payload.ReceiptDate, first.payload.ReceiptDate);
    assert.equal("ReceiptNumber" in first.payload, false);
    assert.match(first.payload.ReceiptDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    assert.equal(first.payload.invoice_total_amount, 12);
    assert.equal(first.payload.InvoicePaidAmount, 5);
    assert.equal(first.payload.RemainingAmount, 7);
    assert.equal(first.payload.PaymentCoverage, "PARTIAL");
    assert.deepEqual(first.payload.info, {});
    const production = assessSalesReceiptFiscal(
      allocationId,
      input({ fiscalEnvironment: "PRODUCTION" }),
    );
    assert.equal(production.ok, true);
    if (!production.ok) return;
    assert.equal(production.payload.trnx_id, `gsr-${allocationId}`);
    assert.equal(production.payload.ReceiptNumber, "GSR-59e15d5377fa4f2b");
    assert.equal(production.payload.invoice_total_amount, first.payload.invoice_total_amount);
    assert.equal(production.payload.InvoicePaidAmount, first.payload.InvoicePaidAmount);
    assert.equal(production.payload.RemainingAmount, first.payload.RemainingAmount);
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
    assert.equal(nextDay.payload.ReceiptDate, "2026-10-14T00:30:00+03:00");
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
        /BuyerDetails/,
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

  it("accepts the live sales receipt success body without an invoice IRN", () => {
    const providerQr = "iVBORw0KGgo...";
    const live = {
      body: {
        id: 70416,
        qr: providerQr,
        rrn: "26b1ea7d9a67e356090afb2e8a45784bf7223c1c9d3cf6425347aa3718af81",
        status: "A",
      },
      message: "Success",
      statusCode: 200,
    };
    assert.equal(parseFiscalInvoiceSuccess(live).ok, false);
    const parsed = parseFiscalSalesReceiptSuccess(live);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.externalId, "70416");
    assert.equal(
      parsed.externalRrn,
      "26b1ea7d9a67e356090afb2e8a45784bf7223c1c9d3cf6425347aa3718af81",
    );
    assert.equal(parsed.signedQr, providerQr);
    assert.equal(fiscalQrSrc(parsed.signedQr), `data:image/png;base64,${providerQr}`);
    assert.equal(
      fiscalQrSrc("26b1ea7d9a67e356090afb2e8a45784bf7223c1c9d3cf6425347aa3718af81"),
      null,
    );
    assert.equal(fiscalQrSrc("70416"), null);
    const missingQr = parseFiscalSalesReceiptSuccess({
      ...live,
      body: { id: live.body.id, rrn: live.body.rrn, status: live.body.status },
    });
    assert.equal(missingQr.ok, true);
    if (missingQr.ok) assert.equal(missingQr.signedQr, null);
    assert.equal(parsed.irn, null);
    assert.equal(parsed.documentNumber, null);
    assert.equal(parsed.acknowledgedAt, null);
    assert.equal(parsed.externalStatus, "A");
    const lower = parseFiscalSalesReceiptSuccess({ ...live, message: "success" });
    assert.equal(lower.ok, true);
    assert.equal(
      parseFiscalSalesReceiptSuccess({ ...live, body: { ...live.body, status: "F" } }).ok,
      false,
    );
    assert.match(
      parseFiscalRuleValidation({ statusCode: 406, message: "RULE VALIDATION ERROR" }) ?? "",
      /RULE VALIDATION/,
    );
    const guestServer = readFileSync(
      new URL("./fiscal-sales-receipt.server.ts", import.meta.url),
      "utf8",
    );
    const companyServer = readFileSync(
      new URL("./fiscal-company-sales-receipt.server.ts", import.meta.url),
      "utf8",
    );
    assert.match(guestServer, /parseFiscalSalesReceiptSuccess/);
    assert.match(companyServer, /parseFiscalSalesReceiptSuccess/);
    const persistence = readFileSync(
      new URL("./fiscal-guest-invoice.server.ts", import.meta.url),
      "utf8",
    );
    assert.match(persistence, /outcome: "success"/);
    assert.match(persistence, /status: "REGISTERED"/);
    assert.match(persistence, /external_id: success\.externalId/);
    assert.match(persistence, /external_rrn: success\.externalRrn/);
    assert.match(persistence, /signed_qr: success\.signedQr/);
    assert.match(persistence, /success\.irn \? \{ external_irn: success\.irn \}/);
    const present = guestServer.slice(
      guestServer.indexOf("function presentAllocation"),
      guestServer.indexOf("function line("),
    );
    assert.ok(present.indexOf('status === "REGISTERED"') < present.indexOf('"failed"'));
    assert.doesNotMatch(
      guestServer,
      /sendStoredFiscalRequest\(db, row, fetchImpl, "sales receipt", "sales_receipt"\)/,
    );
    const resultUi = readFileSync(
      new URL("../../components/cashiering/sales-receipt-fiscal-result.tsx", import.meta.url),
      "utf8",
    );
    const guestUi = readFileSync(
      new URL("../../components/cashiering/guest-sales-receipt-section.tsx", import.meta.url),
      "utf8",
    );
    const companyUi = readFileSync(
      new URL("../../components/cashiering/company-sales-receipt-section.tsx", import.meta.url),
      "utf8",
    );
    assert.match(resultUi, /RRN:/);
    assert.match(resultUi, /Provider Receipt ID:/);
    assert.match(resultUi, /QR not supplied by provider/);
    assert.match(resultUi, /Registered \/ Provider Status:/);
    assert.match(resultUi, /src=\{qrSrc\}/);
    assert.doesNotMatch(resultUi, /IRN/);
    assert.doesNotMatch(resultUi, /qrcode/i);
    assert.match(guestUi, /SalesReceiptFiscalResult/);
    assert.match(companyUi, /SalesReceiptFiscalResult/);
    assert.doesNotMatch(guestServer, /qrcode/i);
    assert.doesNotMatch(companyServer, /qrcode/i);
  });

  it("keeps a registered receipt registered after an earlier failed attempt", async () => {
    const providerQr = "iVBORw0KGgo...";
    const rrn = "26b1ea7d9a67e356090afb2e8a45784bf7223c1c9d3cf6425347aa3718af81";
    memoryDb();
    sharedTables().fiscal_registrations.push({
      id: "sr-live",
      restaurant_id: PROPERTY,
      source_type: "guest_allocation",
      source_id: ALLOC_A,
      fiscal_document_type: "SALES_RECEIPT",
      status: "REGISTERED",
      trnx_id: "GSR59E15D5377FA4F2B",
      external_id: "70416",
      external_rrn: rrn,
      external_status: "A",
      signed_qr: providerQr,
      last_error_code: "FISCAL_PROVIDER_REJECTED",
      last_error_message: "The fiscal service returned an unexpected registration response.",
      request_snapshot: null,
    });
    sharedTables().fiscal_registration_attempts = [
      {
        registration_id: "sr-live",
        outcome: "fatal_error",
        error_code: "FISCAL_PROVIDER_REJECTED",
      },
      { registration_id: "sr-live", outcome: "success", error_code: null },
    ];
    const listed = await getGuestInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: INVOICE_ID,
    });
    const line = listed.lines.find((row) => row.allocationId === ALLOC_A);
    assert.equal(line?.status, "registered");
    assert.equal(line?.registration?.rrn, rrn);
    assert.equal(line?.registration?.providerId, "70416");
    assert.equal(line?.registration?.providerStatus, "A");
    assert.equal(line?.registration?.qrSrc, `data:image/png;base64,${providerQr}`);
    assert.equal(line?.registration?.irn, null);
    assert.equal(line?.registration?.documentNumber, null);
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
    assert.match(
      server,
      /sendStoredFiscalRequest\([\s\S]*"sales_receipt",\s*parseFiscalSalesReceiptSuccess/,
    );
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
    const createdSnapshot = JSON.stringify(
      sharedTables().fiscal_registrations.find((row) => row.source_id === ALLOC_A)
        ?.request_snapshot,
    );
    const second = await queueGuestAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_A,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.equal(second.registration?.id, first.registration?.id);
    assert.equal(second.registration?.trnxId, salesReceiptTrnxId(ALLOC_A));
    assert.equal(second.preview?.receiptDate, "2026-10-13T13:00:00+03:00");
    const stored = sharedTables().fiscal_registrations.find((row) => row.source_id === ALLOC_A);
    assert.equal(JSON.stringify(stored?.request_snapshot), createdSnapshot);
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

describe("TEST sales receipt after a registered credit or debit note", () => {
  it("keeps an unadjusted invoice on the original fiscal total", () => {
    const result = assessSalesReceiptFiscal(ALLOC_A, input({ fiscalEnvironment: "TEST" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.invoice_total_amount, 12);
    assert.equal(result.payload.InvoicePaidAmount, 5);
    assert.equal(result.payload.RemainingAmount, 7);
    assert.equal(result.payload.PaymentCoverage, "PARTIAL");
  });

  it("blocks production even when every related note is registered", () => {
    const blocked = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        hasAdjustingNotes: true,
        fiscalEnvironment: "PRODUCTION",
        noteAdjustments: [{ documentType: "CRE", status: "REGISTERED", total: 80 }],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.match(blocked.reasons.join(" "), /not supported in the current fiscal phase/);
  });

  it("blocks TEST when a related note is pending, failed, or unregistered", () => {
    for (const status of ["PENDING", "FAILED", "MISSING"]) {
      const blocked = assessSalesReceiptFiscal(
        ALLOC_A,
        input({
          hasAdjustingNotes: true,
          fiscalEnvironment: "TEST",
          noteAdjustments: [{ documentType: "CRE", status, total: 80 }],
          originalRegistration: registeredInvoice(200),
        }),
      );
      assert.equal(blocked.ok, false, status);
    }
  });

  it("sends the adjusted TEST total for a partial allocation", () => {
    const result = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        amount: 100,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [
          { documentType: "CRE", status: "REGISTERED", total: 80 },
          { documentType: "DEB", status: "REGISTERED", total: 0 },
        ],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.invoice_total_amount, 200);
    assert.equal(result.payload.InvoicePaidAmount, 100);
    assert.equal(result.payload.RemainingAmount, 20);
    assert.equal(result.payload.PaymentCoverage, "PARTIAL");
    assert.equal(result.payload.InvoiceIRN, IRN);
    assert.equal(result.payload.invoice_document_no, "2821");
    assert.equal(result.payload.trnx_id, "GSRBBBBBBBBBBBB4BBB");
    assert.equal(result.payload.trnx_id.length <= 20, true);
    assert.equal("ReceiptNumber" in result.payload, false);
    assert.equal(result.payload.ReceiptDate, "2026-10-13T13:00:00+03:00");
    assert.equal(result.payload.source_date, "2026-10-13");
    assert.equal(result.payload.TransactionType, "B2C");
    assert.deepEqual(result.payload.info, {});
  });

  it("adds a registered debit and closes the adjusted balance", () => {
    const partial = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        amount: 100,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [{ documentType: "DEB", status: "REGISTERED", total: 30 }],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.equal(partial.payload.invoice_total_amount, 200);
    assert.equal(partial.payload.RemainingAmount, 130);
    const full = assessSalesReceiptFiscal(
      ALLOC_B,
      input({
        amount: 20,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [{ documentType: "CRE", status: "REGISTERED", total: 80 }],
        priors: [{ amount: 100, fiscalRegistered: true }],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(full.ok, true);
    if (!full.ok) return;
    assert.equal(full.payload.invoice_total_amount, 200);
    assert.equal(full.payload.RemainingAmount, 0);
    assert.equal(full.payload.PaymentCoverage, "FULL");
  });

  it("sends the original registered total and the adjusted remaining amount", () => {
    const credit = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        amount: 30,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [{ documentType: "CRE", status: "REGISTERED", total: 90 }],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(credit.ok, true);
    if (!credit.ok) return;
    assert.equal(credit.payload.invoice_total_amount, 200);
    assert.equal(credit.payload.InvoicePaidAmount, 30);
    assert.equal(credit.payload.RemainingAmount, 80);
    assert.equal(credit.payload.PaymentCoverage, "PARTIAL");

    const debit = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        amount: 30,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [{ documentType: "DEB", status: "REGISTERED", total: 50 }],
        originalRegistration: registeredInvoice(200),
      }),
    );
    assert.equal(debit.ok, true);
    if (!debit.ok) return;
    assert.equal(debit.payload.invoice_total_amount, 200);
    assert.equal(debit.payload.RemainingAmount, 220);
    assert.equal(debit.payload.PaymentCoverage, "PARTIAL");

    const both = assessSalesReceiptFiscal(
      ALLOC_A,
      input({
        amount: 300,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [
          { documentType: "CRE", status: "REGISTERED", total: 200 },
          { documentType: "DEB", status: "REGISTERED", total: 50 },
        ],
        originalRegistration: registeredInvoice(1000),
      }),
    );
    assert.equal(both.ok, true);
    if (!both.ok) return;
    assert.equal(both.payload.invoice_total_amount, 1000);
    assert.equal(both.payload.InvoicePaidAmount, 300);
    assert.equal(both.payload.RemainingAmount, 550);
    assert.equal(both.payload.PaymentCoverage, "PARTIAL");
  });
});

function registeredInvoice(total: number): SalesReceiptFiscalInput["originalRegistration"] {
  return {
    status: "REGISTERED",
    irn: IRN,
    documentNumber: "2821",
    requestSnapshot: originalRequest({
      info: { ValueDetails: { TotalValue: total, InvoiceCurrency: "ETB" } },
    }),
  };
}

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
