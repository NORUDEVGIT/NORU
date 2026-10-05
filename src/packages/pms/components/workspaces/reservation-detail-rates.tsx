import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Package,
  Percent,
  Plus,
  Shield,
  Tag,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  assignmentLabel,
  marketSegmentLabel,
  nightlyBreakdownRows,
  packageNightsLabel,
  RATE_DISCOUNT_GAP_COPY,
  RATE_NOTES_GAP_COPY,
  RATE_NOTES_MAX,
  RATE_PACKAGE_ADD_GAP_COPY,
  rateCancellationLabel,
  rateChangePolicyLabel,
  ratePlanMealLabel,
  ratePlanRestrictions,
  snapshotNightlyTotal,
  stayRatePerNight,
} from "@/packages/pms/lib/reservation-detail-rates";
import {
  listRatePlans,
  repriceReservation,
  type RatePlan,
} from "@/packages/pms/lib/rates.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";

export function ReservationDetailRatesTab({
  restaurantId,
  reservation,
  canManage,
  money,
  coverUrl,
  occupancyLabel,
  onBackToRooms,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  occupancyLabel: string | null;
  onBackToRooms: () => void;
  onSaved: () => void;
}) {
  const fetchPlans = useServerFn(listRatePlans);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const submitReprice = useServerFn(repriceReservation);
  const [rateNotes, setRateNotes] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [planId, setPlanId] = useState(reservation.ratePlanId ?? "");

  useEffect(() => {
    setPlanId(reservation.ratePlanId ?? "");
  }, [reservation.ratePlanId]);

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, reservation.roomTypeId, true, "detail-rates"],
    queryFn: () =>
      fetchPlans({ data: { restaurantId, roomTypeId: reservation.roomTypeId, activeOnly: true } }),
    enabled: canManage,
    retry: false,
  });

  const commercialQuery = useQuery({
    queryKey: ["reservation-commercial", restaurantId, reservation.id],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId: reservation.id,
          roomSubtotal: reservation.roomSubtotal,
        },
      }),
    retry: false,
  });

  const plan: RatePlan | null =
    (plansQuery.data ?? []).find((row) => row.id === reservation.ratePlanId) ??
    (plansQuery.data ?? []).find((row) => row.id === planId) ??
    null;
  const rows = useMemo(() => nightlyBreakdownRows(reservation, plan), [reservation, plan]);
  const assigned = assignmentLabel(reservation);
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const perNight = stayRatePerNight(reservation);
  const currency = reservation.currency?.trim() || "ETB";
  const promotion = commercialQuery.data?.promotion ?? null;
  const packages = commercialQuery.data?.packages ?? [];
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;

  const reprice = useMutation({
    mutationFn: () =>
      submitReprice({
        data: { restaurantId, reservationId: reservation.id, ratePlanId: planId },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Repriced — stay total ${money(result.subtotal)}.`);
      setPlanOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-rates">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <RateInformationCard
            reservation={reservation}
            plan={plan}
            assigned={assigned}
            coverUrl={coverUrl}
            occupancyLabel={occupancyLabel}
            perNight={perNight}
            money={money}
            currency={currency}
            editable={editable}
            onChangePlan={() => setPlanOpen(true)}
            onApplyDiscount={() => toast.message(RATE_DISCOUNT_GAP_COPY)}
            onAddPackage={() => toast.message(RATE_PACKAGE_ADD_GAP_COPY)}
          />
          <DailyRateBreakdownCard
            rows={rows}
            reservation={reservation}
            money={money}
            currency={currency}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <RatePlanDetailsCard reservation={reservation} plan={plan} />
            <DiscountsCard
              promotion={promotion}
              money={money}
              editable={editable}
              onAdd={() => toast.message(RATE_DISCOUNT_GAP_COPY)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <PackagesCard
              packages={packages}
              stayNights={reservation.nights}
              money={money}
              editable={editable}
              onAdd={() => toast.message(RATE_PACKAGE_ADD_GAP_COPY)}
            />
            <RateNotesCard value={rateNotes} onChange={setRateNotes} editable={editable} />
          </div>
        </div>
        <RatesSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToRooms}>
          Back to Rooms
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable}
            onClick={() => toast.message(RATE_NOTES_GAP_COPY)}
          >
            Save Changes
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRateNotes("")}>
            Cancel
          </Button>
        </div>
      </div>
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Rate Plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Rate plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="Select rate plan" />
              </SelectTrigger>
              <SelectContent>
                {(plansQuery.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Repricing recalculates every night on the server from the selected plan. Browser
              totals are not used.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!planId || reprice.isPending}
              onClick={() => reprice.mutate()}
            >
              {reprice.isPending ? "Repricing…" : "Reprice stay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RateInformationCard({
  reservation,
  plan,
  assigned,
  coverUrl,
  occupancyLabel,
  perNight,
  money,
  currency,
  editable,
  onChangePlan,
  onApplyDiscount,
  onAddPackage,
}: {
  reservation: ReservationDetail;
  plan: RatePlan | null;
  assigned: string;
  coverUrl: string | null;
  occupancyLabel: string | null;
  perNight: number | null;
  money: (value: number) => string;
  currency: string;
  editable: boolean;
  onChangePlan: () => void;
  onApplyDiscount: () => void;
  onAddPackage: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-information"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Rate Information</h2>
          <p className="text-xs text-muted-foreground">
            View and manage the applied rate plan, daily rates, discounts and rate adjustments.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={onChangePlan}>
          Edit Rate
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <div className="flex gap-3">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-24 w-32 rounded-md object-cover" />
          ) : (
            <div className="flex h-24 w-32 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-8" />
            </div>
          )}
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Room 1
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  assigned === "Assigned"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800",
                )}
              >
                {assigned}
              </span>
            </p>
            <p className="font-medium text-[#251605]">{reviewDash(reservation.roomTypeName)}</p>
            <p className="text-xs text-muted-foreground">
              {reservation.adults} Adults
              {occupancyLabel ? ` · ${occupancyLabel}` : ""}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <Info label="Rate Plan" value={reviewDash(reservation.ratePlanName ?? plan?.name)} />
          <Info label="Rate Code" value={reviewDash(plan?.code)} />
          <Info
            label="Market Segment"
            value={reviewDash(marketSegmentLabel(reservation.marketSegment))}
          />
          <Info label="Rate per Night" value={perNight == null ? DETAIL_DASH : money(perNight)} />
          <Info
            label={`Total for Stay`}
            value={reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
          />
          <Info label="Currency" value={reviewDash(currency)} />
        </dl>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable}
            onClick={onChangePlan}
          >
            <Tag className="mr-1 size-3.5" />
            Change Rate Plan
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable}
            onClick={onApplyDiscount}
          >
            <Percent className="mr-1 size-3.5" />
            Apply Discount
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editable}
            onClick={onAddPackage}
          >
            <Package className="mr-1 size-3.5" />
            Add Package
          </Button>
        </div>
      </div>
    </section>
  );
}

function DailyRateBreakdownCard({
  rows,
  reservation,
  money,
  currency,
}: {
  rows: ReturnType<typeof nightlyBreakdownRows>;
  reservation: ReservationDetail;
  money: (value: number) => string;
  currency: string;
}) {
  const snapshotTotal = snapshotNightlyTotal(rows);
  const stayTotal = reservation.roomSubtotal;
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="daily-rate-breakdown"
    >
      <h2 className="font-display text-base text-[#251605]">Daily Rate Breakdown</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        View nightly rates, inclusions and charges for this reservation.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pricing snapshot for this reservation. Nightly rows are not invented.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Day</th>
                <th className="py-2 pr-2">Room Type</th>
                <th className="py-2 pr-2">Rate Plan</th>
                <th className="py-2 pr-2 text-right">Rate ({currency})</th>
                <th className="py-2 pr-2 text-right">Discount ({currency})</th>
                <th className="py-2 pr-2 text-right">Adjustments ({currency})</th>
                <th className="py-2 pr-2 text-right">Total ({currency})</th>
                <th className="py-2">Inclusions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className="border-b border-[#F4EEE4]">
                  <td className="py-2 pr-2">{formatStayDate(row.date)}</td>
                  <td className="py-2 pr-2">{row.weekday}</td>
                  <td className="py-2 pr-2">{reviewDash(row.roomTypeName)}</td>
                  <td className="py-2 pr-2">{reviewDash(row.ratePlanName)}</td>
                  <td className="py-2 pr-2 text-right">{money(row.rate)}</td>
                  <td className="py-2 pr-2 text-right">{DETAIL_DASH}</td>
                  <td className="py-2 pr-2 text-right">{DETAIL_DASH}</td>
                  <td className="py-2 pr-2 text-right">{money(row.total)}</td>
                  <td className="py-2">{row.inclusion ? row.inclusion : DETAIL_DASH}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-2 pr-2" colSpan={7}>
                  Total
                </td>
                <td className="py-2 pr-2 text-right">
                  {stayTotal == null ? DETAIL_DASH : money(stayTotal)}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {snapshotTotal != null && stayTotal != null && snapshotTotal !== stayTotal
                    ? "Stay total from reservation pricing snapshot"
                    : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RatePlanDetailsCard({
  reservation,
  plan,
}: {
  reservation: ReservationDetail;
  plan: RatePlan | null;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-plan-details"
    >
      <h2 className="font-display text-base text-[#251605]">Rate Plan Details</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Info label="Rate Plan Name" value={reviewDash(reservation.ratePlanName ?? plan?.name)} />
        <Info label="Rate Code" value={reviewDash(plan?.code)} />
        <Info label="Description" value={reviewDash(plan?.description)} />
        <Info label="Currency" value={reviewDash(reservation.currency ?? plan?.currency)} />
        <Info label="Meal Plan" value={ratePlanMealLabel(plan)} />
        <Info label="Cancellation Policy" value={rateCancellationLabel(reservation, plan)} />
        <Info label="Change Policy" value={rateChangePolicyLabel(reservation, plan)} />
        <Info label="Other Restrictions" value={reviewDash(ratePlanRestrictions(plan))} />
      </dl>
    </section>
  );
}

function DiscountsCard({
  promotion,
  money,
  editable,
  onAdd,
}: {
  promotion: {
    promotionName: string;
    promotionCode: string;
    promoKind: string;
    discountAmount: number;
  } | null;
  money: (value: number) => string;
  editable: boolean;
  onAdd: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-discounts"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Discounts & Adjustments</h2>
        <Button type="button" size="sm" disabled={!editable} onClick={onAdd}>
          <Plus className="mr-1 size-3.5" />
          Add
        </Button>
      </div>
      {promotion ? (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-2">Type</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Amount</th>
              <th className="py-2">Applied To</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-2">{reviewDash(promotion.promoKind || "Promotion")}</td>
              <td className="py-2 pr-2">
                {reviewDash(promotion.promotionName || promotion.promotionCode)}
              </td>
              <td className="py-2 pr-2 text-right">{money(promotion.discountAmount)}</td>
              <td className="py-2">Room subtotal</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="rate-discounts-empty"
        >
          No discounts or adjustments.
          <p className="mt-1 text-xs">{RATE_DISCOUNT_GAP_COPY}</p>
        </div>
      )}
    </section>
  );
}

function PackagesCard({
  packages,
  stayNights,
  money,
  editable,
  onAdd,
}: {
  packages: Array<{
    id: string;
    packageName: string;
    packageCode: string;
    chargeBasis: string;
    quantity: number;
    appliedAmount: number;
  }>;
  stayNights: number;
  money: (value: number) => string;
  editable: boolean;
  onAdd: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-packages"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Packages & Promotions</h2>
        <Button type="button" size="sm" disabled={!editable} onClick={onAdd}>
          <Plus className="mr-1 size-3.5" />
          Add
        </Button>
      </div>
      {packages.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="rate-packages-empty"
        >
          No packages added.
          <p className="mt-1 text-xs">{RATE_PACKAGE_ADD_GAP_COPY}</p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-2">Package Name</th>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2 text-right">Amount</th>
              <th className="py-2">Nights</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-2">{reviewDash(row.packageName)}</td>
                <td className="py-2 pr-2">{reviewDash(row.packageCode || row.chargeBasis)}</td>
                <td className="py-2 pr-2 text-right">{money(row.appliedAmount)}</td>
                <td className="py-2">
                  {packageNightsLabel(row.chargeBasis, row.quantity, stayNights)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RateNotesCard({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-notes"
    >
      <h2 className="font-display text-base text-[#251605]">Rate Notes</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Internal notes about rates, discounts or special arrangements (visible to hotel staff only).
      </p>
      <Textarea
        id="rate-tab-notes"
        maxLength={RATE_NOTES_MAX}
        disabled={!editable}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, RATE_NOTES_MAX))}
        placeholder="Add rate notes here…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {value.length}/{RATE_NOTES_MAX}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{RATE_NOTES_GAP_COPY}</p>
    </section>
  );
}

function RatesSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);

  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-rates-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-[#251605]">{value}</dd>
    </>
  );
}
