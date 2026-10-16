import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import {
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  type PickedReservationMaster,
} from "@/packages/pms/lib/create-reservation-phase1";
import { listGuestAccounts } from "@/packages/pms/lib/guest-accounts.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { listRatePlans } from "@/packages/pms/lib/rates.functions";
import {
  DESK_FILTER_ALL,
  EMPTY_ADVANCED_FILTERS,
  validateAdvancedFilters,
  type DeskAdvancedFilters,
} from "@/packages/pms/lib/reservation-workspace/reservation-desk-filters";
import { listRooms } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/components/ui/sheet";

export function ReservationDeskMoreFilters({
  restaurantId,
  open,
  view,
  applied,
  onOpenChange,
  onApply,
}: {
  restaurantId: string;
  open: boolean;
  view: string;
  applied: DeskAdvancedFilters;
  onOpenChange: (open: boolean) => void;
  onApply: (next: DeskAdvancedFilters) => void;
}) {
  const [draft, setDraft] = useState(applied);
  const [error, setError] = useState<string | null>(null);
  const loadRooms = useServerFn(listRooms);
  const loadPlans = useServerFn(listRatePlans);
  const loadSet6 = useServerFn(getPmsSet6Snapshot);

  useEffect(() => {
    if (open) setDraft(applied);
    if (open) setError(null);
  }, [open, applied]);

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

  const sourceOptions = useMemo(
    () => resolveBookingSourceOptions(set6Query.data?.snapshot.sourceCodes),
    [set6Query.data],
  );
  const segmentOptions = useMemo(
    () => resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments),
    [set6Query.data],
  );
  const showRatePlans = !ratePlansQuery.isError;

  function patch(next: Partial<DeskAdvancedFilters>) {
    setDraft((current) => ({ ...current, ...next }));
    setError(null);
  }

  function apply() {
    const invalid = validateAdvancedFilters(draft, view);
    if (invalid) {
      setError(invalid);
      return;
    }
    onApply(draft);
    onOpenChange(false);
  }

  const companyMaster: PickedReservationMaster | null = draft.companyMasterId
    ? {
        id: draft.companyMasterId,
        name: draft.companyName || "Company",
        code: null,
        paymentTerms: null,
      }
    : null;
  const travelAgentMaster: PickedReservationMaster | null = draft.travelAgentMasterId
    ? {
        id: draft.travelAgentMasterId,
        name: draft.travelAgentName || "Travel Agent",
        code: null,
        paymentTerms: null,
      }
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="reservation-desk-more-filters"
        className="z-[70] flex h-dvh w-full flex-col gap-0 overflow-hidden border-[#DDD4C5] bg-[#F7F4EE] p-0 sm:max-w-[460px]"
      >
        <div className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-4 pr-12">
          <SheetTitle className="font-display text-xl text-[#251605]">More Filters</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">
            Narrow the Reservation Desk. Apply to update results.
          </SheetDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <FilterSection title="Guest">
            <FilterSelect
              label="VIP"
              value={draft.vip}
              onValueChange={(value) => patch({ vip: value as DeskAdvancedFilters["vip"] })}
              options={[
                [DESK_FILTER_ALL, "All guests"],
                ["yes", "VIP"],
                ["no", "Not VIP"],
              ]}
            />
          </FilterSection>

          <FilterSection title="Stay">
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="Departure From"
                value={draft.departureFrom}
                onChange={(departureFrom) => patch({ departureFrom })}
              />
              <DateField
                label="Departure To"
                value={draft.departureTo}
                onChange={(departureTo) => patch({ departureTo })}
              />
            </div>
            <FilterSelect
              label="Assignment"
              value={draft.assignment}
              onValueChange={(value) =>
                patch({ assignment: value as DeskAdvancedFilters["assignment"] })
              }
              options={[
                [DESK_FILTER_ALL, "All"],
                ["assigned", "Assigned"],
                ["unassigned", "Unassigned"],
              ]}
            />
            <FilterSelect
              label="Room"
              value={draft.roomId || DESK_FILTER_ALL}
              onValueChange={(value) => {
                const room = (roomsQuery.data ?? []).find((row) => row.id === value);
                patch({
                  roomId: value,
                  roomNumber: room?.roomNumber ?? "",
                });
              }}
              options={[
                [DESK_FILTER_ALL, "All rooms"],
                ...(roomsQuery.data ?? []).map(
                  (room) => [room.id, `Room ${room.roomNumber}`] as [string, string],
                ),
              ]}
            />
          </FilterSection>

          <FilterSection title="Reservation">
            {showRatePlans ? (
              <FilterSelect
                label="Rate Plan"
                value={draft.ratePlanId || DESK_FILTER_ALL}
                onValueChange={(value) => {
                  const plan = (ratePlansQuery.data ?? []).find((row) => row.id === value);
                  patch({
                    ratePlanId: value,
                    ratePlanName: plan ? `${plan.code}` : "",
                  });
                }}
                options={[
                  [DESK_FILTER_ALL, "All rate plans"],
                  ...(ratePlansQuery.data ?? []).map(
                    (plan) => [plan.id, `${plan.code} · ${plan.name}`] as [string, string],
                  ),
                ]}
              />
            ) : null}
            <FilterSelect
              label="Commercial Booking Source"
              value={draft.commercialBookingSource || DESK_FILTER_ALL}
              onValueChange={(value) => {
                const option = sourceOptions.find((row) => row.value === value);
                patch({
                  commercialBookingSource: value,
                  commercialBookingSourceLabel: option?.label ?? "",
                });
              }}
              options={[
                [DESK_FILTER_ALL, "All booking sources"],
                ...sourceOptions.map((row) => [row.value, row.label] as [string, string]),
              ]}
            />
            <FilterSelect
              label="Market Segment"
              value={draft.marketSegment || DESK_FILTER_ALL}
              onValueChange={(value) => {
                const option = segmentOptions.find((row) => row.value === value);
                patch({
                  marketSegment: value,
                  marketSegmentLabel: option?.label ?? "",
                });
              }}
              options={[
                [DESK_FILTER_ALL, "All segments"],
                ...segmentOptions.map((row) => [row.value, row.label] as [string, string]),
              ]}
            />
          </FilterSection>

          <FilterSection title="Business & Travel">
            <CreateReservationMasterPicker
              restaurantId={restaurantId}
              kind="company"
              canCreate={false}
              master={companyMaster}
              onMasterChange={(master) =>
                patch({
                  companyMasterId: master?.id ?? "",
                  companyName: master?.name ?? "",
                })
              }
            />
            <CreateReservationMasterPicker
              restaurantId={restaurantId}
              kind="travel_agent"
              canCreate={false}
              master={travelAgentMaster}
              onMasterChange={(master) =>
                patch({
                  travelAgentMasterId: master?.id ?? "",
                  travelAgentName: master?.name ?? "",
                })
              }
            />
            <GroupMasterFilter
              restaurantId={restaurantId}
              enabled={open}
              groupId={draft.groupAccountMasterId}
              groupName={draft.groupName}
              onChange={(groupAccountMasterId, groupName) =>
                patch({ groupAccountMasterId, groupName })
              }
            />
          </FilterSection>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => setDraft(EMPTY_ADVANCED_FILTERS)}>
            Reset
          </Button>
          <Button
            type="button"
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            onClick={apply}
          >
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <Input
        type="date"
        className="h-9 bg-white"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function GroupMasterFilter({
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
      <div className="grid gap-1">
        <Label className="text-[11px] font-medium text-muted-foreground">Group</Label>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2">
          <p className="text-sm font-medium">{groupName || "Group"}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange("", "")}>
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <Label className="text-[11px] font-medium text-muted-foreground">Group</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 bg-white pl-9"
          placeholder="Search groups by name or code"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <ul className="space-y-1">
        {(query.data ?? []).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-left text-sm hover:bg-muted/50"
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
