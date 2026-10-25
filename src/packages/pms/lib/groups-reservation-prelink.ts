import { headerGroupBlockIdFromUnits } from "./groups";
import type { GroupBlockRead } from "./groups.functions";

export type GroupReservationLaunchOrigin = {
  type: "group-detail";
  groupId: string;
  blockId: string | null;
};

export type GroupPrelinkBlock = Pick<
  GroupBlockRead,
  "id" | "roomTypeId" | "roomTypeName" | "startDate" | "endDate" | "status" | "totals"
>;

export const GROUP_ONLY_BLOCK_VALUE = "group-only";
export const GROUP_ONLY_BLOCK_LABEL = "General inventory / Group only";

export function stayFitsBlockDates(
  arrival: string,
  departure: string,
  block: Pick<GroupPrelinkBlock, "startDate" | "endDate">,
): boolean {
  return arrival >= block.startDate && departure <= block.endDate;
}

/** UI option filter. Create still runs assertGroupUnitsPickup. */
export function eligibleBlocksForUnit(input: {
  blocks: GroupPrelinkBlock[];
  roomTypeId: string | null | undefined;
  arrival: string;
  departure: string;
}): GroupPrelinkBlock[] {
  if (!input.roomTypeId) return [];
  return input.blocks.filter(
    (block) =>
      block.status === "active" &&
      block.roomTypeId === input.roomTypeId &&
      stayFitsBlockDates(input.arrival, input.departure, block),
  );
}

export function defaultBlockIdForUnit(input: {
  blocks: GroupPrelinkBlock[];
  roomTypeId: string | null | undefined;
  arrival: string;
  departure: string;
  preferredBlockId: string | null;
}): string | null {
  const eligible = eligibleBlocksForUnit(input);
  if (input.preferredBlockId && eligible.some((block) => block.id === input.preferredBlockId)) {
    return input.preferredBlockId;
  }
  return null;
}

export function headerBlockIdForCreate(unitBlockIds: Array<string | null>): string | null {
  return headerGroupBlockIdFromUnits(unitBlockIds);
}

export function unitBlockReviewCopy(input: {
  roomTypeName: string;
  blockLabel: string | null;
  contributesToPickup: boolean;
}): { block: string; pickup: string } {
  if (!input.blockLabel) {
    return { block: GROUP_ONLY_BLOCK_LABEL, pickup: "No" };
  }
  return {
    block: input.blockLabel,
    pickup: input.contributesToPickup ? "Yes" : "No",
  };
}

export function noActiveAllotmentCopy(hasActiveBlocks: boolean): string | null {
  if (hasActiveBlocks) return null;
  return "No active allotment blocks. This reservation will use general inventory unless a new allotment is created.";
}
