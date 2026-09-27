import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { SET1_HUB_HREF } from "@/packages/pms/lib/pms-set1-foundation";
import type { RevenueContext, RevenueContextField } from "@/packages/pms/lib/revenue/revenue-context";
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
    <a href={href} className="font-medium text-primary underline-offset-2 hover:underline">
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
      <div className="min-w-44">
        <Label>{label}</Label>
        <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (status === "error") {
    return null;
  }
  return (
    <div className="min-w-44">
      <Label>{label}</Label>
      {options.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {empty} Configure in <SetupLink href={emptyHref}>Property Setup</SetupLink>.
        </p>
      ) : (
        <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{placeholder}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
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
  if (fields.length === 0) return null;

  const visiblePlans = context.roomTypeId
    ? ratePlans.filter((plan) => plan.roomTypeId === context.roomTypeId)
    : ratePlans;

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-border/60 px-5 py-3 sm:px-6">
      {fields.includes("dateRange") ? (
        <>
          <div>
            <Label htmlFor="revenue-from">From</Label>
            <Input
              id="revenue-from"
              type="date"
              value={context.fromDate}
              onChange={(event) => onChange({ fromDate: event.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="revenue-to">To</Label>
            <Input
              id="revenue-to"
              type="date"
              value={context.toDate}
              onChange={(event) => onChange({ toDate: event.target.value })}
            />
          </div>
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
            label: row.active ? `${row.code} — ${row.name}` : `${row.code} — ${row.name} (inactive)`,
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

      {coreConfigStatus === "error" ? (
        <p className="w-full text-xs text-destructive">{REVENUE_CONFIG_LOAD_ERROR}</p>
      ) : null}
      {cataloguesError ? (
        <p className="w-full text-xs text-destructive">{cataloguesError}</p>
      ) : null}
    </div>
  );
}
