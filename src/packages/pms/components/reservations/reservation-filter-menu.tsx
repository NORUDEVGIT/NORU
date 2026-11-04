import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import {
  PmsFilterChoiceRow,
  PmsFilterMenu,
  PMS_FILTER_ITEM,
  PMS_FILTER_ROW,
  PMS_FILTER_SUB,
} from "@/packages/pms/components/pms-filter-menu";
import {
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  type PickedReservationMaster,
} from "@/packages/pms/lib/create-reservation-phase1";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { accountListItems } from "@/packages/pms/lib/guest-profile-wave4";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { listRatePlans } from "@/packages/pms/lib/rates.functions";
import {
  CALENDAR_DENSITIES,
  type CalendarDensity,
  type CalendarDisplayOptions,
} from "@/packages/pms/lib/reservation-workspace/booking-calendar";
import {
  DESK_FILTER_ALL,
  validateAdvancedFilters,
  validateDateRange,
  type DeskAdvancedFilters,
  type DeskAssignmentFilter,
  type DeskSourceFilter,
  type DeskStatusFilter,
  type DeskVipFilter,
} from "@/packages/pms/lib/reservation-workspace/reservation-desk-filters";
import type { CalendarViewState } from "@/packages/pms/components/reservations/reservation-desk-toolbar-menu";
import type { CalendarMode } from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { listRooms } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

const STATUS_OPTIONS: Array<[DeskStatusFilter, string]> = [
  ["all", "All statuses"],
  ["confirmed", "Confirmed"],
  ["pending", "Pending"],
  ["checked_in", "Checked In"],
  ["checked_out", "Checked Out"],
  ["cancelled", "Cancelled"],
  ["no_show", "No-Show"],
];

const SOURCE_OPTIONS: Array<[DeskSourceFilter, string]> = [
  ["all", "All sources"],
  ["staff", "Staff"],
  ["walk_in", "Walk-in"],
  ["direct_booking", "Direct booking"],
  ["future_online", "Future online"],
];

const ASSIGNMENT_OPTIONS: Array<[DeskAssignmentFilter, string]> = [
  ["all", "All"],
  ["assigned", "Assigned"],
  ["unassigned", "Unassigned"],
];

const VIP_OPTIONS: Array<[DeskVipFilter, string]> = [
  ["all", "All guests"],
  ["yes", "VIP"],
  ["no", "Not VIP"],
];

const ROW = PMS_FILTER_ROW;
const SUB = PMS_FILTER_SUB;
const ITEM = PMS_FILTER_ITEM;

export function ReservationFilterMenu({
  restaurantId,
  view,
  activeCount,
  status,
  roomTypeId,
  roomTypeOptions,
  source,
  arrivalFrom,
  arrivalTo,
  advanced,
  calendar,
  onStatus,
  onRoomType,
  onSource,
  onArrival,
  onAdvanced,
  onClear,
}: {
  restaurantId: string;
  view: string;
  activeCount: number;
  status: DeskStatusFilter;
  roomTypeId: string;
  roomTypeOptions: Array<[string, string]>;
  source: DeskSourceFilter;
  arrivalFrom: string;
  arrivalTo: string;
  advanced: DeskAdvancedFilters;
  /** Existing Booking Calendar display options. Omitted on the table. */
  calendar?: {
    view: CalendarViewState;
    onChange: (next: CalendarViewState) => void;
  };
  onStatus: (value: DeskStatusFilter) => void;
  onRoomType: (id: string, name: string) => void;
  onSource: (value: DeskSourceFilter) => void;
  onArrival: (from: string, to: string) => void;
  onAdvanced: (next: DeskAdvancedFilters) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const loadRooms = useServerFn(listRooms);
  const loadPlans = useServerFn(listRatePlans);
  const loadSet6 = useServerFn(getPmsSet6Snapshot);

  const roomsQuery = useQuery({
    queryKey: ["reservation-desk-rooms", restaurantId],
    queryFn: () => loadRooms({ data: { restaurantId, includeInactive: false } }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const ratePlansQuery = useQuery({
    queryKey: ["reservation-desk-rate-plans", restaurantId],
    queryFn: () => loadPlans({ data: { restaurantId, activeOnly: true } }),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const set6Query = useQuery({
    queryKey: ["reservation-desk-set6", restaurantId],
    queryFn: () => loadSet6({ data: { restaurantId } }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const sourceOptions = resolveBookingSourceOptions(set6Query.data?.snapshot.sourceCodes);
  const segmentOptions = resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments);

  function applyAdvanced(next: DeskAdvancedFilters) {
    const invalid = validateAdvancedFilters(next, view);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    onAdvanced(next);
  }

  function applyArrival(from: string, to: string) {
    const invalid = validateDateRange(from, to, "Arrival From", "Arrival To");
    if (invalid) {
      toast.error(invalid);
      return;
    }
    onArrival(from, to);
  }

  const roomTypes: Array<[string, string]> = [
    [DESK_FILTER_ALL, "All room types"],
    ...roomTypeOptions,
  ];
  const rooms: Array<[string, string]> = [
    [DESK_FILTER_ALL, "All rooms"],
    ...(roomsQuery.data ?? []).map((room) => [room.id, `Room ${room.roomNumber}`] as [string, string]),
  ];
  const ratePlans: Array<[string, string]> = [
    [DESK_FILTER_ALL, "All rate plans"],
    ...(ratePlansQuery.data ?? []).map(
      (plan) => [plan.id, `${plan.code} · ${plan.name}`] as [string, string],
    ),
  ];

  return (
    <PmsFilterMenu
      open={open}
      onOpenChange={setOpen}
      activeCount={activeCount}
      onClear={onClear}
      buttonTestId="reservation-desk-more-filters-button"
      countTestId="reservation-filters-count"
      menuTestId="reservation-filters-menu"
    >
        <ChoiceRow
          label="Status"
          value={status}
          current={labelOf(STATUS_OPTIONS, status)}
          options={STATUS_OPTIONS}
          onChange={(value) => onStatus(value as DeskStatusFilter)}
        />
        <ChoiceRow
          label="Room Type"
          value={roomTypeId || DESK_FILTER_ALL}
          current={labelOf(roomTypes, roomTypeId)}
          options={roomTypes}
          onChange={(value) =>
            onRoomType(value, roomTypeOptions.find(([id]) => id === value)?.[1] ?? "")
          }
        />
        <ChoiceRow
          label="Source"
          value={source}
          current={labelOf(SOURCE_OPTIONS, source)}
          options={SOURCE_OPTIONS}
          onChange={(value) => onSource(value as DeskSourceFilter)}
        />
        <ChoiceRow
          label="Assignment"
          value={advanced.assignment}
          current={labelOf(ASSIGNMENT_OPTIONS, advanced.assignment)}
          options={ASSIGNMENT_OPTIONS}
          onChange={(value) =>
            applyAdvanced({ ...advanced, assignment: value as DeskAssignmentFilter })
          }
        />
        <ChoiceRow
          label="Guest / VIP"
          value={advanced.vip}
          current={labelOf(VIP_OPTIONS, advanced.vip)}
          options={VIP_OPTIONS}
          onChange={(value) => applyAdvanced({ ...advanced, vip: value as DeskVipFilter })}
        />
        <DateRow
          label="Arrival"
          from={arrivalFrom}
          to={arrivalTo}
          active={Boolean(arrivalFrom || arrivalTo)}
          onChange={applyArrival}
        />
        <DateRow
          label="Departure"
          from={advanced.departureFrom}
          to={advanced.departureTo}
          active={Boolean(advanced.departureFrom || advanced.departureTo)}
          onChange={(from, to) => applyAdvanced({ ...advanced, departureFrom: from, departureTo: to })}
        />
        <ChoiceRow
          label="Room"
          value={advanced.roomId || DESK_FILTER_ALL}
          current={advanced.roomNumber ? `Room ${advanced.roomNumber}` : ""}
          options={rooms}
          onChange={(value) => {
            const room = (roomsQuery.data ?? []).find((row) => row.id === value);
            applyAdvanced({
              ...advanced,
              roomId: value,
              roomNumber: room?.roomNumber ?? "",
            });
          }}
        />
        {ratePlansQuery.isError ? null : (
          <ChoiceRow
            label="Rate Plan"
            value={advanced.ratePlanId || DESK_FILTER_ALL}
            current={advanced.ratePlanName}
            options={ratePlans}
            onChange={(value) => {
              const plan = (ratePlansQuery.data ?? []).find((row) => row.id === value);
              applyAdvanced({
                ...advanced,
                ratePlanId: value,
                ratePlanName: plan ? plan.code : "",
              });
            }}
          />
        )}
        <ChoiceRow
          label="Booking Source"
          value={advanced.commercialBookingSource || DESK_FILTER_ALL}
          current={advanced.commercialBookingSourceLabel}
          options={[
            [DESK_FILTER_ALL, "All booking sources"],
            ...sourceOptions.map((row) => [row.value, row.label] as [string, string]),
          ]}
          onChange={(value) => {
            const option = sourceOptions.find((row) => row.value === value);
            applyAdvanced({
              ...advanced,
              commercialBookingSource: value,
              commercialBookingSourceLabel: option?.label ?? "",
            });
          }}
        />
        <ChoiceRow
          label="Market Segment"
          value={advanced.marketSegment || DESK_FILTER_ALL}
          current={advanced.marketSegmentLabel}
          options={[
            [DESK_FILTER_ALL, "All segments"],
            ...segmentOptions.map((row) => [row.value, row.label] as [string, string]),
          ]}
          onChange={(value) => {
            const option = segmentOptions.find((row) => row.value === value);
            applyAdvanced({
              ...advanced,
              marketSegment: value,
              marketSegmentLabel: option?.label ?? "",
            });
          }}
        />
        <PickerRow label="Company" active={Boolean(advanced.companyMasterId)} detail={advanced.companyName}>
          <CreateReservationMasterPicker
            restaurantId={restaurantId}
            kind="company"
            canCreate={false}
            master={
              advanced.companyMasterId
                ? { id: advanced.companyMasterId, name: advanced.companyName || "Company", code: null, paymentTerms: null }
                : null
            }
            onMasterChange={(master: PickedReservationMaster | null) =>
              applyAdvanced({
                ...advanced,
                companyMasterId: master?.id ?? "",
                companyName: master?.name ?? "",
              })
            }
          />
        </PickerRow>
        <PickerRow
          label="Travel Agent"
          active={Boolean(advanced.travelAgentMasterId)}
          detail={advanced.travelAgentName}
        >
          <CreateReservationMasterPicker
            restaurantId={restaurantId}
            kind="travel_agent"
            canCreate={false}
            master={
              advanced.travelAgentMasterId
                ? {
                    id: advanced.travelAgentMasterId,
                    name: advanced.travelAgentName || "Travel Agent",
                    code: null,
                    paymentTerms: null,
                  }
                : null
            }
            onMasterChange={(master: PickedReservationMaster | null) =>
              applyAdvanced({
                ...advanced,
                travelAgentMasterId: master?.id ?? "",
                travelAgentName: master?.name ?? "",
              })
            }
          />
        </PickerRow>
        <PickerRow label="Group" active={Boolean(advanced.groupAccountMasterId)} detail={advanced.groupName}>
          <GroupChoices
            restaurantId={restaurantId}
            enabled={open}
            groupId={advanced.groupAccountMasterId}
            groupName={advanced.groupName}
            onChange={(groupAccountMasterId, groupName) =>
              applyAdvanced({ ...advanced, groupAccountMasterId, groupName })
            }
          />
        </PickerRow>

        {calendar ? (
          <>
            <DropdownMenuSeparator className="bg-[#DDD4C5]" />
            <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#7A6B58]">
              Calendar display
            </DropdownMenuLabel>
            <ChoiceRow
              label="Layout"
              value={calendar.view.mode}
              current={calendar.view.mode === "room" ? "Room view" : "Room type view"}
              options={[
                ["room", "Room view"],
                ["room_type", "Room type view"],
              ]}
              neutralValue="room"
              onChange={(value) => calendar.onChange({ ...calendar.view, mode: value as CalendarMode })}
            />
            <ChoiceRow
              label="Density"
              value={calendar.view.density}
              current={calendar.view.density}
              options={CALENDAR_DENSITIES.map((value) => [value, value] as [string, string])}
              neutralValue="standard"
              onChange={(value) =>
                calendar.onChange({ ...calendar.view, density: value as CalendarDensity })
              }
            />
            <PickerRow label="Building" active={Boolean(calendar.view.building.trim())} detail={calendar.view.building}>
              <Input
                className="h-9"
                value={calendar.view.building}
                placeholder="Optional"
                aria-label="Building filter"
                onChange={(event) =>
                  calendar.onChange({ ...calendar.view, building: event.target.value })
                }
                onKeyDown={(event) => event.stopPropagation()}
              />
            </PickerRow>
            <PickerRow label="Show on calendar" active={calendarDisplayChanged(calendar.view)}>
              <div className="grid gap-1">
                <DisplayToggle
                  label="Guest name"
                  checked={calendar.view.display.guestName}
                  onChange={(guestName) =>
                    calendar.onChange({
                      ...calendar.view,
                      display: { ...calendar.view.display, guestName },
                    })
                  }
                />
                <DisplayToggle
                  label="Confirmation number"
                  checked={calendar.view.display.confirmationNumber}
                  onChange={(confirmationNumber) =>
                    calendar.onChange({
                      ...calendar.view,
                      display: { ...calendar.view.display, confirmationNumber },
                    })
                  }
                />
                <DisplayToggle
                  label="Housekeeping status"
                  checked={calendar.view.display.housekeepingStatus}
                  onChange={(housekeepingStatus) =>
                    calendar.onChange({
                      ...calendar.view,
                      display: { ...calendar.view.display, housekeepingStatus },
                    })
                  }
                />
                <DisplayToggle
                  label="Room status"
                  checked={calendar.view.display.roomStatus}
                  onChange={(roomStatus) =>
                    calendar.onChange({
                      ...calendar.view,
                      display: { ...calendar.view.display, roomStatus },
                    })
                  }
                />
                <DisplayToggle
                  label="Unassigned lane"
                  checked={calendar.view.showUnassigned}
                  onChange={(showUnassigned) => calendar.onChange({ ...calendar.view, showUnassigned })}
                />
              </div>
            </PickerRow>
          </>
        ) : null}

    </PmsFilterMenu>
  );
}

function labelOf(options: ReadonlyArray<readonly [string, string]>, value: string): string {
  return options.find(([id]) => id === value)?.[1] ?? "";
}

const ChoiceRow = PmsFilterChoiceRow;

function DateRow({
  label,
  from,
  to,
  active,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  active: boolean;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={ROW}>
        <span className="flex-1 text-left">{label}</span>
        {active ? <span className="text-xs font-normal text-[#8C6D23]">Set</span> : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={cn(SUB, "w-56 overflow-visible p-3")}>
        <div className="grid gap-2" onKeyDown={(event) => event.stopPropagation()}>
          <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
            From
            <Input
              type="date"
              className="h-9"
              value={from}
              aria-label={`${label} from`}
              onChange={(event) => onChange(event.target.value, to)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-[#7A6B58]">
            To
            <Input
              type="date"
              className="h-9"
              value={to}
              aria-label={`${label} to`}
              onChange={(event) => onChange(from, event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </label>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function PickerRow({
  label,
  active,
  detail,
  children,
}: {
  label: string;
  active: boolean;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={ROW}>
        <span className="flex-1 text-left">{label}</span>
        {active && detail ? (
          <span className="max-w-28 truncate text-xs font-normal text-[#8C6D23]">{detail}</span>
        ) : active ? (
          <span className="text-xs font-normal text-[#8C6D23]">Set</span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={cn(SUB, "w-72 overflow-visible p-3")}>
        <div onKeyDown={(event) => event.stopPropagation()}>{children}</div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function DisplayToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      className={ITEM}
      onCheckedChange={(value) => onChange(value === true)}
      onSelect={(event) => event.preventDefault()}
    >
      {label}
    </DropdownMenuCheckboxItem>
  );
}

function calendarDisplayChanged(view: CalendarViewState): boolean {
  const display = view.display;
  const defaults: CalendarDisplayOptions = {
    guestName: true,
    confirmationNumber: true,
    housekeepingStatus: true,
    roomStatus: true,
  };
  return (
    !view.showUnassigned ||
    (Object.keys(defaults) as Array<keyof CalendarDisplayOptions>).some(
      (key) => display[key] !== defaults[key],
    )
  );
}

function GroupChoices({
  restaurantId,
  enabled,
  groupId,
  groupName,
  onChange,
}: {
  restaurantId: string;
  enabled: boolean;
  groupId: string;
  groupName: string;
  onChange: (id: string, name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const loadAccounts = useServerFn(listGuestAccounts);
  const query = useQuery({
    queryKey: ["reservation-desk-groups", restaurantId, search],
    queryFn: () =>
      loadAccounts({
        data: {
          restaurantId,
          accountType: "group",
          status: "active",
          limit: 8,
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
    enabled,
  });

  if (groupId) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{groupName || "Group"}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange("", "")}>
          Clear
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8"
          placeholder="Search groups"
          value={search}
          aria-label="Search groups"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {accountListItems(query.data).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[#F7F4EE]"
              onClick={() => onChange(row.id, row.name)}
            >
              {row.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
