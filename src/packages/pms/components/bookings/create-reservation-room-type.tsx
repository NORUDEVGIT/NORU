import { type ReactNode } from "react";
import { AlertTriangle, BedDouble, Check } from "lucide-react";

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
  roomTypeAvailabilityCopy,
  roomTypeAvailabilityState,
  roomTypeCapacityDisplay,
  type RoomTypeAvailabilityState,
} from "@/packages/pms/lib/create-reservation-phase1-section4";
import { Button } from "@/shared/components/ui/button";

export type RoomTypeCatalogDetails = {
  description: string | null;
  bedType: string | null;
  roomSize: string | null;
  roomView: string | null;
  coverUrl: string | null;
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
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        state === "available" && "bg-emerald-500/15 text-emerald-800",
        state === "limited" && "bg-amber-500/15 text-amber-800",
        state === "none" && "bg-muted text-muted-foreground",
      )}
    >
      {state === "none"
        ? ROOM_TYPE_AVAILABILITY_LABELS[state]
        : state === "limited"
          ? `${available} Available · ${ROOM_TYPE_AVAILABILITY_LABELS.limited}`
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

function RoomDetailLine({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <span>
      {label} {value}
    </span>
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
}) {
  const selected = availability.find((row) => row.roomTypeId === roomTypeId);
  const occupancyCeiling = selected?.maxOccupancy ?? selectedMaxOccupancy;
  const rows = filterRoomTypeId
    ? availability.filter((row) => row.roomTypeId === filterRoomTypeId)
    : availability;

  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm"
      data-testid="create-reservation-room-type"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E7E0D4] px-4 py-3">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Available Rooms & Rates</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select a room type and rate plan that best fits your guest's needs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show rates in
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-[#251605]"
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
          <Button type="button" variant="outline" size="sm" disabled>
            Compare Rates
          </Button>
        </div>
      </div>
      {/* CREATE_RESERVATION_SECTION4_SCOPE */}

      {!datesValid ? (
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
        <ul className="divide-y divide-[#E7E0D4]">
          {rows.map((row) => {
            const state = roomTypeAvailabilityState(row.available);
            const disabled = !isRoomTypeSelectable(row.available);
            const selectedCard = row.roomTypeId === roomTypeId;
            const details = catalog?.[row.roomTypeId];
            const bedLabel = details?.bedType?.trim() || null;
            const coverUrl = details?.coverUrl ?? row.coverUrl;
            return (
              <li key={row.roomTypeId} className={cn(selectedCard && "bg-[#FAF7EF]")}>
                <div className="grid gap-0 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
                  <div className="border-b border-[#E7E0D4] p-4 lg:border-b-0 lg:border-r">
                    <button
                      type="button"
                      data-testid={`room-type-${row.roomTypeId}`}
                      data-availability={row.available}
                      disabled={disabled}
                      onClick={() => onSelect(row)}
                      className={cn(
                        "w-full text-left",
                        disabled && "cursor-not-allowed opacity-60",
                      )}
                    >
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt=""
                          className="mb-3 h-24 w-full rounded-lg object-cover"
                        />
                      ) : (
                        <div className="mb-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4] text-muted-foreground">
                          <BedDouble className="size-6" />
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-[#251605]">{row.name}</span>
                        <span className="text-xs text-muted-foreground">{row.code}</span>
                        {selectedCard ? <Check className="ml-auto size-4 text-[#C89933]" /> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AvailabilityBadge state={state} available={row.available} />
                        <span className="text-[11px] text-muted-foreground">
                          Total: {row.totalRooms}
                        </span>
                      </div>
                      {details?.description ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {details.description}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {roomTypeCapacityDisplay(row.adultCapacity, row.childCapacity)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {roomTypeAvailabilityCopy(row.available, row.totalRooms)}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {/* TODO: wire remaining Rooms & Inventory details when a field is absent */}
                        <RoomDetailLine label="" value={bedLabel} />
                        <RoomDetailLine label="" value={details?.roomSize} />
                        <RoomDetailLine label="" value={details?.roomView} />
                      </p>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-2 text-xs"
                      disabled
                    >
                      View Room Details
                    </Button>
                  </div>
                  <div className="min-w-0">{renderRates?.(row)}</div>
                </div>
              </li>
            );
          })}
        </ul>
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
