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
        "inline-flex min-h-8 items-center justify-center rounded-[6px] px-2 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide",
        state === "available" && "bg-emerald-500/15 text-emerald-800",
        state === "limited" && "bg-amber-500/15 text-amber-800",
        state === "none" && "bg-muted text-muted-foreground",
      )}
    >
      {state === "none"
        ? ROOM_TYPE_AVAILABILITY_LABELS.none
        : state === "limited"
          ? `${available} Available - ${ROOM_TYPE_AVAILABILITY_LABELS.limited}`
          : `${available} Available`}
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
  statusMessage,
  ratePlanOptions = [],
  selectedPlanId = "",
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
  statusMessage?: string | null;
  ratePlanOptions?: Array<{ id: string; name: string }>;
  selectedPlanId?: string;
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
      className={cn(PMS_OP_PANEL, "!shadow-none min-w-0")}
      data-testid="create-reservation-room-type"
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E7E0D4] px-3 py-3"
        data-testid="availability-header"
      >
        <div className="min-w-0">
          <h2 className="font-display text-base text-[#251605]">Availability & Room Selection</h2>
          {headerSummary ?? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select a room type and rate plan that best fits your guest&apos;s needs.
            </p>
          )}
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
              Modify Search
            </Button>
          ) : null}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show rates in
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
          {/* TODO: wire Rate & Revenue comparison read */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(PMS_OP_BTN_COMPACT, "text-muted-foreground")}
            disabled
          >
            Compare Rates
          </Button>
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
                    const disabled = !isRoomTypeSelectable(row.available);
                    const selectedCard = row.roomTypeId === roomTypeId;
                    const details = catalog?.[row.roomTypeId];
                    const amenityLabels = (details?.amenityLabels ?? []).filter((label) =>
                      label.trim(),
                    );
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
                                {amenityLabels.length > 0 ? (
                                  <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                                    {amenityLabels.join(" · ")}
                                  </span>
                                ) : null}
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
