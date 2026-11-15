/**
 * Phase 6F — Housekeeping workspace tab content.
 *
 * Presentation only: every mutation goes through the tenant-scoped server
 * functions, which re-derive the caller's owner/manager membership.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Ellipsis, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SearchableSelect } from "@/shared/components/ui/searchable-select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";
import {
  completeHousekeepingTask,
  createDiscrepancy,
  createHousekeepingTask,
  createMaintenanceRequest,
  getHousekeepingDashboard,
  inspectRoom,
  listHousekeepingHistory,
  listHousekeepingStaff,
  listHousekeepingTasks,
  listInspections,
  listHousekeepingExceptions,
  listMaintenanceRequests,
  listRoomRack,
  resolveDiscrepancy,
  setRoomRestriction,
  updateHousekeepingTask,
  updateMaintenanceRequest,
  type HousekeepingTask,
  type RackRoom,
} from "@/packages/pms/lib/housekeeping.functions";
import { getPmsSet4Snapshot } from "@/packages/pms/lib/pms-set4-hk-inventory.functions";
import {
  resolveCleaningTypesForCreate,
  resolveMaintenanceCategoriesForCreate,
  resolvePrioritiesForCreate,
  resolveRestrictionReasonsForCreate,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import {
  HkStatusBadge,
  PriorityBadge,
  RestrictionBadge,
  TaskStatusBadge,
  formatWhen,
  labelTaskType,
} from "./housekeeping-bits";
import type { HousekeepingScope } from "@/core/lib/module-access";
import { occupancyCaption, hkAreaPath, hkRoomQuickViewPath, HK_FIELD_ACTION_CLASS } from "@/packages/pms/lib/housekeeping-shell";
import { HkDesktopOnly, HkFieldActions, HkFieldCard, HkFieldStack } from "./housekeeping-field";
import {
  PmsFilterPopover,
  PmsFilterSection,
  PmsFilterSelect,
} from "@/packages/pms/components/pms-filter-popover";
import { PmsFilterChoiceRow, PmsFilterMenu, PmsFilterNoteRow } from "@/packages/pms/components/pms-filter-menu";
import {
  HkBusinessDate,
  HkShellExportButton,
  HkShellSlot,
  HkToolbarSearch,
  HkViewSwitcher,
  downloadCsv,
  HK_SHELL_ICON_BUTTON,
  HK_SHELL_PRIMARY_BUTTON,
} from "@/packages/pms/components/housekeeping/housekeeping-shell-slots";
import { addDays } from "@/packages/pms/components/rooms/room-inventory-utils";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_ROW,
  ROOM_TABLE_TD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
} from "@/packages/pms/components/rooms/room-inventory-shell";
import {
  formatHousekeepingHistoryDetail,
  HK_HISTORY_FILTER_GROUP_LABELS,
  HK_HISTORY_FILTER_GROUPS,
  HK_HISTORY_EVENTS_BY_GROUP,
  suggestedCleaningType,
  type HkExceptionAction,
  type HkExceptionKind,
} from "@/packages/pms/lib/housekeeping-ops";
import { HK_HREF, INVENTORY_HREF } from "@/packages/pms/lib/front-office-room-operations";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";

type Props = { restaurantId: string; today: string };
type HousekeepingTaskGrants = {
  canCreateTask: boolean;
  canEditTask: boolean;
  canCancelTask: boolean;
};
type CleaningProps = Props &
  HousekeepingTaskGrants & { scope: HousekeepingScope; membershipId: string };

type CleaningLane = "pending" | "assigned" | "in_progress" | "completed";
type CleaningAction = "assign" | "start" | "complete" | "cancel";

const CLEANING_LANES: Array<{ id: CleaningLane; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "assigned", label: "Assigned" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed Today" },
];

function useInvalidateHousekeeping(restaurantId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [
      "hk-dashboard",
      "hk-rack",
      "hk-tasks",
      "hk-inspections",
      "hk-discrepancies",
      "hk-exceptions",
      "hk-maintenance",
      "hk-history",
      "hk-staff",
      "hk-requests",
    ]) {
      void qc.invalidateQueries({ queryKey: [key, restaurantId] });
    }
    invalidateFrontOfficeOwnerReads(qc);
  };
}

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/* --------------------------------------------------------------- dashboard */

export function HousekeepingDashboardTab({ restaurantId, today }: Props) {
  const fetch = useServerFn(getHousekeepingDashboard);
  const q = useQuery({
    queryKey: ["hk-dashboard", restaurantId, today],
    queryFn: () => fetch({ data: { restaurantId, today } }),
  });

  const stats: Array<[string, number | undefined]> = [
    ["Total rooms", q.data?.totalRooms],
    ["Occupied", q.data?.occupied],
    ["Vacant", q.data?.vacant],
    ["Dirty", q.data?.dirty],
    ["Clean", q.data?.clean],
    ["Inspected", q.data?.inspected],
    ["Out of order", q.data?.outOfOrder],
    ["Out of service", q.data?.outOfService],
    ["Pending cleaning", q.data?.pendingCleaning],
    ["Pending inspection", q.data?.pendingInspection],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Business date {today}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl">{q.isLoading ? "—" : (value ?? 0)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- room rack */

export function RoomRackTab({ restaurantId, canCreateTask = true }: Props & { canCreateTask?: boolean }) {
  const fetch = useServerFn(listRoomRack);
  const q = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetch({ data: { restaurantId } }),
  });
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const [floor, setFloor] = useState("all");
  const [type, setType] = useState("all");
  const [occ, setOcc] = useState("all");
  const [hk, setHk] = useState("all");
  const [restriction, setRestriction] = useState("all");
  const [taskRoom, setTaskRoom] = useState<RackRoom | null>(null);

  const rooms = q.data ?? [];
  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor).filter(Boolean) as string[])).sort(),
    [rooms],
  );
  const types = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.roomTypeName))).sort(),
    [rooms],
  );

  const filtered = rooms.filter(
    (r) =>
      (floor === "all" || r.floor === floor) &&
      (type === "all" || r.roomTypeName === type) &&
      (occ === "all" || r.occupancy === occ) &&
      (hk === "all" || r.housekeepingStatus === hk) &&
      (restriction === "all" || r.restriction === restriction),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect value={floor} onChange={setFloor} placeholder="Floor" options={floors} allLabel="All floors" />
        <FilterSelect value={type} onChange={setType} placeholder="Room type" options={types} allLabel="All types" />
        <FilterSelect
          value={occ}
          onChange={setOcc}
          placeholder="Occupancy"
          options={["vacant", "occupied"]}
          allLabel="All occupancy"
        />
        <FilterSelect
          value={hk}
          onChange={setHk}
          placeholder="HK status"
          options={["dirty", "clean", "inspected", "pickup"]}
          allLabel="All HK statuses"
        />
        <FilterSelect
          value={restriction}
          onChange={setRestriction}
          placeholder="Restriction"
          options={["available", "out_of_order", "out_of_service"]}
          allLabel="All restrictions"
        />
      </div>

      <HkFieldStack testId="hk-dashboard-field-worklist">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rooms…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms match these filters.</p>
        ) : (
          filtered.map((r) => (
            <HkFieldCard key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">Room {r.roomNumber}</p>
                <HkStatusBadge status={r.housekeepingStatus} />
              </div>
              <p className="text-sm text-muted-foreground">
                {r.roomTypeName}
                {r.floor ? ` · Floor ${r.floor}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.guestName ?? occupancyCaption(r)} · {r.assignedAttendant ?? "Unassigned"}
              </p>
              <p className="text-xs">{r.ready ? "Ready" : "Not ready"}</p>
              {canCreateTask ? (
                <HkFieldActions>
                  <Button className={HK_FIELD_ACTION_CLASS} variant="outline" onClick={() => setTaskRoom(r)}>
                    New task
                  </Button>
                </HkFieldActions>
              ) : null}
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>

      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Type</th>
              <th className="p-3">Floor</th>
              <th className="p-3">Guest</th>
              <th className="p-3">Occupancy</th>
              <th className="p-3">HK status</th>
              <th className="p-3">Restriction</th>
              <th className="p-3">Attendant</th>
              <th className="p-3">Ready</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={10} className="p-4 text-muted-foreground">
                  Loading rooms…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-muted-foreground">
                  No rooms match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-medium">{r.roomNumber}</td>
                  <td className="p-3">{r.roomTypeName}</td>
                  <td className="p-3">{r.floor ?? "—"}</td>
                  <td className="p-3">{r.guestName ?? "—"}</td>
                  <td className="p-3 capitalize">{r.occupancy}</td>
                  <td className="p-3">
                    <HkStatusBadge status={r.housekeepingStatus} />
                  </td>
                  <td className="p-3">
                    <RestrictionBadge status={r.restriction} />
                  </td>
                  <td className="p-3">{r.assignedAttendant ?? "—"}</td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        r.ready
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.ready ? "Ready" : "Not ready"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {canCreateTask ? (
                    <Button size="sm" variant="outline" onClick={() => setTaskRoom(r)}>
                      New task
                    </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </HkDesktopOnly>

      <NewTaskDialog
        restaurantId={restaurantId}
        open={taskRoom !== null}
        lockedRoom={taskRoom}
        rooms={rooms}
        onClose={() => setTaskRoom(null)}
        onDone={invalidate}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="capitalize">
            {o.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NewTaskDialog({
  restaurantId,
  open,
  lockedRoom,
  rooms,
  onClose,
  onDone,
}: {
  restaurantId: string;
  open: boolean;
  lockedRoom: RackRoom | null;
  rooms: RackRoom[];
  onClose: () => void;
  onDone: () => void;
}) {
  const create = useServerFn(createHousekeepingTask);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
    enabled: open,
  });
  const cleaningTypes = resolveCleaningTypesForCreate(set4.data?.snapshot.cleaningPosture).filter(
    (row) => row.code !== "turn_down",
  );
  const priorities = resolvePrioritiesForCreate(
    set4.data?.snapshot.cleaningPosture,
    set4.data?.snapshot.maintenancePriorities,
  );
  const [pickedRoomId, setPickedRoomId] = useState("");
  const [taskType, setTaskType] = useState("departure_cleaning");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");

  const selectedRoom = lockedRoom ?? rooms.find((row) => row.id === pickedRoomId) ?? null;

  useEffect(() => {
    if (!open) {
      setPickedRoomId("");
      setNotes("");
      setTaskType("departure_cleaning");
      setPriority("normal");
      return;
    }
    setPickedRoomId("");
    setNotes("");
    setPriority("normal");
    if (lockedRoom) {
      setTaskType(suggestedCleaningType(lockedRoom.demand));
    } else {
      setTaskType("departure_cleaning");
    }
  }, [open, lockedRoom?.id]);

  useEffect(() => {
    if (!open || lockedRoom || !selectedRoom) return;
    setTaskType(suggestedCleaningType(selectedRoom.demand));
  }, [open, lockedRoom, selectedRoom?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          restaurantId,
          roomId: selectedRoom!.id,
          taskType: taskType as never,
          priority: priority as never,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success("Cleaning task ready for this room.");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const roomOptions = rooms.map((row) => ({
    value: row.id,
    label: `${row.roomNumber} · ${row.roomTypeName} · ${row.housekeepingStatus.replaceAll("_", " ")}`,
  }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New housekeeping task</DialogTitle>
          <DialogDescription>
            {lockedRoom ? `Room ${lockedRoom.roomNumber}` : "Choose a room, then set type, priority, and notes."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lockedRoom ? null : (
            <div className="space-y-1.5" data-testid="hk-create-task-room">
              <Label htmlFor="hk-create-task-room-select">Room</Label>
              <SearchableSelect
                id="hk-create-task-room-select"
                value={pickedRoomId}
                options={roomOptions}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setPickedRoomId}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Task type</Label>
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(cleaningTypes.length
                  ? cleaningTypes
                  : ["departure_cleaning", "stayover_cleaning", "touch_up", "deep_cleaning", "re_clean"].map((code) => ({
                      code,
                      label: labelTaskType(code),
                    }))
                ).map((row) => (
                  <SelectItem key={row.code} value={row.code}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(priorities.length ? priorities : ["normal", "high", "urgent"].map((code) => ({ code, label: code }))).map(
                  (row) => (
                    <SelectItem key={row.code} value={row.code} className="capitalize">
                      {row.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">
            A room can only have one open cleaning task; if one already exists it stays as-is.
            Arrival, stayover, and VIP Card 2 rules may raise the saved priority.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selectedRoom}
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------- cleaning board */

export function CleaningBoardTab({
  restaurantId,
  today,
  scope,
  membershipId,
  canCreateTask,
  canEditTask,
  canCancelTask,
}: CleaningProps) {
  const fetchTasks = useServerFn(listHousekeepingTasks);
  const fetchStaff = useServerFn(listHousekeepingStaff);
  const fetchRack = useServerFn(listRoomRack);
  const assignFn = useServerFn(updateHousekeepingTask);
  const completeFn = useServerFn(completeHousekeepingTask);
  const invalidate = useInvalidateHousekeeping(restaurantId);
  const [taskDate, setTaskDate] = useState(today);

  useEffect(() => {
    setTaskDate(today);
  }, [today]);

  const tasks = useQuery({
    queryKey: ["hk-tasks", restaurantId, taskDate],
    queryFn: () => fetchTasks({ data: { restaurantId, today: taskDate } }),
  });
  const staff = useQuery({
    queryKey: ["hk-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });
  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });

  const [assignTask, setAssignTask] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [query, setQuery] = useState("");
  const [attendant, setAttendant] = useState("all");
  const [priority, setPriority] = useState("all");
  const [taskType, setTaskType] = useState("all");
  const [lane, setLane] = useState<"all" | CleaningLane>("all");
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const isSupervisor = scope === "supervisor";
  const own = (assignedId: string | null) => assignedId === membershipId;

  const act = useMutation({
    mutationFn: (vars: {
      taskId: string;
      action: "assign" | "start" | "cancel";
      assigneeMembershipId?: string;
      notes?: string;
    }) =>
      assignFn({
        data: {
          restaurantId,
          taskId: vars.taskId,
          action: vars.action,
          assigneeMembershipId: vars.assigneeMembershipId ?? null,
          notes: vars.notes,
        },
      }),
    onSuccess: () => {
      invalidate();
      setAssignTask(null);
      setAssignNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const complete = useMutation({
    mutationFn: (taskId: string) => completeFn({ data: { restaurantId, taskId } }),
    onSuccess: () => {
      toast.success("Cleaning completed — room is now clean and awaiting inspection.");
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const loaded = tasks.data ?? [];
  const queryText = query.trim().toLowerCase();
  const attendants = useMemo(
    () => Array.from(new Set(loaded.map((task) => task.assignedName).filter(Boolean) as string[])).sort(),
    [loaded],
  );
  const taskTypes = useMemo(
    () => Array.from(new Set(loaded.map((task) => task.taskType))).sort(),
    [loaded],
  );
  const narrowed = loaded.filter((task) => {
    if (attendant === "unassigned" && task.assignedName) return false;
    if (attendant !== "all" && attendant !== "unassigned" && task.assignedName !== attendant) return false;
    if (priority !== "all" && task.priority !== priority) return false;
    if (taskType !== "all" && task.taskType !== taskType) return false;
    if (queryText) {
      const hay = `${task.roomNumber} ${task.roomTypeName} ${labelTaskType(task.taskType)} ${cleaningStatusLabel(task.status)} ${cleaningPriorityLabel(task.priority)} ${task.assignedName ?? ""} ${task.notes ?? ""}`.toLowerCase();
      if (!hay.includes(queryText)) return false;
    }
    return true;
  });
  const laneTasks = (id: CleaningLane) => narrowed.filter((task) => taskInCleaningLane(task, id, taskDate));
  const columns = CLEANING_LANES.map((column) => ({
    ...column,
    count: laneTasks(column.id).length,
    tasks: lane === "all" || lane === column.id ? laneTasks(column.id) : [],
  }));
  const fieldWork =
    lane === "all"
      ? (["pending", "assigned", "in_progress"] as const).flatMap((id) => laneTasks(id))
      : laneTasks(lane);
  const tableRows = lane === "all" ? narrowed : laneTasks(lane);
  const openTask = loaded.find((task) => task.id === openTaskId) ?? null;
  const laneLabel = CLEANING_LANES.find((column) => column.id === lane)?.label ?? "";
  const filterCount =
    (lane !== "all" ? 1 : 0) +
    (attendant !== "all" ? 1 : 0) +
    (priority !== "all" ? 1 : 0) +
    (taskType !== "all" ? 1 : 0);

  function runAction(task: HousekeepingTask, action: CleaningAction) {
    if (action === "assign") {
      setAssignee("");
      setAssignNotes("");
      setAssignTask(task.id);
      return;
    }
    if (action === "start") {
      act.mutate({ taskId: task.id, action: "start" });
      return;
    }
    if (action === "cancel") {
      act.mutate({ taskId: task.id, action: "cancel" });
      return;
    }
    complete.mutate(task.id);
  }

  function toggleLane(id: CleaningLane) {
    setLane((current) => (current === id ? "all" : id));
  }

  return (
    <div className="space-y-3" data-testid="hk-cleaning-board">
      <HkShellSlot name="date">
        <CleaningDateControl value={taskDate} businessDate={today} onChange={setTaskDate} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, task, attendant, or note…"
          testId="hk-cleaning-search"
        />
      </HkShellSlot>
      <HkShellSlot name="filter">
        <PmsFilterMenu
          activeCount={filterCount}
          tooltip="Filters"
          onClear={() => {
            setLane("all");
            setAttendant("all");
            setPriority("all");
            setTaskType("all");
          }}
          buttonTestId="hk-cleaning-filters-button"
          menuTestId="hk-cleaning-filters-menu"
        >
          <PmsFilterChoiceRow
            label="Status"
            value={lane}
            current={laneLabel}
            options={[
              ["all", "All statuses"],
              ["pending", "Pending"],
              ["assigned", "Assigned"],
              ["in_progress", "In Progress"],
              ["completed", "Completed Today"],
            ]}
            onChange={(value) => setLane(value as "all" | CleaningLane)}
          />
          <PmsFilterChoiceRow
            label="Attendant"
            value={attendant}
            current={attendant === "unassigned" ? "Unassigned" : attendant === "all" ? "" : attendant}
            options={[
              ["all", "All attendants"],
              ["unassigned", "Unassigned"],
              ...attendants.map((name) => [name, name] as const),
            ]}
            onChange={setAttendant}
          />
          <PmsFilterChoiceRow
            label="Priority"
            value={priority}
            current={priority === "all" ? "" : cleaningPriorityLabel(priority)}
            options={[
              ["all", "All priorities"],
              ["normal", "Normal"],
              ["high", "Priority"],
              ["urgent", "Urgent"],
            ]}
            onChange={setPriority}
          />
          <PmsFilterChoiceRow
            label="Task type"
            value={taskType}
            current={taskType === "all" ? "" : labelTaskType(taskType)}
            options={[["all", "All task types"], ...taskTypes.map((type) => [type, labelTaskType(type)] as const)]}
            onChange={setTaskType}
          />
        </PmsFilterMenu>
      </HkShellSlot>
      <HkShellSlot name="view">
        <HkViewSwitcher
          value={viewMode}
          onChange={setViewMode}
          testId="hk-cleaning-view-switcher"
          labels={{ board: "Board view", table: "List view" }}
        />
      </HkShellSlot>
      {isSupervisor && canCreateTask ? (
        <HkShellSlot name="cta">
          <Button
            className={HK_SHELL_PRIMARY_BUTTON}
            onClick={() => setCreateTaskOpen(true)}
            disabled={!(rack.data ?? []).length}
            data-testid="hk-cleaning-create-task"
          >
            Create Task
          </Button>
        </HkShellSlot>
      ) : null}
      {viewMode === "board" ? (
        <HkFieldStack testId="hk-cleaning-field-worklist">
          {tasks.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tasks…</p>
          ) : fieldWork.length === 0 ? (
            <CleaningEmptyState
              label={
                lane === "completed"
                  ? "No completed tasks"
                  : lane === "all"
                    ? "No open cleaning tasks"
                    : `No ${laneLabel.toLowerCase()} tasks`
              }
            />
          ) : (
            fieldWork.map((task) => (
              <CleaningTaskCard
                key={task.id}
                task={task}
                field
                selected={openTaskId === task.id}
                pending={act.isPending || complete.isPending}
                permissions={cleaningPermissions(task, {
                  isSupervisor,
                  canEditTask,
                  canCancelTask,
                  own: own(task.assignedMembershipId),
                })}
                onOpen={() => setOpenTaskId(task.id)}
                onAction={(action) => runAction(task, action)}
              />
            ))
          )}
        </HkFieldStack>
      ) : null}
      {viewMode === "board" ? (
        <div className="hidden gap-2 md:grid md:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <div key={column.id} className="space-y-2">
              <button
                type="button"
                aria-pressed={lane === column.id}
                data-testid={`hk-cleaning-lane-${column.id}`}
                onClick={() => toggleLane(column.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors",
                  lane === column.id
                    ? "border-[#C89933] bg-[#F4E9D0] font-semibold text-[#251605] ring-1 ring-[#C89933]/40"
                    : "border-transparent font-semibold text-[#251605] hover:bg-[#FBF7EE]",
                )}
              >
                <span>{column.label}</span>
                <span className="tabular-nums text-xs font-medium text-[#756A5B]">({column.count})</span>
              </button>
              {tasks.isLoading ? (
                <p className="px-1 text-xs text-muted-foreground">Loading tasks…</p>
              ) : column.tasks.length === 0 ? (
                lane === "all" || lane === column.id ? (
                  <CleaningEmptyState label={`No ${column.id === "completed" ? "completed" : column.label.toLowerCase()} tasks`} />
                ) : null
              ) : (
                column.tasks.map((task) => (
                  <CleaningTaskCard
                    key={task.id}
                    task={task}
                    selected={openTaskId === task.id}
                    pending={act.isPending || complete.isPending}
                    permissions={cleaningPermissions(task, {
                      isSupervisor,
                      canEditTask,
                      canCancelTask,
                      own: own(task.assignedMembershipId),
                    })}
                    onOpen={() => setOpenTaskId(task.id)}
                    onAction={(action) => runAction(task, action)}
                  />
                ))
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={ROOM_TABLE_WRAP} data-testid="hk-cleaning-table">
          <table className="w-full min-w-[880px] text-sm">
            <thead className={ROOM_TABLE_HEAD}>
              <tr>
                <th className={ROOM_TABLE_TH}>Room</th>
                <th className={ROOM_TABLE_TH}>Type</th>
                <th className={ROOM_TABLE_TH}>Task</th>
                <th className={ROOM_TABLE_TH}>Status</th>
                <th className={ROOM_TABLE_TH}>Priority</th>
                <th className={ROOM_TABLE_TH}>Attendant</th>
                <th className={ROOM_TABLE_TH}>When</th>
                <th className={ROOM_TABLE_TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.isLoading ? (
                <tr>
                  <td colSpan={8} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    Loading tasks…
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    No tasks match these filters.
                  </td>
                </tr>
              ) : (
                tableRows.map((task) => {
                  const permissions = cleaningPermissions(task, {
                    isSupervisor,
                    canEditTask,
                    canCancelTask,
                    own: own(task.assignedMembershipId),
                  });
                  const primary = primaryCleaningAction(task, permissions);
                  const secondary = secondaryCleaningActions(permissions, primary);
                  return (
                    <tr
                      key={task.id}
                      tabIndex={0}
                      className={cn(
                        ROOM_TABLE_ROW,
                        "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]",
                        openTaskId === task.id && "bg-[#F4E9D0]/70",
                      )}
                      onClick={() => setOpenTaskId(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpenTaskId(task.id);
                        }
                      }}
                    >
                      <td className={`${ROOM_TABLE_TD} font-medium text-[#251605]`}>{task.roomNumber}</td>
                      <td className={ROOM_TABLE_TD}>{task.roomTypeName}</td>
                      <td className={ROOM_TABLE_TD}>{labelTaskType(task.taskType)}</td>
                      <td className={ROOM_TABLE_TD}>
                        <CleaningStatusChip status={task.status} />
                      </td>
                      <td className={ROOM_TABLE_TD}>
                        <CleaningPriorityChip priority={task.priority} />
                      </td>
                      <td className={ROOM_TABLE_TD}>{task.assignedName ?? "Unassigned"}</td>
                      <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{cleaningCardStamp(task) ?? "—"}</td>
                      <td className={ROOM_TABLE_TD} onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {primary ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={primary === "complete" ? "default" : "outline"}
                              className={cn(
                                "h-8 px-2.5 text-xs",
                                primary === "complete"
                                  ? "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                                  : "border-[#DDD4C5]",
                              )}
                              disabled={act.isPending || complete.isPending}
                              onClick={() => runAction(task, primary)}
                            >
                              {cleaningActionLabel(primary)}
                            </Button>
                          ) : null}
                          {secondary.length > 0 ? (
                            <CleaningActionMenu actions={secondary} onAction={(action) => runAction(task, action)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewTaskDialog
        restaurantId={restaurantId}
        open={createTaskOpen}
        lockedRoom={null}
        rooms={rack.data ?? []}
        onClose={() => setCreateTaskOpen(false)}
        onDone={() => invalidate()}
      />

      <Dialog open={assignTask !== null} onOpenChange={(open) => !open && setAssignTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign task</DialogTitle>
            <DialogDescription>Pick an active staff member for this cleaning task.</DialogDescription>
          </DialogHeader>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger>
              <SelectValue placeholder="Select staff member" />
            </SelectTrigger>
            <SelectContent>
              {(staff.data ?? []).map((s) => (
                <SelectItem key={s.membershipId} value={s.membershipId}>
                  {s.name} · {s.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTask(null)}>
              Cancel
            </Button>
            <Button
              disabled={!assignee || act.isPending}
              onClick={() =>
                act.mutate({
                  taskId: assignTask!,
                  action: "assign",
                  assigneeMembershipId: assignee,
                  notes: assignNotes,
                })
              }
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CleaningTaskDrawer
        restaurantId={restaurantId}
        task={openTask}
        taskDate={taskDate}
        pending={act.isPending || complete.isPending}
        permissions={
          openTask
            ? cleaningPermissions(openTask, {
                isSupervisor,
                canEditTask,
                canCancelTask,
                own: own(openTask.assignedMembershipId),
              })
            : null
        }
        onAction={(action) => openTask && runAction(openTask, action)}
        onClose={() => setOpenTaskId(null)}
      />
    </div>
  );
}

function cleaningStatusLabel(status: string): string {
  if (status === "pending") return "Pending";
  if (status === "assigned") return "Assigned";
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function cleaningPriorityLabel(priority: string): string {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "Priority";
  return "Normal";
}

function cleaningActionLabel(action: CleaningAction): string {
  if (action === "assign") return "Assign";
  if (action === "start") return "Start cleaning";
  if (action === "complete") return "Complete";
  return "Cancel";
}

function taskInCleaningLane(task: HousekeepingTask, lane: CleaningLane, date: string): boolean {
  if (lane === "completed") {
    return task.status === "completed" && (task.completedAt ?? "").slice(0, 10) === date;
  }
  return task.status === lane;
}

function cleaningPermissions(
  task: HousekeepingTask,
  opts: { isSupervisor: boolean; canEditTask: boolean; canCancelTask: boolean; own: boolean },
): Record<CleaningAction, boolean> {
  const open = task.status !== "completed" && task.status !== "cancelled";
  const actor = opts.isSupervisor || opts.own;
  return {
    assign: open && opts.isSupervisor && opts.canEditTask,
    start: open && task.status !== "in_progress" && opts.canEditTask && actor,
    complete: open && opts.canEditTask && actor,
    cancel: open && opts.isSupervisor && opts.canCancelTask,
  };
}

function primaryCleaningAction(
  task: HousekeepingTask,
  permissions: Record<CleaningAction, boolean>,
): CleaningAction | null {
  if (task.status === "completed" || task.status === "cancelled") return null;
  if (task.status === "pending" && permissions.assign) return "assign";
  if (task.status === "assigned" && permissions.start) return "start";
  if (task.status === "in_progress" && permissions.complete) return "complete";
  if (permissions.assign) return "assign";
  if (permissions.start) return "start";
  if (permissions.complete) return "complete";
  return null;
}

function secondaryCleaningActions(
  permissions: Record<CleaningAction, boolean>,
  primary: CleaningAction | null,
): CleaningAction[] {
  return (["assign", "start", "complete", "cancel"] as const).filter(
    (action) => permissions[action] && action !== primary,
  );
}

function cleaningCardStamp(task: HousekeepingTask): string | null {
  if (task.status === "completed") {
    return task.completedAt ? `Completed ${formatWhen(task.completedAt)}` : null;
  }
  if (task.status === "in_progress" && task.startedAt) return `Started ${formatWhen(task.startedAt)}`;
  return `Created ${formatWhen(task.createdAt)}`;
}

function formatCleaningDate(value: string): string {
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(date);
  return `${weekday} ${date.getUTCDate()} ${month}`;
}

function CleaningStatusChip({ status }: { status: string }) {
  const tone =
    status === "assigned"
      ? "bg-amber-50 text-amber-900"
      : status === "in_progress"
        ? "bg-sky-50 text-sky-800"
        : status === "completed"
          ? "bg-emerald-50 text-emerald-800"
          : status === "cancelled"
            ? "bg-[#F4EFE7] text-[#756A5B] line-through"
            : "bg-[#F4EFE7] text-[#5F492D]";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {cleaningStatusLabel(status)}
    </span>
  );
}

function CleaningPriorityChip({ priority }: { priority: string }) {
  const tone =
    priority === "urgent"
      ? "bg-rose-50 text-rose-800"
      : priority === "high"
        ? "bg-[#F4E9D0] text-[#8A641A]"
        : "border border-[#EADBBD] bg-white text-[#5F492D]";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {cleaningPriorityLabel(priority)}
    </span>
  );
}

function CleaningEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4] px-2.5 py-3 text-center">
      <p className="text-xs font-medium text-[#5C5346]">{label}</p>
    </div>
  );
}

function CleaningActionMenu({
  actions,
  onAction,
  floating = false,
}: {
  actions: CleaningAction[];
  onAction: (action: CleaningAction) => void;
  floating?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More task actions"
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md text-[#756A5B] hover:bg-[#F3EEE4] hover:text-[#251605] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            floating && "absolute right-1.5 top-1.5 z-10",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 w-44" onClick={(event) => event.stopPropagation()}>
        {actions.map((action) => (
          <DropdownMenuItem key={action} onSelect={() => onAction(action)}>
            {cleaningActionLabel(action)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CleaningTaskCard({
  task,
  field = false,
  selected = false,
  pending,
  permissions,
  onOpen,
  onAction,
}: {
  task: HousekeepingTask;
  field?: boolean;
  selected?: boolean;
  pending: boolean;
  permissions: Record<CleaningAction, boolean>;
  onOpen: () => void;
  onAction: (action: CleaningAction) => void;
}) {
  const primary = primaryCleaningAction(task, permissions);
  const secondary = secondaryCleaningActions(permissions, primary);
  const stamp = cleaningCardStamp(task);
  return (
    <article
      className={cn(
        "relative rounded-xl border border-[#E8E0D4] bg-white p-2.5 shadow-[0_1px_2px_rgba(37,22,5,0.06)] transition-colors",
        "hover:border-[#C89933] hover:bg-[#FBF7EE]",
        selected && "border-[#C89933] ring-1 ring-[#C89933]/40",
        field && "py-3",
      )}
      data-testid={`hk-cleaning-card-${task.roomNumber}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]"
        aria-label={`Open cleaning task for room ${task.roomNumber}`}
        onClick={onOpen}
      />
      {secondary.length > 0 ? <CleaningActionMenu floating actions={secondary} onAction={onAction} /> : null}
      <div className={cn("pointer-events-none relative", secondary.length > 0 && "pr-7")}>
        <p className="font-display text-base font-semibold leading-none tracking-tight text-[#251605]">
          {task.roomNumber}
        </p>
        <p className="mt-1 text-xs text-[#5C5346]">{labelTaskType(task.taskType)}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <CleaningStatusChip status={task.status} />
          <CleaningPriorityChip priority={task.priority} />
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-[#756A5B]">{task.assignedName ?? "Unassigned"}</p>
        {stamp ? <p className="mt-0.5 text-[11px] leading-4 text-[#756A5B]">{stamp}</p> : null}
        {task.notes ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#5C5346]">{task.notes}</p> : null}
      </div>
      {primary ? (
        <div className="relative z-10 mt-2">
          <Button
            type="button"
            size="sm"
            variant={primary === "complete" ? "default" : "outline"}
            className={cn(
              field ? HK_FIELD_ACTION_CLASS : "h-8 px-2.5 text-xs",
              primary === "complete"
                ? "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                : "border-[#DDD4C5] bg-white",
            )}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              onAction(primary);
            }}
          >
            {cleaningActionLabel(primary)}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function CleaningTaskDrawer({
  restaurantId,
  task,
  taskDate,
  pending,
  permissions,
  onAction,
  onClose,
}: {
  restaurantId: string;
  task: HousekeepingTask | null;
  taskDate: string;
  pending: boolean;
  permissions: Record<CleaningAction, boolean> | null;
  onAction: (action: CleaningAction) => void;
  onClose: () => void;
}) {
  const fetchHistory = useServerFn(listHousekeepingHistory);
  const history = useQuery({
    queryKey: ["hk-history", restaurantId, task?.roomId, "cleaning-drawer"],
    queryFn: () =>
      fetchHistory({
        data: { restaurantId, roomId: task!.roomId, eventGroup: "cleaning" },
      }),
    enabled: !!task,
  });
  const primary = task && permissions ? primaryCleaningAction(task, permissions) : null;
  const secondary = permissions ? secondaryCleaningActions(permissions, primary) : [];
  const activity = (history.data ?? []).slice(0, 6);

  return (
    <Sheet open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-[360px] gap-0 overflow-y-auto border-l border-[#DDD4C5] bg-white p-0 shadow-xl sm:max-w-[360px] [&>button]:hidden"
      >
        {task ? (
          <div className="min-h-full bg-white" data-testid="hk-cleaning-drawer">
            <header className="border-b border-[#E8E1D7] px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display text-lg font-bold leading-tight text-[#251605]">
                    {task.roomNumber}
                  </SheetTitle>
                  <SheetDescription className="mt-1 text-xs leading-4 text-[#5C5346]">
                    {labelTaskType(task.taskType)}
                    {" · "}
                    {formatCleaningDate(taskDate)}
                  </SheetDescription>
                </div>
                <SheetClose className="grid size-8 shrink-0 place-items-center rounded-md text-[#251605] hover:bg-[#F3EEE4]">
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </SheetClose>
              </div>
            </header>

            <CleaningDrawerSection title="Task summary">
              <div className="flex flex-wrap gap-1">
                <CleaningStatusChip status={task.status} />
                <CleaningPriorityChip priority={task.priority} />
              </div>
              <p>{labelTaskType(task.taskType)}</p>
            </CleaningDrawerSection>

            <CleaningDrawerSection title="Room">
              <CleaningDrawerFact label="Room" value={task.roomNumber} />
              <CleaningDrawerFact label="Room type" value={task.roomTypeName} />
              <Link
                to={hkRoomQuickViewPath(task.roomId).to}
                search={hkRoomQuickViewPath(task.roomId).search}
                className="inline-block text-xs font-medium text-[#8A641A]"
              >
                Open room
              </Link>
            </CleaningDrawerSection>

            <CleaningDrawerSection title="Assignment">
              <CleaningDrawerFact label="Attendant" value={task.assignedName ?? "Unassigned"} />
            </CleaningDrawerSection>

            <CleaningDrawerSection title="Timing">
              <CleaningDrawerFact label="Created" value={formatWhen(task.createdAt)} />
              <CleaningDrawerFact label="Started" value={task.startedAt ? formatWhen(task.startedAt) : "—"} />
              <CleaningDrawerFact label="Completed" value={task.completedAt ? formatWhen(task.completedAt) : "—"} />
            </CleaningDrawerSection>

            <CleaningDrawerSection title="Notes">
              {task.notes ? <p className="whitespace-pre-wrap">{task.notes}</p> : <p className="text-[#756A5B]">No notes</p>}
            </CleaningDrawerSection>

            <CleaningDrawerSection title="Recent activity">
              {history.isLoading ? (
                <p className="text-[#756A5B]">Loading activity…</p>
              ) : history.isError ? (
                <p className="text-[#756A5B]">Recent activity could not be loaded.</p>
              ) : activity.length === 0 ? (
                <p className="text-[#756A5B]">No recent cleaning activity for this room.</p>
              ) : (
                activity.map((row) => (
                  <p key={row.id} className="text-[#5C5346]">
                    {formatHousekeepingHistoryDetail({
                      eventType: row.eventType,
                      notes: row.notes,
                      newValues: row.newValues,
                      previousValues: row.previousValues,
                    })}
                    {" · "}
                    {formatWhen(row.createdAt)}
                  </p>
                ))
              )}
            </CleaningDrawerSection>

            {primary || secondary.length > 0 ? (
              <CleaningDrawerSection title="Actions">
                <div className="flex flex-col gap-2">
                  {primary ? (
                    <Button
                      type="button"
                      className={cn(
                        HK_FIELD_ACTION_CLASS,
                        primary === "complete"
                          ? "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                          : "border-[#DDD4C5]",
                      )}
                      variant={primary === "complete" ? "default" : "outline"}
                      disabled={pending}
                      onClick={() => onAction(primary)}
                    >
                      {cleaningActionLabel(primary)}
                    </Button>
                  ) : null}
                  {secondary.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      variant="outline"
                      className={cn(HK_FIELD_ACTION_CLASS, "border-[#DDD4C5]")}
                      disabled={pending}
                      onClick={() => onAction(action)}
                    >
                      {cleaningActionLabel(action)}
                    </Button>
                  ))}
                </div>
              </CleaningDrawerSection>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CleaningDrawerFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-0.5 text-xs">
      <dt className="text-[#756A5B]">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

function CleaningDrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#E8E1D7] px-4 py-3 last:border-b-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#756A5B]">{title}</h3>
      <div className="mt-2 space-y-1.5 text-xs leading-5 text-[#251605]">{children}</div>
    </section>
  );
}

function CleaningDateControl({
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
    <div className="flex items-center gap-1.5" data-testid="hk-cleaning-date">
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
        {formatCleaningDate(value)}
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

/* -------------------------------------------------------------- inspections */

export function InspectionsTab({
  restaurantId,
  today,
  canInspect = false,
}: Props & { canInspect?: boolean }) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchInspections = useServerFn(listInspections);
  const inspectFn = useServerFn(inspectRoom);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const inspections = useQuery({
    queryKey: ["hk-inspections", restaurantId],
    queryFn: () => fetchInspections({ data: { restaurantId } }),
  });

  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState<{ room: RackRoom; result: "passed" | "failed" } | null>(null);
  const [query, setQuery] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      inspectFn({
        data: {
          restaurantId,
          roomId: target!.room.id,
          taskId: null,
          result: target!.result,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success(
        target?.result === "passed"
          ? "Inspection passed. Ready is derived from Housekeeping Setup — not a Ready status."
          : "Inspection failed — room is dirty and a re-clean task is open.",
      );
      invalidate();
      setTarget(null);
      setNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const queryText = query.trim().toLowerCase();
  const awaiting = (rack.data ?? []).filter((r) => {
    if (!r.awaitingInspection) return false;
    if (!queryText) return true;
    return `${r.roomNumber} ${r.roomTypeName} ${r.guestName ?? ""}`.toLowerCase().includes(queryText);
  });
  const history = (inspections.data ?? []).filter((i) => {
    if (i.status !== "passed" && i.status !== "failed") return false;
    if (!queryText) return true;
    return `${i.roomNumber} ${i.status} ${i.inspectorName ?? ""} ${i.notes ?? ""}`.toLowerCase().includes(queryText);
  });
  const failNeedsNotes = target?.result === "failed" && notes.trim().length === 0;

  return (
    <div className="space-y-6" data-testid="hk-inspections">
      <HkShellSlot name="date">
        <HkBusinessDate today={today} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, inspector, or note…"
          testId="hk-inspections-search"
        />
      </HkShellSlot>
      <section className="space-y-3">
        <h3 className="font-display text-lg">Awaiting inspection ({awaiting.length})</h3>
        {awaiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cleaned rooms are waiting for inspection. If inspection is off in Housekeeping Setup, clean rooms
            skip this queue.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {awaiting.map((r) => (
              <div key={r.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">Room {r.roomNumber}</p>
                  <HkStatusBadge status={r.housekeepingStatus} />
                </div>
                <p className="text-sm text-muted-foreground">{r.roomTypeName}</p>
                <p className="text-xs text-muted-foreground">{occupancyCaption(r)}</p>
                <p
                  className={cn(
                    "text-xs font-medium",
                    r.checkInReady ? "text-teal-800" : "text-rose-800",
                  )}
                >
                  {r.checkInReady ? "Ready for check-in" : "Not ready for check-in"}
                </p>
                {r.readyReason ? (
                  <p className="text-xs text-muted-foreground">{r.readyReason}</p>
                ) : null}
                {canInspect ? (
                  <HkFieldActions>
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      onClick={() => setTarget({ room: r, result: "passed" })}
                    >
                      Pass
                    </Button>
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      variant="outline"
                      onClick={() => setTarget({ room: r, result: "failed" })}
                    >
                      Fail
                    </Button>
                  </HkFieldActions>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg">Inspection history</h3>
        <HkFieldStack testId="hk-inspections-history-field">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections yet.</p>
          ) : (
            history.map((i) => (
              <HkFieldCard key={i.id}>
                <p className="font-medium">Room {i.roomNumber}</p>
                <p className="text-sm capitalize">{i.status}</p>
                <p className="text-xs text-muted-foreground">{i.inspectorName ?? "—"}</p>
                {i.notes ? <p className="text-xs text-muted-foreground">{i.notes}</p> : null}
                <p className="text-xs text-muted-foreground">{formatWhen(i.completedAt ?? i.createdAt)}</p>
              </HkFieldCard>
            ))
          )}
        </HkFieldStack>
        <HkDesktopOnly className={ROOM_TABLE_WRAP}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className={ROOM_TABLE_HEAD}>
              <tr>
                <th className={ROOM_TABLE_TH}>Room</th>
                <th className={ROOM_TABLE_TH}>Result</th>
                <th className={ROOM_TABLE_TH}>Inspector</th>
                <th className={ROOM_TABLE_TH}>Notes</th>
                <th className={ROOM_TABLE_TH}>When</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    No inspections yet.
                  </td>
                </tr>
              ) : (
                history.map((i) => (
                  <tr key={i.id} className={ROOM_TABLE_ROW}>
                    <td className={`${ROOM_TABLE_TD} font-medium`}>{i.roomNumber}</td>
                    <td className={`${ROOM_TABLE_TD} capitalize`}>{i.status}</td>
                    <td className={ROOM_TABLE_TD}>{i.inspectorName ?? "—"}</td>
                    <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{i.notes ?? "—"}</td>
                    <td className={ROOM_TABLE_TD}>{formatWhen(i.completedAt ?? i.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </HkDesktopOnly>
      </section>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.result === "passed" ? "Pass inspection" : "Fail inspection"}
            </DialogTitle>
            <DialogDescription>
              Room {target?.room.roomNumber}.{" "}
              {target?.result === "passed"
                ? "Pass writes inspected (or the Card 2 transition target). Ready stays derived."
                : "Fail marks the room dirty and opens a re-clean task. Notes are required."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{target?.result === "failed" ? "Fail notes" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            {failNeedsNotes ? (
              <p className="text-xs text-rose-700">Describe why the room failed. There is no itemized fail list.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || failNeedsNotes}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------- restrictions */

export function RestrictionsTab({ restaurantId, canRestrict = false }: Props & { canRestrict?: boolean }) {
  const fetchRack = useServerFn(listRoomRack);
  const setFn = useServerFn(setRoomRestriction);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId],
    queryFn: () => fetchRack({ data: { restaurantId } }),
  });
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
  });
  const reasonOptions = resolveRestrictionReasonsForCreate(set4.data?.snapshot.restrictionReasons);

  const [target, setTarget] = useState<RackRoom | null>(null);
  const [status, setStatus] = useState("out_of_order");
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          restaurantId,
          roomId: target!.id,
          status: status as never,
          reason,
          expectedReturn: expected === "" ? null : expected,
        },
      }),
    onSuccess: () => {
      toast.success("Room restriction updated.");
      invalidate();
      setTarget(null);
      setReason("");
      setExpected("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <div className="space-y-4">
      <HkFieldStack testId="hk-restrictions-field-worklist">
        {(rack.data ?? []).map((r) => (
          <HkFieldCard key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">Room {r.roomNumber}</p>
              <RestrictionBadge status={r.restriction} />
            </div>
            <p className="text-xs text-muted-foreground">{r.restrictionReason ?? "No reason"}</p>
            {r.restrictionExpectedReturn ? (
              <p className="text-xs text-muted-foreground">Return {r.restrictionExpectedReturn}</p>
            ) : null}
            {canRestrict ? (
            <HkFieldActions>
              <Button
                className={HK_FIELD_ACTION_CLASS}
                variant="outline"
                onClick={() => {
                  setTarget(r);
                  setStatus(r.restriction === "available" ? "out_of_order" : "available");
                }}
              >
                {r.restriction === "available" ? "Restrict" : "Release"}
              </Button>
            </HkFieldActions>
            ) : null}
          </HkFieldCard>
        ))}
      </HkFieldStack>
      <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Room</th>
              <th className="p-3">Restriction</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Expected return</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(rack.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-medium">{r.roomNumber}</td>
                <td className="p-3">
                  <RestrictionBadge status={r.restriction} />
                </td>
                <td className="p-3 text-muted-foreground">{r.restrictionReason ?? "—"}</td>
                <td className="p-3">{r.restrictionExpectedReturn ?? "—"}</td>
                <td className="p-3 text-right">
                  {canRestrict ? (
                    r.restriction === "available" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(r);
                          setStatus("out_of_order");
                        }}
                      >
                        Restrict
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTarget(r);
                          setStatus("available");
                        }}
                      >
                        Release
                      </Button>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HkDesktopOnly>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room restriction</DialogTitle>
            <DialogDescription>Room {target?.roomNumber}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available (release)</SelectItem>
                  <SelectItem value="out_of_order">Out of order</SelectItem>
                  <SelectItem value="out_of_service">Out of service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reason {status !== "available" && <span className="text-destructive">*</span>}</Label>
              {reasonOptions.length ? (
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((row) => (
                      <SelectItem key={row.code} value={row.label}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              )}
            </div>
            {status !== "available" && (
              <div className="space-y-1.5">
                <Label>Expected return (optional)</Label>
                <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------ exceptions */

const EXCEPTION_KIND_LABEL: Record<HkExceptionKind, string> = {
  dirty_arrival: "Arrival not ready",
  inspect_failed: "Inspection failed",
  maintenance_blocker: "Maintenance",
  ooo_assigned: "OOO on stay",
  stale_task: "Stale task",
  dirty_vacant_no_task: "Dirty vacant",
  discrepancy: "Discrepancy",
};

function exceptionActionLabel(action: HkExceptionAction): string {
  if (action === "board") return "Open board";
  if (action === "cleaning") return "Open cleaning";
  if (action === "inspections") return "Open inspections";
  if (action === "maintenance") return "Open maintenance";
  if (action === "restrictions") return "Set restriction";
  return "Resolve";
}

export function ExceptionsTab({ restaurantId, today }: Props) {
  const navigate = useNavigate();
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listHousekeepingExceptions);
  const createFn = useServerFn(createDiscrepancy);
  const resolveFn = useServerFn(resolveDiscrepancy);
  const invalidate = useInvalidateHousekeeping(restaurantId);

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const list = useQuery({
    queryKey: ["hk-exceptions", restaurantId, today],
    queryFn: () => fetchList({ data: { restaurantId, today } }),
  });

  const [open, setOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<HkExceptionKind | "all">("all");
  const [query, setQuery] = useState("");
  const [roomId, setRoomId] = useState("");
  const [reportedOcc, setReportedOcc] = useState("vacant");
  const [actualOcc, setActualOcc] = useState("occupied");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          restaurantId,
          roomId,
          reportedOccupancy: reportedOcc as never,
          actualOccupancy: actualOcc as never,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Discrepancy logged.");
      invalidate();
      setOpen(false);
      setReason("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const resolve = useMutation({
    mutationFn: (discrepancyId: string) => resolveFn({ data: { restaurantId, discrepancyId } }),
    onSuccess: () => {
      toast.success("Discrepancy resolved.");
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const rows = list.data ?? [];
  const queryText = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (kindFilter !== "all" && row.kind !== kindFilter) return false;
    if (!queryText) return true;
    return `${row.roomNumber} ${row.title} ${row.detail} ${row.source}`.toLowerCase().includes(queryText);
  });

  function go(action: HkExceptionAction) {
    if (action === "resolve_discrepancy") return;
    const dest = hkAreaPath(action);
    void navigate({ to: dest.to, search: dest.search });
  }

  return (
    <div className="space-y-4" data-testid="hk-exceptions-workspace">
      <HkShellSlot name="date">
        <HkBusinessDate today={today} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, exception, or detail…"
          testId="hk-exceptions-search"
        />
      </HkShellSlot>
      <HkShellSlot name="filter">
        <PmsFilterPopover
          title="Filter Exceptions"
          activeCount={kindFilter !== "all" ? 1 : 0}
          open={filterMenuOpen}
          onOpenChange={setFilterMenuOpen}
          onClear={() => setKindFilter("all")}
          onApply={() => setFilterMenuOpen(false)}
          buttonTestId="hk-exceptions-filters-button"
          menuTestId="hk-exceptions-filters-menu"
        >
          <PmsFilterSection title="Exception type">
            <PmsFilterSelect
              value={kindFilter}
              onValueChange={(value) => setKindFilter(value as HkExceptionKind | "all")}
              options={[
                ["all", "All"],
                ...(Object.keys(EXCEPTION_KIND_LABEL) as HkExceptionKind[]).map(
                  (kind) => [kind, EXCEPTION_KIND_LABEL[kind]] as const,
                ),
              ]}
              ariaLabel="Exception"
            />
          </PmsFilterSection>
        </PmsFilterPopover>
      </HkShellSlot>
      <HkShellSlot name="cta">
        <Button className={HK_SHELL_PRIMARY_BUTTON} onClick={() => setOpen(true)}>
          Report discrepancy
        </Button>
      </HkShellSlot>

      <HkFieldStack testId="hk-exceptions-field-worklist">
        {list.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading exceptions…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No housekeeping exceptions.</p>
        ) : (
          filtered.map((row) => (
            <HkFieldCard key={row.key}>
              <p className="font-medium">Room {row.roomNumber}</p>
              <p className="text-sm">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
              <HkFieldActions>
                {row.action === "resolve_discrepancy" && row.discrepancyId ? (
                  <Button
                    className={HK_FIELD_ACTION_CLASS}
                    variant="outline"
                    onClick={() => resolve.mutate(row.discrepancyId!)}
                  >
                    Resolve
                  </Button>
                ) : (
                  <Button className={HK_FIELD_ACTION_CLASS} variant="outline" onClick={() => go(row.action)}>
                    {exceptionActionLabel(row.action)}
                  </Button>
                )}
              </HkFieldActions>
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>
      <HkDesktopOnly className={ROOM_TABLE_WRAP}>
        <table className="w-full min-w-[800px] text-sm">
          <thead className={ROOM_TABLE_HEAD}>
            <tr>
              <th className={ROOM_TABLE_TH}>Room</th>
              <th className={ROOM_TABLE_TH}>Exception</th>
              <th className={ROOM_TABLE_TH}>Detail</th>
              <th className={ROOM_TABLE_TH}>Source</th>
              <th className={`${ROOM_TABLE_TH} text-right`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td colSpan={5} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                  Loading exceptions…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                  No housekeeping exceptions.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.key} className={ROOM_TABLE_ROW}>
                  <td className={`${ROOM_TABLE_TD} font-medium`}>{row.roomNumber}</td>
                  <td className={ROOM_TABLE_TD}>{row.title}</td>
                  <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{row.detail}</td>
                  <td className={`${ROOM_TABLE_TD} capitalize`}>{row.source}</td>
                  <td className={`${ROOM_TABLE_TD} text-right`}>
                    {row.action === "resolve_discrepancy" && row.discrepancyId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve.mutate(row.discrepancyId!)}
                      >
                        Resolve
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => go(row.action)}>
                        {exceptionActionLabel(row.action)}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </HkDesktopOnly>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report discrepancy</DialogTitle>
            <DialogDescription>Log a mismatch between the system and the floor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hk-disc-room">Room</Label>
              <SearchableSelect
                id="hk-disc-room"
                value={roomId}
                options={(rack.data ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.roomNumber} · ${r.roomTypeName}`,
                }))}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setRoomId}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>System says</Label>
                <Select value={reportedOcc} onValueChange={setReportedOcc}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Housekeeping found</Label>
                <Select value={actualOcc} onValueChange={setActualOcc}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={!roomId || create.isPending}>
              Log discrepancy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const DiscrepanciesTab = ExceptionsTab;

/* -------------------------------------------------------------- maintenance */

export function MaintenanceTab({
  restaurantId,
  today,
  canCreateMaintenance = false,
  canEditMaintenance = false,
}: Props & { canCreateMaintenance?: boolean; canEditMaintenance?: boolean }) {
  const fetchRack = useServerFn(listRoomRack);
  const fetchList = useServerFn(listMaintenanceRequests);
  const createFn = useServerFn(createMaintenanceRequest);
  const updateFn = useServerFn(updateMaintenanceRequest);
  const loadSet4 = useServerFn(getPmsSet4Snapshot);
  const invalidate = useInvalidateHousekeeping(restaurantId);
  const set4 = useQuery({
    queryKey: ["pms-set4-snapshot", restaurantId],
    queryFn: () => loadSet4({ data: { restaurantId } }),
    retry: false,
  });
  const liveCategories = ["plumbing", "electrical", "furniture", "equipment", "other"];
  const livePriorities = ["normal", "high", "urgent"];
  const savedCategories = resolveMaintenanceCategoriesForCreate(set4.data?.snapshot.maintenanceCategories).filter(
    (row) => liveCategories.includes(row.code),
  );
  const savedPriorities = resolvePrioritiesForCreate(null, set4.data?.snapshot.maintenancePriorities).filter((row) =>
    livePriorities.includes(row.code),
  );
  const categoryOptions = savedCategories.length
    ? savedCategories
    : liveCategories.map((code) => ({ code, label: code }));
  const priorityOptions = savedPriorities.length
    ? savedPriorities
    : livePriorities.map((code) => ({ code, label: code }));

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const list = useQuery({
    queryKey: ["hk-maintenance", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
  });

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState("plumbing");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [workNotes, setWorkNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          restaurantId,
          roomId,
          category: category as never,
          priority: priority as never,
          description,
        },
      }),
    onSuccess: (row) => {
      toast.success("Maintenance request logged.");
      setSelectedId(row.id);
      invalidate();
      setOpen(false);
      setDescription("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const update = useMutation({
    mutationFn: (vars: { requestId: string; status: "open" | "in_progress" | "resolved"; notes?: string }) =>
      updateFn({ data: { restaurantId, ...vars } }),
    onSuccess: () => {
      invalidate();
      setWorkNotes("");
    },
    onError: (e) => toast.error(errText(e)),
  });

  const loaded = list.data ?? [];
  const queryText = query.trim().toLowerCase();
  const rows = loaded.filter((row) => {
    if (!queryText) return true;
    return `${row.roomNumber} ${row.description} ${row.category} ${row.status} ${row.priority}`.toLowerCase().includes(queryText);
  });
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const roomForSelected = selected ? (rack.data ?? []).find((r) => r.id === selected.roomId) : undefined;

  return (
    <div className="space-y-4" data-testid="hk-maintenance-workspace">
      <HkShellSlot name="date">
        <HkBusinessDate today={today} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, issue, or status…"
          testId="hk-maintenance-search"
        />
      </HkShellSlot>
      {canCreateMaintenance ? (
        <HkShellSlot name="cta">
          <Button
            className={HK_SHELL_PRIMARY_BUTTON}
            onClick={() => {
              setRoomId("");
              setDescription("");
              setOpen(true);
            }}
          >
            Create Work Order
          </Button>
        </HkShellSlot>
      ) : null}

      <HkFieldStack testId="hk-maintenance-field-worklist">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No maintenance requests.</p>
        ) : (
          rows.map((m) => (
            <HkFieldCard key={m.id} selected={selected?.id === m.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">Room {m.roomNumber}</p>
                <PriorityBadge priority={m.priority} />
              </div>
              <p className="text-sm">{m.description}</p>
              <p className="text-xs capitalize text-muted-foreground">{m.status.replace("_", " ")}</p>
              {canEditMaintenance && m.status !== "resolved" ? (
                <HkFieldActions>
                  {m.status === "open" ? (
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      variant="outline"
                      onClick={() =>
                        update.mutate({ requestId: m.id, status: "in_progress", notes: workNotes })
                      }
                    >
                      Start work
                    </Button>
                  ) : null}
                  <Button
                    className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
                    onClick={() => update.mutate({ requestId: m.id, status: "resolved", notes: workNotes })}
                  >
                    Complete work
                  </Button>
                </HkFieldActions>
              ) : null}
            </HkFieldCard>
          ))
        )}
      </HkFieldStack>

      <div className={cn("hidden gap-4 md:grid", selected && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <HkDesktopOnly className={`${ROOM_TABLE_WRAP} !block`}>
          <table className="w-full min-w-[800px] text-sm">
            <thead className={ROOM_TABLE_HEAD}>
              <tr>
                <th className={ROOM_TABLE_TH}>Room</th>
                <th className={ROOM_TABLE_TH}>Issue</th>
                <th className={ROOM_TABLE_TH}>Priority</th>
                <th className={ROOM_TABLE_TH}>Status</th>
                <th className={ROOM_TABLE_TH}>Created</th>
                <th className={ROOM_TABLE_TH}>Maintenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    No maintenance requests.
                  </td>
                </tr>
              ) : (
                rows.map((m) => {
                  const room = (rack.data ?? []).find((r) => r.id === m.roomId);
                  return (
                    <tr
                      key={m.id}
                      className={cn(
                        ROOM_TABLE_ROW,
                        "cursor-pointer",
                        selected?.id === m.id && "bg-[#F4E9D0]/70",
                      )}
                      onClick={() => setSelectedId(m.id)}
                    >
                      <td className={`${ROOM_TABLE_TD} font-medium`}>{m.roomNumber}</td>
                      <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{m.description}</td>
                      <td className={ROOM_TABLE_TD}>
                        <PriorityBadge priority={m.priority} />
                      </td>
                      <td className={`${ROOM_TABLE_TD} capitalize`}>{m.status.replace("_", " ")}</td>
                      <td className={ROOM_TABLE_TD}>{formatWhen(m.createdAt)}</td>
                      <td className={`${ROOM_TABLE_TD} capitalize`}>
                        {(room?.maintenanceStatus ?? "normal").replaceAll("_", " ")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </HkDesktopOnly>

        {selected ? (
        <aside className="rounded-2xl border border-border bg-background p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {selected.id.slice(0, 8).toUpperCase()} · {selected.status.replace("_", " ")}
              </p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedId(null)}
                >
                  Close
                </button>
              </div>
              <h3 className="font-display text-xl">{selected.description}</h3>
              <p className="text-sm text-muted-foreground">
                Room {selected.roomNumber}
                {roomForSelected ? ` · ${roomForSelected.roomTypeName}` : ""}
              </p>
              <p className="text-sm">
                Category <span className="capitalize">{selected.category}</span>
              </p>
              <p className="text-sm">
                Priority <PriorityBadge priority={selected.priority} />
              </p>
              <p className="text-sm">
                Room maintenance{" "}
                <span className="capitalize">
                  {(roomForSelected?.maintenanceStatus ?? "normal").replaceAll("_", " ")}
                </span>
              </p>
              {roomForSelected?.readyReason && !roomForSelected.checkInReady ? (
                <p className="text-xs text-rose-800">{roomForSelected.readyReason}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">Created {formatWhen(selected.createdAt)}</p>
              <p className="text-xs text-muted-foreground">
                Tickets stay on this table. Physical OOO/OOS is Inventory restrictions, not this column.
              </p>
              <div className="flex flex-col gap-1">
                <Link to={INVENTORY_HREF} className="text-xs text-[#C89933]">
                  Open room inventory
                </Link>
                <Link to={HK_HREF} search={{ tab: "restrictions" }} className="text-xs text-[#C89933]">
                  Set OOO / OOS restriction
                </Link>
              </div>
              {selected.status !== "resolved" ? (
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={workNotes} onChange={(e) => setWorkNotes(e.target.value)} rows={2} />
                </div>
              ) : null}
              {canEditMaintenance ? (
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                  {selected.status === "open" ? (
                    <Button
                      className={HK_FIELD_ACTION_CLASS}
                      variant="outline"
                      onClick={() =>
                        update.mutate({ requestId: selected.id, status: "in_progress", notes: workNotes })
                      }
                    >
                      Start work
                    </Button>
                  ) : null}
                  {selected.status !== "resolved" ? (
                    <Button
                      className={cn(HK_FIELD_ACTION_CLASS, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
                      onClick={() =>
                        update.mutate({ requestId: selected.id, status: "resolved", notes: workNotes })
                      }
                    >
                      Complete work
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
        </aside>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log maintenance request</DialogTitle>
            <DialogDescription>
              To take the room out of inventory, set a restriction separately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hk-maint-room">Room</Label>
              <SearchableSelect
                id="hk-maint-room"
                value={roomId}
                options={(rack.data ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.roomNumber} · ${r.roomTypeName}`,
                }))}
                placeholder="Select a room"
                searchPlaceholder="Search room number"
                emptyText="No rooms match."
                onChange={setRoomId}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((row) => (
                      <SelectItem key={row.code} value={row.code} className="capitalize">
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((row) => (
                      <SelectItem key={row.code} value={row.code} className="capitalize">
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => create.mutate()}
              disabled={!roomId || description.trim() === "" || create.isPending}
            >
              Log request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ----------------------------------------------------------------- history */

const HK_HISTORY_EVENT_TYPE_OPTIONS = Array.from(
  new Set(Object.values(HK_HISTORY_EVENTS_BY_GROUP).flatMap((types) => [...types])),
);

export function HousekeepingHistoryTab({ restaurantId, today }: Props) {
  const fetchHistory = useServerFn(listHousekeepingHistory);
  const fetchRack = useServerFn(listRoomRack);
  const fetchStaff = useServerFn(listHousekeepingStaff);
  const [roomId, setRoomId] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");

  const rack = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });
  const staff = useQuery({
    queryKey: ["hk-staff", restaurantId],
    queryFn: () => fetchStaff({ data: { restaurantId } }),
  });

  const eventGroup = (HK_HISTORY_FILTER_GROUPS as readonly string[]).includes(eventFilter)
    ? eventFilter
    : undefined;
  const eventType = HK_HISTORY_EVENT_TYPE_OPTIONS.includes(eventFilter) ? eventFilter : undefined;

  const q = useQuery({
    queryKey: ["hk-history", restaurantId, roomId, eventFilter, actorId, dateFrom, dateTo],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          ...(roomId !== "all" ? { roomId } : {}),
          ...(eventGroup ? { eventGroup: eventGroup as (typeof HK_HISTORY_FILTER_GROUPS)[number] } : {}),
          ...(eventType ? { eventType: eventType as never } : {}),
          ...(actorId !== "all" ? { actorMembershipId: actorId as never } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      }),
  });

  const roomOptions = (rack.data ?? [])
    .slice()
    .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }))
    .map((room) => ({ value: room.id, label: room.roomNumber }));
  const queryText = query.trim().toLowerCase();
  const rows = (q.data ?? []).filter((h) => {
    if (!queryText) return true;
    return `${h.roomNumber ?? ""} ${h.eventType} ${h.actorName ?? ""} ${h.notes ?? ""}`.toLowerCase().includes(queryText);
  });
  const eventLabel =
    eventFilter === "all"
      ? ""
      : HK_HISTORY_FILTER_GROUP_LABELS[eventFilter as keyof typeof HK_HISTORY_FILTER_GROUP_LABELS] ??
        eventFilter.replace(/_/g, " ");
  const actorLabel =
    actorId === "all"
      ? ""
      : actorId === "system"
        ? "System"
        : (staff.data ?? []).find((person) => person.membershipId === actorId)?.name ?? "";
  const roomLabel = roomId === "all" ? "" : roomOptions.find((room) => room.value === roomId)?.label ?? "";
  const filterCount =
    (roomId !== "all" ? 1 : 0) +
    (eventFilter !== "all" ? 1 : 0) +
    (actorId !== "all" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <div className="space-y-3">
      <HkShellSlot name="date">
        <HkBusinessDate today={today} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search room, event, actor, or detail…"
          testId="hk-history-search"
        />
      </HkShellSlot>
      <HkShellSlot name="filter">
        <PmsFilterMenu
          activeCount={filterCount}
          onClear={() => {
            setRoomId("all");
            setEventFilter("all");
            setActorId("all");
            setDateFrom("");
            setDateTo("");
          }}
          buttonTestId="hk-history-filters-button"
          menuTestId="hk-history-filters-menu"
        >
          <PmsFilterChoiceRow
            label="Room"
            value={roomId}
            current={roomLabel}
            options={[["all", "All rooms"], ...roomOptions.map((room) => [room.value, room.label] as const)]}
            onChange={setRoomId}
          />
          <PmsFilterChoiceRow
            label="Event type"
            value={eventFilter}
            current={eventLabel}
            options={[
              ["all", "All events"],
              ...HK_HISTORY_FILTER_GROUPS.map((group) => [group, HK_HISTORY_FILTER_GROUP_LABELS[group]] as const),
              ...HK_HISTORY_EVENT_TYPE_OPTIONS.map((type) => [type, type.replace(/_/g, " ")] as const),
            ]}
            onChange={setEventFilter}
          />
          <PmsFilterChoiceRow
            label="Actor"
            value={actorId}
            current={actorLabel}
            options={[
              ["all", "Anyone"],
              ["system", "System"],
              ...(staff.data ?? []).map((person) => [person.membershipId, person.name] as const),
            ]}
            onChange={setActorId}
          />
          <PmsFilterNoteRow label="From">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </PmsFilterNoteRow>
          <PmsFilterNoteRow label="To">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </PmsFilterNoteRow>
        </PmsFilterMenu>
      </HkShellSlot>
      <HkShellSlot name="export">
        <HkShellExportButton
          disabled={rows.length === 0}
          testId="hk-history-export"
          onClick={() =>
            downloadCsv(
              `housekeeping-history-${today}.csv`,
              ["When", "Room", "Event", "Actor", "Detail"],
              rows.map((h) => [
                formatWhen(h.createdAt),
                h.roomNumber ?? "",
                h.eventType.replace(/_/g, " "),
                h.actorName ?? "System",
                formatHousekeepingHistoryDetail({
                  eventType: h.eventType,
                  notes: h.notes,
                  newValues: h.newValues,
                  previousValues: h.previousValues,
                }),
              ]),
            )
          }
        />
      </HkShellSlot>
      <HkFieldStack testId="hk-history-field-worklist">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No housekeeping activity yet.</p>
        ) : (
          rows.map((h) => {
            const qv = h.roomId ? hkRoomQuickViewPath(h.roomId) : null;
            return (
              <HkFieldCard key={h.id}>
                <p className="text-xs text-muted-foreground">{formatWhen(h.createdAt)}</p>
                {qv ? (
                  <Link to={qv.to} search={qv.search} className="font-medium underline-offset-2 hover:underline">
                    {h.roomNumber ?? "Room"}
                  </Link>
                ) : (
                  <p className="font-medium">{h.roomNumber ?? "—"}</p>
                )}
                <p className="text-sm">{h.eventType.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{h.actorName ?? "System"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatHousekeepingHistoryDetail({
                    eventType: h.eventType,
                    notes: h.notes,
                    newValues: h.newValues,
                    previousValues: h.previousValues,
                  })}
                </p>
              </HkFieldCard>
            );
          })
        )}
      </HkFieldStack>
      <HkDesktopOnly className={ROOM_TABLE_WRAP}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className={ROOM_TABLE_HEAD}>
            <tr>
              <th className={ROOM_TABLE_TH}>When</th>
              <th className={ROOM_TABLE_TH}>Room</th>
              <th className={ROOM_TABLE_TH}>Event</th>
              <th className={ROOM_TABLE_TH}>Actor</th>
              <th className={ROOM_TABLE_TH}>Detail</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                  Loading history…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                  No housekeeping activity yet.
                </td>
              </tr>
            ) : (
              rows.map((h) => {
                const qv = h.roomId ? hkRoomQuickViewPath(h.roomId) : null;
                return (
                  <tr key={h.id} className={`${ROOM_TABLE_ROW} align-top`}>
                    <td className={`${ROOM_TABLE_TD} whitespace-nowrap`}>{formatWhen(h.createdAt)}</td>
                    <td className={ROOM_TABLE_TD}>
                      {qv ? (
                        <Link to={qv.to} search={qv.search} className="font-medium text-foreground underline-offset-2 hover:underline">
                          {h.roomNumber ?? "Room"}
                        </Link>
                      ) : (
                        (h.roomNumber ?? "—")
                      )}
                    </td>
                    <td className={ROOM_TABLE_TD}>{h.eventType.replace(/_/g, " ")}</td>
                    <td className={ROOM_TABLE_TD}>{h.actorName ?? "System"}</td>
                    <td className={`${ROOM_TABLE_TD} text-xs text-muted-foreground`}>
                      {formatHousekeepingHistoryDetail({
                        eventType: h.eventType,
                        notes: h.notes,
                        newValues: h.newValues,
                        previousValues: h.previousValues,
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </HkDesktopOnly>
    </div>
  );
}
