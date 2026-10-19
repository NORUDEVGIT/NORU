import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Download,
  FileText,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  createMaintenanceRequest,
  listMaintenanceRequests,
  updateMaintenanceRequest,
  type MaintenanceRequest,
} from "@/packages/pms/lib/housekeeping.functions";
import { listRoomInventoryEvents } from "@/packages/pms/lib/room-inventory.functions";
import { getRoomsDashboard, listRooms, type HotelRoom } from "@/packages/pms/lib/rooms.functions";
import {
  InventoryMetric,
  InventoryState,
  InventoryStatusBadge,
  PmsSelect,
} from "./room-inventory-shared";
import { dateLabel } from "./room-inventory-utils";

export function RoomFloorPlanView({ restaurantId }: { restaurantId: string }) {
  const loadRooms = useServerFn(listRooms);
  const query = useQuery({
    queryKey: ["room-floor-plan", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [status, setStatus] = useState("all");
  const rooms = (query.data ?? []).filter(
    (room) =>
      (building === "all" || room.building === building) &&
      (floor === "all" || room.floor === floor) &&
      (status === "all" || (!room.active ? status === "inactive" : room.status === status)),
  );
  const groups = useMemo(() => {
    const result = new Map<string, HotelRoom[]>();
    for (const room of rooms) {
      const key = [
        room.building || "Unassigned building",
        room.floor ? `Floor ${room.floor}` : "Unassigned floor",
      ].join(" · ");
      result.set(key, [...(result.get(key) ?? []), room]);
    }
    return result;
  }, [rooms]);
  const buildings = Array.from(
    new Set((query.data ?? []).map((room) => room.building).filter(Boolean)),
  ) as string[];
  const floors = Array.from(
    new Set((query.data ?? []).map((room) => room.floor).filter(Boolean)),
  ) as string[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-4">
        <FilterSelect
          label="Building"
          value={building}
          onChange={setBuilding}
          options={["all", ...buildings]}
        />
        <FilterSelect
          label="Floor"
          value={floor}
          onChange={setFloor}
          options={["all", ...floors]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={["all", "available", "out_of_order", "out_of_service", "inactive"]}
        />
      </div>
      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Floor plan could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : groups.size === 0 ? (
        <InventoryState state="empty" title="No rooms match these filters" />
      ) : (
        Array.from(groups).map(([group, values]) => (
          <section key={group} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{group}</h3>
              <span className="text-xs text-muted-foreground">{values.length} rooms</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              {values.map((room) => (
                <RoomTile key={room.id} room={room} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function RoomTile({ room }: { room: HotelRoom }) {
  const tone = !room.active
    ? "neutral"
    : room.status === "available"
      ? "success"
      : room.status === "out_of_order"
        ? "warning"
        : "danger";
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Room {room.roomNumber}</p>
          <p className="text-xs text-muted-foreground">{room.roomTypeName}</p>
        </div>
        <InventoryStatusBadge tone={tone}>
          {!room.active ? "Inactive" : room.status.replaceAll("_", " ")}
        </InventoryStatusBadge>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <span>Housekeeping: {room.housekeepingStatus?.replaceAll("_", " ") ?? "Not set"}</span>
        <span>Maintenance: {room.maintenanceStatus.replaceAll("_", " ")}</span>
        {room.restrictionExpectedReturn ? (
          <span>Expected return: {dateLabel(room.restrictionExpectedReturn)}</span>
        ) : null}
      </div>
    </div>
  );
}

const MAINTENANCE_CATEGORY_OPTIONS = [
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["furniture", "Furniture"],
  ["equipment", "Equipment"],
  ["other", "Other"],
] as const;
const MAINTENANCE_PRIORITY_OPTIONS = [
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

function PriorityBadge({ priority }: { priority: string }) {
  const tones: Record<string, string> = {
    urgent: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400 font-semibold",
    high: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium",
    normal: "border-border bg-muted/40 text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center capitalize rounded-full border px-2 py-0.5 text-[11px] ${
        tones[priority] ?? tones.normal
      }`}
    >
      {priority}
    </span>
  );
}

function MaintenanceKpis({
  total,
  open,
  inProgress,
  resolved,
  urgentOrHigh,
}: {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  urgentOrHigh: number;
}) {
  const items = [
    {
      label: "Total Requests",
      value: total,
      detail: "All recorded room issues",
      icon: Wrench,
      tone: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
    },
    {
      label: "Open Issues",
      value: open,
      detail: "Awaiting technician",
      icon: AlertTriangle,
      tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
    },
    {
      label: "In Progress",
      value: inProgress,
      detail: "Repairs actively underway",
      icon: Clock,
      tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
    },
    {
      label: "Completed",
      value: resolved,
      detail: "Work verified and resolved",
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    {
      label: "Urgent & High",
      value: urgentOrHigh,
      detail: "Priority unresolved issues",
      icon: ShieldAlert,
      tone: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[#E8E1D7] bg-card px-3.5 py-2.5 shadow-xs"
          >
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${item.tone}`}>
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="text-xl font-bold leading-tight text-foreground">{item.value}</p>
              <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RoomMaintenanceView({ restaurantId }: { restaurantId: string }) {
  const loadMaintenance = useServerFn(listMaintenanceRequests);
  const loadRooms = useServerFn(listRooms);
  const createRequest = useServerFn(createMaintenanceRequest);
  const updateRequest = useServerFn(updateMaintenanceRequest);
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "resolved" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [roomId, setRoomId] = useState("");
  const [category, setCategory] = useState<(typeof MAINTENANCE_CATEGORY_OPTIONS)[number][0]>("plumbing");
  const [priority, setPriority] = useState<(typeof MAINTENANCE_PRIORITY_OPTIONS)[number][0]>("normal");
  const [description, setDescription] = useState("");

  const maintenance = useQuery({
    queryKey: ["room-inventory-maintenance", restaurantId],
    queryFn: () => loadMaintenance({ data: { restaurantId } }),
    retry: false,
  });

  const rooms = useQuery({
    queryKey: ["room-inventory-maintenance-rooms", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: true } }),
  });

  const affected = useMemo(
    () => new Map((rooms.data ?? []).map((room) => [room.id, room])),
    [rooms.data],
  );

  const requests = maintenance.data ?? [];

  const kpiCounts = useMemo(() => {
    const total = requests.length;
    const open = requests.filter((r) => r.status === "open").length;
    const inProgress = requests.filter((r) => r.status === "in_progress").length;
    const resolved = requests.filter((r) => r.status === "resolved").length;
    const urgentOrHigh = requests.filter(
      (r) => (r.priority === "urgent" || r.priority === "high") && r.status !== "resolved",
    ).length;
    return { total, open, inProgress, resolved, urgentOrHigh };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      if (statusFilter !== "all" && request.status !== statusFilter) return false;
      if (categoryFilter !== "all" && request.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && request.priority !== priorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const room = affected.get(request.roomId);
        const matches =
          request.roomNumber.toLowerCase().includes(q) ||
          request.description.toLowerCase().includes(q) ||
          request.category.toLowerCase().includes(q) ||
          request.priority.toLowerCase().includes(q) ||
          (room?.roomTypeName && room.roomTypeName.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [requests, statusFilter, categoryFilter, priorityFilter, searchQuery, affected]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = filteredRequests.slice(startIndex, startIndex + pageSize);
  const selected = filteredRequests.find((request) => request.id === selectedId) ?? pageRows[0] ?? null;

  const hasActiveFilters =
    statusFilter !== "all" || categoryFilter !== "all" || priorityFilter !== "all" || searchQuery.trim() !== "";

  function clearFilters() {
    setStatusFilter("all");
    setSearchQuery("");
    setCategoryFilter("all");
    setPriorityFilter("all");
    setPage(1);
  }

  async function refreshMaintenance() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["room-inventory-maintenance", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-maintenance-rooms", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["hk-maintenance", restaurantId] }),
    ]);
  }

  function handleExportCsv() {
    if (filteredRequests.length === 0) {
      toast.error("No maintenance requests to export");
      return;
    }
    const headers = [
      "Room",
      "Room Type",
      "Category",
      "Priority",
      "Status",
      "Issue Description",
      "Room Condition",
      "Logged At",
    ];
    const escapeCsv = (val: unknown) => {
      const str = val == null ? "" : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvLines = [
      headers.join(","),
      ...filteredRequests.map((req) => {
        const room = affected.get(req.roomId);
        return [
          escapeCsv(req.roomNumber),
          escapeCsv(room?.roomTypeName ?? "—"),
          escapeCsv(req.category.replaceAll("_", " ")),
          escapeCsv(req.priority),
          escapeCsv(req.status.replaceAll("_", " ")),
          escapeCsv(req.description),
          escapeCsv(room?.maintenanceStatus.replaceAll("_", " ") ?? "—"),
          escapeCsv(new Date(req.createdAt).toLocaleString()),
        ].join(",");
      }),
    ];
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `maintenance-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRequests.length} maintenance request${filteredRequests.length === 1 ? "" : "s"}`);
  }

  const create = useMutation({
    mutationFn: () =>
      createRequest({
        data: { restaurantId, roomId, category, priority, description: description.trim() },
      }),
    onSuccess: async () => {
      toast.success("Maintenance request logged.");
      setCreateOpen(false);
      setDescription("");
      setRoomId("");
      await refreshMaintenance();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: (input: { requestId: string; status: MaintenanceRequest["status"]; notes?: string }) =>
      updateRequest({ data: { restaurantId, ...input } }),
    onSuccess: async (_result, input) => {
      toast.success(
        input.status === "resolved"
          ? "Maintenance request completed."
          : input.status === "in_progress"
            ? "Maintenance work started."
            : "Maintenance request reopened.",
      );
      setCompleteId(null);
      setNotes("");
      await refreshMaintenance();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-0.5">
        <p className="text-xs text-muted-foreground">
          Room maintenance requests and work orders across your property.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-[#C89933] px-3.5 text-xs font-semibold text-[#251605] hover:bg-[#B5882D] shadow-xs"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
            Log request
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5] shadow-xs"
          >
            <a href="/restaurant/pms/maintenance?tab=maintenance&returnTo=/restaurant/pms/room-inventory%3Ftab%3Dmaintenance">
              Open Maintenance <ArrowRight className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>

      <MaintenanceKpis
        total={kpiCounts.total}
        open={kpiCounts.open}
        inProgress={kpiCounts.inProgress}
        resolved={kpiCounts.resolved}
        urgentOrHigh={kpiCounts.urgentOrHigh}
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", "All", requests.length],
                ["open", "Open", requests.filter((r) => r.status === "open").length],
                ["in_progress", "In progress", requests.filter((r) => r.status === "in_progress").length],
                ["resolved", "Completed", requests.filter((r) => r.status === "resolved").length],
              ] as const
            ).map(([value, label, count]) => {
              const active = statusFilter === value;
              return (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={`h-8 gap-1.5 rounded-lg text-xs font-semibold ${
                    active
                      ? "bg-[#251605] text-white hover:bg-[#3d2710]"
                      : "border-[#D6CDBF] bg-white text-[#5C5346] hover:bg-[#FAF8F5]"
                  }`}
                  onClick={() => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-[#F3EFEA] text-[#7A6F62]"
                    }`}
                  >
                    {count}
                  </span>
                </Button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={filteredRequests.length === 0}
              className="h-8 gap-1.5 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] shadow-2xs hover:bg-[#FAF8F5]"
            >
              <Download className="size-3.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 border-[#D6CDBF] bg-white text-[#5C5346] shadow-2xs hover:bg-[#FAF8F5]"
              onClick={() => void refreshMaintenance()}
              aria-label="Refresh maintenance"
            >
              <RefreshCw className={`size-3.5 ${maintenance.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 items-center pt-2 border-t border-border/50">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              className="h-8.5 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#C89933]"
              placeholder="Search room number, issue description, category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <PmsSelect
            className="h-8.5 rounded-lg border-[#DED7CD] bg-background px-2.5 text-xs text-[#5F554B]"
            value={categoryFilter}
            onChange={(val) => {
              setCategoryFilter(val);
              setPage(1);
            }}
            options={[
              ["all", "All Categories"],
              ...MAINTENANCE_CATEGORY_OPTIONS,
            ]}
          />

          <div className="flex items-center gap-2">
            <PmsSelect
              className="h-8.5 flex-1 rounded-lg border-[#DED7CD] bg-background px-2.5 text-xs text-[#5F554B]"
              value={priorityFilter}
              onChange={(val) => {
                setPriorityFilter(val);
                setPage(1);
              }}
              options={[
                ["all", "All Priorities"],
                ...MAINTENANCE_PRIORITY_OPTIONS,
              ]}
            />

            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearFilters}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {maintenance.isLoading ? (
        <InventoryState state="loading" />
      ) : maintenance.isError ? (
        <InventoryState
          state="error"
          title="Maintenance details are unavailable for your role"
          description="Maintenance access is managed separately. This does not affect other Room & Inventory views."
          onRetry={() => maintenance.refetch()}
        />
      ) : requests.length === 0 ? (
        <InventoryState
          state="empty"
          title="No maintenance requests"
          description="Log a request for a room. It will stay here until the work is completed."
        />
      ) : filteredRequests.length === 0 ? (
        <InventoryState
          state="empty"
          title="No matching maintenance requests"
          description="Try clearing your filters or search terms, or log a new request."
          onRetry={clearFilters}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-[#E5DED4] bg-[#F8F5F0] text-xs font-bold uppercase tracking-wider text-[#5C5346]">
                  <tr>
                    {["Room", "Issue", "Priority", "Status", "Room condition", "Actions"].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((request) => {
                    const room = affected.get(request.roomId);
                    const isSelected = selected?.id === request.id;
                    return (
                      <tr
                        key={request.id}
                        className={`border-b border-border/70 last:border-0 transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#FAF8F5] dark:bg-muted/40 border-l-3 border-l-[#C89933]"
                            : "hover:bg-muted/20"
                        }`}
                        onClick={() => setSelectedId(request.id)}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className="text-left font-semibold text-[#251605] hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(request.id);
                            }}
                          >
                            Room {request.roomNumber}
                          </button>
                          <p className="text-xs text-muted-foreground">{room?.roomTypeName ?? "Room"}</p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="font-medium text-foreground line-clamp-2">{request.description}</p>
                          <span className="mt-1 inline-block rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {request.category.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PriorityBadge priority={request.priority} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <InventoryStatusBadge tone={request.status === "resolved" ? "success" : "warning"}>
                            {request.status.replaceAll("_", " ")}
                          </InventoryStatusBadge>
                        </td>
                        <td className="px-4 py-3 capitalize text-xs">
                          <span className="font-medium text-foreground">
                            {room?.maintenanceStatus.replaceAll("_", " ") ?? "—"}
                          </span>
                          <p className="text-muted-foreground">
                            {room?.status.replaceAll("_", " ") ?? "No operational restriction"}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <MaintenanceActions
                            request={request}
                            pending={update.isPending}
                            onStart={() => update.mutate({ requestId: request.id, status: "in_progress" })}
                            onComplete={() => {
                              setCompleteId(request.id);
                              setNotes("");
                            }}
                            onReopen={() => update.mutate({ requestId: request.id, status: "open" })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page:</span>
                <PmsSelect
                  className="h-8 w-20 rounded-md border-input bg-background px-2 text-xs font-medium"
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                  options={[10, 15, 25, 50].map((sz) => [String(sz), String(sz)])}
                />
                <span className="ml-2">
                  Showing {filteredRequests.length === 0 ? 0 : startIndex + 1}–
                  {Math.min(startIndex + pageSize, filteredRequests.length)} of {filteredRequests.length}
                </span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] shadow-2xs hover:bg-[#FAF8F5]"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="mr-1 size-3.5" />
                  Previous
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] shadow-2xs hover:bg-[#FAF8F5]"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                  <ChevronRight className="ml-1 size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            {selected ? (
              <MaintenanceDetail
                request={selected}
                room={affected.get(selected.roomId)}
                pending={update.isPending}
                onStart={() => update.mutate({ requestId: selected.id, status: "in_progress" })}
                onComplete={() => {
                  setCompleteId(selected.id);
                  setNotes("");
                }}
                onReopen={() => update.mutate({ requestId: selected.id, status: "open" })}
              />
            ) : (
              <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
                <Wrench className="size-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-semibold text-foreground">No request selected</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a room issue from the list to view its complete operational context and actions.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log maintenance request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-1">
            <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
              Room
              <PmsSelect
                className="h-9 rounded-lg border-[#DED7CD] bg-background px-2.5 text-xs font-normal"
                value={roomId}
                onChange={(val) => setRoomId(val)}
                placeholder="Select a room"
                options={[
                  ["", "Select a room"],
                  ...(rooms.data ?? [])
                    .filter((room) => room.active)
                    .map((room) => [room.id, `${room.roomNumber} · ${room.roomTypeName}`] as [string, string]),
                ]}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Category
                <PmsSelect
                  className="h-9 rounded-lg border-[#DED7CD] bg-background px-2.5 text-xs font-normal"
                  value={category}
                  onChange={(val) =>
                    setCategory(val as (typeof MAINTENANCE_CATEGORY_OPTIONS)[number][0])
                  }
                  options={MAINTENANCE_CATEGORY_OPTIONS}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Priority
                <PmsSelect
                  className="h-9 rounded-lg border-[#DED7CD] bg-background px-2.5 text-xs font-normal"
                  value={priority}
                  onChange={(val) =>
                    setPriority(val as (typeof MAINTENANCE_PRIORITY_OPTIONS)[number][0])
                  }
                  options={MAINTENANCE_PRIORITY_OPTIONS}
                />
              </label>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold text-[#5F554B]">What needs work</Label>
              <Textarea
                placeholder="Describe the issue in detail..."
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This records the work order and updates the room maintenance condition. Taking the room out of
              inventory is still a separate restriction.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#C89933] text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
              disabled={!roomId || description.trim() === "" || create.isPending}
              onClick={() => create.mutate()}
            >
              Log request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeId != null} onOpenChange={(open) => !open && setCompleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete maintenance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label className="text-xs font-semibold text-[#5F554B]">Resolution Notes</Label>
            <Textarea
              placeholder="Add optional notes about the repair..."
              value={notes}
              maxLength={500}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCompleteId(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#C89933] text-xs font-semibold text-[#251605] hover:bg-[#B5882D]"
              disabled={update.isPending || completeId == null}
              onClick={() =>
                completeId &&
                update.mutate({ requestId: completeId, status: "resolved", notes: notes.trim() || undefined })
              }
            >
              Complete work
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MaintenanceActions({
  request,
  pending,
  onStart,
  onComplete,
  onReopen,
  fullWidth = false,
}: {
  request: MaintenanceRequest;
  pending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
  fullWidth?: boolean;
}) {
  if (request.status === "resolved") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onReopen}
        className={`h-8 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5] shadow-2xs ${
          fullWidth ? "w-full" : ""
        }`}
      >
        Reopen
      </Button>
    );
  }
  return (
    <div className={`flex flex-wrap gap-1.5 ${fullWidth ? "w-full" : ""}`}>
      {request.status === "open" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onStart}
          className={`h-8 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] hover:bg-[#FAF8F5] shadow-2xs ${
            fullWidth ? "flex-1" : ""
          }`}
        >
          Start
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={onComplete}
        className={`h-8 bg-[#C89933] text-xs font-semibold text-[#251605] hover:bg-[#B5882D] shadow-2xs ${
          fullWidth ? "flex-1" : ""
        }`}
      >
        Complete
      </Button>
    </div>
  );
}

function MaintenanceDetail({
  request,
  room,
  pending,
  onStart,
  onComplete,
  onReopen,
}: {
  request: MaintenanceRequest;
  room: HotelRoom | undefined;
  pending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 border-b border-border/70 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold text-[#251605]">
              Room {request.roomNumber}
            </span>
            <span className="rounded-md bg-[#FAF8F5] border border-[#E8E1D7] px-2 py-0.5 text-[10px] font-medium text-[#756A5B]">
              {room?.roomTypeName ?? "Room"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground capitalize">
            {request.category.replaceAll("_", " ")} issue
          </p>
        </div>
        <InventoryStatusBadge tone={request.status === "resolved" ? "success" : "warning"}>
          {request.status.replaceAll("_", " ")}
        </InventoryStatusBadge>
      </div>

      <div className="rounded-xl border border-[#EDE7DF] bg-[#FAF8F5]/60 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#756A5B]">
          Issue Description
        </p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-[#251605]">
          {request.description}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Operational Context
        </p>
        <dl className="divide-y divide-border/60 text-xs">
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Priority</dt>
            <dd>
              <PriorityBadge priority={request.priority} />
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Maintenance Condition</dt>
            <dd className="font-medium capitalize text-foreground">
              {room?.maintenanceStatus.replaceAll("_", " ") ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Operational Status</dt>
            <dd className="font-medium capitalize text-foreground">
              {room?.status.replaceAll("_", " ") ?? "No restriction"}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Housekeeping</dt>
            <dd className="font-medium capitalize text-foreground">
              {room?.housekeepingStatus?.replaceAll("_", " ") ?? "Not set"}
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">Logged At</dt>
            <dd className="text-muted-foreground">{dateLabel(request.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-[#EDE7DF] bg-[#FAF8F5]/80 p-3">
        <p className="text-[11px] font-semibold text-[#5C5346] mb-2">Available Actions</p>
        <MaintenanceActions
          request={request}
          pending={pending}
          onStart={onStart}
          onComplete={onComplete}
          onReopen={onReopen}
          fullWidth
        />
      </div>
    </div>
  );
}

export function RoomBulkOperationsView({ onOpenBlocks }: { onOpenBlocks: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Controlled operational actions across multiple rooms.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <ActionCard
          icon={Layers3}
          title="Create inventory block"
          description="Use the verified block workflow to remove dated room or room-type inventory."
          action={
            <Button size="sm" onClick={onOpenBlocks}>
              Open Blocks
            </Button>
          }
        />
        <ActionCard
          icon={ShieldAlert}
          title="Bulk room restrictions"
          description="Bulk restriction mutation is not yet supported by the canonical backend."
          action={
            <Button size="sm" disabled>
              Not available
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function RoomSnapshotView({ restaurantId }: { restaurantId: string }) {
  const loadDashboard = useServerFn(getRoomsDashboard);
  const query = useQuery({
    queryKey: ["room-inventory-snapshot", restaurantId],
    queryFn: () => loadDashboard({ data: { restaurantId } }),
  });
  const data = query.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-0.5">
        <p className="text-xs text-muted-foreground">
          Point-in-time operational room capacity and readiness.
        </p>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>
      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError || !data ? (
        <InventoryState
          state="error"
          title="Snapshot could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <InventoryMetric label="Capacity" value={data.totalRooms} detail="Physical rooms" />
            <InventoryMetric label="Active" value={data.activeRooms} detail="Operational master" />
            <InventoryMetric label="Sellable" value={data.sellableRooms} detail="Sellable flag" />
            <InventoryMetric label="Available" value={data.availableRooms} detail="Available now" />
            <InventoryMetric label="OOO" value={data.outOfOrder} detail="Out of order" />
            <InventoryMetric label="OOS" value={data.outOfService} detail="Out of service" />
            <InventoryMetric
              label="Room types"
              value={data.byType.length}
              detail="Configured types"
            />
          </div>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-semibold">Operational insight</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {data.outOfOrder + data.outOfService > 0
                ? `${data.outOfOrder + data.outOfService} rooms are currently operationally restricted. Review room details, maintenance, and active blocks before promising inventory.`
                : "No rooms are currently marked out of order or out of service."}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export function RoomHistoryAuditView({ restaurantId }: { restaurantId: string }) {
  const loadEvents = useServerFn(listRoomInventoryEvents);
  const query = useQuery({
    queryKey: ["room-inventory-history", restaurantId],
    queryFn: () => loadEvents({ data: { restaurantId, limit: 200 } }),
    retry: false,
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const rows = (query.data ?? []).filter((event) =>
    [
      event.eventType,
      event.roomNumber,
      event.notes,
      event.actorName,
      event.actorMembershipId,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  );

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

  function handleSearchChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
    setPage(1);
  }

  function handleExportCsv() {
    if (rows.length === 0) {
      toast.error("No events to export");
      return;
    }

    const headers = [
      "Date / Time",
      "Room",
      "Event",
      "Previous Values",
      "New Values",
      "Actor",
      "Reason / Context",
    ];

    const escapeCsv = (val: unknown) => {
      const str = val == null ? "" : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(","),
      ...rows.map((event) =>
        [
          escapeCsv(new Date(event.createdAt).toLocaleString()),
          escapeCsv(event.roomNumber ?? "—"),
          escapeCsv(event.eventType.replaceAll("_", " ")),
          escapeCsv(event.previousValues ?? "—"),
          escapeCsv(event.newValues ?? "—"),
          escapeCsv(event.actorName || "Staff"),
          escapeCsv(event.notes ?? "—"),
        ].join(","),
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-history-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${rows.length} audit event${rows.length === 1 ? "" : "s"} to CSV`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm"
          placeholder="Search room, event, actor or context"
          value={search}
          onChange={handleSearchChange}
        />
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
            className="h-9 gap-1.5 border-[#D6CDBF] bg-white text-xs font-semibold text-[#251605] shadow-xs hover:bg-[#FAF8F5]"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>
      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Audit history could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <InventoryState
          state="empty"
          title="No operational events found"
          description="Events written by the canonical inventory lifecycle will appear here."
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {[
                    "Date / Time",
                    "Room",
                    "Event",
                    "Previous",
                    "New",
                    "Actor",
                    "Reason / Context",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-xs font-semibold text-muted-foreground"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((event) => (
                  <tr key={event.id} className="border-b border-border/70 last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#251605]">{event.roomNumber ?? "—"}</td>
                    <td className="px-4 py-3 font-medium">{event.eventType.replaceAll("_", " ")}</td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-muted-foreground">
                      {event.previousValues ?? "—"}
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-muted-foreground">
                      {event.newValues ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#251605]">
                      {event.actorName || (event.actorMembershipId ? `${event.actorMembershipId.slice(0, 8)}…` : "Staff")}
                    </td>
                    <td className="max-w-56 px-4 py-3 text-xs text-muted-foreground">{event.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground shadow-xs">
            <div className="flex items-center gap-2">
              <span>
                Showing {totalCount > 0 ? startIndex + 1 : 0}–{Math.min(startIndex + pageSize, totalCount)} of {totalCount} events
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span>Rows per page:</span>
                <PmsSelect
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                  className="h-7 w-20 rounded-md border-[#DED7CD] bg-background px-2 text-xs font-medium text-foreground"
                  options={["10", "15", "25", "50"]}
                />
              </div>

              <span className="text-muted-foreground">
                Page {safePage} of {totalPages}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 w-7 p-0"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 w-7 p-0"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoomReportsView({
  onOpenAvailability,
  onOpenBlocks,
}: {
  onOpenAvailability: () => void;
  onOpenBlocks: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Operational reporting surfaces backed by current workspace data.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          title="Room Status Report"
          description="Current operational room status and readiness."
        />
        <ReportCard
          title="Availability Report"
          description="Canonical room-type availability for a selected stay."
          onOpen={onOpenAvailability}
        />
        <ReportCard
          title="Inventory Blocks Report"
          description="Operational block lifecycle and inventory impact."
          onOpen={onOpenBlocks}
        />
        <ReportCard
          title="OOO / OOS Report"
          description="Restricted rooms are available from Room Board and Snapshot."
        />
        <ReportCard
          title="Room Readiness Report"
          description="A dedicated export is not configured."
          disabled
        />
      </div>
    </div>
  );
}

export function RoomOfflineSyncView() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <CloudOff className="mx-auto size-8 text-muted-foreground" />
        <h3 className="mt-4 font-semibold">Offline operation is not configured</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Room & Inventory currently requires an active connection. No offline queue or sync ledger
          is available, so the workspace will never imply that disconnected changes were saved.
        </p>
        <div className="mt-5">
          <InventoryStatusBadge tone="neutral">Online-only</InventoryStatusBadge>
        </div>
      </section>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Wrench;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <Icon className="size-5 text-muted-foreground" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-4">{action}</div>
    </section>
  );
}

function ReportCard({
  title,
  description,
  onOpen,
  disabled,
}: {
  title: string;
  description: string;
  onOpen?: () => void;
  disabled?: boolean;
}) {
  return (
    <ActionCard
      icon={disabled ? FileText : BarChart3}
      title={title}
      description={description}
      action={
        <Button variant="outline" size="sm" disabled={disabled} onClick={onOpen}>
          {disabled ? "Not configured" : onOpen ? "Open view" : "View on Room Board"}
          {!disabled ? <ArrowRight className="ml-2 size-4" /> : null}
        </Button>
      }
    />
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <PmsSelect
        className="h-9 min-w-40 rounded-lg border-input bg-background px-3 text-xs"
        value={value}
        onChange={onChange}
        options={options.map((option) => [
          option,
          option === "all" ? `All ${label.toLowerCase()}s` : option.replaceAll("_", " "),
        ])}
      />
    </div>
  );
}
