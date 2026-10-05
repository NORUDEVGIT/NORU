import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Plus,
  Shield,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
import { resolveMarketSegmentOptions } from "@/packages/pms/lib/create-reservation-phase1";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import {
  listPurposeOfStay,
  purposeOptionsFromRows,
} from "@/packages/pms/lib/purpose-of-stay.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  buildStayDraft,
  nextStayExtension,
  requestStatusLabel,
  stayExtensionNights,
  STAY_NOTES_MAX,
  STAY_OCCASION_OPTIONS,
  STAY_PICKUP_OPTIONS,
  stayNights,
  stayRangeOk,
  type ReservationStayDraft,
} from "@/packages/pms/lib/reservation-detail-stay";
import {
  amendReservation,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";

export function ReservationDetailStayTab({
  restaurantId,
  reservation,
  canManage,
  money,
  coverUrl,
  onBackToOverview,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToOverview: () => void;
  onSaved: () => void;
}) {
  const fetchPurpose = useServerFn(listPurposeOfStay);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const submitAmend = useServerFn(amendReservation);
  const [draft, setDraft] = useState<ReservationStayDraft>(() => buildStayDraft(reservation));

  useEffect(() => {
    setDraft(buildStayDraft(reservation));
  }, [reservation]);

  const purposeQuery = useQuery({
    queryKey: ["pms-purpose-of-stay", restaurantId, "reservation-detail-stay"],
    queryFn: () => fetchPurpose({ data: { restaurantId } }),
    retry: false,
  });
  const set6Query = useQuery({
    queryKey: ["pms-set6", restaurantId, "reservation-detail-stay"],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    retry: false,
  });

  const purposeOptions = purposeOptionsFromRows(purposeQuery.data?.items);
  const segmentOptions = resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments);
  const nights = stayNights(draft.arrival, draft.departure);
  const rangeOk = stayRangeOk(draft.arrival, draft.departure);

  function patch(next: Partial<ReservationStayDraft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  const save = useMutation({
    mutationFn: () =>
      submitAmend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: draft.arrival,
          departure: draft.departure,
          adults: draft.adults,
          children: draft.children,
          notes: draft.stayNotes,
          specialRequests: reservation.specialRequests,
          ratePlanId: reservation.ratePlanId,
          marketSegment: draft.marketSegment || null,
        },
      }),
    onSuccess: () => {
      toast.success("Stay updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-stay">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <StayInformationCard
            draft={draft}
            patch={patch}
            nights={nights}
            rangeOk={rangeOk}
            editable={editable}
            purposeOptions={purposeOptions}
            segmentOptions={segmentOptions}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <StayExtensionsCard draft={draft} patch={patch} editable={editable} />
            <EarlyLateCard draft={draft} patch={patch} editable={editable} />
          </div>
          <StayNotesCard draft={draft} patch={patch} editable={editable} />
        </div>
        <StaySummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToOverview}>
          Back to Overview
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || !rangeOk || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDraft(buildStayDraft(reservation))}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function StayInformationCard({
  draft,
  patch,
  nights,
  rangeOk,
  editable,
  purposeOptions,
  segmentOptions,
}: {
  draft: ReservationStayDraft;
  patch: (next: Partial<ReservationStayDraft>) => void;
  nights: number;
  rangeOk: boolean;
  editable: boolean;
  purposeOptions: Array<{ value: string; label: string }>;
  segmentOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-base text-[#251605]">
        <CalendarDays className="size-4 text-[#B8954F]" />
        Stay Information
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        View and manage the stay details for this reservation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StayField label="Arrival Date *" htmlFor="stay-arrival">
          <Input
            id="stay-arrival"
            type="date"
            className={FIELD}
            value={draft.arrival}
            disabled={!editable}
            onChange={(e) => patch({ arrival: e.target.value })}
          />
        </StayField>
        <StayField label="Departure Date *" htmlFor="stay-departure">
          <Input
            id="stay-departure"
            type="date"
            className={FIELD}
            value={draft.departure}
            disabled={!editable}
            onChange={(e) => patch({ departure: e.target.value })}
          />
        </StayField>
        <StayField label="Nights">
          <Input className={FIELD} value={String(nights)} disabled />
        </StayField>
        <StayField label="Rooms">
          <Select
            value={String(draft.rooms)}
            onValueChange={(value) => patch({ rooms: Number(value) })}
            disabled={!editable}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StayField>
        <StayField label="Adults *">
          <Input
            type="number"
            min={1}
            className={FIELD}
            value={draft.adults}
            disabled={!editable}
            onChange={(e) => patch({ adults: Math.max(1, Number(e.target.value) || 1) })}
          />
        </StayField>
        <StayField label="Children">
          <Input
            type="number"
            min={0}
            className={FIELD}
            value={draft.children}
            disabled={!editable}
            onChange={(e) => patch({ children: Math.max(0, Number(e.target.value) || 0) })}
          />
        </StayField>
        <StayField label="Infants">
          <Input
            type="number"
            min={0}
            className={FIELD}
            value={draft.infants}
            disabled={!editable}
            onChange={(e) => patch({ infants: Math.max(0, Number(e.target.value) || 0) })}
          />
        </StayField>
        <StayField label="Purpose of Stay">
          <Select
            value={draft.purposeOfStay || "none"}
            onValueChange={(value) => patch({ purposeOfStay: value === "none" ? "" : value })}
            disabled={!editable}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {purposeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StayField>
        <StayField label="Market Segment">
          <Select
            value={draft.marketSegment || "none"}
            onValueChange={(value) => patch({ marketSegment: value === "none" ? "" : value })}
            disabled={!editable}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {segmentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StayField>
        <StayField label="Special Occasion (Optional)">
          <Select
            value={draft.specialOccasion || "none"}
            onValueChange={(value) => patch({ specialOccasion: value === "none" ? "" : value })}
            disabled={!editable}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAY_OCCASION_OPTIONS.map((option) => (
                <SelectItem key={option.value || "none"} value={option.value || "none"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StayField>
        <StayField label="Expected Arrival Time" htmlFor="stay-eta">
          <Input
            id="stay-eta"
            type="time"
            className={FIELD}
            value={draft.expectedArrivalTime}
            disabled={!editable}
            onChange={(e) => patch({ expectedArrivalTime: e.target.value })}
          />
        </StayField>
        <StayField label="Expected Departure Time" htmlFor="stay-etd">
          <Input
            id="stay-etd"
            type="time"
            className={FIELD}
            value={draft.expectedDepartureTime}
            disabled={!editable}
            onChange={(e) => patch({ expectedDepartureTime: e.target.value })}
          />
        </StayField>
        <StayField label="Flight / Transport Details (Optional)" htmlFor="stay-transport">
          <Input
            id="stay-transport"
            className={FIELD}
            placeholder="e.g. ET302, 22 Sep, 11:30"
            value={draft.transportDetails}
            disabled={!editable}
            onChange={(e) => patch({ transportDetails: e.target.value })}
          />
        </StayField>
        <StayField label="Pickup Service">
          <Select
            value={draft.pickupService}
            onValueChange={(value) => patch({ pickupService: value })}
            disabled={!editable}
          >
            <SelectTrigger className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAY_PICKUP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StayField>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <StayCheck
          label="Flexible Dates (± 3 days)"
          checked={draft.flexibleDates}
          disabled={!editable}
          onChange={(checked) => patch({ flexibleDates: checked })}
        />
        <StayCheck
          label="Allow early check-in (subject to availability)"
          checked={draft.allowEarlyCheckIn}
          disabled={!editable}
          onChange={(checked) => patch({ allowEarlyCheckIn: checked })}
        />
        <StayCheck
          label="Allow late check-out (subject to availability)"
          checked={draft.allowLateCheckOut}
          disabled={!editable}
          onChange={(checked) => patch({ allowLateCheckOut: checked })}
        />
      </div>
      {!rangeOk ? (
        <p className="mt-2 text-xs text-destructive">Departure must be after arrival.</p>
      ) : null}
    </section>
  );
}

function StayExtensionsCard({
  draft,
  patch,
  editable,
}: {
  draft: ReservationStayDraft;
  patch: (next: Partial<ReservationStayDraft>) => void;
  editable: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base text-[#251605]">Stay Extensions</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!editable}
          onClick={() =>
            patch({ extensions: [...draft.extensions, nextStayExtension(draft.departure)] })
          }
        >
          <Plus className="size-3.5" />
          Add Extension
        </Button>
      </div>
      {draft.extensions.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-[#DDD4C5] px-4 py-8 text-center"
          data-testid="stay-extensions-empty"
        >
          <p className="text-sm font-medium text-[#251605]">No extensions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This reservation has no extensions yet.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="pb-2">From</th>
              <th className="pb-2">To</th>
              <th className="pb-2">Nights</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {draft.extensions.map((row) => (
              <tr key={row.id} className="border-t border-[#EEE6D8]">
                <td className="py-2">{formatStayDate(row.from)}</td>
                <td className="py-2">{formatStayDate(row.to)}</td>
                <td className="py-2">{stayExtensionNights(row.from, row.to)}</td>
                <td className="py-2 text-muted-foreground">Unsaved</td>
                <td className="py-2">
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={() =>
                      patch({
                        extensions: draft.extensions.filter((item) => item.id !== row.id),
                      })
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EarlyLateCard({
  draft,
  patch,
  editable,
}: {
  draft: ReservationStayDraft;
  patch: (next: Partial<ReservationStayDraft>) => void;
  editable: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-display text-base text-[#251605]">Early Arrival / Late Departure</h2>
      <div className="space-y-3">
        <StayCheck
          label="Early Arrival Request"
          checked={draft.earlyArrivalRequested}
          disabled={!editable}
          onChange={(checked) => patch({ earlyArrivalRequested: checked })}
        />
        <div className="grid grid-cols-2 gap-3 pl-6">
          <StayField label="Requested Time" htmlFor="stay-early-time">
            <Input
              id="stay-early-time"
              type="time"
              className={FIELD}
              value={draft.expectedArrivalTime}
              disabled={!editable || !draft.earlyArrivalRequested}
              onChange={(e) => patch({ expectedArrivalTime: e.target.value })}
            />
          </StayField>
          <StayField label="Status">
            <Input
              className={FIELD}
              disabled
              value={requestStatusLabel(draft.earlyArrivalRequested)}
            />
          </StayField>
        </div>
        <StayCheck
          label="Late Departure Request"
          checked={draft.lateDepartureRequested}
          disabled={!editable}
          onChange={(checked) => patch({ lateDepartureRequested: checked })}
        />
        <div className="grid grid-cols-2 gap-3 pl-6">
          <StayField label="Requested Time" htmlFor="stay-late-time">
            <Input
              id="stay-late-time"
              type="time"
              className={FIELD}
              value={draft.expectedDepartureTime}
              disabled={!editable || !draft.lateDepartureRequested}
              onChange={(e) => patch({ expectedDepartureTime: e.target.value })}
            />
          </StayField>
          <StayField label="Status">
            <Input
              className={FIELD}
              disabled
              value={requestStatusLabel(draft.lateDepartureRequested)}
            />
          </StayField>
        </div>
      </div>
    </section>
  );
}

function StayNotesCard({
  draft,
  patch,
  editable,
}: {
  draft: ReservationStayDraft;
  patch: (next: Partial<ReservationStayDraft>) => void;
  editable: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <h2 className="font-display text-base text-[#251605]">Stay Notes</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        Add notes related to the guest stay (visible to hotel staff).
      </p>
      <Textarea
        id="stay-notes"
        maxLength={STAY_NOTES_MAX}
        disabled={!editable}
        value={draft.stayNotes}
        onChange={(e) => patch({ stayNotes: e.target.value.slice(0, STAY_NOTES_MAX) })}
        placeholder="Add stay notes here…"
        className="min-h-24"
      />
      <p className="mt-1 text-right text-[11px] text-muted-foreground">
        {draft.stayNotes.length}/{STAY_NOTES_MAX}
      </p>
    </section>
  );
}

function StaySummaryRail({
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
      data-testid="reservation-stay-summary"
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

function StayField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function StayCheck({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn("flex items-center gap-2 text-sm text-[#251605]", disabled && "opacity-60")}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </label>
  );
}
