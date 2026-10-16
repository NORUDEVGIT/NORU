import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGuestBuyerDetails } from "../guest-tax-identities.ts";
import { assessCompanyCreditFiscal } from "./fiscal-company-credit-note.ts";
import { assessCompanyDebitFiscal } from "./fiscal-company-debit-note.ts";
import {
  assessCompanyInvoiceFiscal,
  type CompanyInvoiceFiscalInput,
} from "./fiscal-company-invoice.ts";
import { originalFiscalPretax } from "./fiscal-company-withholding.ts";
import { assessCreditNoteFiscal, type CreditNoteFiscalInput } from "./fiscal-credit-note.ts";
import { assessDebitNoteFiscal, type DebitNoteFiscalInput } from "./fiscal-debit-note.ts";
import {
  assessGuestInvoiceFiscal,
  type FiscalInvPayload,
  type GuestInvoiceFiscalInput,
} from "./fiscal-guest-invoice.ts";
import { fiscalProviderPayload } from "./fiscal-line-expansion.ts";
import { originalInvoiceTotal } from "./fiscal-original-invoice.ts";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const VAT_ID = "22222222-2222-4222-8222-222222222222";
const FEE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const GROUP_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const GROUP_TWO = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const VAT_TXN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FEE_TXN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEBIT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOTE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const connection = {
  enabled: true,
  taxpayerTin: "0026716178",
  client: "ERP",
  deviceId: "DEVICE-1",
  credentialsConfigured: true,
};

const roomItem = {
  serviceTypeId: null,
  departmentId: null,
  chargeSource: "room",
  isDefault: false,
  externalItemCode: "1006",
  externalUnit: "PCS",
  natureOfSupplies: "service",
  harmonizationCode: null,
  active: true,
};

const vatMapping = {
  mappingKind: "TAX" as const,
  pmsTaxId: VAT_ID,
  externalTaxCode: "VAT15",
  active: true,
};

const feeMapping = {
  mappingKind: "TAX" as const,
  pmsTaxId: FEE_ID,
  externalTaxCode: "VAT0",
  active: true,
  fiscalTreatment: "SEPARATE_ITEM" as const,
  externalItemCode: "1007",
  externalUnit: "PCS",
  natureOfSupplies: "service",
  harmonizationCode: null,
};

function taxLine(id: string, taxId: string, name: string, amount: number) {
  return {
    id,
    name,
    amount,
    taxSnapshot: { taxId, code: name, name },
  };
}

function guestSnapshot(feeAmount = 50, base = 1000, vat = 150) {
  const tax = Math.round((vat + feeAmount) * 100) / 100;
  const total = Math.round((base + tax) * 100) / 100;
  return {
    version: 2,
    issuedAt: "2026-10-13T06:30:00.000Z",
    document: { issuedNumber: "INV-0007" },
    property: { currencyCode: "ETB" },
    folio: { currency: "ETB", guestName: "Sara Bekele" },
    groups: [
      {
        ok: true,
        parentTransactionId: GROUP_ID,
        description: "Room Accommodation",
        chargeSource: "room",
        quantity: null,
        unitAmount: null,
        subtotal: base,
        taxTotal: tax,
        serviceChargeTotal: 0,
        grossTotal: total,
        chargeSnapshot: null,
        taxLines: [
          taxLine(VAT_TXN, VAT_ID, "Value Added Tax (VAT)", vat),
          taxLine(FEE_TXN, FEE_ID, "Hotel Occupancy Fee 5%", feeAmount),
        ],
        serviceLines: [],
      },
    ],
    totals: { subtotal: base, tax, serviceCharge: 0, invoiceTotal: total },
  };
}

function guestInput(overrides: Partial<GuestInvoiceFiscalInput> = {}): GuestInvoiceFiscalInput {
  return {
    issued: true,
    coverageScope: "charge_groups",
    snapshot: guestSnapshot(),
    connection,
    mode: "CASH",
    taxMappings: [vatMapping, feeMapping],
    itemMappings: [roomItem],
    ...overrides,
  };
}

function companySnapshot() {
  return {
    version: 1,
    target: "financial_account",
    issuedAt: "2026-10-13T06:30:00.000Z",
    document: { issuedNumber: "INV-0042" },
    property: { currencyCode: "ETB" },
    account: { id: "acct-1", accountNumber: "CA-1", accountKind: "company", currency: "ETB" },
    billTo: {
      name: "Alpha PLC",
      taxId: "1234567890",
      phone: "111",
      email: "alpha@example.com",
      registrationNumber: "VAT-A",
      city: "Addis Ababa",
      region: "1",
    },
    groups: [
      {
        sourceGroupId: GROUP_ID,
        description: "Room Accommodation",
        chargeSource: "room",
        quantity: 1,
        unitAmount: 1000,
        subtotal: 1000,
        taxTotal: 200,
        serviceChargeTotal: 0,
        grossTotal: 1200,
        chargeSnapshot: { serviceTypeId: null, departmentId: null },
        taxLines: [
          taxLine(VAT_TXN, VAT_ID, "Value Added Tax (VAT)", 150),
          taxLine(FEE_TXN, FEE_ID, "Hotel Occupancy Fee 5%", 50),
        ],
      },
    ],
    totals: { subtotal: 1000, tax: 200, serviceCharge: 0, invoiceTotal: 1200 },
  };
}

function companyInput(): CompanyInvoiceFiscalInput {
  return {
    issued: true,
    snapshot: companySnapshot(),
    connection,
    taxMappings: [
      { mappingKind: "NO_TAX", pmsTaxId: null, externalTaxCode: "VAT0", active: true },
      vatMapping,
      feeMapping,
    ],
    itemMappings: [roomItem],
  };
}

function assertOccupancyLines(
  lines: FiscalInvPayload["info"]["ItemList"],
  feePretax = 50,
  vat = 150,
  base = 1000,
) {
  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.LineNumber, 1);
  assert.equal(lines[0]?.ProductDescription, "Room Accommodation");
  assert.equal(lines[0]?.ItemCode, 1006);
  assert.equal(lines[0]?.PreTaxValue, base);
  assert.equal(lines[0]?.TaxCode, "VAT15");
  assert.equal(lines[0]?.TaxAmount, vat);
  assert.equal(lines[0]?.TotalLineAmount, Math.round((base + vat) * 100) / 100);
  assert.equal(lines[1]?.LineNumber, 2);
  assert.equal(lines[1]?.ProductDescription, "Hotel Occupancy Fee 5%");
  assert.equal(lines[1]?.ItemCode, 1007);
  assert.equal(lines[1]?.Quantity, 1);
  assert.equal(lines[1]?.Unit, "PCS");
  assert.equal(lines[1]?.UnitPrice, feePretax);
  assert.equal(lines[1]?.PreTaxValue, feePretax);
  assert.equal(lines[1]?.TaxCode, "VAT0");
  assert.equal(lines[1]?.TaxAmount, 0);
  assert.equal(lines[1]?.TotalLineAmount, feePretax);
  assert.equal(lines[1]?.NatureOfSupplies, "service");
  assert.equal(lines[1]?.Discount, 0);
  assert.equal(lines[1]?.ExciseTaxValue, 0);
}

describe("separate fiscal tax item", () => {
  it("keeps a legacy mapping on the source line", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, {
      ...guestInput(),
      snapshot: {
        ...guestSnapshot(),
        groups: [
          {
            ...(guestSnapshot().groups[0] as object),
            taxTotal: 150,
            grossTotal: 1150,
            taxLines: [taxLine(VAT_TXN, VAT_ID, "Value Added Tax (VAT)", 150)],
          },
        ],
        totals: { subtotal: 1000, tax: 150, serviceCharge: 0, invoiceTotal: 1150 },
      },
      taxMappings: [vatMapping],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList.length, 1);
    assert.equal(result.payload.info.ItemList[0]?.TaxCode, "VAT15");
    assert.equal(result.payload.info.ItemList[0]?.TaxAmount, 150);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1150);
  });

  it("emits the frozen occupancy fee as its own VAT0 item", () => {
    const result = assessGuestInvoiceFiscal(INVOICE_ID, guestInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.TransactionType, "B2C");
    assert.equal("BuyerDetails" in result.payload.info, false);
    assertOccupancyLines(result.payload.info.ItemList);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1200);
    assert.equal(result.preview.tax, 150);
    assert.equal(result.preview.total, 1200);
    assert.equal(result.payload.noruFiscalLines?.[1]?.role, "separate_tax");
    assert.equal(result.payload.noruFiscalLines?.[1]?.taxTransactionId, FEE_TXN);
    assert.equal(originalInvoiceTotal(result.payload), 1200);
    assert.equal(originalFiscalPretax(result.payload), 1050);
    const wire = fiscalProviderPayload(result.payload) as Record<string, unknown>;
    assert.equal("noruFiscalLines" in wire, false);
    assert.equal("noruFiscalLines" in result.payload, true);
  });

  it("uses the same item list for guest B2B and only adds BuyerDetails", () => {
    const buyer = buildGuestBuyerDetails({
      legalName: "Abebe Trading",
      tin: "1111111111",
      registrationNumber: "REG-22",
      phone: "0911000000",
      email: "abebe@example.com",
      city: "Addis Ababa",
      region: "1",
    });
    const result = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ fiscalCustomerType: "B2B", buyer }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.TransactionType, "B2B");
    assert.equal(result.payload.info.BuyerDetails?.LegalName, "Abebe Trading");
    assert.equal(result.payload.info.BuyerDetails?.Region, "1");
    assertOccupancyLines(result.payload.info.ItemList);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1200);
  });

  it("uses the same item list for a company B2B invoice", () => {
    const result = assessCompanyInvoiceFiscal(INVOICE_ID, companyInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.TransactionType, "B2B");
    assert.equal(result.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assertOccupancyLines(result.payload.info.ItemList);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(result.payload.info.ValueDetails.TotalValue, 1200);
  });

  it("numbers source and fee lines across invoice groups", () => {
    const first = guestSnapshot().groups[0];
    const second = {
      ...first,
      parentTransactionId: GROUP_TWO,
      description: "Room Accommodation 2",
    };
    const body = guestSnapshot();
    body.groups = [first, second];
    body.totals = { subtotal: 2000, tax: 400, serviceCharge: 0, invoiceTotal: 2400 };
    const result = assessGuestInvoiceFiscal(INVOICE_ID, guestInput({ snapshot: body }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.payload.info.ItemList.map((line) => line.LineNumber),
      [1, 2, 3, 4],
    );
    assert.equal(result.payload.info.ItemList[2]?.ProductDescription, "Room Accommodation 2");
    assert.equal(result.payload.info.ItemList[3]?.TaxCode, "VAT0");
    assert.equal(result.payload.info.ValueDetails.TotalValue, 2400);
    assert.equal(result.payload.info.ValueDetails.TaxValue, 300);
  });

  it("requires an item code and blocks an unmapped or second same-line tax", () => {
    const missingCode = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({
        taxMappings: [{ ...feeMapping, externalItemCode: "" }, vatMapping],
      }),
    );
    assert.equal(missingCode.ok, false);
    if (!missingCode.ok) {
      assert.match(missingCode.reasons.join(" "), /no fiscal ItemCode/);
    }

    const unmapped = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ taxMappings: [vatMapping] }),
    );
    assert.equal(unmapped.ok, false);
    if (!unmapped.ok) {
      assert.match(
        unmapped.reasons.join(" "),
        /Tax 'Hotel Occupancy Fee 5%' requires a fiscal mapping/,
      );
    }

    const twoSame = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({
        taxMappings: [
          vatMapping,
          {
            mappingKind: "TAX",
            pmsTaxId: FEE_ID,
            externalTaxCode: "VAT0",
            active: true,
          },
        ],
      }),
    );
    assert.equal(twoSame.ok, false);
    if (!twoSame.ok) {
      assert.match(twoSame.reasons.join(" "), /Multiple same-line fiscal taxes are not supported/);
    }

    const unknown = assessGuestInvoiceFiscal(INVOICE_ID, {
      ...guestInput(),
      snapshot: guestSnapshot(),
      taxMappings: [
        vatMapping,
        {
          mappingKind: "TAX",
          pmsTaxId: OTHER_ID,
          externalTaxCode: "VAT0",
          active: true,
          fiscalTreatment: "SEPARATE_ITEM",
          externalItemCode: "1008",
          natureOfSupplies: "service",
        },
      ],
    });
    assert.equal(unknown.ok, false);
  });

  it("sends the frozen fee after the configured rate would have changed", () => {
    const result = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ snapshot: guestSnapshot(50) }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.payload.info.ItemList[1]?.PreTaxValue, 50);
    assert.notEqual(result.payload.info.ItemList[1]?.PreTaxValue, 60);
  });

  it("sends frozen rounded fee amounts exactly", () => {
    const small = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ snapshot: guestSnapshot(16.67, 333.33, 50) }),
    );
    assert.equal(small.ok, true);
    if (!small.ok) return;
    assert.equal(small.payload.info.ItemList[1]?.PreTaxValue, 16.67);
    assert.equal(small.payload.info.ValueDetails.TaxValue, 50);
    assert.equal(small.payload.info.ValueDetails.TotalValue, 400);

    const large = assessGuestInvoiceFiscal(
      INVOICE_ID,
      guestInput({ snapshot: guestSnapshot(50, 999.99, 150) }),
    );
    assert.equal(large.ok, true);
    if (!large.ok) return;
    assert.equal(large.payload.info.ItemList[1]?.PreTaxValue, 50);
    assert.equal(large.payload.info.ValueDetails.TotalValue, 1199.99);
  });

  it("still blocks a normal service charge", () => {
    const body = guestSnapshot();
    const group = body.groups[0];
    if (!group) return;
    group.serviceChargeTotal = 10;
    group.serviceLines = [{ id: "svc", name: "Service", amount: 10 }];
    body.totals = { subtotal: 1000, tax: 200, serviceCharge: 10, invoiceTotal: 1210 };
    const result = assessGuestInvoiceFiscal(INVOICE_ID, guestInput({ snapshot: body }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reasons.join(" "), /service charge/);
  });

  it("credits the original room and fee lines from frozen components", () => {
    const invoice = assessGuestInvoiceFiscal(INVOICE_ID, guestInput());
    assert.equal(invoice.ok, true);
    if (!invoice.ok) return;
    const input: CreditNoteFiscalInput = {
      guestInvoiceId: INVOICE_ID,
      currency: "ETB",
      issuedAt: "2026-10-13T10:00:00.000Z",
      noteNumber: "CN-000001",
      totalDelta: -600,
      invoiceSnapshot: { version: 2, groups: [{ parentTransactionId: GROUP_ID }] },
      creditSnapshot: {
        groups: [
          {
            sourceGroupId: GROUP_ID,
            subtotal: 500,
            tax: 100,
            serviceCharge: 0,
            components: [
              { id: GROUP_ID, kind: "parent", credited: 500 },
              { id: VAT_TXN, kind: "tax", credited: 75 },
              { id: FEE_TXN, kind: "tax", credited: 25 },
            ],
          },
        ],
      },
      connection,
      originalRegistration: {
        status: "REGISTERED",
        irn: "IRN-1",
        documentNumber: "2823",
        requestSnapshot: invoice.payload,
      },
    };
    const credit = assessCreditNoteFiscal(NOTE_ID, input);
    assert.equal(credit.ok, true);
    if (!credit.ok) return;
    const lines = credit.payload.info.ItemList;
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.ItemCode, 1006);
    assert.equal(lines[0]?.TaxCode, "VAT15");
    assert.equal(lines[0]?.ProductDescription, "Room Accommodation");
    assert.equal(lines[0]?.PreTaxValue, 500);
    assert.equal(lines[0]?.TaxAmount, 75);
    assert.equal(lines[0]?.TotalLineAmount, 575);
    assert.equal(lines[1]?.ItemCode, 1007);
    assert.equal(lines[1]?.TaxCode, "VAT0");
    assert.equal(lines[1]?.ProductDescription, "Hotel Occupancy Fee 5%");
    assert.equal(lines[1]?.PreTaxValue, 25);
    assert.equal(lines[1]?.TaxAmount, 0);
    assert.equal(lines[1]?.TotalLineAmount, 25);
    assert.equal(credit.payload.info.ValueDetails.TaxValue, 75);
    assert.equal(credit.payload.info.ValueDetails.TotalValue, 600);
    assert.equal("BuyerDetails" in credit.payload.info, false);
  });

  it("debits a posted room and fee from frozen components and original identities", () => {
    const invoice = assessGuestInvoiceFiscal(INVOICE_ID, guestInput());
    assert.equal(invoice.ok, true);
    if (!invoice.ok) return;
    const input: DebitNoteFiscalInput = {
      guestInvoiceId: INVOICE_ID,
      currency: "ETB",
      issuedAt: "2026-10-13T10:00:00.000Z",
      noteNumber: "DN-000001",
      totalDelta: 1166.67,
      invoiceSnapshot: { version: 2, groups: [{ parentTransactionId: GROUP_ID }] },
      debitSnapshot: {
        groups: [
          {
            sourceGroupId: DEBIT_ID,
            subtotal: 1000,
            tax: 166.67,
            serviceCharge: 0,
            quantity: 1,
            unitAmount: 1000,
          },
        ],
        lines: [
          {
            sourceGroupId: DEBIT_ID,
            componentTransactionId: "parent-2",
            kind: "parent",
            amount: 1000,
          },
          {
            sourceGroupId: DEBIT_ID,
            componentTransactionId: "vat-2",
            kind: "tax",
            amount: 150,
            snapshot: { taxSnapshot: { taxId: VAT_ID } },
          },
          {
            sourceGroupId: DEBIT_ID,
            componentTransactionId: "fee-2",
            kind: "tax",
            amount: 16.67,
            snapshot: { taxSnapshot: { taxId: FEE_ID } },
          },
        ],
      },
      connection,
      originalRegistration: {
        status: "REGISTERED",
        irn: "IRN-1",
        documentNumber: "2823",
        requestSnapshot: invoice.payload,
      },
    };
    const debit = assessDebitNoteFiscal(NOTE_ID, input);
    assert.equal(debit.ok, true);
    if (!debit.ok) return;
    const lines = debit.payload.info.ItemList;
    assert.equal(lines[0]?.ItemCode, 1006);
    assert.equal(lines[0]?.TaxCode, "VAT15");
    assert.equal(lines[0]?.PreTaxValue, 1000);
    assert.equal(lines[0]?.TaxAmount, 150);
    assert.equal(lines[0]?.TotalLineAmount, 1150);
    assert.equal(lines[1]?.ItemCode, 1007);
    assert.equal(lines[1]?.TaxCode, "VAT0");
    assert.equal(lines[1]?.ProductDescription, "Hotel Occupancy Fee 5%");
    assert.equal(lines[1]?.PreTaxValue, 16.67);
    assert.equal(lines[1]?.TaxAmount, 0);
    assert.equal(lines[1]?.TotalLineAmount, 16.67);
    assert.equal(debit.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(debit.payload.info.ValueDetails.TotalValue, 1166.67);
  });

  it("credits and debits a company invoice without rebuilding item identity", () => {
    const invoice = assessCompanyInvoiceFiscal(INVOICE_ID, companyInput());
    assert.equal(invoice.ok, true);
    if (!invoice.ok) return;
    const original = {
      status: "REGISTERED",
      irn: "IRN-1",
      documentNumber: "2823",
      requestSnapshot: invoice.payload,
    };
    const credit = assessCompanyCreditFiscal(NOTE_ID, {
      accountInvoiceId: INVOICE_ID,
      accountKind: "company",
      currency: "ETB",
      issuedAt: "2026-10-13T10:00:00.000Z",
      noteNumber: "CN-000001",
      totalDelta: -600,
      invoiceSnapshot: { groups: [{ sourceGroupId: GROUP_ID }] },
      creditSnapshot: {
        groups: [
          {
            sourceGroupId: GROUP_ID,
            subtotal: 500,
            tax: 100,
            serviceCharge: 0,
            components: [
              { id: GROUP_ID, kind: "parent", credited: 500 },
              { id: VAT_TXN, kind: "tax", credited: 75 },
              { id: FEE_TXN, kind: "tax", credited: 25 },
            ],
          },
        ],
      },
      connection,
      originalRegistration: original,
    });
    assert.equal(credit.ok, true);
    if (!credit.ok) return;
    assert.equal(credit.payload.info.ItemList[1]?.ItemCode, 1007);
    assert.equal(credit.payload.info.ItemList[1]?.PreTaxValue, 25);
    assert.equal(credit.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(credit.payload.info.ValueDetails.TotalValue, 600);

    const debit = assessCompanyDebitFiscal(NOTE_ID, {
      accountInvoiceId: INVOICE_ID,
      accountKind: "company",
      currency: "ETB",
      issuedAt: "2026-10-13T10:00:00.000Z",
      noteNumber: "DN-000001",
      totalDelta: 1200,
      invoiceSnapshot: { groups: [{ sourceGroupId: GROUP_ID }] },
      debitSnapshot: {
        groups: [
          {
            sourceGroupId: DEBIT_ID,
            subtotal: 1000,
            tax: 200,
            serviceCharge: 0,
            quantity: 1,
            unitAmount: 1000,
          },
        ],
        lines: [
          { sourceGroupId: DEBIT_ID, componentTransactionId: "p", kind: "parent", amount: 1000 },
          {
            sourceGroupId: DEBIT_ID,
            componentTransactionId: "v",
            kind: "tax",
            amount: 150,
            snapshot: { taxSnapshot: { taxId: VAT_ID } },
          },
          {
            sourceGroupId: DEBIT_ID,
            componentTransactionId: "f",
            kind: "tax",
            amount: 50,
            snapshot: { taxSnapshot: { taxId: FEE_ID } },
          },
        ],
      },
      connection,
      originalRegistration: original,
    });
    assert.equal(debit.ok, true);
    if (!debit.ok) return;
    assert.equal(debit.payload.info.ItemList[1]?.PreTaxValue, 50);
    assert.equal(debit.payload.info.ItemList[1]?.TaxAmount, 0);
    assert.equal(debit.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(debit.payload.info.ValueDetails.TaxValue, 150);
    assert.equal(debit.payload.info.ValueDetails.TotalValue, 1200);
  });
});
