import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildCashieringReportCsv,
  escapeCashieringCsvCell,
} from "./cashiering-phases.functions";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0131_cashiering_phase12_exceptions_reports.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0131_cashiering_phase12_exceptions_reports.sql",
    import.meta.url,
  ),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering-phases.functions.ts", import.meta.url), "utf8");
const panels = readFileSync(
  new URL("../components/cashiering/cashiering-phase-panels.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("./cashiering-shell.ts", import.meta.url), "utf8");

describe("Cashiering Phase 12 exceptions and reports", () => {
  it("derives exceptions and sums canonical ledger lines", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /list_cashiering_exceptions/);
    assert.match(sql, /cashiering_report_totals/);
    assert.match(sql, /unsettled_checkout/);
    assert.doesNotMatch(sql, /mark_resolved/);
    assert.match(poster, /listCashieringExceptions/);
    assert.match(poster, /settlement_exception/);
    assert.match(poster, /getCashieringReportTotals/);
    assert.match(poster, /propertyDayBounds/);
    assert.doesNotMatch(poster, /list_cashiering_exceptions|cashiering_report_totals/);
    assert.match(panels, /Cleared only by a real settling post/);
    assert.match(shell, /id: "exceptions"/);
    assert.match(shell, /id: "reports"/);
  });

  it("supports pagination and limit for cashiering reports", () => {
    assert.match(poster, /page: z\.coerce\.number/);
    assert.match(poster, /limit: z\.coerce\.number/);
    assert.match(poster, /totalPages/);
    assert.match(poster, /ledger\.slice\(start, start \+ limit\)/);
    assert.match(panels, /data-testid="cashiering-report-pagination"/);
    assert.match(panels, /data-testid="report-prev-page"/);
    assert.match(panels, /data-testid="report-next-page"/);
    assert.match(panels, /Rows per page limit/);
  });

  it("supports report export via CSV and print layer", () => {
    assert.match(poster, /buildCashieringReportCsv/);
    assert.match(poster, /escapeCashieringCsvCell/);
    assert.match(panels, /data-testid="report-export-trigger"/);
    assert.match(panels, /data-testid="export-csv-all"/);
    assert.match(panels, /data-testid="export-csv-page"/);
    assert.match(panels, /data-testid="export-print"/);
    assert.match(panels, /CashieringPrintLayer/);
    assert.match(panels, /data-testid="cashiering-report-print"/);
  });

  it("builds compliant CSV with formula injection defense and summary KPIs", () => {
    assert.equal(escapeCashieringCsvCell("=1+1"), "'=1+1");
    assert.equal(escapeCashieringCsvCell("+cmd"), "'+cmd");
    assert.equal(escapeCashieringCsvCell("Hello, World"), '"Hello, World"');
    assert.equal(escapeCashieringCsvCell("Regular text"), "Regular text");

    const csv = buildCashieringReportCsv({
      restaurantId: "11111111-1111-1111-1111-111111111111",
      fromDate: "2026-10-01",
      toDate: "2026-10-15",
      currencyCode: "USD",
      totals: {
        charges: 1500,
        payments: 1200,
        deposits: 300,
        refunds: 0,
        adjustments: 0,
        discounts: 50,
        transfersOut: 100,
        transfersIn: 100,
        netMovement: 300,
        lineCount: 2,
      },
      lines: [
        {
          id: "txn-1",
          folioId: "fol-1",
          folioNumber: "FOL-101",
          guestName: "Alice Smith",
          type: "charge",
          description: "Deluxe Suite, 1 Night",
          amount: 500,
          paymentMethod: null,
          postedAt: "2026-10-01T14:00:00Z",
        },
      ],
    });

    assert.match(csv, /CASHIERING TRANSACTIONS REPORT/);
    assert.match(csv, /Property ID,11111111-1111-1111-1111-111111111111/);
    assert.match(csv, /Date Range,2026-10-01 to 2026-10-15/);
    assert.match(csv, /Currency,USD/);
    assert.match(csv, /SUMMARY TOTALS/);
    assert.match(csv, /Charges,1500/);
    assert.match(csv, /Payments,1200/);
    assert.match(csv, /TRANSACTION DETAILS/);
    assert.match(csv, /Alice Smith/);
    assert.match(csv, /FOL-101/);
    assert.match(csv, /"Deluxe Suite, 1 Night"/);
  });
});
