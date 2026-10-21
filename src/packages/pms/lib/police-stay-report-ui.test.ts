import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { POLICE_EXCEL_MIME } from "./police-stay-export.ts";
import { POLICE_STAY_TOO_LARGE_MESSAGE } from "./police-stay-report.ts";
import {
  POLICE_EMPTY_BODY,
  POLICE_EMPTY_TITLE,
  POLICE_HISTORICAL_NOTE,
  POLICE_PRINT_COLUMNS,
  POLICE_PRINT_SHOW_ROOM,
  POLICE_SCREEN_COLUMNS,
  policeBlank,
  policeClearedSearch,
  policeFilterSearch,
  policeGeneratedLabel,
  policePresence,
  policePrintIdentity,
  policeReportFailure,
  policeReportRequest,
  policeRowNumber,
  policeScreenIdentity,
  policeUnnamedWarning,
} from "./police-stay-report-view.ts";
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

describe("Police stay report screen", () => {
  const screen = read("../components/reports/police-stay-report-screen.tsx");
  const workspace = read("../components/workspaces/pms-reports-workspace.tsx");
  const css = read("../../../styles.css");

  it("renders the live Police screen from the canonical reader", () => {
    assert.equal(reportByCode("police")?.status, "LIVE");
    assert.match(workspace, /PoliceStayReportScreen/);
    assert.match(screen, /getPoliceStayReport/);
    assert.match(workspace, /view\.report === "police"/);
    assert.match(workspace, /CashierInvoiceReportScreen/);
    assert.doesNotMatch(
      screen,
      /Unknown Guest|fo_stay_companions|guest_documents|pms_group_rooming_rows|exceljs|jspdf|text\/csv/,
    );
    assert.doesNotMatch(screen, /console\.(log|info|debug)/);
  });

  it("defaults the stay date from the property business date and presence to in house", () => {
    assert.match(workspace, /reportsReaderDate\(businessDate\)/);
    assert.doesNotMatch(workspace, /propertyToday|new Date\(\)/);
    assert.equal(policePresence(undefined), "IN_HOUSE");
    const opened = policeFilterSearch({ stayDate: "2026-10-20", presence: "IN_HOUSE" });
    assert.equal(opened.report, "police");
    assert.equal(opened.stayDate, "2026-10-20");
    assert.equal(opened.presence, undefined);
    const again = resolveReportsView(opened);
    assert.equal(again.kind === "row" ? again.report : null, "police");
  });

  it("numbers rows for the current page and the full print", () => {
    assert.equal(policeRowNumber(1, 25, 0), 1);
    assert.equal(policeRowNumber(1, 25, 24), 25);
    assert.equal(policeRowNumber(2, 25, 0), 26);
    assert.equal(policeRowNumber(2, 10, 3), 14);
    assert.match(screen, /policeRowNumber\(result\.page, result\.pageSize, index\)/);
    assert.match(screen, /policeRowNumber\(1,/);
  });

  it("shows room on screen and keeps it out of the official print", () => {
    assert.equal(POLICE_SCREEN_COLUMNS.includes("Room"), true);
    assert.equal((POLICE_PRINT_COLUMNS as readonly string[]).includes("Room"), false);
    assert.equal(POLICE_PRINT_SHOW_ROOM, false);
    assert.match(screen, /data-testid="police-screen-room"/);
    assert.match(screen, /POLICE_PRINT_COLUMNS/);
  });

  it("renders a dash for missing values and masks identity on screen", () => {
    assert.equal(policeBlank(null), "—");
    assert.equal(policeBlank("  "), "—");
    assert.equal(policeBlank("null"), "—");
    assert.equal(policeBlank("N/A"), "—");
    assert.equal(policeBlank("Abebe"), "Abebe");
    assert.equal(policeScreenIdentity("AB123456"), "•••• 3456");
    assert.equal(policePrintIdentity("AB123456"), "AB123456");
    assert.match(screen, /policeScreenIdentity/);
    assert.match(screen, /policeBlank\(row\.guestName\)/);
  });

  it("keeps the unnamed warning independent of the guest-name filter", () => {
    assert.match(
      policeUnnamedWarning(2) ?? "",
      /2 booked occupants do not have named guest profiles/,
    );
    assert.match(policeUnnamedWarning(1) ?? "", /1 booked occupant does not/);
    assert.equal(policeUnnamedWarning(0), null);
    assert.match(screen, /result\.summary\.unnamedOccupantCount/);
    assert.match(screen, /police-unnamed-warning/);
    assert.doesNotMatch(screen, /Unknown Guest/);
  });

  it("writes filters into the URL and clear restores the house-date defaults", () => {
    const dated = policeFilterSearch({ stayDate: "2026-10-21", presence: "IN_HOUSE", page: 1 });
    assert.equal(dated.stayDate, "2026-10-21");
    assert.equal(dated.page, undefined);
    const historical = policeFilterSearch({
      stayDate: "2026-10-20",
      presence: "HISTORICAL",
      name: "Abebe",
      nationality: "Ethiopian",
      room: "201",
      page: 2,
      pageSize: 10,
    });
    assert.equal(historical.presence, "HISTORICAL");
    assert.equal(historical.name, "Abebe");
    assert.equal(historical.nationality, "Ethiopian");
    assert.equal(historical.room, "201");
    assert.equal(historical.page, 2);
    assert.equal(historical.pageSize, 10);
    const parsed = parseReportsRouteSearch({
      report: "police",
      stayDate: "2026-10-20",
      presence: "HISTORICAL",
      name: "Abebe Kebede",
      nationality: "Ethiopian",
      room: "201",
      page: "2",
      pageSize: "10",
    });
    assert.equal(
      sameReportsSearch(parsed, reportsSearch(resolveReportsView(parsed), parsed)),
      true,
    );
    const cleared = policeClearedSearch("2026-10-20");
    assert.deepEqual(cleared, { report: "police", stayDate: "2026-10-20" });
    assert.match(screen, /policeClearedSearch\(businessDate\)/);
    assert.match(screen, /setTimeout\(\(\) => onCommit\(draft\.trim\(\)\), 300\)/);
  });

  it("separates loading, empty, error, and no-access", () => {
    assert.equal(POLICE_EMPTY_TITLE, "No matching guests");
    assert.match(POLICE_EMPTY_BODY, /No named guests match/);
    assert.match(screen, /query\.isPending \? "loading"/);
    assert.match(screen, /failure === "access" \? "no-access"/);
    assert.match(screen, /police-empty/);
    assert.match(screen, /phase === "ready"/);
    assert.equal(
      policeReportFailure(new Error("You don't have access to Front Office for this property.")),
      "access",
    );
    assert.equal(
      policeReportFailure(new Error("The police stay report could not be loaded.")),
      "load",
    );
    assert.equal(policeReportFailure(new Error(POLICE_STAY_TOO_LARGE_MESSAGE)), "too-large");
  });

  it("shows the historical limitation and prints the full filtered export", () => {
    assert.match(POLICE_HISTORICAL_NOTE, /Early departures may not be reflected/);
    assert.match(screen, /police-historical-note/);
    assert.match(screen, /Historical Stay Register/);
    const printed = policeReportRequest({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      stayDate: "2026-10-20",
      presence: "HISTORICAL",
      name: "Abebe",
      nationality: "Ethiopian",
      room: "201",
      page: 2,
      pageSize: 25,
      exportAll: true,
    });
    assert.equal(printed.export, true);
    assert.equal(printed.action, "print");
    assert.equal(printed.name, "Abebe");
    assert.equal(printed.room, "201");
    const screenRequest = policeReportRequest({
      restaurantId: printed.restaurantId,
      stayDate: printed.stayDate,
      presence: "IN_HOUSE",
      page: 2,
      pageSize: 25,
      exportAll: false,
    });
    assert.equal("export" in screenRequest, false);
    assert.match(screen, /exportAll: true/);
    assert.match(screen, /printState\.result/);
    assert.match(screen, /window\.print\(\)/);
    assert.match(screen, /afterprint/);
    assert.doesNotMatch(screen, /localStorage|sessionStorage/);
  });

  it("hides app chrome in print, uses official columns, and does not truncate an oversized print", () => {
    assert.match(css, /report-print-hide/);
    assert.match(css, /fo-top-command/);
    assert.match(css, /pms-module-nav/);
    assert.match(css, /reports-desk-header/);
    assert.match(css, /report-print-only/);
    assert.match(css, /table-header-group/);
    assert.match(screen, /report-print-only/);
    assert.match(screen, /report-print-hide/);
    assert.deepEqual(POLICE_PRINT_COLUMNS, [
      "No.",
      "Guest Name",
      "Guest Phone Number",
      "Guest Nationality",
      "Guest Email",
      "Check-In Date",
      "Check-Out Date",
      "Passport / National ID Number",
    ]);
    assert.match(screen, /POLICE_STAY_TOO_LARGE_MESSAGE/);
    assert.match(screen, /POLICE_PRINT_PREPARE_MESSAGE/);
    assert.match(screen, /policeScreenIdentity/);
    assert.equal(reportByCode("police")?.supportsExcel, true);
    assert.match(screen, /exportPoliceStayWorkbook/);
    assert.match(screen, /POLICE_EXCEL_MIME/);
    assert.equal(
      POLICE_EXCEL_MIME,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.doesNotMatch(screen, /text\/csv|exceljs|jspdf/);
    const menu = read("../components/reports/report-export-menu.tsx");
    assert.match(menu, /Coming in next phase/);
    assert.match(menu, /Print \/ Save as PDF/);
  });

  it("formats the generated time in the property timezone", () => {
    const label = policeGeneratedLabel("2026-10-20T12:00:00.000Z", "Africa/Addis_Ababa");
    assert.match(label, /2026/);
    assert.doesNotMatch(label, /UTC/);
  });
});
