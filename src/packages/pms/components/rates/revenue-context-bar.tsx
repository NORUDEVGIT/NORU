import { useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import { addUtcDays } from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueContext,
  RevenueContextField,
} from "@/packages/pms/lib/revenue/revenue-context";
import type {
  RevenueBookingSource,
  RevenueMarketSegment,
  RevenueRatePlan,
  RevenueRoomType,
  RevenueSalesChannel,
} from "@/packages/pms/lib/revenue/revenue-config.types";
import { REVENUE_CONFIG_LOAD_ERROR } from "@/packages/pms/lib/revenue/revenue-read-error";

const ALL = "all";

function SetupLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className="font-semibold text-primary underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  empty,
  emptyHref,
  options,
  status = "success",
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  empty: string;
  emptyHref: string;
  options: Array<{ id: string; label: string }>;
  status?: "loading" | "error" | "success";
}) {
  if (status === "loading") {
    return (
      <label className="grid min-w-44 flex-1 gap-1.5 text-xs font-semibold text-[#5A4833]">
        {label}
        <p className="flex h-10 w-full items-center text-sm text-muted-foreground">Loading…</p>
      </label>
    );
  }
  if (status === "error") {
    return null;
  }
  return (
    <label className="grid min-w-44 flex-1 gap-1.5 text-xs font-semibold text-[#5A4833]">
      {label}
      {options.length === 0 ? (
        <p className="flex h-10 items-center text-xs font-normal text-muted-foreground">
          {empty} Configure in <SetupLink href={emptyHref}>Property Setup</SetupLink>.
        </p>
      ) : (
        <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
          <SelectTrigger className="h-10 w-full text-sm font-medium text-[#251605]">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-sm">
              {placeholder}
            </SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id} className="text-sm">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </label>
  );
}

export function RevenueContextBar({
  fields,
  context,
  onChange,
  roomTypes,
  ratePlans,
  marketSegments,
  bookingSources,
  salesChannels,
  cataloguesError,
  coreConfigStatus = "success",
  cataloguesStatus = "success",
}: {
  fields: readonly RevenueContextField[];
  context: RevenueContext;
  onChange: (patch: Partial<RevenueContext>) => void;
  roomTypes: RevenueRoomType[];
  ratePlans: RevenueRatePlan[];
  marketSegments: RevenueMarketSegment[];
  bookingSources: RevenueBookingSource[];
  salesChannels: RevenueSalesChannel[];
  cataloguesError?: string | null;
  coreConfigStatus?: "loading" | "error" | "success";
  cataloguesStatus?: "loading" | "error" | "success";
}) {
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  if (fields.length === 0) return null;

  const visiblePlans = context.roomTypeId
    ? ratePlans.filter((plan) => plan.roomTypeId === context.roomTypeId)
    : ratePlans;

  const activeChips: Array<{ id: string; label: string; onRemove: () => void }> = [];

  if (context.roomTypeId) {
    const rt = roomTypes.find((r) => r.id === context.roomTypeId);
    activeChips.push({
      id: "roomType",
      label: `Room Type: ${rt?.name ?? context.roomTypeId}`,
      onRemove: () => onChange({ roomTypeId: null }),
    });
  }
  if (context.ratePlanId) {
    const rp = ratePlans.find((r) => r.id === context.ratePlanId);
    activeChips.push({
      id: "ratePlan",
      label: `Rate Plan: ${rp ? `${rp.code} — ${rp.name}` : context.ratePlanId}`,
      onRemove: () => onChange({ ratePlanId: null }),
    });
  }
  if (context.marketSegmentId) {
    const ms = marketSegments.find((r) => r.id === context.marketSegmentId);
    activeChips.push({
      id: "segment",
      label: `Segment: ${ms?.name ?? context.marketSegmentId}`,
      onRemove: () => onChange({ marketSegmentId: null }),
    });
  }
  if (context.commercialSourceId) {
    const bs = bookingSources.find((r) => r.id === context.commercialSourceId);
    activeChips.push({
      id: "source",
      label: `Source: ${bs?.name ?? context.commercialSourceId}`,
      onRemove: () => onChange({ commercialSourceId: null }),
    });
  }
  if (context.salesChannelId) {
    const sc = salesChannels.find((r) => r.id === context.salesChannelId);
    activeChips.push({
      id: "channel",
      label: `Channel: ${sc?.name ?? context.salesChannelId}`,
      onRemove: () => onChange({ salesChannelId: null }),
    });
  }

  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3.5">
        {fields.includes("dateRange") ? (
          <>
            <label
              htmlFor="revenue-from"
              className="grid gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              From
              <Input
                id="revenue-from"
                type="date"
                value={context.fromDate}
                onChange={(event) => onChange({ fromDate: event.target.value })}
                className="h-10 w-44 text-sm font-medium text-[#251605]"
              />
            </label>
            <label
              htmlFor="revenue-to"
              className="grid gap-1.5 text-xs font-semibold text-[#5A4833]"
            >
              To
              <Input
                id="revenue-to"
                type="date"
                value={context.toDate}
                onChange={(event) => onChange({ toDate: event.target.value })}
                className="h-10 w-44 text-sm font-medium text-[#251605]"
              />
            </label>
          </>
        ) : null}

        {fields.includes("roomType") ? (
          <FilterSelect
            label="Room type"
            value={context.roomTypeId}
            onChange={(roomTypeId) => onChange({ roomTypeId })}
            placeholder="All room types"
            empty="No room types are configured for this property."
            emptyHref={CARD3_HREF}
            status={coreConfigStatus}
            options={roomTypes.map((row) => ({
              id: row.id,
              label: row.active ? row.name : `${row.name} (inactive)`,
            }))}
          />
        ) : null}

        {fields.includes("ratePlan") ? (
          <FilterSelect
            label="Rate plan"
            value={context.ratePlanId}
            onChange={(ratePlanId) => onChange({ ratePlanId })}
            placeholder="All rate plans"
            empty="No rate plans are configured for this property."
            emptyHref={CARD3_HREF}
            status={coreConfigStatus}
            options={visiblePlans.map((row) => ({
              id: row.id,
              label: row.active
                ? `${row.code} — ${row.name}`
                : `${row.code} — ${row.name} (inactive)`,
            }))}
          />
        ) : null}

        {fields.includes("segment") ? (
          <FilterSelect
            label="Market segment"
            value={context.marketSegmentId}
            onChange={(marketSegmentId) => onChange({ marketSegmentId })}
            placeholder="All segments"
            empty="No market segments are configured."
            emptyHref={`${SET1_HUB_HREF}#sales-events`}
            status={cataloguesStatus}
            options={marketSegments.map((row) => ({
              id: row.id,
              label: row.active ? row.name : `${row.name} (inactive)`,
            }))}
          />
        ) : null}

        {fields.includes("source") ? (
          <FilterSelect
            label="Commercial source"
            value={context.commercialSourceId}
            onChange={(commercialSourceId) => onChange({ commercialSourceId })}
            placeholder="All sources"
            empty="No booking sources are configured."
            emptyHref={`${SET1_HUB_HREF}#sales-events`}
            status={cataloguesStatus}
            options={bookingSources.map((row) => ({
              id: row.id,
              label: row.active ? row.name : `${row.name} (inactive)`,
            }))}
          />
        ) : null}

        {fields.includes("channel") ? (
          <FilterSelect
            label="Sales channel"
            value={context.salesChannelId}
            onChange={(salesChannelId) => onChange({ salesChannelId })}
            placeholder="All channels"
            empty="No sales channels are configured."
            emptyHref={`${SET1_HUB_HREF}#distribution`}
            status={cataloguesStatus}
            options={salesChannels.map((row) => ({
              id: row.id,
              label: row.active ? row.name : `${row.name} (inactive)`,
            }))}
          />
        ) : null}

        <div className="ml-auto flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 px-3 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
            onClick={() =>
              onChange({
                roomTypeId: null,
                ratePlanId: null,
                marketSegmentId: null,
                commercialSourceId: null,
                salesChannelId: null,
              })
            }
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-10 bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933]"
            onClick={() => setFiltersExpanded((current) => !current)}
          >
            <Filter className="mr-1.5 size-3.5" />
            Filter
            {activeChips.length > 0 ? ` (${activeChips.length})` : ""}
          </Button>
        </div>

        {coreConfigStatus === "error" ? (
          <p className="w-full text-sm text-destructive">{REVENUE_CONFIG_LOAD_ERROR}</p>
        ) : null}
        {cataloguesError ? (
          <p className="w-full text-sm text-destructive">{cataloguesError}</p>
        ) : null}
      </div>

      {filtersExpanded && fields.includes("dateRange") ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EFE9DF] pt-2.5 text-xs text-[#5A4833]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[#251605]">Quick Window:</span>
            {[
              { label: "7 Days", days: 6 },
              { label: "14 Days", days: 13 },
              { label: "30 Days", days: 29 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onChange({
                    fromDate: context.fromDate,
                    toDate: addUtcDays(context.fromDate, preset.days),
                  })
                }
                className="inline-flex h-7 items-center rounded-md border border-[#DED7CD] bg-[#FAF6F0] px-2.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#EFE7DA]"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#756A5B]">
            Showing {context.fromDate} – {context.toDate}
          </span>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {activeChips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                onClick={chip.onRemove}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#DDD4C5] bg-[#F7F4EE] px-3 py-1 text-xs font-medium text-[#251605]"
              >
                {chip.label}
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
