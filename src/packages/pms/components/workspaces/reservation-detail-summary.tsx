import type { ReactNode } from "react";
import {
  BedDouble,
  CalendarDays,
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
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import type { ReservationDetail } from "@/packages/pms/lib/reservations.functions";

export function ReservationDetailSummary({
  reservation,
  money,
  coverUrl,
  nights,
  testId,
  packagesTotal,
  folioBalance,
  showFolioBalance = false,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
  testId: string;
  packagesTotal?: number;
  folioBalance?: number | null;
  showFolioBalance?: boolean;
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
  const roomTotal = group ? combined : reservation.roomSubtotal;

  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
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
              Combined total {roomTotal == null ? DETAIL_DASH : money(roomTotal)}
            </p>
          </>
        ) : (
          <p>Room Rate {roomTotal == null ? DETAIL_DASH : money(roomTotal)}</p>
        )}
        {packagesTotal != null ? <p>Packages {money(packagesTotal)}</p> : null}
        {group ? null : (
          <p className="font-medium text-[#251605]">
            Total Amount {roomTotal == null ? DETAIL_DASH : money(roomTotal)}
          </p>
        )}
      </SummaryBlock>
      {showFolioBalance ? (
        <SummaryBlock icon={<Wallet className="size-3.5 text-[#B8954F]" />} title="Folio balance">
          <p>{folioBalance == null ? DETAIL_DASH : money(folioBalance)}</p>
        </SummaryBlock>
      ) : null}
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Payment & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
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
