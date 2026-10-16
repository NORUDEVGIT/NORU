import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BedDouble,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/shared/lib/utils";
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
  deriveHkBoardKpis,
  occupancyCaption,
  type HkBoardColumn,
} from "@/packages/pms/lib/housekeeping-shell";
import { hkDemandLabels, sortRoomsByHkDemand } from "@/packages/pms/lib/housekeeping-ops";
import { HK_HREF, INVENTORY_HREF, MAINTENANCE_HREF } from "@/packages/pms/lib/front-office-room-operations";
import { HkStatusBadge, PriorityBadge, formatWhen, labelTaskType } from "./housekeeping-bits";
import { NewTaskDialog } from "./housekeeping-tabs";
import type { HousekeepingScope } from "@/core/lib/module-access";

type Props = {
  restaurantId: string;
  today: string;
  scope: HousekeepingScope;
  membershipId: string;
  openRoomId?: string;
};

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
  if (floorName.toLowerCase() === "unassigned floor") return "Unassigned Floor";
  if (/^floor\b/i.test(floorName)) return floorName;
  return `Floor ${floorName}`;
}

function invalidateHk(qc: ReturnType<typeof useQueryClient>, restaurantId: string) {
  for (const key of ["hk-dashboard", "hk-rack", "hk-tasks", "hk-inspections", "hk-discrepancies", "hk-maintenance", "hk-history", "hk-staff", "hk-requests"]) {
    void qc.invalidateQueries({ queryKey: [key, restaurantId] });
  }
}

export function HousekeepingBoardTab({
  restaurantId,
  today,
  scope,
  membershipId,
  openRoomId,
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
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
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
  const kpis = useMemo(() => deriveHkBoardKpis(rooms), [rooms]);

  const filtered = rooms.filter((r) => {
    if (floor !== "all" && r.floor !== floor) return false;
    if (attendant !== "all" && r.assignedAttendant !== attendant) return false;
    if (status !== "all") {
      if (status === "ready" && !r.ready) return false;
      if (status === "assigned" && r.openTaskStatus !== "assigned") return false;
      if (status === "cleaning" && r.openTaskStatus !== "in_progress") return false;
      if (
        status !== "ready" &&
        status !== "assigned" &&
        status !== "cleaning" &&
        r.housekeepingStatus !== status &&
        r.restriction !== status
      ) {
        return false;
      }
    }
    if (query.trim()) {
      const hay = `${r.roomNumber} ${r.roomTypeName} ${r.guestName ?? ""} ${r.assignedAttendant ?? ""} ${hkDemandLabels(r.demand).join(" ")} ${r.readyReason ?? ""} ${r.openTaskNotes ?? ""}`.toLowerCase();
      if (!hay.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });

  const byFloor = useMemo(() => {
    const map = new Map<string, RackRoom[]>();
    for (const room of filtered) {
      const key = room.floor?.trim() || "Unassigned floor";
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
  const awaitingInspect = rooms.filter((r) => r.awaitingInspection).slice(0, 8);

  const kpiCards = [
    { id: "dirty", label: "Dirty Rooms", hint: "Need cleaning", value: kpis.dirty, icon: Sparkles, tone: "text-rose-700 bg-rose-50" },
    { id: "assigned", label: "Assigned", hint: "Rooms assigned", value: kpis.assigned, icon: UserRound, tone: "text-amber-800 bg-amber-50" },
    { id: "progress", label: "In Progress", hint: "Being cleaned", value: kpis.inProgress, icon: RefreshCw, tone: "text-sky-700 bg-sky-50" },
    { id: "clean", label: "Clean", hint: "Awaiting inspection", value: kpis.clean, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
    { id: "inspected", label: "Inspected", hint: "Awaiting release", value: kpis.inspected, icon: ShieldCheck, tone: "text-violet-700 bg-violet-50" },
    { id: "ready", label: "Ready", hint: "Ready for check-in", value: kpis.ready, icon: BedDouble, tone: "text-teal-700 bg-teal-50" },
    { id: "pickup", label: "Pickup", hint: "Public areas/rooms", value: kpis.pickup, icon: ClipboardCheck, tone: "text-orange-700 bg-orange-50" },
    { id: "ooo", label: "Out of Order", hint: "Maintenance issue", value: kpis.outOfOrder, icon: Wrench, tone: "text-red-800 bg-red-50" },
  ] as const;

  return (
    <div className="space-y-4" data-testid="hk-board">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-8" data-testid="hk-kpi-strip">
        {kpiCards.map((card) => (
          <div key={card.id} className="rounded-2xl border border-border bg-background px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <span className={cn("rounded-full p-1", card.tone)}>
                <card.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-1 font-display text-2xl font-semibold">{rack.isLoading ? "—" : card.value}</p>
            <p className="text-[11px] text-muted-foreground">{card.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background p-2">
        <Input value={today} readOnly className="h-9 w-[132px] bg-muted/40 text-sm" aria-label="Business date" />
        <Select value="today" disabled>
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue placeholder="View range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
          </SelectContent>
        </Select>
        <Select value={floor} onValueChange={setFloor}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Floor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All floors</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={attendant} onValueChange={setAttendant}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Attendant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All attendants</SelectItem>
            {attendants.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="dirty">Dirty</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="clean">Clean</SelectItem>
            <SelectItem value="inspected">Inspected</SelectItem>
            <SelectItem value="pickup">Pickup</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="out_of_order">Out of order</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search room, guest, attendant, or note…"
          className="h-9 min-w-[200px] flex-1"
        />
        {scope === "supervisor" ? (
          <Button
            className={cn(HK_FIELD_ACTION_CLASS, "ml-auto bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
            onClick={() => {
              setLockedTaskRoom(null);
              setCreateTaskOpen(true);
            }}
            disabled={!rooms.length}
          >
            + Create Task
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className={HK_BOARD_LANES_DESKTOP_CLASS}>
          <p className="border-b border-[#E6DDD0] bg-background px-3 py-2 text-sm font-medium">
            Rooms ({filtered.length})
          </p>
          <div
            className="grid min-w-[1100px] grid-cols-[128px_repeat(6,minmax(168px,1fr))]"
            data-testid="hk-board-lanes"
          >
            <div className="border-r border-[#E6DDD0] bg-[#EFEAE2] px-3 py-2.5">
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

        <aside className="space-y-3">
          <RailCard
            title={`Today's Inspections (${isSupervisor ? awaitingInspect.length : 0})`}
            action={
              isSupervisor ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground"
                  onClick={() =>
                    void navigate({ to: "/restaurant/pms/housekeeping", search: { tab: "inspections" } })
                  }
                >
                  View all
                </button>
              ) : null
            }
          >
            {!isSupervisor ? (
              <p className="text-xs text-muted-foreground">Inspections are supervisor-only.</p>
            ) : awaitingInspect.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rooms waiting for inspection.</p>
            ) : (
              awaitingInspect.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className="flex w-full items-start justify-between rounded-lg px-1 py-1.5 text-left text-xs hover:bg-muted/60"
                  onClick={() => setQvRoomId(room.id)}
                >
                  <span>
                    <span className="font-medium">{room.roomNumber}</span>
                    <span className="block text-muted-foreground">{room.roomTypeName}</span>
                  </span>
                  <span className="text-muted-foreground">{occupancyCaption(room)}</span>
                </button>
              ))
            )}
          </RailCard>
          <RailCard title={`Active Maintenance (${openMaint.length})`}>
            {openMaint.length === 0 ? (
              <p className="text-xs text-muted-foreground">No open maintenance requests.</p>
            ) : (
              openMaint.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-start justify-between py-1.5 text-xs">
                  <span>
                    <span className="font-medium">{row.roomNumber}</span>
                    <span className="block text-muted-foreground">{row.description}</span>
                  </span>
                  <PriorityBadge priority={row.priority} />
                </div>
              ))
            )}
            <Link to="/restaurant/pms/maintenance" search={{ tab: "maintenance" }} className="text-xs text-muted-foreground">
              View all
            </Link>
          </RailCard>
          <RailCard title="Housekeeping Requests (0)">
            <p className="text-xs text-muted-foreground">
              Execution queue is not live yet. Guest Services remains the request owner.
            </p>
          </RailCard>
        </aside>
      </div>

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
        {...(scope === "supervisor"
          ? {
              onCreateTask: (room: RackRoom) => {
                setLockedTaskRoom(room);
                setCreateTaskOpen(true);
              },
            }
          : {})}
        onClose={() => {
          setQvRoomId(null);
          if (openRoomId) {
            void navigate({ to: HK_CANONICAL_PATH, search: { tab: "board" }, replace: true });
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
      <div className="border-r border-b border-[#E6DDD0] bg-[#EFEAE2] px-3 py-3">
        <p className="text-xs font-semibold text-foreground">{displayFloorLabel(floorName)}</p>
        <p className="text-[11px] text-muted-foreground">{rooms.length} rooms</p>
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
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`hk-room-card-${room.roomNumber}`}
      className={cn(
        "w-full rounded-xl border border-[#E8E0D4] bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(37,22,5,0.06)] hover:border-[#C89933]",
        field && "min-h-11 py-3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">{room.roomNumber}</p>
        {room.openTaskStatus === "assigned" || room.openTaskStatus === "in_progress" ? (
          <HkStatusBadge status={room.housekeepingStatus} />
        ) : room.housekeepingStatus === "pickup" ? (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800">Pickup</span>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">{room.roomTypeName}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{occupancyCaption(room)}</p>
      {hkDemandLabels(room.demand).length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {hkDemandLabels(room.demand).map((label) => (
            <span
              key={label}
              className="rounded-full bg-[#F3E6C8] px-1.5 py-0.5 text-[10px] font-medium text-[#251605]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {room.assignedAttendant ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{room.assignedAttendant}</p>
      ) : null}
    </button>
  );
}

function RailCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
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
  onCreateTask,
  onClose,
}: {
  restaurantId: string;
  today: string;
  room: RackRoom | null;
  scope: HousekeepingScope;
  membershipId: string;
  pendingInspection: { id: string; status: string } | null;
  openMaint: Array<{ id: string; description: string; status: string }>;
  onCreateTask?: (room: RackRoom) => void;
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

  const canOperate = scope === "supervisor" || scope === "housekeeper";
  const ownTask = Boolean(room?.assignedMembershipId && room.assignedMembershipId === membershipId);
  const canStart =
    Boolean(room?.openTaskId) &&
    room?.openTaskStatus !== "in_progress" &&
    (scope === "supervisor" || ownTask);
  const canComplete =
    Boolean(room?.openTaskId) &&
    (room?.openTaskStatus === "assigned" || room?.openTaskStatus === "in_progress") &&
    (scope === "supervisor" || ownTask);
  const checkInLabel = room?.checkInReady ? "Ready for check-in" : "Not ready for check-in";
  const demand = room ? hkDemandLabels(room.demand) : [];

  return (
    <Sheet open={room !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-[420px]">
        {room ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-2xl">{room.roomNumber}</SheetTitle>
              <SheetDescription>
                {room.roomTypeName}
                {room.floor ? ` · Floor ${room.floor}` : ""}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <HkStatusBadge status={room.housekeepingStatus} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{occupancyCaption(room)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    room.checkInReady ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-800",
                  )}
                >
                  {checkInLabel}
                </span>
                {room.housekeepingStatus === "pickup" ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800">
                    Pickup — extra HK state, not Ready
                  </span>
                ) : null}
              </div>
            </SheetHeader>

            <div className="mt-4 space-y-3 text-sm">
              <QvBlock title="Check-in readiness">
                <p>{checkInLabel}</p>
                {room.readyReason ? (
                  <p className="text-muted-foreground">{room.readyReason}</p>
                ) : (
                  <p className="text-muted-foreground">Same policy as Front Office arrivals.</p>
                )}
                {room.occupancy === "occupied" && room.checkInReady ? (
                  <p className="text-muted-foreground">Occupied — the Board Ready lane still requires vacant.</p>
                ) : null}
              </QvBlock>
              <QvBlock title="Demand today">
                {demand.length === 0 ? (
                  <p className="text-muted-foreground">No arrival, departure, stayover, VIP, or room-move flags.</p>
                ) : (
                  <p>{demand.join(" · ")}</p>
                )}
              </QvBlock>
              <QvBlock title="Current stay">
                <p className="text-muted-foreground">
                  {room.occupancy === "occupied"
                    ? room.guestName ?? "In-house guest"
                    : "None — vacant"}
                </p>
                {room.stayId ? (
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: room.stayId }}
                    className="text-xs text-[#C89933]"
                  >
                    Open stay
                  </Link>
                ) : null}
              </QvBlock>
              <QvBlock title="Assigned attendant">
                <p>{room.assignedAttendant ?? "None"}</p>
              </QvBlock>
              <QvBlock title="Cleaning task">
                <p className="capitalize">{room.openTaskStatus?.replace("_", " ") ?? "No open task"}</p>
                {room.openTaskType ? (
                  <p className="text-muted-foreground">{labelTaskType(room.openTaskType)}</p>
                ) : null}
                {room.openTaskPriority ? <PriorityBadge priority={room.openTaskPriority} /> : null}
                {room.openTaskNotes ? <p className="text-muted-foreground">{room.openTaskNotes}</p> : null}
              </QvBlock>
              <QvBlock title="Inspection">
                <p>
                  {room.awaitingInspection
                    ? "Awaiting inspection"
                    : pendingInspection
                      ? "Pending"
                      : room.housekeepingStatus === "inspected"
                        ? "Passed"
                        : "Not in the inspection queue"}
                </p>
                <p className={cn("text-xs", room.checkInReady ? "text-teal-800" : "text-rose-800")}>
                  {room.checkInReady ? "Ready for check-in" : "Not ready for check-in"}
                </p>
                {room.readyReason ? <p className="text-muted-foreground">{room.readyReason}</p> : null}
                {scope === "supervisor" ? (
                  <Link to={HK_HREF} search={{ tab: "inspections" }} className="text-xs text-[#C89933]">
                    Open inspections
                  </Link>
                ) : null}
              </QvBlock>
              <QvBlock title="Maintenance">
                {openMaint.length === 0 ? (
                  <p className="text-muted-foreground">No issue</p>
                ) : (
                  openMaint.map((m) => (
                    <p key={m.id} className="text-muted-foreground">
                      {m.description}
                    </p>
                  ))
                )}
                <Link to={MAINTENANCE_HREF} search={{ tab: "maintenance" }} className="text-xs text-[#C89933]">
                  Open maintenance
                </Link>
              </QvBlock>
              <QvBlock title="Links">
                <div className="flex flex-col gap-1">
                  <Link to={INVENTORY_HREF} className="text-xs text-[#C89933]">
                    Room inventory
                  </Link>
                  <Link to={HK_HREF} search={{ tab: "cleaning" }} className="text-xs text-[#C89933]">
                    Cleaning worklist
                  </Link>
                </div>
              </QvBlock>
              <QvBlock title="Guest requests">
                {scope === "maintenance" ? (
                  <p className="text-muted-foreground">Guest requests are handled in Housekeeping Requests.</p>
                ) : openRequests.length === 0 ? (
                  <p className="text-muted-foreground">No open guest requests for this room.</p>
                ) : (
                  openRequests.map((row) => (
                    <p key={row.id} className="text-muted-foreground">
                      {row.serviceName}
                      {row.priority !== "normal" ? ` · ${row.priority}` : ""}
                    </p>
                  ))
                )}
                {scope !== "maintenance" ? (
                  <Link to={HK_HREF} search={{ tab: "requests" }} className="text-xs text-[#C89933]">
                    Open requests
                  </Link>
                ) : null}
              </QvBlock>
              {scope === "supervisor" ? (
                <QvBlock title="Recent history">
                  {roomHistory.length === 0 ? (
                    <p className="text-muted-foreground">No history for this room.</p>
                  ) : (
                    roomHistory.map((row) => (
                      <p key={row.id} className="text-xs text-muted-foreground">
                        {row.eventType.replaceAll("_", " ")} · {formatWhen(row.createdAt)}
                      </p>
                    ))
                  )}
                </QvBlock>
              ) : null}
            </div>

            {canOperate && (room.openTaskId || onCreateTask) ? (
              <div className="mt-auto grid grid-cols-1 gap-2 pt-6 sm:grid-cols-2">
                {onCreateTask ? (
                  <Button className={HK_FIELD_ACTION_CLASS} variant="outline" onClick={() => onCreateTask(room)}>
                    Create task
                  </Button>
                ) : null}
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
            ) : (
              <p className="mt-6 text-xs text-muted-foreground">
                Business date {today}. Room Quick View does not change Front Office stay or inventory writers.
              </p>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function QvBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}
