import { type ReactNode, useMemo, useState } from "react";
import {
  Ban,
  BedDouble,
  ClipboardCheck,
  History,
  LockKeyhole,
  Play,
  Settings2,
  X,
} from "lucide-react";

import type {
  RoomBoardBlockRow,
  RoomBoardOccupancyRow,
} from "@/packages/pms/lib/room-board.functions";
import type { RoomInventoryEvent } from "@/packages/pms/lib/room-inventory.functions";
import type { HotelRoom, RoomType } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { ROOM_STATE_LABELS, roomBoardPrimaryState, roomStateClasses } from "./room-board-utils";
import { dateLabel } from "./room-inventory-utils";

type DetailTab = "overview" | "notes" | "history";

export function RoomDetailPanel({
  room,
  roomType,
  occupancy,
  block,
  events,
  canManageRestrictions,
  onClose,
  onInspect,
  onOpenBlocks,
  onSetRestriction,
}: {
  room: HotelRoom;
  roomType?: RoomType | undefined;
  occupancy?: RoomBoardOccupancyRow | undefined;
  block?: RoomBoardBlockRow | undefined;
  events: RoomInventoryEvent[];
  canManageRestrictions: boolean;
  onClose?: () => void;
  onInspect: () => void;
  onOpenBlocks: () => void;
  onSetRestriction: (status: "available" | "out_of_order" | "out_of_service") => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const state = roomBoardPrimaryState(room, occupancy, block);
  const roomEvents = useMemo(
    () => events.filter((event) => event.roomId === room.id),
    [events, room.id],
  );
  const latestRestrictionEvent = roomEvents.find((event) =>
    event.eventType.toLowerCase().includes("restriction"),
  );
  const bedConfiguration = roomType?.beds.length
    ? roomType.beds
        .map((bed) => `${bed.numberOfBeds} ${bed.bedSize ? `${bed.bedSize} ` : ""}${bed.bedType}`)
        .join(", ")
    : roomType?.bedType
      ? `${roomType.bedCount ?? "—"} ${roomType.bedType}`
      : "—";

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card" aria-label={`Room ${room.roomNumber}`}>
      <div className="border-b border-border px-4 pb-0 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Room {room.roomNumber}</h3>
            <p className="text-xs text-muted-foreground">
              {room.roomTypeName || "Room type not set"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2 py-1 text-[11px] font-medium ${roomStateClasses(state)}`}
            >
              {ROOM_STATE_LABELS[state]}
            </span>
            {onClose ? (
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close room details"
                onClick={onClose}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex gap-5">
          {(["overview", "notes", "history"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`border-b-2 pb-2 text-xs font-medium capitalize ${
                tab === item
                  ? "border-[#C89933] text-[#6B4A0A]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" ? (
          <div className="space-y-5">
            <DetailSection title="Status">
              <div className="grid grid-cols-3 gap-2">
                <StatusBox
                  label="Operational"
                  value={!room.active ? "Inactive" : room.status.replaceAll("_", " ")}
                  tone={
                    state === "out_of_order" || state === "out_of_service" ? "danger" : "success"
                  }
                />
                <StatusBox
                  label="Housekeeping"
                  value={room.housekeepingStatus?.replaceAll("_", " ") ?? "N/A"}
                  tone={room.housekeepingStatus === "dirty" ? "warning" : "neutral"}
                />
                <StatusBox
                  label="Maintenance"
                  value={room.maintenanceStatus.replaceAll("_", " ")}
                  tone={room.maintenanceStatus === "normal" ? "success" : "danger"}
                />
              </div>
            </DetailSection>

            <DetailSection
              title="Room Information"
              action={
                <Button asChild variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                  <a href="/restaurant/settings#rooms-inventory">Manage Configuration</a>
                </Button>
              }
            >
              <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-xs">
                <Info label="Room Number" value={room.roomNumber} />
                <Info label="Room Type" value={room.roomTypeName} />
                <Info label="Building" value={room.building} />
                <Info label="Floor" value={room.floor} />
                <Info label="Max Occupancy" value={roomType?.maxOccupancy} />
                <Info label="Bed Configuration" value={bedConfiguration} />
                <Info label="Room Size" value={roomType?.roomSize} />
                <Info
                  label="Room Features"
                  value={room.roomFeatures.length ? room.roomFeatures.join(", ") : null}
                />
              </dl>
            </DetailSection>

            <DetailSection title="Current Information">
              {room.restrictionReason || room.restrictionExpectedReturn || block ? (
                <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-xs">
                  <Info label="Reason" value={room.restrictionReason ?? block?.reason} />
                  <Info
                    label="Since"
                    value={
                      latestRestrictionEvent
                        ? new Date(latestRestrictionEvent.createdAt).toLocaleString()
                        : null
                    }
                  />
                  <Info
                    label="Estimated Return"
                    value={dateLabel(room.restrictionExpectedReturn)}
                  />
                  <Info
                    label="Reported By"
                    value={
                      latestRestrictionEvent
                        ? `${latestRestrictionEvent.actorMembershipId.slice(0, 8)}…`
                        : null
                    }
                  />
                </dl>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No current operational restriction context.
                </p>
              )}
            </DetailSection>

            <DetailSection title="Actions">
              <div className="grid grid-cols-2 gap-2">
                <DisabledAction
                  label="Change Status"
                  explanation="Generic status changes are not supported. Use the canonical restriction actions."
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={onOpenBlocks}
                >
                  <LockKeyhole className="mr-2 size-3.5" /> Block Room
                </Button>
                <ActionWithPermission
                  allowed={canManageRestrictions}
                  label="Set OOS / OOO"
                  explanation="Restriction changes require manager access."
                  icon={<Ban className="mr-2 size-3.5" />}
                  onClick={() => onSetRestriction("out_of_order")}
                />
                <ActionWithPermission
                  allowed={canManageRestrictions && room.status !== "available"}
                  label="Return to Service"
                  explanation={
                    canManageRestrictions
                      ? "This room is already available."
                      : "Returning a room to service requires manager access."
                  }
                  icon={<Play className="mr-2 size-3.5" />}
                  onClick={() => onSetRestriction("available")}
                />
                <Button asChild variant="outline" size="sm" className="justify-start text-xs">
                  <a href="/restaurant/settings#rooms-inventory">
                    <Settings2 className="mr-2 size-3.5" /> Configuration
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => setTab("history")}
                >
                  <History className="mr-2 size-3.5" /> View History
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="col-span-2 justify-start text-xs"
                  onClick={onInspect}
                >
                  <ClipboardCheck className="mr-2 size-3.5" /> Inspect Assignment
                </Button>
              </div>
            </DetailSection>
          </div>
        ) : null}

        {tab === "notes" ? (
          room.notes ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm leading-6">
              {room.notes}
            </div>
          ) : (
            <EmptyTab
              icon={<BedDouble className="size-5" />}
              title="No room notes"
              description="Room notes remain read-only in this operational workspace."
            />
          )
        ) : null}

        {tab === "history" ? (
          roomEvents.length ? (
            <div className="space-y-3">
              {roomEvents.map((event) => (
                <div key={event.id} className="border-l-2 border-[#C89933]/50 pl-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium capitalize">
                      {event.eventType.replaceAll("_", " ")}
                    </p>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {event.previousValues || event.newValues ? (
                    <p className="mt-1 break-words text-[11px] text-muted-foreground">
                      {event.previousValues ?? "—"} → {event.newValues ?? "—"}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Actor {event.actorMembershipId.slice(0, 8)}…
                    {event.notes ? ` · ${event.notes}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyTab
              icon={<History className="size-5" />}
              title="No room history"
              description="Canonical Room & Inventory events for this room will appear here."
            />
          )
        ) : null}
      </div>
    </aside>
  );
}

function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatusBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const dot = {
    success: "bg-emerald-600",
    warning: "bg-amber-500",
    danger: "bg-red-600",
    neutral: "bg-slate-400",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-medium capitalize">
        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </>
  );
}

function DisabledAction({ label, explanation }: { label: string; explanation: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button disabled variant="outline" size="sm" className="w-full justify-start text-xs">
            <BedDouble className="mr-2 size-3.5" />
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

function ActionWithPermission({
  allowed,
  label,
  explanation,
  icon,
  onClick,
}: {
  allowed: boolean;
  label: string;
  explanation: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  if (allowed)
    return (
      <Button variant="outline" size="sm" className="justify-start text-xs" onClick={onClick}>
        {icon}
        {label}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button disabled variant="outline" size="sm" className="w-full justify-start text-xs">
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}

function EmptyTab({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
      <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5">{description}</p>
    </div>
  );
}
