import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Filter,
  Layers3,
  RefreshCw,
  UserRound,
} from "lucide-react";

import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  listOperationalBlocks,
  listRoomInventoryEvents,
  listRoomTypeInventoryAvailability,
  type InventoryAvailabilityNight,
  type OperationalInventoryBlock,
  type RoomInventoryEvent,
  type RoomTypeInventoryAvailability,
} from "@/packages/pms/lib/room-inventory.functions";
import { listRoomBoardOccupancy } from "@/packages/pms/lib/room-board.functions";
import {
  listRooms,
  listRoomTypes,
  type HotelRoom,
  type RoomType,
} from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { addDays, dateLabel, nightlyBlocked, nightlyDemand } from "./room-inventory-utils";
import { InventoryState } from "./room-inventory-shared";

type DetailTab = "overview" | "inventory" | "blocks" | "history";
type OperationalFilter = "all" | "available" | "low" | "sold_out" | "blocked";

const GOLD = "#C89933";
const INK = "#251605";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateSpan(start: string, end: string): number {
  const from = new Date(`${start}T00:00:00Z`).valueOf();
  const to = new Date(`${end}T00:00:00Z`).valueOf();
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function percent(value: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((value / total) * 100)}% of total`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function safeJsonPreview(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value;
    return Object.entries(parsed as Record<string, unknown>)
      .slice(0, 3)
      .map(([key, item]) => `${titleCase(key)}: ${String(item)}`)
      .join(" · ");
  } catch {
    return value;
  }
}

export function RoomInventoryAvailabilityView({
  restaurantId,
  onOpenBlocks,
}: {
  restaurantId: string;
  onOpenBlocks: () => void;
}) {
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const loadAvailability = useServerFn(listRoomTypeInventoryAvailability);
  const loadRooms = useServerFn(listRooms);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const loadOccupancy = useServerFn(listRoomBoardOccupancy);
  const loadBlocks = useServerFn(listOperationalBlocks);
  const loadEvents = useServerFn(listRoomInventoryEvents);

  const [arrival, setArrival] = useState(today());
  const [departure, setDeparture] = useState(addDays(today(), 7));
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [building, setBuilding] = useState("all");
  const [floor, setFloor] = useState("all");
  const [operational, setOperational] = useState<OperationalFilter>("all");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const initializedFromBusinessDate = useRef(false);

  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const businessDate = businessDateQuery.data?.businessDate ?? today();

  useEffect(() => {
    if (!businessDateQuery.data || initializedFromBusinessDate.current) return;
    initializedFromBusinessDate.current = true;
    const next = businessDateQuery.data.businessDate;
    setArrival(next);
    setDeparture(addDays(next, 7));
    setSelectedDate(next);
  }, [businessDateQuery.data]);

  const availabilityQuery = useQuery({
    queryKey: ["room-inventory-availability", restaurantId, arrival, departure],
    queryFn: () => loadAvailability({ data: { restaurantId, arrival, departure } }),
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
    enabled: departure > arrival && businessDateQuery.isSuccess,
  });
  const tonightQuery = useQuery({
    queryKey: ["room-inventory-availability-tonight", restaurantId, businessDate],
    queryFn: () =>
      loadAvailability({
        data: {
          restaurantId,
          arrival: businessDate,
          departure: addDays(businessDate, 1),
        },
      }),
    staleTime: 60_000,
    enabled: businessDateQuery.isSuccess,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const roomTypesQuery = useQuery({
    queryKey: ["room-inventory-type-options", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const occupancyQuery = useQuery({
    queryKey: ["room-board-occupancy", restaurantId],
    queryFn: () => loadOccupancy({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["room-inventory-events", restaurantId],
    queryFn: () => loadEvents({ data: { restaurantId, limit: 200 } }),
    staleTime: 60_000,
  });

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
  const locationTypeIds = useMemo(() => {
    if (building === "all" && floor === "all") return null;
    return new Set(
      (roomsQuery.data ?? [])
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

  const rows = useMemo(
    () =>
      (availabilityQuery.data ?? []).filter((row) => {
        if (roomTypeFilter !== "all" && row.roomTypeId !== roomTypeFilter) return false;
        if (locationTypeIds && !locationTypeIds.has(row.roomTypeId)) return false;
        const selectedNight =
          row.nightly.find((night) => night.date === selectedDate) ?? row.nightly[0];
        if (!selectedNight || operational === "all") return true;
        const blocked = nightlyBlocked(selectedNight);
        if (operational === "available") return selectedNight.available > 0;
        if (operational === "low") {
          return (
            selectedNight.available > 0 &&
            selectedNight.available <= Math.max(1, selectedNight.physicalCapacity * 0.2)
          );
        }
        if (operational === "sold_out") return selectedNight.available === 0;
        return blocked > 0;
      }),
    [availabilityQuery.data, locationTypeIds, operational, roomTypeFilter, selectedDate],
  );
  const dates =
    rows[0]?.nightly.map((night) => night.date) ??
    Array.from({ length: dateSpan(arrival, departure) }, (_, index) => addDays(arrival, index));
  const selectedRow = rows.find((row) => row.roomTypeId === selectedTypeId) ?? rows[0] ?? null;
  const effectiveSelectedDate = dates.includes(selectedDate) ? selectedDate : (dates[0] ?? arrival);
  const selectedNight =
    selectedRow?.nightly.find((night) => night.date === effectiveSelectedDate) ?? null;
  const selectedType =
    (roomTypesQuery.data ?? []).find((type) => type.id === selectedRow?.roomTypeId) ?? null;
  const selectedTypeRooms = useMemo(
    () => (roomsQuery.data ?? []).filter((room) => room.roomTypeId === selectedRow?.roomTypeId),
    [roomsQuery.data, selectedRow?.roomTypeId],
  );

  const blocksQuery = useQuery({
    queryKey: [
      "room-inventory-availability-blocks",
      restaurantId,
      selectedRow?.roomTypeId,
      effectiveSelectedDate,
    ],
    queryFn: () =>
      loadBlocks({
        data: {
          restaurantId,
          roomTypeId: selectedRow!.roomTypeId,
          fromDate: effectiveSelectedDate,
          toDate: addDays(effectiveSelectedDate, 1),
          limit: 100,
        },
      }),
    enabled: Boolean(selectedRow),
    retry: false,
    staleTime: 60_000,
  });

  const scopedTonightRows = useMemo(() => {
    const allowed = new Set(rows.map((row) => row.roomTypeId));
    return (tonightQuery.data ?? []).filter((row) => allowed.has(row.roomTypeId));
  }, [rows, tonightQuery.data]);
  const tonightCapacity = scopedTonightRows.reduce(
    (sum, row) => sum + (row.nightly[0]?.physicalCapacity ?? row.physicalCapacity),
    0,
  );
  const tonightAvailable = scopedTonightRows.reduce(
    (sum, row) => sum + (row.nightly[0]?.available ?? 0),
    0,
  );
  const tonightBlocked = scopedTonightRows.reduce(
    (sum, row) => sum + (row.nightly[0] ? nightlyBlocked(row.nightly[0]) : 0),
    0,
  );
  const overbookingAllowance = scopedTonightRows.reduce(
    (sum, row) => sum + row.overbookingAllowance,
    0,
  );
  const scopedRoomIds = useMemo(
    () =>
      new Set(
        (roomsQuery.data ?? [])
          .filter((room) => rows.some((row) => row.roomTypeId === room.roomTypeId))
          .map((room) => room.id),
      ),
    [roomsQuery.data, rows],
  );
  const occupiedTonight = (occupancyQuery.data?.rows ?? []).filter(
    (item) =>
      scopedRoomIds.has(item.roomId) && (item.state === "occupied" || item.state === "departing"),
  ).length;

  const selectedBlockIds = new Set((blocksQuery.data ?? []).map((block) => block.id));
  const selectedRoomIds = new Set(selectedTypeRooms.map((room) => room.id));
  const history = (eventsQuery.data ?? []).filter(
    (event) =>
      (event.roomId != null && selectedRoomIds.has(event.roomId)) ||
      (event.blockId != null && selectedBlockIds.has(event.blockId)),
  );

  function selectCell(roomTypeId: string, date: string) {
    setSelectedTypeId(roomTypeId);
    setSelectedDate(date);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileDetailsOpen(true);
    }
  }

  function setRange(days: number) {
    setDeparture(addDays(arrival, days));
    setSelectedDate(arrival);
  }

  function moveRange(direction: -1 | 1) {
    const span = dateSpan(arrival, departure);
    const nextArrival = addDays(arrival, span * direction);
    setArrival(nextArrival);
    setDeparture(addDays(nextArrival, span));
    setSelectedDate(nextArrival);
  }

  function clearFilters() {
    setRoomTypeFilter("all");
    setBuilding("all");
    setFloor("all");
    setOperational("all");
    setAdvancedOpen(false);
  }

  const panelProps = {
    selectedRow,
    selectedType,
    selectedNight,
    selectedDate: effectiveSelectedDate,
    dates,
    businessDate,
    rooms: selectedTypeRooms,
    occupancyRows: occupancyQuery.data?.rows ?? [],
    blocks: blocksQuery.data ?? [],
    blocksLoading: blocksQuery.isLoading,
    blocksError: blocksQuery.isError,
    history,
    historyLoading: eventsQuery.isLoading,
    tab: detailTab,
    onTab: setDetailTab,
    onDate: setSelectedDate,
    onOpenBlocks,
  } satisfies AvailabilityDetailPanelProps;

  const loading =
    businessDateQuery.isLoading ||
    availabilityQuery.isLoading ||
    roomsQuery.isLoading ||
    roomTypesQuery.isLoading;

  return (
    <div className="-mx-3 -mt-2 lg:-mx-5">
      <div className="grid min-h-[calc(100vh-178px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 border-r border-[#E5DED4] bg-[#FAF8F5] px-3 py-3 lg:px-4">
          <AvailabilityKpis
            physicalCapacity={tonightCapacity}
            availableTonight={tonightAvailable}
            occupiedTonight={occupiedTonight}
            blockedInventory={tonightBlocked}
            overbookingAllowance={overbookingAllowance}
          />

          <AvailabilityFilters
            building={building}
            buildings={buildings}
            roomType={roomTypeFilter}
            roomTypes={availabilityQuery.data ?? []}
            arrival={arrival}
            departure={departure}
            operational={operational}
            floor={floor}
            floors={floors}
            advancedOpen={advancedOpen}
            onBuilding={(value) => {
              setBuilding(value);
              setFloor("all");
            }}
            onRoomType={setRoomTypeFilter}
            onArrival={(value) => {
              setArrival(value);
              if (departure <= value) setDeparture(addDays(value, 7));
              setSelectedDate(value);
            }}
            onDeparture={setDeparture}
            onOperational={(value) => setOperational(value as OperationalFilter)}
            onFloor={setFloor}
            onClear={clearFilters}
            onAdvanced={() => setAdvancedOpen((current) => !current)}
          />

          <section className="mt-3 overflow-hidden rounded-lg border border-[#E5DED4] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DED4] px-3 py-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: INK }}>
                  Availability Matrix
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  Canonical nightly inventory · {dateLabel(arrival)} –{" "}
                  {dateLabel(addDays(departure, -1))}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {[7, 14, 30].map((days) => (
                  <Button
                    key={days}
                    size="sm"
                    variant={dateSpan(arrival, departure) === days ? "default" : "ghost"}
                    className={
                      dateSpan(arrival, departure) === days
                        ? "h-7 bg-[#B88423] px-3 text-[10px] hover:bg-[#9F711A]"
                        : "h-7 px-3 text-[10px]"
                    }
                    onClick={() => setRange(days)}
                  >
                    {days} days
                  </Button>
                ))}
                <Button
                  size="icon"
                  variant="outline"
                  className="ml-2 size-7"
                  aria-label="Previous period"
                  onClick={() => moveRange(-1)}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Next period"
                  onClick={() => moveRange(1)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-1 size-7"
                  aria-label="Refresh availability"
                  onClick={() => {
                    void availabilityQuery.refetch();
                    void tonightQuery.refetch();
                  }}
                >
                  <RefreshCw className="size-3.5" />
                </Button>
              </div>
            </div>

            {loading ? (
              <InventoryState state="loading" />
            ) : availabilityQuery.isError ? (
              <InventoryState
                state="error"
                title="Availability could not be loaded"
                description="The canonical room-type availability service returned an error."
                onRetry={() => availabilityQuery.refetch()}
              />
            ) : rows.length === 0 ? (
              <InventoryState
                state="empty"
                title="No room types match these filters"
                description="Clear the location or operational filters to restore the matrix."
              />
            ) : (
              <AvailabilityMatrix
                rows={rows}
                roomTypes={roomTypesQuery.data ?? []}
                dates={dates}
                selectedTypeId={selectedRow?.roomTypeId ?? null}
                selectedDate={effectiveSelectedDate}
                onSelect={selectCell}
              />
            )}
          </section>
        </main>

        <aside className="hidden bg-white lg:block">
          <div className="sticky top-0 max-h-[calc(100vh-96px)] overflow-y-auto">
            <AvailabilityDetailPanel {...panelProps} />
          </div>
        </aside>
      </div>

      <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Availability details</SheetTitle>
            <SheetDescription>Selected room type and date inventory details.</SheetDescription>
          </SheetHeader>
          <AvailabilityDetailPanel {...panelProps} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AvailabilityKpis({
  physicalCapacity,
  availableTonight,
  occupiedTonight,
  blockedInventory,
  overbookingAllowance,
}: {
  physicalCapacity: number;
  availableTonight: number;
  occupiedTonight: number;
  blockedInventory: number;
  overbookingAllowance: number;
}) {
  const cards = [
    {
      label: "Total Physical Capacity",
      value: physicalCapacity,
      detail: "Selected room types",
      icon: BedDouble,
      tone: "text-[#8B651D] bg-[#F8F1E5]",
    },
    {
      label: "Available Tonight",
      value: availableTonight,
      detail: percent(availableTonight, physicalCapacity),
      icon: Building2,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Occupied Tonight",
      value: occupiedTonight,
      detail: percent(occupiedTonight, physicalCapacity),
      icon: UserRound,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Blocked Inventory",
      value: blockedInventory,
      detail: percent(blockedInventory, physicalCapacity),
      icon: CircleSlash2,
      tone: "text-red-700 bg-red-50",
    },
    {
      label: "Overbooking Allowance",
      value: overbookingAllowance,
      detail: percent(overbookingAllowance, physicalCapacity),
      icon: Layers3,
      tone: "text-[#8B651D] bg-[#F8F1E5]",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="flex min-h-16 items-center gap-2.5 rounded-lg border border-[#EAE4DB] bg-white px-3 py-2 shadow-sm"
          >
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${card.tone}`}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[9px] text-muted-foreground">{card.label}</p>
              <p className="text-lg font-semibold leading-5" style={{ color: INK }}>
                {card.value}
              </p>
              <p className="truncate text-[9px] text-muted-foreground">{card.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AvailabilityFilters({
  building,
  buildings,
  roomType,
  roomTypes,
  arrival,
  departure,
  operational,
  floor,
  floors,
  advancedOpen,
  onBuilding,
  onRoomType,
  onArrival,
  onDeparture,
  onOperational,
  onFloor,
  onClear,
  onAdvanced,
}: {
  building: string;
  buildings: string[];
  roomType: string;
  roomTypes: RoomTypeInventoryAvailability[];
  arrival: string;
  departure: string;
  operational: string;
  floor: string;
  floors: string[];
  advancedOpen: boolean;
  onBuilding: (value: string) => void;
  onRoomType: (value: string) => void;
  onArrival: (value: string) => void;
  onDeparture: (value: string) => void;
  onOperational: (value: string) => void;
  onFloor: (value: string) => void;
  onClear: () => void;
  onAdvanced: () => void;
}) {
  return (
    <section className="mt-3 rounded-lg border border-[#E5DED4] bg-white p-2 shadow-sm">
      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.45fr_1fr_1.1fr_auto_auto]">
        <CompactSelect
          label="Building"
          value={building}
          onChange={onBuilding}
          options={[["all", "All Buildings"], ...buildings.map((value) => [value, value])]}
        />
        <CompactSelect
          label="Room Type"
          value={roomType}
          onChange={onRoomType}
          options={[
            ["all", "All Room Types"],
            ...roomTypes.map((row) => [row.roomTypeId, row.name]),
          ]}
        />
        <label className="grid gap-1 text-[9px] font-medium text-[#5F554B]">
          Date Range
          <span className="flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-1">
            <input
              type="date"
              value={arrival}
              onChange={(event) => onArrival(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-[10px] outline-none"
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="date"
              min={addDays(arrival, 1)}
              value={departure}
              onChange={(event) => onDeparture(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-[10px] outline-none"
            />
          </span>
        </label>
        <CompactSelect
          label="Channel"
          value="all"
          onChange={() => undefined}
          disabled
          options={[["all", "All Channels"]]}
        />
        <CompactSelect
          label="Operational Status"
          value={operational}
          onChange={onOperational}
          options={[
            ["all", "All Statuses"],
            ["available", "Available"],
            ["low", "Low Inventory"],
            ["sold_out", "Sold Out"],
            ["blocked", "Blocked"],
          ]}
        />
        <Button variant="outline" size="sm" className="h-8 text-[10px]" onClick={onClear}>
          Clear
        </Button>
        <Button
          size="sm"
          className="h-8 bg-[#D3A13B] text-[10px] text-[#251605] hover:bg-[#BE8D2D]"
          onClick={onAdvanced}
        >
          <Filter className="mr-1.5 size-3" />
          Filters
        </Button>
      </div>
      {advancedOpen ? (
        <div className="mt-2 flex items-end gap-2 border-t border-[#EEE8E0] pt-2">
          <div className="w-48">
            <CompactSelect
              label="Floor (room types present)"
              value={floor}
              onChange={onFloor}
              options={[["all", "All Floors"], ...floors.map((value) => [value, value])]}
            />
          </div>
          <p className="pb-1 text-[9px] text-muted-foreground">
            Location filters control which room types appear; canonical availability remains
            property-wide.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CompactSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-[9px] font-medium text-[#5F554B]">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[10px] outline-none focus:border-[#C89933] disabled:bg-[#F7F4EF] disabled:text-muted-foreground"
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

function AvailabilityMatrix({
  rows,
  roomTypes,
  dates,
  selectedTypeId,
  selectedDate,
  onSelect,
}: {
  rows: RoomTypeInventoryAvailability[];
  roomTypes: RoomType[];
  dates: string[];
  selectedTypeId: string | null;
  selectedDate: string;
  onSelect: (roomTypeId: string, date: string) => void;
}) {
  const typeById = new Map(roomTypes.map((type) => [type.id, type]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-[#E5DED4]">
            <th className="sticky left-0 z-20 min-w-40 bg-white px-3 py-2 text-left font-semibold">
              Room Type
              <span className="block text-[8px] font-normal text-muted-foreground">
                Total Rooms
              </span>
            </th>
            <th className="sticky left-40 z-20 min-w-20 bg-[#FAF8F5] px-2 py-2 text-left text-[9px] font-medium text-muted-foreground">
              Measure
            </th>
            {dates.map((date) => (
              <th
                key={date}
                className={`min-w-20 border-l border-[#EEE8E0] px-2 py-2 text-center font-medium ${
                  date === selectedDate ? "bg-[#FBF1DA]" : "bg-white"
                }`}
              >
                {shortDate(date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const type = typeById.get(row.roomTypeId);
            const selected = selectedTypeId === row.roomTypeId;
            return (
              <RoomTypeMatrixRows
                key={row.roomTypeId}
                row={row}
                type={type}
                dates={dates}
                selected={selected}
                selectedDate={selectedDate}
                onSelect={onSelect}
              />
            );
          })}
          <MatrixTotals rows={rows} dates={dates} />
        </tbody>
      </table>
    </div>
  );
}

function RoomTypeMatrixRows({
  row,
  type,
  dates,
  selected,
  selectedDate,
  onSelect,
}: {
  row: RoomTypeInventoryAvailability;
  type: RoomType | undefined;
  dates: string[];
  selected: boolean;
  selectedDate: string;
  onSelect: (roomTypeId: string, date: string) => void;
}) {
  return (
    <>
      {(["sellable", "demand", "available"] as const).map((measure, measureIndex) => (
        <tr
          key={measure}
          className={`${measureIndex === 2 ? "border-b border-[#DDD5CA]" : ""} ${
            selected ? "bg-[#FFFCF5]" : ""
          }`}
        >
          {measureIndex === 0 ? (
            <td
              rowSpan={3}
              role="button"
              tabIndex={0}
              className={`sticky left-0 z-10 w-40 cursor-pointer border-r border-[#EEE8E0] bg-white px-2 py-2 align-middle ${
                selected ? "border-l-[3px] border-l-[#C89933]" : ""
              }`}
              onClick={() => onSelect(row.roomTypeId, selectedDate)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row.roomTypeId, selectedDate);
                }
              }}
            >
              <div className="flex items-center gap-2">
                {type?.coverUrl ? (
                  <img
                    src={type.coverUrl}
                    alt={type.name}
                    className="size-9 rounded object-cover"
                  />
                ) : (
                  <span className="grid size-9 place-items-center rounded bg-[#F3EEE7] text-[#8B7355]">
                    <BedDouble className="size-4" />
                  </span>
                )}
                <div>
                  <p className="font-semibold" style={{ color: INK }}>
                    {row.name}
                  </p>
                  <p className="text-[8px] text-muted-foreground">
                    {type?.roomCount ?? row.physicalCapacity} rooms
                  </p>
                </div>
              </div>
            </td>
          ) : null}
          <td
            className={`sticky left-40 z-10 px-2 py-1.5 font-medium ${
              measure === "sellable"
                ? "bg-[#FAF8F5] text-[#655D54]"
                : measure === "demand"
                  ? "bg-[#FBF7F0] text-[#6D6256]"
                  : "bg-emerald-50/70 text-emerald-800"
            }`}
          >
            {measure === "sellable"
              ? "Sellable"
              : measure === "demand"
                ? "Reserved / Demand"
                : "Available"}
          </td>
          {dates.map((date) => {
            const night = row.nightly.find((item) => item.date === date);
            return (
              <MatrixCell
                key={date}
                night={night}
                measure={measure}
                selected={selected && date === selectedDate}
                onClick={() => onSelect(row.roomTypeId, date)}
              />
            );
          })}
        </tr>
      ))}
    </>
  );
}

function MatrixCell({
  night,
  measure,
  selected,
  onClick,
}: {
  night: InventoryAvailabilityNight | undefined;
  measure: "sellable" | "demand" | "available";
  selected: boolean;
  onClick: () => void;
}) {
  if (!night) {
    return (
      <td className="border-l border-[#EEE8E0] px-2 py-1.5 text-center text-muted-foreground">—</td>
    );
  }
  const demand = nightlyDemand(night);
  const blocked = nightlyBlocked(night);
  const value =
    measure === "sellable"
      ? night.physicalCapacity
      : measure === "demand"
        ? demand
        : night.available;
  const availabilityRatio =
    night.physicalCapacity > 0 ? night.available / night.physicalCapacity : 0;
  const stateClass =
    measure !== "available"
      ? measure === "demand" && blocked > 0
        ? "bg-violet-50/70"
        : ""
      : night.available === 0
        ? "bg-red-50 text-red-700 font-semibold"
        : availabilityRatio <= 0.2
          ? "bg-amber-50 text-amber-800 font-semibold"
          : "bg-emerald-50/70 text-emerald-800 font-semibold";
  return (
    <td
      role="button"
      tabIndex={0}
      className={`cursor-pointer border-l border-[#EEE8E0] px-2 py-1.5 text-center hover:ring-1 hover:ring-inset hover:ring-[#C89933] ${stateClass} ${
        selected ? "ring-2 ring-inset ring-[#C89933]" : ""
      }`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      title={
        blocked > 0 ? `${blocked} blocked${night.typeHold ? " · room type hold" : ""}` : undefined
      }
    >
      {value}
    </td>
  );
}

function MatrixTotals({ rows, dates }: { rows: RoomTypeInventoryAvailability[]; dates: string[] }) {
  return (
    <>
      {(["sellable", "demand", "available"] as const).map((measure, index) => (
        <tr key={measure} className={index === 0 ? "border-t-2 border-[#CFC5B7]" : ""}>
          {index === 0 ? (
            <td
              rowSpan={3}
              className="sticky left-0 z-10 bg-[#F7F3ED] px-3 py-2 font-semibold"
              style={{ color: INK }}
            >
              Total
              <span className="block text-[8px] font-normal text-muted-foreground">
                {rows.reduce((sum, row) => sum + row.physicalCapacity, 0)} rooms
              </span>
            </td>
          ) : null}
          <td
            className={`sticky left-40 z-10 px-2 py-1.5 font-semibold ${
              measure === "available" ? "bg-emerald-100/70 text-emerald-900" : "bg-[#F7F3ED]"
            }`}
          >
            {measure === "sellable"
              ? "Sellable"
              : measure === "demand"
                ? "Reserved / Demand"
                : "Available"}
          </td>
          {dates.map((date) => {
            const value = rows.reduce((sum, row) => {
              const night = row.nightly.find((item) => item.date === date);
              if (!night) return sum;
              if (measure === "sellable") return sum + night.physicalCapacity;
              if (measure === "demand") return sum + nightlyDemand(night);
              return sum + night.available;
            }, 0);
            return (
              <td
                key={date}
                className={`border-l border-[#E4DDD3] px-2 py-1.5 text-center font-semibold ${
                  measure === "available"
                    ? value === 0
                      ? "bg-red-100 text-red-800"
                      : "bg-emerald-100/70 text-emerald-900"
                    : "bg-[#F7F3ED]"
                }`}
              >
                {value}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

interface AvailabilityDetailPanelProps {
  selectedRow: RoomTypeInventoryAvailability | null;
  selectedType: RoomType | null;
  selectedNight: InventoryAvailabilityNight | null;
  selectedDate: string;
  dates: string[];
  businessDate: string;
  rooms: HotelRoom[];
  occupancyRows: Array<{ roomId: string; state: string }>;
  blocks: OperationalInventoryBlock[];
  blocksLoading: boolean;
  blocksError: boolean;
  history: RoomInventoryEvent[];
  historyLoading: boolean;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onDate: (date: string) => void;
  onOpenBlocks: () => void;
}

function AvailabilityDetailPanel(props: AvailabilityDetailPanelProps) {
  const { selectedRow, selectedType, selectedNight, selectedDate, dates, tab, onTab, onDate } =
    props;
  if (!selectedRow || !selectedNight) {
    return (
      <div className="p-5">
        <InventoryState
          state="empty"
          title="Select inventory"
          description="Choose a room type and date in the matrix."
        />
      </div>
    );
  }
  const selectedIndex = dates.indexOf(selectedDate);
  return (
    <div className="min-h-full bg-white">
      <div className="flex items-center gap-3 border-b border-[#E8E1D7] p-3">
        {selectedType?.coverUrl ? (
          <img
            src={selectedType.coverUrl}
            alt={selectedType.name}
            className="size-14 rounded-md object-cover"
          />
        ) : (
          <span className="grid size-14 place-items-center rounded-md bg-[#F2ECE4] text-[#8B7355]">
            <BedDouble className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold" style={{ color: INK }}>
            {selectedRow.name}
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {selectedType?.roomCount ?? selectedRow.physicalCapacity} rooms
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 border-b border-[#E8E1D7] px-2">
        {(["overview", "inventory", "blocks", "history"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onTab(item)}
            className={`border-b-2 px-1 py-2.5 text-[10px] font-medium capitalize ${
              tab === item
                ? "border-[#C89933] text-[#6F4C0F]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Selected Date
            </p>
            <p className="mt-0.5 text-[11px] font-medium">{shortDate(selectedDate)}</p>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              disabled={selectedIndex <= 0}
              onClick={() => onDate(dates[selectedIndex - 1] ?? selectedDate)}
            >
              <ChevronLeft className="size-3" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              disabled={selectedIndex < 0 || selectedIndex >= dates.length - 1}
              onClick={() => onDate(dates[selectedIndex + 1] ?? selectedDate)}
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
        {tab === "overview" ? <OverviewTab {...props} /> : null}
        {tab === "inventory" ? <InventoryTab {...props} /> : null}
        {tab === "blocks" ? <BlocksTab {...props} /> : null}
        {tab === "history" ? <HistoryTab {...props} /> : null}
      </div>
    </div>
  );
}

function OverviewTab({
  selectedRow,
  selectedType,
  selectedNight,
  selectedDate,
  businessDate,
  rooms,
  occupancyRows,
}: AvailabilityDetailPanelProps) {
  if (!selectedRow || !selectedNight) return null;
  const businessDateSelected = selectedDate === businessDate;
  const outOfOrder = businessDateSelected
    ? rooms.filter((room) => room.status === "out_of_order").length
    : null;
  const outOfService = businessDateSelected
    ? rooms.filter((room) => room.status === "out_of_service").length
    : null;
  const roomIds = new Set(rooms.map((room) => room.id));
  const occupied = businessDateSelected
    ? occupancyRows.filter(
        (item) =>
          roomIds.has(item.roomId) && (item.state === "occupied" || item.state === "departing"),
      ).length
    : null;
  const figures: Array<[string, number | string]> = [
    ["Total Rooms", selectedType?.roomCount ?? selectedRow.physicalCapacity],
    ["Out of Order", outOfOrder ?? "—"],
    ["Out of Service", outOfService ?? "—"],
    ["Sellable Inventory", selectedNight.physicalCapacity],
    ["Reserved / Demand", nightlyDemand(selectedNight)],
    ["Available", selectedNight.available],
  ];
  if (occupied != null) {
    figures.push([
      "Occupied",
      `${occupied} (${percent(occupied, selectedNight.physicalCapacity).replace(" of total", "")})`,
    ]);
  }
  const limitingDateInRange =
    selectedRow.limitingDate != null &&
    selectedRow.nightly.some((night) => night.date === selectedRow.limitingDate);
  return (
    <div className="space-y-3">
      <section>
        <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
          Key Figures
        </h3>
        <dl className="mt-1 divide-y divide-[#EEE8E0]">
          {figures.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-1.5 text-[10px]">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {!businessDateSelected ? (
          <p className="mt-1 text-[9px] text-muted-foreground">
            OOO, OOS, and occupied-room counts are only available for the property business date.
          </p>
        ) : null}
      </section>
      {limitingDateInRange ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
          <div className="flex gap-2">
            <CircleSlash2 className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-[10px] font-semibold">Limiting Date</p>
              <p className="mt-1 text-[10px] leading-4">
                {dateLabel(selectedRow.limitingDate)} is the limiting date for {selectedRow.name}.
              </p>
              <p className="mt-1 text-[9px] leading-4 text-red-700">
                This is the canonical stay-limiting night returned by room-type availability.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {nightlyBlocked(selectedNight) > 0 ? (
        <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
          <div className="flex gap-2">
            <Boxes className="mt-0.5 size-4 shrink-0 text-violet-700" />
            <div>
              <p className="text-[10px] font-semibold text-violet-900">Inventory hold impact</p>
              <p className="mt-1 text-[9px] leading-4 text-violet-800">
                {nightlyBlocked(selectedNight)} room
                {nightlyBlocked(selectedNight) === 1 ? "" : "s"} removed by canonical nightly holds.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InventoryTab({ selectedRow, selectedNight }: AvailabilityDetailPanelProps) {
  if (!selectedRow || !selectedNight) return null;
  const values: Array<[string, number | string]> = [
    ["Canonical physical / sellable pool", selectedNight.physicalCapacity],
    ["Pinned room claims", selectedNight.pinnedRoomClaims],
    ["Unrepresented reservation demand", selectedNight.unrepresentedReservationDemand],
    ["Total reserved / demand", nightlyDemand(selectedNight)],
    ["Quantity hold applied", selectedNight.quantityHoldApplied],
    ["Room-type hold", selectedNight.typeHold ? "Yes" : "No"],
    ["Available", selectedNight.available],
    ["Overbooking allowance", selectedRow.overbookingAllowance],
  ];
  return (
    <section>
      <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
        Canonical Nightly Inventory
      </h3>
      <dl className="mt-1 divide-y divide-[#EEE8E0]">
        {values.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 py-2 text-[10px]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function BlocksTab({
  blocks,
  blocksLoading,
  blocksError,
  rooms,
  onOpenBlocks,
}: AvailabilityDetailPanelProps) {
  const roomById = new Map(rooms.map((room) => [room.id, room.roomNumber]));
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
          Relevant Operational Blocks
        </h3>
        <Button size="sm" variant="ghost" className="h-7 text-[9px]" onClick={onOpenBlocks}>
          View All Blocks
        </Button>
      </div>
      {blocksLoading ? (
        <p className="py-5 text-center text-[10px] text-muted-foreground">Loading blocks…</p>
      ) : blocksError ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">
          Block details require owner or manager access.
        </div>
      ) : blocks.length === 0 ? (
        <p className="py-5 text-center text-[10px] text-muted-foreground">
          No operational blocks overlap this room type and date.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {blocks.map((block) => (
            <article key={block.id} className="rounded-md border border-[#E8E1D7] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold">{titleCase(block.blockType)}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {block.roomId
                      ? `Room ${roomById.get(block.roomId) ?? "target"}`
                      : block.targetKind === "quantity"
                        ? `${block.quantity ?? 0} rooms from type`
                        : "Entire room type"}
                  </p>
                </div>
                <span className="rounded-full bg-[#F3EEE7] px-2 py-0.5 text-[8px] font-medium">
                  {titleCase(block.status)}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
                <dt className="text-muted-foreground">Dates</dt>
                <dd className="text-right">
                  {dateLabel(block.startDate)} – {dateLabel(block.endDate)}
                </dd>
                <dt className="text-muted-foreground">Impact</dt>
                <dd className="text-right">{titleCase(block.inventoryImpact)}</dd>
              </dl>
              <p className="mt-2 border-t border-[#EEE8E0] pt-2 text-[9px]">{block.reason}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryTab({ history, historyLoading }: AvailabilityDetailPanelProps) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
        Inventory History
      </h3>
      {historyLoading ? (
        <p className="py-5 text-center text-[10px] text-muted-foreground">Loading history…</p>
      ) : history.length === 0 ? (
        <p className="py-5 text-center text-[10px] text-muted-foreground">
          No room or relevant block events were found for this room type.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {history.map((event) => {
            const before = safeJsonPreview(event.previousValues);
            const after = safeJsonPreview(event.newValues);
            return (
              <article key={event.id} className="border-l-2 border-[#C89933] pl-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[10px] font-semibold">{titleCase(event.eventType)}</p>
                  <time className="whitespace-nowrap text-[8px] text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </div>
                {event.roomNumber ? (
                  <p className="text-[9px] text-muted-foreground">Room {event.roomNumber}</p>
                ) : null}
                {before ? (
                  <p className="mt-1 text-[9px] text-muted-foreground">Before: {before}</p>
                ) : null}
                {after ? (
                  <p className="mt-1 text-[9px] text-muted-foreground">After: {after}</p>
                ) : null}
                {event.notes ? <p className="mt-1 text-[9px]">{event.notes}</p> : null}
                <p className="mt-1 truncate text-[8px] text-muted-foreground">
                  Actor {event.actorMembershipId}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
