import type { ReactNode } from "react";
import {
  ArrowRight,
  BedDouble,
  ChevronDown,
  Mail,
  Phone,
  ShieldCheck,
  Users,
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
  const stayNights = nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const group = isGroupReservation(reservation);
  const occupancy = groupOccupancyTotals(reservation);
  const assignment = groupAssignmentSummary(reservation);
  const roomTotal = group ? groupCombinedSubtotal(reservation) : reservation.roomSubtotal;

  const guestsLine = group
    ? `${occupancy.rooms} rooms · ${occupancy.adults} adults · ${occupancy.children} children`
    : `${reservation.adults} adults · ${reservation.children} children`;

  return (
    <aside
      className="h-fit overflow-hidden rounded-2xl border border-[#e9dfd0] bg-white shadow-[0_2px_12px_rgba(74,44,26,0.10)]"
      data-testid={testId}
      data-reservation-summary={group ? "group" : "single"}
    >
      {/* Header */}
      <div className="border-b border-[#e9dfd0] bg-white px-4 pb-4 pt-3.5 text-[#4a2c1a]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C89933]">
          {group ? "Group Reservation" : "Reservation"}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate font-display text-xl font-semibold text-[#4a2c1a]">
            {reservation.confirmationNumber}
          </p>
          <span className="shrink-0">
            <ReservationStatusBadge status={reservation.status} />
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Guest */}
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[#C89933] text-sm font-bold text-[#4a2c1a]">
            {guestInitials(reservation.guestName)}
          </div>
          <div className="min-w-0">
            {group ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A6B58]">
                Primary guest / booker
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 truncate text-sm font-bold text-[#4a2c1a]">
              {reservation.guestName}
              {reservation.guestVip ? (
                <span className="rounded-full bg-[#f5ead0] px-1.5 py-0.5 text-[10px] font-bold text-[#8C6D23]">
                  VIP
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#7A6B58]">
              <Phone className="size-3 text-[#c9a24a]" />
              {reviewDash(reservation.guestPhone)}
            </p>
            <p className="flex items-center gap-1 truncate text-xs text-[#7A6B58]">
              <Mail className="size-3 text-[#c9a24a]" />
              {reviewDash(reservation.guestEmail)}
            </p>
          </div>
        </div>

        {/* Stay: arrival -> departure */}
        <div className="rounded-xl bg-[#fbf7ee] p-3">
          <div className="flex items-center justify-between gap-2">
            <DateTile label="Arrival" value={formatStayDate(reservation.arrivalDate)} />
            <div className="flex flex-col items-center gap-1">
              <span className="rounded-full bg-[#C89933] px-2 py-0.5 text-[10px] font-bold text-[#4a2c1a]">
                {stayNights} night{stayNights === 1 ? "" : "s"}
              </span>
              <ArrowRight className="size-4 text-[#c9a24a]" />
            </div>
            <DateTile
              label="Departure"
              value={formatStayDate(reservation.departureDate)}
              align="right"
            />
          </div>
          <p className="mt-3 flex items-center gap-1.5 border-t border-[#e9dfd0] pt-2.5 text-xs text-[#4a2c1a]">
            <Users className="size-3.5 text-[#c9a24a]" />
            {guestsLine}
            {!group && reservation.infants ? ` · ${reservation.infants} infants` : ""}
          </p>
        </div>

        {/* Room */}
        <div className="overflow-hidden rounded-xl border border-[#e9dfd0]">
          {group ? (
            <div className="space-y-1 p-3 text-xs text-[#4a2c1a]">
              <p className="mb-1 flex items-center gap-1.5 font-bold">
                <BedDouble className="size-3.5 text-[#c9a24a]" />
                Rooms
              </p>
              {groupRoomSummaryLines(reservation).map((line) => (
                <p key={line} className="text-[#7A6B58]">
                  {line}
                </p>
              ))}
              <p className="pt-1 font-medium">{assignment.label}</p>
            </div>
          ) : (
            <>
              {coverUrl ? (
                <img src={coverUrl} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="grid h-20 w-full place-items-center bg-[#f5ead0] text-[#c9a24a]">
                  <BedDouble className="size-7" />
                </div>
              )}
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#4a2c1a]">
                    {reviewDash(reservation.roomTypeName)}
                  </p>
                  <p className="truncate text-xs text-[#7A6B58]">
                    {reviewDash(reservation.ratePlanName)}
                  </p>
                </div>
                <span
                  className={
                    assigned
                      ? "shrink-0 rounded-full bg-[#4a2c1a] px-2.5 py-1 text-xs font-bold text-white"
                      : "shrink-0 rounded-full bg-[#f5ead0] px-2.5 py-1 text-xs font-bold text-[#8C6D23]"
                  }
                >
                  {assigned ? `Room ${reservation.roomNumber}` : "Not assigned"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Total */}
        <div className="rounded-xl bg-[#f5ead0] p-3.5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A6B58]">
                {group ? "Combined total" : "Total amount"}
              </p>
              <p className="font-display text-2xl font-bold leading-tight text-[#4a2c1a]">
                {roomTotal == null ? DETAIL_DASH : money(roomTotal)}
              </p>
            </div>
            {packagesTotal != null ? (
              <p className="text-xs text-[#7A6B58]">+ {money(packagesTotal)} packages</p>
            ) : null}
          </div>
          <div className="mt-2.5 space-y-1 border-t border-[#e6d6ad] pt-2.5 text-xs text-[#4a2c1a]">
            <SummaryRow label="Guarantee" value={reviewDash(reservation.guaranteeMethod)} />
            <SummaryRow
              label="Deposit"
              value={`${deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} · ${depositStatusLabel(deposit)}`}
            />
            {showFolioBalance ? (
              <SummaryRow
                label="Folio balance"
                value={folioBalance == null ? DETAIL_DASH : money(folioBalance)}
                icon={<Wallet className="size-3 text-[#c9a24a]" />}
              />
            ) : null}
          </div>
        </div>

        {/* Policies (collapsed to keep the panel simple) */}
        <details className="group rounded-xl border border-[#e9dfd0] px-3 py-2.5 text-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-[#4a2c1a]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-[#c9a24a]" />
              Stay policies
            </span>
            <ChevronDown className="size-4 text-[#7A6B58] transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 space-y-1.5 border-t border-[#EEE6D8] pt-2.5">
            {group ? <p className="text-[#7A6B58]">{groupPoliciesNote(reservation)}</p> : null}
            <SummaryRow label="Cancellation" value={reviewDash(cancellation)} />
            <SummaryRow label="No-show" value={reviewDash(noShow)} />
            <SummaryRow label="Early departure" value={reviewDash(earlyDeparture)} />
            {!group && reservation.purposeOfStay ? (
              <SummaryRow label="Purpose" value={reviewDash(reservation.purposeOfStay)} />
            ) : null}
          </div>
        </details>
      </div>
    </aside>
  );
}

function DateTile({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7A6B58]">
        {label}
      </p>
      <p className="text-sm font-bold text-[#4a2c1a]">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1 text-[#7A6B58]">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium text-[#4a2c1a]">{value}</span>
    </div>
  );
}