import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { CalendarDays, MoreHorizontal, Search, Settings, SlidersHorizontal } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  StatCard,
  formatStayDate,
  addDays,
} from "@/packages/pms/components/bookings/reservation-bits";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  getRevenueOverview,
  listRateCalendar,
  listRatePlans,
  listRateRestrictions,
  saveRateOverride,
  saveRateRestriction,
} from "@/packages/pms/lib/rates.functions";
import { CARD3_HREF } from "@/packages/pms/lib/pms-property-setup-card3";
import { useMoney } from "@/core/state/property-format";

function PropertySetupRatesLink({ className }: { className?: string }) {
  return (
    <a
      href={CARD3_HREF}
      className={className ?? "font-medium text-primary underline-offset-2 hover:underline"}
    >
      Property Setup
    </a>
  );
}

const ALL = "all";

/* --------------------------------------------------------------- overview */

export function RevenueOverviewTab({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const money = useMoney();
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);

  const fetchOverview = useServerFn(getRevenueOverview);
  const query = useQuery({
    queryKey: ["revenue-overview", restaurantId, from, to],
    queryFn: () => fetchOverview({ data: { restaurantId, from, to } }),
    retry: false,
  });

  const data = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="rev-from">From</Label>
          <Input id="rev-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rev-to">To</Label>
          <Input id="rev-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Property-local dates. Room revenue comes from reservation pricing snapshots for confirmed,
          in-house and checked-out stays; pending, cancelled and no-show stays are excluded.
        </p>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading revenue…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Occupancy"
              value={`${data.occupancyPercent}%`}
              hint="Sold ÷ available room nights"
            />
            <StatCard
              label="ADR"
              value={money(data.adr)}
              hint="Booked room revenue ÷ sold room nights"
            />
            <StatCard
              label="RevPAR"
              value={money(data.revPar)}
              hint="Booked room revenue ÷ available room nights"
            />
            <StatCard
              label="Booked room revenue"
              value={money(data.roomRevenue)}
              hint="Based on reservation pricing snapshots."
            />
            <StatCard label="Sold room nights" value={data.soldRoomNights} />
            <StatCard label="Available room nights" value={data.availableRoomNights} />
          </div>
          {data.pricedShare < 100 ? (
            <p className="text-xs text-muted-foreground">
              {data.pricedShare}% of sold room nights carry a pricing snapshot — unpriced legacy
              reservations contribute occupancy but no revenue.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- rate plans */

export function RatePlansTab({
  restaurantId,
  roomTypeId,
  onRoomTypeChange,
  onOpenCalendar,
}: {
  restaurantId: string;
  roomTypeId?: string | null;
  onRoomTypeChange?: (roomTypeId: string | null) => void;
  onOpenCalendar?: (ratePlanId: string, roomTypeId: string) => void;
}) {
  const money = useMoney();
  const [localRoomType, setLocalRoomType] = useState<string>(ALL);
  const usingSharedRoomType = roomTypeId !== undefined;
  const roomTypeFilter = usingSharedRoomType ? roomTypeId || ALL : localRoomType;
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);

  const fetchPlans = useServerFn(listRatePlans);
  const fetchTypes = useServerFn(listRoomTypes);

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, roomTypeFilter],
    queryFn: () =>
      fetchPlans({
        data: {
          restaurantId,
          ...(roomTypeFilter !== ALL ? { roomTypeId: roomTypeFilter } : {}),
        },
      }),
    retry: false,
  });
  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });

  const allPlans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const activeCount = useMemo(() => allPlans.filter((plan) => plan.active).length, [allPlans]);
  const inactiveCount = allPlans.length - activeCount;
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          allPlans
            .map((plan) => plan.categoryName?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort(),
    [allPlans],
  );

  const filteredPlans = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return allPlans.filter((plan) => {
      if (statusFilter === "active" && !plan.active) return false;
      if (statusFilter === "inactive" && plan.active) return false;
      if (categoryFilter !== ALL && (plan.categoryName?.trim() || "") !== categoryFilter) {
        return false;
      }
      if (!queryText) return true;
      const haystack =
        `${plan.code} ${plan.name} ${plan.categoryName ?? ""} ${plan.roomTypeName ?? ""}`.toLowerCase();
      return haystack.includes(queryText);
    });
  }, [allPlans, statusFilter, categoryFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [roomTypeFilter, statusFilter, categoryFilter, search, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredPlans.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIdx = (safePage - 1) * pageSize;
  const visiblePlans = filteredPlans.slice(startIdx, startIdx + pageSize);
  const showingFrom = filteredPlans.length === 0 ? 0 : startIdx + 1;
  const showingTo = Math.min(filteredPlans.length, startIdx + visiblePlans.length);

  function handleRoomTypeChange(next: string) {
    if (usingSharedRoomType && onRoomTypeChange) {
      onRoomTypeChange(next === ALL ? null : next);
      return;
    }
    setLocalRoomType(next);
  }

  function clearFilters() {
    handleRoomTypeChange(ALL);
    setStatusFilter("all");
    setCategoryFilter(ALL);
    setSearch("");
  }

  return (
    <div className="space-y-3">
      {/* Compact Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#251605]">
          <span className="font-semibold">
            {allPlans.length} Rate Plan{allPlans.length === 1 ? "" : "s"}
          </span>
          <span className="text-[#756A5B]">·</span>
          <span className="text-[#5A4833]">{activeCount} Active</span>
          <span className="text-[#756A5B]">·</span>
          <span className="text-[#756A5B]">{inactiveCount} Inactive</span>
        </div>
        <p className="text-xs text-[#756A5B]">
          Rate plan masters are configured in{" "}
          <PropertySetupRatesLink className="font-semibold text-[#8A641A] underline-offset-2 hover:underline" />
          .
        </p>
      </div>

      {/* Compact Operational Toolbar */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2.5">
            <div className="w-52">
              <Select value={roomTypeFilter} onValueChange={handleRoomTypeChange}>
                <SelectTrigger
                  aria-label="Room type"
                  className="h-9 text-sm font-medium text-[#251605]"
                >
                  <SelectValue placeholder="All room types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL} className="text-sm">
                    All room types
                  </SelectItem>
                  {(typesQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-sm">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              role="group"
              aria-label="Rate plan status filter"
              className="inline-flex h-9 items-center rounded-lg border border-[#DDD4C5] bg-[#F7F4EE] p-0.5"
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "active", label: "Active" },
                  { id: "inactive", label: "Inactive" },
                ] as const
              ).map((option) => {
                const isSelected = statusFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setStatusFilter(option.id)}
                    className={[
                      "h-8 rounded-md px-3 text-xs font-semibold transition-colors",
                      isSelected
                        ? "bg-white text-[#251605] shadow-sm"
                        : "text-[#756A5B] hover:text-[#251605]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#756A5B]" />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search rate plans..."
                aria-label="Search rate plans"
                className="h-9 pl-9 text-sm text-[#251605]"
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-xs font-semibold text-[#5A4833] hover:text-[#251605]"
              onClick={clearFilters}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-[#D5A62B] px-3.5 text-xs font-semibold text-[#332303] hover:bg-[#C89933]"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <SlidersHorizontal className="mr-1.5 size-3.5" />
              Filters
            </Button>
          </div>

          <a
            href={CARD3_HREF}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#DDD4C5] bg-[#FAF6F0] px-3.5 text-xs font-semibold text-[#251605] transition-colors hover:bg-[#F1E9DC]"
          >
            <Settings className="size-3.5 text-[#8A641A]" />
            <span>Configure in Property Setup</span>
          </a>
        </div>

        {filtersOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#EFE9DF] pt-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#5A4833]">
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-8 rounded-lg border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605]"
              >
                <option value={ALL}>All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {plansQuery.isLoading ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#756A5B]">
          Loading rate plans…
        </div>
      ) : allPlans.length === 0 ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#756A5B]">
          No rate plans are configured for this property. Configure rate plans in{" "}
          <PropertySetupRatesLink />.
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-sm text-[#756A5B]">
          No rate plans match the current filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E8E1D7] bg-[#F7F4EE] text-left text-xs font-semibold uppercase tracking-wider text-[#5A4833]">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Rate Plan</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Room Type</th>
                  <th className="px-4 py-3 text-right">Base Rate</th>
                  <th className="px-4 py-3">Validity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFE9DF]">
                {visiblePlans.map((plan) => (
                  <tr key={plan.id} className="transition-colors hover:bg-[#FAF6F0]/60">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#251605]">
                      {plan.code}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[#251605]">{plan.name}</td>
                    <td className="px-4 py-3 text-sm text-[#5A4833]">{plan.categoryName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-[#251605]">{plan.roomTypeName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-[#251605]">
                      {money(plan.baseRate)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-[#5A4833]">
                      {formatRatePlanValidity(plan.validFrom, plan.validTo)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          plan.active
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20"
                            : "bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-500/20",
                        ].join(" ")}
                      >
                        {plan.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Actions for ${plan.code}`}
                            className="inline-flex size-8 items-center justify-center rounded-md text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605]"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-48">
                          {onOpenCalendar ? (
                            <DropdownMenuItem
                              onSelect={() => onOpenCalendar(plan.id, plan.roomTypeId)}
                            >
                              <CalendarDays className="mr-2 size-4 text-[#8A641A]" />
                              <span>Open in Rate Calendar</span>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem asChild>
                            <a href={CARD3_HREF} className="flex items-center">
                              <Settings className="mr-2 size-4 text-[#8A641A]" />
                              <span>Configure in Property Setup</span>
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E1D7] bg-[#FAF6F0]/50 px-4 py-2.5 text-xs text-[#5A4833]">
            <span>
              Showing {showingFrom}–{showingTo} of {filteredPlans.length}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5">
                <span>Rows</span>
                <select
                  aria-label="Rate plans page size"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value) as 10 | 25 | 50)}
                  className="h-8 rounded-md border border-[#DED7CD] bg-white px-2 text-xs font-medium text-[#251605]"
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
                >
                  Previous
                </button>
                {Array.from({ length: pageCount }, (_, idx) => idx + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={[
                      "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors",
                      safePage === pageNumber
                        ? "bg-[#C89933] text-[#251605]"
                        : "border border-[#DED7CD] bg-white text-[#5A4833] hover:bg-[#F8F1E5]",
                    ].join(" ")}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  className="inline-flex h-8 items-center rounded-md border border-[#DED7CD] bg-white px-2.5 text-xs font-medium text-[#251605] hover:bg-[#F8F1E5] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function formatRatePlanValidity(validFrom?: string | null, validTo?: string | null): string {
  if (!validFrom && !validTo) return "Always";
  if (validFrom && !validTo) return `From ${formatStayDate(validFrom)}`;
  if (!validFrom && validTo) return `Until ${formatStayDate(validTo)}`;
  return `${formatStayDate(validFrom!)} – ${formatStayDate(validTo!)}`;
}

/* --------------------------------------------------- plan + range filters */

function usePlanPicker(restaurantId: string) {
  const fetchTypes = useServerFn(listRoomTypes);
  const fetchPlans = useServerFn(listRatePlans);
  const [roomTypeId, setRoomTypeId] = useState<string>(ALL);
  const [ratePlanId, setRatePlanId] = useState<string>("");

  const typesQuery = useQuery({
    queryKey: ["room-types", restaurantId],
    queryFn: () => fetchTypes({ data: { restaurantId } }),
    retry: false,
  });
  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, roomTypeId, true],
    queryFn: () =>
      fetchPlans({
        data: { restaurantId, ...(roomTypeId !== ALL ? { roomTypeId } : {}), activeOnly: true },
      }),
    retry: false,
  });

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  useEffect(() => {
    if (plans.length === 0) {
      setRatePlanId("");
      return;
    }
    if (!plans.some((p) => p.id === ratePlanId)) setRatePlanId(plans[0]!.id);
  }, [plans, ratePlanId]);

  return { typesQuery, plans, roomTypeId, setRoomTypeId, ratePlanId, setRatePlanId };
}

function PlanFilters({
  picker,
  from,
  to,
  setFrom,
  setTo,
}: {
  picker: ReturnType<typeof usePlanPicker>;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="min-w-44">
        <Label>Room type</Label>
        <Select value={picker.roomTypeId} onValueChange={picker.setRoomTypeId}>
          <SelectTrigger>
            <SelectValue placeholder="All room types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All room types</SelectItem>
            {(picker.typesQuery.data ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-52">
        <Label>Rate plan</Label>
        <Select value={picker.ratePlanId} onValueChange={picker.setRatePlanId}>
          <SelectTrigger>
            <SelectValue placeholder="Select rate plan" />
          </SelectTrigger>
          <SelectContent>
            {picker.plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="range-from">From</Label>
        <Input id="range-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="range-to">To</Label>
        <Input id="range-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- rate calendar */

export function RateCalendarTab({
  restaurantId,
  today,
  context,
  canEditDailyRates = true,
}: {
  restaurantId: string;
  today: string;
  context?: {
    fromDate: string;
    toDate: string;
    roomTypeId: string | null;
    ratePlanId: string | null;
  };
  canEditDailyRates?: boolean;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const picker = usePlanPicker(restaurantId);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const rangeFrom = context?.fromDate ?? from;
  const rangeTo = context?.toDate ?? to;
  const ratePlanId = context ? (context.ratePlanId ?? "") : picker.ratePlanId;

  const fetchCalendar = useServerFn(listRateCalendar);
  const saveOverride = useServerFn(saveRateOverride);

  const calendarQuery = useQuery({
    queryKey: ["rate-calendar", restaurantId, ratePlanId, rangeFrom, rangeTo],
    queryFn: () =>
      fetchCalendar({ data: { restaurantId, ratePlanId, from: rangeFrom, to: rangeTo } }),
    enabled: !!ratePlanId,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (vars: { date: string; nightlyRate: number | null }) =>
      saveOverride({ data: { restaurantId, ratePlanId, ...vars } }),
    onSuccess: () => {
      toast.success("Rate saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-calendar", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {context ? null : (
        <PlanFilters picker={picker} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      )}

      {!ratePlanId ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No active rate plan is available. Configure rate plans in <PropertySetupRatesLink />{" "}
          before setting daily rates.
        </p>
      ) : calendarQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading rates…</p>
      ) : calendarQuery.isError ? (
        <p className="text-sm text-destructive">{(calendarQuery.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Base rate</th>
                <th className="px-4 py-3">Override</th>
                <th className="px-4 py-3">Effective</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(calendarQuery.data ?? []).map((row) => {
                const draft =
                  drafts[row.date] ?? (row.overrideRate === null ? "" : String(row.overrideRate));
                return (
                  <tr key={row.date} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{formatStayDate(row.date)}</td>
                    <td className="px-4 py-2">{money(row.baseRate)}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-32"
                        placeholder="—"
                        disabled={!canEditDailyRates}
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.date]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">{money(row.effectiveRate)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={mutation.isPending || !canEditDailyRates}
                          onClick={() =>
                            mutation.mutate({
                              date: row.date,
                              nightlyRate: draft.trim() === "" ? null : Number(draft),
                            })
                          }
                        >
                          Save
                        </Button>
                        {row.overrideRate !== null ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={mutation.isPending || !canEditDailyRates}
                            onClick={() => {
                              setDrafts((prev) => ({ ...prev, [row.date]: "" }));
                              mutation.mutate({ date: row.date, nightlyRate: null });
                            }}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ restrictions */

type RestrictionDraft = {
  minStay: string;
  maxStay: string;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
};

export function RateRestrictionsTab({
  restaurantId,
  today,
  context,
  canApplyRestrictions = true,
}: {
  restaurantId: string;
  today: string;
  context?: {
    fromDate: string;
    toDate: string;
    roomTypeId: string | null;
    ratePlanId: string | null;
  };
  canApplyRestrictions?: boolean;
}) {
  const queryClient = useQueryClient();
  const picker = usePlanPicker(restaurantId);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 13));
  const [drafts, setDrafts] = useState<Record<string, RestrictionDraft>>({});
  const rangeFrom = context?.fromDate ?? from;
  const rangeTo = context?.toDate ?? to;
  const ratePlanId = context ? (context.ratePlanId ?? "") : picker.ratePlanId;

  const fetchRestrictions = useServerFn(listRateRestrictions);
  const saveRestriction = useServerFn(saveRateRestriction);

  const query = useQuery({
    queryKey: ["rate-restrictions", restaurantId, ratePlanId, rangeFrom, rangeTo],
    queryFn: () =>
      fetchRestrictions({ data: { restaurantId, ratePlanId, from: rangeFrom, to: rangeTo } }),
    enabled: !!ratePlanId,
    retry: false,
  });

  useEffect(() => {
    setDrafts({});
  }, [ratePlanId, rangeFrom, rangeTo]);

  const mutation = useMutation({
    mutationFn: (vars: { date: string; draft: RestrictionDraft }) =>
      saveRestriction({
        data: {
          restaurantId,
          ratePlanId,
          date: vars.date,
          minStay: vars.draft.minStay.trim() === "" ? null : Number(vars.draft.minStay),
          maxStay: vars.draft.maxStay.trim() === "" ? null : Number(vars.draft.maxStay),
          closedToArrival: vars.draft.closedToArrival,
          closedToDeparture: vars.draft.closedToDeparture,
          stopSell: vars.draft.stopSell,
        },
      }),
    onSuccess: () => {
      toast.success("Restrictions saved");
      void queryClient.invalidateQueries({ queryKey: ["rate-restrictions", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {context ? null : (
        <PlanFilters picker={picker} from={from} to={to} setFrom={setFrom} setTo={setTo} />
      )}

      {!ratePlanId ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No active rate plan is available. Configure rate plans in <PropertySetupRatesLink />{" "}
          before applying date restrictions.
        </p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading restrictions…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">{(query.error as Error).message}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Min stay</th>
                <th className="px-4 py-3">Max stay</th>
                <th className="px-4 py-3">CTA</th>
                <th className="px-4 py-3">CTD</th>
                <th className="px-4 py-3">Stop sell</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(query.data ?? []).map((row) => {
                const draft: RestrictionDraft = drafts[row.date] ?? {
                  minStay: row.minStay === null ? "" : String(row.minStay),
                  maxStay: row.maxStay === null ? "" : String(row.maxStay),
                  closedToArrival: row.closedToArrival,
                  closedToDeparture: row.closedToDeparture,
                  stopSell: row.stopSell,
                };
                const patch = (next: Partial<RestrictionDraft>) =>
                  setDrafts((prev) => ({ ...prev, [row.date]: { ...draft, ...next } }));
                return (
                  <tr key={row.date} className="border-t border-border">
                    <td className="px-4 py-2 whitespace-nowrap">{formatStayDate(row.date)}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={draft.minStay}
                        disabled={!canApplyRestrictions}
                        onChange={(e) => patch({ minStay: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={draft.maxStay}
                        disabled={!canApplyRestrictions}
                        onChange={(e) => patch({ maxStay: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.closedToArrival}
                        disabled={!canApplyRestrictions}
                        onCheckedChange={(v) => patch({ closedToArrival: v === true })}
                        aria-label={`Closed to arrival on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.closedToDeparture}
                        disabled={!canApplyRestrictions}
                        onCheckedChange={(v) => patch({ closedToDeparture: v === true })}
                        aria-label={`Closed to departure on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Checkbox
                        checked={draft.stopSell}
                        disabled={!canApplyRestrictions}
                        onCheckedChange={(v) => patch({ stopSell: v === true })}
                        aria-label={`Stop sell on ${row.date}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending || !canApplyRestrictions}
                        onClick={() => mutation.mutate({ date: row.date, draft })}
                      >
                        Save
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
