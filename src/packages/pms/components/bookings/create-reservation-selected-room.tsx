import { BedDouble } from "lucide-react";

import type { RoomTypeCatalogDetails } from "@/packages/pms/components/bookings/create-reservation-room-type";
import type { SelectedRoomTypeMeta } from "@/packages/pms/lib/create-reservation-phase1-section4";
import {
  rateCopyFromQuote,
  type CreateRateQuoteRow,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { PMS_OP_BTN_COMPACT, PMS_OP_PANEL } from "@/packages/pms/lib/pms-operational-surface";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const CANCELLATION_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const CANCELLATION_FEE_FALLBACK = "Cancellation fee may apply";
const NO_INCLUSIONS_FALLBACK = "No inclusions listed";

function cancellationUntilDate(
  day: number,
  month: number,
  hours: number,
  minutes: number,
  arrivalDate: string | null,
): Date | null {
  const years = new Set<number>([new Date().getFullYear(), new Date().getFullYear() + 1]);
  if (arrivalDate && /^\d{4}-\d{2}-\d{2}$/.test(arrivalDate)) {
    const year = Number(arrivalDate.slice(0, 4));
    years.add(year);
    years.add(year - 1);
  }
  const arrivalEnd = arrivalDate ? new Date(`${arrivalDate}T23:59:59`) : null;
  const candidates: Date[] = [];
  for (const year of years) {
    const date = new Date(year, month, day, hours, minutes, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
      continue;
    }
    if (arrivalEnd && date.getTime() > arrivalEnd.getTime()) continue;
    candidates.push(date);
  }
  candidates.sort((left, right) => right.getTime() - left.getTime());
  return candidates[0] ?? null;
}

function displayCancellation(label: string, arrivalDate: string | null): string {
  const trimmed = label.trim();
  const match = trimmed.match(
    /^Free cancellation until (\d{1,2}) ([A-Za-z]{3,4}) (\d{2}):(\d{2})$/,
  );
  if (!match) return trimmed || "—";
  const month = CANCELLATION_MONTHS[match[2]!.toLowerCase()];
  if (month == null) return CANCELLATION_FEE_FALLBACK;
  const until = cancellationUntilDate(
    Number(match[1]),
    month,
    Number(match[3]),
    Number(match[4]),
    arrivalDate,
  );
  if (!until || until.getTime() <= Date.now()) return CANCELLATION_FEE_FALLBACK;
  return trimmed;
}

function includedItemsLabel(quote: CreateRateQuoteRow | null): string {
  if (!quote) return NO_INCLUSIONS_FALLBACK;
  const items: string[] = [];
  const breakfast = quote.breakfastLabel?.trim();
  if (breakfast && breakfast !== "—" && breakfast !== "Not included") {
    items.push(breakfast === "Included" ? "Breakfast included" : breakfast);
  } else if (quote.plan.breakfastIncluded) {
    items.push("Breakfast included");
  }
  const meal = quote.plan.mealPlanName?.trim();
  if (
    meal &&
    meal !== "Included" &&
    !items.some((item) => item.toLowerCase() === meal.toLowerCase())
  ) {
    items.push(meal);
  }
  const services = quote.includedServicesLabel?.trim();
  if (services && services !== "—" && services !== "Included") {
    for (const part of services.split("·")) {
      const label = part.trim();
      if (!label || label === "Included" || label === "—") continue;
      if (!items.some((item) => item.toLowerCase() === label.toLowerCase())) items.push(label);
    }
  }
  return items.length > 0 ? items.join(" · ") : NO_INCLUSIONS_FALLBACK;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-[#251605]">{value}</dd>
    </div>
  );
}

export function CreateReservationSelectedRoom({
  selectedRoomType,
  available,
  coverUrl,
  catalog,
  selectedQuote,
  nights,
  money,
  onChange,
  statusMessage,
}: {
  selectedRoomType: SelectedRoomTypeMeta | null;
  available: number | null;
  coverUrl: string | null;
  catalog: RoomTypeCatalogDetails | null;
  selectedQuote: CreateRateQuoteRow | null;
  nights: number;
  money: (value: number) => string;
  onChange: () => void;
  statusMessage?: string | null;
}) {
  const rateCopy = rateCopyFromQuote(selectedQuote, money);
  const searchIsCurrent = !statusMessage;
  const hasSelection = searchIsCurrent && (selectedRoomType != null || selectedQuote != null);
  const meta = [catalog?.bedType, catalog?.roomSize, catalog?.roomView].filter((value) =>
    value?.trim(),
  );

  return (
    <section
      className={cn(PMS_OP_PANEL, "!shadow-none min-w-0 p-3 xl:sticky xl:top-0")}
      data-testid="selected-room-rate"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Selected Room & Rate</h2>
        {hasSelection ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={PMS_OP_BTN_COMPACT}
            data-testid="change-selected-room"
            onClick={onChange}
          >
            Change
          </Button>
        ) : null}
      </div>
      {statusMessage ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="selected-room-rate-status">
          {statusMessage}
        </p>
      ) : !hasSelection ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="selected-room-rate-empty">
          Select a room and rate from availability
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="aspect-video max-h-28 w-full rounded-[6px] object-cover"
            />
          ) : (
            <div className="flex aspect-video max-h-28 w-full items-center justify-center rounded-[6px] border border-dashed border-[#DDD4C5] bg-[#FAF8F4] text-muted-foreground">
              <BedDouble className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-[#251605]">
              {selectedRoomType?.name ?? "Room"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[selectedRoomType?.code, ...meta].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <dl className="grid grid-cols-1 gap-1">
            <SummaryLine label="Rate plan" value={rateCopy.ratePlanLabel} />
            <SummaryLine label="Rate / night" value={rateCopy.ratePerNight} />
            <SummaryLine label="Nights" value={String(nights)} />
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Stay total
              </dt>
              <dd
                className="text-sm font-medium text-[#251605]"
                data-testid="selected-room-stay-total"
              >
                {rateCopy.totalAmount}
              </dd>
            </div>
            <SummaryLine label="Included" value={includedItemsLabel(selectedQuote)} />
            <SummaryLine
              label="Cancellation"
              value={displayCancellation(
                rateCopy.cancellationPolicy,
                selectedQuote?.quote?.nightly[0]?.date ?? null,
              )}
            />
            {selectedQuote?.refundabilityLabel && selectedQuote.refundabilityLabel !== "—" ? (
              <SummaryLine label="Refundability" value={selectedQuote.refundabilityLabel} />
            ) : null}
            <SummaryLine
              label="Available"
              value={available == null ? "—" : `${available} ${available === 1 ? "room" : "rooms"}`}
            />
          </dl>
        </div>
      )}
    </section>
  );
}
