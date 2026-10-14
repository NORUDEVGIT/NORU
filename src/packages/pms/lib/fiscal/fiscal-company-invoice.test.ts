import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildFiscalRegistrationExchange } from "./fiscal-exchange.ts";
import {
  assessCompanyInvoiceFiscal,
  companyInvoiceTrnxId,
  FISCAL_B2B_ID_TYPE,
  p6HandlerEnabled,
  type CompanyInvoiceFiscalInput,
} from "./fiscal-company-invoice.ts";
import { queueCompanyInvoiceFiscal } from "./fiscal-company-invoice.server.ts";
import {
  p2HandlerEnabled,
  parseFiscalInvoiceSuccess,
  parseFiscalRuleValidation,
} from "./fiscal-guest-invoice.ts";
import { p3HandlerEnabled } from "./fiscal-credit-note.ts";
import { p4HandlerEnabled } from "./fiscal-debit-note.ts";
import { p5HandlerEnabled } from "./fiscal-sales-receipt.ts";
import {
  FISCAL_DOCUMENT_MODE,
  FISCAL_ITEM_UNIT,
  classifyFiscalFailure,
  type FiscalDb,
  type FiscalDbQuery,
  type FiscalDbResult,
} from "./fiscal.types.ts";

const INVOICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAX_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function billTo() {
  return {
    name: "Alpha PLC",
    taxId: "123",
    phone: "111",
    email: "alpha@example.com",
    address: "Bole Atlas, Addis Ababa",
    registrationNumber: "VAT-A",
    city: "Addis Ababa",
    region: "Addis Ababa",
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    target: "financial_account",
    issuedAt: "2026-10-13T06:30:00.000Z",
    document: { issuedNumber: "INV-0042" },
    property: { currencyCode: "ETB" },
    account: { id: "acct-1", accountNumber: "CA-1", accountKind: "company", currency: "ETB" },
    billTo: billTo(),
    groups: [
      {
        description: "Room Accommodation",
        chargeSource: "room",
        quantity: 1,
        unitAmount: 12,
        subtotal: 12,
        taxTotal: 0,
        serviceChargeTotal: 0,
        grossTotal: 12,
        chargeSnapshot: { serviceTypeId: null, departmentId: null },
        taxLines: [],
      },
    ],
    totals: { subtotal: 12, tax: 0, serviceCharge: 0, invoiceTotal: 12 },
    ...overrides,
  };
}

function input(overrides: Partial<CompanyInvoiceFiscalInput> = {}): CompanyInvoiceFiscalInput {
  return {
    issued: true,
    snapshot: snapshot(),
    connection: {
      enabled: true,
      taxpayerTin: "0026716178",
      client: "ERP",
      deviceId: "001096",
      credentialsConfigured: true,
    },
    taxMappings: [
      { mappingKind: "NO_TAX", pmsTaxId: null, externalTaxCode: "VAT0", active: true },
      { mappingKind: "TAX", pmsTaxId: TAX_ID, externalTaxCode: "VAT15", active: true },
    ],
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

describe("company B2B fiscal invoice", () => {
  it("builds a frozen B2B invoice and ignores a later company profile", () => {
    const result = assessCompanyInvoiceFiscal(INVOICE_ID, input());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const payload = result.payload;
    assert.equal(payload.Type, "INV");
    assert.equal(payload.Mode, FISCAL_DOCUMENT_MODE);
    assert.equal(payload.TransactionType, "B2B");
    assert.equal(payload.RelatedDocument, null);
    assert.equal(payload.trnx_id, `ci-${INVOICE_ID}`);
    assert.equal("BuyerDetails" in payload, false);
    assert.equal("ItemList" in payload, false);
    assert.equal("ValueDetails" in payload, false);
    assert.equal(payload.info.ItemList[0].Unit, FISCAL_ITEM_UNIT);
    assert.equal(payload.info.ItemList[0].ItemCode, 1001);
    assert.equal(payload.info.ItemList[0].TaxCode, "VAT0");
    assert.equal(payload.info.ItemList[0].PreTaxValue, 12);
    assert.equal(payload.info.ItemList[0].TotalLineAmount, 12);
    assert.equal(payload.info.ValueDetails.TotalValue, 12);
    assert.equal(payload.info.ValueDetails.InvoiceCurrency, "ETB");
    const buyer = payload.info.BuyerDetails;
    assert.equal(buyer.LegalName, "Alpha PLC");
    assert.equal(buyer.Tin, "123");
    assert.equal(buyer.VatNumber, "VAT-A");
    assert.equal(buyer.Phone, "111");
    assert.equal(buyer.Email, "alpha@example.com");
    assert.equal(buyer.City, "Addis Ababa");
    assert.equal(buyer.Region, null);
    assert.equal(buyer.Zone, null);
    assert.equal(buyer.Wereda, null);
    assert.equal(buyer.Kebele, null);
    assert.equal(buyer.HouseNumber, null);
    assert.equal(buyer.IdType, FISCAL_B2B_ID_TYPE);
    assert.equal(buyer.IdType, "KID");
    assert.equal(buyer.IdNumber, null);
    assert.equal(JSON.stringify(payload).includes("Bole Atlas"), false);
    assert.equal(JSON.stringify(payload).includes("Beta PLC"), false);

    const changed = snapshot({
      billTo: {
        name: "Beta PLC",
        taxId: "999",
        phone: "222",
        registrationNumber: "VAT-B",
        city: "Dire Dawa",
      },
    });
    const original = assessCompanyInvoiceFiscal(INVOICE_ID, input());
    const later = assessCompanyInvoiceFiscal(INVOICE_ID, input({ snapshot: changed }));
    assert.equal(original.ok && later.ok, true);
    if (!original.ok || !later.ok) return;
    assert.equal(original.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.notEqual(
      later.payload.info.BuyerDetails.LegalName,
      original.payload.info.BuyerDetails.LegalName,
    );
    assert.equal(companyInvoiceTrnxId(INVOICE_ID), original.payload.trnx_id);
  });

  it("sends a region name as null and preserves a numeric provider code", () => {
    const named = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({ snapshot: snapshot({ billTo: { ...billTo(), region: "Oromia" } }) }),
    );
    assert.equal(named.ok, true);
    if (!named.ok) return;
    assert.equal("BuyerDetails" in named.payload.info, true);
    assert.equal(named.payload.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(named.payload.info.BuyerDetails.Tin, "123");
    assert.equal(named.payload.info.BuyerDetails.VatNumber, "VAT-A");
    assert.equal(named.payload.info.BuyerDetails.City, "Addis Ababa");
    assert.equal(named.payload.info.BuyerDetails.Region, null);

    for (const region of ["Addis Ababa", "Oromia", "1234", "1A", "", "   "]) {
      const result = assessCompanyInvoiceFiscal(
        INVOICE_ID,
        input({ snapshot: snapshot({ billTo: { ...billTo(), region } }) }),
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.payload.info.BuyerDetails.Region, null);
      assert.equal(result.payload.info.BuyerDetails.City, "Addis Ababa");
    }

    for (const region of ["1", "12", "001", "123", " 12 "]) {
      const result = assessCompanyInvoiceFiscal(
        INVOICE_ID,
        input({ snapshot: snapshot({ billTo: { ...billTo(), region } }) }),
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.payload.info.BuyerDetails.Region, region.trim());
      assert.equal(result.payload.info.BuyerDetails.City, "Addis Ababa");
    }
  });

  it("allows a null registration number and blocks incomplete buyers", () => {
    const withoutVat = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({
        snapshot: snapshot({
          billTo: {
            name: "Alpha PLC",
            taxId: "123",
            phone: "  ",
            email: "",
            registrationNumber: "   ",
            address: "Bole Atlas, Addis Ababa",
          },
        }),
      }),
    );
    assert.equal(withoutVat.ok, true);
    if (!withoutVat.ok) return;
    assert.equal(withoutVat.payload.info.BuyerDetails.VatNumber, null);
    assert.equal(withoutVat.payload.info.BuyerDetails.Phone, null);
    assert.equal(withoutVat.payload.info.BuyerDetails.Email, null);
    assert.equal(withoutVat.payload.info.BuyerDetails.City, null);
    assert.equal(withoutVat.payload.info.BuyerDetails.Region, null);

    const missingTin = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({ snapshot: snapshot({ billTo: { name: "Alpha PLC", taxId: " " } }) }),
    );
    const missingName = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({ snapshot: snapshot({ billTo: { name: "  ", taxId: "123" } }) }),
    );
    assert.equal(missingTin.ok, false);
    assert.equal(missingName.ok, false);
    if (missingTin.ok || missingName.ok) return;
    assert.match(missingTin.reasons.join(" "), /TIN is required/);
    assert.match(missingName.reasons.join(" "), /legal name is required/);
  });

  it("blocks drafts, groups, guest snapshots, other currencies, and unfrozen identity", () => {
    const draft = assessCompanyInvoiceFiscal(INVOICE_ID, input({ issued: false }));
    const group = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({ snapshot: snapshot({ account: { accountKind: "group", currency: "ETB" } }) }),
    );
    const guest = assessCompanyInvoiceFiscal(INVOICE_ID, {
      ...input(),
      snapshot: { version: 2, folio: { guestName: "Sara" }, groups: [{ description: "Room" }] },
    });
    const usd = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({ snapshot: snapshot({ account: { accountKind: "company", currency: "USD" } }) }),
    );
    const legacy = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({
        snapshot: snapshot({
          groups: [
            {
              description: "Room Accommodation",
              subtotal: 12,
              taxTotal: 0,
              serviceChargeTotal: 0,
              grossTotal: 12,
            },
          ],
        }),
      }),
    );
    assert.equal(draft.ok, false);
    assert.equal(group.ok, false);
    assert.equal(guest.ok, false);
    assert.equal(usd.ok, false);
    assert.equal(legacy.ok, false);
    if (draft.ok || group.ok || guest.ok || usd.ok || legacy.ok) return;
    assert.match(draft.reasons.join(" "), /issued invoice/);
    assert.match(group.reasons.join(" "), /Group invoices/);
    assert.match(guest.reasons.join(" "), /company invoice/);
    assert.match(usd.reasons.join(" "), /ETB/);
    assert.match(legacy.reasons.join(" "), /item identity/);
  });

  it("uses the explicit tax mapping and frozen tax amount", () => {
    const taxed = assessCompanyInvoiceFiscal(
      INVOICE_ID,
      input({
        snapshot: snapshot({
          groups: [
            {
              description: "Airport Transfer",
              chargeSource: "manual",
              quantity: 1,
              unitAmount: 100,
              subtotal: 100,
              taxTotal: 15,
              serviceChargeTotal: 0,
              grossTotal: 115,
              chargeSnapshot: null,
              taxLines: [
                {
                  name: "Value Added Tax (VAT)",
                  amount: 15,
                  taxSnapshot: { taxId: TAX_ID, name: "Value Added Tax (VAT)" },
                },
              ],
            },
          ],
          totals: { subtotal: 100, tax: 15, serviceCharge: 0, invoiceTotal: 115 },
          itemSource: "manual",
        }),
        itemMappings: [
          {
            serviceTypeId: null,
            departmentId: null,
            chargeSource: "manual",
            isDefault: false,
            externalItemCode: "1002",
            externalUnit: "PCS",
            natureOfSupplies: "service",
            harmonizationCode: "H1",
            active: true,
          },
        ],
      }),
    );
    assert.equal(taxed.ok, true);
    if (!taxed.ok) return;
    assert.equal(taxed.payload.info.ItemList[0].TaxCode, "VAT15");
    assert.equal(taxed.payload.info.ItemList[0].TaxAmount, 15);
    assert.equal(taxed.payload.info.ItemList[0].ItemCode, 1002);
    assert.equal(taxed.payload.info.ItemList[0].Unit, "PCS");
    assert.equal(taxed.payload.info.ValueDetails.TaxValue, 15);
    assert.equal(taxed.payload.info.ValueDetails.TotalValue, 115);
  });

  it("keeps company registration on the account invoice handler only", () => {
    assert.equal(p6HandlerEnabled("INV", "account_invoice"), true);
    assert.equal(p6HandlerEnabled("INV", "guest_invoice"), false);
    assert.equal(p6HandlerEnabled("CRE", "credit_note"), false);
    assert.equal(p6HandlerEnabled("DEB", "debit_note"), false);
    assert.equal(p6HandlerEnabled("SALES_RECEIPT", "account_allocation"), false);
    assert.equal(p2HandlerEnabled("INV", "account_invoice"), false);
    assert.equal(p2HandlerEnabled("INV", "guest_invoice"), true);
    assert.equal(p3HandlerEnabled("CRE", "credit_note"), true);
    assert.equal(p4HandlerEnabled("DEB", "debit_note"), true);
    assert.equal(p5HandlerEnabled("SALES_RECEIPT", "guest_allocation"), true);
    const source = readFileSync(new URL("./fiscal-company-invoice.ts", import.meta.url), "utf8");
    assert.equal(source.split('"KID"').length - 1, 1);
    const migration = readFileSync(
      new URL(
        "../../../../../supabase/migrations/0155_company_invoice_fiscal_buyer_snapshot.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /BEFORE INSERT/);
    assert.match(migration, /business_registration_number/);
    assert.equal(/UPDATE public\.financial_account_invoices/.test(migration), false);
    assert.equal(/UPDATE public\.folio_transactions/.test(migration), false);
    assert.equal(/UPDATE public\.guest_account_masters/.test(migration), false);
  });

  it("classifies provider failures the same way as other fiscal documents", () => {
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_PROVIDER_REJECTED", httpStatus: 406 }).retryable,
      false,
    );
    assert.equal(
      classifyFiscalFailure({ code: "FISCAL_HTTP_ERROR", httpStatus: 503 }).retryable,
      true,
    );
    assert.match(
      parseFiscalRuleValidation({ statusCode: 406, message: "RULE VALIDATION ERROR" }) ?? "",
      /RULE VALIDATION/,
    );
    const success = parseFiscalInvoiceSuccess({
      body: {
        irn: "IRN-B2B",
        status: "A",
        ackDate: "2026-10-13T12:00:00.000Z",
        signedQR: "iVBORw0",
        errorMessage: null,
        signedInvoice: "signed",
        documentNumber: "2822",
      },
      message: "SUCCESS",
      statusCode: 200,
    });
    assert.equal(success.ok, true);
    if (!success.ok) return;
    assert.equal(success.irn, "IRN-B2B");
    assert.equal(success.documentNumber, "2822");
    assert.equal(success.signedQr, "iVBORw0");
  });

  it("shows BuyerDetails in the fiscal exchange", () => {
    const built = assessCompanyInvoiceFiscal(INVOICE_ID, input());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const exchange = buildFiscalRegistrationExchange({
      registration: {
        id: "reg-1",
        source_type: "account_invoice",
        source_id: INVOICE_ID,
        fiscal_document_type: "INV",
        status: "REGISTERED",
        trnx_id: built.payload.trnx_id,
        request_snapshot: built.payload,
        response_snapshot: { message: "SUCCESS" },
      },
      attempts: [],
      invoiceNumber: "INV-0042",
    });
    assert.equal(exchange.registration.invoiceNumber, "INV-0042");
    const request = exchange.registration.requestSnapshot as {
      info: { BuyerDetails: { Tin: string } };
    };
    assert.equal(request.info.BuyerDetails.Tin, "123");
  });

  it("queues one company registration and does not write financial rows", async () => {
    const { db, tables } = memoryDb();
    const first = await queueCompanyInvoiceFiscal(db, {
      restaurantId: "property-1",
      invoiceId: INVOICE_ID,
    });
    const second = await queueCompanyInvoiceFiscal(db, {
      restaurantId: "property-1",
      invoiceId: INVOICE_ID,
    });
    assert.equal(first.status, "queued");
    assert.equal(second.status, "queued");
    assert.equal(tables.fiscal_registrations.length, 1);
    assert.equal(tables.fiscal_registrations[0].trnx_id, `ci-${INVOICE_ID}`);
    assert.equal(tables.fiscal_registrations[0].source_type, "account_invoice");
    const stored = tables.fiscal_registrations[0].request_snapshot as {
      info: { BuyerDetails: { LegalName: string; Tin: string; VatNumber: string } };
    };
    assert.equal(stored.info.BuyerDetails.LegalName, "Alpha PLC");
    assert.equal(stored.info.BuyerDetails.Tin, "123");
    assert.equal(stored.info.BuyerDetails.VatNumber, "VAT-A");
    tables.guest_account_masters[0].name = "Beta PLC";
    tables.guest_account_masters[0].tax_id = "999";
    const third = await queueCompanyInvoiceFiscal(db, {
      restaurantId: "property-1",
      invoiceId: INVOICE_ID,
    });
    assert.equal(third.registration?.trnxId, `ci-${INVOICE_ID}`);
    assert.equal(
      (
        tables.fiscal_registrations[0].request_snapshot as {
          info: { BuyerDetails: { LegalName: string } };
        }
      ).info.BuyerDetails.LegalName,
      "Alpha PLC",
    );
    assert.equal(tables.financial_account_invoices[0].snapshot, firstSnapshot);
    assert.equal(tables.financial_accounts[0].balance, 500);
    const server = readFileSync(
      new URL("./fiscal-company-invoice.server.ts", import.meta.url),
      "utf8",
    );
    assert.equal(server.includes("guest_account_masters"), false);
    assert.equal(/from\("financial_account_invoices"\)[\s\S]{0,180}\.update/.test(server), false);
    assert.equal(/from\("financial_accounts"\)[\s\S]{0,120}\.update/.test(server), false);
    assert.match(server, /sendStoredFiscalRequest\(db, row, fetchImpl, "invoice"\)/);
    assert.match(server, /requireCashierManager|source_type: "account_invoice"/);
    const functions = readFileSync(new URL("./fiscal.functions.ts", import.meta.url), "utf8");
    assert.match(functions, /getCompanyInvoiceFiscal[\s\S]{0,400}requireCashieringAccess/);
    assert.match(functions, /registerCompanyInvoiceFiscal[\s\S]{0,500}requireCashierManager/);
  });

  it("leaves a failed company request snapshot unchanged on retry", async () => {
    const { db, tables } = memoryDb();
    const stored = {
      TransactionType: "B2B",
      info: {
        BuyerDetails: {
          LegalName: "test company",
          Tin: "0026716178",
          VatNumber: "2321231200",
          City: "Addis Ababa",
          Region: "Addis Ababa",
        },
        ValueDetails: { TaxValue: 0, TotalValue: 12 },
      },
    };
    tables.fiscal_registrations.push({
      id: "reg-failed",
      restaurant_id: "property-1",
      source_type: "account_invoice",
      source_id: INVOICE_ID,
      fiscal_document_type: "INV",
      status: "FAILED",
      trnx_id: `ci-${INVOICE_ID}`,
      request_snapshot: stored,
      external_irn: null,
      external_document_number: null,
      acknowledged_at: null,
      registered_at: null,
      signed_qr: null,
      last_error_message: "The fiscal service returned an unexpected registration response.",
    });
    const result = await queueCompanyInvoiceFiscal(db, {
      restaurantId: "property-1",
      invoiceId: INVOICE_ID,
    });
    assert.equal(result.status, "queued");
    assert.equal(tables.fiscal_registrations.length, 1);
    assert.equal(tables.fiscal_registrations[0].status, "PENDING");
    assert.equal(tables.fiscal_registrations[0].request_snapshot, stored);
    assert.equal(stored.info.BuyerDetails.Region, "Addis Ababa");
    assert.equal(stored.info.BuyerDetails.City, "Addis Ababa");
    assert.equal(result.preview?.region, "Addis Ababa");
    const server = readFileSync(
      new URL("./fiscal-company-invoice.server.ts", import.meta.url),
      "utf8",
    );
    const failed = server.slice(server.indexOf('existing?.status === "FAILED"'));
    const retry = failed.slice(0, failed.indexOf("const inserted"));
    assert.equal(retry.includes("request_snapshot"), false);
  });
});

const firstSnapshot = snapshot();

function memoryDb(): { db: FiscalDb; tables: Record<string, Record<string, unknown>[]> } {
  const tables: Record<string, Record<string, unknown>[]> = {
    financial_account_invoices: [
      {
        id: INVOICE_ID,
        restaurant_id: "property-1",
        issued_number: "INV-0042",
        snapshot: firstSnapshot,
      },
    ],
    financial_accounts: [{ id: "acct-1", restaurant_id: "property-1", balance: 500 }],
    guest_account_masters: [
      { id: "master-1", restaurant_id: "property-1", name: "Beta PLC", tax_id: "999" },
    ],
    pms_integrations: [
      {
        id: "integration-1",
        restaurant_id: "property-1",
        category: "fiscal",
        provider: "erp_fiscal",
        enabled: true,
        config: { taxpayerTin: "0026716178", client: "ERP", deviceId: "001096" },
      },
    ],
    fiscal_tax_code_mappings: [
      {
        integration_id: "integration-1",
        mapping_kind: "NO_TAX",
        pms_tax_id: null,
        external_tax_code: "VAT0",
        active: true,
      },
    ],
    fiscal_item_mappings: [
      {
        integration_id: "integration-1",
        service_type_id: null,
        department_id: null,
        charge_source: "room",
        is_default: false,
        external_item_code: "1001",
        external_unit: "PCS",
        nature_of_supplies: "service",
        harmonization_code: null,
        active: true,
      },
    ],
    fiscal_credential_refs: [{ integration_id: "integration-1" }],
    fiscal_registrations: [],
  };
  const db: FiscalDb = {
    from(table: string) {
      return query(tables, table);
    },
    rpc: async () => ({ data: [], error: null }),
  };
  return { db, tables };
}

function query(tables: Record<string, Record<string, unknown>[]>, table: string): FiscalDbQuery {
  const filters: Array<[string, unknown]> = [];
  let action: "select" | "insert" | "update" = "select";
  let values: Record<string, unknown> | null = null;
  const run = (): FiscalDbResult => {
    const rows = (tables[table] ?? []).filter((row) =>
      filters.every(([column, value]) => row[column] === value),
    );
    if (action === "insert" && values) {
      if (!tables[table]) throw new Error(`Unexpected write to ${table}`);
      const stored = { id: `reg-${tables[table].length + 1}`, ...values };
      tables[table].push(stored);
      return { data: stored, error: null };
    }
    if (action === "update" && values) {
      if (table !== "fiscal_registrations") throw new Error(`Unexpected update ${table}`);
      for (const row of rows) Object.assign(row, values);
      return { data: null, error: null };
    }
    return { data: rows, error: null };
  };
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    insert(next: Record<string, unknown> | Record<string, unknown>[]) {
      action = "insert";
      values = Array.isArray(next) ? next[0] : next;
      return builder;
    },
    update(next: Record<string, unknown>) {
      action = "update";
      values = next;
      return builder;
    },
    upsert() {
      return builder;
    },
    maybeSingle() {
      const result = run();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return Promise.resolve({ data, error: result.error });
    },
    single() {
      return builder.maybeSingle();
    },
    then(resolve: (value: FiscalDbResult) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject);
    },
  };
  return builder as FiscalDbQuery;
}
