import { type ReactNode, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Ban,
  BedDouble,
  BrushCleaning,
  Check,
  ChevronRight,
  LayoutGrid,
  LockKeyhole,
  MoreHorizontal,
  RefreshCw,
  Search,
  Table2,
  UserRound,
  X,
} from "lucide-react";

import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
  RoomShellRefreshButton,
  RoomShellSlot,
  RoomTableFooter,
} from "./room-inventory-shell";

import { setRoomRestriction } from "@/packages/pms/lib/housekeeping.functions";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import {
  listRoomBoardBlocks,
  listRoomBoardOccupancy,
  type RoomBoardBlockRow,
  type RoomBoardOccupancyRow,
} from "@/packages/pms/lib/room-board.functions";
import { listRoomInventoryEvents } from "@/packages/pms/lib/room-inventory.functions";
import {
  getRoomsDashboard,
  listRooms,
  listRoomTypes,
  type HotelRoom,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { CompactSelect, PmsSelect } from "./room-inventory-shared";
import { RoomDetailPanel } from "./room-detail-panel";
import {
  metricPercentage,
  naturalCompare,
  ROOM_STATE_LABELS,
  roomBoardPrimaryState,
  roomStateClasses,
  type RoomBoardPrimaryState,
} from "./room-board-utils";

type ViewMode = "grid" | "table";

export function RoomsDashboardTab({
  restaurantId,
  commandSearch = "",
  canConfigure = false,
  onInspectAssignment,
  onOpenBlocks,
}: {
  restaurantId: string;
  commandSearch?: string;
  canConfigure?: boolean;
  onInspectAssignment?: (room: Pick<HotelRoom, "id" | "roomTypeId">) => void;
  onOpenBlocks?: (
    room: Pick<HotelRoom, "id" | "roomTypeId" | "roomNumber" | "roomTypeName">,
  ) => void;
}) {
  const fetchDashboard = useServerFn(getRoomsDashboard);
  const fetchRooms = useServerFn(listRooms);
  const fetchRoomTypes = useServerFn(listRoomTypes);
  const fetchOccupancy = useServerFn(listRoomBoardOccupancy);
  const fetchBlocks = useServerFn(listRoomBoardBlocks);
  const fetchEvents = useServerFn(listRoomInventoryEvents);
  const restrictRoom = useServerFn(setRoomRestriction);
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState(commandSearch);
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [roomType, setRoomType] = useState("all");
  const [operational, setOperational] = useState("all");
  const [housekeeping, setHousekeeping] = useState("all");
  const [maintenance, setMaintenance] = useState("all");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [restrictionTarget, setRestrictionTarget] = useState<{
    room: HotelRoom;
    status: "available" | "out_of_order" | "out_of_service";
  } | null>(null);
  const [restrictionReason, setRestrictionReason] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");

  useEffect(() => {
    setSearch(commandSearch);
    setPage(1);
  }, [commandSearch]);

  useEffect(() => {
    setPage(1);
  }, [building, floor, roomType, operational, housekeeping, maintenance, search]);

  const dashboardQuery = useQuery({
    queryKey: ["rooms-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId } }),
  });
  const roomsQuery = useQuery({
    queryKey: ["room-board-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const roomTypesQuery = useQuery({
    queryKey: ["room-board-room-types", restaurantId],
    queryFn: () => fetchRoomTypes({ data: { restaurantId, includeInactive: true } }),
  });
  const occupancyQuery = useQuery({
    queryKey: ["room-board-occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
  });
  const blocksQuery = useQuery({
    queryKey: ["room-board-blocks", restaurantId],
    queryFn: () => fetchBlocks({ data: { restaurantId } }),
    retry: false,
  });
  const eventsQuery = useQuery({
    queryKey: ["room-inventory-history", restaurantId],
    queryFn: () => fetchEvents({ data: { restaurantId, limit: 500 } }),
    retry: false,
  });

  const occupancyByRoom = useMemo(
    () => new Map((occupancyQuery.data?.rows ?? []).map((row) => [row.roomId, row])),
    [occupancyQuery.data?.rows],
  );
  const blockByRoom = useMemo(
    () => new Map((blocksQuery.data?.rows ?? []).map((row) => [row.roomId, row])),
    [blocksQuery.data?.rows],
  );
  const roomTypeById = useMemo(
    () => new Map((roomTypesQuery.data ?? []).map((type) => [type.id, type])),
    [roomTypesQuery.data],
  );
  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);

  const locations = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    for (const room of rooms) {
      const buildingName = room.building?.trim() || "Unassigned";
      const floorName = room.floor?.trim() || "Unassigned";
      const floors = result.get(buildingName) ?? new Map<string, number>();
      floors.set(floorName, (floors.get(floorName) ?? 0) + 1);
      result.set(buildingName, floors);
    }
    return Array.from(result.entries())
      .sort(([left], [right]) => naturalCompare(left, right))
      .map(([name, floors]) => ({
        name,
        count: Array.from(floors.values()).reduce((sum, count) => sum + count, 0),
        floors: Array.from(floors.entries()).sort(([left], [right]) => naturalCompare(left, right)),
      }));
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rooms.filter((room) => {
      const occupancy = occupancyByRoom.get(room.id);
      const block = blockByRoom.get(room.id);
      const primary = roomBoardPrimaryState(room, occupancy, block);
      const values = [
        room.roomNumber,
        room.roomCode,
        room.roomTypeName,
        room.roomTypeCode,
        room.building,
        room.floor,
        room.wing,
        ROOM_STATE_LABELS[primary],
        room.housekeepingStatus,
        room.maintenanceStatus,
      ];
      return (
        (query.length === 0 ||
          values.some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(query),
          )) &&
        (building === "all" || (room.building?.trim() || "Unassigned") === building) &&
        (floor === "all" || (room.floor?.trim() || "Unassigned") === floor) &&
        (roomType === "all" || room.roomTypeId === roomType) &&
        (operational === "all" ||
          (operational === "inactive"
            ? !room.active
            : room.active && room.status === operational)) &&
        (housekeeping === "all" || room.housekeepingStatus === housekeeping) &&
        (maintenance === "all" || room.maintenanceStatus === maintenance)
      );
    });
  }, [
    blockByRoom,
    building,
    floor,
    housekeeping,
    maintenance,
    occupancyByRoom,
    operational,
    roomType,
    rooms,
    search,
  ]);

  useEffect(() => {
    if (selectedRoomId && !filteredRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(null);
    }
  }, [filteredRooms, selectedRoomId]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRooms = filteredRooms.slice((safePage - 1) * pageSize, safePage * pageSize);

  const restrictionMutation = useMutation({
    mutationFn: async () => {
      if (!restrictionTarget) throw new Error("Choose a room restriction.");
      return restrictRoom({
        data: {
          restaurantId,
          roomId: restrictionTarget.room.id,
          status: restrictionTarget.status,
          reason:
            restrictionTarget.status === "available"
              ? undefined
              : restrictionReason.trim() || undefined,
          expectedReturn: restrictionTarget.status === "available" ? null : expectedReturn || null,
        },
      });
    },
    onSuccess: async () => {
      setRestrictionTarget(null);
      setRestrictionReason("");
      setExpectedReturn("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["room-board-rooms", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["rooms-dashboard", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["room-inventory-history", restaurantId] }),
      ]);
      invalidateFrontOfficeOwnerReads(queryClient);
    },
  });

  const loading =
    dashboardQuery.isLoading ||
    roomsQuery.isLoading ||
    occupancyQuery.isLoading ||
    roomTypesQuery.isLoading;
  const failed =
    dashboardQuery.isError ||
    roomsQuery.isError ||
    occupancyQuery.isError ||
    roomTypesQuery.isError;
  const refreshing =
    dashboardQuery.isFetching ||
    roomsQuery.isFetching ||
    occupancyQuery.isFetching ||
    blocksQuery.isFetching;

  async function refreshAll() {
    await Promise.all([
      dashboardQuery.refetch(),
      roomsQuery.refetch(),
      roomTypesQuery.refetch(),
      occupancyQuery.refetch(),
      blocksQuery.refetch(),
      eventsQuery.refetch(),
    ]);
  }

  function clearFilters() {
    setSearch("");
    clearFilterFields();
  }

  function clearFilterFields() {
    setBuilding("all");
    setFloor("all");
    setRoomType("all");
    setOperational("all");
    setHousekeeping("all");
    setMaintenance("all");
    setPage(1);
  }

  function selectBuilding(value: string) {
    setBuilding(value);
    setFloor("all");
    setPage(1);
  }

  function selectRoom(room: HotelRoom) {
    setSelectedRoomId(room.id);
  }

  function beginRestriction(
    room: HotelRoom,
    status: "available" | "out_of_order" | "out_of_service",
  ) {
    setRestrictionTarget({ room, status });
    setRestrictionReason(room.restrictionReason ?? "");
    setExpectedReturn(room.restrictionExpectedReturn?.slice(0, 10) ?? "");
  }

  const detail = selectedRoom ? (
    <RoomDetailPanel
      room={selectedRoom}
      roomType={roomTypeById.get(selectedRoom.roomTypeId)}
      occupancy={occupancyByRoom.get(selectedRoom.id)}
      block={blockByRoom.get(selectedRoom.id)}
      events={eventsQuery.data ?? []}
      canManageRestrictions={canConfigure}
      onClose={() => setSelectedRoomId(null)}
      onInspect={() => onInspectAssignment?.(selectedRoom)}
      onOpenBlocks={() => onOpenBlocks?.(selectedRoom)}
      onSetRestriction={(status) => beginRestriction(selectedRoom, status)}
    />
  ) : null;

  const floorOptions = Array.from(
    new Set(
      rooms
        .filter((room) => building === "all" || (room.building?.trim() || "Unassigned") === building)
        .map((room) => room.floor?.trim() || "Unassigned"),
    ),
  ).sort(naturalCompare);
  const roomTypeOptions = roomTypesQuery.data ?? [];
  const filterCount =
    (building !== "all" ? 1 : 0) +
    (floor !== "all" ? 1 : 0) +
    (roomType !== "all" ? 1 : 0) +
    (operational !== "all" ? 1 : 0) +
    (housekeeping !== "all" ? 1 : 0) +
    (maintenance !== "all" ? 1 : 0);
  const operationalLabel =
    operational === "available"
      ? "Available"
      : operational === "out_of_order"
        ? "Out of Order"
        : operational === "out_of_service"
          ? "Out of Service"
          : operational === "inactive"
            ? "Inactive"
            : "";
  const housekeepingLabel =
    housekeeping === "all" ? "" : housekeeping.charAt(0).toUpperCase() + housekeeping.slice(1);
  const maintenanceLabel =
    maintenance === "normal"
      ? "Clear"
      : maintenance === "maintenance_required"
        ? "Required"
        : maintenance === "in_progress"
          ? "In Progress"
          : maintenance === "out_of_service"
            ? "Out of Service"
            : maintenance === "out_of_order"
              ? "Out of Order"
              : maintenance === "inspection"
                ? "Inspection"
                : "";
  const searchField = (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        className="h-9 min-w-0 pl-8 pr-8 text-xs"
        placeholder="Search room number, type, or status…"
        aria-label="Search rooms"
        data-testid="room-board-search"
      />
      {search ? (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#756A5B] hover:text-[#251605]"
          aria-label="Clear search"
          onClick={() => {
            setSearch("");
            setPage(1);
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
  const filterMenu = (
    <PmsFilterMenu
      activeCount={filterCount}
      onClear={clearFilterFields}
      buttonTestId="room-board-filters-button"
      menuTestId="room-board-filters-menu"
    >
      <PmsFilterChoiceRow
        label="Building"
        value={building}
        current={building === "all" ? "" : building}
        options={[["all", "All Buildings"], ...locations.map((item) => [item.name, item.name] as const)]}
        onChange={selectBuilding}
      />
      <PmsFilterChoiceRow
        label="Floor"
        value={floor}
        current={floor === "all" ? "" : floor}
        options={[["all", "All Floors"], ...floorOptions.map((item) => [item, item] as const)]}
        onChange={(value) => {
          setFloor(value);
          setPage(1);
        }}
      />
      <PmsFilterChoiceRow
        label="Room Type"
        value={roomType}
        current={roomTypeOptions.find((item) => item.id === roomType)?.name ?? ""}
        options={[["all", "All Room Types"], ...roomTypeOptions.map((item) => [item.id, item.name] as const)]}
        onChange={(value) => {
          setRoomType(value);
          setPage(1);
        }}
      />
      <PmsFilterChoiceRow
        label="Operational Status"
        value={operational}
        current={operationalLabel}
        options={[
          ["all", "All Statuses"],
          ["available", "Available"],
          ["out_of_order", "Out of Order"],
          ["out_of_service", "Out of Service"],
          ["inactive", "Inactive"],
        ]}
        onChange={(value) => {
          setOperational(value);
          setPage(1);
        }}
      />
      <PmsFilterChoiceRow
        label="Housekeeping"
        value={housekeeping}
        current={housekeepingLabel}
        options={[
          ["all", "All HK Statuses"],
          ["dirty", "Dirty"],
          ["clean", "Clean"],
          ["inspected", "Inspected"],
          ["pickup", "Pickup"],
        ]}
        onChange={(value) => {
          setHousekeeping(value);
          setPage(1);
        }}
      />
      <PmsFilterChoiceRow
        label="Maintenance"
        value={maintenance}
        current={maintenanceLabel}
        options={[
          ["all", "All Conditions"],
          ["normal", "Clear"],
          ["maintenance_required", "Required"],
          ["in_progress", "In Progress"],
          ["out_of_service", "Out of Service"],
          ["out_of_order", "Out of Order"],
          ["inspection", "Inspection"],
        ]}
        onChange={(value) => {
          setMaintenance(value);
          setPage(1);
        }}
      />
    </PmsFilterMenu>
  );
  const boardActions = (
    <>
      <RoomShellRefreshButton
        onClick={() => void refreshAll()}
        spinning={refreshing}
        testId="room-board-refresh"
      />
      <div
        className="inline-flex items-center gap-0.5 rounded-md border border-[#DDD4C5] bg-white p-0.5"
        role="group"
        aria-label="Room board view"
        data-testid="room-board-view-switcher"
      >
        {(
          [
            ["grid", "Grid", LayoutGrid],
            ["table", "Table", Table2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={viewMode === id}
            title={label}
            onClick={() => setViewMode(id)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-sm transition-colors",
              viewMode === id
                ? "bg-[#C89933] text-[#251605]"
                : "bg-transparent text-muted-foreground hover:bg-[#F3EEE4] hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      <RoomShellSlot name="controls">{searchField}</RoomShellSlot>
      <RoomShellSlot name="filter">{filterMenu}</RoomShellSlot>
      <RoomShellSlot name="actions">{boardActions}</RoomShellSlot>

      {loading ? (
        <RoomBoardSkeleton />
      ) : failed ? (
        <div className="rounded-xl border border-destructive/20 bg-card p-8 text-center">
          <p className="text-sm font-medium text-destructive">We couldn't load the Room Board.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Refresh the operational room data to try again.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refreshAll()}>
            <RefreshCw className="mr-2 size-4" /> Retry
          </Button>
        </div>
      ) : (
      <>
      {blocksQuery.isError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Active room blocks could not be loaded. Other room states remain available.
        </p>
      ) : null}

      <section className={ROOM_TABLE_WRAP}>
          {filteredRooms.length === 0 ? (
            <div className="flex min-h-96 items-center justify-center p-8 text-center">
              <div>
                <Search className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No rooms match these filters</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            </div>
          ) : viewMode === "grid" ? (
            <div>
              <div className="grid gap-2.5 p-3 sm:grid-cols-2 2xl:grid-cols-4">
                {pagedRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    occupancy={occupancyByRoom.get(room.id)}
                    block={blockByRoom.get(room.id)}
                    selected={room.id === selectedRoomId}
                    onSelect={() => selectRoom(room)}
                    onInspect={() => onInspectAssignment?.(room)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <RoomList
              rooms={pagedRooms}
              occupancyByRoom={occupancyByRoom}
              blockByRoom={blockByRoom}
              selectedRoomId={selectedRoomId}
              onSelect={selectRoom}
              onInspect={(room) => onInspectAssignment?.(room)}
            />
          )}
          {filteredRooms.length > 0 ? (
            <RoomTableFooter
              page={safePage}
              pageCount={totalPages}
              total={filteredRooms.length}
              pageSize={pageSize}
              noun="rooms"
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          ) : null}
        </section>

      <Sheet
        open={Boolean(selectedRoom)}
        onOpenChange={(open) => {
          if (!open) setSelectedRoomId(null);
        }}
      >
        <SheetContent side="right" className="w-[92vw] max-w-md p-0">
          {detail}
        </SheetContent>
      </Sheet>
      </>
      )}

      <Dialog
        open={Boolean(restrictionTarget)}
        onOpenChange={(open) => !open && setRestrictionTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {restrictionTarget?.status === "available"
                ? `Return room ${restrictionTarget.room.roomNumber} to service`
                : `Set operational restriction`}
            </DialogTitle>
            <DialogDescription>
              This action uses the canonical room restriction service and may enforce maintenance,
              approval, or inspection requirements.
            </DialogDescription>
          </DialogHeader>
          {restrictionTarget?.status !== "available" ? (
            <div className="grid gap-4 py-2">
              <PmsSelect
                label="Restriction"
                value={restrictionTarget?.status ?? "out_of_order"}
                onChange={(val) =>
                  setRestrictionTarget((current) =>
                    current
                      ? {
                          ...current,
                          status: val as "out_of_order" | "out_of_service",
                        }
                      : null,
                  )
                }
                options={[
                  ["out_of_order", "Out of Order"],
                  ["out_of_service", "Out of Service"],
                ]}
              />
              <label className="grid gap-1.5 text-xs font-medium">
                Reason
                <textarea
                  value={restrictionReason}
                  onChange={(event) => setRestrictionReason(event.target.value)}
                  className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  maxLength={500}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium">
                Expected return
                <input
                  type="date"
                  value={expectedReturn}
                  onChange={(event) => setExpectedReturn(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
          ) : null}
          {restrictionMutation.isError ? (
            <p className="text-sm text-destructive">{restrictionMutation.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestrictionTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={restrictionMutation.isPending}
              onClick={() => restrictionMutation.mutate()}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiRow({
  metrics,
}: {
  metrics: {
    total: number;
    available: number;
    occupied: number;
    dirty: number;
    ooo: number;
    blocked: number;
  };
}) {
  const cards = [
    {
      label: "Total Rooms",
      value: metrics.total,
      detail: "All rooms",
      icon: BedDouble,
      tone: "bg-[#F4E9D0] text-[#8A641A]",
    },
    {
      label: "Available",
      value: metrics.available,
      detail: metricPercentage(metrics.available, metrics.total),
      icon: Check,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Occupied",
      value: metrics.occupied,
      detail: metricPercentage(metrics.occupied, metrics.total),
      icon: UserRound,
      tone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Dirty",
      value: metrics.dirty,
      detail: metricPercentage(metrics.dirty, metrics.total),
      icon: BrushCleaning,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "OOO",
      value: metrics.ooo,
      detail: metricPercentage(metrics.ooo, metrics.total),
      icon: Ban,
      tone: "bg-red-50 text-red-700",
    },
    {
      label: "Blocked",
      value: metrics.blocked,
      detail: metricPercentage(metrics.blocked, metrics.total),
      icon: LockKeyhole,
      tone: "bg-violet-50 text-violet-700",
    },
  ];
  return (
    <section
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Room inventory KPIs"
      data-testid="room-board-kpis"
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
        >
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", card.tone)}>
            <card.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-medium text-[#756A5B]">{card.label}</p>
            <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
              {card.value.toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

export function RoomBoardKpiStrip({ restaurantId }: { restaurantId: string }) {
  const fetchDashboard = useServerFn(getRoomsDashboard);
  const fetchRooms = useServerFn(listRooms);
  const fetchOccupancy = useServerFn(listRoomBoardOccupancy);
  const fetchBlocks = useServerFn(listRoomBoardBlocks);
  const dashboardQuery = useQuery({
    queryKey: ["rooms-dashboard", restaurantId],
    queryFn: () => fetchDashboard({ data: { restaurantId } }),
  });
  const roomsQuery = useQuery({
    queryKey: ["room-board-rooms", restaurantId],
    queryFn: () => fetchRooms({ data: { restaurantId, includeInactive: true } }),
  });
  const occupancyQuery = useQuery({
    queryKey: ["room-board-occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
  });
  const blocksQuery = useQuery({
    queryKey: ["room-board-blocks", restaurantId],
    queryFn: () => fetchBlocks({ data: { restaurantId } }),
    retry: false,
  });
  const occupancyByRoom = useMemo(
    () => new Map((occupancyQuery.data?.rows ?? []).map((row) => [row.roomId, row])),
    [occupancyQuery.data?.rows],
  );
  const blockByRoom = useMemo(
    () => new Map((blocksQuery.data?.rows ?? []).map((row) => [row.roomId, row])),
    [blocksQuery.data?.rows],
  );
  const rooms = roomsQuery.data ?? [];
  const metrics = useMemo(() => {
    const states = rooms.map((room) =>
      roomBoardPrimaryState(room, occupancyByRoom.get(room.id), blockByRoom.get(room.id)),
    );
    const total = dashboardQuery.data?.totalRooms ?? rooms.length;
    return {
      total,
      available: states.filter((state) => state === "available").length,
      occupied: states.filter((state) => state === "occupied" || state === "departing").length,
      dirty: states.filter((state) => state === "dirty").length,
      ooo: states.filter((state) => state === "out_of_order").length,
      blocked: states.filter((state) => state === "blocked").length,
    };
  }, [blockByRoom, dashboardQuery.data?.totalRooms, occupancyByRoom, rooms]);
  const loading = dashboardQuery.isLoading || roomsQuery.isLoading || occupancyQuery.isLoading;
  if (loading) {
    return (
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Room inventory KPIs">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.25rem] rounded-lg" />
        ))}
      </section>
    );
  }
  return <KpiRow metrics={metrics} />;
}

type Location = { name: string; count: number; floors: Array<[string, number]> };

function FilterBand({
  rooms,
  roomTypes,
  search,
  building,
  floor,
  roomType,
  operational,
  housekeeping,
  maintenance,
  locations,
  onSearch,
  onBuilding,
  onFloor,
  onRoomType,
  onOperational,
  onHousekeeping,
  onMaintenance,
  onClear,
}: {
  rooms: HotelRoom[];
  roomTypes: RoomType[];
  search: string;
  building: string;
  floor: string;
  roomType: string;
  operational: string;
  housekeeping: string;
  maintenance: string;
  locations: Location[];
  onSearch: (value: string) => void;
  onBuilding: (value: string) => void;
  onFloor: (value: string) => void;
  onRoomType: (value: string) => void;
  onOperational: (value: string) => void;
  onHousekeeping: (value: string) => void;
  onMaintenance: (value: string) => void;
  onClear: () => void;
}) {
  const floors = Array.from(
    new Set(
      rooms
        .filter(
          (room) => building === "all" || (room.building?.trim() || "Unassigned") === building,
        )
        .map((room) => room.floor?.trim() || "Unassigned"),
    ),
  ).sort(naturalCompare);
  return (
    <section className="rounded-xl border border-[#E8E1D7] bg-white p-3.5 shadow-xs">
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(105px,1fr))_minmax(220px,1.5fr)_auto]">
        <FilterSelect
          label="Building"
          value={building}
          onChange={onBuilding}
          options={[["all", "All Buildings"], ...locations.map((item) => [item.name, item.name])]}
        />
        <FilterSelect
          label="Floor"
          value={floor}
          onChange={onFloor}
          options={[["all", "All Floors"], ...floors.map((item) => [item, item])]}
        />
        <FilterSelect
          label="Room Type"
          value={roomType}
          onChange={onRoomType}
          options={[["all", "All Room Types"], ...roomTypes.map((item) => [item.id, item.name])]}
        />
        <FilterSelect
          label="Operational Status"
          value={operational}
          onChange={onOperational}
          options={[
            ["all", "All Statuses"],
            ["available", "Available"],
            ["out_of_order", "Out of Order"],
            ["out_of_service", "Out of Service"],
            ["inactive", "Inactive"],
          ]}
        />
        <FilterSelect
          label="Housekeeping"
          value={housekeeping}
          onChange={onHousekeeping}
          options={[
            ["all", "All HK Statuses"],
            ["dirty", "Dirty"],
            ["clean", "Clean"],
            ["inspected", "Inspected"],
            ["pickup", "Pickup"],
          ]}
        />
        <FilterSelect
          label="Maintenance"
          value={maintenance}
          onChange={onMaintenance}
          options={[
            ["all", "All Conditions"],
            ["normal", "Clear"],
            ["maintenance_required", "Required"],
            ["in_progress", "In Progress"],
            ["out_of_service", "Out of Service"],
            ["out_of_order", "Out of Order"],
            ["inspection", "Inspection"],
          ]}
        />
        <label className="grid gap-1.5 text-xs font-semibold text-[#5F554B]">
          Search
          <div className="flex h-9 items-center gap-2 rounded-lg border border-[#DED7CD] bg-white px-2.5 focus-within:border-[#C89933]">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              id="room-board-search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search room number, type, or status…"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
            />
          </div>
        </label>
        <div className="flex items-end">
          <Button variant="ghost" size="sm" className="h-9 px-3 text-xs font-semibold text-[#756A5B] hover:text-[#251605]" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
    </section>
  );
}

const FilterSelect = CompactSelect;

function LocationNavigator({
  locations,
  building,
  floor,
  totalRooms,
  onBuilding,
  onFloor,
}: {
  locations: Location[];
  building: string;
  floor: string;
  totalRooms: number;
  onBuilding: (value: string) => void;
  onFloor: (building: string, floor: string) => void;
}) {
  return (
    <nav
      className="h-full rounded-xl border border-[#E5DED2] bg-white p-2.5 shadow-xs"
      aria-label="Room locations"
    >
      <button
        type="button"
        onClick={() => onBuilding("all")}
        className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${building === "all" ? "bg-[#F1DDA7] text-[#5D4208]" : "hover:bg-muted text-[#251605]"}`}
      >
        <span className="flex justify-between items-center">
          <span>All Buildings</span>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-[#5D4208]">{totalRooms}</span>
        </span>
      </button>
      <div className="mt-2.5 space-y-1">
        {locations.map((location) => (
          <div key={location.name}>
            <button
              type="button"
              onClick={() => onBuilding(location.name)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold transition-colors ${building === location.name ? "bg-[#F1DDA7] text-[#5D4208]" : "hover:bg-muted text-[#251605]"}`}
            >
              <span className="truncate">{location.name}</span>
              <ChevronRight
                className={`size-3.5 transition-transform ${building === location.name ? "rotate-90" : ""}`}
              />
            </button>
            {building === location.name ? (
              <div className="mt-1 space-y-0.5 pl-2.5">
                {location.floors.map(([floorName, count]) => (
                  <button
                    key={floorName}
                    type="button"
                    onClick={() => onFloor(location.name, floorName)}
                    className={`flex w-full justify-between items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${floor === floorName ? "bg-[#FFF3D1] font-bold text-[#5D4208]" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <span>{floorName === "Unassigned" ? floorName : `Floor ${floorName}`}</span>
                    <span className="text-xs">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </nav>
  );
}

function RoomCard({
  room,
  occupancy,
  block,
  selected,
  onSelect,
  onInspect,
}: {
  room: HotelRoom;
  occupancy?: RoomBoardOccupancyRow | undefined;
  block?: RoomBoardBlockRow | undefined;
  selected: boolean;
  onSelect: () => void;
  onInspect: () => void | undefined;
}) {
  const state = roomBoardPrimaryState(room, occupancy, block);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={cn(
        "min-w-0 cursor-pointer rounded-lg border p-3 transition-colors hover:bg-[#FAF7EF]",
        selected ? "border-[#C89933] bg-[#F4E9D0]/70" : "border-[#DDD4C5] bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-[#251605] leading-tight">{room.roomNumber}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
            {room.roomTypeName || "No room type"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={`Actions for room ${room.roomNumber}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onSelect={onSelect} className="text-xs font-medium">View details</DropdownMenuItem>
            <DropdownMenuItem onSelect={onInspect} className="text-xs font-medium">Inspect assignment</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span
        className={`mt-2.5 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${roomStateClasses(state)}`}
      >
        {ROOM_STATE_LABELS[state]}
      </span>
      <div className="mt-3 border-t border-border/70 pt-2.5 text-xs space-y-1">
        <StatusLine
          label="HK"
          value={room.housekeepingStatus?.replaceAll("_", " ") ?? "N/A"}
          good={room.housekeepingStatus === "clean" || room.housekeepingStatus === "inspected"}
        />
        <StatusLine
          label="Maint."
          value={
            room.maintenanceStatus === "normal"
              ? "Good"
              : room.maintenanceStatus.replaceAll("_", " ")
          }
          good={room.maintenanceStatus === "normal"}
        />
      </div>
    </article>
  );
}

function StatusLine({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`size-2 shrink-0 rounded-full ${good ? "bg-emerald-600" : "bg-amber-500"}`} />
      <span className="w-10 font-medium text-muted-foreground">{label}</span>
      <span className="truncate capitalize font-semibold text-[#251605]">{value}</span>
    </p>
  );
}

function RoomList({
  rooms,
  occupancyByRoom,
  blockByRoom,
  selectedRoomId,
  onSelect,
  onInspect,
}: {
  rooms: HotelRoom[];
  occupancyByRoom: Map<string, RoomBoardOccupancyRow>;
  blockByRoom: Map<string, RoomBoardBlockRow>;
  selectedRoomId: string | null;
  onSelect: (room: HotelRoom) => void;
  onInspect: (room: HotelRoom) => void;
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs" data-testid="room-board-table">
          <thead className={ROOM_TABLE_HEAD}>
            <tr>
              {["Room", "Room Type", "Building/Floor", "Operational Status", "Housekeeping", "Maintenance", "Actions"].map(
                (heading) => (
                  <th key={heading} className={ROOM_TABLE_TH}>
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const occupancy = occupancyByRoom.get(room.id);
              const state = roomBoardPrimaryState(room, occupancy, blockByRoom.get(room.id));
              const building = room.building?.trim() || "Unassigned";
              const floor = room.floor?.trim() || "Unassigned";
              return (
                <tr
                  key={room.id}
                  onClick={() => onSelect(room)}
                  className={cn(
                    "cursor-pointer border-t border-border transition-colors hover:bg-[#FAF7EF]",
                    room.id === selectedRoomId && "bg-[#F4E9D0]/70",
                  )}
                >
                  <td className="px-2 py-2.5 font-semibold text-[#251605]">{room.roomNumber}</td>
                  <td className="px-2 py-2.5 text-[#251605]">{room.roomTypeName || "—"}</td>
                  <td className="px-2 py-2.5 text-[#7A6B58]">
                    {building} / {floor}
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${roomStateClasses(state)}`}
                    >
                      {ROOM_STATE_LABELS[state]}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 capitalize text-[#251605]">
                    {room.housekeepingStatus?.replaceAll("_", " ") ?? "—"}
                  </td>
                  <td className="px-2 py-2.5 capitalize text-[#251605]">
                    {room.maintenanceStatus === "normal" ? "Clear" : room.maintenanceStatus.replaceAll("_", " ")}
                  </td>
                  <td className="px-2 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-[#7A6B58] hover:text-[#251605]"
                          aria-label={`Actions for room ${room.roomNumber}`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onSelect={() => onSelect(room)}>View details</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onInspect(room)}>Inspect assignment</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NoRoomSelected() {
  return (
    <div className="flex h-full min-h-96 items-center justify-center p-8 text-center">
      <div>
        <BedDouble className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Select a room</p>
        <p className="mt-1 text-xs text-muted-foreground">Operational details will appear here.</p>
      </div>
    </div>
  );
}

function RoomBoardSkeleton() {
  return <div className="h-[32rem] animate-pulse rounded-lg border border-[#DDD4C5] bg-white" />;
}
