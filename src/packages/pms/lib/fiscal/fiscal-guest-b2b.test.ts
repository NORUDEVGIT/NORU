import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildGuestBuyerDetails } from "../guest-tax-identities.ts";
import { assessCreditNoteFiscal, type CreditNoteFiscalInput } from "./fiscal-credit-note.ts";
import { assessDebitNoteFiscal, type DebitNoteFiscalInput } from "./fiscal-debit-note.ts";
import { assessGuestInvoiceFiscal, type GuestInvoiceFiscalInput } from "./fiscal-guest-invoice.ts";
import { assessSalesReceiptFiscal, type SalesReceiptFiscalInput } from "./fiscal-sales-receipt.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const TAX_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const IRN = "IRN-ORIGINAL-1001";

const buyer = buildGuestBuyerDetails({
  legalName: "Abebe Trading",
  tin: "1111111111",
  registrationNumber: "REG-22",
  phone: "0911000000",
  email: "abebe@example.com",
  city: "Addis Ababa",
  region: "Addis Ababa",
});

function snapshot() {
  return {
    version: 2,
    issuedAt: "2026-01-02T06:30:00.000Z",
    document: { issuedNumber: "INV-0007" },
    property: { currencyCode: "ETB" },
    folio: { currency: "ETB", guestName: "Abebe Kebede" },
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
  };
}

function invoiceInput(overrides: Partial<GuestInvoiceFiscalInput> = {}): GuestInvoiceFiscalInput {
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

function originalInvoice(transactionType: "B2C" | "B2B") {
  return {
    Date: "02-01-2026T06:30:00",
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
          ProductDescription: "Room Accommodation",
        },
      ],
      ValueDetails: { InvoiceCurrency: "ETB", TaxValue: 15, TotalValue: 115 },
      ...(transactionType === "B2B" && buyer ? { BuyerDetails: buyer } : {}),
    },
    client: "ERP",
    trnx_id: `gi-${INVOICE_ID}`,
    TransactionType: transactionType,
  };
}

describe("guest fiscal customer type", () => {
  it("defaults to B2C and does not add BuyerDetails", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, invoiceInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal(result.preview.transactionType, "B2C");
    assert.equal("BuyerDetails" in result.payload.info, false);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1150);
  });

  it("does not become B2B only because a buyer object is available", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, invoiceInput({ buyer }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal("BuyerDetails" in result.payload.info, false);
  });

  it("requires a selected identity for B2B and maps BuyerDetails exactly", () => {
    const missing = assessGuestInvoiceFiscal(
      INVOICE_ID,
      invoiceInput({ fiscalCustomerType: "B2B" }),
    );
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.match(missing.reasons.join(" "), /active tax identity/);
    const result = assessGuestInvoiceFiscal(
      INVOICE_ID,
      invoiceInput({ fiscalCustomerType: "B2B", buyer }),
    );
    assert.equal(result.ok, true);
    if (!result.ok || !buyer) return;
    assert.equal(result.payload.TransactionType, "B2B");
    assert.equal(result.payload.trnx_id, `gi-${INVOICE_ID}`);
    assert.deepEqual(result.payload.info.BuyerDetails, buyer);
    assert.equal(result.payload.info.BuyerDetails?.Region, null);
    assert.equal(result.payload.info.BuyerDetails?.City, "Addis Ababa");
    assert.equal(result.payload.info.BuyerDetails?.IdType, "KID");
    assert.equal(result.payload.info.BuyerDetails?.IdNumber, null);
    assert.equal(result.payload.info.BuyerDetails?.Zone, null);
    assert.equal(result.payload.info.BuyerDetails?.Wereda, null);
    assert.equal(result.payload.info.BuyerDetails?.Kebele, null);
    assert.equal(result.payload.info.BuyerDetails?.HouseNumber, null);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1150);
  });

  it("keeps a frozen request at TIN 111 after the saved identity changes to 222", () => {
    const firstBuyer = buildGuestBuyerDetails({
      legalName: "Abebe Kebede",
      tin: "111",
      registrationNumber: null,
      phone: null,
      email: null,
      city: null,
      region: null,
    });
    const first = assessGuestInvoiceFiscal(
      INVOICE_ID,
      invoiceInput({ fiscalCustomerType: "B2B", buyer: firstBuyer }),
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const edited = buildGuestBuyerDetails({
      legalName: "Abebe Trading",
      tin: "222",
      registrationNumber: null,
      phone: null,
      email: null,
      city: null,
      region: null,
    });
    const second = assessGuestInvoiceFiscal(
      INVOICE_ID,
      invoiceInput({ fiscalCustomerType: "B2B", buyer: edited }),
    );
    assert.equal(first.payload.info.BuyerDetails?.Tin, "111");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.payload.info.BuyerDetails?.Tin, "222");
    const server = readFileSync(
      new URL("./fiscal-guest-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const reset = server.slice(
      server.indexOf('existing?.status === "FAILED"'),
      server.indexOf("const allocated"),
    );
    assert.equal(reset.includes("request_snapshot"), false);
    assert.match(server, /guestTaxIdentitySelectable/);
    assert.match(server, /row\.guest_profile_id !== guestProfileId/);
    assert.match(server, /row\.is_active !== true/);
    const send = server.slice(server.indexOf("const payload = row.request_snapshot"));
    assert.match(send, /request_snapshot/);
  });

  it("lets an old issued invoice with no registration choose B2C or B2B", () => {
    const consumer = assessGuestInvoiceFiscal(INVOICE_ID, invoiceInput());
    const business = assessGuestInvoiceFiscal(
      INVOICE_ID,
      invoiceInput({ fiscalCustomerType: "B2B", buyer }),
    );
    assert.equal(consumer.ok, true);
    assert.equal(business.ok, true);
    if (!consumer.ok || !business.ok) return;
    assert.equal(consumer.payload.TransactionType, "B2C");
    assert.equal(business.payload.TransactionType, "B2B");
  });

  it("does not rebuild an existing registration from a new identity", () => {
    const server = readFileSync(
      new URL("./fiscal-guest-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const beforeInsert = server.slice(0, server.indexOf("const inserted"));
    assert.match(beforeInsert, /existing\?\.status === "REGISTERED"/);
    assert.match(beforeInsert, /existing\?\.status === "PENDING"/);
    assert.match(beforeInsert, /existing\?\.status === "FAILED"/);
    const failed = beforeInsert.slice(beforeInsert.indexOf('existing?.status === "FAILED"'));
    assert.equal(failed.includes("request_snapshot"), false);
    assert.equal(server.includes("guest_profiles.tax_id"), false);
  });
});

describe("guest fiscal follow-ups inherit the original buyer", () => {
  it("keeps a B2C credit and debit free of BuyerDetails", () => {
    const credit = assessCreditNoteFiscal(NOTE_ID, creditInput("B2C"));
    const debit = assessDebitNoteFiscal(NOTE_ID, debitInput("B2C"));
    assert.equal(credit.ok, true);
    assert.equal(debit.ok, true);
    if (!credit.ok || !debit.ok) return;
    assert.equal(credit.payload.TransactionType, "B2C");
    assert.equal(debit.payload.TransactionType, "B2C");
    assert.equal("BuyerDetails" in credit.payload.info, false);
    assert.equal("BuyerDetails" in debit.payload.info, false);
  });

  it("copies a stored free-text Region without normalizing it", () => {
    const historical = { ...(buyer ?? {}), Region: "Addis Ababa", City: "Addis Ababa" };
    const stored = originalInvoice("B2B");
    stored.info = { ...stored.info, BuyerDetails: historical };
    const credit = assessCreditNoteFiscal(NOTE_ID, {
      ...creditInput("B2B"),
      originalRegistration: {
        status: "REGISTERED",
        irn: IRN,
        documentNumber: "2823",
        requestSnapshot: stored,
      },
    });
    const debitStored = originalInvoice("B2B");
    debitStored.info = { ...debitStored.info, BuyerDetails: historical };
    const debit = assessDebitNoteFiscal(NOTE_ID, {
      ...debitInput("B2B"),
      originalRegistration: {
        status: "REGISTERED",
        irn: IRN,
        documentNumber: "2823",
        requestSnapshot: debitStored,
      },
    });
    const receiptStored = originalInvoice("B2B");
    receiptStored.Mode = "CREDIT";
    receiptStored.info = {
      ...receiptStored.info,
      BuyerDetails: historical,
      ValueDetails: { ...receiptStored.info.ValueDetails, TotalValue: 115 },
    };
    const receipt = assessSalesReceiptFiscal("alloc-1", {
      ...receiptInput("B2B"),
      originalRegistration: {
        status: "REGISTERED",
        irn: IRN,
        documentNumber: "2821",
        requestSnapshot: receiptStored,
      },
    });
    assert.equal(credit.ok && debit.ok && receipt.ok, true);
    if (!credit.ok || !debit.ok || !receipt.ok) return;
    assert.equal(credit.payload.info.BuyerDetails?.Region, "Addis Ababa");
    assert.equal(debit.payload.info.BuyerDetails?.Region, "Addis Ababa");
    assert.equal(receipt.payload.info.BuyerDetails?.Region, "Addis Ababa");
    assert.equal(credit.payload.info.BuyerDetails?.City, "Addis Ababa");
    assert.equal(debit.payload.info.BuyerDetails?.City, "Addis Ababa");
    assert.equal(receipt.payload.info.BuyerDetails?.City, "Addis Ababa");
  });

  it("copies original B2B BuyerDetails onto credit and debit notes", () => {
    const credit = assessCreditNoteFiscal(NOTE_ID, creditInput("B2B"));
    const debit = assessDebitNoteFiscal(NOTE_ID, debitInput("B2B"));
    assert.equal(credit.ok, true);
    assert.equal(debit.ok, true);
    if (!credit.ok || !debit.ok || !buyer) return;
    assert.equal(credit.payload.TransactionType, "B2B");
    assert.equal(debit.payload.TransactionType, "B2B");
    assert.deepEqual(credit.payload.info.BuyerDetails, buyer);
    assert.deepEqual(debit.payload.info.BuyerDetails, buyer);
    assert.equal(credit.payload.RelatedDocument, IRN);
    assert.equal(debit.payload.RelatedDocument, IRN);
  });

  it("sends an empty info object for a B2C receipt and the original buyer for B2B", () => {
    const receiptId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
    const consumer = assessSalesReceiptFiscal(receiptId, receiptInput("B2C"));
    const business = assessSalesReceiptFiscal(receiptId, receiptInput("B2B"));
    assert.equal(consumer.ok, true);
    assert.equal(business.ok, true);
    if (!consumer.ok || !business.ok || !buyer) return;
    assert.equal(consumer.payload.TransactionType, "B2C");
    assert.equal(consumer.payload.ReceiptNumber, "GSR-bbbbbbbbbbbb4bbb");
    assert.equal(consumer.payload.ReceiptNumber.length <= 20, true);
    assert.equal(consumer.payload.ReceiptDate, "2026-10-13T13:00:00+03:00");
    assert.deepEqual(consumer.payload.info, {});
    assert.equal(consumer.payload.InvoicePaidAmount, 5);
    assert.equal(consumer.payload.RemainingAmount, 110);
    assert.equal(business.payload.TransactionType, "B2B");
    assert.equal(business.payload.ReceiptNumber, consumer.payload.ReceiptNumber);
    assert.equal(business.payload.ReceiptDate, consumer.payload.ReceiptDate);
    assert.deepEqual(business.payload.info, { BuyerDetails: buyer });
    assert.equal(business.payload.InvoicePaidAmount, 5);
    assert.equal(business.payload.RemainingAmount, 110);
    assert.equal(business.payload.invoice_total_amount, 115);
    assert.equal(business.payload.InvoiceIRN, IRN);
    const tested = assessSalesReceiptFiscal(receiptId, {
      ...receiptInput("B2B"),
      fiscalEnvironment: "TEST",
    });
    const testedConsumer = assessSalesReceiptFiscal(receiptId, {
      ...receiptInput("B2C"),
      fiscalEnvironment: "TEST",
    });
    assert.equal(tested.ok && testedConsumer.ok, true);
    if (!tested.ok || !testedConsumer.ok) return;
    assert.equal(testedConsumer.payload.trnx_id, "GSRBBBBBBBBBBBB4BBB");
    assert.equal(tested.payload.trnx_id, testedConsumer.payload.trnx_id);
    assert.equal("ReceiptNumber" in tested.payload, false);
    assert.equal("ReceiptNumber" in testedConsumer.payload, false);
    assert.deepEqual(testedConsumer.payload.info, {});
    assert.deepEqual(tested.payload.info, { BuyerDetails: buyer });
    assert.equal(tested.payload.invoice_total_amount, 115);
    assert.equal(tested.payload.InvoicePaidAmount, 5);
    assert.equal(tested.payload.RemainingAmount, 110);
  });
});

describe("company fiscal behavior stays separate", () => {
  it("does not read guest tax identities from company invoice, notes, receipts, or withholding", () => {
    const names = [
      "fiscal-company-invoice.ts",
      "fiscal-company-credit-note.ts",
      "fiscal-company-debit-note.ts",
      "fiscal-company-sales-receipt.ts",
      "fiscal-company-withholding.ts",
    ];
    for (const name of names) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
      assert.equal(source.includes("guest_tax_identities"), false, name);
      assert.equal(source.includes("guest-tax-identities"), false, name);
    }
  });
});

function creditInput(transactionType: "B2C" | "B2B"): CreditNoteFiscalInput {
  return {
    guestInvoiceId: INVOICE_ID,
    currency: "ETB",
    issuedAt: "2026-10-13T10:00:00.000Z",
    noteNumber: "CN-000001",
    totalDelta: -5,
    creditSnapshot: {
      version: 1,
      document: { noteNumber: "CN-000001", originalInvoiceNumber: "INV-0007", currency: "ETB" },
      groups: [
        {
          sourceGroupId: GROUP_ID,
          description: "Credit",
          subtotal: 4.35,
          tax: 0.65,
          serviceCharge: 0,
          creditGross: 5,
        },
      ],
    },
    invoiceSnapshot: { version: 2, groups: [{ parentTransactionId: GROUP_ID }] },
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
      requestSnapshot: originalInvoice(transactionType),
    },
  };
}

function debitInput(transactionType: "B2C" | "B2B"): DebitNoteFiscalInput {
  return {
    guestInvoiceId: INVOICE_ID,
    currency: "ETB",
    issuedAt: "2026-10-13T10:00:00.000Z",
    noteNumber: "DN-000001",
    totalDelta: 21,
    debitSnapshot: {
      version: 1,
      noteType: "debit",
      document: { noteNumber: "DN-000001", originalInvoiceNumber: "INV-0007", currency: "ETB" },
      groups: [
        {
          sourceGroupId: "abababab-abab-4bab-8bab-abababababab",
          description: "Laundry extra",
          quantity: 2,
          unitAmount: 10,
          subtotal: 20,
          tax: 1,
          serviceCharge: 0,
          gross: 21,
        },
      ],
    },
    invoiceSnapshot: { version: 2, groups: [{ parentTransactionId: GROUP_ID }] },
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
      requestSnapshot: originalInvoice(transactionType),
    },
  };
}

function receiptInput(transactionType: "B2C" | "B2B"): SalesReceiptFiscalInput {
  const invoice = originalInvoice(transactionType);
  invoice.Mode = "CREDIT";
  invoice.info.ValueDetails.TotalValue = 115;
  return {
    amount: 5,
    createdAt: "2026-10-13T10:00:00.000Z",
    reversed: false,
    reversalRow: false,
    paymentKind: "payment",
    currency: "ETB",
    invoiceNumber: "INV-0007",
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
      requestSnapshot: invoice,
    },
  };
}
