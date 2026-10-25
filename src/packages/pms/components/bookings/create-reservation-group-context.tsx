import { PMS_OP_PANEL, PMS_OP_SELECT_TRIGGER } from "@/packages/pms/lib/pms-operational-surface";
import {
  GROUP_ONLY_BLOCK_LABEL,
  GROUP_ONLY_BLOCK_VALUE,
  eligibleBlocksForUnit,
  noActiveAllotmentCopy,
  type GroupPrelinkBlock,
} from "@/packages/pms/lib/groups-reservation-prelink";
import { groupStatusLabel } from "@/packages/pms/lib/groups-detail-workspace";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { cn } from "@/shared/lib/utils";

export function CreateReservationGroupContext({
  groupName,
  groupCode,
  groupStatus,
  block,
  hasActiveBlocks,
}: {
  groupName: string;
  groupCode: string | null;
  groupStatus: string;
  block: GroupPrelinkBlock | null;
  hasActiveBlocks: boolean;
}) {
  const emptyCopy = noActiveAllotmentCopy(hasActiveBlocks);
  return (
    <section className={cn(PMS_OP_PANEL, "p-3")} data-testid="create-reservation-group-context">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Group context
      </p>
      <p className="mt-1 font-medium text-[#251605]">
        {groupName}
        {groupCode ? <span className="font-normal text-muted-foreground">{` · ${groupCode}`}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">{groupStatusLabel(groupStatus)}</p>
      {block ? (
        <p className="mt-2 text-sm text-[#251605]" data-testid="create-reservation-group-block">
          {block.roomTypeName ?? "Room type"} · {formatStayDate(block.startDate)} →{" "}
          {formatStayDate(block.endDate)}
          {` · Allotted ${block.totals.allotted} · Pickup ${block.totals.pickedUp} · Remaining ${block.totals.remaining}`}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Group-linked. No specific block selected.</p>
      )}
      {emptyCopy ? <p className="mt-2 text-xs text-muted-foreground">{emptyCopy}</p> : null}
    </section>
  );
}

export function CreateReservationUnitBlockSelect({
  label,
  roomTypeId,
  arrival,
  departure,
  blocks,
  value,
  onChange,
}: {
  label: string;
  roomTypeId: string;
  arrival: string;
  departure: string;
  blocks: GroupPrelinkBlock[];
  value: string | null;
  onChange: (blockId: string | null) => void;
}) {
  const options = eligibleBlocksForUnit({ blocks, roomTypeId, arrival, departure });
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <select
        className={cn(PMS_OP_SELECT_TRIGGER, "h-9")}
        data-testid="create-reservation-unit-block"
        value={value ?? GROUP_ONLY_BLOCK_VALUE}
        onChange={(event) =>
          onChange(event.target.value === GROUP_ONLY_BLOCK_VALUE ? null : event.target.value)
        }
      >
        <option value={GROUP_ONLY_BLOCK_VALUE}>{GROUP_ONLY_BLOCK_LABEL}</option>
        {options.map((block) => (
          <option key={block.id} value={block.id} disabled={block.totals.remaining <= 0}>
            {block.roomTypeName ?? "Block"} · {block.totals.remaining} remaining
          </option>
        ))}
      </select>
    </label>
  );
}
