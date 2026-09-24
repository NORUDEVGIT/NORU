import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { getInventoryRules } from "@/packages/pms/lib/inventory-rules.functions";
import {
  activateOperationalBlock,
  approveOperationalBlock,
  cancelOperationalBlock,
  createOperationalBlock,
  listOperationalBlocks,
  listRoomTypeInventoryAvailability,
  releaseOperationalBlock,
  type InventoryAvailabilityNight,
  type OperationalBlockStatus,
  type OperationalInventoryBlock,
  type RoomTypeInventoryAvailability,
} from "@/packages/pms/lib/room-inventory.functions";
import { listRooms, listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import {
  InventoryMetric,
  InventoryState,
  InventoryStatusBadge,
  InventoryViewHeader,
} from "./room-inventory-shared";
import {
  addDays,
  dateLabel,
  nightlyBlocked,
  nightlyDemand,
  stayBlocked,
  stayDemand,
} from "./room-inventory-utils";

export { RoomInventoryAvailabilityView } from "./room-inventory-availability";
export { RoomInventoryCalendarView } from "./room-inventory-calendar";
export { RoomInventoryBlocksView } from "./room-inventory-blocks";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Retained temporarily for source compatibility while the corrected Availability workspace
 * lives in room-inventory-availability.tsx.
 */
export function LegacyRoomInventoryAvailabilityView({ restaurantId }: { restaurantId: string }) {
  const [arrival, setArrival] = useState(today());
  const [departure, setDeparture] = useState(addDays(today(), 7));
  const [roomType, setRoomType] = useState("all");
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const loadAvailability = useServerFn(listRoomTypeInventoryAvailability);
  const loadRooms = useServerFn(listRooms);
  const query = useQuery({
    queryKey: ["room-inventory-availability", restaurantId, arrival, departure],
    queryFn: () => loadAvailability({ data: { restaurantId, arrival, departure } }),
    staleTime: 60_000,
    enabled: departure > arrival,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const scopedTypeIds = useMemo(() => {
    const rooms = roomsQuery.data ?? [];
    if (building === "all" && floor === "all") return null;
    return new Set(
      rooms
        .filter((room) => {
          const roomBuilding = room.building?.trim() || "Unassigned";
          const roomFloor = room.floor?.trim() || "Unassigned";
          return (
            (building === "all" || roomBuilding === building) &&
            (floor === "all" || roomFloor === floor)
          );
        })
        .map((room) => room.roomTypeId),
    );
  }, [roomsQuery.data, building, floor]);
  const buildings = useMemo(
    () =>
      Array.from(
        new Set((roomsQuery.data ?? []).map((room) => room.building?.trim() || "Unassigned")),
      ).sort(),
    [roomsQuery.data],
  );
  const floors = useMemo(
    () =>
      Array.from(
        new Set(
          (roomsQuery.data ?? [])
            .filter(
              (room) => building === "all" || (room.building?.trim() || "Unassigned") === building,
            )
            .map((room) => room.floor?.trim() || "Unassigned"),
        ),
      ).sort(),
    [roomsQuery.data, building],
  );
  const rows = useMemo(
    () =>
      (query.data ?? []).filter((row) => {
        if (roomType !== "all" && row.roomTypeId !== roomType) return false;
        if (scopedTypeIds && !scopedTypeIds.has(row.roomTypeId)) return false;
        return true;
      }),
    [query.data, roomType, scopedTypeIds],
  );
  const totals = rows.reduce(
    (sum, row) => ({
      capacity: sum.capacity + row.physicalCapacity,
      available: sum.available + row.available,
      demand: sum.demand + (stayDemand(row) ?? 0),
      blocked: sum.blocked + (stayBlocked(row) ?? 0),
    }),
    { capacity: 0, available: 0, demand: 0, blocked: 0 },
  );
  const selected = rows.find((row) => row.roomTypeId === selectedTypeId) ?? null;

  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Availability"
        description="Canonical stay-limiting availability. Demand and holds come from nightly RPC values, not a second inventory count."
        action={
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 size-4" /> Refresh
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <InventoryMetric
          label="Physical Capacity"
          value={totals.capacity}
          detail="Selected room types"
        />
        <InventoryMetric
          label="Available"
          value={totals.available}
          detail="Stay-limiting available"
        />
        <InventoryMetric
          label="Reserved / Demand"
          value={totals.demand || "—"}
          detail="Peak nightly pinned + unrepresented demand"
        />
        <InventoryMetric
          label="Blocked / Removed"
          value={totals.blocked || "—"}
          detail="Peak nightly type hold or quantity hold"
        />
        <InventoryMetric label="Overbooking" value="0" detail="Not operationally enabled" />
      </div>
      <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <LabeledInput label="Arrival" type="date" value={arrival} onChange={setArrival} />
          <LabeledInput
            label="Departure"
            type="date"
            value={departure}
            min={addDays(arrival, 1)}
            onChange={setDeparture}
          />
          <SelectField
            label="Room type"
            value={roomType}
            onChange={setRoomType}
            options={[
              ["all", "All room types"],
              ...(query.data ?? []).map((row) => [row.roomTypeId, row.name]),
            ]}
          />
          <SelectField
            label="Building (types present)"
            value={building}
            onChange={(value) => {
              setBuilding(value);
              setFloor("all");
            }}
            options={[["all", "All buildings"], ...buildings.map((item) => [item, item])]}
          />
          <SelectField
            label="Floor (types present)"
            value={floor}
            onChange={setFloor}
            options={[["all", "All floors"], ...floors.map((item) => [item, item])]}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Building and floor only hide room types that have no rooms there. They do not produce a
          separate location availability number.
        </p>
      </section>
      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Availability could not be loaded"
          description="The canonical availability service returned an error."
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <InventoryState
          state="empty"
          title="No room types found"
          description="Configure active room types in Property Setup, or clear location filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card shadow-sm">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[#E8E1D7] bg-muted/30 text-xs text-muted-foreground">
              <tr>
                {[
                  "Room Type",
                  "Physical Capacity",
                  "Available",
                  "Reserved / Demand",
                  "Blocked / Removed",
                  "Overbooking",
                  "Limiting Date",
                  "Status",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-2.5 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const demand = stayDemand(row);
                const blocked = stayBlocked(row);
                return (
                  <tr
                    key={row.roomTypeId}
                    className={`cursor-pointer border-b border-[#E8E1D7]/80 last:border-0 ${
                      selectedTypeId === row.roomTypeId ? "bg-[#C89933]/8" : "hover:bg-muted/20"
                    }`}
                    onClick={() =>
                      setSelectedTypeId((current) =>
                        current === row.roomTypeId ? null : row.roomTypeId,
                      )
                    }
                  >
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">{row.code}</p>
                    </td>
                    <td className="px-3 py-2.5">{row.physicalCapacity}</td>
                    <td className="px-3 py-2.5 font-semibold">{row.available}</td>
                    <td className="px-3 py-2.5">
                      {demand ?? "—"}
                      {row.reserved == null ? (
                        <p className="text-[10px] text-muted-foreground">Nightly demand</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">{blocked ?? "—"}</td>
                    <td className="px-3 py-2.5">{row.overbookingAllowance}</td>
                    <td className="px-3 py-2.5">{dateLabel(row.limitingDate)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <InventoryStatusBadge tone={row.available > 0 ? "success" : "danger"}>
                          {row.available > 0 ? "Available" : "Sold out / limited"}
                        </InventoryStatusBadge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTypeId((current) =>
                              current === row.roomTypeId ? null : row.roomTypeId,
                            );
                          }}
                        >
                          {selectedTypeId === row.roomTypeId ? "Hide nights" : "Nights"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected ? <AvailabilityNightlyPanel row={selected} /> : null}
    </div>
  );
}

function AvailabilityNightlyPanel({ row }: { row: RoomTypeInventoryAvailability }) {
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Nightly breakdown
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold">{row.name}</h3>
          <p className="text-xs text-muted-foreground">
            Stay available {row.available} · limiting night {dateLabel(row.limitingDate)}
          </p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#E8E1D7] text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Date", "Available", "Demand", "Blocked", "Type hold"].map((heading) => (
                <th key={heading} className="px-2 py-2 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row.nightly.map((night) => (
              <tr key={night.date} className="border-b border-[#E8E1D7]/70 last:border-0">
                <td className="px-2 py-2">{formatShortDate(night.date)}</td>
                <td className="px-2 py-2 font-semibold">{night.available}</td>
                <td className="px-2 py-2">{nightlyDemand(night)}</td>
                <td className="px-2 py-2">{nightlyBlocked(night) || "—"}</td>
                <td className="px-2 py-2">{night.typeHold ? "Held" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Retained temporarily for source compatibility while the corrected Calendar workspace
 * lives in room-inventory-calendar.tsx.
 */
export function LegacyRoomInventoryCalendarView({ restaurantId }: { restaurantId: string }) {
  const [start, setStart] = useState(today());
  const [roomType, setRoomType] = useState("all");
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const end = addDays(start, 14);
  const loadAvailability = useServerFn(listRoomTypeInventoryAvailability);
  const loadRooms = useServerFn(listRooms);
  const query = useQuery({
    queryKey: ["room-inventory-calendar", restaurantId, start, end],
    queryFn: () => loadAvailability({ data: { restaurantId, arrival: start, departure: end } }),
    staleTime: 60_000,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const scopedTypeIds = useMemo(() => {
    const rooms = roomsQuery.data ?? [];
    if (building === "all" && floor === "all") return null;
    return new Set(
      rooms
        .filter((room) => {
          const roomBuilding = room.building?.trim() || "Unassigned";
          const roomFloor = room.floor?.trim() || "Unassigned";
          return (
            (building === "all" || roomBuilding === building) &&
            (floor === "all" || roomFloor === floor)
          );
        })
        .map((room) => room.roomTypeId),
    );
  }, [roomsQuery.data, building, floor]);
  const buildings = useMemo(
    () =>
      Array.from(
        new Set((roomsQuery.data ?? []).map((room) => room.building?.trim() || "Unassigned")),
      ).sort(),
    [roomsQuery.data],
  );
  const floors = useMemo(
    () =>
      Array.from(
        new Set(
          (roomsQuery.data ?? [])
            .filter(
              (room) => building === "all" || (room.building?.trim() || "Unassigned") === building,
            )
            .map((room) => room.floor?.trim() || "Unassigned"),
        ),
      ).sort(),
    [roomsQuery.data, building],
  );
  const rows = (query.data ?? []).filter((row) => {
    if (roomType !== "all" && row.roomTypeId !== roomType) return false;
    if (scopedTypeIds && !scopedTypeIds.has(row.roomTypeId)) return false;
    return true;
  });
  const dates = Array.from({ length: 14 }, (_, index) => addDays(start, index));
  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Inventory Calendar"
        description="Room-type inventory across a rolling 14-day window from the same availability adapter."
      />
      <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setStart(addDays(start, -14))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStart(today())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStart(addDays(start, 14))}>
            <ChevronRight className="size-4" />
          </Button>
          <LabeledInput label="Start date" type="date" value={start} onChange={setStart} />
          <SelectField
            label="Room type"
            value={roomType}
            onChange={setRoomType}
            options={[
              ["all", "All room types"],
              ...(query.data ?? []).map((row) => [row.roomTypeId, row.name]),
            ]}
          />
          <SelectField
            label="Building (types present)"
            value={building}
            onChange={(value) => {
              setBuilding(value);
              setFloor("all");
            }}
            options={[["all", "All buildings"], ...buildings.map((item) => [item, item])]}
          />
          <SelectField
            label="Floor (types present)"
            value={floor}
            onChange={setFloor}
            options={[["all", "All floors"], ...floors.map((item) => [item, item])]}
          />
        </div>
      </section>
      {query.isLoading ? (
        <InventoryState state="loading" />
      ) : query.isError ? (
        <InventoryState
          state="error"
          title="Calendar could not be loaded"
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <InventoryState
          state="empty"
          title="No room types in this window"
          description="Configure active room types or clear location filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card shadow-sm">
          <table className="min-w-max text-sm">
            <thead>
              <tr className="border-b border-[#E8E1D7] bg-muted/30">
                <th className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2.5 text-left">
                  Room type
                </th>
                {dates.map((date) => (
                  <th
                    key={date}
                    className="min-w-24 px-2 py-2.5 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    {formatShortDate(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.roomTypeId} className="border-b border-[#E8E1D7]/80 last:border-0">
                  <td className="sticky left-0 bg-card px-3 py-2.5">
                    <p className="font-medium">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.code}</p>
                  </td>
                  {dates.map((date) => (
                    <CalendarCell
                      key={date}
                      night={row.nightly.find((item) => item.date === date)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CalendarCell({ night }: { night: InventoryAvailabilityNight | undefined }) {
  const available = night?.available ?? null;
  const held = Boolean(night?.typeHold);
  const blocked = night ? nightlyBlocked(night) : 0;
  const demand = night ? nightlyDemand(night) : 0;
  return (
    <td
      className={`px-2 py-2 text-center ${
        held || available === 0
          ? "bg-destructive/5"
          : blocked
            ? "bg-amber-500/10"
            : available != null && available <= 1
              ? "bg-[#C89933]/8"
              : ""
      }`}
    >
      <p
        className={`font-semibold ${held || available === 0 ? "text-destructive" : "text-foreground"}`}
      >
        {available ?? "—"}
      </p>
      {held ? <p className="text-[10px] text-destructive">Held</p> : null}
      {!held && blocked ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-400">{blocked} blocked</p>
      ) : null}
      {demand > 0 ? <p className="text-[10px] text-muted-foreground">{demand} demand</p> : null}
    </td>
  );
}

export function LegacyRoomInventoryBlocksView({ restaurantId }: { restaurantId: string }) {
  const loadBlocks = useServerFn(listOperationalBlocks);
  const loadRooms = useServerFn(listRooms);
  const loadTypes = useServerFn(listRoomTypes);
  const loadRules = useServerFn(getInventoryRules);
  const createBlock = useServerFn(createOperationalBlock);
  const activate = useServerFn(activateOperationalBlock);
  const approve = useServerFn(approveOperationalBlock);
  const release = useServerFn(releaseOperationalBlock);
  const cancel = useServerFn(cancelOperationalBlock);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [targetKind, setTargetKind] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState<OperationalInventoryBlock | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [form, setForm] = useState({
    targetKind: "room_type" as "room" | "room_type" | "quantity",
    targetId: "",
    quantity: "1",
    blockType: "temporary",
    startDate: today(),
    endDate: addDays(today(), 1),
    reason: "",
    notes: "",
  });
  const blocksQuery = useQuery({
    queryKey: ["operational-blocks", restaurantId, status, targetKind, fromDate, toDate],
    queryFn: () => {
      const data: {
        restaurantId: string;
        limit: number;
        status?: OperationalBlockStatus;
        fromDate?: string;
        toDate?: string;
      } = { restaurantId, limit: 200 };
      if (status !== "all") data.status = status as OperationalBlockStatus;
      if (fromDate) data.fromDate = fromDate;
      if (toDate) data.toDate = toDate;
      return loadBlocks({ data });
    },
    retry: false,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const typesQuery = useQuery({
    queryKey: ["room-inventory-type-options", restaurantId],
    queryFn: () => loadTypes({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const rulesQuery = useQuery({
    queryKey: ["inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["operational-blocks", restaurantId] });
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { kind: "create" }
        | { kind: "activate" | "approve" | "cancel"; blockId: string }
        | { kind: "release"; blockId: string; reason: string },
    ) => {
      if (action.kind === "create") {
        const room = roomsQuery.data?.find((item) => item.id === form.targetId);
        const roomTypeId =
          form.targetKind === "room" ? room?.roomTypeId : form.targetId || undefined;
        if (!roomTypeId) throw new Error("Choose a room or room type.");
        if (form.targetKind === "quantity" && Number(form.quantity) < 1) {
          throw new Error("Quantity blocks need a quantity of at least 1.");
        }
        return createBlock({
          data: {
            restaurantId,
            targetKind: form.targetKind,
            roomId: form.targetKind === "room" ? form.targetId : null,
            roomTypeId,
            quantity: form.targetKind === "quantity" ? Number(form.quantity) : null,
            groupId: null,
            blockType: form.blockType,
            startDate: form.startDate,
            endDate: form.endDate,
            reason: form.reason,
            notes: form.notes || null,
          },
        });
      }
      if (action.kind === "activate")
        return activate({ data: { restaurantId, blockId: action.blockId } });
      if (action.kind === "approve")
        return approve({ data: { restaurantId, blockId: action.blockId } });
      if (action.kind === "release")
        return release({
          data: { restaurantId, blockId: action.blockId, reason: action.reason },
        });
      return cancel({
        data: { restaurantId, blockId: action.blockId, notes: "Cancelled from Room & Inventory" },
      });
    },
    onSuccess: (_result, action) => {
      toast.success(
        action.kind === "create"
          ? "Block saved"
          : action.kind === "activate"
            ? "Block activated"
            : action.kind === "approve"
              ? "Block approved"
              : action.kind === "release"
                ? "Block released"
                : "Block cancelled",
      );
      setShowCreate(false);
      setReleaseTarget(null);
      setReleaseReason("");
      refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Block action failed.");
    },
  });
  const roomNameById = useMemo(
    () => new Map((roomsQuery.data ?? []).map((room) => [room.id, room.roomNumber])),
    [roomsQuery.data],
  );
  const typeNameById = useMemo(
    () => new Map((typesQuery.data ?? []).map((type) => [type.id, type.name])),
    [typesQuery.data],
  );
  const blockTypeOptions = useMemo(() => {
    const catalog = rulesQuery.data?.rules.blockTypes ?? [];
    const enabled = catalog.filter((item) => item.enabled).map((item) => item.blockType);
    const types = enabled.length > 0 ? enabled : catalog.map((item) => item.blockType);
    return (types.length > 0 ? types : ["temporary"]).map((value) => [value, titleCase(value)]);
  }, [rulesQuery.data]);
  const managerDenied = Boolean(blocksQuery.isError);
  const blocks = (blocksQuery.data ?? []).filter((block) => {
    if (targetKind !== "all" && block.targetKind !== targetKind) return false;
    const haystack = [
      block.reason,
      block.blockType,
      block.notes ?? "",
      roomNameById.get(block.roomId ?? "") ?? "",
      typeNameById.get(block.roomTypeId) ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return !search.trim() || haystack.includes(search.trim().toLowerCase());
  });
  const counts = (blocksQuery.data ?? []).reduce<Record<string, number>>(
    (result, block) => ({ ...result, [block.status]: (result[block.status] ?? 0) + 1 }),
    {},
  );
  const createReady =
    Boolean(form.reason.trim()) &&
    Boolean(form.blockType) &&
    form.endDate > form.startDate &&
    (form.targetKind === "room"
      ? Boolean(form.targetId)
      : Boolean(form.targetId) && (form.targetKind !== "quantity" || Number(form.quantity) >= 1));

  return (
    <div className="space-y-4">
      <InventoryViewHeader
        title="Inventory Blocks"
        description="Dated operational holds and approval lifecycle. Create and lifecycle actions require manager access."
        action={
          <Button size="sm" disabled={managerDenied} onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 size-4" />
            Create Block
          </Button>
        }
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <InventoryMetric
          label="Active"
          value={counts.active ?? 0}
          detail="Removing inventory now"
        />
        <InventoryMetric
          label="Pending approval"
          value={counts.pending_approval ?? 0}
          detail="Requires approval"
        />
        <InventoryMetric label="Draft" value={counts.draft ?? 0} detail="Not active" />
        <InventoryMetric label="Released" value={counts.released ?? 0} detail="Lifecycle history" />
      </div>
      <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            Search
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reason, type, room…"
              className="h-9"
            />
          </label>
          <SelectField
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              ["all", "All statuses"],
              ["active", "Active"],
              ["pending_approval", "Pending approval"],
              ["draft", "Draft"],
              ["released", "Released"],
              ["cancelled", "Cancelled"],
            ]}
          />
          <SelectField
            label="Target"
            value={targetKind}
            onChange={setTargetKind}
            options={[
              ["all", "All targets"],
              ["room", "Room"],
              ["room_type", "Room type"],
              ["quantity", "Quantity"],
            ]}
          />
          <LabeledInput label="From date" type="date" value={fromDate} onChange={setFromDate} />
          <LabeledInput label="To date" type="date" value={toDate} onChange={setToDate} />
        </div>
      </section>
      {blocksQuery.isLoading ? (
        <InventoryState state="loading" />
      ) : managerDenied ? (
        <InventoryState
          state="error"
          title="Blocks are unavailable for your role"
          description="Listing and mutating operational blocks requires owner or manager access. Availability, Calendar, and Room Board remain available."
          onRetry={() => blocksQuery.refetch()}
        />
      ) : blocks.length === 0 ? (
        <InventoryState
          state="empty"
          title="No matching blocks"
          description="Create a dated hold when operational inventory needs to be removed."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card shadow-sm">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-[#E8E1D7] bg-muted/30">
              <tr>
                {[
                  "Target",
                  "Block type",
                  "Dates",
                  "Impact",
                  "Quantity",
                  "Reason",
                  "Status",
                  "Approval",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2.5 text-xs font-semibold text-muted-foreground"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  targetLabel={
                    block.targetKind === "room"
                      ? `Room ${roomNameById.get(block.roomId ?? "") ?? "—"}`
                      : `Type ${typeNameById.get(block.roomTypeId) ?? "—"}`
                  }
                  pending={mutation.isPending}
                  onActivate={() => mutation.mutate({ kind: "activate", blockId: block.id })}
                  onApprove={() => mutation.mutate({ kind: "approve", blockId: block.id })}
                  onRelease={() => setReleaseTarget(block)}
                  onCancel={() => mutation.mutate({ kind: "cancel", blockId: block.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create operational block</DialogTitle>
            <DialogDescription>
              Impact and approval are owned by Card 2 block-type rules. Dates are half-open [start,
              end).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="Target kind"
              value={form.targetKind}
              onChange={(value) =>
                setForm({ ...form, targetKind: value as typeof form.targetKind, targetId: "" })
              }
              options={[
                ["room", "Room"],
                ["room_type", "Room type"],
                ["quantity", "Quantity of a room type"],
              ]}
            />
            {form.targetKind === "room" ? (
              <SelectField
                label="Room"
                value={form.targetId}
                onChange={(targetId) => setForm({ ...form, targetId })}
                options={[
                  ["", "Select a room"],
                  ...(roomsQuery.data ?? []).map((room) => [
                    room.id,
                    `${room.roomNumber} · ${room.roomTypeName}`,
                  ]),
                ]}
              />
            ) : (
              <SelectField
                label="Room type"
                value={form.targetId}
                onChange={(targetId) => setForm({ ...form, targetId })}
                options={[
                  ["", "Select a room type"],
                  ...(typesQuery.data ?? []).map((type) => [type.id, type.name]),
                ]}
              />
            )}
            {form.targetKind === "quantity" ? (
              <LabeledInput
                label="Quantity"
                type="number"
                value={form.quantity}
                onChange={(quantity) => setForm({ ...form, quantity })}
              />
            ) : null}
            <SelectField
              label="Block type"
              value={form.blockType}
              onChange={(blockType) => setForm({ ...form, blockType })}
              options={blockTypeOptions}
            />
            <LabeledInput
              label="Start date"
              type="date"
              value={form.startDate}
              onChange={(startDate) => setForm({ ...form, startDate })}
            />
            <LabeledInput
              label="End date"
              type="date"
              min={addDays(form.startDate, 1)}
              value={form.endDate}
              onChange={(endDate) => setForm({ ...form, endDate })}
            />
            <LabeledInput
              label="Reason"
              value={form.reason}
              onChange={(reason) => setForm({ ...form, reason })}
            />
            <LabeledInput
              label="Notes"
              value={form.notes}
              onChange={(notes) => setForm({ ...form, notes })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending || !createReady}
              onClick={() => mutation.mutate({ kind: "create" })}
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(releaseTarget)} onOpenChange={() => setReleaseTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release block</DialogTitle>
            <DialogDescription>
              A release reason is required by the operational block RPC.
            </DialogDescription>
          </DialogHeader>
          <LabeledInput label="Reason" value={releaseReason} onChange={setReleaseReason} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={mutation.isPending || !releaseReason.trim() || !releaseTarget}
              onClick={() => {
                if (!releaseTarget) return;
                mutation.mutate({
                  kind: "release",
                  blockId: releaseTarget.id,
                  reason: releaseReason.trim(),
                });
              }}
            >
              Release
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BlockRow({
  block,
  targetLabel,
  pending,
  onActivate,
  onApprove,
  onRelease,
  onCancel,
}: {
  block: OperationalInventoryBlock;
  targetLabel: string;
  pending: boolean;
  onActivate: () => void;
  onApprove: () => void;
  onRelease: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="border-b border-[#E8E1D7]/80 last:border-0">
      <td className="px-3 py-2.5">
        <p className="font-medium">{targetLabel}</p>
        <p className="text-[11px] text-muted-foreground">{titleCase(block.targetKind)}</p>
      </td>
      <td className="px-3 py-2.5">{titleCase(block.blockType)}</td>
      <td className="px-3 py-2.5">
        {dateLabel(block.startDate)} – {dateLabel(block.endDate)}
      </td>
      <td className="px-3 py-2.5">{titleCase(block.inventoryImpact)}</td>
      <td className="px-3 py-2.5">{block.quantity ?? "—"}</td>
      <td className="max-w-52 px-3 py-2.5">
        <p className="truncate">{block.reason}</p>
      </td>
      <td className="px-3 py-2.5">
        <InventoryStatusBadge
          tone={
            block.status === "active"
              ? "danger"
              : block.status === "pending_approval"
                ? "warning"
                : "neutral"
          }
        >
          {titleCase(block.status)}
        </InventoryStatusBadge>
      </td>
      <td className="px-3 py-2.5">{block.approvalRequired ? "Required" : "Not required"}</td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          {block.status === "draft" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onActivate}>
              Activate
            </Button>
          ) : null}
          {block.status === "pending_approval" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onApprove}>
              Approve
            </Button>
          ) : null}
          {block.status === "active" ? (
            <Button size="sm" variant="outline" disabled={pending} onClick={onRelease}>
              Release
            </Button>
          ) : null}
          {block.status !== "released" && block.status !== "cancelled" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
}) {
  return (
    <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
      {label}
      <Input
        className="h-9"
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
      {label}
      <select
        className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([id, name]) => (
          <option key={`${id}-${name}`} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
