import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  FileText,
  Layers3,
  RefreshCw,
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
  InventoryViewHeader,
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="Floor Plan"
        description="Operational room state arranged by building and floor."
      />
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

export function RoomMaintenanceView({ restaurantId }: { restaurantId: string }) {
  const loadMaintenance = useServerFn(listMaintenanceRequests);
  const loadRooms = useServerFn(listRooms);
  const createRequest = useServerFn(createMaintenanceRequest);
  const updateRequest = useServerFn(updateMaintenanceRequest);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"open" | "in_progress" | "resolved" | "all">(
    "all",
  );
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
  const affected = new Map((rooms.data ?? []).map((room) => [room.id, room]));
  const requests = maintenance.data ?? [];
  const visible = requests.filter((request) => statusFilter === "all" || request.status === statusFilter);
  const selected = visible.find((request) => request.id === selectedId) ?? visible[0] ?? null;

  async function refreshMaintenance() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["room-inventory-maintenance", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-inventory-maintenance-rooms", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
      queryClient.invalidateQueries({ queryKey: ["hk-maintenance", restaurantId] }),
    ]);
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="Maintenance"
        description="Log a room issue and move it from open, to in progress, to completed. Completing a request updates that room's maintenance condition."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Log request
            </Button>
            <Button asChild size="sm" variant="outline" className="border-[#D6CDBF] bg-white hover:bg-[#FAF8F5]">
              <a href="/restaurant/pms/maintenance?tab=maintenance&returnTo=/restaurant/pms/room-inventory%3Ftab%3Dmaintenance">
                Open Maintenance <ArrowRight className="ml-1.5 size-3.5" />
              </a>
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "Open"],
            ["in_progress", "In progress"],
            ["resolved", "Completed"],
            ["all", "All"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={statusFilter === value ? "default" : "outline"}
            onClick={() => setStatusFilter(value)}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-70">
              {value === "all" ? requests.length : requests.filter((request) => request.status === value).length}
            </span>
          </Button>
        ))}
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
      ) : visible.length === 0 ? (
        <InventoryState
          state="empty"
          title="Nothing in this status"
          description="Choose another status, or log a new request."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {["Room", "Issue", "Priority", "Status", "Room condition", "Actions"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((request) => {
                  const room = affected.get(request.roomId);
                  return (
                    <tr
                      key={request.id}
                      className={`border-b border-border/70 last:border-0 ${
                        selected?.id === request.id ? "bg-[#FAF8F5]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium"
                          onClick={() => setSelectedId(request.id)}
                        >
                          Room {request.roomNumber}
                        </button>
                        <p className="text-xs text-muted-foreground">{room?.roomTypeName ?? "Room"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{request.description}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {request.category.replaceAll("_", " ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 capitalize">{request.priority}</td>
                      <td className="px-4 py-3">
                        <InventoryStatusBadge tone={request.status === "resolved" ? "success" : "warning"}>
                          {request.status.replaceAll("_", " ")}
                        </InventoryStatusBadge>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {room?.maintenanceStatus.replaceAll("_", " ") ?? "—"}
                        <p className="text-xs text-muted-foreground">
                          {room?.status.replaceAll("_", " ") ?? "No operational restriction"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
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
          <aside className="rounded-2xl border border-border bg-card p-4">
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
              <p className="text-sm text-muted-foreground">Select a room request to see its condition and actions.</p>
            )}
          </aside>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log maintenance request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
              Room
              <select
                className="h-9 rounded-md border border-[#DED7CD] bg-white px-2 text-sm font-normal"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              >
                <option value="">Select a room</option>
                {(rooms.data ?? [])
                  .filter((room) => room.active)
                  .map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.roomNumber} · {room.roomTypeName}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Category
                <select
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-2 text-sm font-normal"
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as (typeof MAINTENANCE_CATEGORY_OPTIONS)[number][0])
                  }
                >
                  {MAINTENANCE_CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
                Priority
                <select
                  className="h-9 rounded-md border border-[#DED7CD] bg-white px-2 text-sm font-normal"
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as (typeof MAINTENANCE_PRIORITY_OPTIONS)[number][0])
                  }
                >
                  {MAINTENANCE_PRIORITY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-1.5">
              <Label>What needs work</Label>
              <Textarea
                value={description}
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This records the work order and updates the room maintenance condition. Taking the room out of
              inventory is still a separate restriction.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
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
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteId(null)}>
              Cancel
            </Button>
            <Button
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
}: {
  request: MaintenanceRequest;
  pending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  if (request.status === "resolved") {
    return (
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onReopen}>
        Reopen
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {request.status === "open" ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onStart}>
          Start
        </Button>
      ) : null}
      <Button type="button" size="sm" disabled={pending} onClick={onComplete}>
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
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Room {request.roomNumber}
      </p>
      <h3 className="text-base font-semibold">{request.description}</h3>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Category</dt>
          <dd className="capitalize">{request.category.replaceAll("_", " ")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Priority</dt>
          <dd className="capitalize">{request.priority}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Work status</dt>
          <dd className="capitalize">{request.status.replaceAll("_", " ")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Room condition</dt>
          <dd className="capitalize">{room?.maintenanceStatus.replaceAll("_", " ") ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Operational status</dt>
          <dd className="capitalize">{room?.status.replaceAll("_", " ") ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Logged</dt>
          <dd>{dateLabel(request.createdAt)}</dd>
        </div>
      </dl>
      <MaintenanceActions
        request={request}
        pending={pending}
        onStart={onStart}
        onComplete={onComplete}
        onReopen={onReopen}
      />
    </div>
  );
}

export function RoomBulkOperationsView({ onOpenBlocks }: { onOpenBlocks: () => void }) {
  return (
    <div className="space-y-5">
      <InventoryViewHeader
        title="Bulk Operations"
        description="Controlled operational actions across multiple rooms."
      />
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="Daily Snapshot"
        description="Point-in-time operational room capacity and readiness."
        action={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="History & Audit"
        description="Immutable operational room and inventory events."
      />
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
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-7 rounded-md border border-[#DED7CD] bg-background px-2 text-xs font-medium text-foreground outline-none focus:border-[#C89933]"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="Reports"
        description="Operational reporting surfaces backed by current workspace data."
      />
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
    <div className="space-y-5">
      <InventoryViewHeader
        title="Offline & Sync"
        description="Operational continuity and synchronization status."
      />
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
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select
        className="h-9 min-w-40 rounded-lg border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "all" ? `All ${label.toLowerCase()}s` : option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
