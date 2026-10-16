import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BarChart3,
  CloudOff,
  FileText,
  Layers3,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { listMaintenanceRequests } from "@/packages/pms/lib/housekeeping.functions";
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

export function RoomMaintenanceView({ restaurantId }: { restaurantId: string }) {
  const loadMaintenance = useServerFn(listMaintenanceRequests);
  const loadRooms = useServerFn(listRooms);
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
  return (
    <div className="space-y-5">
      <InventoryViewHeader
        title="Maintenance"
        description="Operational visibility into room maintenance impact."
        action={
          <Button asChild size="sm" variant="outline">
            <a href="/restaurant/pms/maintenance">
              Open Maintenance <ArrowRight className="ml-2 size-4" />
            </a>
          </Button>
        }
      />
      {maintenance.isLoading ? (
        <InventoryState state="loading" />
      ) : maintenance.isError ? (
        <InventoryState
          state="error"
          title="Maintenance details are unavailable for your role"
          description="Maintenance access is managed separately. This does not affect other Room & Inventory views."
          onRetry={() => maintenance.refetch()}
        />
      ) : maintenance.data?.length === 0 ? (
        <InventoryState
          state="empty"
          title="No maintenance requests"
          description="Maintenance-owned work orders will appear here when your role has access."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                {[
                  "Room",
                  "Issue",
                  "Priority",
                  "Maintenance status",
                  "Operational restriction",
                  "Expected return",
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
              {maintenance.data?.map((request) => {
                const room = affected.get(request.roomId);
                return (
                  <tr key={request.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3 font-medium">{request.roomNumber}</td>
                    <td className="px-4 py-3">
                      <p>{request.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.category.replaceAll("_", " ")}
                      </p>
                    </td>
                    <td className="px-4 py-3">{request.priority}</td>
                    <td className="px-4 py-3">
                      <InventoryStatusBadge
                        tone={request.status === "resolved" ? "success" : "warning"}
                      >
                        {request.status.replaceAll("_", " ")}
                      </InventoryStatusBadge>
                    </td>
                    <td className="px-4 py-3">{room?.status.replaceAll("_", " ") ?? "—"}</td>
                    <td className="px-4 py-3">{dateLabel(room?.restrictionExpectedReturn)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  const rows = (query.data ?? []).filter((event) =>
    [event.eventType, event.roomNumber, event.notes, event.actorMembershipId].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  );
  return (
    <div className="space-y-5">
      <InventoryViewHeader
        title="History & Audit"
        description="Immutable operational room and inventory events."
      />
      <div className="rounded-2xl border border-border bg-card p-4">
        <input
          className="h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm"
          placeholder="Search room, event, actor or context"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
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
              {rows.map((event) => (
                <tr key={event.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">{new Date(event.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{event.roomNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{event.eventType.replaceAll("_", " ")}</td>
                  <td className="max-w-48 truncate px-4 py-3 text-xs text-muted-foreground">
                    {event.previousValues ?? "—"}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 text-xs text-muted-foreground">
                    {event.newValues ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">{event.actorMembershipId.slice(0, 8)}…</td>
                  <td className="max-w-56 px-4 py-3">{event.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
