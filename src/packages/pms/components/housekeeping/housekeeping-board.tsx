import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BedDouble,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import {
  HkShellExportButton,
  HkShellSlot,
  HkToolbarSearch,
  HkViewSwitcher,
  downloadCsv,
  HK_SHELL_ICON_BUTTON,
  HK_SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/housekeeping/housekeeping-shell-slots";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_ROW,
  ROOM_TABLE_TD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
} from "@/packages/pms/components/rooms/room-inventory-shell";
import {
  completeHousekeepingTask,
  listHousekeepingHistory,
  listInspections,
  listMaintenanceRequests,
  listHousekeepingGuestRequests,
  listRoomRack,
  updateHousekeepingTask,
  type RackRoom,
} from "@/packages/pms/lib/housekeeping.functions";
import {
  HK_BOARD_COLUMN_META,
  HK_BOARD_COLUMNS,
  HK_BOARD_FIELD_STACK_CLASS,
  HK_BOARD_LANES_DESKTOP_CLASS,
  HK_CANONICAL_PATH,
  HK_FIELD_ACTION_CLASS,
  boardColumnForRoom,
  occupancyCaption,
  type HkBoardColumn,
} from "@/packages/pms/lib/housekeeping-shell";
import { sortRoomsByHkDemand } from "@/packages/pms/lib/housekeeping-ops";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import { addDays } from "@/packages/pms/components/rooms/room-inventory-utils";
import { HK_HREF, MAINTENANCE_HREF } from "@/packages/pms/lib/front-office-room-operations";
import { PriorityBadge, formatWhen, labelTaskType } from "./housekeeping-bits";
import { NewTaskDialog } from "./housekeeping-tabs";
import type { HousekeepingScope } from "@/core/lib/module-access";

type Props = {
  restaurantId: string;
  today: string;
  businessDate: string;
  onDateChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  scope: HousekeepingScope;
  membershipId: string;
  openRoomId?: string;
  canCreateTask: boolean;
  canEditTask: boolean;
};

const BOARD_STATUS_OPTIONS = [
  ["all", "All statuses"],
  ["dirty", "Dirty"],
  ["assigned", "Assigned"],
  ["cleaning", "Cleaning"],
  ["clean", "Clean"],
  ["inspection", "Inspection"],
  ["ready", "Ready"],
  ["pickup", "Pickup"],
  ["out_of_order", "Out of order"],
] as const;

const COLUMN_STATUS_IDS = new Set<string>(HK_BOARD_COLUMNS);

const LANE_VISUAL: Record<
  HkBoardColumn,
  { icon: LucideIcon; lane: string; header: string; ink: string }
> = {
  dirty: {
    icon: Sparkles,
    lane: "bg-rose-50/90",
    header: "bg-rose-100/80",
    ink: "text-rose-800",
  },
  assigned: {
    icon: UserRound,
    lane: "bg-amber-50/90",
    header: "bg-amber-100/75",
    ink: "text-amber-900",
  },
  cleaning: {
    icon: RefreshCw,
    lane: "bg-sky-50/90",
    header: "bg-sky-100/75",
    ink: "text-sky-800",
  },
  clean: {
    icon: CheckCircle2,
    lane: "bg-emerald-50/85",
    header: "bg-emerald-100/70",
    ink: "text-emerald-800",
  },
  inspection: {
    icon: ShieldCheck,
    lane: "bg-violet-50/90",
    header: "bg-violet-100/75",
    ink: "text-violet-800",
  },
  ready: {
    icon: BedDouble,
    lane: "bg-teal-50/85",
    header: "bg-teal-100/65",
    ink: "text-teal-800",
  },
};

function displayFloorLabel(floorName: string): string {
  const normalized = floorName.trim().toLowerCase();
  if (normalized === "unassigned floor" || normalized === "no floor assigned" || normalized === "") {
    return "No floor assigned";
  }
  if (/^floor\b/i.test(floorName)) return floorName;
  return `Floor ${floorName}`;
}

function formatBoardDate(value: string): string {
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date);
  return `${weekday} ${date.getUTCDate()} ${month}`;
}

function roomMatchesStatus(room: RackRoom, status: string): boolean {
  if (status === "all") return true;
  if (status === "pickup") return room.housekeepingStatus === "pickup";
  if (status === "out_of_order") return room.restriction === "out_of_order";
  if (COLUMN_STATUS_IDS.has(status)) return boardColumnForRoom(room) === status;
  return room.housekeepingStatus === status || room.restriction === status;
}

function housekeepingStatusLabel(room: RackRoom): string {
  const column = boardColumnForRoom(room);
  if (column) return HK_BOARD_COLUMN_META[column].label;
  if (room.restriction === "out_of_order") return "Out of order";
  if (room.restriction === "out_of_service") return "Out of service";
  return "Dirty";
}

function frontOfficeReadinessLabel(room: RackRoom): string {
  if (room.occupancy === "occupied") return "In house";
  if (room.checkInReady) return "Ready";
  if (room.readyReason?.trim()) return room.readyReason.trim();
  return "Not ready";
}

function occupancyLabel(room: RackRoom): string {
  if (room.restriction === "out_of_order") return "Out of order";
  if (room.restriction === "out_of_service") return "Out of service";
  return room.occupancy === "occupied" ? "Occupied" : "Vacant";
}

function openTaskLabel(status: string | null): string {
  if (!status) return "No open task";
  if (status === "assigned") return "Assigned";
  if (status === "in_progress") return "Cleaning";
  if (status === "pending") return "Pending";
  if (status === "completed") return "Completed";
  return status.replaceAll("_", " ");
}

function roomContextChips(room: RackRoom): string[] {
  const chips: string[] = [];
  if (room.demand.arrival) chips.push("Arrival");
  if (room.demand.departure) chips.push("Departure");
  if (room.demand.stayover) chips.push("Stayover");
  if (room.demand.roomChange) chips.push("Room move");
  if (room.openTaskPriority === "high" || room.openTaskPriority === "urgent") chips.push("Priority");
  if (/\b(dnd|do not disturb)\b/i.test(room.openTaskNotes ?? "")) chips.push("DND");
  if (room.demand.vip) chips.push("VIP");
  if (room.housekeepingStatus === "pickup") chips.push("Pickup");
  return chips;
}

function invalidateHk(qc: ReturnType<typeof useQueryClient>, restaurantId: string) {
  for (const key of ["hk-dashboard", "hk-rack", "hk-tasks", "hk-inspections", "hk-discrepancies", "hk-maintenance", "hk-history", "hk-staff", "hk-requests"]) {
    void qc.invalidateQueries({ queryKey: [key, restaurantId] });
  }
  invalidateFrontOfficeOwnerReads(qc);
}

export function HousekeepingBoardTab({
  restaurantId,
  today,
  businessDate,
  onDateChange,
  status,
  onStatusChange,
  scope,
  membershipId,
  openRoomId,
  canCreateTask,
  canEditTask,
}: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchRack = useServerFn(listRoomRack);
  const fetchInspections = useServerFn(listInspections);
  const fetchMaint = useServerFn(listMaintenanceRequests);
  const isSupervisor = scope === "supervisor";

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const inspections = useQuery({
    queryKey: ["hk-inspections", restaurantId],
    queryFn: () => fetchInspections({ data: { restaurantId } }),
    enabled: isSupervisor,
  });
  const maintenance = useQuery({
    queryKey: ["hk-maintenance", restaurantId],
    queryFn: () => fetchMaint({ data: { restaurantId } }),
    enabled: scope !== "housekeeper",
  });

  const [floor, setFloor] = useState("all");
  const [attendant, setAttendant] = useState("all");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [lockedTaskRoom, setLockedTaskRoom] = useState<RackRoom | null>(null);
  const [qvRoomId, setQvRoomId] = useState<string | null>(openRoomId ?? null);

  useEffect(() => {
    if (openRoomId) setQvRoomId(openRoomId);
  }, [openRoomId]);

  const rooms = rack.data ?? [];
  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean) as string[])).sort(),
    [rooms],
  );
  const attendants = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.assignedAttendant).filter(Boolean) as string[])).sort(),
    [rooms],
  );
  const filtered = rooms.filter((r) => {
    if (floor !== "all" && r.floor !== floor) return false;
    if (attendant !== "all" && r.assignedAttendant !== attendant) return false;
    if (!roomMatchesStatus(r, status)) return false;
    if (query.trim()) {
      const hay = `${r.roomNumber} ${r.roomTypeName} ${r.guestName ?? ""} ${r.assignedAttendant ?? ""} ${roomContextChips(r).join(" ")} ${r.readyReason ?? ""} ${r.openTaskNotes ?? ""}`.toLowerCase();
      if (!hay.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const byFloor = useMemo(() => {
    const map = new Map<string, RackRoom[]>();
    for (const room of filtered) {
      const key = room.floor?.trim() || "No floor assigned";
      const list = map.get(key) ?? [];
      list.push(room);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([floorName, floorRooms]) => [floorName, sortRoomsByHkDemand(floorRooms)] as const);
  }, [filtered]);

  const qvRoom = rooms.find((r) => r.id === qvRoomId) ?? null;
  const openMaint = (maintenance.data ?? []).filter((m) => m.status !== "resolved");
  const pendingInspect = (inspections.data ?? []).filter((i) => i.status === "pending");
  const statusLabel = BOARD_STATUS_OPTIONS.find(([id]) => id === status)?.[1] ?? "";
  const narrowed =
    floor !== "all" || attendant !== "all" || status !== "all" || query.trim().length > 0;
  const filterCount = (floor !== "all" ? 1 : 0) + (attendant !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  function exportBoard() {
    downloadCsv(
      `housekeeping-board-${today}.csv`,
      ["Room", "Type", "Floor", "Status", "Occupancy", "Attendant", "Task", "Ready"],
      filtered.map((room) => [
        room.roomNumber,
        room.roomTypeName,
        room.floor ?? "",
        room.housekeepingStatus,
        occupancyCaption(room),
        room.assignedAttendant ?? "",
        room.openTaskStatus ?? "",
        room.ready ? "Ready" : "",
      ]),
    );
  }

  return (
    <div className="space-y-3" data-testid="hk-board">
      <HkShellSlot name="date">
        <HkBoardDateControl value={today} businessDate={businessDate} onChange={onDateChange} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, guest, attendant, or note…"
          testId="hk-board-search"
        />
      </HkShellSlot>
      <HkShellSlot name="filter">
        <PmsFilterMenu
          activeCount={filterCount}
          onClear={() => {
            setFloor("all");
            setAttendant("all");
            onStatusChange("all");
          }}
          buttonTestId="hk-board-filters-button"
          menuTestId="hk-board-filters-menu"
          tooltip="Filters"
        >
          <PmsFilterChoiceRow
            label="Floor"
            value={floor}
            current={floor === "all" ? "" : displayFloorLabel(floor)}
            options={[
              ["all", "All floors"],
              ...floors.map((item) => [item, displayFloorLabel(item)] as const),
            ]}
            onChange={setFloor}
          />
          <PmsFilterChoiceRow
            label="Attendant"
            value={attendant}
            current={attendant === "all" ? "" : attendant}
            options={[["all", "All attendants"], ...attendants.map((item) => [item, item] as const)]}
            onChange={setAttendant}
          />
          <PmsFilterChoiceRow
            label="Status"
            value={status}
            current={statusLabel}
            options={BOARD_STATUS_OPTIONS}
            onChange={onStatusChange}
          />
        </PmsFilterMenu>
      </HkShellSlot>
      <HkShellSlot name="export">
        <HkShellExportButton
          onClick={exportBoard}
          disabled={filtered.length === 0}
          testId="hk-board-export"
          tooltip
        />
      </HkShellSlot>
      <HkShellSlot name="view">
        <HkViewSwitcher
          value={viewMode}
          onChange={setViewMode}
          testId="hk-board-view-switcher"
          labels={{ board: "Board view", table: "List view" }}
        />
      </HkShellSlot>
      {scope === "supervisor" && canCreateTask ? (
        <HkShellSlot name="cta">
          <Button
            className={HK_SHELL_PRIMARY_BUTTON}
            onClick={() => {
              setLockedTaskRoom(null);
              setCreateTaskOpen(true);
            }}
            disabled={!rooms.length}
            data-testid="hk-create-task"
          >
            Create Task
          </Button>
        </HkShellSlot>
      ) : null}

      <BoardSummary
        total={rooms.length}
        visible={filtered.length}
        narrowed={narrowed}
        statusLabel={status !== "all" ? statusLabel : ""}
        onClearStatus={() => onStatusChange("all")}
      />

      {viewMode === "board" ? (
        <>
          <div className={HK_BOARD_LANES_DESKTOP_CLASS}>
            <div
              className="grid min-w-[1040px] grid-cols-[5.75rem_repeat(6,minmax(160px,1fr))]"
              data-testid="hk-board-lanes"
            >
              <div className="border-r border-[#E6DDD0] bg-[#EFEAE2] px-2 py-2.5">
                <p className="text-xs font-semibold text-muted-foreground">Floor</p>
              </div>
              {HK_BOARD_COLUMNS.map((col) => {
                const count = filtered.filter((r) => boardColumnForRoom(r) === col).length;
                const visual = LANE_VISUAL[col];
                const Icon = visual.icon;
                return (
                  <div
                    key={col}
                    className={cn(
                      "border-r border-black/[0.04] px-2.5 py-2 last:border-r-0",
                      visual.header,
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5 text-xs font-semibold", visual.ink)}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{HK_BOARD_COLUMN_META[col].label}</span>
                      <span className="ml-auto tabular-nums font-medium opacity-80">{count}</span>
                    </div>
                  </div>
                );
              })}
              {byFloor.map(([floorName, floorRooms]) => (
                <FloorRow
                  key={floorName}
                  floorName={floorName}
                  rooms={floorRooms}
                  onOpen={setQvRoomId}
                />
              ))}
            </div>
            {rack.isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading rooms…</p> : null}
            {!rack.isLoading && filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No rooms match these filters.</p>
            ) : null}
          </div>

          <div className={HK_BOARD_FIELD_STACK_CLASS} data-testid="hk-board-field-worklist">
            {rack.isLoading ? <p className="text-sm text-muted-foreground">Loading rooms…</p> : null}
            {!rack.isLoading && filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rooms match these filters.</p>
            ) : null}
            {HK_BOARD_COLUMNS.map((col) => {
              const list = filtered.filter((r) => boardColumnForRoom(r) === col);
              if (list.length === 0) return null;
              return (
                <section key={col} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {HK_BOARD_COLUMN_META[col].label}{" "}
                    <span className="text-muted-foreground">({list.length})</span>
                  </h3>
                  {list.map((room) => (
                    <RoomCard key={room.id} room={room} onOpen={() => setQvRoomId(room.id)} field />
                  ))}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className={ROOM_TABLE_WRAP} data-testid="hk-board-table">
          <table className="w-full min-w-[880px] text-sm">
            <thead className={ROOM_TABLE_HEAD}>
              <tr>
                <th className={ROOM_TABLE_TH}>Room</th>
                <th className={ROOM_TABLE_TH}>Type</th>
                <th className={ROOM_TABLE_TH}>Floor</th>
                <th className={ROOM_TABLE_TH}>Status</th>
                <th className={ROOM_TABLE_TH}>Occupancy</th>
                <th className={ROOM_TABLE_TH}>Attendant</th>
                <th className={ROOM_TABLE_TH}>Task</th>
              </tr>
            </thead>
            <tbody>
              {rack.isLoading ? (
                <tr>
                  <td colSpan={7} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    Loading rooms…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    No rooms match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((room) => (
                  <tr
                    key={room.id}
                    tabIndex={0}
                    className={cn(
                      ROOM_TABLE_ROW,
                      "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]",
                      qvRoomId === room.id && "bg-[#F4E9D0]/70",
                    )}
                    onClick={() => setQvRoomId(room.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setQvRoomId(room.id);
                      }
                    }}
                  >
                    <td className={`${ROOM_TABLE_TD} font-medium`}>{room.roomNumber}</td>
                    <td className={ROOM_TABLE_TD}>{room.roomTypeName}</td>
                    <td className={ROOM_TABLE_TD}>
                      {room.floor ? displayFloorLabel(room.floor) : "No floor assigned"}
                    </td>
                    <td className={ROOM_TABLE_TD}>{housekeepingStatusLabel(room)}</td>
                    <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{occupancyCaption(room)}</td>
                    <td className={ROOM_TABLE_TD}>{room.assignedAttendant ?? "—"}</td>
                    <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                      {room.openTaskStatus ? openTaskLabel(room.openTaskStatus) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewTaskDialog
        restaurantId={restaurantId}
        open={createTaskOpen}
        lockedRoom={lockedTaskRoom}
        rooms={rooms}
        onClose={() => {
          setCreateTaskOpen(false);
          setLockedTaskRoom(null);
        }}
        onDone={() => invalidateHk(qc, restaurantId)}
      />
      <HousekeepingRoomQuickView
        restaurantId={restaurantId}
        today={today}
        room={qvRoom}
        scope={scope}
        membershipId={membershipId}
        pendingInspection={pendingInspect.find((i) => i.roomId === qvRoom?.id) ?? null}
        openMaint={openMaint.filter((m) => m.roomId === qvRoom?.id)}
        canEditTask={canEditTask}
        onClose={() => {
          setQvRoomId(null);
          if (openRoomId) {
            void navigate({
              to: HK_CANONICAL_PATH,
              search: (prev: Record<string, unknown>) => {
                const { room: _omitted, ...rest } = prev ?? {};
                return {
                  ...rest,
                  tab: "board",
                };
              },
              replace: true,
            });
          }
        }}
      />
    </div>
  );
}

function FloorRow({
  floorName,
  rooms,
  onOpen,
}: {
  floorName: string;
  rooms: RackRoom[];
  onOpen: (id: string) => void;
}) {
  const columns: Record<HkBoardColumn, RackRoom[]> = {
    dirty: [],
    assigned: [],
    cleaning: [],
    clean: [],
    inspection: [],
    ready: [],
  };
  for (const room of rooms) {
    const col = boardColumnForRoom(room);
    if (col) columns[col].push(room);
  }
  return (
    <>
      <div className="border-r border-b border-[#E6DDD0] bg-[#EFEAE2] px-2 py-3">
        <p className="text-[11px] font-semibold leading-snug text-[#251605]">{displayFloorLabel(floorName)}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
        </p>
      </div>
      {HK_BOARD_COLUMNS.map((col) => (
        <div
          key={col}
          className={cn(
            "flex flex-col gap-2.5 border-r border-b border-black/[0.04] px-2 py-2 last:border-r-0",
            LANE_VISUAL[col].lane,
          )}
        >
          {columns[col].map((room) => (
            <RoomCard key={room.id} room={room} onOpen={() => onOpen(room.id)} />
          ))}
        </div>
      ))}
    </>
  );
}

function RoomCard({ room, onOpen, field = false }: { room: RackRoom; onOpen: () => void; field?: boolean }) {
  const chips = roomContextChips(room);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`hk-room-card-${room.roomNumber}`}
      aria-label={`Open room ${room.roomNumber}`}
      className={cn(
        "w-full cursor-pointer rounded-xl border border-[#E8E0D4] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(37,22,5,0.06)] outline-none transition-colors",
        "hover:border-[#C89933] hover:bg-[#FBF7EE] hover:shadow-[0_2px_8px_rgba(37,22,5,0.08)]",
        "focus-visible:border-[#C89933] focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-1",
        field && "min-h-11 py-3",
      )}
    >
      <p className="font-display text-base font-semibold leading-none tracking-tight text-[#251605]">
        {room.roomNumber}
      </p>
      <p className="mt-1 text-xs text-[#5C5346]">{room.roomTypeName}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#756A5B]">{occupancyCaption(room)}</p>
      {chips.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[#EADBBD] bg-[#FBF7EE] px-1.5 py-0.5 text-[10px] font-medium text-[#5F492D]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {room.assignedAttendant ? (
        <p className="mt-1.5 text-[11px] text-[#756A5B]">{room.assignedAttendant}</p>
      ) : null}
    </button>
  );
}

function HousekeepingRoomQuickView({
  restaurantId,
  today,
  room,
  scope,
  membershipId,
  pendingInspection,
  openMaint,
  canEditTask,
  onClose,
}: {
  restaurantId: string;
  today: string;
  room: RackRoom | null;
  scope: HousekeepingScope;
  membershipId: string;
  pendingInspection: { id: string; status: string } | null;
  openMaint: Array<{ id: string; description: string; status: string }>;
  canEditTask: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const assignFn = useServerFn(updateHousekeepingTask);
  const completeFn = useServerFn(completeHousekeepingTask);
  const fetchHistory = useServerFn(listHousekeepingHistory);
  const fetchRequests = useServerFn(listHousekeepingGuestRequests);
  const history = useQuery({
    queryKey: ["hk-history", restaurantId, room?.id],
    queryFn: () => fetchHistory({ data: { restaurantId, roomId: room!.id } }),
    enabled: !!room && scope === "supervisor",
  });
  const requests = useQuery({
    queryKey: ["hk-requests", restaurantId, room?.id],
    queryFn: () => fetchRequests({ data: { restaurantId, roomId: room!.id } }),
    enabled: !!room && scope !== "maintenance",
  });
  const roomHistory = (history.data ?? []).slice(0, 6);
  const openRequests = (requests.data ?? []).filter(
    (row) => row.status === "requested" || row.status === "in_progress",
  );

  const act = useMutation({
    mutationFn: (vars: { taskId: string; action: "assign" | "start"; assigneeMembershipId?: string }) =>
      assignFn({
        data: {
          restaurantId,
          taskId: vars.taskId,
          action: vars.action,
          assigneeMembershipId: vars.assigneeMembershipId ?? null,
        },
      }),
    onSuccess: () => {
      invalidateHk(qc, restaurantId);
      toast.success("Task updated.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong."),
  });
  const complete = useMutation({
    mutationFn: (taskId: string) => completeFn({ data: { restaurantId, taskId } }),
    onSuccess: () => {
      invalidateHk(qc, restaurantId);
      toast.success("Cleaning completed.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Something went wrong."),
  });

  const ownTask = Boolean(room?.assignedMembershipId && room.assignedMembershipId === membershipId);
  const canStart =
    canEditTask &&
    Boolean(room?.openTaskId) &&
    room?.openTaskStatus !== "in_progress" &&
    (scope === "supervisor" || ownTask);
  const canComplete =
    canEditTask &&
    Boolean(room?.openTaskId) &&
    (room?.openTaskStatus === "assigned" || room?.openTaskStatus === "in_progress") &&
    (scope === "supervisor" || ownTask);
  const chips = room ? roomContextChips(room) : [];
  const stayChips = chips.filter((chip) => chip !== "Pickup" && chip !== "Priority");

  return (
    <Sheet open={room !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-[360px] gap-0 overflow-y-auto border-l border-[#DDD4C5] bg-white p-0 shadow-xl sm:max-w-[360px] [&>button]:hidden"
      >
        {room ? (
          <div className="min-h-full bg-white" data-testid="hk-room-drawer">
            <header className="border-b border-[#E8E1D7] px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display text-lg font-bold leading-tight text-[#251605]">
                    {room.roomNumber}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs leading-4 text-[#5C5346]">
                    {room.roomTypeName}
                    {" · "}
                    {room.floor ? displayFloorLabel(room.floor) : "No floor assigned"}
                    {" · "}
                    {formatBoardDate(today)}
                  </SheetDescription>
                </div>
                <SheetClose className="grid size-8 shrink-0 place-items-center rounded-md text-[#251605] hover:bg-[#F3EEE4]">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </SheetClose>
              </div>
              <dl className="mt-3">
                <DrawerFact label="Housekeeping status" value={housekeepingStatusLabel(room)} />
                <DrawerFact label="Front Office readiness" value={frontOfficeReadinessLabel(room)} />
                <DrawerFact label="Occupancy" value={occupancyLabel(room)} />
              </dl>
            </header>

            <DrawerSection title="Stay & demand">
              <p>
                {room.occupancy === "occupied" ? room.guestName ?? "In-house guest" : "Vacant"}
              </p>
              {room.demand.earlyArrival ? <p className="text-[#5C5346]">Early arrival</p> : null}
              {stayChips.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {stayChips.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-[#EADBBD] bg-[#FBF7EE] px-1.5 py-0.5 text-[10px] font-medium text-[#5F492D]"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[#756A5B]">No arrival, departure, stayover, or room move.</p>
              )}
              {room.stayId ? (
                <Link
                  to="/restaurant/pms/reservations/$reservationId"
                  params={{ reservationId: room.stayId }}
                  className="inline-block text-xs font-medium text-[#8A641A]"
                >
                  Open stay
                </Link>
              ) : null}
            </DrawerSection>

            <DrawerSection title="Housekeeping">
              <p>Attendant · {room.assignedAttendant ?? "None"}</p>
              <p>Task · {openTaskLabel(room.openTaskStatus)}</p>
              {room.openTaskType ? <p className="text-[#5C5346]">{labelTaskType(room.openTaskType)}</p> : null}
              {room.openTaskPriority && room.openTaskPriority !== "normal" ? (
                <PriorityBadge priority={room.openTaskPriority} />
              ) : null}
              {room.openTaskNotes ? <p className="text-[#5C5346]">{room.openTaskNotes}</p> : null}
              {room.housekeepingStatus === "pickup" ? (
                <p className="text-[#5C5346]">Marked for pickup.</p>
              ) : null}
              {canStart || canComplete ? (
                <div className="flex flex-col gap-2 pt-1">
                  {canStart ? (
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      variant="outline"
                      onClick={() => act.mutate({ taskId: room.openTaskId!, action: "start" })}
                    >
                      Start cleaning
                    </Button>
                  ) : null}
                  {canComplete ? (
                    <Button
                      className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
                      onClick={() => complete.mutate(room.openTaskId!)}
                    >
                      Complete cleaning
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <Link to={HK_HREF} search={{ tab: "cleaning" }} className="inline-block text-xs font-medium text-[#8A641A]">
                Cleaning Tasks
              </Link>
            </DrawerSection>

            <DrawerSection title="Issues">
              <p>
                Inspection ·{" "}
                {room.awaitingInspection
                  ? "Awaiting inspection"
                  : pendingInspection
                    ? "Pending"
                    : room.housekeepingStatus === "inspected"
                      ? "Passed"
                      : "Not in the inspection queue"}
              </p>
              {openMaint.length === 0 ? (
                <p className="text-[#756A5B]">No maintenance issue</p>
              ) : (
                openMaint.map((item) => (
                  <p key={item.id} className="text-[#5C5346]">
                    {item.description}
                  </p>
                ))
              )}
              {scope === "maintenance" ? (
                <p className="text-[#756A5B]">Guest requests are handled in Housekeeping Requests.</p>
              ) : openRequests.length === 0 ? (
                <p className="text-[#756A5B]">No open guest requests for this room.</p>
              ) : (
                openRequests.map((row) => (
                  <p key={row.id} className="text-[#5C5346]">
                    {row.serviceName}
                    {row.priority !== "normal" ? ` · ${row.priority}` : ""}
                  </p>
                ))
              )}
              <div className="flex flex-col gap-1 pt-0.5">
                {scope === "supervisor" ? (
                  <Link to={HK_HREF} search={{ tab: "inspections" }} className="text-xs font-medium text-[#8A641A]">
                    Inspections
                  </Link>
                ) : null}
                <Link to={MAINTENANCE_HREF} search={{ tab: "maintenance" }} className="text-xs font-medium text-[#8A641A]">
                  Maintenance
                </Link>
                {scope !== "maintenance" ? (
                  <Link to={HK_HREF} search={{ tab: "requests" }} className="text-xs font-medium text-[#8A641A]">
                    Requests
                  </Link>
                ) : null}
              </div>
            </DrawerSection>

            <DrawerSection title="Recent activity">
              {scope === "supervisor" ? (
                roomHistory.length === 0 ? (
                  <p className="text-[#756A5B]">No history for this room.</p>
                ) : (
                  roomHistory.map((row) => (
                    <p key={row.id} className="text-[#5C5346]">
                      {row.eventType.replaceAll("_", " ")} · {formatWhen(row.createdAt)}
                    </p>
                  ))
                )
              ) : (
                <p className="text-[#756A5B]">Recent activity is available to supervisors.</p>
              )}
            </DrawerSection>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9.25rem_minmax(0,1fr)] gap-2 py-1 text-xs">
      <dt className="text-[#756A5B]">{label}</dt>
      <dd className="font-semibold text-[#251605]">{value}</dd>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#E8E1D7] px-4 py-3 last:border-b-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">{title}</h3>
      <div className="mt-2 space-y-1.5 text-xs leading-5 text-[#251605]">{children}</div>
    </section>
  );
}

function HkBoardDateControl({
  value,
  businessDate,
  onChange,
}: {
  value: string;
  businessDate: string;
  onChange: (value: string) => void;
}) {
  const onToday = value === businessDate;
  return (
    <div className="flex items-center gap-1.5" data-testid="hk-board-date">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={HK_SHELL_ICON_BUTTON}
        aria-label="Previous day"
        onClick={() => onChange(addDays(value, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="inline-flex h-9 min-w-[6.75rem] items-center justify-center rounded-md border border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605]">
        {formatBoardDate(value)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={HK_SHELL_ICON_BUTTON}
        aria-label="Next day"
        onClick={() => onChange(addDays(value, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 px-2.5 text-xs",
          onToday
            ? "border-[#C89933] bg-[#F4E9D0] font-semibold text-[#251605] hover:bg-[#F4E9D0]"
            : "border-[#DDD4C5]",
        )}
        onClick={() => onChange(businessDate)}
      >
        Today
      </Button>
    </div>
  );
}

function BoardSummary({
  total,
  visible,
  narrowed,
  statusLabel,
  onClearStatus,
}: {
  total: number;
  visible: number;
  narrowed: boolean;
  statusLabel: string;
  onClearStatus: () => void;
}) {
  const roomWord = (count: number) => (count === 1 ? "room" : "rooms");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="hk-board-summary">
      <h2 className="text-sm font-semibold text-[#251605]">Room Status Board</h2>
      <p className="text-sm text-[#5C5346]" data-testid="hk-board-room-count">
        {narrowed ? `${visible} of ${total} ${roomWord(total)}` : `${total} ${roomWord(total)}`}
      </p>
      {statusLabel ? (
        <button
          type="button"
          onClick={onClearStatus}
          data-testid="hk-board-status-chip"
          className="inline-flex items-center gap-1 rounded-full border border-[#EADBBD] bg-[#FBF7EE] px-2 py-0.5 text-xs font-medium text-[#251605] hover:border-[#C89933]"
        >
          Status: {statusLabel}
          <X className="size-3" />
          <span className="sr-only">Clear status filter</span>
        </button>
      ) : null}
    </div>
  );
}
