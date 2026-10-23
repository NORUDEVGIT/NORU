import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  REPORT_CATALOGUE,
  REPORT_GROUPS,
  REPORT_SURFACE_COPY,
  STORED_REPORT_PERMISSION_CODES,
  STORED_UNUSED_REPORT_POLICY_FLAGS,
  bindReportExport,
  parseReportPage,
  parseReportPageSize,
  parseReportsRouteSearch,
  reportByCode,
  reportsSearch,
  resolveReportsView,
  rowReportCapability,
  sameReportsSearch,
} from "./reports-shell.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("RPT-01 reports foundation", () => {
  it("loads the reports route with bookmarkable search params", () => {
    const route = read("../../../routes/restaurant/pms/reports.tsx");
    assert.match(route, /\/restaurant\/pms\/reports/);
    assert.match(route, /parseReportsRouteSearch/);
    assert.match(route, /PmsReportsWorkspace/);
    assert.match(route, /hidePackageRail/);
  });

  it("keeps the five analytics readers on the desk", () => {
    const desk = read("../components/reports/reports-desk.tsx");
    assert.match(desk, /getBookingsDashboard/);
    assert.match(desk, /getCashieringDashboard/);
    assert.match(desk, /getHousekeepingDashboard/);
    assert.match(desk, /listNightAuditRuns/);
    const workspace = read("../components/workspaces/pms-reports-workspace.tsx");
    assert.match(workspace, /getRevenueOverview|RevenueOverviewTab/);
    assert.match(workspace, /ReportsDesk/);
    for (const id of ["operational", "financial", "rooms", "revenue", "management"] as const) {
      const row = reportByCode(id);
      assert.equal(row?.kind, "analytics");
      assert.equal(row?.status, "LIVE");
      assert.equal(row?.group, "analytics");
    }
  });

  it("lists Police and Cashier as live row reports", () => {
    const police = reportByCode("police");
    const cashier = reportByCode("cashier-invoice");
    assert.equal(police?.kind, "row");
    assert.equal(police?.status, "LIVE");
    assert.equal(police?.group, "guest-stay");
    assert.equal(police?.title, "Police / Guest Stay Report");
    assert.equal(police?.placeholderNote, null);
    assert.equal(police?.supportsPrint, true);
    assert.equal(cashier?.kind, "row");
    assert.equal(cashier?.status, "LIVE");
    assert.equal(cashier?.group, "financial-reports");
    assert.equal(cashier?.title, "Cashier Invoice Report");
    assert.equal(cashier?.placeholderNote, null);
    assert.equal(police?.supportsExcel, true);
    assert.equal(cashier?.supportsExcel, true);
    assert.equal(cashier?.supportsPdf, true);
    assert.equal(cashier?.supportsPrint, true);
    assert.deepEqual(
      REPORT_GROUPS.map((group) => group.id),
      ["analytics", "guest-stay", "financial-reports", "operations"],
    );
  });

  it("writes Police and Cashier selection into the URL and restores it", () => {
    const policeSearch = reportsSearch(
      resolveReportsView({ report: "police", stayDate: "2026-10-20" }),
      {
        stayDate: "2026-10-20",
      },
    );
    assert.equal(policeSearch.report, "police");
    assert.equal(policeSearch.stayDate, "2026-10-20");
    const policeAgain = resolveReportsView(policeSearch);
    assert.equal(policeAgain.kind, "row");
    assert.equal(policeAgain.kind === "row" ? policeAgain.report : null, "police");

    const cashierSearch = reportsSearch(
      resolveReportsView({
        report: "cashier",
        from: "2026-10-01",
        to: "2026-10-20",
        documentType: "INV",
      }),
      { from: "2026-10-01", to: "2026-10-20", documentType: "INV" },
    );
    assert.equal(cashierSearch.report, "cashier-invoice");
    assert.equal(cashierSearch.from, "2026-10-01");
    assert.equal(cashierSearch.to, "2026-10-20");
    assert.equal(cashierSearch.documentType, "INV");
    const cashierAgain = resolveReportsView(cashierSearch);
    assert.equal(cashierAgain.kind, "row");
    assert.equal(cashierAgain.kind === "row" ? cashierAgain.report : null, "cashier-invoice");
    assert.equal(
      sameReportsSearch(cashierSearch, reportsSearch(cashierAgain, cashierSearch)),
      true,
    );
  });

  it("handles an invalid report id without opening a live report", () => {
    const missing = resolveReportsView({ report: "not-a-report" });
    assert.equal(missing.kind, "missing");
    assert.equal(missing.kind === "missing" ? missing.requested : null, "not-a-report");
    assert.equal(reportByCode("not-a-report"), null);
    assert.equal(resolveReportsView({ report: "government" }).kind, "missing");
    assert.equal(reportByCode("police")?.status, "LIVE");
    assert.equal(reportByCode("cashier-invoice")?.status, "LIVE");
    assert.equal(reportByCode("breakfast")?.id, "meal-service");
    assert.equal(reportByCode("service-fulfillment")?.status, "LIVE");
  });

  it("parses pagination safely", () => {
    assert.equal(parseReportPage("2"), 2);
    assert.equal(parseReportPage(3), 3);
    assert.equal(parseReportPage("0"), 1);
    assert.equal(parseReportPage("-4"), 1);
    assert.equal(parseReportPage("nope"), 1);
    assert.equal(parseReportPageSize("10"), 10);
    assert.equal(parseReportPageSize("25"), 25);
    assert.equal(parseReportPageSize("50"), 50);
    assert.equal(parseReportPageSize("15"), 25);
    assert.equal(parseReportPageSize("100"), 25);
    const parsed = parseReportsRouteSearch({
      report: "police",
      page: "2",
      pageSize: "10",
      stayDate: "2026-13-40",
    });
    assert.equal(parsed.page, 2);
    assert.equal(parsed.pageSize, 10);
    assert.equal(parsed.stayDate, undefined);
    const view = resolveReportsView(parsed);
    assert.equal(view.kind, "row");
    assert.equal(view.kind === "row" ? view.page : null, 2);
    assert.equal(view.kind === "row" ? view.pageSize : null, 10);
  });

  it("keeps empty, error, and no-access copy distinct", () => {
    const states = read("../components/reports/report-states.tsx");
    assert.match(states, /REPORT_SURFACE_COPY\.emptyTitle/);
    assert.match(states, /REPORT_SURFACE_COPY\.emptyBody/);
    assert.match(states, /REPORT_SURFACE_COPY\.errorTitle/);
    assert.match(states, /REPORT_SURFACE_COPY\.errorBody/);
    assert.match(states, /REPORT_SURFACE_COPY\.noAccessTitle/);
    assert.match(states, /REPORT_SURFACE_COPY\.loading/);
    assert.match(states, /reports-state-empty/);
    assert.match(states, /reports-state-error/);
    assert.match(states, /reports-state-no-access/);
    assert.match(states, /reports-state-loading/);
    assert.notEqual(REPORT_SURFACE_COPY.emptyTitle, REPORT_SURFACE_COPY.errorTitle);
    assert.notEqual(REPORT_SURFACE_COPY.errorTitle, REPORT_SURFACE_COPY.noAccessTitle);
    const shell = read("../components/reports/report-page-shell.tsx");
    assert.match(shell, /phase === "error"/);
    assert.match(shell, /phase === "empty"/);
    assert.match(shell, /ReportNoAccessState/);
    assert.match(shell, /ReportErrorState/);
    assert.match(shell, /ReportEmptyState/);
  });

  it("disables export actions without creating a file", () => {
    const menu = read("../components/reports/report-export-menu.tsx");
    const placeholder = read("../components/reports/row-report-placeholder.tsx");
    assert.match(menu, /Not available yet/);
    assert.match(menu, /bindReportExport/);
    assert.doesNotMatch(
      menu + placeholder,
      /Blob|createObjectURL|window\.print|jspdf|xlsx|exceljs/i,
    );
    const police = reportByCode("police");
    assert.ok(police);
    assert.equal(
      bindReportExport({ reportId: "police", kind: "excel", enabled: false, run() {} }),
      null,
    );
    assert.equal(bindReportExport({ reportId: "police", kind: "pdf", enabled: true }), null);
    let ran = false;
    const action = bindReportExport({
      reportId: "cashier-invoice",
      kind: "print",
      enabled: true,
      run() {
        ran = true;
      },
    });
    action?.();
    assert.equal(ran, true);
    assert.deepEqual(rowReportCapability(police), {
      canView: true,
      canPrint: false,
      canExport: false,
    });
    assert.equal(rowReportCapability(police, { canView: false }).canView, false);
  });

  it("does not present withheld operations reports as live catalogue entries", () => {
    for (const id of ["meal-plan", "packages", "government"]) {
      assert.equal(reportByCode(id), null);
      assert.equal(
        REPORT_CATALOGUE.some((row) => row.id === id),
        false,
      );
    }
    const catalogue = read("../components/reports/reports-catalogue.tsx");
    assert.match(catalogue, /reports-group-operations/);
    assert.equal(REPORT_CATALOGUE.filter((row) => row.group === "operations").length, 2);
    assert.equal(reportByCode("meal-service")?.status, "LIVE");
    assert.equal(reportByCode("service-fulfillment")?.status, "LIVE");
  });

  it("wraps filters and export actions instead of a fixed wide bar", () => {
    const filters = read("../components/reports/report-filter-bar.tsx");
    const pagination = read("../components/reports/report-pagination.tsx");
    const page = read("../components/reports/report-page-shell.tsx");
    const catalogue = read("../components/reports/reports-catalogue.tsx");
    const joined = [filters, pagination, page, catalogue].join("\n");
    assert.match(filters, /flex-wrap/);
    assert.match(pagination, /flex-wrap/);
    assert.match(page, /flex-wrap/);
    assert.match(catalogue, /sm:grid-cols-2/);
    assert.doesNotMatch(joined, /min-w-\[\d{3,}px\]|w-\[\d{4,}px\]/);
  });

  it("documents stored policy flags the shell does not enforce", () => {
    assert.ok(STORED_UNUSED_REPORT_POLICY_FLAGS.includes("export_csv"));
    assert.ok(STORED_UNUSED_REPORT_POLICY_FLAGS.includes("export_pdf"));
    assert.ok(STORED_UNUSED_REPORT_POLICY_FLAGS.includes("mask_guest_names"));
    assert.ok(STORED_REPORT_PERMISSION_CODES.includes("reports.pms.view"));
    assert.ok(STORED_REPORT_PERMISSION_CODES.includes("reports.pms.export"));
    assert.ok(STORED_REPORT_PERMISSION_CODES.includes("reports.pms.print"));
    const shell = read("./reports-shell.ts");
    assert.match(shell, /not enforce them/);
    assert.doesNotMatch(shell, /getCard7Reports/);
  });

  it("provides a print stylesheet that hides chrome and uses landscape pages", () => {
    const css = read("../../../styles.css");
    const table = read("../components/reports/report-table-shell.tsx");
    assert.match(css, /report-print-root/);
    assert.match(css, /size:\s*A4 landscape/);
    assert.match(css, /report-print-hide/);
    assert.match(css, /fo-top-command/);
    assert.match(table, /overflow-x-auto/);
    assert.match(table, /<th/);
    assert.match(table, /report-print-table/);
    const columns = read("../components/reports/report-columns.ts");
    assert.match(columns, /tabular-nums/);
    assert.match(columns, /numeric/);
    assert.match(columns, /currency/);
  });
});
