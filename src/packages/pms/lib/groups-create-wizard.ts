import { nightsBetween } from "./reservation-dates";
import { GROUP_TYPES, type GroupStatus, type GroupType } from "./groups";
import type { GroupRecord } from "./groups.functions";

export const GROUP_CREATE_STATUSES = ["tentative", "definite"] as const;
export type GroupCreateStatus = (typeof GROUP_CREATE_STATUSES)[number];

export const GROUP_CREATE_STEPS = [
  { id: "details", label: "Group Details", continueLabel: "Continue to Room Allotment" },
  { id: "allotment", label: "Room Allotment", continueLabel: "Continue to Review" },
  { id: "review", label: "Review", continueLabel: null },
] as const;

export const GROUP_CREATE_INVENTORY_IMPACT =
  "Creating this group will hold the reviewed room quantities for the selected dates and reduce general sellable availability.";

export const GROUP_CREATE_NO_HOLD = "No room inventory will be held.";

export const GROUP_CREATE_SUCCESS = "Group & block created successfully";

export const GB05_NON_ATOMIC_CREATE_DEBT =
  "GB05 backend debt — non-atomic group + multi-block creation";

export const GROUP_INVENTORY_BLOCK_TYPE = "group";

export const GROUP_BLOCK_NOT_AVAILABLE = "Not available for group blocks";

export const GROUP_BLOCKS_DISABLED_HELPER = "Group room blocks are not enabled for this property.";

export const GROUP_BLOCK_ELIGIBILITY_UNKNOWN =
  "Could not confirm room-block eligibility. Try again.";

export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  leisure: "Leisure",
  corporate: "Corporate",
  association: "Association",
  tour: "Tour",
  other: "Other",
};

export const GROUP_CREATE_STATUS_LABELS: Record<GroupCreateStatus, string> = {
  tentative: "Tentative",
  definite: "Definite",
};

export type GroupLeaderPick = {
  id: string;
  name: string;
};

export type GroupMasterPick = {
  id: string;
  name: string;
  code: string | null;
};

export type GroupAllotmentDraftRow = {
  key: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  allotted: number;
  cutoffDate: string;
};

export type GroupCreateDraft = {
  name: string;
  code: string;
  groupType: GroupType;
  status: GroupCreateStatus;
  arrivalDate: string;
  departureDate: string;
  cutoffDate: string;
  company: GroupMasterPick | null;
  travelAgent: GroupMasterPick | null;
  leader: GroupLeaderPick | null;
  source: string;
  marketSegment: string;
  ratePlanId: string;
  notes: string;
  allotments: GroupAllotmentDraftRow[];
};

export function emptyGroupCreateDraft(): GroupCreateDraft {
  return {
    name: "",
    code: "",
    groupType: GROUP_TYPES[0],
    status: "tentative",
    arrivalDate: "",
    departureDate: "",
    cutoffDate: "",
    company: null,
    travelAgent: null,
    leader: null,
    source: "",
    marketSegment: "",
    ratePlanId: "",
    notes: "",
    allotments: [],
  };
}

export function emptyAllotmentRow(
  arrivalDate: string,
  departureDate: string,
  key = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): GroupAllotmentDraftRow {
  return {
    key,
    roomTypeId: "",
    startDate: arrivalDate,
    endDate: departureDate,
    allotted: 1,
    cutoffDate: "",
  };
}

export function isGroupCreateStatus(value: string): value is GroupCreateStatus {
  return (GROUP_CREATE_STATUSES as readonly string[]).includes(value);
}

export function groupCreateDraftIsDirty(draft: GroupCreateDraft): boolean {
  const empty = emptyGroupCreateDraft();
  return (
    draft.name.trim() !== empty.name ||
    draft.code.trim() !== empty.code ||
    draft.groupType !== empty.groupType ||
    draft.status !== empty.status ||
    draft.arrivalDate !== empty.arrivalDate ||
    draft.departureDate !== empty.departureDate ||
    draft.cutoffDate !== empty.cutoffDate ||
    draft.company !== null ||
    draft.travelAgent !== null ||
    draft.leader !== null ||
    draft.source.trim() !== "" ||
    draft.marketSegment.trim() !== "" ||
    draft.ratePlanId !== "" ||
    draft.notes.trim() !== "" ||
    draft.allotments.length > 0
  );
}

export function groupStayIsValid(arrivalDate: string, departureDate: string): boolean {
  return Boolean(arrivalDate && departureDate && departureDate > arrivalDate);
}

export function allotmentAvailabilityRanges(
  rows: GroupAllotmentDraftRow[],
): Array<{ arrival: string; departure: string }> {
  const seen = new Set<string>();
  const ranges: Array<{ arrival: string; departure: string }> = [];
  for (const row of rows) {
    if (!groupStayIsValid(row.startDate, row.endDate)) continue;
    const key = `${row.startDate}|${row.endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranges.push({ arrival: row.startDate, departure: row.endDate });
  }
  return ranges;
}

export function blockFitsGroupWindow(input: {
  groupArrival: string;
  groupDeparture: string;
  startDate: string;
  endDate: string;
}): boolean {
  if (!groupStayIsValid(input.groupArrival, input.groupDeparture)) return false;
  if (!groupStayIsValid(input.startDate, input.endDate)) return false;
  return input.startDate >= input.groupArrival && input.endDate <= input.groupDeparture;
}

export function validateGroupCreateDetails(draft: GroupCreateDraft): string | null {
  if (!draft.name.trim()) return "Enter a group name.";
  if (!draft.arrivalDate || !draft.departureDate) return "Enter arrival and departure dates.";
  if (!groupStayIsValid(draft.arrivalDate, draft.departureDate)) {
    return "Departure must be after arrival.";
  }
  if (draft.cutoffDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.cutoffDate)) {
    return "Cut-off date must be a valid date.";
  }
  if (!isGroupCreateStatus(draft.status)) return "Choose Tentative or Definite.";
  return null;
}

export type GroupBlockPreflight =
  | { status: "unknown" }
  | {
      status: "ready";
      groupBlocksEnabled: boolean;
      quantityHoldsSupported: boolean;
      eligibleRoomTypeIds: readonly string[];
      roomTypeNames: Record<string, string>;
    };

export function readyGroupBlockPreflight(
  roomTypes: Array<{ id: string; name: string }>,
): GroupBlockPreflight {
  return groupBlockPreflightFromRules(
    [
      {
        blockType: GROUP_INVENTORY_BLOCK_TYPE,
        enabled: true,
        inventoryImpact: "remove_from_inventory",
      },
    ],
    roomTypes,
  );
}

export function groupBlockPreflightFromRules(
  blockTypes:
    Array<{ blockType: string; enabled: boolean; inventoryImpact: string }> | null | undefined,
  roomTypes: Array<{ id: string; name: string }>,
): GroupBlockPreflight {
  if (!blockTypes) return { status: "unknown" };
  const rule = blockTypes.find((row) => row.blockType === GROUP_INVENTORY_BLOCK_TYPE);
  const groupBlocksEnabled = Boolean(rule?.enabled);
  const quantityHoldsSupported = groupBlocksEnabled && rule?.inventoryImpact !== "assignment_only";
  const eligibleRoomTypeIds = quantityHoldsSupported ? roomTypes.map((type) => type.id) : [];
  return {
    status: "ready",
    groupBlocksEnabled,
    quantityHoldsSupported,
    eligibleRoomTypeIds,
    roomTypeNames: Object.fromEntries(roomTypes.map((type) => [type.id, type.name])),
  };
}

export function roomTypeCannotBeBlocked(name: string): string {
  return `${name} cannot currently be used for a room block.`;
}

export function staffFacingBlockError(message: string, roomTypeName?: string | null): string {
  const name = roomTypeName?.trim() || "This room type";
  if (/BLOCK_TYPE_DISABLED|INVALID_BLOCK_TARGET|BLOCK_POLICY_CHANGED/i.test(message)) {
    return roomTypeCannotBeBlocked(name);
  }
  return message;
}

export function isRoomTypeSelectableForBlock(
  roomTypeId: string,
  preflight: GroupBlockPreflight,
): boolean {
  if (preflight.status !== "ready") return false;
  return preflight.eligibleRoomTypeIds.includes(roomTypeId);
}

export function allotmentBlockEligibilityIssue(
  row: GroupAllotmentDraftRow,
  preflight: GroupBlockPreflight,
): string | null {
  if (!row.roomTypeId) return null;
  if (preflight.status === "unknown") return GROUP_BLOCK_ELIGIBILITY_UNKNOWN;
  const name = preflight.roomTypeNames[row.roomTypeId] ?? "This room type";
  if (
    !preflight.quantityHoldsSupported ||
    !preflight.eligibleRoomTypeIds.includes(row.roomTypeId)
  ) {
    return roomTypeCannotBeBlocked(name);
  }
  return null;
}

export function validateAllotmentRow(
  row: GroupAllotmentDraftRow,
  draft: Pick<GroupCreateDraft, "arrivalDate" | "departureDate">,
  available: number | null,
  preflight?: GroupBlockPreflight,
): string | null {
  if (!row.roomTypeId) return "Select a room type.";
  if (!row.startDate || !row.endDate) return "Enter block dates.";
  if (!groupStayIsValid(row.startDate, row.endDate))
    return "Block departure must be after arrival.";
  if (
    !blockFitsGroupWindow({
      groupArrival: draft.arrivalDate,
      groupDeparture: draft.departureDate,
      startDate: row.startDate,
      endDate: row.endDate,
    })
  ) {
    return "Block dates must fall inside the group stay window.";
  }
  if (!Number.isInteger(row.allotted) || row.allotted < 1) {
    return "Rooms blocked must be at least 1.";
  }
  if (row.allotted > 500) return "Rooms blocked cannot exceed 500.";
  if (available != null && row.allotted > available) {
    return `Only ${available} rooms are available to block for these dates.`;
  }
  if (preflight) {
    const eligibility = allotmentBlockEligibilityIssue(row, preflight);
    if (eligibility) return eligibility;
  }
  return null;
}

export function isPlaceholderAllotmentRow(
  row: GroupAllotmentDraftRow,
  draft: Pick<GroupCreateDraft, "arrivalDate" | "departureDate">,
): boolean {
  return (
    !row.roomTypeId &&
    row.allotted === 1 &&
    row.startDate === draft.arrivalDate &&
    row.endDate === draft.departureDate &&
    !row.cutoffDate
  );
}

export function allotmentsForCreate(draft: GroupCreateDraft): GroupAllotmentDraftRow[] {
  const filled = draft.allotments.filter((row) => !isPlaceholderAllotmentRow(row, draft));
  return filled;
}

export function validateAllotmentRows(
  draft: GroupCreateDraft,
  availableByRow: Record<string, number | null | undefined>,
  preflight?: GroupBlockPreflight,
): string | null {
  for (const row of allotmentsForCreate(draft)) {
    const issue = validateAllotmentRow(row, draft, availableByRow[row.key] ?? null, preflight);
    if (issue) return issue;
  }
  return null;
}

export function allotmentRoomNights(row: GroupAllotmentDraftRow): number | null {
  if (!groupStayIsValid(row.startDate, row.endDate)) return null;
  return nightsBetween(row.startDate, row.endDate) * row.allotted;
}

export function allotmentSummary(rows: GroupAllotmentDraftRow[]) {
  const types = new Set(rows.map((row) => row.roomTypeId).filter(Boolean));
  const totalQuantity = rows.reduce((sum, row) => sum + Math.max(0, row.allotted), 0);
  const nights = rows.map(allotmentRoomNights);
  const totalRoomNights = nights.every((value) => value != null)
    ? nights.reduce((sum, value) => sum + (value ?? 0), 0)
    : null;
  const cutoffs = [...new Set(rows.map((row) => row.cutoffDate).filter(Boolean))];
  return {
    roomTypes: types.size,
    totalAllotmentQuantity: totalQuantity,
    totalRoomNights,
    cutoffLabel: cutoffs.length === 0 ? "—" : cutoffs.length === 1 ? cutoffs[0]! : "Multiple",
  };
}

export function remainingAfterBlockPreview(input: {
  available: number | null;
  requested: number;
  otherLocalRequested: number;
}): number | null {
  if (input.available == null) return null;
  if (input.otherLocalRequested > 0) return null;
  return input.available - input.requested;
}

export function otherLocalRequestedForRow(
  rows: GroupAllotmentDraftRow[],
  current: GroupAllotmentDraftRow,
): number {
  return rows
    .filter(
      (row) =>
        row.key !== current.key &&
        row.roomTypeId &&
        row.roomTypeId === current.roomTypeId &&
        row.startDate === current.startDate &&
        row.endDate === current.endDate,
    )
    .reduce((sum, row) => sum + Math.max(0, row.allotted), 0);
}

export function canSelectGroupCreateStep(
  current: number,
  target: number,
  detailsValid: boolean,
): boolean {
  if (target === current) return true;
  if (target < current) return true;
  if (target === 1) return detailsValid;
  if (target === 2) return detailsValid;
  return false;
}

export type GroupCreateCommandInput = {
  restaurantId: string;
  name: string;
  code: string | null;
  groupType: GroupType;
  status: GroupStatus;
  arrivalDate: string;
  departureDate: string;
  cutoffDate: string | null;
  companyMasterId: string | null;
  travelAgentMasterId: string | null;
  leaderGuestId: string | null;
  source: string | null;
  marketSegment: string | null;
  ratePlanId: string | null;
  notes: string | null;
};

export type GroupBlockCommandInput = {
  restaurantId: string;
  groupId: string;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  allotted: number;
  cutoffDate: string | null;
};

export type FailedAllotment = {
  key: string;
  roomTypeId: string;
  message: string;
};

export type GroupCreateExecution =
  | {
      ok: true;
      group: GroupRecord;
      blockIds: string[];
      failed: FailedAllotment[];
    }
  | {
      ok: "partial";
      group: GroupRecord;
      blockIds: string[];
      failed: FailedAllotment[];
      debt: typeof GB05_NON_ATOMIC_CREATE_DEBT;
    }
  | { ok: false; message: string; group: null };

export function toGroupCreateCommand(
  restaurantId: string,
  draft: GroupCreateDraft,
): GroupCreateCommandInput {
  return {
    restaurantId,
    name: draft.name.trim(),
    code: draft.code.trim() || null,
    groupType: draft.groupType,
    status: draft.status,
    arrivalDate: draft.arrivalDate,
    departureDate: draft.departureDate,
    cutoffDate: draft.cutoffDate || null,
    companyMasterId: draft.company?.id ?? null,
    travelAgentMasterId: draft.travelAgent?.id ?? null,
    leaderGuestId: draft.leader?.id ?? null,
    source: draft.source.trim() || null,
    marketSegment: draft.marketSegment.trim() || null,
    ratePlanId: draft.ratePlanId || null,
    notes: draft.notes.trim() || null,
  };
}

export async function executeGroupBlockCreate(input: {
  restaurantId: string;
  draft: GroupCreateDraft;
  createGroup: (data: GroupCreateCommandInput) => Promise<GroupRecord>;
  addGroupBlock: (data: GroupBlockCommandInput) => Promise<{ blockId: string }>;
  preflight: GroupBlockPreflight;
}): Promise<GroupCreateExecution> {
  const detailsIssue = validateGroupCreateDetails(input.draft);
  if (detailsIssue) return { ok: false, message: detailsIssue, group: null };
  const rows = allotmentsForCreate(input.draft);
  const allotmentIssue = validateAllotmentRows(
    { ...input.draft, allotments: rows },
    {},
    input.preflight,
  );
  if (allotmentIssue && rows.length > 0) {
    return { ok: false, message: allotmentIssue, group: null };
  }

  let group: GroupRecord;
  try {
    group = await input.createGroup(toGroupCreateCommand(input.restaurantId, input.draft));
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create group.",
      group: null,
    };
  }

  const blockIds: string[] = [];
  const failed: FailedAllotment[] = [];
  for (const row of rows) {
    try {
      const created = await input.addGroupBlock({
        restaurantId: input.restaurantId,
        groupId: group.id,
        roomTypeId: row.roomTypeId,
        startDate: row.startDate,
        endDate: row.endDate,
        allotted: row.allotted,
        cutoffDate: row.cutoffDate || null,
      });
      blockIds.push(created.blockId);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Could not create room block.";
      const name =
        input.preflight.status === "ready" ? input.preflight.roomTypeNames[row.roomTypeId] : null;
      failed.push({
        key: row.key,
        roomTypeId: row.roomTypeId,
        message: staffFacingBlockError(raw, name),
      });
    }
  }

  if (failed.length === 0) {
    return { ok: true, group, blockIds, failed };
  }
  return {
    ok: "partial",
    group,
    blockIds,
    failed,
    debt: GB05_NON_ATOMIC_CREATE_DEBT,
  };
}

export function groupCreateSuccessDetail(input: {
  group: GroupRecord;
  allotmentRows: number;
  totalAllotmentQuantity: number;
}): string {
  return [
    input.group.confirmationNumber,
    input.group.name,
    GROUP_CREATE_STATUS_LABELS[input.group.status as GroupCreateStatus] ?? input.group.status,
    `${input.group.arrivalDate} → ${input.group.departureDate}`,
    `${input.allotmentRows} allotment ${input.allotmentRows === 1 ? "row" : "rows"}`,
    `${input.totalAllotmentQuantity} allotment quantity`,
  ].join(" · ");
}
