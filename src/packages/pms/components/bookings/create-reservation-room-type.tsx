import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, BedDouble, Check } from "lucide-react";

import { AvailabilityFilterSidebar } from "@/packages/pms/components/bookings/create-reservation-availability-filters";
import { AvailabilityRateFilterProvider } from "@/packages/pms/components/bookings/create-reservation-rate";
import { cn } from "@/shared/lib/utils";
import type { RoomTypeAvailability } from "@/packages/pms/lib/reservations.functions";
import {
  CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES,
  CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY,
  CREATE_RESERVATION_CHECKING_AVAILABILITY,
  CREATE_RESERVATION_EMPTY_CATALOGUE,
  CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE,
  ROOM_TYPE_AVAILABILITY_LABELS,
  isRoomTypeSelectable,
  occupancySoftWarn,
  roomTypeAvailabilityState,
  type RoomTypeAvailabilityState,
} from "@/packages/pms/lib/create-reservation-phase1-section4";
import { PMS_OP_BTN_COMPACT, PMS_OP_PANEL } from "@/packages/pms/lib/pms-operational-surface";
import { Button } from "@/shared/components/ui/button";

export type RoomTypeCatalogDetails = {
  description: string | null;
  bedType: string | null;
  roomSize: string | null;
  roomView: string | null;
  coverUrl: string | null;
  amenityLabels?: string[];
};

function availabilityBadgeLabel(state: RoomTypeAvailabilityState, available: number): string {
  if (state === "none") return ROOM_TYPE_AVAILABILITY_LABELS.none;
  if (available === 1) return "1 room left";
  return `${available} rooms available`;
}

function AvailabilityBadge({
  state,
  available,
}: {
  state: RoomTypeAvailabilityState;
  available: number;
}) {
  return (
    <span
      data-testid={`availability-state-${state}`}
      data-availability-state={state}
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-[6px] px-2.5 py-1 text-center text-xs font-semibold leading-tight",
        state === "available" && "bg-[#E5F2E4] text-[#2F6B3A]",
        state === "limited" && "bg-[#F8E8C8] text-[#8A641A]",
        state === "none" && "bg-[#F3EDE3] text-[#6B5E4E]",
      )}
    >
      {availabilityBadgeLabel(state, available)}
    </span>
  );
}

export function roomDisplayLabels(details: RoomTypeCatalogDetails | null | undefined): string[] {
  if (!details) return [];
  const amenityLabels = (details.amenityLabels ?? []).filter((label) => label.trim());
  const attributes = [details.bedType, details.roomView, details.roomSize].filter(
    (label): label is string => Boolean(label?.trim()),
  );
  return [...amenityLabels, ...attributes].filter(
    (label, index, all) => all.indexOf(label) === index,
  );
}

export function AmenityStrip({ labels, title }: { labels: string[]; title?: string }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, 4);
  const extra = labels.length - shown.length;
  return (
    <span
      className="mt-1.5 flex flex-wrap gap-1"
      data-testid="room-amenity-strip"
      title={title || labels.join(" · ")}
    >
      {shown.map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center truncate rounded-full bg-[#F7F4EE] px-1.5 py-0.5 text-[10px] text-[#6B5E4E]"
        >
          {label}
        </span>
      ))}
      {extra > 0 ? (
        <span className="inline-flex items-center rounded-full bg-[#F7F4EE] px-1.5 py-0.5 text-[10px] font-medium text-[#6B5E4E]">
          +{extra} more
        </span>
      ) : null}
    </span>
  );
}

export function OccupancySoftWarn({
  adults,
  childCount,
  maxOccupancy,
  testId = "occupancy-warn",
}: {
  adults: number;
  childCount: number;
  maxOccupancy: number | undefined;
  testId?: string;
}) {
  const message = occupancySoftWarn(adults, childCount, maxOccupancy);
  if (!message) return null;
  return (
    <div
      data-testid={testId}
      className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {CREATE_RESERVATION_OCCUPANCY_WARN_CONTINUE}
        </p>
      </div>
    </div>
  );
}

export function OverbookingDecision({
  role,
  roomName,
  requestedRooms,
  physicalAvailable,
  shortage,
  allowance,
  consumed,
  remaining,
  showControls = true,
  approvalRequired = true,
  reasonRequired = true,
  reason,
  armed,
  onReason,
  onArm,
}: {
  role: string;
  roomName: string;
  requestedRooms: number;
  physicalAvailable: number | null;
  shortage: number;
  allowance: number | null;
  consumed: number | null;
  remaining: number | null;
  showControls?: boolean;
  approvalRequired?: boolean;
  reasonRequired?: boolean;
  reason: string;
  armed: boolean;
  onReason: (value: string) => void;
  onArm: (value: boolean) => void;
}) {
  if (shortage <= 0 || physicalAvailable == null) return null;
  const canAuthorize = !approvalRequired || role === "owner" || role === "manager";
  return (
    <section
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-[#251605]"
      data-testid="overbooking-decision"
    >
      <p className="font-medium">Overbooking</p>
      <p>Room type: {roomName}</p>
      <p>Requested rooms: {requestedRooms}</p>
      <p>Physical available: {physicalAvailable}</p>
      <p>This reservation exceeds physical inventory.</p>
      <p>Overbooking required: {shortage}</p>
      {canAuthorize ? (
        <div className="mt-2 space-y-2">
          <p>Overbooking allowance: {allowance == null ? "—" : allowance}</p>
          <p>Already overbooked: {consumed == null ? "—" : consumed}</p>
          <p>Remaining: {remaining == null ? "—" : remaining}</p>
          {showControls ? (
            <>
              <button
                type="button"
                className="rounded-md border border-[#C89933] bg-white px-3 py-1 text-xs"
                onClick={() => onArm(!armed)}
              >
                {armed ? "Cancel" : `Overbook ${roomName}`}
              </button>
              {armed ? (
                <label className="block text-xs">
                  Reason{reasonRequired ? " *" : ""}
                  <textarea
                    className="mt-1 w-full rounded-md border border-[#E5DED4] bg-white p-2"
                    value={reason}
                    onChange={(event) => onReason(event.target.value)}
                    required={reasonRequired}
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-2">
          {roomName} has no physical availability. Owner or Manager authorization is required to
          overbook while Manager Approval Required is on.
        </p>
      )}
    </section>
  );
}

export function CreateReservationRoomType({
  datesValid,
  loading,
  availability,
  roomTypeId,
  adults,
  childCount,
  selectedMaxOccupancy,
  catalog,
  filterRoomTypeId,
  currencyCode,
  currencyName,
  currencyOptions,
  onCurrencyChange,
  onSelect,
  renderRates,
  headerSummary,
  onModifySearch,
  modifySearchLabel,
  activeRoomLabel,
  statusMessage,
  ratePlanOptions = [],
  selectedPlanId = "",
  allowExhaustedSelection = false,
}: {
  datesValid: boolean;
  loading: boolean;
  availability: RoomTypeAvailability[];
  roomTypeId: string;
  adults: number;
  childCount: number;
  selectedMaxOccupancy: number | undefined;
  catalog?: Record<string, RoomTypeCatalogDetails>;
  filterRoomTypeId?: string;
  currencyCode?: string;
  currencyName?: string;
  currencyOptions?: Array<{ code: string; name: string }>;
  onCurrencyChange?: (code: string) => void;
  onSelect: (type: RoomTypeAvailability) => void;
  renderRates?: (type: RoomTypeAvailability) => ReactNode;
  headerSummary?: ReactNode;
  onModifySearch?: () => void;
  modifySearchLabel?: string;
  activeRoomLabel?: string | null;
  statusMessage?: string | null;
  ratePlanOptions?: Array<{ id: string; name: string }>;
  selectedPlanId?: string;
  allowExhaustedSelection?: boolean;
}) {
  const selected = availability.find((row) => row.roomTypeId === roomTypeId);
  const occupancyCeiling = selected?.maxOccupancy ?? selectedMaxOccupancy;
  const rows = filterRoomTypeId
    ? availability.filter((row) => row.roomTypeId === filterRoomTypeId)
    : availability;
  const [excludedRoomTypeIds, setExcludedRoomTypeIds] = useState<string[]>([]);
  const [excludedRatePlanIds, setExcludedRatePlanIds] = useState<string[]>([]);
  const [excludedAmenityLabels, setExcludedAmenityLabels] = useState<string[]>([]);
  const availabilityKey = rows.map((row) => row.roomTypeId).join("\n");
  useEffect(() => {
    setExcludedRoomTypeIds([]);
    setExcludedRatePlanIds([]);
    setExcludedAmenityLabels([]);
  }, [availabilityKey]);
  const amenityOptions = [
    ...new Set(
      rows
        .flatMap((row) => catalog?.[row.roomTypeId]?.amenityLabels ?? [])
        .filter((label) => label.trim()),
    ),
  ];
  const visibleRows = rows.filter((row) => {
    if (excludedRoomTypeIds.includes(row.roomTypeId)) return false;
    if (excludedAmenityLabels.length === 0) return true;
    const labels = catalog?.[row.roomTypeId]?.amenityLabels ?? [];
    return excludedAmenityLabels.every((label) => !labels.includes(label));
  });
  const selectionHiddenByFilters =
    (!!roomTypeId && excludedRoomTypeIds.includes(roomTypeId)) ||
    (!!selectedPlanId && excludedRatePlanIds.includes(selectedPlanId)) ||
    (!!roomTypeId &&
      excludedAmenityLabels.some((label) =>
        (catalog?.[roomTypeId]?.amenityLabels ?? []).includes(label),
      ));

  function toggleId(current: string[], id: string, setCurrent: (next: string[]) => void) {
    setCurrent(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <section
      id="create-reservation-availability"
      className={cn(PMS_OP_PANEL, "!rounded-[6px] !border-[#CCCCCC] !shadow-none min-w-0")}
      data-testid="create-reservation-room-type"
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E7E0D4] px-4 py-3"
        data-testid="availability-header"
      >
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#FBF6EE] text-[#C89933]">
            <BedDouble className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#251605]">
              Availability & Room Selection
              {activeRoomLabel ? (
                <>
                  {" — "}
                  <span className="text-[#C89933]">{activeRoomLabel}</span>
                </>
              ) : null}
            </h2>
            {headerSummary ?? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Select a room type and rate plan that best fits your guest&apos;s needs.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
          {onModifySearch ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={PMS_OP_BTN_COMPACT}
              data-testid="modify-stay-search"
              onClick={onModifySearch}
            >
              {modifySearchLabel ?? "Modify Search"}
            </Button>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-[#6B5E4E]">
            Display rates in
            <select
              className="h-8 !rounded-[6px] border border-[#CCCCCC] bg-white px-2 text-sm text-[#251605]"
              value={currencyCode ?? ""}
              disabled={!onCurrencyChange}
              aria-label="Show rates in currency"
              onChange={(event) => onCurrencyChange?.(event.target.value)}
            >
              {/* TODO: wire full currency list from Settings > Property Currency */}
              {/* TODO: wire currency conversion / pricing quote */}
              {(currencyOptions && currencyOptions.length > 0
                ? currencyOptions
                : currencyCode
                  ? [{ code: currencyCode, name: currencyName ?? currencyCode }]
                  : [{ code: "", name: "Property currency" }]
              ).map((option) => (
                <option key={option.code || "base"} value={option.code}>
                  {option.name ? `${option.code} — ${option.name}` : option.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {/* CREATE_RESERVATION_SECTION4_SCOPE */}

      {statusMessage ? (
        <p className="px-4 py-6 text-sm text-muted-foreground" data-testid="availability-status">
          {statusMessage}
        </p>
      ) : !datesValid ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {CREATE_RESERVATION_AVAILABILITY_NEEDS_DATES}
        </p>
      ) : loading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {CREATE_RESERVATION_CHECKING_AVAILABILITY}
        </p>
      ) : availability.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {CREATE_RESERVATION_EMPTY_CATALOGUE}
        </p>
      ) : (
        <AvailabilityRateFilterProvider excludedRatePlanIds={excludedRatePlanIds}>
          <div className="xl:grid xl:grid-cols-[210px_minmax(0,1fr)]">
            <AvailabilityFilterSidebar
              roomTypes={rows.map((row) => ({
                id: row.roomTypeId,
                name: row.name,
                count: row.available,
              }))}
              ratePlans={ratePlanOptions}
              amenities={amenityOptions}
              excludedRoomTypeIds={excludedRoomTypeIds}
              excludedRatePlanIds={excludedRatePlanIds}
              excludedAmenityLabels={excludedAmenityLabels}
              onToggleRoomType={(id) => toggleId(excludedRoomTypeIds, id, setExcludedRoomTypeIds)}
              onToggleRatePlan={(id) => toggleId(excludedRatePlanIds, id, setExcludedRatePlanIds)}
              onToggleAmenity={(label) =>
                toggleId(excludedAmenityLabels, label, setExcludedAmenityLabels)
              }
              onClear={() => {
                setExcludedRoomTypeIds([]);
                setExcludedRatePlanIds([]);
                setExcludedAmenityLabels([]);
              }}
            />
            <div className="min-w-0" data-testid="availability-results">
              {selectionHiddenByFilters ? (
                <p
                  className="border-b border-[#E7E0D4] bg-[#FAF8F4] px-3 py-2 text-xs text-[#251605]"
                  data-testid="availability-selection-hidden-by-filters"
                >
                  Current selected room/rate is hidden by filters.
                </p>
              ) : null}
              {visibleRows.length === 0 ? (
                <p
                  className="px-4 py-6 text-sm text-muted-foreground"
                  data-testid="availability-filter-empty"
                >
                  No rooms match the selected filters.
                </p>
              ) : (
                <ul className="divide-y divide-[#E7E0D4]">
                  {visibleRows.map((row) => {
                    const state = roomTypeAvailabilityState(row.available);
                    const disabled =
                      !isRoomTypeSelectable(row.available) &&
                      !(allowExhaustedSelection && row.available <= 0);
                    const selectedCard = row.roomTypeId === roomTypeId;
                    const details = catalog?.[row.roomTypeId];
                    const amenityLabels = (details?.amenityLabels ?? []).filter((label) =>
                      label.trim(),
                    );
                    const stripLabels = roomDisplayLabels(details);
                    const coverUrl = details?.coverUrl ?? row.coverUrl;
                    return (
                      <li
                        key={row.roomTypeId}
                        className={cn(selectedCard && "bg-[#FAF7EF]")}
                        data-testid="availability-room-block"
                      >
                        <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(13.5rem,17rem)_minmax(8.75rem,11rem)_minmax(0,1fr)]">
                          <div className="min-w-0 border-b border-[#E7E0D4] p-3 lg:border-b-0 lg:border-r">
                            <button
                              type="button"
                              data-testid={`room-type-${row.roomTypeId}`}
                              data-availability={row.available}
                              disabled={disabled}
                              onClick={() => onSelect(row)}
                              className={cn(
                                "flex w-full min-w-0 gap-3 text-left",
                                disabled && "cursor-not-allowed opacity-60",
                              )}
                            >
                              {coverUrl ? (
                                <img
                                  src={coverUrl}
                                  alt=""
                                  className="h-14 w-20 shrink-0 rounded-[6px] object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-[6px] border border-dashed border-[#DDD4C5] bg-[#FAF8F4] text-muted-foreground">
                                  <BedDouble className="size-5" />
                                </div>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate font-medium text-[#251605]">
                                    {row.name}
                                  </span>
                                  {selectedCard ? (
                                    <Check className="size-4 shrink-0 text-[#C89933]" />
                                  ) : null}
                                </span>
                                {details?.description ? (
                                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                                    {details.description}
                                  </span>
                                ) : null}
                                <AmenityStrip
                                  labels={stripLabels}
                                  title={amenityLabels.join(" · ")}
                                />
                              </span>
                            </button>
                          </div>
                          <div className="flex items-center justify-center border-b border-[#E7E0D4] px-2 py-2 lg:border-b-0 lg:border-r">
                            <AvailabilityBadge state={state} available={row.available} />
                          </div>
                          <div className="min-w-0">{renderRates?.(row)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </AvailabilityRateFilterProvider>
      )}

      {roomTypeId ? (
        <div className="space-y-2 border-t border-[#E7E0D4] px-4 py-3">
          <OccupancySoftWarn
            adults={adults}
            childCount={childCount}
            maxOccupancy={occupancyCeiling}
          />
          <p className="text-xs text-muted-foreground">
            {CREATE_RESERVATION_CAPACITY_DISPLAY_ONLY}
          </p>
        </div>
      ) : null}
    </section>
  );
}
