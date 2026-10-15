import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assessCompanyCreditFiscal,
  companyCreditTrnxId,
  type CompanyCreditInput,
} from "./fiscal-company-credit-note.ts";
import { queueCompanyCreditFiscal } from "./fiscal-company-credit-note.server.ts";
import {
  assessCompanyDebitFiscal,
  companyDebitTrnxId,
  type CompanyDebitInput,
} from "./fiscal-company-debit-note.ts";
import { queueCompanyDebitFiscal } from "./fiscal-company-debit-note.server.ts";
import { loadFiscalRegistrationExchange } from "./fiscal-exchange.server.ts";
import { fiscalQrSrc } from "./fiscal-guest-invoice.ts";
import { p3HandlerEnabled } from "./fiscal-credit-note.ts";
import { p4HandlerEnabled } from "./fiscal-debit-note.ts";
import { p5HandlerEnabled } from "./fiscal-sales-receipt.ts";
import { p6HandlerEnabled } from "./fiscal-company-invoice.ts";
import {
  assessCompanyReceiptFiscal,
  companyReceiptTrnxId,
  p7ReceiptEnabled,
  type CompanyReceiptInput,
} from "./fiscal-company-sales-receipt.ts";
import {
  getCompanyInvoiceSalesReceipts,
  queueCompanyAllocationSalesReceipt,
  sendClaimedCompanyReceipt,
} from "./fiscal-company-sales-receipt.server.ts";
import { type FiscalDb, type FiscalDbQuery, type FiscalDbResult } from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RECEIPT_INVOICE = "dddddddd-dddd-4ddd-8ddd-dddddddddd11";
const OTHER_INVOICE = "dddddddd-dddd-4ddd-8ddd-dddddddddd22";
const GROUP_INVOICE = "dddddddd-dddd-4ddd-8ddd-dddddddddd33";
const CREDIT_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const DEBIT_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ALLOC_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const ALLOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const ALLOC_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const GUEST_ALLOC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9";
const PAYMENT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const IRN = "IRN-COMPANY-B2B";
const BUYER = {
  LegalName: "Alpha PLC",
  Tin: "123",
  VatNumber: "REG-A",
  Phone: "111",
  Email: null,
  City: null,
  Region: null,
  Zone: null,
  Wereda: null,
  Kebele: null,
  HouseNumber: null,
  IdType: "KID",
  IdNumber: null,
};

const liveCompany = { LegalName: "Beta PLC", Tin: "999", VatNumber: "REG-B", Phone: "222" };
const liveMappings = { ItemCode: 2005, TaxCode: "VAT0", NatureOfSupplies: "goods" };

function originalRequest(overrides: Record<string, unknown> = {}) {
  return {
    Date: "13-10-2026T06:30:00",
    Mode: "CASH",
    Type: "INV",
    info: {
      ItemList: [
        {
          Unit: "PCS",
          TaxCode: "VAT15",
          ItemCode: 1001,
          Quantity: 1,
          TaxAmount: 15,
          UnitPrice: 100,
          PreTaxValue: 100,
          NatureOfSupplies: "service",
          HarmonizationCode: "HS-1",
          ProductDescription: "Room Accommodation",
        },
      ],
      ValueDetails: { TotalValue: 115, InvoiceCurrency: "ETB" },
      BuyerDetails: { ...BUYER },
    },
    TransactionType: "B2B",
    ...overrides,
  };
}

function connection() {
  return {
    enabled: true,
    taxpayerTin: "0026716178",
    client: "ERP",
    deviceId: "001096",
    credentialsConfigured: true,
  };
}

function creditInput(overrides: Partial<CompanyCreditInput> = {}): CompanyCreditInput {
  return {
    accountInvoiceId: INVOICE_ID,
    accountKind: "company",
    currency: "ETB",
    issuedAt: "2026-10-13T10:00:00.000Z",
    noteNumber: "CCN-0001",
    totalDelta: -46,
    creditSnapshot: {
      document: { originalInvoiceNumber: "AINV-0007" },
      groups: [{ sourceGroupId: GROUP_ID, subtotal: 40, tax: 6, serviceCharge: 0 }],
    },
    invoiceSnapshot: {
      account: { accountKind: "company", currency: "ETB", name: liveCompany.LegalName },
      groups: [{ sourceGroupId: GROUP_ID }],
      billTo: { name: liveCompany.LegalName, taxId: liveCompany.Tin },
    },
    connection: connection(),
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "5001",
      requestSnapshot: originalRequest(),
    },
    ...overrides,
  };
}

function debitInput(overrides: Partial<CompanyDebitInput> = {}): CompanyDebitInput {
  return {
    accountInvoiceId: INVOICE_ID,
    accountKind: "company",
    currency: "ETB",
    issuedAt: "2026-10-13T11:00:00.000Z",
    noteNumber: "CDN-0001",
    totalDelta: 46,
    debitSnapshot: {
      document: { originalInvoiceNumber: "AINV-0007" },
      groups: [
        {
          sourceGroupId: GROUP_ID,
          subtotal: 40,
          tax: 6,
          serviceCharge: 0,
          quantity: 2,
          unitAmount: 20,
        },
      ],
    },
    invoiceSnapshot: {
      account: { accountKind: "company", currency: "ETB" },
      groups: [{ sourceGroupId: GROUP_ID }],
    },
    connection: connection(),
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "5001",
      requestSnapshot: originalRequest(),
    },
    ...overrides,
  };
}

function receiptRequest(total = 12) {
  return originalRequest({
    info: {
      ItemList: [
        {
          Unit: "PCS",
          TaxCode: "VAT15",
          ItemCode: 1001,
          Quantity: 1,
          TaxAmount: 0,
          UnitPrice: total,
          PreTaxValue: total,
          NatureOfSupplies: "service",
          HarmonizationCode: null,
          ProductDescription: "Room Accommodation",
        },
      ],
      ValueDetails: { TotalValue: total },
      BuyerDetails: { ...BUYER },
    },
  });
}

function receiptInput(overrides: Partial<CompanyReceiptInput> = {}): CompanyReceiptInput {
  return {
    amount: 5,
    createdAt: "2026-10-13T10:00:00.000Z",
    reversed: false,
    reversalRow: false,
    paymentKind: "payment",
    accountKind: "company",
    currency: "ETB",
    invoiceNumber: "AINV-0012",
    timezone: "Africa/Addis_Ababa",
    hasAdjustingNotes: false,
    hasActiveWithholding: false,
    priors: [],
    connection: connection(),
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      documentNumber: "5001",
      requestSnapshot: receiptRequest(),
    },
    ...overrides,
  };
}

describe("company B2B credit note", () => {
  it("copies the original buyer and fiscal item identity with positive credit amounts", () => {
    const result = assessCompanyCreditFiscal(CREDIT_ID, creditInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(result.payload.Type, "CRE");
    assert.equal(result.payload.RelatedDocument, IRN);
    assert.equal(result.payload.TransactionType, "B2B");
    assert.equal(result.payload.Mode, "CASH");
    assert.equal(result.payload.trnx_id, companyCreditTrnxId(CREDIT_ID));
    assert.deepEqual(result.payload.info.BuyerDetails, BUYER);
    assert.equal(JSON.stringify(result.payload).includes(liveCompany.LegalName), false);
    assert.equal(JSON.stringify(result.payload).includes(String(liveMappings.ItemCode)), false);
    assert.equal(line?.ItemCode, 1001);
    assert.equal(line?.ProductDescription, "Room Accommodation");
    assert.equal(line?.TaxCode, "VAT15");
    assert.equal(line?.Unit, "PCS");
    assert.equal(line?.NatureOfSupplies, "service");
    assert.equal(line?.HarmonizationCode, "HS-1");
    assert.equal(line?.Quantity, 1);
    assert.equal(line?.UnitPrice, 40);
    assert.equal(line?.PreTaxValue, 40);
    assert.equal(line?.TaxAmount, 6);
    assert.equal(line?.TotalLineAmount, 46);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 46);
    assert.ok((line?.PreTaxValue as number) > 0);
    assert.equal(result.preview.companyName, "Alpha PLC");
    assert.equal(result.preview.tin, "123");
    assert.equal(result.preview.vatNumber, "REG-A");
  });

  it("keeps original quantity when the whole fiscal line is credited", () => {
    const full = assessCompanyCreditFiscal(
      CREDIT_ID,
      creditInput({
        totalDelta: -115,
        creditSnapshot: {
          document: { originalInvoiceNumber: "AINV-0007" },
          groups: [{ sourceGroupId: GROUP_ID, subtotal: 100, tax: 15, serviceCharge: 0 }],
        },
      }),
    );
    assert.equal(full.ok, true);
    if (!full.ok) return;
    assert.equal(full.payload.info.ItemList[0]?.Quantity, 1);
    assert.equal(full.payload.info.ItemList[0]?.UnitPrice, 100);
    assert.equal(full.payload.info.ItemList[0]?.PreTaxValue, 100);
  });

  it("blocks a note that is not a company B2B credit against a registered invoice", () => {
    const cases: Array<[Partial<CompanyCreditInput>, RegExp]> = [
      [{ accountKind: "group" }, /company credit note/],
      [{ accountInvoiceId: null }, /company credit note/],
      [{ originalRegistration: null }, /not been fiscally registered/],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: null,
            documentNumber: "5001",
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
            documentNumber: "5001",
            requestSnapshot: originalRequest({
              info: {
                ItemList: (originalRequest().info as { ItemList: unknown }).ItemList,
                ValueDetails: { TotalValue: 115 },
              },
            }),
          },
        },
        /BuyerDetails are missing/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: "5001",
            requestSnapshot: originalRequest({ TransactionType: "B2C" }),
          },
        },
        /B2B/,
      ],
    ];
    for (const [override, pattern] of cases) {
      const blocked = assessCompanyCreditFiscal(CREDIT_ID, creditInput(override));
      assert.equal(blocked.ok, false);
      if (blocked.ok) continue;
      assert.match(blocked.reasons.join(" "), pattern);
    }
    const source = readFileSync(
      new URL("./fiscal-company-credit-note.ts", import.meta.url),
      "utf8",
    );
    assert.equal(source.includes("guest_account_masters"), false);
    assert.equal(source.includes("fiscal_item_mappings"), false);
    assert.equal(source.includes("fiscal_tax_code_mappings"), false);
  });
});

describe("historical company buyer details", () => {
  it("copies a stored free-text Region onto credit, debit, and sales receipt", () => {
    const creditRequest = originalRequest();
    const creditBuyer = creditRequest.info.BuyerDetails as { Region: string; City: string };
    creditBuyer.Region = "Addis Ababa";
    creditBuyer.City = "Addis Ababa";
    const credit = assessCompanyCreditFiscal(
      CREDIT_ID,
      creditInput({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: creditRequest,
        },
      }),
    );
    const debitRequest = originalRequest();
    const debitBuyer = debitRequest.info.BuyerDetails as { Region: string; City: string };
    debitBuyer.Region = "Addis Ababa";
    debitBuyer.City = "Addis Ababa";
    const debit = assessCompanyDebitFiscal(
      DEBIT_ID,
      debitInput({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: debitRequest,
        },
      }),
    );
    const receiptSnapshot = receiptRequest();
    const receiptBuyer = receiptSnapshot.info.BuyerDetails as { Region: string; City: string };
    receiptBuyer.Region = "Addis Ababa";
    receiptBuyer.City = "Addis Ababa";
    const receipt = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: receiptSnapshot,
        },
      }),
    );
    assert.equal(credit.ok && debit.ok && receipt.ok, true);
    if (!credit.ok || !debit.ok || !receipt.ok) return;
    assert.equal(credit.payload.info.BuyerDetails.Region, "Addis Ababa");
    assert.equal(debit.payload.info.BuyerDetails.Region, "Addis Ababa");
    assert.equal(receipt.payload.info.BuyerDetails.Region, "Addis Ababa");
    assert.equal(credit.payload.info.BuyerDetails.City, "Addis Ababa");
    assert.equal(debit.payload.info.BuyerDetails.City, "Addis Ababa");
    assert.equal(receipt.payload.info.BuyerDetails.City, "Addis Ababa");
    assert.equal(credit.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(debit.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(receipt.payload.info.BuyerDetails.LegalName, "Alpha PLC");
  });
});

describe("company B2B debit note", () => {
  it("copies buyer and item identity and uses the issued debit amount", () => {
    const result = assessCompanyDebitFiscal(DEBIT_ID, debitInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const line = result.payload.info.ItemList[0];
    assert.equal(result.payload.Type, "DEB");
    assert.equal(result.payload.RelatedDocument, IRN);
    assert.equal(result.payload.TransactionType, "B2B");
    assert.deepEqual(result.payload.info.BuyerDetails, BUYER);
    assert.equal(JSON.stringify(result.payload).includes("Beta PLC"), false);
    assert.equal(line?.ItemCode, 1001);
    assert.equal(line?.TaxCode, "VAT15");
    assert.equal(line?.NatureOfSupplies, "service");
    assert.equal(line?.Unit, "PCS");
    assert.equal(line?.HarmonizationCode, "HS-1");
    assert.equal(line?.ProductDescription, "Room Accommodation");
    assert.equal(line?.Quantity, 2);
    assert.equal(line?.UnitPrice, 20);
    assert.equal(line?.PreTaxValue, 40);
    assert.equal(line?.TaxAmount, 6);
    assert.equal(line?.TotalLineAmount, 46);
    assert.ok((line?.TotalLineAmount as number) > 0);
    assert.equal(result.payload.trnx_id, companyDebitTrnxId(DEBIT_ID));
  });

  it("uses quantity 1 when the debit is monetary or the line match is not explicit", () => {
    const monetary = assessCompanyDebitFiscal(
      DEBIT_ID,
      debitInput({
        debitSnapshot: {
          document: { originalInvoiceNumber: "AINV-0007" },
          groups: [
            {
              sourceGroupId: "other-charge",
              subtotal: 40,
              tax: 6,
              serviceCharge: 0,
              quantity: 2,
              unitAmount: 20,
            },
          ],
        },
      }),
    );
    assert.equal(monetary.ok, true);
    if (!monetary.ok) return;
    assert.equal(monetary.payload.info.ItemList[0]?.Quantity, 1);
    assert.equal(monetary.payload.info.ItemList[0]?.UnitPrice, 40);
    const source = readFileSync(new URL("./fiscal-company-debit-note.ts", import.meta.url), "utf8");
    assert.equal(source.includes("guest_account_masters"), false);
    assert.equal(source.includes("fiscal_item_mappings"), false);
    assert.equal(source.includes("fiscal_tax_code_mappings"), false);
  });
});

describe("company B2B sales receipt", () => {
  it("builds one B2B receipt from this allocation and the original invoice", () => {
    const partial = assessCompanyReceiptFiscal(ALLOC_A, receiptInput());
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.equal(partial.payload.TransactionType, "B2B");
    assert.equal(partial.payload.InvoicePaidAmount, 5);
    assert.equal(partial.payload.invoice_total_amount, 12);
    assert.equal(partial.payload.RemainingAmount, 7);
    assert.equal(partial.payload.PaymentCoverage, "PARTIAL");
    assert.equal(partial.payload.InvoiceIRN, IRN);
    assert.equal(partial.payload.invoice_document_no, "5001");
    assert.equal(partial.payload.ReceiptNumber, "CSR-bbbbbbbbbbbb4bbb");
    assert.equal(partial.payload.ReceiptNumber.length <= 20, true);
    assert.equal(partial.payload.ReceiptDate, "2026-10-13T13:00:00+03:00");
    assert.equal(partial.payload.source_date, "2026-10-13");
    assert.equal(partial.payload.trnx_id, companyReceiptTrnxId(ALLOC_A));
    assert.equal(partial.payload.ReceiptNumber, "CSR-bbbbbbbbbbbb4bbb");
    assert.deepEqual(partial.payload.info.BuyerDetails, BUYER);
    assert.equal("BuyerDetails" in partial.payload, false);
    assert.equal("ItemList" in partial.payload, false);
    assert.equal(JSON.stringify(partial.payload).includes("Beta PLC"), false);
    const full = assessCompanyReceiptFiscal(
      ALLOC_B,
      receiptInput({ amount: 7, priors: [{ amount: 5, fiscalRegistered: true }] }),
    );
    assert.equal(full.ok, true);
    if (!full.ok) return;
    assert.equal(full.payload.PaymentCoverage, "FULL");
    assert.equal(full.payload.RemainingAmount, 0);
    assert.equal(full.payload.InvoicePaidAmount, 7);
    assert.equal(full.payload.ReceiptDate, partial.payload.ReceiptDate);
    assert.equal(full.payload.ReceiptNumber.length <= 20, true);
    const repeated = assessCompanyReceiptFiscal(ALLOC_A, receiptInput());
    assert.equal(repeated.ok, true);
    if (!repeated.ok) return;
    assert.equal(repeated.payload.ReceiptNumber, partial.payload.ReceiptNumber);
    assert.equal(repeated.payload.ReceiptDate, partial.payload.ReceiptDate);
    assert.deepEqual(repeated.payload.info.BuyerDetails, BUYER);
    const tested = assessCompanyReceiptFiscal(ALLOC_A, receiptInput({ fiscalEnvironment: "TEST" }));
    const testedAgain = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({ fiscalEnvironment: "TEST" }),
    );
    assert.equal(tested.ok && testedAgain.ok, true);
    if (!tested.ok || !testedAgain.ok) return;
    assert.equal(tested.payload.trnx_id, "CSRBBBBBBBBBBBB4BBB");
    assert.equal(tested.payload.trnx_id.length <= 20, true);
    assert.equal(testedAgain.payload.trnx_id, tested.payload.trnx_id);
    assert.equal("ReceiptNumber" in tested.payload, false);
    assert.equal(tested.payload.ReceiptDate, partial.payload.ReceiptDate);
    assert.equal(tested.payload.invoice_total_amount, 12);
    assert.equal(tested.payload.InvoicePaidAmount, 5);
    assert.equal(tested.payload.RemainingAmount, 7);
    assert.deepEqual(tested.payload.info.BuyerDetails, BUYER);
    const nextDay = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({ createdAt: "2026-10-13T21:30:00.000Z" }),
    );
    assert.equal(nextDay.ok, true);
    if (!nextDay.ok) return;
    assert.equal(nextDay.payload.ReceiptDate, "2026-10-14T00:30:00+03:00");
    assert.equal(nextDay.payload.source_date, "2026-10-14");
  });

  it("keeps receipts ordered and blocks anything that is not an active company allocation", () => {
    const other = assessCompanyReceiptFiscal(
      ALLOC_OTHER,
      receiptInput({
        amount: 60,
        invoiceNumber: "AINV-0060",
        originalRegistration: {
          status: "REGISTERED",
          irn: "IRN-B",
          documentNumber: "5002",
          requestSnapshot: receiptRequest(60),
        },
      }),
    );
    assert.equal(other.ok, true);
    if (!other.ok) return;
    assert.equal(other.payload.InvoicePaidAmount, 60);
    assert.equal(other.payload.InvoiceIRN, "IRN-B");
    const waiting = assessCompanyReceiptFiscal(
      ALLOC_B,
      receiptInput({ amount: 7, priors: [{ amount: 5, fiscalRegistered: false }] }),
    );
    assert.equal(waiting.ok, false);
    if (waiting.ok) return;
    assert.match(waiting.reasons.join(" "), /earlier payment allocation/);
    const cases: Array<[Partial<CompanyReceiptInput>, RegExp]> = [
      [{ accountKind: "group" }, /company payment allocation/],
      [{ reversed: true }, /reversed/],
      [{ reversalRow: true, amount: -5 }, /reversal row/],
      [{ originalRegistration: null }, /not been fiscally registered/],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: null,
            documentNumber: "5001",
            requestSnapshot: receiptRequest(),
          },
        },
        /IRN is missing/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: null,
            requestSnapshot: receiptRequest(),
          },
        },
        /document number is missing/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            documentNumber: "5001",
            requestSnapshot: receiptRequest(),
          },
        },
        /BuyerDetails/,
      ],
      [{ hasAdjustingNotes: true }, /Credit\/Debit Notes/],
      [{ hasActiveWithholding: true }, /withholding has been recorded/],
    ];
    const missingBuyer = receiptRequest();
    delete (missingBuyer.info as { BuyerDetails?: unknown }).BuyerDetails;
    cases[6] = [
      {
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: missingBuyer,
        },
      },
      /BuyerDetails/,
    ];
    for (const [override, pattern] of cases) {
      const blocked = assessCompanyReceiptFiscal(ALLOC_A, receiptInput(override));
      assert.equal(blocked.ok, false);
      if (blocked.ok) continue;
      assert.match(blocked.reasons.join(" "), pattern);
    }
    const b2c = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: receiptRequest(),
        },
      }),
    );
    const b2cRequest = receiptRequest();
    b2cRequest.TransactionType = "B2C";
    const blockedType = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: b2cRequest,
        },
      }),
    );
    assert.equal(b2c.ok, true);
    assert.equal(blockedType.ok, false);
    if (blockedType.ok) return;
    assert.match(blockedType.reasons.join(" "), /B2B/);
  });

  it("uses the adjusted TEST total and keeps the original buyer", () => {
    const buyer = { ...BUYER };
    const result = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({
        amount: 100,
        hasAdjustingNotes: true,
        fiscalEnvironment: "TEST",
        noteAdjustments: [{ documentType: "CRE", status: "REGISTERED", total: 80 }],
        originalRegistration: {
          status: "REGISTERED",
          irn: IRN,
          documentNumber: "5001",
          requestSnapshot: receiptRequest(200),
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.invoice_total_amount, 200);
    assert.equal(result.payload.InvoicePaidAmount, 100);
    assert.equal(result.payload.RemainingAmount, 20);
    assert.equal(result.payload.PaymentCoverage, "PARTIAL");
    assert.equal(result.payload.InvoiceIRN, IRN);
    assert.equal(result.payload.invoice_document_no, "5001");
    assert.equal(result.payload.trnx_id, "CSRBBBBBBBBBBBB4BBB");
    assert.equal(result.payload.trnx_id.length <= 20, true);
    assert.equal("ReceiptNumber" in result.payload, false);
    assert.equal(result.payload.ReceiptDate, "2026-10-13T13:00:00+03:00");
    assert.equal(result.payload.source_date, "2026-10-13");
    assert.deepEqual(result.payload.info.BuyerDetails, buyer);
    const production = assessCompanyReceiptFiscal(
      ALLOC_A,
      receiptInput({
        hasAdjustingNotes: true,
        fiscalEnvironment: "PRODUCTION",
        noteAdjustments: [{ documentType: "CRE", status: "REGISTERED", total: 80 }],
      }),
    );
    assert.equal(production.ok, false);
    if (production.ok) return;
    assert.match(production.reasons.join(" "), /not supported in the current fiscal phase/);
  });
});

describe("company follow-up registration safety", () => {
  it("queues one credit, one debit, and ordered receipts without financial writes", async () => {
    assert.equal(p7ReceiptEnabled("SALES_RECEIPT", "account_allocation"), true);
    assert.equal(p7ReceiptEnabled("SALES_RECEIPT", "guest_allocation"), false);
    assert.equal(p5HandlerEnabled("SALES_RECEIPT", "account_allocation"), false);
    assert.equal(p3HandlerEnabled("CRE", "credit_note"), true);
    assert.equal(p4HandlerEnabled("DEB", "debit_note"), true);
    assert.equal(p6HandlerEnabled("INV", "account_invoice"), true);
    assert.equal(p6HandlerEnabled("CRE", "credit_note"), false);
    const creditServer = readFileSync(
      new URL("./fiscal-company-credit-note.server.ts", import.meta.url),
      "utf8",
    );
    const debitServer = readFileSync(
      new URL("./fiscal-company-debit-note.server.ts", import.meta.url),
      "utf8",
    );
    const receiptServer = readFileSync(
      new URL("./fiscal-company-sales-receipt.server.ts", import.meta.url),
      "utf8",
    );
    for (const source of [creditServer, debitServer, receiptServer]) {
      assert.equal(source.includes("guest_account_masters"), false);
      assert.equal(source.includes("fiscal_item_mappings"), false);
      assert.equal(source.includes("fiscal_tax_code_mappings"), false);
      assert.equal(source.includes("financial_account_balance"), false);
    }
    assert.equal(/from\("invoice_credit_notes"\)[\s\S]{0,220}\.update/.test(creditServer), false);
    assert.equal(
      /from\("financial_account_invoices"\)[\s\S]{0,180}\.update/.test(creditServer),
      false,
    );
    assert.equal(
      /from\("financial_account_payment_allocations"\)[\s\S]{0,240}\.update/.test(receiptServer),
      false,
    );
    assert.equal(/from\("folio_transactions"\)[\s\S]{0,180}\.update/.test(receiptServer), false);
    const creditReset = creditServer.slice(
      creditServer.indexOf('existing?.status === "FAILED"'),
      creditServer.indexOf("const inserted"),
    );
    assert.equal(creditReset.includes("request_snapshot"), false);
    const receiptReset = receiptServer.slice(
      receiptServer.indexOf('existing?.status === "FAILED"'),
      receiptServer.indexOf("const inserted"),
    );
    assert.equal(receiptReset.includes("request_snapshot"), false);
    assert.match(
      receiptServer,
      /sendStoredFiscalRequest\([\s\S]*"sales_receipt",\s*parseFiscalSalesReceiptSuccess/,
    );
    const outbox = readFileSync(new URL("./fiscal-outbox.server.ts", import.meta.url), "utf8");
    assert.match(outbox, /sendClaimedCreditNote/);
    assert.match(outbox, /sendClaimedCompanyReceipt/);
    const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
    const creditView = functions.slice(
      functions.indexOf("export const getCompanyCreditNoteFiscal"),
      functions.indexOf("export const registerCompanyCreditNoteFiscal"),
    );
    const creditRegister = functions.slice(
      functions.indexOf("export const registerCompanyCreditNoteFiscal"),
      functions.indexOf("export const getCompanyDebitNoteFiscal"),
    );
    assert.match(creditView, /requireCashieringAccess/);
    assert.doesNotMatch(creditView, /requireCashierManager/);
    assert.match(creditRegister, /requireCashierManager/);

    memoryDb();
    const beforeNotes = JSON.stringify(sharedTables().invoice_credit_notes);
    const beforeInvoices = JSON.stringify(sharedTables().financial_account_invoices);
    const beforeAllocations = JSON.stringify(sharedTables().financial_account_payment_allocations);
    const beforePayments = JSON.stringify(sharedTables().folio_transactions);
    const beforeAccounts = JSON.stringify(sharedTables().financial_accounts);
    const credit = await queueCompanyCreditFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      creditNoteId: CREDIT_ID,
    });
    const creditAgain = await queueCompanyCreditFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      creditNoteId: CREDIT_ID,
    });
    assert.equal(credit.status, "queued");
    assert.equal(creditAgain.registration?.id, credit.registration?.id);
    assert.equal(creditAgain.registration?.trnxId, `ccn-${CREDIT_ID}`);
    const storedCredit = sharedTables().fiscal_registrations.find(
      (row) => row.source_id === CREDIT_ID,
    );
    assert.equal(storedCredit?.source_type, "credit_note");
    const frozenCredit = JSON.stringify(storedCredit?.request_snapshot);
    assert.match(frozenCredit, /"LegalName":"Alpha PLC"/);
    assert.match(frozenCredit, /"Tin":"123"/);
    assert.match(frozenCredit, /"ItemCode":1001/);
    assert.equal(frozenCredit.includes("Beta PLC"), false);
    assert.equal(
      sharedTables().fiscal_registrations.filter((row) => row.source_id === CREDIT_ID).length,
      1,
    );
    const debit = await queueCompanyDebitFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: DEBIT_ID,
    });
    const debitAgain = await queueCompanyDebitFiscal(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      debitNoteId: DEBIT_ID,
    });
    assert.equal(debit.status, "queued");
    assert.equal(debitAgain.registration?.id, debit.registration?.id);
    assert.equal(debit.registration?.trnxId, `cdn-${DEBIT_ID}`);
    const first = await queueCompanyAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_A,
    });
    const firstAgain = await queueCompanyAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_A,
    });
    assert.equal(first.status, "queued");
    assert.equal(firstAgain.registration?.id, first.registration?.id);
    assert.equal(first.preview?.coverage, "PARTIAL");
    assert.equal(first.preview?.paid, 5);
    assert.equal(first.preview?.remaining, 7);
    assert.equal(first.preview?.companyName, "Alpha PLC");
    const storedReceipt = sharedTables().fiscal_registrations.find(
      (row) => row.source_id === ALLOC_A,
    );
    assert.equal(storedReceipt?.source_type, "account_allocation");
    const frozenReceipt = JSON.stringify(storedReceipt?.request_snapshot);
    assert.match(frozenReceipt, /"InvoicePaidAmount":5/);
    assert.match(frozenReceipt, /"invoice_total_amount":12/);
    assert.match(frozenReceipt, /"TransactionType":"B2B"/);
    assert.match(frozenReceipt, /"LegalName":"Alpha PLC"/);
    const listed = await getCompanyInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: RECEIPT_INVOICE,
    });
    assert.equal(listed.lines[1]?.status, "not_eligible");
    assert.match(listed.lines[1]?.reasons.join(" ") ?? "", /earlier payment allocation/);
    if (storedReceipt) storedReceipt.status = "REGISTERED";
    const ready = await queueCompanyAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_B,
    });
    assert.equal(ready.status, "queued");
    assert.equal(ready.preview?.coverage, "FULL");
    assert.equal(ready.preview?.remaining, 0);
    assert.equal(ready.preview?.paid, 7);
    assert.equal(JSON.stringify(storedReceipt?.request_snapshot), frozenReceipt);
    const other = await queueCompanyAllocationSalesReceipt(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      allocationId: ALLOC_OTHER,
    });
    assert.equal(other.status, "queued");
    assert.equal(other.preview?.paid, 60);
    assert.equal(other.preview?.invoiceIrn, "IRN-B");
    const original = sharedTables().fiscal_registrations.find((row) => row.id === "receipt-inv");
    const snapshot = original?.request_snapshot as {
      info: { BuyerDetails: { LegalName: string } };
    };
    snapshot.info.BuyerDetails.LegalName = "Beta PLC";
    const preserved = await getCompanyInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: RECEIPT_INVOICE,
    });
    assert.equal(preserved.lines[0]?.preview?.companyName, "Alpha PLC");
    assert.equal(JSON.stringify(storedReceipt?.request_snapshot), frozenReceipt);
    assert.equal(JSON.stringify(storedCredit?.request_snapshot), frozenCredit);
    await assert.rejects(
      () =>
        queueCompanyAllocationSalesReceipt(memoryDb(sharedTables()), {
          restaurantId: PROPERTY,
          allocationId: GUEST_ALLOC,
        }),
      /not found/,
    );
    assert.equal(JSON.stringify(sharedTables().invoice_credit_notes), beforeNotes);
    assert.equal(JSON.stringify(sharedTables().financial_account_invoices), beforeInvoices);
    assert.equal(
      JSON.stringify(sharedTables().financial_account_payment_allocations),
      beforeAllocations,
    );
    assert.equal(JSON.stringify(sharedTables().folio_transactions), beforePayments);
    assert.equal(JSON.stringify(sharedTables().financial_accounts), beforeAccounts);
    sharedTables().financial_account_payment_allocations.push({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8",
      restaurant_id: PROPERTY,
      invoice_id: RECEIPT_INVOICE,
      payment_transaction_id: PAYMENT_ID,
      amount: -5,
      created_at: "2026-10-13T12:00:00.000Z",
      reverses_allocation_id: ALLOC_A,
    });
    let called = false;
    await sendClaimedCompanyReceipt(
      memoryDb(sharedTables()),
      {
        id: storedReceipt?.id,
        source_id: ALLOC_A,
        restaurant_id: PROPERTY,
        attempt_count: 0,
        request_snapshot: storedReceipt?.request_snapshot,
        request_hash: "hash",
      },
      async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    );
    assert.equal(called, false);
    assert.equal(JSON.stringify(storedReceipt?.request_snapshot), frozenReceipt);
    const exchange = await loadFiscalRegistrationExchange(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      registrationId: String(storedReceipt?.id),
    });
    assert.equal(exchange.registration.invoiceNumber, "AINV-0012");
    assert.equal(exchange.registration.sourceType, "account_allocation");
  });

  it("shows the provider QR and RRN from the registered parent row", async () => {
    const providerQr = "iVBORw0KGgo...";
    const rrn = "26b1ea7d9a67e356090afb2e8a45784bf7223c1c9d3cf6425347aa3718af81";
    memoryDb();
    sharedTables().fiscal_registrations.push({
      id: "csr-live",
      restaurant_id: PROPERTY,
      source_type: "account_allocation",
      source_id: ALLOC_A,
      fiscal_document_type: "SALES_RECEIPT",
      status: "REGISTERED",
      trnx_id: "CSR59E15D5377FA4F2B",
      external_id: "70416",
      external_rrn: rrn,
      external_status: "A",
      signed_qr: providerQr,
      last_error_code: "FISCAL_PROVIDER_REJECTED",
      last_error_message: "The fiscal service returned an unexpected registration response.",
      request_snapshot: null,
    });
    sharedTables().fiscal_registration_attempts = [
      { registration_id: "csr-live", outcome: "fatal_error" },
      { registration_id: "csr-live", outcome: "success" },
    ];
    const listed = await getCompanyInvoiceSalesReceipts(memoryDb(sharedTables()), {
      restaurantId: PROPERTY,
      invoiceId: RECEIPT_INVOICE,
    });
    const line = listed.lines.find((row) => row.allocationId === ALLOC_A);
    assert.equal(line?.status, "registered");
    assert.equal(line?.registration?.rrn, rrn);
    assert.equal(line?.registration?.providerId, "70416");
    assert.equal(line?.registration?.providerStatus, "A");
    assert.equal(line?.registration?.qrSrc, fiscalQrSrc(providerQr));
    assert.equal(line?.registration?.irn, null);
    assert.equal(line?.registration?.documentNumber, null);
  });
});

function sharedTables() {
  return tables;
}

const tables: Record<string, Record<string, unknown>[]> = {};
let sequence = 0;

function seedTables() {
  sequence = 0;
  tables.restaurants = [{ id: PROPERTY, timezone: "Africa/Addis_Ababa" }];
  tables.financial_accounts = [{ id: "account-1", restaurant_id: PROPERTY, balance: 500 }];
  tables.financial_account_invoices = [
    invoice(INVOICE_ID, "AINV-0007", "company"),
    invoice(RECEIPT_INVOICE, "AINV-0012", "company"),
    invoice(OTHER_INVOICE, "AINV-0060", "company"),
    invoice(GROUP_INVOICE, "AINV-GROUP", "group"),
  ];
  tables.invoice_credit_notes = [
    {
      id: CREDIT_ID,
      restaurant_id: PROPERTY,
      note_type: "credit",
      guest_invoice_id: null,
      account_invoice_id: INVOICE_ID,
      currency: "ETB",
      issued_at: "2026-10-13T10:00:00.000Z",
      note_number: "CCN-0001",
      total_delta: -46,
      snapshot: creditInput().creditSnapshot,
    },
    {
      id: DEBIT_ID,
      restaurant_id: PROPERTY,
      note_type: "debit",
      guest_invoice_id: null,
      account_invoice_id: INVOICE_ID,
      currency: "ETB",
      issued_at: "2026-10-13T11:00:00.000Z",
      note_number: "CDN-0001",
      total_delta: 46,
      snapshot: debitInput().debitSnapshot,
    },
  ];
  tables.invoice_credit_note_lines = [];
  tables.folio_transactions = [
    { id: PAYMENT_ID, restaurant_id: PROPERTY, transaction_type: "payment", amount: -100 },
  ];
  tables.financial_account_payment_allocations = [
    allocation(ALLOC_A, RECEIPT_INVOICE, 5, "2026-10-13T10:00:00.000Z"),
    allocation(ALLOC_B, RECEIPT_INVOICE, 7, "2026-10-13T11:00:00.000Z"),
    allocation(ALLOC_OTHER, OTHER_INVOICE, 60, "2026-10-13T10:30:00.000Z"),
  ];
  tables.fiscal_registrations = [
    registration(INVOICE_ID, "inv-reg", originalRequest(), IRN, "5001"),
    registration(RECEIPT_INVOICE, "receipt-inv", receiptRequest(12), IRN, "5001"),
    registration(OTHER_INVOICE, "other-inv", receiptRequest(60), "IRN-B", "5002"),
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
  tables.fiscal_registration_attempts = [];
}

function invoice(id: string, number: string, accountKind: string) {
  return {
    id,
    restaurant_id: PROPERTY,
    issued_number: number,
    snapshot: {
      account: { accountKind, currency: "ETB", name: "Beta PLC" },
      property: { currencyCode: "ETB" },
      groups: [{ sourceGroupId: GROUP_ID }],
      billTo: { name: "Beta PLC", taxId: "999" },
    },
  };
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
  id: string,
  snapshot: unknown,
  irn: string,
  documentNumber: string,
) {
  return {
    id,
    restaurant_id: PROPERTY,
    source_type: "account_invoice",
    source_id: sourceId,
    fiscal_document_type: "INV",
    status: "REGISTERED",
    trnx_id: `ci-${sourceId}`,
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
        sequence += 1;
        inserted = { id: `row-${sequence}`, ...values };
        tables[table] = [...(tables[table] ?? []), inserted];
        return query;
      };
      query.update = () => ({ eq: async () => ({ error: null }) }) as unknown as FiscalDbQuery;
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
