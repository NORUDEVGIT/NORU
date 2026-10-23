import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { FISCAL_EXCEL_MIME } from "./fiscal-registration-export.ts";
import { FISCAL_REGISTRATION_TOO_LARGE_MESSAGE } from "./fiscal-registration-report.ts";
import {
  FISCAL_EMPTY_BODY,
  FISCAL_EMPTY_TITLE,
  FISCAL_PRINT_COLUMNS,
  FISCAL_SUMMARY_COLUMNS,
  fiscalClearedSearch,
  fiscalFilterSearch,
  fiscalReportFailure,
  fiscalReportRequest,
} from "./fiscal-registration-report-view.ts";
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

describe("Fiscal registration report screen", () => {
  const screen = read("../components/reports/fiscal-registration-report-screen.tsx");
  const workspace = read("../components/workspaces/pms-reports-workspace.tsx");

  it("replaces any placeholder with the live fiscal screen", () => {
    assert.equal(reportByCode("fiscal-registration")?.status, "LIVE");
    assert.match(workspace, /FiscalRegistrationReportScreen/);
    assert.match(screen, /getFiscalRegistrationReport/);
    assert.match(workspace, /view\.report === "fiscal-registration"/);
    assert.doesNotMatch(screen, /exceljs|jspdf|text\/csv/i);
  });

  it("defaults from/to to the house date and INV document focus", () => {
    assert.match(workspace, /next\.report === "fiscal-registration"/);
    assert.match(workspace, /filters\.documentType = "INV"/);
    const opened = fiscalFilterSearch({
      from: "2026-10-21",
      to: "2026-10-21",
      documentType: "INV",
    });
    assert.equal(opened.report, "fiscal-registration");
    assert.equal(opened.from, "2026-10-21");
    assert.equal(opened.to, "2026-10-21");
    assert.equal(opened.documentType, "INV");
    assert.equal(
      resolveReportsView(opened).kind === "row" ? resolveReportsView(opened).report : null,
      "fiscal-registration",
    );
  });

  it("writes filter URL state including mode/status and clear restores defaults", () => {
    const filtered = fiscalFilterSearch({
      from: "2026-10-01",
      to: "2026-10-21",
      documentType: "ALL",
      mode: "CREDIT",
      status: "REGISTERED",
      query: "FS-1001",
      page: 2,
      pageSize: 10,
    });
    assert.equal(filtered.documentType, "ALL");
    assert.equal(filtered.mode, "CREDIT");
    assert.equal(filtered.status, "REGISTERED");
    assert.equal(filtered.query, "FS-1001");
    assert.equal(filtered.page, 2);
    assert.equal(filtered.pageSize, 10);
    const parsed = parseReportsRouteSearch(filtered as Record<string, unknown>);
    assert.equal(
      sameReportsSearch(parsed, reportsSearch(resolveReportsView(parsed), parsed)),
      true,
    );
    const cleared = fiscalClearedSearch("2026-10-21");
    assert.deepEqual(cleared, {
      report: "fiscal-registration",
      from: "2026-10-21",
      to: "2026-10-21",
      documentType: "INV",
    });
    assert.match(screen, /fiscalClearedSearch\(businessDate\)/);
  });

  it("renders Credit, Debit, Net, Sales Receipt columns", () => {
    assert.ok(FISCAL_SUMMARY_COLUMNS.includes("Sales Receipt"));
    assert.ok(FISCAL_SUMMARY_COLUMNS.includes("Credit"));
    assert.ok(FISCAL_SUMMARY_COLUMNS.includes("Debit"));
    assert.ok(FISCAL_SUMMARY_COLUMNS.includes("Net Total"));
    assert.ok(FISCAL_PRINT_COLUMNS.includes("IRN"));
    assert.match(screen, /fiscal-summary-row/);
    assert.match(screen, /SalesReceiptCell/);
    assert.match(screen, /NoteAmount/);
    assert.match(screen, /fiscal-summary-kpis/);
  });

  it("keeps loading, empty, error, and no-access distinct", () => {
    assert.equal(FISCAL_EMPTY_TITLE, "No fiscal registrations");
    assert.match(FISCAL_EMPTY_BODY, /No fiscal registrations match/);
    assert.match(screen, /query\.isPending \? "loading"/);
    assert.match(screen, /failure === "access" \? "no-access"/);
    assert.match(screen, /fiscal-empty/);
    assert.equal(
      fiscalReportFailure(new Error("You don't have access to Cashiering for this property.")),
      "access",
    );
    assert.equal(
      fiscalReportFailure(new Error(FISCAL_REGISTRATION_TOO_LARGE_MESSAGE)),
      "too-large",
    );
    assert.equal(fiscalReportFailure(new Error("boom")), "load");
  });

  it("prints and exports with export=true and real xlsx mime", () => {
    const printed = fiscalReportRequest({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      from: "2026-10-21",
      to: "2026-10-21",
      documentType: "INV",
      mode: "ALL",
      status: "ALL",
      page: 2,
      pageSize: 25,
      exportAll: true,
      action: "print",
    });
    assert.equal(printed.export, true);
    assert.equal(printed.action, "print");
    assert.match(screen, /exportAll: true/);
    assert.match(screen, /window\.print\(\)/);
    assert.match(screen, /exportFiscalRegistrationWorkbook/);
    assert.match(screen, /claimFiscalDelivery/);
    assert.equal(
      FISCAL_EXCEL_MIME,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.doesNotMatch(screen, /text\/csv/);
  });

  it("blocks oversized export messaging and protects duplicate delivery clicks", () => {
    assert.match(screen, /FISCAL_REGISTRATION_TOO_LARGE_MESSAGE|FISCAL_EXCEL_TOO_LARGE_MESSAGE/);
    assert.match(screen, /claimFiscalDelivery/);
    assert.match(screen, /releaseFiscalDeliveryLock/);
  });
});
