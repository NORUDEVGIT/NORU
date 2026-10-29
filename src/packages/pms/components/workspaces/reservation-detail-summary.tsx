import {
  BedDouble,
  CalendarDays,
  Coins,
  CreditCard,
  FileText,
  Shield,
  UserRound,
  Wallet,
} from "lucide-react";

import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  groupAssignmentSummary,
  groupCombinedSubtotal,
  groupOccupancyTotals,
  groupPoliciesNote,
  groupRoomSummaryLines,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import {
  DETAIL_DASH,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import { NO_FOLIO_LABEL } from "@/packages/pms/lib/reservation-cashiering-summary";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

export function ReservationDetailSummary({
  reservation,
  money,
  coverUrl,
  nights,
  testId,
  packagesTotal,
  servicesTotal,
  folioBalance,
  showFolioBalance = false,
  paymentReceived,
  paymentRefunded = null,
  guestDeposit,
  totalAmount,
  roomTotalLabel = "Total Amount",
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  testId: string;
  packagesTotal?: number;
  servicesTotal?: number;
  folioBalance?: number | null;
  showFolioBalance?: boolean;
  paymentReceived?: number | null;
  paymentRefunded?: number | null;
  guestDeposit?: number | null;
  totalAmount?: number | null;
  roomTotalLabel?: string;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = earlyDepartureReservationLabel({
    snapshot: reservation.earlyDeparturePolicySnapshot,
    legacyRefundabilitySnapshot: reservation.refundabilitySnapshot,
  });
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const group = isGroupReservation(reservation);
  const occupancy = groupOccupancyTotals(reservation);
  const assignment = groupAssignmentSummary(reservation);
  const combined = groupCombinedSubtotal(reservation);
  const computedRoomTotal = group ? combined : reservation.roomSubtotal;
  const roomRateAmount = computedRoomTotal;
  const guestFacingTotal = totalAmount !== undefined ? totalAmount : computedRoomTotal;
  const paymentFigure =
    paymentReceived === undefined
      ? DETAIL_DASH
      : paymentReceived === null
        ? NO_FOLIO_LABEL
        : money(paymentReceived);
  const depositFigure =
    guestDeposit === undefined
      ? DETAIL_DASH
      : guestDeposit === null
        ? NO_FOLIO_LABEL
        : money(guestDeposit);
  const netPaid =
    paymentReceived != null && paymentRefunded != null
      ? Math.round((paymentReceived - paymentRefunded) * 100) / 100
      : null;

  return (
    <aside
      className="sticky top-4 h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm self-start"
      data-testid={testId}
      data-reservation-summary={group ? "group" : "single"}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
        {group ? <p className="mt-1 text-xs text-[#251605]">Group Reservation</p> : null}
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          {group ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Primary Guest / Booker
            </p>
          ) : null}
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
        {group ? (
          <>
            <p>
              {occupancy.rooms} rooms · {occupancy.adults} adults · {occupancy.children} children ·{" "}
              {occupancy.infants} infants
            </p>
          </>
        ) : (
          <>
            <p>
              {reservation.adults} Adults · {reservation.children} Children ·{" "}
              {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
            </p>
            <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
            <p>Room: {assigned ? reservation.roomNumber : "Not Assigned"}</p>
            <p>This reservation has one room.</p>
          </>
        )}
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title={group ? "Rooms" : "Room Information"}
      >
        {group ? (
          <div className="space-y-1">
            {groupRoomSummaryLines(reservation).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p>{assignment.label}</p>
          </div>
        ) : (
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
        )}
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        {group ? (
          <>
            <p>
              {occupancy.rooms} room unit{occupancy.rooms === 1 ? "" : "s"}
            </p>
            <p className="font-medium text-[#251605]">
              {roomTotalLabel} {guestFacingTotal == null ? DETAIL_DASH : money(guestFacingTotal)}
            </p>
          </>
        ) : (
          <>
            <p>Room Rate {roomRateAmount == null ? DETAIL_DASH : money(roomRateAmount)}</p>
            {packagesTotal != null ? <p>Packages {money(packagesTotal)}</p> : null}
            {servicesTotal != null && servicesTotal > 0 ? (
              <p data-testid="rates-services-total">Services {money(servicesTotal)}</p>
            ) : null}
            <p className="font-medium text-[#251605]">
              {roomTotalLabel} {guestFacingTotal == null ? DETAIL_DASH : money(guestFacingTotal)}
            </p>
          </>
        )}
      </SummaryBlock>
      {showFolioBalance ? (
        <SummaryBlock icon={<Wallet className="size-3.5 text-[#B8954F]" />} title="Folio balance">
          <p>{folioBalance == null ? DETAIL_DASH : money(folioBalance)}</p>
        </SummaryBlock>
      ) : null}

      <div className="space-y-2 border-t border-[#EEE6D8] pt-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-[#BBE3C5] bg-[#EAF7EE] p-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#D4EED8] text-[#16A34A]">
            <Wallet className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1 text-xs font-semibold text-[#1F542C]">
              <span>Payment Received</span>
              <span>{paymentFigure}</span>
            </div>
            <p className="text-[11px] text-[#2F7B42]">
              {paymentReceived === 0
                ? "No payment received"
                : paymentReceived === null
                  ? NO_FOLIO_LABEL
                  : null}
            </p>
            {paymentRefunded != null ? (
              <p className="text-[11px] text-[#2F7B42]">
                Refunded {money(paymentRefunded)}
                {netPaid != null ? ` · Net paid ${money(netPaid)}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-[#F3DFC1] bg-[#FDF5E8] p-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#FCE8CC] text-[#D97706]">
            <Coins className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1 text-xs font-semibold text-[#7A4B0C]">
              <span>Guest Deposit</span>
              <span>{depositFigure}</span>
            </div>
            <p className="text-[11px] font-medium text-[#C2410C]">
              {guestDeposit === 0
                ? "No deposit received"
                : guestDeposit === null
                  ? NO_FOLIO_LABEL
                  : null}
            </p>
          </div>
        </div>
      </div>

      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Payment Method"
      >
        <p className="font-medium text-[#251605]">
          {reviewDash(reservation.guaranteeMethod).toUpperCase()}
        </p>
        <p>
          Payment requirement {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)}
          {deposit?.required ? " · Required" : ""}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Stay Policies">
        {group ? <p>{groupPoliciesNote(reservation)}</p> : null}
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
