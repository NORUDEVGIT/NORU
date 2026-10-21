import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import {
  claimPoliceDelivery,
  guardedPoliceRelease,
  POLICE_AUDIT_BLOCKED_MESSAGE,
  POLICE_EXCEL_COLUMNS,
  POLICE_EXCEL_SHEET,
  policeAccessSnapshot,
  policeExcelFileName,
  policeExcelUnnamedWarning,
  policeExportFilters,
  policeWorkbookRows,
  recordPoliceReportAccess,
  releasePoliceDelivery,
  releasePoliceDeliveryLock,
  releasePoliceWorkbook,
  type PoliceAccessDb,
  type PoliceSheetCell,
} from "./police-stay-export.ts";
import {
  POLICE_STAY_TOO_LARGE_MESSAGE,
  PoliceStayReportError,
  type PoliceStayReportRow,
} from "./police-stay-report.ts";
import { writePoliceStayWorkbook } from "./police-stay-workbook.server.ts";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const PASSPORT = "001234567890";
const PHONE = "+251911000000";
const EMAIL = "abebe@example.com";

describe("police stay export and audit", () => {
  it("writes one print audit and one excel audit with property, actor, filters, and count", async () => {
    const printDb = fakeAccessDb();
    await recordPoliceReportAccess(printDb.db, {
      restaurantId: RESTAURANT,
      membershipId: MEMBERSHIP,
      userId: USER,
      action: "print",
      filters: {
        stayDate: "2026-10-20",
        presence: "IN_HOUSE",
        name: "Abebe",
        nationality: "Ethiopian",
        room: "0201",
      },
      rowCount: 12,
    });
    const excelDb = fakeAccessDb();
    await recordPoliceReportAccess(excelDb.db, {
      restaurantId: RESTAURANT,
      membershipId: MEMBERSHIP,
      userId: USER,
      action: "excel_export",
      filters: { stayDate: "2026-10-20", presence: "HISTORICAL", room: "0201" },
      rowCount: 3,
    });
    assert.equal(printDb.rows.length, 1);
    assert.equal(excelDb.rows.length, 1);
    assert.equal(printDb.rows[0]?.restaurant_id, RESTAURANT);
    assert.equal(printDb.rows[0]?.membership_id, MEMBERSHIP);
    assert.equal(printDb.rows[0]?.actor_user_id, USER);
    assert.equal(printDb.rows[0]?.report_code, "police");
    assert.equal(printDb.rows[0]?.action, "print");
    assert.equal(excelDb.rows[0]?.action, "excel_export");
    assert.equal(printDb.rows[0]?.row_count, 12);
    assert.deepEqual(printDb.rows[0]?.filters_snapshot, {
      stayDate: "2026-10-20",
      presence: "IN_HOUSE",
      name: "Abebe",
      nationality: "Ethiopian",
      room: "0201",
    });
    assert.equal(
      (excelDb.rows[0]?.filters_snapshot as { presence: string }).presence,
      "HISTORICAL",
    );
  });

  it("keeps passport, phone, email, and guest rows out of the audit payload", async () => {
    const captured = fakeAccessDb();
    const poisoned = {
      stayDate: "2026-10-20",
      presence: "IN_HOUSE",
      name: "Abebe",
      idDocumentNumber: PASSPORT,
      phone: PHONE,
      email: EMAIL,
      rows: [{ guestName: "Abebe Kebede", idDocumentNumber: PASSPORT }],
      guestName: "Abebe Kebede",
    };
    const snapshot = policeAccessSnapshot(poisoned);
    assert.deepEqual(Object.keys(snapshot).sort(), ["name", "presence", "stayDate"]);
    assert.equal("rows" in snapshot, false);
    await recordPoliceReportAccess(captured.db, {
      restaurantId: RESTAURANT,
      membershipId: MEMBERSHIP,
      userId: USER,
      action: "excel_export",
      filters: poisoned,
      rowCount: 1,
    });
    const encoded = JSON.stringify(captured.rows[0]);
    assert.equal(encoded.includes(PASSPORT), false);
    assert.equal(encoded.includes(PHONE), false);
    assert.equal(encoded.includes(EMAIL), false);
    assert.equal(encoded.includes("guestName"), false);
    assert.equal(encoded.includes("rows"), false);
    assert.equal(Array.isArray(captured.rows[0]?.filters_snapshot), false);
  });

  it("does not audit a failed load, an oversized report, or an unauthorized caller", async () => {
    let audits = 0;
    const audit = async () => {
      audits += 1;
    };
    await assert.rejects(
      () =>
        releasePoliceDelivery({
          exporting: true,
          load: async () => {
            throw new Error("The police stay report could not be loaded.");
          },
          audit,
        }),
      /could not be loaded/,
    );
    await assert.rejects(
      () =>
        releasePoliceWorkbook({
          load: async () => {
            throw new PoliceStayReportError(POLICE_STAY_TOO_LARGE_MESSAGE);
          },
          build: async () => "partial-file",
          audit,
        }),
      (error: Error) => error.message === POLICE_STAY_TOO_LARGE_MESSAGE,
    );
    let released = false;
    await assert.rejects(() =>
      guardedPoliceRelease({
        authorize: async () => {
          throw new Error("You don't have access to Front Office for this property.");
        },
        release: async () => {
          released = true;
          return "rows";
        },
      }),
    );
    assert.equal(audits, 0);
    assert.equal(released, false);
  });

  it("returns rows and the workbook only after the audit succeeds", async () => {
    let printAudits = 0;
    const printed = await releasePoliceDelivery({
      exporting: true,
      load: async () => ({ total: 4, rows: ["kept-on-server"] }),
      audit: async (result) => {
        printAudits += 1;
        assert.equal(result.total, 4);
      },
    });
    assert.equal(printAudits, 1);
    assert.equal(printed.total, 4);

    let screenAudits = 0;
    await releasePoliceDelivery({
      exporting: false,
      load: async () => ({ total: 4 }),
      audit: async () => {
        screenAudits += 1;
      },
    });
    assert.equal(screenAudits, 0);

    let delivered = false;
    await assert.rejects(async () => {
      const file = await releasePoliceWorkbook({
        load: async () => ({ total: 2 }),
        build: async () => "workbook-bytes",
        audit: async () => {
          throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
        },
      });
      delivered = file === "workbook-bytes";
    });
    assert.equal(delivered, false);

    const leaking: PoliceAccessDb = {
      from() {
        return {
          insert() {
            return Promise.resolve({ error: { message: `duplicate ${PASSPORT} ${EMAIL}` } });
          },
        };
      },
    };
    await assert.rejects(
      () =>
        recordPoliceReportAccess(leaking, {
          restaurantId: RESTAURANT,
          membershipId: MEMBERSHIP,
          userId: USER,
          action: "print",
          filters: { stayDate: "2026-10-20", presence: "IN_HOUSE" },
          rowCount: 1,
        }),
      (error: Error) =>
        error.message === POLICE_AUDIT_BLOCKED_MESSAGE &&
        !error.message.includes(PASSPORT) &&
        !error.message.includes(EMAIL),
    );
  });

  it("blocks a second export while the first claim is open", async () => {
    const state = { current: null as "print" | "excel" | null };
    let runs = 0;
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const first = (async () => {
      if (!claimPoliceDelivery(state, "excel")) return;
      try {
        runs += 1;
        await gate;
      } finally {
        releasePoliceDeliveryLock(state);
      }
    })();
    const second = (async () => {
      if (!claimPoliceDelivery(state, "excel")) return;
      runs += 1;
    })();
    await Promise.resolve();
    assert.equal(runs, 1);
    releaseGate();
    await Promise.all([first, second]);
    assert.equal(runs, 1);
    assert.equal(claimPoliceDelivery(state, "print"), true);
  });

  it("builds a real xlsx from the full filtered rows, with text identity and room", async () => {
    const filters = policeExportFilters({
      stayDate: "2026-10-20",
      presence: "HISTORICAL",
      name: "Abebe",
      nationality: "Ethiopian",
      room: "0201",
    });
    assert.equal(filters.export, true);
    assert.equal("page" in filters, false);
    assert.equal("pageSize" in filters, false);
    assert.equal(
      policeExcelFileName("2026-10-20", "IN_HOUSE"),
      "police-guest-stay-report-2026-10-20.xlsx",
    );
    assert.equal(
      policeExcelFileName("2026-10-20", "HISTORICAL"),
      "police-guest-stay-report-2026-10-20-historical.xlsx",
    );
    assert.equal(policeExcelFileName("../Abebe Kebede", "IN_HOUSE").includes("Abebe"), false);
    assert.match(policeExcelFileName("2026-10-20", "HISTORICAL"), /\.xlsx$/);
    assert.equal(policeExcelUnnamedWarning(0), null);

    const sheet = policeWorkbookRows({
      propertyName: "Noru Inn",
      stayDate: "2026-10-20",
      presence: "HISTORICAL",
      generatedAt: "20 Oct 2026, 15:00",
      namedGuestCount: 2,
      unnamedOccupantCount: 3,
      rows: [sampleRow(), sampleRow({ guestProfileId: "g2", guestName: "Second Guest" })],
    });
    const header = sheet.find((row) => row[0]?.kind === "text" && row[0].value === "No.");
    assert.deepEqual(
      header?.map((cell) => (cell?.kind === "text" ? cell.value : "")),
      [...POLICE_EXCEL_COLUMNS],
    );
    const data = sheet.filter((row) => row[0]?.kind === "number");
    assert.equal(data.length, 2);
    assert.equal(data[0]?.[0]?.kind === "number" ? data[0][0].value : 0, 1);
    assert.equal(data[1]?.[0]?.kind === "number" ? data[1][0].value : 0, 2);
    assert.equal(textAt(data[0], 1), "0201");
    assert.equal(cellKind(data[0], 1), "text");
    assert.equal(textAt(data[0], 3), PHONE);
    assert.equal(cellKind(data[0], 3), "text");
    assert.equal(textAt(data[0], 6), "2026-10-18");
    assert.equal(textAt(data[0], 7), "2026-10-22");
    assert.equal(cellKind(data[0], 6), "text");
    assert.equal(textAt(data[0], 8), PASSPORT);
    assert.equal(cellKind(data[0], 8), "text");
    assert.equal(
      sheet.some((row) => row.some((cell) => cell?.kind === "number" && cell.value === 2)),
      true,
    );
    assert.equal(
      sheet.some((row) =>
        row.some(
          (cell) =>
            cell?.kind === "text" &&
            cell.value === "3 booked occupants are not represented by named guest profiles.",
        ),
      ),
      true,
    );
    assert.equal(
      sheet.some((row) => row.some((cell) => cell?.kind === "text" && cell.value === "Historical")),
      true,
    );

    const bytes = await writePoliceStayWorkbook(sheet);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    assert.equal(bytes[2], 0x03);
    assert.equal(bytes[3], 0x04);
    const xml = unzipText(Buffer.from(bytes));
    assert.match(xml, /spreadsheetml/);
    assert.match(xml, new RegExp(POLICE_EXCEL_SHEET));
    assert.match(xml, new RegExp(PASSPORT));
    assert.match(xml, /\+251911000000/);
    assert.match(xml, /0201/);
    assert.equal(xml.startsWith(EMAIL), false);
    assert.equal(xml.includes("text/csv"), false);
    assert.equal((xml.match(/<sheet /g) ?? []).length, 1);
  });

  it("wires the server to audit after a successful full export and not before authorization", () => {
    const functions = readFileSync(
      new URL("./police-stay-report.functions.ts", import.meta.url),
      "utf8",
    );
    const screen = readFileSync(
      new URL("../components/reports/police-stay-report-screen.tsx", import.meta.url),
      "utf8",
    );
    assert.match(functions, /guardedPoliceRelease/);
    assert.match(functions, /releasePoliceWorkbook/);
    assert.match(functions, /"excel_export" : "print"/);
    assert.match(functions, /action: "excel_export"/);
    assert.match(functions, /policeExportFilters/);
    assert.match(functions, /supabaseAdmin/);
    assert.doesNotMatch(functions, /loadPoliceStayReport\(\s*context\.supabase/);
    assert.doesNotMatch(functions, /console\.(log|info|debug)/);
    assert.doesNotMatch(functions, /text\/csv/);
    const handler = functions.slice(functions.indexOf("export const getPoliceStayReport"));
    const authorizeAt = handler.indexOf("authorize:");
    const loadAt = handler.indexOf("loadPoliceStayReport");
    assert.ok(authorizeAt > -1 && loadAt > authorizeAt);
    const claimAt = screen.indexOf("claimPoliceDelivery");
    const excelAwait = screen.indexOf("await exportWorkbook");
    assert.ok(claimAt > -1 && excelAwait > claimAt);
    assert.match(screen, /action: "print"/);
    assert.match(screen, /policeScreenIdentity/);
    assert.doesNotMatch(screen, /maskIdNumber\(row\.idDocumentNumber\)/);
  });
});

function sampleRow(overrides: Partial<PoliceStayReportRow> = {}): PoliceStayReportRow {
  return {
    guestProfileId: "g1",
    reservationId: "r1",
    reservationRoomId: "rr1",
    guestName: "Abebe Kebede",
    firstName: "Abebe",
    middleName: null,
    lastName: "Kebede",
    phone: PHONE,
    nationality: "Ethiopian",
    email: EMAIL,
    checkInDate: "2026-10-18",
    checkOutDate: "2026-10-22",
    idDocumentType: "Passport",
    idDocumentNumber: PASSPORT,
    roomId: "room",
    roomNumber: "0201",
    roomTypeId: null,
    roomTypeName: null,
    building: null,
    floor: null,
    confirmationNumber: null,
    reservationMode: null,
    reservationSource: null,
    roomStatus: "checked_in",
    ...overrides,
  };
}

function textAt(row: PoliceSheetCell[] | undefined, index: number): string {
  const cell = row?.[index];
  return cell?.kind === "text" ? cell.value : "";
}

function cellKind(row: PoliceSheetCell[] | undefined, index: number): string {
  return row?.[index]?.kind ?? "";
}

function fakeAccessDb(): { db: PoliceAccessDb; rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    db: {
      from(table: string) {
        assert.equal(table, "pms_report_access_events");
        return {
          insert(row: Record<string, unknown>) {
            rows.push(row);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

function unzipText(buffer: Buffer): string {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const parts: string[] = [];
  let offset = directoryOffset;
  while (offset < directoryOffset + directorySize) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.endsWith(".xml") || compressedSize === 0) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const body = method === 0 ? raw : inflateRawSync(raw);
    parts.push(body.toString("utf8"));
  }
  return parts.join("\n");
}
