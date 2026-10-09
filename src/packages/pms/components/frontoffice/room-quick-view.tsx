import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BedDouble, History, ImageIcon, Wrench } from "lucide-react";

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
  FO_ROOM_QV_ACTIVITY_PAGE_SIZE,
  FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS,
  FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS,
  FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS,
  formatFoRoomHistoryTableRow,
  foRoomQuickViewHousekeepingLabel,
  foRoomQuickViewLayoutMode,
  foRoomQuickViewMaintenanceLabel,
  foRoomQuickViewQuickActionVisibility,
  foRoomQuickViewSellableLabel,
  foRoomQuickViewStatusPill,
  paginateFoRoomHistory,
  HK_HREF,
  INVENTORY_HREF,
  MAINTENANCE_HREF,
  ROOM_OPS_HISTORY_EVENTS,
  type FoRoomHistoryRow,
  type FoRoomQuickView,
  type FoRoomQuickViewQuickActionKey,
  type FoRoomStaySnippet,
  type RoomOpsQueueItem,
} from "@/packages/pms/lib/front-office-room-operations";
import {
  getFrontOfficeRoomHistory,
  getFrontOfficeRoomOperationsQueue,
  getFrontOfficeRoomQuickView,
} from "@/packages/pms/lib/front-office-room-operations.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { rackFloorSecondaryLabel } from "@/packages/pms/lib/front-office-shell";

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
  | "view_history"
  | "edit_room"
  | "view_profile"
  | "edit_stay"
  | "view_folio"
  | "view_all_requests"
  | "extend_stay"
  | "add_guest"
  | "guest_services"
  | "view_reservation"
  | "open_folio"
  | "add_note"
  | "change_room";

export function stayFromRoomSnippet(
  stay: FoRoomStaySnippet,
  room: { roomId: string; roomNumber: string; roomTypeId: string; roomTypeName: string },
): FrontOfficeStay {
  const nights =
    stay.nights ??
    Math.max(
      0,
      Math.round(
        (Date.parse(`${stay.departureDate}T00:00:00Z`) -
          Date.parse(`${stay.arrivalDate}T00:00:00Z`)) /
          86_400_000,
      ),
    );
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
    adults: stay.adults ?? 1,
    children: stay.children ?? 0,
    status: stay.status,
    specialRequests: stay.specialRequests,
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
  onAction: (
    action: RoomQuickViewAction,
    stay: FrontOfficeStay | null,
    view: FoRoomQuickView,
  ) => void;
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
        className={cn(
          "flex w-full flex-col gap-0 overflow-hidden p-0",
          FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS,
        )}
        data-testid="fo-room-quick-view"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Room Quick View</SheetTitle>
          <SheetDescription>
            Operational room context from the rack. Stay bars open the stay sheet.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : query.error ? (
            <p className="p-4 text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Could not load this room."}
            </p>
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
        </div>
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
  const layoutMode = foRoomQuickViewLayoutMode(view);
  const actionVisible = foRoomQuickViewQuickActionVisibility({
    hints,
    layoutMode,
    inHouseGuest: view.inHouseGuest,
    folio: view.folio,
  });
  const statusPill = foRoomQuickViewStatusPill(view);
  const floorLabel = rackFloorSecondaryLabel(view.floor);
  const secondaryParts = [view.roomTypeName, view.building?.trim(), floorLabel].filter(Boolean);
  const [activityPage, setActivityPage] = useState(1);

  useEffect(() => {
    setActivityPage(1);
  }, [view.roomId]);

  const requestLines = useMemo(() => {
    const lines: string[] = [];
    if (view.specialRequests.reservationText) lines.push(view.specialRequests.reservationText);
    if (view.specialRequests.guestPreferencesText)
      lines.push(view.specialRequests.guestPreferencesText);
    return lines;
  }, [view.specialRequests]);

  const activityPageData = useMemo(
    () => paginateFoRoomHistory(view.recentHistory, activityPage, FO_ROOM_QV_ACTIVITY_PAGE_SIZE),
    [view.recentHistory, activityPage],
  );

  const roomInfoCard = (
    <InfoCard
      title="Room Information"
      actionLabel="Edit"
      onAction={() => onAction("edit_room")}
      testId="fo-room-qv-room-info"
    >
      <FieldGrid
        rows={[
          ["Room type", view.roomTypeName],
          ["Building", view.building?.trim() || "—"],
          ["Floor", floorLabel ?? "—"],
          ["View", view.roomInfo.view ?? "—"],
          ["Size", view.roomInfo.size ?? "—"],
          ["Max occupancy", view.maxOccupancy != null ? String(view.maxOccupancy) : "—"],
          ["Bed type", view.roomInfo.bedType ?? "—"],
          [
            "Amenities",
            view.roomInfo.amenities.length > 0 ? view.roomInfo.amenities.join(", ") : "—",
          ],
        ]}
      />
    </InfoCard>
  );

  const roomStatusCard = (
    <InfoCard title="Room Status" testId="fo-room-qv-room-status">
      <StatusRow label="Occupancy" value={view.occupancy === "occupied" ? "Occupied" : "Vacant"} />
      <StatusRow
        label="Housekeeping"
        value={foRoomQuickViewHousekeepingLabel(view.housekeepingStatus)}
      />
      <StatusRow
        label="Maintenance"
        value={foRoomQuickViewMaintenanceLabel(view.maintenanceStatus)}
      />
      <StatusRow label="Sellable" value={foRoomQuickViewSellableLabel(view)} />
    </InfoCard>
  );

  return (
    <div className="pb-6" data-testid="fo-room-qv-body">
      <header
        className="border-b border-[#DDD4C5] bg-[#FAF8F4] px-4 py-3 pr-12 sm:px-6"
        data-testid="fo-room-qv-header"
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Room
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-[#251605]">
                {view.roomNumber}
              </h2>
              <span
                className="inline-flex min-h-6 items-center rounded-full px-3 py-0.5 text-[11px] font-semibold text-white"
                style={{ backgroundColor: statusPill.color }}
                data-testid="fo-room-qv-status-pill"
              >
                {statusPill.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{secondaryParts.join(" · ")}</p>
          </div>
        </div>
      </header>

      {layoutMode === "occupied" ? (
        <div
          className={cn("grid grid-cols-1 gap-3 p-4 sm:p-5", FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS)}
          data-testid="fo-room-qv-main-grid"
        >
          <div className="flex min-w-0 flex-col gap-3">
            <RoomImageBlock imageUrl={view.roomInfo.imageUrl} roomNumber={view.roomNumber} />
            {roomInfoCard}
            {roomStatusCard}
          </div>
          <div
            className={cn("grid grid-cols-1 gap-3", FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS)}
            data-testid="fo-room-qv-right-grid"
          >
            <InfoCard
              title="Guest Information"
              compact
              actionLabel="View Profile"
              onAction={() => onAction("view_profile")}
              testId="fo-room-qv-guest"
            >
              {view.inHouseGuest ? (
                <FieldGrid
                  rows={[
                    ["Guest name", view.inHouseGuest.fullName],
                    ["Nationality", view.inHouseGuest.nationality ?? "—"],
                    ["Phone", view.inHouseGuest.phone ?? "—"],
                    ["Email", view.inHouseGuest.email ?? "—"],
                    ["Company", view.inHouseGuest.company ?? "—"],
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No in-house guest.</p>
              )}
            </InfoCard>
            <InfoCard
              title="Stay Details"
              actionLabel="Edit"
              compact
              onAction={() => onAction("edit_stay")}
              testId="fo-room-qv-stay"
            >
              {view.currentStay ? (
                <StayDetailsGrid stay={view.currentStay} />
              ) : (
                <p className="text-sm text-muted-foreground">No active stay.</p>
              )}
            </InfoCard>
            <InfoCard
              title="Folio Summary"
              actionLabel="View Folio"
              compact
              actionDisabled={!view.folio.folioId || view.folio.lane === "permission_denied"}
              onAction={() => onAction("view_folio")}
              testId="fo-room-qv-folio"
            >
              {view.folio.lane === "permission_denied" ? (
                <p className="text-sm text-muted-foreground">
                  Folio access unavailable for your role.
                </p>
              ) : view.folio.folioId ? (
                <FieldGrid
                  rows={[
                    ["Total Charges", formatMoney(view.folio.totalCharges)],
                    ["Total Payments", formatMoney(view.folio.totalPayments)],
                    ["Balance", formatMoney(view.folio.balance)],
                  ]}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No folio opened for this stay yet.</p>
              )}
            </InfoCard>
            <InfoCard
              title="Special Requests"
              actionLabel="View All"
              compact
              actionDisabled={requestLines.length === 0}
              onAction={() => onAction("view_all_requests")}
              testId="fo-room-qv-requests"
            >
              {requestLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No special requests.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {requestLines.map((line) => (
                    <li
                      key={line}
                      className="rounded-md border border-[#EEE8DC] bg-white px-2.5 py-1.5"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </InfoCard>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4 sm:p-5" data-testid="fo-room-qv-vacant-layout">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RoomImageBlock imageUrl={view.roomInfo.imageUrl} roomNumber={view.roomNumber} />
            {roomInfoCard}
          </div>
          {roomStatusCard}
          {layoutMode === "vacant_assigned" && view.assignedArrival ? (
            <InfoCard
              title="Stay Details"
              actionLabel="Edit"
              onAction={() => onAction("edit_stay")}
              testId="fo-room-qv-stay"
            >
              <StayDetailsGrid stay={view.assignedArrival} />
            </InfoCard>
          ) : null}
        </div>
      )}

      <section
        className="space-y-3 border-t border-[#EEE8DC] px-4 pt-4 sm:px-5"
        data-testid="fo-room-qv-quick-actions"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Actions
        </h3>
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          data-testid="fo-room-qv-quick-actions-grid"
        >
          <RoomQuickViewQuickActions actionVisible={actionVisible} onAction={onAction} />
        </div>
        {phone ? (
          <p className="text-xs text-muted-foreground">
            This sheet closes before a large Front Office workflow opens.
          </p>
        ) : null}
      </section>

      <section className="mt-3 px-4 pb-2 sm:px-5" data-testid="fo-room-qv-activity">
        <InfoCard title="Recent Activity" compact>
          {view.recentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent room activity.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-0 text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#EEE8DC] text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-2 font-semibold">Date / Time</th>
                      <th className="py-1.5 pr-2 font-semibold">User</th>
                      <th className="py-1.5 pr-2 font-semibold">Action</th>
                      <th className="py-1.5 font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityPageData.rows.map((row) => {
                      const cells = formatFoRoomHistoryTableRow(row);
                      return (
                        <tr
                          key={`${row.source}:${row.id}`}
                          className="border-b border-[#F5F0E8] last:border-0"
                        >
                          <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                            {cells.when}
                          </td>
                          <td className="py-1.5 pr-2">{cells.user}</td>
                          <td className="py-1.5 pr-2 capitalize">{cells.action}</td>
                          <td className="py-1.5">{cells.details}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {activityPageData.totalPages > 1 ? (
                <div
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EEE8DC] pt-2"
                  data-testid="fo-room-qv-activity-pagination"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activityPageData.page <= 1}
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {activityPageData.page} of {activityPageData.totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activityPageData.page >= activityPageData.totalPages}
                    onClick={() => setActivityPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </InfoCard>
      </section>
    </div>
  );
}

function RoomImageBlock({ imageUrl, roomNumber }: { imageUrl: string | null; roomNumber: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-[#DDD4C5] bg-[#F5F0E8]"
      data-testid="fo-room-qv-image"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Room ${roomNumber}`}
          className="aspect-[4/3] w-full object-cover"
          data-testid="fo-room-qv-cover-image"
        />
      ) : (
        <div className="flex aspect-[4/3] min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageIcon className="size-8 opacity-60" aria-hidden />
          <span className="text-xs">No room image</span>
        </div>
      )}
    </div>
  );
}

const QUICK_ACTION_LABELS: Record<
  Exclude<
    FoRoomQuickViewQuickActionKey,
    "housekeeping" | "maintenance" | "view_block" | "view_history"
  >,
  { label: string; action: RoomQuickViewAction }
> = {
  move: { label: "Room Move", action: "move" },
  change_room: { label: "Change Room", action: "change_room" },
  extend_stay: { label: "Extend Stay", action: "extend_stay" },
  add_guest: { label: "Add Guest", action: "add_guest" },
  guest_services: { label: "Guest Services", action: "guest_services" },
  view_reservation: { label: "View Reservation", action: "view_reservation" },
  open_folio: { label: "Open Folio", action: "open_folio" },
  add_note: { label: "Add Note", action: "add_note" },
  assign: { label: "Assign room", action: "assign" },
  check_in: { label: "Check-in", action: "check_in" },
  check_out: { label: "Check-out", action: "check_out" },
};

function RoomQuickViewQuickActions({
  actionVisible,
  onAction,
}: {
  actionVisible: Record<FoRoomQuickViewQuickActionKey, boolean>;
  onAction: (action: RoomQuickViewAction) => void;
}) {
  return (
    <>
      {(Object.keys(QUICK_ACTION_LABELS) as Array<keyof typeof QUICK_ACTION_LABELS>).map((key) =>
        actionVisible[key] ? (
          <QuickAction key={key} onClick={() => onAction(QUICK_ACTION_LABELS[key].action)}>
            {QUICK_ACTION_LABELS[key].label}
          </QuickAction>
        ) : null,
      )}
      {actionVisible.housekeeping ? (
        <QuickAction variant="outline" asChild>
          <Link to={HK_HREF} onClick={() => onAction("open_housekeeping")}>
            Housekeeping
          </Link>
        </QuickAction>
      ) : null}
      {actionVisible.maintenance ? (
        <QuickAction variant="outline" asChild>
          <Link to={MAINTENANCE_HREF} onClick={() => onAction("open_maintenance")}>
            <Wrench className="mr-1 size-3.5" />
            Maintenance
          </Link>
        </QuickAction>
      ) : null}
      {actionVisible.view_block ? (
        <QuickAction variant="outline" asChild>
          <Link to={INVENTORY_HREF} onClick={() => onAction("view_block")}>
            View block
          </Link>
        </QuickAction>
      ) : null}
      {actionVisible.view_history ? (
        <QuickAction variant="outline" onClick={() => onAction("view_history")}>
          <History className="mr-1 size-3.5" />
          Room history
        </QuickAction>
      ) : null}
    </>
  );
}

function InfoCard({
  title,
  actionLabel,
  actionDisabled,
  onAction,
  testId,
  compact,
  children,
}: {
  title: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  testId?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "h-full rounded-lg border border-[#DDD4C5] bg-white shadow-sm",
        compact ? "p-2.5" : "p-3",
      )}
      data-testid={testId}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#251605]">{title}</h3>
        {actionLabel && onAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-[#765719]"
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-2 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="mt-0.5 text-[#251605]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[#F5F0E8] py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize text-[#251605]">{value}</span>
    </div>
  );
}

function StayDetailsGrid({ stay }: { stay: FoRoomStaySnippet }) {
  return (
    <FieldGrid
      rows={[
        ["Reservation No.", stay.confirmationNumber],
        ["Arrival", stay.arrivalDate],
        ["Departure", stay.departureDate],
        ["Nights", stay.nights != null ? String(stay.nights) : "—"],
        [
          "Adults / Children",
          stay.adults != null || stay.children != null
            ? `${stay.adults ?? "—"} / ${stay.children ?? "—"}`
            : "—",
        ],
        ["Rate Plan", stay.ratePlanName ?? "—"],
        ["Rate", stay.rateLabel ?? "—"],
        ["Package", stay.packageName ?? "—"],
      ]}
    />
  );
}

function formatMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function QuickAction({
  children,
  disabled,
  onClick,
  variant = "default",
  asChild,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "default" | "outline";
  asChild?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      asChild={asChild}
      className={asChild ? undefined : "h-9 w-full justify-center"}
    >
      {children}
    </Button>
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
      className={cn("rounded-xl border border-[#DDD4C5] bg-white", empty ? "px-3 py-1.5" : "p-3")}
      data-testid="fo-room-ops-queue"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          className={cn("size-4", empty ? "text-muted-foreground" : "text-[#C89933]")}
        />
        <h3 className="text-sm font-semibold text-[#251605]">Room operations</h3>
        <span className="text-xs text-muted-foreground">
          {query.isLoading ? "…" : items.length}
        </span>
        {empty ? (
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            No room-operation issues on this business date.
          </p>
        ) : null}
      </div>
      {empty ? null : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Derived from live stays, HK readiness, discrepancies and inventory blocks.
          </p>
          {query.error ? (
            <p className="mt-2 text-sm text-destructive">
              {query.error instanceof Error ? query.error.message : "Queue unavailable."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {items.slice(0, 12).map((item) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  onOpenRoom={onOpenRoom}
                  onOpenStay={onOpenStay}
                />
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
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="fo-room-ops-history"
      >
        <SheetHeader>
          <SheetTitle>Room operations history</SheetTitle>
          <SheetDescription>
            Existing reservation and housekeeping history for this room. No second audit log.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
            aria-label="Filter by date"
          />
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
              <li
                key={`${row.source}:${row.id}`}
                className="rounded-lg border border-border p-2 text-sm"
              >
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
    <aside
      className={cn("rounded-xl border border-[#DDD4C5] bg-white p-3", className)}
      data-testid="fo-room-quick-view-panel"
    >
      <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#765719]">
        <BedDouble className="size-3.5" /> Room {view.roomNumber}
      </p>
    </aside>
  );
}
