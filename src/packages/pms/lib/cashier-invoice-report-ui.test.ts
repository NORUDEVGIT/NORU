import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CASHIER_EXCEL_MIME } from "./cashier-invoice-export.ts";
import { CASHIER_INVOICE_TOO_LARGE_MESSAGE } from "./cashier-invoice-report.ts";
import {
  CASHIER_DETAIL_COLUMNS,
  CASHIER_EMPTY_BODY,
  CASHIER_EMPTY_TITLE,
  CASHIER_PRINT_SUMMARY_COLUMNS,
  CASHIER_SUMMARY_COLUMNS,
  cashierClearedSearch,
  cashierFilterSearch,
  cashierReportFailure,
  cashierReportRequest,
} from "./cashier-invoice-report-view.ts";
import {
  parseReportsRouteSearch,
  reportByCode,
  reportsSearch,
  resolveReportsView,
  sameReportsSearch,
} from "./reports-shell.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Cashier invoice report screen", () => {
  const screen = read("../components/reports/cashier-invoice-report-screen.tsx");
  const workspace = read("../components/workspaces/pms-reports-workspace.tsx");

  it("replaces the Cashier placeholder with the live screen", () => {
    assert.equal(reportByCode("cashier-invoice")?.status, "LIVE");
    assert.match(workspace, /CashierInvoiceReportScreen/);
    assert.match(screen, /getCashierInvoiceReport/);
    assert.match(workspace, /view\.report === "cashier-invoice"/);
    assert.doesNotMatch(workspace, /RowReportPlaceholder/);
    assert.doesNotMatch(screen, /exceljs|jspdf|text\/csv/i);
  });

  it("defaults from/to to the house date, Summary grain, and INV", () => {
    assert.match(workspace, /filters\.from = houseDate/);
    assert.match(workspace, /filters\.to = houseDate/);
    assert.match(workspace, /filters\.documentType = "INV"/);
    const opened = cashierFilterSearch({
      from: "2026-10-21",
      to: "2026-10-21",
      documentType: "INV",
      grain: "summary",
    });
    assert.equal(opened.report, "cashier-invoice");
    assert.equal(opened.from, "2026-10-21");
    assert.equal(opened.to, "2026-10-21");
    assert.equal(opened.documentType, "INV");
    assert.equal(opened.grain, undefined);
    assert.equal(
      resolveReportsView(opened).kind === "row" ? resolveReportsView(opened).report : null,
      "cashier-invoice",
    );
  });

  it("writes filter URL state and clear restores defaults", () => {
    const filtered = cashierFilterSearch({
      from: "2026-10-01",
      to: "2026-10-21",
      grain: "detail",
      documentType: "ALL",
      query: "INV-1001",
      issuer: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      page: 2,
      pageSize: 10,
    });
    assert.equal(filtered.grain, "detail");
    assert.equal(filtered.documentType, "ALL");
    assert.equal(filtered.query, "INV-1001");
    assert.equal(filtered.issuer, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(filtered.page, 2);
    assert.equal(filtered.pageSize, 10);
    const parsed = parseReportsRouteSearch(filtered as Record<string, unknown>);
    assert.equal(
      sameReportsSearch(parsed, reportsSearch(resolveReportsView(parsed), parsed)),
      true,
    );
    const cleared = cashierClearedSearch("2026-10-21");
    assert.deepEqual(cleared, {
      report: "cashier-invoice",
      from: "2026-10-21",
      to: "2026-10-21",
      documentType: "INV",
    });
    assert.match(screen, /cashierClearedSearch\(businessDate\)/);
  });

  it("renders Summary and Detail columns and KPI strip", () => {
    assert.ok(CASHIER_SUMMARY_COLUMNS.includes("Grand Total"));
    assert.ok(CASHIER_SUMMARY_COLUMNS.includes("Credit"));
    assert.ok(CASHIER_SUMMARY_COLUMNS.includes("Debit"));
    assert.ok(CASHIER_SUMMARY_COLUMNS.includes("Net Total"));
    assert.ok(CASHIER_DETAIL_COLUMNS.includes("Line Total"));
    assert.ok(CASHIER_DETAIL_COLUMNS.includes("Credit"));
    assert.ok(CASHIER_DETAIL_COLUMNS.includes("Net Total"));
    assert.ok(CASHIER_PRINT_SUMMARY_COLUMNS.includes("Fiscal Status"));
    assert.match(screen, /cashier-summary-row/);
    assert.match(screen, /cashier-detail-row/);
    assert.match(screen, /NoteAmount/);
    assert.match(screen, /cashier-summary-kpis/);
    assert.match(screen, /documentType === "ALL"/);
    assert.match(screen, /Net Documents/);
  });

  it("keeps loading, empty, error, and no-access distinct", () => {
    assert.equal(CASHIER_EMPTY_TITLE, "No issued documents");
    assert.match(CASHIER_EMPTY_BODY, /No issued documents match/);
    assert.match(screen, /query\.isPending \? "loading"/);
    assert.match(screen, /failure === "access" \? "no-access"/);
    assert.match(screen, /cashier-empty/);
    assert.equal(
      cashierReportFailure(new Error("You don't have access to Cashiering for this property.")),
      "access",
    );
    assert.equal(cashierReportFailure(new Error(CASHIER_INVOICE_TOO_LARGE_MESSAGE)), "too-large");
    assert.equal(cashierReportFailure(new Error("boom")), "load");
  });

  it("shows fiscal status badges and Mixed payment method", () => {
    assert.match(screen, /cashier-fiscal-status/);
    assert.match(screen, /FiscalBadge/);
    assert.match(screen, /paymentMethod !== "Unpaid"/);
    assert.match(screen, /Mixed|Unpaid/);
  });

  it("prints and exports with export=true and real xlsx mime", () => {
    const printed = cashierReportRequest({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      from: "2026-10-21",
      to: "2026-10-21",
      grain: "summary",
      documentType: "INV",
      page: 2,
      pageSize: 25,
      exportAll: true,
      action: "print",
    });
    assert.equal(printed.export, true);
    assert.equal(printed.action, "print");
    assert.match(screen, /exportAll: true/);
    assert.match(screen, /window\.print\(\)/);
    assert.match(screen, /exportCashierInvoiceWorkbook/);
    assert.match(screen, /claimCashierDelivery/);
    assert.equal(
      CASHIER_EXCEL_MIME,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.doesNotMatch(screen, /text\/csv/);
  });

  it("blocks oversized export messaging and protects duplicate delivery clicks", () => {
    assert.match(screen, /CASHIER_INVOICE_TOO_LARGE_MESSAGE|CASHIER_EXCEL_TOO_LARGE_MESSAGE/);
    assert.match(screen, /claimCashierDelivery/);
    assert.match(screen, /releaseCashierDeliveryLock/);
  });
});
