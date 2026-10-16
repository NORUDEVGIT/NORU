import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  EMPTY_FOLIO_SEARCH_MORE_FILTERS,
  FOLIO_SEARCH_FILTER_ALL,
  type FolioSearchMoreFilters,
} from "@/packages/pms/lib/folio-search-filters";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { listRatePlans } from "@/packages/pms/lib/rates.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/components/ui/sheet";

export function FolioSearchMoreFilters({
  restaurantId,
  open,
  applied,
  onOpenChange,
  onApply,
}: {
  restaurantId: string;
  open: boolean;
  applied: FolioSearchMoreFilters;
  onOpenChange: (open: boolean) => void;
  onApply: (next: FolioSearchMoreFilters) => void;
}) {
  const [draft, setDraft] = useState(applied);
  const fetchRoomTypes = useServerFn(listRoomTypes);
  const fetchRatePlans = useServerFn(listRatePlans);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);

  useEffect(() => {
    if (open) setDraft(applied);
  }, [applied, open]);

  const roomTypesQuery = useQuery({
    queryKey: ["folio-search-room-types", restaurantId],
    queryFn: () => fetchRoomTypes({ data: { restaurantId } }),
    enabled: open,
  });
  const ratePlansQuery = useQuery({
    queryKey: ["folio-search-rate-plans", restaurantId],
    queryFn: () => fetchRatePlans({ data: { restaurantId } }),
    enabled: open,
  });
  const set6Query = useQuery({
    queryKey: ["folio-search-set6", restaurantId],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    enabled: open,
  });

  const marketSegments = resolveMarketSegmentOptions(set6Query.data?.marketSegments ?? null);
  const bookingSources = resolveBookingSourceOptions(set6Query.data?.sourceCodes ?? null);
  const salesChannels = set6Query.data?.salesChannels ?? [];

  const currencies = ["GBP", "EUR", "USD"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetTitle>More Filters</SheetTitle>
        <SheetDescription>
          Secondary folio filters for room type, rate plan, and commercial fields.
        </SheetDescription>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Room Type</Label>
            <Select
              value={draft.roomTypeId}
              onValueChange={(value) => {
                const match = roomTypesQuery.data?.find((row) => row.id === value);
                setDraft((current) => ({
                  ...current,
                  roomTypeId: value,
                  roomTypeName: match?.name ?? "",
                }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All room types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All room types</SelectItem>
                {(roomTypesQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Rate Plan</Label>
            <Select
              value={draft.ratePlanId}
              onValueChange={(value) => {
                const match = ratePlansQuery.data?.find((row) => row.id === value);
                setDraft((current) => ({
                  ...current,
                  ratePlanId: value,
                  ratePlanName: match?.name ?? "",
                }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All rate plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All rate plans</SelectItem>
                {(ratePlansQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Market Segment</Label>
            <Select
              value={draft.marketSegment}
              onValueChange={(value) => {
                const match = marketSegments.find((row) => row.value === value);
                setDraft((current) => ({
                  ...current,
                  marketSegment: value,
                  marketSegmentLabel: match?.label ?? "",
                }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All segments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All segments</SelectItem>
                {marketSegments.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Booking Source</Label>
            <Select
              value={draft.bookingSource}
              onValueChange={(value) => {
                const match = bookingSources.find((row) => row.value === value);
                setDraft((current) => ({
                  ...current,
                  bookingSource: value,
                  bookingSourceLabel: match?.label ?? "",
                }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All booking sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All booking sources</SelectItem>
                {bookingSources.map((row) => (
                  <SelectItem key={row.value} value={row.value}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sales Channel</Label>
            <Select
              value={draft.salesChannel}
              onValueChange={(value) => {
                const match = salesChannels.find((row) => row.id === value);
                setDraft((current) => ({
                  ...current,
                  salesChannel: value,
                  salesChannelLabel: match?.name ?? "",
                }));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All sales channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All sales channels</SelectItem>
                {salesChannels.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Currency</Label>
            <Select
              value={draft.currency}
              onValueChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="All currencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLIO_SEARCH_FILTER_ALL}>All currencies</SelectItem>
                {currencies.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="folio-unsettled-checkout"
              checked={draft.unsettledCheckout}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, unsettledCheckout: checked === true }))
              }
            />
            <Label htmlFor="folio-unsettled-checkout">Unsettled checkout only</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => setDraft(EMPTY_FOLIO_SEARCH_MORE_FILTERS)}
            >
              Reset
            </Button>
            <Button
              type="button"
              className="min-h-11 flex-1 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
