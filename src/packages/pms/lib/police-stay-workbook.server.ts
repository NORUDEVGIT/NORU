/**
 * Real XLSX writer for the Police register. Uses write-excel-file.
 * Phone, room, and identity cells are String so Excel cannot drop leading zeros.
 * Dates stay YYYY-MM-DD text so a workbook opened in another timezone does not shift the stay.
 */
import writeXlsxFile from "write-excel-file/node";

import { POLICE_EXCEL_SHEET, type PoliceSheetCell } from "./police-stay-export.ts";

const COLUMN_WIDTHS = [8, 14, 28, 22, 18, 28, 16, 16, 32].map((width) => ({ width }));

export async function writePoliceStayWorkbook(rows: PoliceSheetCell[][]): Promise<Uint8Array> {
  const buffer = await writeXlsxFile(
    rows.map((row) => row.map(toCell)),
    {
      sheet: POLICE_EXCEL_SHEET,
      buffer: true,
      columns: COLUMN_WIDTHS,
    },
  );
  return new Uint8Array(buffer);
}

function toCell(cell: PoliceSheetCell) {
  if (cell.kind === "number") {
    return cell.bold
      ? { value: cell.value, type: Number, fontWeight: "bold" as const }
      : { value: cell.value, type: Number };
  }
  return cell.bold
    ? { value: cell.value, type: String, fontWeight: "bold" as const }
    : { value: cell.value, type: String };
}
