import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { postFiscalReceiveRequest } from "./fiscal-client.server.ts";
import {
  assessCompanyWithholdingFiscal,
  companyWithholdingTrnxId,
  fiscalInvoiceCalendarDate,
  originalFiscalPretax,
  p8HandlerEnabled,
  parseFiscalWithholdingSuccess,
  WITHHOLDING_NOTE_REASON,
  type WithholdingFiscalInput,
} from "./fiscal-company-withholding.ts";
import {
  getCompanyInvoiceWithholding,
  queueCompanyWithholding,
  sendClaimedWithholding,
} from "./fiscal-company-withholding.server.ts";
import { loadFiscalRegistrationExchange } from "./fiscal-exchange.server.ts";
import { parseFiscalInvoiceSuccess } from "./fiscal-guest-invoice.ts";
import {
  classifyFiscalFailure,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const PROPERTY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVOICE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CERT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const IRN = "IRN-COMPANY-B2B";
const BUYER = {
  Tin: "1234567890",
  City: null,
  Zone: null,
  Email: null,
  Kebele: null,
  Phone: null,
  Region: null,
  Wereda: null,
  IdType: "KID",
  IdNumber: null,
  VatNumber: null,
  LegalName: "Alpha PLC",
  HouseNumber: null,
};

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    Date: "13-10-2026T06:30:00",
    Mode: "CASH",
    Type: "INV",
    TransactionType: "B2B",
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
          HarmonizationCode: null,
          ProductDescription: "Room Accommodation",
        },
      ],
      ValueDetails: { TotalValue: 115, TaxValue: 15 },
      BuyerDetails: { ...BUYER },
    },
    ...overrides,
  };
}

function input(overrides: Partial<WithholdingFiscalInput> = {}): WithholdingFiscalInput {
  return {
    amount: 3000,
    pretaxBase: 100000,
    certificateDate: "2026-10-14",
    reversed: false,
    reversalRow: false,
    accountKind: "company",
    currency: "ETB",
    invoiceNumber: "AINV-0100",
    hasAdjustingNotes: false,
    connection: {
      enabled: true,
      taxpayerTin: "0099009900",
      client: "ERP",
      deviceId: "001096",
      credentialsConfigured: true,
    },
    originalRegistration: {
      status: "REGISTERED",
      irn: IRN,
      requestSnapshot: request(),
    },
    ...overrides,
  };
}

describe("company fiscal withholding", () => {
  it("builds one frozen withholding request from the original B2B invoice", () => {
    assert.equal(fiscalInvoiceCalendarDate("13-10-2026T06:30:00"), "2026-10-13");
    assert.equal(originalFiscalPretax(request()), 100);
    const liveProfile = { ...BUYER, LegalName: "Beta PLC", Tin: "0000000000" };
    const assessed = assessCompanyWithholdingFiscal(CERT, input());
    assert.equal(assessed.ok, true);
    if (!assessed.ok) return;
    assert.equal(assessed.payload.trnx_id, companyWithholdingTrnxId(CERT));
    assert.equal(assessed.payload.trnx_id, `cwh-${CERT}`);
    assert.equal(assessed.payload.invoice_buyer_tin, BUYER.Tin);
    assert.notEqual(assessed.payload.invoice_buyer_tin, liveProfile.Tin);
    assert.deepEqual(assessed.payload.info.BuyerDetails, BUYER);
    assert.equal(assessed.payload.invoice_irn, IRN);
    assert.equal(assessed.payload.invoice_date, "2026-10-13");
    assert.equal(assessed.payload.source_date, "2026-10-14");
    assert.equal(assessed.payload.PreTaxAmount, 100000);
    assert.equal(assessed.payload.WithholdingAmount, 3000);
    assert.equal(assessed.payload.tax_payer_tin, "0099009900");
    for (const key of [
      "Type",
      "Mode",
      "TransactionType",
      "ItemList",
      "ValueDetails",
      "RelatedDocument",
      "PaymentCoverage",
      "InvoicePaidAmount",
    ]) {
      assert.equal(key in assessed.payload, false);
      assert.equal(key in assessed.payload.info, false);
    }
    assert.equal(p8HandlerEnabled("WITHHOLDING", "withholding"), true);
    assert.equal(p8HandlerEnabled("INV", "withholding"), false);
  });

  it("blocks fiscal withholding without a registered B2B invoice, buyer, or clean notes", () => {
    const cases: Array<[Partial<WithholdingFiscalInput>, RegExp]> = [
      [{ reversed: true }, /reversed/],
      [{ reversalRow: true }, /reversal cannot/],
      [{ accountKind: "guest" }, /company withholding/],
      [{ currency: "USD" }, /ETB/],
      [
        { hasAdjustingNotes: true },
        new RegExp(WITHHOLDING_NOTE_REASON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      ],
      [
        { originalRegistration: { status: "FAILED", irn: IRN, requestSnapshot: request() } },
        /not been fiscally registered/,
      ],
      [
        { originalRegistration: { status: "REGISTERED", irn: null, requestSnapshot: request() } },
        /IRN is missing/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            requestSnapshot: request({ TransactionType: "B2C" }),
          },
        },
        /B2B/,
      ],
      [
        {
          originalRegistration: {
            status: "REGISTERED",
            irn: IRN,
            requestSnapshot: request({
              info: {
                ItemList: [
                  {
                    Unit: "PCS",
                    TaxCode: "VAT15",
                    ItemCode: 1001,
                    Quantity: 1,
                    TaxAmount: 0,
                    UnitPrice: 1,
                    PreTaxValue: 1,
                    NatureOfSupplies: "service",
                    ProductDescription: "Room Accommodation",
                  },
                ],
                ValueDetails: { TotalValue: 1, TaxValue: 0 },
                BuyerDetails: null,
              },
            }),
          },
        },
        /BuyerDetails/,
      ],
    ];
    for (const [override, pattern] of cases) {
      const blocked = assessCompanyWithholdingFiscal(CERT, input(override));
      assert.equal(blocked.ok, false, JSON.stringify(override));
      if (blocked.ok) continue;
      assert.match(blocked.reasons.join(" "), pattern);
    }
    const missingTin = request();
    (missingTin.info.BuyerDetails as { Tin: string | null }).Tin = null;
    const noTin = assessCompanyWithholdingFiscal(
      CERT,
      input({
        originalRegistration: { status: "REGISTERED", irn: IRN, requestSnapshot: missingTin },
      }),
    );
    assert.equal(noTin.ok, false);
    if (!noTin.ok) assert.match(noTin.reasons.join(" "), /buyer TIN/);
  });

  it("accepts a withholding success without relaxing invoice, credit, debit, or receipt parsing", () => {
    const body = {
      statusCode: 200,
      message: "Success",
      body: { id: 43948, status: "A", rrn: "test-rrn", qr: "iVBORw0KGgo=" },
    };
    const parsed = parseFiscalWithholdingSuccess(body);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.externalId, "43948");
    assert.equal(parsed.externalStatus, "A");
    assert.equal(parsed.externalRrn, "test-rrn");
    assert.equal(parsed.signedQr, "iVBORw0KGgo=");
    assert.equal(parsed.irn, null);
    assert.equal(parsed.documentNumber, null);
    assert.equal(parseFiscalInvoiceSuccess(body).ok, false);
    assert.equal(
      parseFiscalWithholdingSuccess({ message: "SUCCESS", body: { status: "A" } }).ok,
      false,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_RESPONSE_INVALID", httpStatus: 400 }).retryable,
      false,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 503 }).retryable,
      true,
    );
    assert.equal(classifyFiscalFailure({ code: "FISCAL_TIMEOUT" }).retryable, true);
    const server = read("./fiscal-company-withholding.server.ts");
    const guestReceipt = read("./fiscal-sales-receipt.ts");
    assert.match(server, /sendStoredFiscalRequest\([\s\S]*"withholding",\s*"withholding"/);
    assert.match(server, /parseFiscalWithholdingSuccess/);
    assert.doesNotMatch(server, /guest_account_masters/);
    assert.doesNotMatch(guestReceipt, /hasActiveWithholding/);
  });

  it("queues one immutable registration and does not post a financial event", async () => {
    const calls: string[] = [];
    await postFiscalReceiveRequest({
      baseUrl: "https://fiscal.test/",
      accessToken: "token",
      payload: { WithholdingAmount: 3 },
      path: "withholding",
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response("{}", { status: 503 });
      },
    });
    assert.deepEqual(calls, ["https://fiscal.test/withholding"]);
    seed();
    const beforeLedger = JSON.stringify(tables.folio_transactions);
    const first = await queueCompanyWithholding(memoryDb(), {
      restaurantId: PROPERTY,
      certificateId: CERT,
    });
    const second = await queueCompanyWithholding(memoryDb(), {
      restaurantId: PROPERTY,
      certificateId: CERT,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.registration?.id, first.registration?.id);
    assert.equal(JSON.stringify(tables.folio_transactions), beforeLedger);
    const stored = tables.fiscal_registrations.find((row) => row.source_type === "withholding");
    const frozen = JSON.stringify(stored?.request_snapshot);
    const original = tables.fiscal_registrations.find(
      (row) => row.source_type === "account_invoice",
    );
    const snapshot = original?.request_snapshot as {
      info: { BuyerDetails: { LegalName: string } };
    };
    snapshot.info.BuyerDetails.LegalName = "Beta PLC";
    await queueCompanyWithholding(memoryDb(), { restaurantId: PROPERTY, certificateId: CERT });
    assert.equal(JSON.stringify(stored?.request_snapshot), frozen);
    const payload = stored?.request_snapshot as { info: { BuyerDetails: { LegalName: string } } };
    assert.equal(payload.info.BuyerDetails.LegalName, "Alpha PLC");
    const exchange = await loadFiscalRegistrationExchange(memoryDb(), {
      restaurantId: PROPERTY,
      registrationId: String(stored?.id),
    });
    assert.equal(exchange.registration.invoiceNumber, "AINV-0100");
    assert.equal(exchange.registration.sourceType, "withholding");
    let called = false;
    tables.withholding_certificates.push({
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
      restaurant_id: PROPERTY,
      invoice_id: INVOICE,
      amount: 3000,
      reverses_certificate_id: CERT,
    });
    await sendClaimedWithholding(
      memoryDb(),
      {
        id: stored?.id,
        source_id: CERT,
        restaurant_id: PROPERTY,
        attempt_count: 0,
        request_snapshot: stored?.request_snapshot,
        request_hash: "hash",
      },
      async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    );
    assert.equal(called, false);
    assert.equal(JSON.stringify(stored?.request_snapshot), frozen);
    const board = await getCompanyInvoiceWithholding(memoryDb(), {
      restaurantId: PROPERTY,
      invoiceId: INVOICE,
    });
    assert.equal(
      board.lines.some((line) => line.reversed && line.status === "not_eligible"),
      true,
    );
  });
});

function seed() {
  tables.restaurants = [{ id: PROPERTY, timezone: "Africa/Addis_Ababa" }];
  tables.financial_account_invoices = [
    {
      id: INVOICE,
      restaurant_id: PROPERTY,
      issued_number: "AINV-0100",
      snapshot: {
        account: { accountKind: "company", currency: "ETB" },
        billTo: { name: "Alpha PLC" },
        totals: { invoiceTotal: 100000, subtotal: 86956.52, balance: 100000 },
      },
    },
  ];
  tables.invoice_credit_notes = [];
  tables.financial_account_payment_allocations = [];
  tables.folio_transactions = [];
  tables.withholding_certificates = [
    {
      id: CERT,
      restaurant_id: PROPERTY,
      invoice_id: INVOICE,
      amount: 3000,
      pretax_base: 100000,
      certificate_date: "2026-10-14",
      reference: "WH-1",
      reverses_certificate_id: null,
    },
  ];
  tables.fiscal_registrations = [
    {
      id: "inv-reg",
      restaurant_id: PROPERTY,
      source_type: "account_invoice",
      source_id: INVOICE,
      fiscal_document_type: "INV",
      status: "REGISTERED",
      trnx_id: `ci-${INVOICE}`,
      external_irn: IRN,
      request_snapshot: request(),
    },
  ];
  tables.pms_integrations = [
    {
      id: "integration-1",
      restaurant_id: PROPERTY,
      category: "fiscal",
      provider: "erp_fiscal",
      enabled: true,
      config: { taxpayerTin: "0099009900", client: "ERP", deviceId: "001096" },
    },
  ];
  tables.fiscal_credential_refs = [{ integration_id: "integration-1" }];
  tables.fiscal_registration_attempts = [];
}

const tables: Record<string, Record<string, unknown>[]> = {};
let sequence = 0;

function memoryDb(): FiscalDb {
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
