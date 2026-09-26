import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BedDouble, History, Wrench } from "lucide-react";

import { ReservationStatusBadge } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  filterRoomOpsHistory,
  HK_HREF,
  INVENTORY_HREF,
  MAINTENANCE_HREF,
  ROOM_OPS_HISTORY_EVENTS,
  vacantQuickViewHasNoStay,
  type FoRoomHistoryRow,
  type FoRoomQuickView,
  type FoRoomStaySnippet,
  type RoomOpsQueueItem,
} from "@/packages/pms/lib/front-office-room-operations";
import {
  getFrontOfficeRoomHistory,
  getFrontOfficeRoomOperationsQueue,
  getFrontOfficeRoomQuickView,
} from "@/packages/pms/lib/front-office-room-operations.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";

export type RoomQuickViewAction =
  | "assign"
  | "reassign"
  | "move"
  | "check_in"
  | "check_out"
  | "open_stay"
  | "open_housekeeping"
  | "open_maintenance"
  | "view_block"
  | "view_history";

export function stayFromRoomSnippet(
  stay: FoRoomStaySnippet,
  room: { roomId: string; roomNumber: string; roomTypeId: string; roomTypeName: string },
): FrontOfficeStay {
  const nights = Math.max(0, Math.round((Date.parse(`${stay.departureDate}T00:00:00Z`) - Date.parse(`${stay.arrivalDate}T00:00:00Z`)) / 86_400_000));
  return {
    id: stay.id,
    confirmationNumber: stay.confirmationNumber,
    guestId: stay.guestId,
    guestName: stay.guestName,
    guestVip: stay.guestVip,
    guestPhone: null,
    guestEmail: null,
    roomTypeId: room.roomTypeId,
    roomTypeName: room.roomTypeName,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    arrivalDate: stay.arrivalDate,
    departureDate: stay.departureDate,
    nights,
    adults: 1,
    children: 0,
    status: stay.status,
    specialRequests: null,
    overstay: false,
    walkInIncomplete: false,
  };
}

export function RoomQuickViewSheet({
  restaurantId,
  roomId,
  businessDate,
  hasDiscrepancy,
  open,
  phone,
  onOpenChange,
  onAction,
}: {
  restaurantId: string;
  roomId: string | null;
  businessDate: string;
  hasDiscrepancy: boolean;
  open: boolean;
  phone: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: RoomQuickViewAction, stay: FrontOfficeStay | null, view: FoRoomQuickView) => void;
}) {
  const fetchView = useServerFn(getFrontOfficeRoomQuickView);
  const query = useQuery({
    queryKey: ["fo-room-qv", restaurantId, roomId, businessDate, hasDiscrepancy],
    queryFn: () =>
      fetchView({
        data: { restaurantId, roomId: roomId as string, businessDate, hasDiscrepancy },
      }),
    enabled: open && Boolean(roomId),
    retry: false,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
        data-testid="fo-room-quick-view"
      >
        <SheetHeader>
          <SheetTitle>Room Quick View</SheetTitle>
          <SheetDescription>Room context for this rack row. Stay bars still open the stay sheet.</SheetDescription>
        </SheetHeader>
        {query.isLoading ? (
          <div className="space-y-3 p-1">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : query.error ? (
          <p className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load this room."}</p>
        ) : query.data ? (
          <RoomQuickViewBody
            view={query.data}
            phone={phone}
            onAction={(action) => {
              const stay = query.data.currentStay ?? query.data.assignedArrival;
              onAction(
                action,
                stay
                  ? stayFromRoomSnippet(stay, {
                      roomId: query.data.roomId,
                      roomNumber: query.data.roomNumber,
                      roomTypeId: query.data.roomTypeId,
                      roomTypeName: query.data.roomTypeName,
                    })
                  : null,
                query.data,
              );
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RoomQuickViewBody({
  view,
  phone,
  onAction,
}: {
  view: FoRoomQuickView;
  phone: boolean;
  onAction: (action: RoomQuickViewAction) => void;
}) {
  const hints = view.actionHints;
  return (
    <div className="space-y-4 px-1 pb-4">
      <header className="rounded-xl border border-[#DDD4C5] bg-[#FAF8F4] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Room</p>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[#251605]">{view.roomNumber}</h2>
        <p className="text-sm text-muted-foreground">
          {view.roomTypeName}
          {view.floor ? ` · Floor ${view.floor}` : ""}
          {view.building ? ` · ${view.building}` : ""}
          {view.wing ? ` · ${view.wing}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusChip label={view.occupancy} />
          <StatusChip label={view.physicalStatus.replaceAll("_", " ")} />
          {view.housekeepingStatus ? <StatusChip label={view.housekeepingStatus} /> : null}
          {view.maintenanceStatus && view.maintenanceStatus !== "normal" ? <StatusChip label={view.maintenanceStatus.replaceAll("_", " ")} /> : null}
          <StatusChip label={view.ready ? "ready" : "not ready"} />
        </div>
      </header>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current stay</h3>
        {view.currentStay && !vacantQuickViewHasNoStay(view) ? (
          <StayCard stay={view.currentStay} />
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="fo-room-qv-vacant">
            Vacant — no in-house guest.
          </p>
        )}
      </section>

      {view.assignedArrival ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assigned arrival</h3>
          <StayCard stay={view.assignedArrival} />
        </section>
      ) : null}

      {view.nextStay ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h3>
          <StayCard stay={view.nextStay} />
        </section>
      ) : null}

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness</h3>
        <p className="text-sm">{view.readinessReason ?? (view.ready ? "Ready for arrival." : "Not ready.")}</p>
        {view.restrictionReason ? <p className="mt-1 text-sm text-muted-foreground">{view.restrictionReason}</p> : null}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks / restrictions</h3>
        {view.blocks.length === 0 && view.physicalStatus === "available" ? (
          <p className="text-sm text-muted-foreground">No active inventory block on this room.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {view.physicalStatus !== "available" ? (
              <li>
                Physical status: {view.physicalStatus.replaceAll("_", " ")}
                {view.restrictionExpectedReturn ? ` · return ${view.restrictionExpectedReturn}` : ""}
              </li>
            ) : null}
            {view.blocks.map((block) => (
              <li key={block.id}>
                {block.blockType} · {block.reason} ({block.startDate} → {block.endDate})
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.recentHistory.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent history</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {view.recentHistory.slice(0, 5).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-2 rounded-lg border border-[#EEE8DC] bg-white px-2.5 py-1.5">
                <span>{row.summary}</span>
                {row.confirmationNumber ? <span className="shrink-0 text-xs text-muted-foreground">{row.confirmationNumber}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {hints.canAssign ? (
          <Button size="sm" onClick={() => onAction("assign")}>
            Assign room
          </Button>
        ) : null}
        {hints.canReassign ? (
          <Button size="sm" onClick={() => onAction("reassign")}>
            Reassign
          </Button>
        ) : null}
        {hints.canMoveGuest ? (
          <Button size="sm" onClick={() => onAction("move")}>
            Move guest
          </Button>
        ) : null}
        {hints.canCheckIn ? (
          <Button size="sm" onClick={() => onAction("check_in")}>
            Check-in
          </Button>
        ) : null}
        {hints.canCheckOut ? (
          <Button size="sm" onClick={() => onAction("check_out")}>
            Check-out
          </Button>
        ) : null}
        {hints.canOpenStay ? (
          <Button size="sm" variant="outline" onClick={() => onAction("open_stay")}>
            Open stay
          </Button>
        ) : null}
        <Button size="sm" variant="outline" asChild>
          <Link to={HK_HREF} onClick={() => onAction("open_housekeeping")}>
            Housekeeping
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to={MAINTENANCE_HREF} onClick={() => onAction("open_maintenance")}>
            <Wrench className="mr-1 size-3.5" />
            Maintenance
          </Link>
        </Button>
        {hints.hasBlock ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={INVENTORY_HREF} onClick={() => onAction("view_block")}>
              View block
            </Link>
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => onAction("view_history")}>
          <History className="mr-1 size-3.5" />
          Room history
        </Button>
      </div>
      {phone ? <p className="text-xs text-muted-foreground">This sheet closes before a large Front Office workflow opens.</p> : null}
    </div>
  );
}

function StayCard({ stay }: { stay: FoRoomStaySnippet }) {
  return (
    <div className="mt-1 rounded-lg border border-[#DDD4C5] bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{stay.guestName}</span>
        {stay.guestVip ? <VipBadge /> : null}
        <ReservationStatusBadge status={stay.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {stay.confirmationNumber} · {stay.arrivalDate} → {stay.departureDate}
      </p>
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium capitalize text-[#251605] ring-1 ring-[#DDD4C5]">
      {label}
    </span>
  );
}

export function RoomOperationsQueuePanel({
  restaurantId,
  businessDate,
  onOpenRoom,
  onOpenStay,
}: {
  restaurantId: string;
  businessDate: string;
  onOpenRoom: (roomId: string) => void;
  onOpenStay: (stayId: string) => void;
}) {
  const fetchQueue = useServerFn(getFrontOfficeRoomOperationsQueue);
  const query = useQuery({
    queryKey: ["fo-room-ops-queue", restaurantId, businessDate],
    queryFn: () => fetchQueue({ data: { restaurantId, businessDate } }),
    retry: false,
  });
  const items = query.data ?? [];
  const empty = !query.isLoading && items.length === 0;
  return (
    <section
      className={cn(
        "rounded-xl border border-[#DDD4C5] bg-white",
        empty ? "px-3 py-1.5" : "p-3",
      )}
      data-testid="fo-room-ops-queue"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className={cn("size-4", empty ? "text-muted-foreground" : "text-[#C89933]")} />
        <h3 className="text-sm font-semibold text-[#251605]">Room operations</h3>
        <span className="text-xs text-muted-foreground">{query.isLoading ? "…" : items.length}</span>
        {empty ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">No room-operation issues on this business date.</p>
        ) : null}
      </div>
      {empty ? null : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Derived from live stays, HK readiness, discrepancies and inventory blocks.
          </p>
          {query.error ? (
            <p className="mt-2 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Queue unavailable."}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {items.slice(0, 12).map((item) => (
                <QueueRow key={item.id} item={item} onOpenRoom={onOpenRoom} onOpenStay={onOpenStay} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function QueueRow({
  item,
  onOpenRoom,
  onOpenStay,
}: {
  item: RoomOpsQueueItem;
  onOpenRoom: (roomId: string) => void;
  onOpenStay: (stayId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5 text-sm">
      <span>
        <span className="font-medium">{item.label}</span>
        <span className="text-muted-foreground"> · {item.reason}</span>
      </span>
      <span className="flex gap-1">
        {item.roomId ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenRoom(item.roomId as string)}>
            Room
          </Button>
        ) : null}
        {item.stayId ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenStay(item.stayId as string)}>
            Stay
          </Button>
        ) : null}
      </span>
    </li>
  );
}

export function RoomOperationsHistorySheet({
  restaurantId,
  roomId,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  roomId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchHistory = useServerFn(getFrontOfficeRoomHistory);
  const [date, setDate] = useState("");
  const [eventType, setEventType] = useState("all");
  const query = useQuery({
    queryKey: ["fo-room-history", restaurantId, roomId],
    queryFn: () => fetchHistory({ data: { restaurantId, roomId: roomId as string, limit: 120 } }),
    enabled: open && Boolean(roomId),
    retry: false,
  });
  const rows = useMemo(
    () => filterRoomOpsHistory(query.data ?? [], { date: date || undefined, eventType }),
    [query.data, date, eventType],
  );

  useEffect(() => {
    setDate("");
    setEventType("all");
  }, [roomId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="fo-room-ops-history">
        <SheetHeader>
          <SheetTitle>Room operations history</SheetTitle>
          <SheetDescription>Existing reservation and housekeeping history for this room. No second audit log.</SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" aria-label="Filter by date" />
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {ROOM_OPS_HISTORY_EVENTS.map((event) => (
                <SelectItem key={event} value={event}>
                  {event.replaceAll("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {query.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading history…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No matching room history.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((row: FoRoomHistoryRow) => (
              <li key={`${row.source}:${row.id}`} className="rounded-lg border border-border p-2 text-sm">
                <p className="font-medium capitalize">{row.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {row.createdAt.slice(0, 16).replace("T", " ")}
                  {row.actorName ? ` · ${row.actorName}` : ""}
                  {row.confirmationNumber ? ` · ${row.confirmationNumber}` : ""}
                  {` · ${row.source}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function RoomQuickViewPanel({
  view,
  className,
}: {
  view: FoRoomQuickView | null;
  className?: string;
}) {
  if (!view) return null;
  return (
    <aside className={cn("rounded-xl border border-[#DDD4C5] bg-white p-3", className)} data-testid="fo-room-quick-view-panel">
      <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#765719]">
        <BedDouble className="size-3.5" /> Room {view.roomNumber}
      </p>
    </aside>
  );
}
