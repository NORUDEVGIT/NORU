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
  List,
  LockKeyhole,
  MoreHorizontal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

import { setRoomRestriction } from "@/packages/pms/lib/housekeeping.functions";
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
import { RoomDetailPanel } from "./room-detail-panel";
import {
  metricPercentage,
  naturalCompare,
  ROOM_STATE_LABELS,
  roomBoardPrimaryState,
  roomStateClasses,
  selectedRoomClasses,
  type RoomBoardPrimaryState,
} from "./room-board-utils";

const PAGE_SIZE = 10;

type ViewMode = "grid" | "list";

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
  onOpenBlocks?: (room: Pick<HotelRoom, "id" | "roomTypeId">) => void;
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [showLocationNav, setShowLocationNav] = useState(false);
  const [page, setPage] = useState(1);
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
    if (selectedRoomId && filteredRooms.some((room) => room.id === selectedRoomId)) return;
    setSelectedRoomId(filteredRooms[0]?.id ?? null);
  }, [filteredRooms, selectedRoomId]);

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

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const listRoomsPage = filteredRooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      setMobileDetailOpen(true);
    }
  }

  function beginRestriction(
    room: HotelRoom,
    status: "available" | "out_of_order" | "out_of_service",
  ) {
    setRestrictionTarget({ room, status });
    setRestrictionReason(room.restrictionReason ?? "");
    setExpectedReturn(room.restrictionExpectedReturn?.slice(0, 10) ?? "");
  }

  if (loading) return <RoomBoardSkeleton />;
  if (failed) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-card p-8 text-center">
        <p className="text-sm font-medium text-destructive">We couldn't load the Room Board.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Refresh the operational room data to try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void refreshAll()}>
          <RefreshCw className="mr-2 size-4" /> Retry
        </Button>
      </div>
    );
  }

  const detail = selectedRoom ? (
    <RoomDetailPanel
      room={selectedRoom}
      roomType={roomTypeById.get(selectedRoom.roomTypeId)}
      occupancy={occupancyByRoom.get(selectedRoom.id)}
      block={blockByRoom.get(selectedRoom.id)}
      events={eventsQuery.data ?? []}
      canManageRestrictions={canConfigure}
      onInspect={() => onInspectAssignment?.(selectedRoom)}
      onOpenBlocks={() => onOpenBlocks?.(selectedRoom)}
      onSetRestriction={(status) => beginRestriction(selectedRoom, status)}
    />
  ) : null;

  return (
    <div className="space-y-3">
      <KpiRow metrics={metrics} />
      <FilterBand
        rooms={rooms}
        roomTypes={roomTypesQuery.data ?? []}
        search={search}
        building={building}
        floor={floor}
        roomType={roomType}
        operational={operational}
        housekeeping={housekeeping}
        maintenance={maintenance}
        locations={locations}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onBuilding={selectBuilding}
        onFloor={(value) => {
          setFloor(value);
          setPage(1);
        }}
        onRoomType={(value) => {
          setRoomType(value);
          setPage(1);
        }}
        onOperational={(value) => {
          setOperational(value);
          setPage(1);
        }}
        onHousekeeping={(value) => {
          setHousekeeping(value);
          setPage(1);
        }}
        onMaintenance={(value) => {
          setMaintenance(value);
          setPage(1);
        }}
        onClear={clearFilters}
        onToggleLocations={() => setShowLocationNav((current) => !current)}
      />

      {blocksQuery.isError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Active room blocks could not be loaded. Other room states remain available.
        </p>
      ) : null}

      <div className="grid min-h-[580px] gap-3 xl:grid-cols-[190px_minmax(0,1fr)_380px]">
        <div className={`${showLocationNav ? "block" : "hidden"} xl:block`}>
          <LocationNavigator
            locations={locations}
            building={building}
            floor={floor}
            totalRooms={rooms.length}
            onBuilding={selectBuilding}
            onFloor={(nextBuilding, nextFloor) => {
              setBuilding(nextBuilding);
              setFloor(nextFloor);
              setPage(1);
            }}
          />
        </div>

        <section className="min-w-0 overflow-hidden rounded-xl border border-[#E5DED2] bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-1 text-sm">
              <span className="truncate font-semibold">
                {building === "all" ? "All Buildings" : building}
              </span>
              {floor !== "all" ? (
                <>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                  <span className="truncate font-medium">Floor {floor}</span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{filteredRooms.length} rooms</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => void refreshAll()}
                aria-label="Refresh rooms"
              >
                <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </Button>
              <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 ${viewMode === "grid" ? "bg-[#E7C97D] text-[#4A3507]" : "text-muted-foreground"}`}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-[#E7C97D] text-[#4A3507]" : "text-muted-foreground"}`}
                  aria-label="List view"
                >
                  <List className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

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
            <div className="grid gap-2.5 p-3 sm:grid-cols-2 2xl:grid-cols-4">
              {filteredRooms.map((room) => (
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
          ) : (
            <RoomList
              rooms={listRoomsPage}
              occupancyByRoom={occupancyByRoom}
              blockByRoom={blockByRoom}
              onSelect={selectRoom}
              onInspect={(room) => onInspectAssignment?.(room)}
              page={safePage}
              totalPages={totalPages}
              totalRooms={filteredRooms.length}
              onPage={setPage}
            />
          )}
        </section>

        <div className="hidden min-h-0 overflow-hidden rounded-xl border border-[#E5DED2] bg-card shadow-md xl:block">
          {detail ?? <NoRoomSelected />}
        </div>
      </div>

      <Sheet open={mobileDetailOpen && Boolean(selectedRoom)} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="right" className="w-[92vw] max-w-md p-0 xl:hidden">
          {selectedRoom ? (
            <RoomDetailPanel
              room={selectedRoom}
              roomType={roomTypeById.get(selectedRoom.roomTypeId)}
              occupancy={occupancyByRoom.get(selectedRoom.id)}
              block={blockByRoom.get(selectedRoom.id)}
              events={eventsQuery.data ?? []}
              canManageRestrictions={canConfigure}
              onClose={() => setMobileDetailOpen(false)}
              onInspect={() => onInspectAssignment?.(selectedRoom)}
              onOpenBlocks={() => onOpenBlocks?.(selectedRoom)}
              onSetRestriction={(status) => beginRestriction(selectedRoom, status)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

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
              <label className="grid gap-1.5 text-xs font-medium">
                Restriction
                <select
                  value={restrictionTarget?.status ?? "out_of_order"}
                  onChange={(event) =>
                    setRestrictionTarget((current) =>
                      current
                        ? {
                            ...current,
                            status: event.target.value as "out_of_order" | "out_of_service",
                          }
                        : null,
                    )
                  }
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="out_of_order">Out of Order</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              </label>
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
      tone: "text-[#7A5720] bg-[#F7F0E3]",
    },
    {
      label: "Available",
      value: metrics.available,
      detail: metricPercentage(metrics.available, metrics.total),
      icon: Check,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Occupied",
      value: metrics.occupied,
      detail: metricPercentage(metrics.occupied, metrics.total),
      icon: UserRound,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Dirty",
      value: metrics.dirty,
      detail: metricPercentage(metrics.dirty, metrics.total),
      icon: BrushCleaning,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      label: "OOO",
      value: metrics.ooo,
      detail: metricPercentage(metrics.ooo, metrics.total),
      icon: Ban,
      tone: "text-red-700 bg-red-50",
    },
    {
      label: "Blocked",
      value: metrics.blocked,
      detail: metricPercentage(metrics.blocked, metrics.total),
      icon: LockKeyhole,
      tone: "text-violet-700 bg-violet-50",
    },
  ];
  return (
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-3 rounded-xl border border-[#E8E1D7] bg-card px-3 py-3 shadow-sm"
        >
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${card.tone}`}
          >
            <card.icon className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground">{card.label}</p>
            <p className="text-xl font-semibold leading-6">{card.value}</p>
            <p className="text-[10px] text-muted-foreground">{card.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
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
  onToggleLocations,
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
  onToggleLocations: () => void;
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
    <section className="rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[repeat(6,minmax(105px,1fr))_minmax(220px,1.5fr)_auto]">
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
        <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
          Search
          <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-2.5">
            <Search className="size-3.5" />
            <input
              id="room-board-search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search room number, type, or status…"
              className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
            />
          </div>
        </label>
        <div className="flex items-end gap-2">
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={onClear}>
            Clear
          </Button>
          <Button
            size="sm"
            className="h-9 bg-[#D5A62B] text-[#332303] hover:bg-[#C89933]"
            onClick={onToggleLocations}
          >
            <SlidersHorizontal className="mr-2 size-3.5" />
            Filters
          </Button>
        </div>
      </div>
    </section>
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
  options: string[][];
}) {
  return (
    <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
      >
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

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
      className="h-full rounded-xl border border-[#E5DED2] bg-card p-2 shadow-sm"
      aria-label="Room locations"
    >
      <button
        type="button"
        onClick={() => onBuilding("all")}
        className={`w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium ${building === "all" ? "bg-[#F1DDA7] text-[#5D4208]" : "hover:bg-muted"}`}
      >
        <span className="flex justify-between">
          <span>All Buildings</span>
          <span>{totalRooms}</span>
        </span>
      </button>
      <div className="mt-2 space-y-1">
        {locations.map((location) => (
          <div key={location.name}>
            <button
              type="button"
              onClick={() => onBuilding(location.name)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium ${building === location.name ? "bg-[#F1DDA7] text-[#5D4208]" : "hover:bg-muted"}`}
            >
              <span>{location.name}</span>
              <ChevronRight
                className={`size-3.5 transition-transform ${building === location.name ? "rotate-90" : ""}`}
              />
            </button>
            {building === location.name ? (
              <div className="mt-1 space-y-0.5 pl-2">
                {location.floors.map(([floorName, count]) => (
                  <button
                    key={floorName}
                    type="button"
                    onClick={() => onFloor(location.name, floorName)}
                    className={`flex w-full justify-between rounded-md px-2 py-1.5 text-[11px] ${floor === floorName ? "bg-[#FFF3D1] font-medium text-[#5D4208]" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <span>{floorName === "Unassigned" ? floorName : `Floor ${floorName}`}</span>
                    <span>{count}</span>
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
      className={`min-w-0 cursor-pointer rounded-lg border p-2.5 transition-shadow hover:shadow-sm ${selected ? selectedRoomClasses(state) : "border-[#E7E1D8] bg-card"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold leading-4">{room.roomNumber}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {room.roomTypeName || "No room type"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(event) => event.stopPropagation()}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={`Actions for room ${room.roomNumber}`}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onSelect}>View details</DropdownMenuItem>
            <DropdownMenuItem onSelect={onInspect}>Inspect assignment</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span
        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${roomStateClasses(state)}`}
      >
        {ROOM_STATE_LABELS[state]}
      </span>
      <div className="mt-2.5 border-t border-border/70 pt-2 text-[10px]">
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
    <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
      <span className={`size-1.5 rounded-full ${good ? "bg-emerald-600" : "bg-amber-500"}`} />
      <span className="w-9">{label}</span>
      <span className="truncate capitalize text-foreground">{value}</span>
    </p>
  );
}

function RoomList({
  rooms,
  occupancyByRoom,
  blockByRoom,
  onSelect,
  onInspect,
  page,
  totalPages,
  totalRooms,
  onPage,
}: {
  rooms: HotelRoom[];
  occupancyByRoom: Map<string, RoomBoardOccupancyRow>;
  blockByRoom: Map<string, RoomBoardBlockRow>;
  onSelect: (room: HotelRoom) => void;
  onInspect: (room: HotelRoom) => void;
  page: number;
  totalPages: number;
  totalRooms: number;
  onPage: (page: number) => void;
}) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {[
                "Room",
                "Room Type",
                "Occupancy",
                "Housekeeping",
                "Maintenance",
                "Operational Status",
                "Assignment",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-3 py-2.5 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const occupancy = occupancyByRoom.get(room.id);
              const state = roomBoardPrimaryState(room, occupancy, blockByRoom.get(room.id));
              return (
                <tr key={room.id} className="border-b border-border/70 hover:bg-muted/20">
                  <td className="px-3 py-3">
                    <button className="font-semibold" onClick={() => onSelect(room)}>
                      {room.roomNumber}
                    </button>
                    <p className="text-[10px] text-muted-foreground">
                      {room.floor ? `Floor ${room.floor}` : (room.building ?? "—")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {room.roomTypeName}
                    <p className="text-[10px] text-muted-foreground">{room.roomTypeCode}</p>
                  </td>
                  <td className="px-3 py-3 capitalize">{occupancy?.state ?? "Vacant"}</td>
                  <td className="px-3 py-3 capitalize">{room.housekeepingStatus ?? "N/A"}</td>
                  <td className="px-3 py-3 capitalize">
                    {room.maintenanceStatus.replaceAll("_", " ")}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] ${roomStateClasses(state)}`}
                    >
                      {ROOM_STATE_LABELS[state]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => onInspect(room)}
                    >
                      Inspect
                    </Button>
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => onSelect(room)}
                    >
                      Details
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
        <p className="text-[10px] text-muted-foreground">
          Showing {totalRooms === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
          {Math.min(page * PAGE_SIZE, totalRooms)} of {totalRooms} rooms
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </div>
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
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-xl border border-border bg-card" />
      <div className="h-[580px] animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}
