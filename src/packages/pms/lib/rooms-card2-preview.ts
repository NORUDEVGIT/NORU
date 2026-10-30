/**
 * Bulk room preview classification for Card 2 wizard.
 * AVAILABLE / CONFLICT / EXCLUDED — conflicts are never silently skipped.
 */

export type BulkPreviewStatus = "AVAILABLE" | "CONFLICT" | "EXCLUDED";

export type BulkPreviewExistingRoom = {
  roomNumber: string;
  roomCode?: string | null;
  roomTypeName?: string | null;
  building?: string | null;
  floor?: string | null;
};

export type BulkPreviewItem = {
  roomNumber: string;
  roomCode: string;
  status: BulkPreviewStatus;
  conflict?: {
    roomNumber: string;
    roomTypeName?: string | null;
    building?: string | null;
    floor?: string | null;
  };
};

export type BulkPreviewSummary = {
  generated: number;
  ready: number;
  excluded: number;
  conflicts: number;
};

export function classifyBulkRoomPreview(input: {
  labels: { roomNumber: string; roomCode: string }[];
  existing: BulkPreviewExistingRoom[];
  excludedNumbers: string[];
}): { items: BulkPreviewItem[]; summary: BulkPreviewSummary } {
  const excluded = new Set(input.excludedNumbers.map((n) => n.trim()).filter(Boolean));
  const byNumber = new Map<string, BulkPreviewExistingRoom>();
  const byCode = new Map<string, BulkPreviewExistingRoom>();
  for (const row of input.existing) {
    byNumber.set(row.roomNumber, row);
    const code = (row.roomCode ?? "").trim();
    if (code) byCode.set(code, row);
  }

  const items: BulkPreviewItem[] = input.labels.map((label) => {
    if (excluded.has(label.roomNumber)) {
      return { roomNumber: label.roomNumber, roomCode: label.roomCode, status: "EXCLUDED" };
    }
    const hit = byNumber.get(label.roomNumber) ?? byCode.get(label.roomCode);
    if (hit) {
      return {
        roomNumber: label.roomNumber,
        roomCode: label.roomCode,
        status: "CONFLICT",
        conflict: {
          roomNumber: hit.roomNumber,
          roomTypeName: hit.roomTypeName ?? null,
          building: hit.building ?? null,
          floor: hit.floor ?? null,
        },
      };
    }
    return { roomNumber: label.roomNumber, roomCode: label.roomCode, status: "AVAILABLE" };
  });

  const summary: BulkPreviewSummary = {
    generated: items.length,
    ready: items.filter((i) => i.status === "AVAILABLE").length,
    excluded: items.filter((i) => i.status === "EXCLUDED").length,
    conflicts: items.filter((i) => i.status === "CONFLICT").length,
  };
  return { items, summary };
}

export function bulkPreviewBlocksCreate(summary: BulkPreviewSummary): boolean {
  return summary.conflicts > 0 || summary.ready < 1;
}
