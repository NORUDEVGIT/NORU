import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FISCAL_REGISTRATION_REPORT_CODE,
  FISCAL_REGISTRATION_SAFETY_LIMIT,
  FISCAL_REGISTRATION_TOO_LARGE_MESSAGE,
  FiscalRegistrationReportError,
  assembleFiscalRegistrationReport,
  fiscalDocumentNumber,
  fiscalPayloadTotal,
  fiscalStatusLabel,
  type FiscalRegistrationSource,
  type FiscalRegistrationSummaryRow,
} from "./fiscal-registration-report.ts";
import {
  FISCAL_EXCEL_COLUMNS,
  fiscalAccessSnapshot,
  fiscalExcelFileName,
  fiscalWorkbookRows,
} from "./fiscal-registration-export.ts";
import { propertyDayBounds } from "./cashiering-control.ts";

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FROM = "2026-10-21";
const TO = "2026-10-21";
const RANGE = propertyDayBounds(FROM, "Africa/Addis_Ababa");

function cashSnapshot(total = 1000) {
  return {
    Mode: "CASH",
    info: {
      ValueDetails: { TotalValue: total, InvoiceCurrency: "ETB" },
      BuyerDetails: { LegalName: "Cash Guest" },
    },
  };
}

function creditSnapshot(total = 1000, name = "Credit Guest") {
  return {
    Mode: "CREDIT",
    info: {
      ValueDetails: { TotalValue: total, InvoiceCurrency: "ETB" },
      BuyerDetails: { LegalName: name },
    },
  };
}

function doc(
  overrides: Partial<FiscalRegistrationSource> & Pick<FiscalRegistrationSource, "id">,
): FiscalRegistrationSource {
  const requestSnapshot = overrides.requestSnapshot ?? creditSnapshot();
  return {
    restaurantId: PROPERTY,
    documentType: "INV",
    sourceType: "guest_invoice",
    sourceId: overrides.id,
    relatedRegistrationId: null,
    status: "REGISTERED",
    trnxId: `trnx-${overrides.id}`,
    externalDocumentNumber: `FS-${overrides.id}`,
    externalIrn: null,
    externalRrn: null,
    registeredAt: "2026-10-21T09:00:00.000Z",
    createdAt: "2026-10-21T09:00:00.000Z",
    requestSnapshot,
    clientSnapshot: null,
    partyName: "Credit Guest",
    internalDocumentNumber: null,
    currency: "ETB",
    invoiceTotal: fiscalPayloadTotal(requestSnapshot),
    ...overrides,
  };
}

function report(
  documents: FiscalRegistrationSource[],
  filters: Parameters<typeof assembleFiscalRegistrationReport>[0]["filters"] = {},
) {
  return assembleFiscalRegistrationReport({
    restaurantId: PROPERTY,
    from: FROM,
    to: TO,
    businessDate: FROM,
    timezone: "Africa/Addis_Ababa",
    rangeStartIso: RANGE.startIso,
    rangeEndIso: RANGE.endIso,
    documents,
    filters: { from: FROM, to: TO, ...filters },
  });
}

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Fiscal registration report read model", () => {
  it("includes fiscal INV rows with external document number preferred over trnx/uuid", () => {
    const result = report([
      doc({
        id: "inv-1",
        externalDocumentNumber: "2821",
        trnxId: "gi-uuid-like",
      }),
    ]);
    const row = result.rows[0] as FiscalRegistrationSummaryRow;
    assert.equal(row.fiscalDocumentNumber, "2821");
    assert.equal(fiscalDocumentNumber(doc({ id: "x", externalDocumentNumber: null })), "trnx-x");
  });

  it("keeps CASH sales receipt column empty and CREDIT shows linked SR", () => {
    const cash = report([
      doc({
        id: "cash-1",
        requestSnapshot: cashSnapshot(500),
        partyName: "Cash Guest",
        invoiceTotal: 500,
      }),
      doc({
        id: "sr-cash",
        documentType: "SALES_RECEIPT",
        sourceType: "guest_allocation",
        relatedRegistrationId: "cash-1",
        externalDocumentNumber: "SR-CASH",
        status: "REGISTERED",
        registeredAt: "2026-10-21T10:00:00.000Z",
      }),
    ]);
    assert.equal(cash.rows[0]?.salesReceiptNumber, null);
    assert.equal(cash.rows[0]?.mode, "CASH");

    const credit = report([
      doc({ id: "cred-1", requestSnapshot: creditSnapshot(1000) }),
      doc({
        id: "sr-1",
        documentType: "SALES_RECEIPT",
        sourceType: "guest_allocation",
        relatedRegistrationId: "cred-1",
        externalDocumentNumber: "SR-9",
        invoiceTotal: 400,
        status: "REGISTERED",
        registeredAt: "2026-10-21T10:00:00.000Z",
      }),
    ]);
    assert.equal(credit.rows[0]?.salesReceiptNumber, "SR-9");
    assert.equal(credit.rows[0]?.salesReceiptStatus, "Registered");
    assert.equal(credit.rows[0]?.salesReceiptTotal, 400);
    assert.equal(credit.rows[0]?.mode, "CREDIT");
    assert.equal(cash.rows[0]?.salesReceiptTotal, null);
  });

  it("reads Sales Receipt amount from InvoicePaidAmount (no ValueDetails on SR payloads)", () => {
    assert.equal(fiscalPayloadTotal({ InvoicePaidAmount: 350, info: {} }), 350);
    assert.equal(fiscalPayloadTotal({ info: { ValueDetails: { TotalValue: 115 } } }), 115);
  });

  it("rolls CRE and DEB onto INV and computes Net Total", () => {
    const result = report([
      doc({ id: "inv-1", invoiceTotal: 1000, requestSnapshot: creditSnapshot(1000) }),
      doc({
        id: "cre-1",
        documentType: "CRE",
        sourceType: "credit_note",
        relatedRegistrationId: "inv-1",
        externalDocumentNumber: "CRE-1",
        invoiceTotal: 200,
        status: "REGISTERED",
        registeredAt: "2026-10-21T11:00:00.000Z",
      }),
      doc({
        id: "deb-1",
        documentType: "DEB",
        sourceType: "debit_note",
        relatedRegistrationId: "inv-1",
        externalDocumentNumber: "DEB-1",
        invoiceTotal: 50,
        status: "PENDING",
        registeredAt: "2026-10-21T12:00:00.000Z",
      }),
    ]);
    const row = result.rows[0] as FiscalRegistrationSummaryRow;
    assert.equal(result.rows.length, 1);
    assert.equal(row.invoiceTotal, 1000);
    assert.equal(row.creditTotal, -200);
    assert.equal(row.debitTotal, 50);
    assert.equal(row.netTotal, 850);
    assert.equal(row.creditDocuments, "CRE-1");
    assert.equal(row.debitDocuments, "DEB-1");
    assert.equal(row.creditFiscalStatus, "Registered");
    assert.equal(row.debitFiscalStatus, "Pending");
  });

  it("maps statuses without inventing REGISTERED from RRN alone", () => {
    assert.equal(fiscalStatusLabel("FAILED"), "Failed");
    assert.equal(fiscalStatusLabel("CANCELLED"), "Cancelled");
    const result = report([
      doc({
        id: "inv-fail",
        status: "FAILED",
        externalRrn: "RRN-1",
        externalDocumentNumber: "FS-FAIL",
      }),
      doc({
        id: "inv-cancel",
        status: "CANCELLED",
        externalDocumentNumber: "FS-CANCEL",
        registeredAt: "2026-10-21T08:00:00.000Z",
      }),
    ]);
    assert.deepEqual(
      result.rows.map((row) => [row.fiscalDocumentNumber, row.fiscalStatus]),
      [
        ["FS-FAIL", "Failed"],
        ["FS-CANCEL", "Cancelled"],
      ],
    );
  });

  it("filters by property and uses property day bounds", () => {
    const result = report([
      doc({ id: "ok", externalDocumentNumber: "FS-OK" }),
      doc({ id: "other", restaurantId: OTHER, externalDocumentNumber: "FS-OTHER" }),
    ]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.fiscalDocumentNumber, "FS-OK");
    assert.match(read("./fiscal-registration-report.server.ts"), /propertyDayBounds/);
    assert.match(RANGE.startIso, /Z$/);
  });

  it("paginates rows and export ignores page size", () => {
    const docs = Array.from({ length: 30 }, (_, index) =>
      doc({
        id: `inv-${index}`,
        externalDocumentNumber: `FS-${String(index).padStart(3, "0")}`,
        registeredAt: `2026-10-21T${String(10 + (index % 10)).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const page = report(docs, { page: 2, pageSize: 10 });
    assert.equal(page.rows.length, 10);
    assert.equal(page.page, 2);
    assert.equal(page.total, 30);
    const exported = report(docs, { page: 2, pageSize: 10, export: true });
    assert.equal(exported.rows.length, 30);
  });

  it("groups multi-currency totals instead of summing them", () => {
    const result = report([
      doc({ id: "etb", currency: "ETB", invoiceTotal: 1000 }),
      doc({
        id: "usd",
        currency: "USD",
        invoiceTotal: 50,
        registeredAt: "2026-10-21T08:00:00.000Z",
        requestSnapshot: {
          Mode: "CREDIT",
          info: {
            ValueDetails: { TotalValue: 50, InvoiceCurrency: "USD" },
            BuyerDetails: { LegalName: "USD Guest" },
          },
        },
      }),
    ]);
    assert.equal(result.totals.length, 2);
    assert.deepEqual(
      result.totals.map((total) => [total.currency, total.invoiceTotal]),
      [
        ["ETB", 1000],
        ["USD", 50],
      ],
    );
  });

  it("throws when export exceeds safety limit rather than returning empty", () => {
    assert.throws(
      () =>
        report(
          Array.from({ length: FISCAL_REGISTRATION_SAFETY_LIMIT + 1 }, (_, index) =>
            doc({ id: `x-${index}`, externalDocumentNumber: `FS-${index}` }),
          ),
          { export: true },
        ),
      (error: unknown) =>
        error instanceof FiscalRegistrationReportError &&
        error.message === FISCAL_REGISTRATION_TOO_LARGE_MESSAGE,
    );
  });

  it("authorizes through requireCashieringAccess and audits fiscal-registration", () => {
    const functions = read("./fiscal-registration-report.functions.ts");
    const exportFile = read("./fiscal-registration-export.ts");
    const server = read("./fiscal-registration-report.server.ts");
    assert.match(functions, /requireCashieringAccess/);
    assert.match(functions, /getFiscalRegistrationReport/);
    assert.match(functions, /exportFiscalRegistrationWorkbook/);
    assert.match(functions, /supabaseAdmin/);
    assert.equal(FISCAL_REGISTRATION_REPORT_CODE, "fiscal-registration");
    assert.match(exportFile, /pms_report_access_events/);
    assert.match(exportFile, /report_code: FISCAL_REGISTRATION_REPORT_CODE/);
    assert.match(server, /FiscalRegistrationReportError/);
    assert.match(server, /throw new FiscalRegistrationReportError\(\)/);
  });

  it("builds Excel with numeric money cells and compact audit snapshot", () => {
    const result = report(
      [doc({ id: "inv-1", invoiceTotal: 1000, requestSnapshot: creditSnapshot(1000) })],
      { export: true },
    );
    const sheet = fiscalWorkbookRows(result, "NORU Hotel", "2026-10-21 12:00");
    assert.ok(sheet.some((row) => row.some((cell) => cell.kind === "number")));
    assert.ok(FISCAL_EXCEL_COLUMNS.includes("Sales Receipt No."));
    assert.ok(FISCAL_EXCEL_COLUMNS.includes("Net Total"));
    assert.equal(
      fiscalExcelFileName({ from: "2026-10-21", to: "2026-10-21" }),
      "fiscal-registration-report-2026-10-21.xlsx",
    );
    assert.deepEqual(
      fiscalAccessSnapshot({ from: FROM, to: TO, documentType: "INV", mode: "CREDIT" }),
      {
        from: FROM,
        to: TO,
        documentType: "INV",
        mode: "CREDIT",
        status: "ALL",
      },
    );
  });

  it("filters by mode, status, and search query", () => {
    const result = report(
      [
        doc({
          id: "cash",
          requestSnapshot: cashSnapshot(100),
          partyName: "Cash Guest",
          invoiceTotal: 100,
          externalDocumentNumber: "FS-CASH",
          externalIrn: "IRN-CASH",
        }),
        doc({
          id: "credit",
          requestSnapshot: creditSnapshot(200, "Abebe"),
          partyName: "Abebe",
          invoiceTotal: 200,
          externalDocumentNumber: "FS-CREDIT",
          status: "FAILED",
          registeredAt: "2026-10-21T08:00:00.000Z",
        }),
      ],
      { mode: "CREDIT", status: "FAILED", query: "abe" },
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.fiscalDocumentNumber, "FS-CREDIT");
  });

  it("shows orphan CRE/DEB rows when document type is ALL", () => {
    const result = report(
      [
        doc({
          id: "orphan-cre",
          documentType: "CRE",
          sourceType: "credit_note",
          relatedRegistrationId: "missing-parent",
          externalDocumentNumber: "CRE-ORPHAN",
          invoiceTotal: 80,
        }),
      ],
      { documentType: "ALL" },
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0]?.documentType, "CRE");
    assert.equal(result.rows[0]?.fiscalDocumentNumber, "CRE-ORPHAN");
  });
});
