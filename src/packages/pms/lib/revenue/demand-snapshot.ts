/**
 * OTB snapshot types and insert mapping (RR-P4-01).
 *
 * Grain: restaurant × as_of_business_date × stay_date × room_type.
 * These are OTB snapshots, not forecast snapshots. No YoY pace. No backfill.
 */

import { z } from "zod";
import type { DemandCellMetrics, DemandWorkspace } from "./demand";

export const otbSnapshotQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  asOfFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  asOfTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stayFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stayTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  roomTypeId: z.string().uuid().nullable().optional(),
});

export type OtbSnapshotQuery = z.infer<typeof otbSnapshotQuerySchema>;

export type OtbSnapshotRow = {
  restaurantId: string;
  asOfBusinessDate: string;
  stayDate: string;
  roomTypeId: string;
  roomsOnBooks: number;
  roomsAvailable: number;
  roomsRemaining: number;
  bookedRoomRevenue: number;
  currency: string;
  occupancyPercent: number;
  adr: number;
  revpar: number;
  pricedRooms: number;
  pricedShare: number;
};

export type OtbSnapshotInsert = OtbSnapshotRow;

export type OtbCaptureStatus = "captured" | "already_present" | "failed";

export type OtbCaptureResult = {
  status: OtbCaptureStatus;
  rowCount: number;
  asOfBusinessDate: string;
  stayFrom: string;
  stayTo: string;
  error?: string | null;
};

export function cellToSnapshotRow(
  restaurantId: string,
  asOfBusinessDate: string,
  currency: string,
  cell: DemandCellMetrics,
): OtbSnapshotInsert {
  return {
    restaurantId,
    asOfBusinessDate,
    stayDate: cell.date,
    roomTypeId: cell.roomTypeId,
    roomsOnBooks: cell.roomsOnBooks,
    roomsAvailable: cell.roomsAvailable,
    roomsRemaining: cell.roomsRemaining,
    bookedRoomRevenue: cell.bookedRoomRevenue,
    currency,
    occupancyPercent: cell.occupancyPercent,
    adr: cell.adr,
    revpar: cell.revpar,
    pricedRooms: cell.pricedRooms,
    pricedShare: cell.pricedShare,
  };
}

export function workspaceToSnapshotRows(
  restaurantId: string,
  workspace: DemandWorkspace,
): OtbSnapshotInsert[] {
  return workspace.dates.flatMap((row) =>
    row.roomTypes.map((cell) =>
      cellToSnapshotRow(restaurantId, workspace.asOfBusinessDate, workspace.currency, cell),
    ),
  );
}

export function snapshotToPickupMetrics(row: OtbSnapshotRow) {
  return {
    roomsOnBooks: row.roomsOnBooks,
    roomsAvailable: row.roomsAvailable,
    roomsRemaining: row.roomsRemaining,
    bookedRoomRevenue: row.bookedRoomRevenue,
    occupancyPercent: row.occupancyPercent,
    adr: row.adr,
    revpar: row.revpar,
    pricedRooms: row.pricedRooms,
    pricedShare: row.pricedShare,
  };
}
