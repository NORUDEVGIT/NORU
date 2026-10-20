import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReservationDetailSummary } from "@/packages/pms/components/workspaces/reservation-detail-summary";
import {
  GROUP_RATE_CHANGE_PER_ROOM,
  groupCombinedSubtotal,
  groupRoomRateSections,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
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
import {
  quoteFolioRoomCharge,
  type FolioRoomChargeQuote,
} from "@/packages/pms/lib/cashiering.functions";
import { listPromotionActivations } from "@/packages/pms/lib/revenue/commercial-promotion-activation.functions";
import {
  applyReservationPromotion,
  removeReservationPromotion,
  saveRateNotes,
} from "@/packages/pms/lib/reservation-detail-controls.functions";
import { stayRoomUnitId } from "@/packages/pms/lib/reservation-detail-guest";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import {
  buildRatesReadModel,
  marketSegmentLabel,
  nightlyBreakdownRows,
  packageNightsLabel,
  RATE_NOTES_MAX,
  RATE_OVERRIDE_OWNERSHIP,
  RATE_PACKAGE_SUMMARY_COPY,
  RATE_PROMOTION_OUTSIDE_SUBTOTAL,
  rateCancellationLabel,
  rateChangePolicyLabel,
  ratePlanMealLabel,
  ratePlanRestrictions,
  snapshotNightlyTotal,
  stayRatePerNight,
  type RatesCashieringRead,
  type RatesUnitSnapshot,
} from "@/packages/pms/lib/reservation-detail-rates";
import {
  listRatePlans,
  repriceReservation,
  type RatePlan,
} from "@/packages/pms/lib/rates.functions";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { parsePackageChargeBasis } from "@/packages/pms/lib/meals-card3.server";
import {
  cataloguePackageById,
  chargeBasisHonestyCopy,
  chargeTypeLabel,
  packageInclusionLabel,
} from "@/packages/pms/lib/reservation-detail-packages";
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
  folio = null,
  coverUrl,
  occupancyLabel,
  onBackToRooms,
  onOpenPackages,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  folio?: {
    id?: string;
    status?: string | null;
    balance: number;
    transactions: ReadonlyArray<{ type: string; amount: number; category?: string | null }>;
  } | null;
  coverUrl: string | null;
  occupancyLabel: string | null;
  onBackToRooms: () => void;
  onOpenPackages: () => void;
  onSaved: () => void;
}) {
  const fetchPlans = useServerFn(listRatePlans);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchCatalogue = useServerFn(getMealsCard3);
  const submitReprice = useServerFn(repriceReservation);
  const submitPromotion = useServerFn(applyReservationPromotion);
  const submitRemovePromotion = useServerFn(removeReservationPromotion);
  const submitRateNotes = useServerFn(saveRateNotes);
  const fetchPromotions = useServerFn(listPromotionActivations);
  const fetchRoomQuote = useServerFn(quoteFolioRoomCharge);
  const [rateNotes, setRateNotes] = useState(reservation.rateNotes ?? "");
  const [planOpen, setPlanOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [promotionId, setPromotionId] = useState("");
  const [planId, setPlanId] = useState(reservation.ratePlanId ?? "");
  const [unitId, setUnitId] = useState<string | null>(stayRoomUnitId(reservation));

  useEffect(() => {
    setRateNotes(reservation.rateNotes ?? "");
    setUnitId((current) =>
      current && reservation.rooms?.some((unit) => unit.id === current)
        ? current
        : stayRoomUnitId(reservation),
    );
  }, [reservation]);

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

  const commercial = commercialQuery.data;
  const read = useMemo(
    () =>
      buildRatesReadModel({
        reservation,
        selectedUnitId: unitId,
        promotion: commercial ? commercial.promotion : undefined,
        packages: commercial ? commercial.packages : undefined,
        folio,
      }),
    [reservation, unitId, commercial, folio],
  );

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, read.unit.roomTypeId, true, "detail-rates"],
    queryFn: () =>
      fetchPlans({
        data: { restaurantId, roomTypeId: read.unit.roomTypeId, activeOnly: true },
      }),
    enabled: canManage,
    retry: false,
  });

  const catalogueQuery = useQuery({
    queryKey: ["meals-card3", restaurantId, "reservation-detail-rates"],
    queryFn: () => fetchCatalogue({ data: { restaurantId } }),
    retry: false,
  });

  useEffect(() => {
    setPlanId(read.unit.ratePlanId ?? "");
  }, [read.unit.unitId, read.unit.ratePlanId]);

  const roomQuoteAmount = read.unit.roomSubtotal;
  const roomQuoteQuery = useQuery({
    queryKey: ["rates-room-quote", restaurantId, folio?.id, read.unit.unitId, roomQuoteAmount],
    queryFn: () =>
      fetchRoomQuote({
        data: {
          restaurantId,
          folioId: folio!.id!,
          amount: roomQuoteAmount!,
        },
      }),
    enabled:
      folio?.status === "open" &&
      Boolean(folio.id) &&
      roomQuoteAmount != null &&
      roomQuoteAmount > 0,
    retry: false,
  });

  const plan: RatePlan | null =
    (plansQuery.data ?? []).find((row) => row.id === read.unit.ratePlanId) ?? null;
  const rows = useMemo(() => nightlyBreakdownRows(read.unit, plan), [read.unit, plan]);
  const perNight = stayRatePerNight(read.unit);
  const currency = read.unit.currency?.trim() || "ETB";
  const promotion = read.promotion;
  const packages = read.packages ?? [];
  const groupStay = isGroupReservation(reservation);
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const selectedUnit = read.units.find((unit) => unit.id === read.selectedUnitId);
  const canChangePlan =
    editable &&
    (selectedUnit == null ||
      (selectedUnit.status !== "cancelled" && selectedUnit.status !== "no_show"));

  const reprice = useMutation({
    mutationFn: () =>
      submitReprice({
        data: {
          restaurantId,
          reservationId: reservation.id,
          ratePlanId: planId,
          ...(read.selectedUnitId ? { reservationRoomId: read.selectedUnitId } : {}),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Repriced ${read.unit.roomLabel} — room total ${money(result.subtotal)}.`);
      setPlanOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const promotionsQuery = useQuery({
    queryKey: ["promotion-activations", restaurantId, "detail-rates"],
    queryFn: () => fetchPromotions({ data: { restaurantId } }),
    enabled: discountOpen,
    retry: false,
  });
  const applyDiscount = useMutation({
    mutationFn: () => {
      if (!promotionId) throw new Error("Choose an existing promotion.");
      return submitPromotion({
        data: {
          restaurantId,
          reservationId: reservation.id,
          promotionActivationId: promotionId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Promotion applied.");
      setDiscountOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeDiscount = useMutation({
    mutationFn: () =>
      submitRemovePromotion({
        data: { restaurantId, reservationId: reservation.id },
      }),
    onSuccess: () => {
      toast.success("Promotion removed. Room subtotal was not changed.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveNotes = useMutation({
    mutationFn: () =>
      submitRateNotes({
        data: {
          restaurantId,
          reservationId: reservation.id,
          notes: rateNotes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Rate notes saved.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const promotionOptions = promotionsQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-rates">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {read.units.length > 1 ? (
            <div className="flex flex-wrap gap-2" data-testid="rates-unit-selector">
              {read.units.map((choice) => (
                <Button
                  key={choice.id}
                  type="button"
                  size="sm"
                  variant={choice.id === read.selectedUnitId ? "default" : "outline"}
                  onClick={() => setUnitId(choice.id)}
                >
                  Room {choice.unitSequence}
                </Button>
              ))}
            </div>
          ) : null}
          {groupStay ? (
            <GroupRoomRates
              reservation={reservation}
              money={money}
              editable={canChangePlan && Boolean(read.selectedUnitId)}
              onChangePlan={() => setPlanOpen(true)}
            />
          ) : (
            <>
              <RateInformationCard
                reservation={reservation}
                unit={read.unit}
                plan={plan}
                coverUrl={coverUrl}
                occupancyLabel={occupancyLabel}
                perNight={perNight}
                money={money}
                currency={currency}
                editable={editable}
                canChangePlan={canChangePlan}
                onChangePlan={() => setPlanOpen(true)}
                onApplyDiscount={() => setDiscountOpen(true)}
              />
              <DailyRateBreakdownCard
                rows={rows}
                roomSubtotal={read.unit.roomSubtotal}
                money={money}
                currency={currency}
              />
            </>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {groupStay ? null : (
              <RatePlanDetailsCard reservation={reservation} unit={read.unit} plan={plan} />
            )}
            <DiscountsCard
              promotion={promotion}
              money={money}
              editable={editable}
              removing={removeDiscount.isPending}
              onAdd={() => setDiscountOpen(true)}
              onRemove={() => removeDiscount.mutate()}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <PackagesCard
              packages={packages}
              packageTotal={read.packageTotal}
              omittedPackageCount={read.omittedPackageCount}
              roomLabel={read.unit.roomLabel}
              catalogue={catalogueQuery.data?.snapshot.packages ?? []}
              ratePlanId={read.unit.ratePlanId}
              stayNights={read.unit.nights}
              money={money}
              onOpenPackages={onOpenPackages}
            />
            <RateNotesCard value={rateNotes} onChange={setRateNotes} editable={editable} />
          </div>
        </div>
        <RatesSummaryRail
          reservation={reservation}
          read={read}
          money={money}
          coverUrl={coverUrl}
          nights={groupStay ? reservation.nights : read.unit.nights}
          groupStay={groupStay}
          roomLabel={read.unit.roomLabel}
          roomQuote={roomQuoteQuery.data ?? null}
          roomQuotePending={roomQuoteQuery.isFetching}
          folioOpen={folio?.status === "open"}
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
            disabled={!editable || saveNotes.isPending}
            onClick={() => saveNotes.mutate()}
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRateNotes(reservation.rateNotes ?? "")}
          >
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
              Repricing writes {read.unit.roomLabel} and rolls the booking total up from the room
              units. Promotion discount stays outside the room subtotal. Browser totals are not
              used.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canChangePlan || !planId || reprice.isPending}
              onClick={() => reprice.mutate()}
            >
              {reprice.isPending ? "Repricing…" : `Reprice ${read.unit.roomLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Existing promotion</Label>
            <Select value={promotionId} onValueChange={setPromotionId}>
              <SelectTrigger className={FIELD}>
                <SelectValue placeholder="Select promotion" />
              </SelectTrigger>
              <SelectContent>
                {promotionOptions.map((row) => (
                  <SelectItem key={row.activationId} value={row.activationId}>
                    {row.code} — {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscountOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!promotionId || applyDiscount.isPending}
              onClick={() => applyDiscount.mutate()}
            >
              {applyDiscount.isPending ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupRoomRates({
  reservation,
  money,
  editable,
  onChangePlan,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  editable: boolean;
  onChangePlan: () => void;
}) {
  const sections = groupRoomRateSections(reservation);
  const combined = groupCombinedSubtotal(reservation);
  return (
    <section
      className="space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rates-group-rooms"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Rate Information</h2>
          <p className="text-xs text-muted-foreground" data-testid="rates-group-change-per-room">
            {GROUP_RATE_CHANGE_PER_ROOM}
          </p>
        </div>
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
      </div>
      {sections.map((section) => (
        <div key={section.sequence} className="border-t border-[#EEE6D8] pt-3 text-sm">
          <p className="font-medium text-[#251605]">Room {section.sequence}</p>
          <p className="text-xs text-muted-foreground">Primary Occupant: {section.occupant}</p>
          <p className="text-xs text-muted-foreground">Room Type: {section.roomTypeName}</p>
          <p className="text-xs text-muted-foreground">Rate Plan: {section.ratePlanName}</p>
          {section.nights.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No nightly snapshot for this room.</p>
          ) : (
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {section.nights.map((night) => (
                  <tr key={`${section.sequence}-${night.date}`}>
                    <td className="py-1 pr-2">{formatStayDate(night.date)}</td>
                    <td className="py-1 text-right">{money(night.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-[#251605]">
            Room Subtotal {section.subtotal == null ? DETAIL_DASH : money(section.subtotal)}
          </p>
        </div>
      ))}
      <p className="border-t border-[#EEE6D8] pt-3 text-sm font-medium text-[#251605]">
        Combined Room Total {combined == null ? DETAIL_DASH : money(combined)}
      </p>
      <p className="text-xs text-muted-foreground">{RATE_OVERRIDE_OWNERSHIP}</p>
    </section>
  );
}

function RateInformationCard({
  reservation,
  unit,
  plan,
  coverUrl,
  occupancyLabel,
  perNight,
  money,
  currency,
  editable,
  canChangePlan,
  onChangePlan,
  onApplyDiscount,
}: {
  reservation: ReservationDetail;
  unit: RatesUnitSnapshot;
  plan: RatePlan | null;
  coverUrl: string | null;
  occupancyLabel: string | null;
  perNight: number | null;
  money: (value: number) => string;
  currency: string;
  editable: boolean;
  canChangePlan: boolean;
  onChangePlan: () => void;
  onApplyDiscount: () => void;
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canChangePlan}
          onClick={onChangePlan}
        >
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
              {unit.roomLabel}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  unit.assignment === "Assigned"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-amber-50 text-amber-800",
                )}
              >
                {unit.assignment}
              </span>
            </p>
            <p className="font-medium text-[#251605]">{reviewDash(unit.roomTypeName)}</p>
            <p className="text-xs text-muted-foreground">
              {unit.adults} Adults
              {occupancyLabel ? ` · ${occupancyLabel}` : ""}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <Info label="Rate Plan" value={reviewDash(unit.ratePlanName ?? plan?.name)} />
          <Info label="Rate Code" value={reviewDash(plan?.code)} />
          <Info
            label="Market Segment"
            value={reviewDash(marketSegmentLabel(reservation.marketSegment))}
          />
          <Info label="Rate per Night" value={perNight == null ? DETAIL_DASH : money(perNight)} />
          <Info
            label="Total for Stay"
            value={unit.roomSubtotal == null ? DETAIL_DASH : money(unit.roomSubtotal)}
          />
          <Info label="Currency" value={reviewDash(currency)} />
        </dl>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canChangePlan}
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
        </div>
      </div>
    </section>
  );
}

function DailyRateBreakdownCard({
  rows,
  roomSubtotal,
  money,
  currency,
}: {
  rows: ReturnType<typeof nightlyBreakdownRows>;
  roomSubtotal: number | null;
  money: (value: number) => string;
  currency: string;
}) {
  const snapshotTotal = snapshotNightlyTotal(rows);
  const stayTotal = roomSubtotal;
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="daily-rate-breakdown"
    >
      <h2 className="font-display text-base text-[#251605]">Daily Rate Breakdown</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        View nightly rates and inclusions for this room. {RATE_OVERRIDE_OWNERSHIP}
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
  unit,
  plan,
}: {
  reservation: ReservationDetail;
  unit: RatesUnitSnapshot;
  plan: RatePlan | null;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-plan-details"
    >
      <h2 className="font-display text-base text-[#251605]">Rate Plan Details</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Info label="Rate Plan Name" value={reviewDash(unit.ratePlanName ?? plan?.name)} />
        <Info label="Rate Code" value={reviewDash(plan?.code)} />
        <Info label="Description" value={reviewDash(plan?.description)} />
        <Info label="Currency" value={reviewDash(unit.currency ?? plan?.currency)} />
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
  removing,
  onAdd,
  onRemove,
}: {
  promotion: {
    name: string;
    code: string;
    kind: string;
    discountAmount: number;
    roomSubtotalAfterPromotion: number | null;
  } | null;
  money: (value: number) => string;
  editable: boolean;
  removing: boolean;
  onAdd: () => void;
  onRemove: () => void;
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
        <>
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
                <td className="py-2 pr-2">{reviewDash(promotion.kind || "Promotion")}</td>
                <td className="py-2 pr-2">{reviewDash(promotion.name || promotion.code)}</td>
                <td className="py-2 pr-2 text-right" data-testid="rates-promotion-total">
                  {money(promotion.discountAmount)}
                </td>
                <td className="py-2">Booking, outside room subtotal</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="rates-promotion-rule">
            {RATE_PROMOTION_OUTSIDE_SUBTOTAL}
            {promotion.roomSubtotalAfterPromotion == null
              ? ""
              : ` Stored room subtotal after promotion ${money(promotion.roomSubtotalAfterPromotion)}.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!editable || removing}
            onClick={onRemove}
          >
            {removing ? "Removing…" : "Remove promotion"}
          </Button>
        </>
      ) : (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="rate-discounts-empty"
        >
          No discounts or adjustments.
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{RATE_OVERRIDE_OWNERSHIP}</p>
    </section>
  );
}

function PackagesCard({
  packages,
  packageTotal,
  omittedPackageCount,
  roomLabel,
  catalogue,
  ratePlanId,
  stayNights,
  money,
  onOpenPackages,
}: {
  packages: Array<{
    id: string;
    packageId: string;
    packageName: string;
    packageCode: string;
    chargeBasis: string;
    quantity: number;
    appliedAmount: number;
    roomUnitLabel?: string | null;
  }>;
  packageTotal: number | null;
  omittedPackageCount: number;
  roomLabel: string;
  catalogue: Parameters<typeof cataloguePackageById>[0];
  ratePlanId: string | null;
  stayNights: number;
  money: (value: number) => string;
  onOpenPackages: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="rate-packages"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Packages</h2>
        <Button type="button" size="sm" variant="outline" onClick={onOpenPackages}>
          Manage on Packages
        </Button>
      </div>
      {packages.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="rate-packages-empty"
        >
          No packages on this room.
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
            {packages.map((row) => {
              const master = cataloguePackageById(catalogue, row.packageId);
              const configuredBasis = parsePackageChargeBasis(
                master?.chargeBasis ?? row.chargeBasis,
              );
              const honesty = chargeBasisHonestyCopy(configuredBasis);
              const inclusion = master ? packageInclusionLabel(master, ratePlanId) : null;
              const description =
                master?.description?.trim() ||
                reviewDash(row.packageCode) ||
                chargeTypeLabel(configuredBasis);
              return (
                <tr key={row.id}>
                  <td className="py-2 pr-2">
                    <p>{reviewDash(row.packageName)}</p>
                    {row.roomUnitLabel ? (
                      <p className="text-[11px] text-muted-foreground">{row.roomUnitLabel}</p>
                    ) : null}
                    {inclusion ? <p className="text-[10px] text-[#5C4A2A]">{inclusion}</p> : null}
                  </td>
                  <td className="py-2 pr-2">
                    <p>{description}</p>
                    {honesty ? (
                      <p className="mt-0.5 text-[10px] text-amber-900/80">{honesty}</p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-right">{money(row.appliedAmount)}</td>
                  <td className="py-2">
                    {packageNightsLabel(configuredBasis, row.quantity, stayNights)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {packageTotal != null ? (
        <p className="mt-3 text-sm font-medium text-[#251605]" data-testid="rates-package-total">
          Package total {money(packageTotal)}
        </p>
      ) : null}
      {omittedPackageCount > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="rates-package-scope">
          {omittedPackageCount} package{omittedPackageCount === 1 ? "" : "s"} on other rooms are not
          included in the {roomLabel} total.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground" data-testid="rates-package-summary">
        {RATE_PACKAGE_SUMMARY_COPY}
      </p>
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
    </section>
  );
}

function RatesSummaryRail({
  reservation,
  read,
  money,
  coverUrl,
  nights,
  groupStay,
  roomLabel,
  roomQuote,
  roomQuotePending,
  folioOpen,
}: {
  reservation: ReservationDetail;
  read: {
    unit: RatesUnitSnapshot;
    packageTotal: number | null;
    cashiering: RatesCashieringRead;
  };
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  groupStay: boolean;
  roomLabel: string;
  roomQuote: FolioRoomChargeQuote | null;
  roomQuotePending: boolean;
  folioOpen: boolean;
}) {
  const payment = read.cashiering.payment;
  const deposit = read.cashiering.deposit;
  const refund = read.cashiering.refund;
  const balance = read.cashiering.balance;
  const postedTax = read.cashiering.postedTax;
  const postedService = read.cashiering.postedServiceCharge;
  const postedAdjustment = read.cashiering.postedAdjustment;
  return (
    <div className="space-y-3">
      <ReservationDetailSummary
        testId="reservation-rates-summary"
        reservation={reservation}
        money={money}
        coverUrl={coverUrl}
        nights={nights}
        packagesTotal={
          !groupStay && read.packageTotal != null && read.packageTotal > 0
            ? read.packageTotal
            : undefined
        }
        paymentReceived={payment != null && payment > 0 ? payment : null}
        guestDeposit={deposit != null && deposit > 0 ? deposit : null}
        paymentPercentage={null}
        totalAmount={groupStay ? undefined : read.unit.roomSubtotal}
      />
      <section
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
        data-testid="rates-cashiering-read"
      >
        <h2 className="font-display text-sm text-[#251605]">Posted cashiering</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Tax, service charge, adjustments, and folio balance are posted folio amounts. Refunds are
          not subtracted from payment.
        </p>
        <dl className="space-y-1 text-sm">
          <Info label="Refund" value={refund != null && refund > 0 ? money(refund) : DETAIL_DASH} />
          <Info
            label="Posted tax"
            value={postedTax == null ? DETAIL_DASH : money(postedTax)}
          />
          <Info
            label="Posted service charge"
            value={postedService == null ? DETAIL_DASH : money(postedService)}
          />
          <Info
            label="Posted adjustments"
            value={postedAdjustment == null ? DETAIL_DASH : money(postedAdjustment)}
          />
          <Info
            label="Posted folio balance"
            value={balance == null ? DETAIL_DASH : money(balance)}
          />
        </dl>
        <div className="mt-3 border-t border-[#EEE6D8] pt-3" data-testid="rates-room-quote">
          <p className="text-sm font-medium text-[#251605]">Quoted room total</p>
          <p className="text-xs text-muted-foreground">
            Not posted. The cashiering tax engine quotes {roomLabel} only. Promotion and packages
            stay outside this quote, so it is not a reservation grand total.
          </p>
          {roomQuote ? (
            <p className="mt-1 text-sm text-[#251605]" data-testid="rates-room-quote-total">
              {money(roomQuote.total)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {roomQuotePending
                ? "Quoting room charge…"
                : folioOpen
                  ? "Room quote unavailable."
                  : "An open folio is required before this room can be quoted."}
            </p>
          )}
        </div>
      </section>
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
