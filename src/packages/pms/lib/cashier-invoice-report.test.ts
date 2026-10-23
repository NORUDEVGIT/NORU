import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CASHIER_INVOICE_DETAIL_SAFETY_LIMIT,
  CASHIER_INVOICE_REPORT_CODE,
  CASHIER_INVOICE_SUMMARY_SAFETY_LIMIT,
  CASHIER_INVOICE_TOO_LARGE_MESSAGE,
  CashierInvoiceReportError,
  assembleCashierInvoiceReport,
  cashierFiscalModeLabel,
  cashierFiscalStatusLabel,
  cashierPaymentMethodLabel,
  type CashierInvoiceSourceDoc,
  type CashierInvoiceSourceLine,
  type CashierInvoiceSummaryRow,
} from "./cashier-invoice-report.ts";
import {
  CASHIER_DETAIL_EXCEL_COLUMNS,
  CASHIER_SUMMARY_EXCEL_COLUMNS,
  cashierAccessSnapshot,
  cashierExcelFileName,
  cashierWorkbookRows,
} from "./cashier-invoice-export.ts";
import { propertyDayBounds } from "./cashiering-control.ts";

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FROM = "2026-10-21";
const TO = "2026-10-21";

function line(
  overrides: Partial<CashierInvoiceSourceLine> & Pick<CashierInvoiceSourceLine, "id">,
): CashierInvoiceSourceLine {
  return {
    sequence: 1,
    item: "Room night",
    quantity: 1,
    unitAmount: 800,
    preTaxAmount: 800,
    taxAmount: 120,
    taxCode: "VAT",
    serviceCharge: 80,
    lineTotal: 1000,
    ...overrides,
  };
}

function doc(
  overrides: Partial<CashierInvoiceSourceDoc> &
    Pick<CashierInvoiceSourceDoc, "id" | "documentNumber">,
): CashierInvoiceSourceDoc {
  return {
    restaurantId: PROPERTY,
    documentType: "INV",
    issuedAt: "2026-10-21T09:00:00.000Z",
    partyType: "Guest",
    partyName: "Abebe Kebede",
    currency: "ETB",
    subtotal: 800,
    tax: 120,
    serviceCharge: 80,
    grandTotal: 1000,
    issuerMembershipId: MEMBER_A,
    issuerName: "Ada Cashier",
    coverageScope: "charge_groups",
    paymentMethods: [],
    fiscalStatuses: [],
    fiscalRequestSnapshot: null,
    externalDocumentNumber: null,
    externalRrn: null,
    parentInvoiceId: null,
    lines: [line({ id: `${overrides.id}-line-1` })],
    ...overrides,
  };
}

function report(
  documents: CashierInvoiceSourceDoc[],
  filters: Parameters<typeof assembleCashierInvoiceReport>[0]["filters"] = {},
) {
  return assembleCashierInvoiceReport({
    restaurantId: PROPERTY,
    from: FROM,
    to: TO,
    businessDate: FROM,
    timezone: "Africa/Addis_Ababa",
    documents,
    filters: { from: FROM, to: TO, ...filters },
  });
}

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Cashier invoice report read model", () => {
  it("includes guest, company, and group INV rows", () => {
    const result = report([
      doc({ id: "g1", documentNumber: "INV-G-1", partyType: "Guest", partyName: "Abebe" }),
      doc({
        id: "c1",
        documentNumber: "INV-C-1",
        partyType: "Company",
        partyName: "NORU Corp",
        issuedAt: "2026-10-21T08:00:00.000Z",
      }),
      doc({
        id: "grp1",
        documentNumber: "INV-GRP-1",
        partyType: "Group",
        partyName: "Tour Group",
        issuedAt: "2026-10-21T07:00:00.000Z",
      }),
    ]);
    assert.deepEqual(
      (result.rows as CashierInvoiceSummaryRow[]).map((row) => [row.documentNumber, row.partyType]),
      [
        ["INV-G-1", "Guest"],
        ["INV-C-1", "Company"],
        ["INV-GRP-1", "Group"],
      ],
    );
  });

  it("excludes legacy_folio invoices by default and counts them", () => {
    const result = report([
      doc({ id: "modern", documentNumber: "INV-1" }),
      doc({
        id: "legacy",
        documentNumber: "INV-LEGACY",
        coverageScope: "legacy_folio",
        grandTotal: 999,
      }),
    ]);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as CashierInvoiceSummaryRow).documentNumber, "INV-1");
    assert.equal(result.legacyExcludedCount, 1);
  });

  it("uses frozen snapshot totals and ignores later folio mutations in the source docs", () => {
    const frozen = doc({
      id: "inv-1",
      documentNumber: "INV-1001",
      subtotal: 800,
      tax: 120,
      serviceCharge: 80,
      grandTotal: 1000,
    });
    const mutatedLiveFolioWouldSay = { ...frozen, grandTotal: 1000 };
    const result = report([mutatedLiveFolioWouldSay]);
    const row = result.rows[0] as CashierInvoiceSummaryRow;
    assert.equal(row.subtotal, 800);
    assert.equal(row.tax, 120);
    assert.equal(row.serviceCharge, 80);
    assert.equal(row.grandTotal, 1000);
  });

  it("keeps INV grand total unchanged and rolls CRE/DEB into Credit and Debit columns", () => {
    const result = report(
      [
        doc({
          id: "inv-1",
          documentNumber: "INV-1001",
          grandTotal: 1000,
          issuedAt: "2026-10-21T10:00:00.000Z",
        }),
        doc({
          id: "cre-1",
          documentNumber: "CN-1001",
          documentType: "CRE",
          coverageScope: null,
          parentInvoiceId: "inv-1",
          fiscalStatuses: ["REGISTERED"],
          grandTotal: -200,
          subtotal: -160,
          tax: -24,
          serviceCharge: -16,
          issuedAt: "2026-10-21T11:00:00.000Z",
          lines: [
            line({
              id: "cre-line",
              item: "Credit note",
              preTaxAmount: -160,
              taxAmount: -24,
              serviceCharge: -16,
              lineTotal: -200,
              unitAmount: -200,
            }),
          ],
        }),
        doc({
          id: "deb-1",
          documentNumber: "DN-1002",
          documentType: "DEB",
          coverageScope: null,
          parentInvoiceId: "inv-1",
          fiscalStatuses: ["PENDING"],
          grandTotal: 100,
          subtotal: 80,
          tax: 12,
          serviceCharge: 8,
          issuedAt: "2026-10-21T12:00:00.000Z",
          lines: [
            line({
              id: "deb-line",
              item: "Debit note",
              preTaxAmount: 80,
              taxAmount: 12,
              serviceCharge: 8,
              lineTotal: 100,
              unitAmount: 100,
            }),
          ],
        }),
      ],
      { documentType: "INV" },
    );
    const rows = result.rows as CashierInvoiceSummaryRow[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.documentNumber, "INV-1001");
    assert.equal(rows[0]?.grandTotal, 1000);
    assert.equal(rows[0]?.creditTotal, -200);
    assert.equal(rows[0]?.debitTotal, 100);
    assert.equal(rows[0]?.netTotal, 900);
    assert.equal(rows[0]?.creditFiscalStatus, "Registered");
    assert.equal(rows[0]?.debitFiscalStatus, "Queued");
    assert.equal(rows[0]?.creditDocuments, "CN-1001");
    assert.equal(rows[0]?.debitDocuments, "DN-1002");
    assert.equal(result.totals[0]?.invoiceTotal, 1000);
    assert.equal(result.totals[0]?.creditTotal, -200);
    assert.equal(result.totals[0]?.debitTotal, 100);
  });

  it("detail keeps invoice item lines and puts Credit/Debit on those rows", () => {
    const result = report(
      [
        doc({
          id: "inv-1",
          documentNumber: "INV-1001",
          fiscalStatuses: ["REGISTERED"],
          issuedAt: "2026-10-21T10:00:00.000Z",
          lines: [line({ id: "inv-line", item: "Room night", sequence: 1 })],
        }),
        doc({
          id: "cre-1",
          documentNumber: "CN-1001",
          documentType: "CRE",
          coverageScope: null,
          parentInvoiceId: "inv-1",
          fiscalStatuses: ["REGISTERED"],
          grandTotal: -200,
          issuedAt: "2026-10-21T11:00:00.000Z",
          lines: [
            line({
              id: "cre-line",
              item: "Credit note",
              lineTotal: -200,
              preTaxAmount: -160,
              taxAmount: -24,
              serviceCharge: -16,
              unitAmount: -200,
            }),
          ],
        }),
        doc({
          id: "deb-1",
          documentNumber: "DN-1002",
          documentType: "DEB",
          coverageScope: null,
          parentInvoiceId: "inv-1",
          fiscalStatuses: ["PENDING"],
          grandTotal: 100,
          issuedAt: "2026-10-21T12:00:00.000Z",
          lines: [
            line({
              id: "deb-line",
              item: "Debit note",
              lineTotal: 100,
              preTaxAmount: 80,
              taxAmount: 12,
              serviceCharge: 8,
              unitAmount: 100,
            }),
          ],
        }),
      ],
      { grain: "detail", documentType: "INV" },
    );
    assert.equal(result.rows.length, 1);
    const row = result.rows[0] as {
      item: string;
      documentType: string;
      creditTotal: number;
      debitTotal: number;
      netTotal: number;
      creditFiscalStatus: string;
      debitFiscalStatus: string;
    };
    assert.equal(row.documentType, "INV");
    assert.equal(row.item, "Room night");
    assert.equal(row.creditTotal, -200);
    assert.equal(row.debitTotal, 100);
    assert.equal(row.netTotal, 900);
    assert.equal(row.creditFiscalStatus, "Registered");
    assert.equal(row.debitFiscalStatus, "Queued");
  });

  it("detail grain uses frozen quantity, unit amount, tax, and service components", () => {
    const result = report(
      [
        doc({
          id: "inv-1",
          documentNumber: "INV-1001",
          lines: [
            line({
              id: "l1",
              sequence: 1,
              item: "Deluxe",
              quantity: 2,
              unitAmount: 400,
              preTaxAmount: 800,
              taxAmount: 120,
              taxCode: "VAT15",
              serviceCharge: 80,
              lineTotal: 1000,
            }),
          ],
        }),
      ],
      { grain: "detail" },
    );
    assert.equal(result.grain, "detail");
    assert.equal(result.rows.length, 1);
    const row = result.rows[0] as {
      quantity: number;
      unitAmount: number;
      taxAmount: number;
      serviceCharge: number;
      lineTotal: number;
      taxCode: string;
    };
    assert.equal(row.quantity, 2);
    assert.equal(row.unitAmount, 400);
    assert.equal(row.taxAmount, 120);
    assert.equal(row.serviceCharge, 80);
    assert.equal(row.lineTotal, 1000);
    assert.equal(row.taxCode, "VAT15");
  });

  it("maps unpaid, single, and mixed payment methods", () => {
    assert.equal(cashierPaymentMethodLabel([]), "Unpaid");
    assert.equal(cashierPaymentMethodLabel(["Cash"]), "Cash");
    assert.equal(cashierPaymentMethodLabel(["Cash", "Card"]), "Mixed");
    assert.equal(cashierPaymentMethodLabel(["deposit", "Cash"]), "Cash");
    const result = report([
      doc({ id: "u1", documentNumber: "INV-U", paymentMethods: [] }),
      doc({
        id: "m1",
        documentNumber: "INV-M",
        paymentMethods: ["Cash", "Card"],
        issuedAt: "2026-10-21T08:00:00.000Z",
      }),
    ]);
    const rows = result.rows as CashierInvoiceSummaryRow[];
    assert.equal(rows.find((row) => row.documentNumber === "INV-U")?.paymentMethod, "Unpaid");
    assert.equal(rows.find((row) => row.documentNumber === "INV-M")?.paymentMethod, "Mixed");
  });

  it("shows issuer name and does not confuse it with a payment receiver field", () => {
    const result = report([
      doc({
        id: "inv-1",
        documentNumber: "INV-1",
        issuerMembershipId: MEMBER_A,
        issuerName: "Ada Cashier",
      }),
    ]);
    assert.equal((result.rows[0] as CashierInvoiceSummaryRow).issuedBy, "Ada Cashier");
    assert.equal("paymentReceiver" in (result.rows[0] ?? {}), false);
  });

  it("reads fiscal mode from frozen snapshot and maps fiscal status", () => {
    assert.equal(cashierFiscalModeLabel({ Mode: "CREDIT" }), "CREDIT");
    assert.equal(cashierFiscalStatusLabel(["REGISTERED"]), "Registered");
    assert.equal(cashierFiscalStatusLabel(["CANCELLED"]), "Cancelled");
    const result = report([
      doc({
        id: "inv-1",
        documentNumber: "INV-1",
        fiscalStatuses: ["REGISTERED"],
        fiscalRequestSnapshot: { Mode: "CASH" },
        externalDocumentNumber: "FS-9",
      }),
    ]);
    const row = result.rows[0] as CashierInvoiceSummaryRow;
    assert.equal(row.fiscalStatus, "Registered");
    assert.equal(row.fiscalMode, "CASH");
    assert.equal(row.externalDocumentNumber, "FS-9");
  });

  it("does not invent Sales Receipt, refund, or write-off document rows in the assembler", () => {
    const server = read("./cashier-invoice-report.server.ts");
    assert.match(server, /SALES_RECEIPT/);
    assert.match(server, /fiscal_document_type\) === "SALES_RECEIPT"\) continue/);
    assert.doesNotMatch(server, /write_off|write-off|refund/i);
    assert.match(read("./cashier-invoice-report.ts"), /Sales receipts, refunds, and write-offs/);
  });

  it("filters by property and date bounds use property timezone helpers", () => {
    const result = report([
      doc({ id: "ok", documentNumber: "INV-OK" }),
      doc({ id: "other", documentNumber: "INV-OTHER", restaurantId: OTHER }),
    ]);
    assert.equal(result.rows.length, 1);
    const bounds = propertyDayBounds("2026-10-21", "Africa/Addis_Ababa");
    assert.match(bounds.startIso, /Z$/);
    assert.match(bounds.endIso, /Z$/);
    assert.match(read("./cashier-invoice-report.server.ts"), /propertyDayBounds/);
  });

  it("paginates summary rows and export ignores page size", () => {
    const docs = Array.from({ length: 30 }, (_, index) =>
      doc({
        id: `inv-${index}`,
        documentNumber: `INV-${String(index).padStart(3, "0")}`,
        issuedAt: `2026-10-21T${String(10 + (index % 10)).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const page = report(docs, { page: 2, pageSize: 10 });
    assert.equal(page.rows.length, 10);
    assert.equal(page.page, 2);
    assert.equal(page.total, 30);
    const exported = report(docs, { page: 2, pageSize: 10, export: true });
    assert.equal(exported.rows.length, 30);
    assert.equal(exported.page, 1);
  });

  it("sorts stably by issued_at desc then document number", () => {
    const result = report([
      doc({ id: "a", documentNumber: "INV-B", issuedAt: "2026-10-21T10:00:00.000Z" }),
      doc({ id: "b", documentNumber: "INV-A", issuedAt: "2026-10-21T10:00:00.000Z" }),
      doc({ id: "c", documentNumber: "INV-C", issuedAt: "2026-10-21T11:00:00.000Z" }),
    ]);
    assert.deepEqual(
      (result.rows as CashierInvoiceSummaryRow[]).map((row) => row.documentNumber),
      ["INV-C", "INV-A", "INV-B"],
    );
  });

  it("groups multi-currency totals instead of summing them", () => {
    const result = report([
      doc({ id: "etb", documentNumber: "INV-ETB", currency: "ETB", grandTotal: 1000 }),
      doc({
        id: "usd",
        documentNumber: "INV-USD",
        currency: "USD",
        grandTotal: 50,
        subtotal: 40,
        tax: 5,
        serviceCharge: 5,
        issuedAt: "2026-10-21T08:00:00.000Z",
      }),
    ]);
    assert.equal(result.totals.length, 2);
    assert.deepEqual(
      result.totals.map((total) => [total.currency, total.grandTotal]),
      [
        ["ETB", 1000],
        ["USD", 50],
      ],
    );
  });

  it("throws a load error object rather than returning empty on assembler safety cap", () => {
    assert.throws(
      () =>
        report(
          Array.from({ length: CASHIER_INVOICE_SUMMARY_SAFETY_LIMIT + 1 }, (_, index) =>
            doc({ id: `x-${index}`, documentNumber: `INV-${index}` }),
          ),
          { export: true },
        ),
      (error: unknown) =>
        error instanceof CashierInvoiceReportError &&
        error.message === CASHIER_INVOICE_TOO_LARGE_MESSAGE,
    );
    assert.equal(CASHIER_INVOICE_DETAIL_SAFETY_LIMIT, 10000);
  });

  it("authorizes through requireCashieringAccess and audits cashier-invoice", () => {
    const functions = read("./cashier-invoice-report.functions.ts");
    const exportFile = read("./cashier-invoice-export.ts");
    assert.match(functions, /requireCashieringAccess/);
    assert.match(functions, /getCashierInvoiceReport/);
    assert.match(functions, /exportCashierInvoiceWorkbook/);
    assert.equal(CASHIER_INVOICE_REPORT_CODE, "cashier-invoice");
    assert.match(exportFile, /pms_report_access_events/);
    assert.match(exportFile, /report_code: CASHIER_INVOICE_REPORT_CODE/);
    assert.match(exportFile, /excel_export/);
  });

  it("builds Excel with numeric money cells and grain-specific columns", () => {
    const summary = report([doc({ id: "inv-1", documentNumber: "INV-1" })], { export: true });
    const summarySheet = cashierWorkbookRows(summary, "NORU Hotel", "2026-10-21 12:00");
    assert.ok(summarySheet.some((row) => row.some((cell) => cell.kind === "number")));
    const moneyCell = summarySheet
      .flat()
      .find((cell) => cell.kind === "number" && cell.value === 1000);
    assert.ok(moneyCell);
    assert.deepEqual([...CASHIER_SUMMARY_EXCEL_COLUMNS].slice(0, 5), [
      "Document Number",
      "Issued Date",
      "Document Type",
      "Party Type",
      "Guest / Company / Group",
    ]);
    assert.ok(CASHIER_DETAIL_EXCEL_COLUMNS.includes("Line Total"));
    assert.equal(
      cashierExcelFileName({ from: "2026-10-21", to: "2026-10-21", grain: "summary" }),
      "cashier-invoice-report-2026-10-21.xlsx",
    );
    assert.equal(
      cashierExcelFileName({ from: "2026-10-01", to: "2026-10-21", grain: "detail" }),
      "cashier-invoice-detail-report-2026-10-01-to-2026-10-21.xlsx",
    );
    assert.deepEqual(cashierAccessSnapshot({ from: FROM, to: TO, documentType: "INV" }), {
      from: FROM,
      to: TO,
      grain: "summary",
      documentType: "INV",
    });
  });

  it("filters by issuer and search query", () => {
    const result = report(
      [
        doc({
          id: "a",
          documentNumber: "INV-ADA",
          issuerMembershipId: MEMBER_A,
          issuerName: "Ada",
          partyName: "Abebe",
        }),
        doc({
          id: "b",
          documentNumber: "INV-BEN",
          issuerMembershipId: MEMBER_B,
          issuerName: "Ben",
          partyName: "Hana",
          issuedAt: "2026-10-21T08:00:00.000Z",
        }),
      ],
      { issuerId: MEMBER_A, query: "abe" },
    );
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as CashierInvoiceSummaryRow).documentNumber, "INV-ADA");
  });
});
