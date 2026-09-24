import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Ellipsis,
  ExternalLink,
  Hammer,
  Layers3,
  RefreshCw,
} from "lucide-react";

import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import {
  listOperationalBlocks,
  listRoomTypeInventoryAvailability,
  type InventoryAvailabilityNight,
  type OperationalInventoryBlock,
  type RoomTypeInventoryAvailability,
} from "@/packages/pms/lib/room-inventory.functions";
import { listRooms, type HotelRoom } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { InventoryState } from "./room-inventory-shared";
import { addDays, dateLabel, nightlyBlocked, nightlyDemand } from "./room-inventory-utils";

type CalendarState = "healthy" | "low" | "full" | "blocked" | "restricted" | "contains_restricted";

interface CalendarGroup {
  name: string;
  rows: RoomTypeInventoryAvailability[];
  roomCount: number;
}

interface RestrictionNote {
  id: string;
  type: "out_of_order" | "out_of_service" | "maintenance";
  target: string;
  dates: string;
  impact: string;
}

const INK = "#251605";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function shiftMonth(value: string, amount: number): string {
  const date = new Date(`${monthStart(value)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function monthEnd(value: string): string {
  return shiftMonth(monthStart(value), 1);
}

function monthLabel(value: string): string {
  return new Date(`${monthStart(value)}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function compactDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function percent(value: number, total: number): string {
  if (total <= 0) return "—";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isRestrictedRoom(room: HotelRoom): boolean {
  return (
    room.status === "out_of_order" ||
    room.status === "out_of_service" ||
    room.maintenanceStatus === "out_of_order" ||
    room.maintenanceStatus === "out_of_service"
  );
}

function blockAffectsDate(block: OperationalInventoryBlock, date: string): boolean {
  return block.startDate <= date && block.endDate > date;
}

function cellState({
  night,
  date,
  businessDate,
  rooms,
  blocks,
}: {
  night: InventoryAvailabilityNight;
  date: string;
  businessDate: string;
  rooms: HotelRoom[];
  blocks: OperationalInventoryBlock[];
}): CalendarState {
  const affectingBlocks = blocks.some((block) => blockAffectsDate(block, date));
  if (night.typeHold || night.quantityHoldApplied > 0 || affectingBlocks) return "blocked";
  if (date === businessDate) {
    const restricted = rooms.filter(isRestrictedRoom).length;
    if (restricted > 0 && restricted >= rooms.length) return "restricted";
    if (restricted > 0) return "contains_restricted";
  }
  const ratio = night.physicalCapacity > 0 ? night.available / night.physicalCapacity : 0;
  if (ratio >= 0.2) return "healthy";
  if (ratio >= 0.1) return "low";
  return "full";
}

export function RoomInventoryCalendarView({
  restaurantId,
  propertyName,
  onViewAffectedRooms,
  onEditBlocks,
}: {
  restaurantId: string;
  propertyName: string;
  onViewAffectedRooms: (search: string) => void;
  onEditBlocks: () => void;
}) {
  const loadBusinessDate = useServerFn(getPropertyBusinessDate);
  const loadAvailability = useServerFn(listRoomTypeInventoryAvailability);
  const loadRooms = useServerFn(listRooms);
  const loadBlocks = useServerFn(listOperationalBlocks);

  const [periodStart, setPeriodStart] = useState(monthStart(today()));
  const [building, setBuilding] = useState("all");
  const [roomTypeId, setRoomTypeId] = useState("all");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(today());
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const initializedFromBusinessDate = useRef(false);
  const periodEnd = monthEnd(periodStart);

  const businessDateQuery = useQuery({
    queryKey: ["property-business-date", restaurantId],
    queryFn: () => loadBusinessDate({ data: { restaurantId } }),
    staleTime: 60_000,
  });
  const businessDate = businessDateQuery.data?.businessDate ?? today();

  useEffect(() => {
    if (!businessDateQuery.data || initializedFromBusinessDate.current) return;
    initializedFromBusinessDate.current = true;
    const date = businessDateQuery.data.businessDate;
    setPeriodStart(monthStart(date));
    setSelectedDate(date);
  }, [businessDateQuery.data]);

  const availabilityQuery = useQuery({
    queryKey: ["room-inventory-calendar", restaurantId, periodStart, periodEnd],
    queryFn: () =>
      loadAvailability({
        data: { restaurantId, arrival: periodStart, departure: periodEnd },
      }),
    staleTime: 60_000,
    enabled: businessDateQuery.isSuccess,
  });
  const roomsQuery = useQuery({
    queryKey: ["room-inventory-room-options", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    staleTime: 60_000,
  });
  const blocksQuery = useQuery({
    queryKey: ["room-inventory-calendar-blocks", restaurantId, periodStart, periodEnd],
    queryFn: () =>
      loadBlocks({
        data: {
          restaurantId,
          status: "active",
          fromDate: periodStart,
          toDate: periodEnd,
          limit: 500,
        },
      }),
    retry: false,
    staleTime: 60_000,
    enabled: businessDateQuery.isSuccess,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const buildings = useMemo(
    () => Array.from(new Set(rooms.map((room) => room.building?.trim() || "Unassigned"))).sort(),
    [rooms],
  );
  const typeBuildings = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const room of rooms) {
      const values = result.get(room.roomTypeId) ?? new Set<string>();
      values.add(room.building?.trim() || "Unassigned");
      result.set(room.roomTypeId, values);
    }
    return result;
  }, [rooms]);
  const visibleRows = useMemo(
    () =>
      (availabilityQuery.data ?? []).filter((row) => {
        if (roomTypeId !== "all" && row.roomTypeId !== roomTypeId) return false;
        if (building === "all") return true;
        return typeBuildings.get(row.roomTypeId)?.has(building) === true;
      }),
    [availabilityQuery.data, building, roomTypeId, typeBuildings],
  );
  const groups = useMemo(() => {
    const result = new Map<string, CalendarGroup>();
    for (const row of visibleRows) {
      const typeLocations = typeBuildings.get(row.roomTypeId) ?? new Set<string>();
      const groupName =
        building !== "all"
          ? building
          : typeLocations.size === 1
            ? [...typeLocations][0]!
            : typeLocations.size > 1
              ? "Multiple Buildings"
              : "Unassigned";
      const current = result.get(groupName) ?? { name: groupName, rows: [], roomCount: 0 };
      current.rows.push(row);
      current.roomCount += rooms.filter((room) => room.roomTypeId === row.roomTypeId).length;
      result.set(groupName, current);
    }
    return [...result.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [visibleRows, typeBuildings, building, rooms]);
  const dates =
    visibleRows[0]?.nightly.map((night) => night.date) ??
    Array.from(
      {
        length: Math.round(
          (new Date(`${periodEnd}T00:00:00Z`).valueOf() -
            new Date(`${periodStart}T00:00:00Z`).valueOf()) /
            86_400_000,
        ),
      },
      (_, index) => addDays(periodStart, index),
    );
  const effectiveSelectedDate = dates.includes(selectedDate)
    ? selectedDate
    : (dates[0] ?? periodStart);
  const selectedRow =
    visibleRows.find((row) => row.roomTypeId === selectedTypeId) ?? visibleRows[0] ?? null;
  const selectedNight =
    selectedRow?.nightly.find((night) => night.date === effectiveSelectedDate) ?? null;
  const selectedRooms = rooms.filter((room) => room.roomTypeId === selectedRow?.roomTypeId);
  const selectedBlocks = (blocksQuery.data ?? []).filter(
    (block) =>
      block.roomTypeId === selectedRow?.roomTypeId &&
      blockAffectsDate(block, effectiveSelectedDate),
  );
  const selectedBuildingSet = selectedRow
    ? (typeBuildings.get(selectedRow.roomTypeId) ?? new Set<string>())
    : new Set<string>();
  const selectedBuilding =
    building !== "all"
      ? building
      : selectedBuildingSet.size === 1
        ? [...selectedBuildingSet][0]!
        : selectedBuildingSet.size > 1
          ? "Multiple Buildings"
          : "Unassigned";

  const dateRows = visibleRows.flatMap((row) => {
    const night = row.nightly.find((item) => item.date === effectiveSelectedDate);
    return night ? [{ row, night }] : [];
  });
  const summary = dateRows.reduce(
    (total, item) => ({
      physical: total.physical + item.night.physicalCapacity,
      demand: total.demand + nightlyDemand(item.night),
      pinned: total.pinned + item.night.pinnedRoomClaims,
      unrepresented: total.unrepresented + item.night.unrepresentedReservationDemand,
      blocked: total.blocked + nightlyBlocked(item.night),
      available: total.available + item.night.available,
    }),
    { physical: 0, demand: 0, pinned: 0, unrepresented: 0, blocked: 0, available: 0 },
  );
  const dateVisibleRooms = rooms.filter((room) =>
    visibleRows.some((row) => row.roomTypeId === room.roomTypeId),
  );
  const showCurrentRestrictions = effectiveSelectedDate === businessDate;
  const outOfOrder = showCurrentRestrictions
    ? dateVisibleRooms.filter((room) => room.status === "out_of_order").length
    : null;
  const outOfService = showCurrentRestrictions
    ? dateVisibleRooms.filter((room) => room.status === "out_of_service").length
    : null;

  const restrictionNotes = useMemo<RestrictionNote[]>(() => {
    if (!showCurrentRestrictions) return [];
    return selectedRooms.flatMap((room) => {
      if (room.status === "out_of_order") {
        return [
          {
            id: `${room.id}-ooo`,
            type: "out_of_order" as const,
            target: `Room ${room.roomNumber}`,
            dates: dateLabel(businessDate),
            impact: "Operational status removes this room from current sellable inventory.",
          },
        ];
      }
      if (room.status === "out_of_service") {
        return [
          {
            id: `${room.id}-oos`,
            type: "out_of_service" as const,
            target: `Room ${room.roomNumber}`,
            dates: dateLabel(businessDate),
            impact: "Operational status removes this room from current sellable inventory.",
          },
        ];
      }
      if (room.maintenanceStatus !== "normal") {
        return [
          {
            id: `${room.id}-maintenance`,
            type: "maintenance" as const,
            target: `Room ${room.roomNumber}`,
            dates: dateLabel(businessDate),
            impact: `Maintenance condition: ${titleCase(room.maintenanceStatus)}.`,
          },
        ];
      }
      return [];
    });
  }, [businessDate, selectedRooms, showCurrentRestrictions]);

  function movePeriod(amount: number) {
    const next = shiftMonth(periodStart, amount);
    setPeriodStart(next);
    setSelectedDate(next);
    setMoreOpen(false);
  }

  function goToday() {
    setPeriodStart(monthStart(businessDate));
    setSelectedDate(businessDate);
  }

  function selectCell(row: RoomTypeInventoryAvailability, date: string) {
    setSelectedTypeId(row.roomTypeId);
    setSelectedDate(date);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileSummaryOpen(true);
    }
  }

  const panelProps = {
    propertyName,
    selectedDate: effectiveSelectedDate,
    businessDate,
    selectedBuilding,
    selectedRow,
    selectedNight,
    summary,
    masterCapacity: dateVisibleRooms.length,
    outOfOrder,
    outOfService,
    blocks: selectedBlocks,
    blocksLoading: blocksQuery.isLoading,
    blocksError: blocksQuery.isError,
    restrictions: restrictionNotes,
    onViewAffectedRooms: () => onViewAffectedRooms(selectedRow?.name ?? selectedBuilding),
    onEditBlocks,
  } satisfies CalendarSummaryPanelProps;

  const loading =
    businessDateQuery.isLoading || availabilityQuery.isLoading || roomsQuery.isLoading;

  return (
    <div className="-mx-3 -mt-2 lg:-mx-5">
      <div className="grid min-h-[calc(100vh-178px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 border-r border-[#E5DED4] bg-[#FAF8F5] px-3 py-3 lg:px-4">
          <CalendarControls
            building={building}
            buildings={buildings}
            roomTypeId={roomTypeId}
            rows={availabilityQuery.data ?? []}
            periodStart={periodStart}
            moreOpen={moreOpen}
            onBuilding={setBuilding}
            onRoomType={setRoomTypeId}
            onPrevious={() => movePeriod(-1)}
            onNext={() => movePeriod(1)}
            onToday={goToday}
            onPeriod={(value) => {
              const next = monthStart(`${value}-01`);
              setPeriodStart(next);
              setSelectedDate(next);
            }}
            onMore={() => setMoreOpen((current) => !current)}
            onRefresh={() => availabilityQuery.refetch()}
          />
          <CalendarLegend />

          <section className="mt-3 overflow-hidden rounded-lg border border-[#E5DED4] bg-white shadow-sm">
            {loading ? (
              <InventoryState state="loading" />
            ) : availabilityQuery.isError ? (
              <InventoryState
                state="error"
                title="Calendar could not be loaded"
                description="The canonical monthly room-type availability request failed."
                onRetry={() => availabilityQuery.refetch()}
              />
            ) : visibleRows.length === 0 ? (
              <InventoryState
                state="empty"
                title="No room types match these filters"
                description="Clear the building or room-type filter to restore the calendar."
              />
            ) : (
              <CalendarMatrix
                groups={groups}
                dates={dates}
                rooms={rooms}
                blocks={blocksQuery.data ?? []}
                businessDate={businessDate}
                selectedTypeId={selectedRow?.roomTypeId ?? null}
                selectedDate={effectiveSelectedDate}
                onSelect={selectCell}
              />
            )}
          </section>
          <p className="mt-2 text-[9px] text-muted-foreground">
            Building groups show where each room type exists. Availability remains the canonical
            property-wide room-type value; room types spanning buildings are grouped separately.
          </p>
        </main>

        <aside className="hidden bg-white lg:block">
          <div className="sticky top-0 max-h-[calc(100vh-96px)] overflow-y-auto">
            <CalendarSummaryPanel {...panelProps} />
          </div>
        </aside>
      </div>

      <Sheet open={mobileSummaryOpen} onOpenChange={setMobileSummaryOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Calendar inventory summary</SheetTitle>
            <SheetDescription>Selected room type and date calendar details.</SheetDescription>
          </SheetHeader>
          <CalendarSummaryPanel {...panelProps} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CalendarControls({
  building,
  buildings,
  roomTypeId,
  rows,
  periodStart,
  moreOpen,
  onBuilding,
  onRoomType,
  onPrevious,
  onNext,
  onToday,
  onPeriod,
  onMore,
  onRefresh,
}: {
  building: string;
  buildings: string[];
  roomTypeId: string;
  rows: RoomTypeInventoryAvailability[];
  periodStart: string;
  moreOpen: boolean;
  onBuilding: (value: string) => void;
  onRoomType: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onPeriod: (value: string) => void;
  onMore: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-lg border border-[#E5DED4] bg-white p-2 shadow-sm">
      <div className="grid items-end gap-2 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_minmax(210px,1.35fr)_auto_auto_1fr_auto]">
        <CompactSelect
          label="Building"
          value={building}
          onChange={onBuilding}
          options={[["all", "All Buildings"], ...buildings.map((value) => [value, value])]}
        />
        <CompactSelect
          label="Room Type"
          value={roomTypeId}
          onChange={onRoomType}
          options={[["all", "All Room Types"], ...rows.map((row) => [row.roomTypeId, row.name])]}
        />
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Previous month"
          onClick={onPrevious}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <label className="grid gap-1 text-[9px] font-medium text-[#5F554B]">
          Period
          <input
            type="month"
            value={periodStart.slice(0, 7)}
            onChange={(event) => onPeriod(event.target.value)}
            className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[10px] outline-none focus:border-[#C89933]"
          />
        </label>
        <Button
          size="icon"
          variant="outline"
          className="size-8"
          aria-label="Next month"
          onClick={onNext}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-[10px]" onClick={onToday}>
          Today
        </Button>
        <CompactSelect
          label="View"
          value="room_types"
          onChange={() => undefined}
          options={[["room_types", "Room Types"]]}
          disabled
        />
        <div className="relative">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="More calendar actions"
            onClick={onMore}
          >
            <Ellipsis className="size-4" />
          </Button>
          {moreOpen ? (
            <div className="absolute right-0 top-9 z-30 w-36 rounded-md border border-[#DED7CD] bg-white p-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] hover:bg-muted"
                onClick={onRefresh}
              >
                <RefreshCw className="size-3" />
                Refresh calendar
              </button>
            </div>
          ) : null}
        </div>
      </div>
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
        className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-[10px] outline-none focus:border-[#C89933] disabled:bg-[#F7F4EF]"
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

function CalendarLegend() {
  const items: Array<[string, string, string]> = [
    ["Healthy", "≥ 20% available", "bg-emerald-400"],
    ["Low Inventory", "10–19% available", "bg-amber-300"],
    ["Full", "0–9% available", "bg-red-300"],
    ["Blocked", "Inventory block / hold", "bg-violet-400"],
    ["Restricted", "All rooms restricted", "bg-zinc-400"],
    [
      "Contains Restricted",
      "Mixed restricted rooms",
      "bg-[repeating-linear-gradient(135deg,#D4D4D8_0_3px,#F4F4F5_3px_6px)]",
    ],
  ];
  return (
    <section className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-[#E5DED4] bg-white px-3 py-2 shadow-sm sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, detail, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span className={`size-3 shrink-0 rounded-full ${color}`} />
          <div>
            <p className="text-[9px] font-medium" style={{ color: INK }}>
              {label}
            </p>
            <p className="text-[8px] text-muted-foreground">{detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function CalendarMatrix({
  groups,
  dates,
  rooms,
  blocks,
  businessDate,
  selectedTypeId,
  selectedDate,
  onSelect,
}: {
  groups: CalendarGroup[];
  dates: string[];
  rooms: HotelRoom[];
  blocks: OperationalInventoryBlock[];
  businessDate: string;
  selectedTypeId: string | null;
  selectedDate: string;
  onSelect: (row: RoomTypeInventoryAvailability, date: string) => void;
}) {
  return (
    <div className="max-h-[calc(100vh-310px)] overflow-auto">
      <table className="min-w-max border-collapse text-[9px]">
        <thead className="sticky top-0 z-30 bg-white">
          <tr className="border-b border-[#DDD5CA]">
            <th className="sticky left-0 z-40 w-40 min-w-40 bg-white px-2 py-2 text-left font-semibold">
              Room Type
            </th>
            <th className="sticky left-40 z-40 w-16 min-w-16 bg-white px-1 py-2 text-center font-semibold">
              Total Rooms
            </th>
            <th
              colSpan={dates.length}
              className="border-l border-[#E8E1D7] px-2 py-2 text-left text-[10px] font-semibold"
              style={{ color: INK }}
            >
              {monthLabel(dates[0] ?? businessDate)}
            </th>
          </tr>
          <tr className="border-b border-[#DDD5CA]">
            <th className="sticky left-0 z-40 bg-white" />
            <th className="sticky left-40 z-40 bg-white" />
            {dates.map((date) => {
              const parsed = new Date(`${date}T00:00:00Z`);
              const weekend = parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6;
              return (
                <th
                  key={date}
                  className={`min-w-9 border-l border-[#EEE8E0] px-1 py-1.5 text-center ${
                    date === selectedDate
                      ? "bg-[#FBF1DA]"
                      : date === businessDate
                        ? "bg-[#F8F2E7]"
                        : "bg-white"
                  } ${weekend ? "text-[#7D5E27]" : "text-muted-foreground"}`}
                >
                  <span className="block text-[9px] font-semibold">{parsed.getUTCDate()}</span>
                  <span className="block text-[7px] font-normal">
                    {parsed.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <CalendarGroupRows
              key={group.name}
              group={group}
              dates={dates}
              rooms={rooms}
              blocks={blocks}
              businessDate={businessDate}
              selectedTypeId={selectedTypeId}
              selectedDate={selectedDate}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalendarGroupRows({
  group,
  dates,
  rooms,
  blocks,
  businessDate,
  selectedTypeId,
  selectedDate,
  onSelect,
}: {
  group: CalendarGroup;
  dates: string[];
  rooms: HotelRoom[];
  blocks: OperationalInventoryBlock[];
  businessDate: string;
  selectedTypeId: string | null;
  selectedDate: string;
  onSelect: (row: RoomTypeInventoryAvailability, date: string) => void;
}) {
  return (
    <>
      <tr className="border-y border-[#DDD5CA] bg-[#F7F3ED]">
        <td
          className="sticky left-0 z-20 bg-[#F7F3ED] px-2 py-1.5 font-semibold"
          style={{ color: INK }}
        >
          <span className="flex items-center gap-1">
            <ChevronDown className="size-3" />
            {group.name}
          </span>
        </td>
        <td className="sticky left-40 z-20 bg-[#F7F3ED] px-1 py-1.5 text-center font-semibold">
          {group.roomCount}
        </td>
        <td colSpan={dates.length} className="bg-[#F7F3ED]" />
      </tr>
      {group.rows.map((row) => {
        const typeRooms = rooms.filter((room) => room.roomTypeId === row.roomTypeId);
        const typeBlocks = blocks.filter((block) => block.roomTypeId === row.roomTypeId);
        return (
          <tr key={row.roomTypeId} className="border-b border-[#EEE8E0]">
            <td
              role="button"
              tabIndex={0}
              className={`sticky left-0 z-20 cursor-pointer bg-white px-5 py-2 font-medium ${
                selectedTypeId === row.roomTypeId ? "border-l-[3px] border-l-[#C89933]" : ""
              }`}
              onClick={() => onSelect(row, selectedDate)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row, selectedDate);
                }
              }}
            >
              {row.name}
            </td>
            <td
              className="sticky left-40 z-20 bg-white px-1 py-2 text-center"
              title={`Canonical sellable pool: ${row.physicalCapacity}`}
            >
              {typeRooms.length}
            </td>
            {dates.map((date) => {
              const night = row.nightly.find((item) => item.date === date);
              return (
                <CalendarCell
                  key={date}
                  row={row}
                  night={night}
                  date={date}
                  businessDate={businessDate}
                  rooms={typeRooms}
                  blocks={typeBlocks}
                  selected={selectedTypeId === row.roomTypeId && selectedDate === date}
                  onSelect={onSelect}
                />
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function CalendarCell({
  row,
  night,
  date,
  businessDate,
  rooms,
  blocks,
  selected,
  onSelect,
}: {
  row: RoomTypeInventoryAvailability;
  night: InventoryAvailabilityNight | undefined;
  date: string;
  businessDate: string;
  rooms: HotelRoom[];
  blocks: OperationalInventoryBlock[];
  selected: boolean;
  onSelect: (row: RoomTypeInventoryAvailability, date: string) => void;
}) {
  if (!night) {
    return <td className="border-l border-[#EEE8E0] bg-zinc-50 px-1 py-2 text-center">—</td>;
  }
  const state = cellState({ night, date, businessDate, rooms, blocks });
  const colors: Record<CalendarState, string> = {
    healthy: "bg-emerald-100/80 text-emerald-900",
    low: "bg-amber-100 text-amber-900",
    full: "bg-red-100 text-red-800",
    blocked: "bg-violet-100 text-violet-900",
    restricted: "bg-zinc-300 text-zinc-800",
    contains_restricted:
      "bg-[repeating-linear-gradient(135deg,#E4E4E7_0_4px,#FAFAFA_4px_8px)] text-zinc-800",
  };
  return (
    <td
      role="button"
      tabIndex={0}
      aria-label={`${row.name}, ${compactDate(date)}, ${night.available} available, ${titleCase(state)}`}
      className={`cursor-pointer border-l border-[#EEE8E0] px-1 py-2 text-center font-medium ${colors[state]} ${
        selected ? "ring-2 ring-inset ring-[#C89933]" : ""
      } ${date === businessDate && !selected ? "border-t-2 border-t-[#C89933]" : ""}`}
      onClick={() => onSelect(row, date)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row, date);
        }
      }}
    >
      {night.available}
    </td>
  );
}

interface CalendarSummaryPanelProps {
  propertyName: string;
  selectedDate: string;
  businessDate: string;
  selectedBuilding: string;
  selectedRow: RoomTypeInventoryAvailability | null;
  selectedNight: InventoryAvailabilityNight | null;
  masterCapacity: number;
  summary: {
    physical: number;
    demand: number;
    pinned: number;
    unrepresented: number;
    blocked: number;
    available: number;
  };
  outOfOrder: number | null;
  outOfService: number | null;
  blocks: OperationalInventoryBlock[];
  blocksLoading: boolean;
  blocksError: boolean;
  restrictions: RestrictionNote[];
  onViewAffectedRooms: () => void;
  onEditBlocks: () => void;
}

function CalendarSummaryPanel({
  propertyName,
  selectedDate,
  businessDate,
  selectedBuilding,
  selectedRow,
  selectedNight,
  masterCapacity,
  summary,
  outOfOrder,
  outOfService,
  blocks,
  blocksLoading,
  blocksError,
  restrictions,
  onViewAffectedRooms,
  onEditBlocks,
}: CalendarSummaryPanelProps) {
  const affectedCount = restrictions.length + blocks.length;
  return (
    <div className="min-h-full bg-white p-3">
      <header className="border-b border-[#E8E1D7] pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold" style={{ color: INK }}>
              {compactDate(selectedDate)}
            </h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{propertyName}</p>
            <p className="text-[9px] text-muted-foreground">
              {selectedBuilding}
              {selectedRow ? ` · ${selectedRow.name}` : ""}
            </p>
          </div>
          <span className="rounded-full bg-[#F4EFE7] px-2 py-1 text-[9px] font-medium">
            1 night
          </span>
        </div>
      </header>

      <section className="border-b border-[#E8E1D7] py-3">
        <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
          Inventory Summary
        </h3>
        <dl className="mt-2 divide-y divide-[#EEE8E0]">
          <SummaryLine label="Physical Capacity" value={masterCapacity} />
          <SummaryLine
            label="Out of Order"
            value={outOfOrder ?? "—"}
            hint={selectedDate !== businessDate ? "Business date only" : undefined}
          />
          <SummaryLine
            label="Out of Service"
            value={outOfService ?? "—"}
            hint={selectedDate !== businessDate ? "Business date only" : undefined}
          />
          <SummaryLine label="Total Sellable Inventory" value={summary.physical} />
        </dl>
        <dl className="mt-3 divide-y divide-[#EEE8E0]">
          <SummaryLine
            label="Reserved / Demand"
            value={summary.demand}
            percentage={percent(summary.demand, summary.physical)}
          />
          <SummaryLine
            label="Pinned Room Claims"
            value={summary.pinned}
            percentage={percent(summary.pinned, summary.physical)}
          />
          <SummaryLine
            label="Unrepresented Demand"
            value={summary.unrepresented}
            percentage={percent(summary.unrepresented, summary.physical)}
          />
          <SummaryLine
            label="Blocked Inventory"
            value={summary.blocked}
            percentage={percent(summary.blocked, summary.physical)}
          />
          <div className="mt-1 flex items-center justify-between rounded bg-emerald-50 px-2 py-2 text-[10px] text-emerald-900">
            <dt className="font-medium">Remaining Available</dt>
            <dd className="flex items-center gap-3 font-semibold">
              <span>{summary.available}</span>
              <span>{percent(summary.available, summary.physical)}</span>
            </dd>
          </div>
        </dl>
        {selectedNight ? (
          <p className="mt-2 text-[8px] text-muted-foreground">
            Values map directly to canonical nightly availability for the selected date.
          </p>
        ) : null}
      </section>

      <section className="py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-semibold" style={{ color: INK }}>
            Operational Notes
          </h3>
          {affectedCount > 0 ? (
            <span className="text-[8px] text-muted-foreground">{affectedCount} items</span>
          ) : null}
        </div>
        <div className="mt-2 space-y-2">
          {restrictions.map((note) => (
            <RestrictionCard key={note.id} note={note} />
          ))}
          {blocksLoading ? (
            <p className="py-3 text-center text-[9px] text-muted-foreground">Loading blocks…</p>
          ) : blocksError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[9px] text-amber-800">
              Block details require owner or manager access. Canonical cell availability remains
              available.
            </div>
          ) : (
            blocks.map((block) => <BlockNote key={block.id} block={block} />)
          )}
          {!blocksLoading && !blocksError && blocks.length === 0 && restrictions.length === 0 ? (
            <p className="py-4 text-center text-[9px] text-muted-foreground">
              No current restrictions or operational blocks affect this selection.
            </p>
          ) : null}
          {selectedDate !== businessDate && restrictions.length === 0 ? (
            <p className="text-[8px] leading-4 text-muted-foreground">
              Room-level OOO/OOS status is only available for the property business date; it is not
              reconstructed for future dates.
            </p>
          ) : null}
        </div>
      </section>

      <footer className="grid grid-cols-2 gap-2 border-t border-[#E8E1D7] pt-3">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-[9px]"
          onClick={onViewAffectedRooms}
        >
          <BedDouble className="mr-1.5 size-3" />
          View Affected Rooms
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[9px]" onClick={onEditBlocks}>
          <ExternalLink className="mr-1.5 size-3" />
          Edit Blocks
        </Button>
      </footer>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  percentage,
  hint,
}: {
  label: string;
  value: number | string;
  percentage?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[9px]">
      <dt className="text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 text-[7px]">({hint})</span> : null}
      </dt>
      <dd className="flex items-center gap-3 font-medium">
        <span>{value}</span>
        {percentage ? (
          <span className="min-w-8 text-right text-muted-foreground">{percentage}</span>
        ) : null}
      </dd>
    </div>
  );
}

function RestrictionCard({ note }: { note: RestrictionNote }) {
  const Icon = note.type === "maintenance" ? Hammer : CircleSlash2;
  return (
    <article className="rounded-md border border-[#E8E1D7] p-2.5">
      <div className="flex gap-2">
        <Icon
          className={`mt-0.5 size-3.5 shrink-0 ${
            note.type === "maintenance" ? "text-amber-700" : "text-zinc-600"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] font-semibold">{note.target}</p>
            <span className="whitespace-nowrap text-[7px] text-muted-foreground">{note.dates}</span>
          </div>
          <p className="text-[8px] font-medium text-muted-foreground">{titleCase(note.type)}</p>
          <p className="mt-1 text-[8px] leading-3.5 text-muted-foreground">{note.impact}</p>
        </div>
      </div>
    </article>
  );
}

function BlockNote({ block }: { block: OperationalInventoryBlock }) {
  return (
    <article className="rounded-md border border-violet-200 bg-violet-50/50 p-2.5">
      <div className="flex gap-2">
        <Layers3 className="mt-0.5 size-3.5 shrink-0 text-violet-700" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] font-semibold">{titleCase(block.blockType)}</p>
            <span className="whitespace-nowrap text-[7px] text-muted-foreground">
              {dateLabel(block.startDate)} – {dateLabel(block.endDate)}
            </span>
          </div>
          <p className="text-[8px] font-medium text-violet-800">
            {block.targetKind === "quantity"
              ? `${block.quantity ?? 0} rooms`
              : block.targetKind === "room"
                ? "Room target"
                : "Room-type target"}{" "}
            · {titleCase(block.inventoryImpact)}
          </p>
          <p className="mt-1 text-[8px] leading-3.5 text-muted-foreground">{block.reason}</p>
        </div>
      </div>
    </article>
  );
}
