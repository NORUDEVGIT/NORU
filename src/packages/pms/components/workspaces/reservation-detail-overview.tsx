import type { ReactNode } from "react";
import { BedDouble, CalendarDays, CreditCard, FileText, Share2, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  bookedByLabel,
  channelLabel,
  DETAIL_DASH,
  depositStatusLabel,
  detailGuaranteeCardNumber,
  parseDepositRequirementSnapshot,
  preferenceFromStay,
  reservationTags,
  snapshotDisplayName,
  snapshotField,
  sourceLabel,
  storedRatePerNight,
  type DetailWorkspaceTab,
  type ReservationDetailOverviewInput,
} from "@/packages/pms/lib/reservation-detail-overview";

type GuestBits = {
  profileNumber?: string | null;
  nationality?: string | null;
  idDocumentNumber?: string | null;
};

export function ReservationDetailOverviewDashboard({
  reservation,
  guest,
  createdBy,
  coverUrl,
  roomMeta,
  money,
  onEditTab,
}: {
  reservation: ReservationDetailOverviewInput;
  guest: GuestBits | null;
  createdBy: string | null;
  coverUrl: string | null;
  roomMeta: { occupancy?: string | null; beds?: string | null } | null;
  money: (value: number, currency?: string | null) => string;
  onEditTab: (tab: DetailWorkspaceTab) => void;
}) {
  const dash = DETAIL_DASH;
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const ratePerNight = storedRatePerNight(
    reservation.nightlyRates,
    reservation.roomSubtotal,
    reservation.nights,
  );
  const currency = reservation.currency;
  const moneyOrDash = (value: number | null | undefined) =>
    value == null ? dash : money(value, currency);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const tags = reservationTags({
    guestVip: reservation.guestVip,
    marketSegment: reservation.marketSegment,
    source: reservation.source,
  });
  const roomsCount = reservation.roomsRequested == null ? dash : String(reservation.roomsRequested);
  const infants = reservation.infants == null ? dash : String(reservation.infants);
  const cancellation =
    snapshotDisplayName(reservation.cancellationPolicySnapshot) ??
    snapshotField(reservation.refundabilitySnapshot, ["cancellation", "cancellation_policy"]);
  const noShow =
    snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy", "noshow"]) ??
    snapshotField(reservation.cancellationPolicySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const vipTreatment = reservation.guestVip ? "Yes" : dash;

  return (
    <div className="space-y-3" data-testid="reservation-detail-overview">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard
          title="Guest Information"
          icon={<UserRound className="size-4 text-[#B8954F]" />}
          onEdit={() => onEditTab("guest")}
          testId="overview-card-guest"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-sm font-semibold text-[#765719]">
              {guestInitials(reservation.guestName)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-[#251605]">{reviewDash(reservation.guestName)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {reservation.guestVip ? (
                  <span className="inline-flex rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">
                    VIP
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <OverviewFields
            rows={[
              ["Guest ID", reviewDash(guest?.profileNumber)],
              ["Phone", reviewDash(reservation.guestPhone)],
              ["Email", reviewDash(reservation.guestEmail)],
              ["Nationality", reviewDash(guest?.nationality)],
              ["ID / Passport", maskIdNumber(guest?.idDocumentNumber) ?? dash],
            ]}
          />
          <Button asChild variant="link" size="sm" className="h-auto px-0 text-[#765719]">
            <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: reservation.guestId }}>
              View Full Profile
            </Link>
          </Button>
        </OverviewCard>

        <OverviewCard
          title="Stay Information"
          icon={<CalendarDays className="size-4 text-[#B8954F]" />}
          onEdit={() => onEditTab("stay")}
          testId="overview-card-stay"
        >
          <OverviewFields
            rows={[
              ["Arrival Date", formatStayDate(reservation.arrivalDate)],
              ["Departure Date", formatStayDate(reservation.departureDate)],
              ["Nights", String(reservation.nights)],
              ["Rooms", roomsCount],
              ["Adults", String(reservation.adults)],
              ["Children", String(reservation.children)],
              ["Infants", infants],
              ["Purpose of Stay", reviewDash(reservation.purposeOfStay)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Room Information"
          icon={<BedDouble className="size-4 text-[#B8954F]" />}
          onEdit={() => onEditTab("rooms")}
          testId="overview-card-room"
        >
          <div className="flex gap-3">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-16 w-20 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
                <BedDouble className="size-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-[#251605]">{reviewDash(reservation.roomTypeName)}</p>
              <p className="text-xs text-muted-foreground">
                {assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}
              </p>
            </div>
          </div>
          <OverviewFields
            rows={[
              ["Room Assignment", assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"],
              ["Room Type", reviewDash(reservation.roomTypeName)],
              ["Rate Plan", reviewDash(reservation.ratePlanName ?? reservation.ratePlanId)],
              ["Occupancy", reviewDash(roomMeta?.occupancy)],
              ["Beds", reviewDash(roomMeta?.beds)],
              ["Operational", reviewDash(reservation.roomOperationalStatus)],
              ["Housekeeping", reviewDash(reservation.housekeepingStatus)],
            ]}
          />
        </OverviewCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard
          title="Booking Source & Classification"
          icon={<Share2 className="size-4 text-[#B8954F]" />}
          testId="overview-card-source"
        >
          <OverviewFields
            rows={[
              ["Source", sourceLabel(reservation.source, reservation.commercialBookingSource)],
              ["Channel", channelLabel(reservation.source, reservation.salesChannel)],
              ["Market Segment", reviewDash(reservation.marketSegment)],
              ["Company", reviewDash(reservation.companyName)],
              ["Travel Agent", reviewDash(reservation.travelAgentName)],
              ["Group", reviewDash(reservation.groupName)],
              ["Booked by", bookedByLabel(reservation.bookerGuestId, reservation.guestId)],
              ["Created by", reviewDash(createdBy ?? reservation.createdByName)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Rate & Financial Summary"
          icon={<FileText className="size-4 text-[#B8954F]" />}
          onEdit={() => onEditTab("rates")}
          testId="overview-card-rate"
        >
          <OverviewFields
            rows={[
              ["Rate Plan", reviewDash(reservation.ratePlanName ?? reservation.ratePlanId)],
              ["Rate per Night", moneyOrDash(ratePerNight)],
              ["Nights", String(reservation.nights)],
              ["Room Total", moneyOrDash(reservation.roomSubtotal)],
              ["Packages", dash],
              ["Extra Services", dash],
              ["Taxes & Fees", dash],
              ["Total Amount", moneyOrDash(reservation.roomSubtotal)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Guarantee & Deposit"
          icon={<CreditCard className="size-4 text-[#B8954F]" />}
          testId="overview-card-guarantee"
        >
          <OverviewFields
            rows={[
              ["Guarantee Type", reviewDash(reservation.guaranteeMethod)],
              ["Card Number", detailGuaranteeCardNumber(reservation.guaranteeMethod)],
              ["Card Holder Name", dash],
              ["Expiry Date", dash],
              [
                "Deposit Required",
                deposit?.required == null ? dash : deposit.required ? "Yes" : "No",
              ],
              ["Deposit Amount", moneyOrDash(deposit?.amount ?? null)],
              ["Due Date", dash],
              ["Payment Method", reviewDash(deposit?.tenderCode ?? reservation.guaranteeMethod)],
              ["Deposit Status", depositStatusLabel(deposit)],
            ]}
          />
        </OverviewCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard title="Policies" testId="overview-card-policies">
          <OverviewFields
            rows={[
              ["Cancellation Policy", reviewDash(cancellation)],
              ["No-Show Policy", reviewDash(noShow)],
              ["Early Departure Policy", reviewDash(earlyDeparture)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Special Requests & Preferences"
          onEdit={() => onEditTab("requests")}
          testId="overview-card-requests"
        >
          <OverviewFields
            rows={[
              ["Special Requests", reviewDash(reservation.specialRequests)],
              ["Room Preferences", preferenceFromStay(reservation.specialRequests, "floor")],
              ["VIP Treatment", vipTreatment],
              ["Late Check-in", preferenceFromStay(reservation.specialRequests, "late check")],
              ["Early Check-in", preferenceFromStay(reservation.specialRequests, "early check")],
              ["Connecting Rooms", preferenceFromStay(reservation.specialRequests, "connecting")],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Additional Information"
          onEdit={() => onEditTab("notes")}
          testId="overview-card-additional"
        >
          <OverviewFields
            rows={[
              ["Internal Notes", reviewDash(reservation.notes)],
              ["External Notes", dash],
              ["Last Updated", formatStayDate(reservation.updatedAt.slice(0, 10))],
            ]}
          />
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <span className="text-sm text-[#251605]">{dash}</span>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex rounded-full bg-[#F4E9D0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]"
                  >
                    {tag}
                  </span>
                ))
              )}
            </dd>
          </div>
        </OverviewCard>
      </div>
    </div>
  );
}

function OverviewCard({
  title,
  icon,
  onEdit,
  testId,
  children,
}: {
  title: string;
  icon?: ReactNode;
  onEdit?: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base text-[#251605]">
          {icon}
          {title}
        </h2>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-[#765719] hover:underline"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function OverviewFields({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-3 gap-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm text-[#251605]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReservationDetailKpiStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string | null }>;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 border-b border-[#DDD4C5] bg-[#FBF8F2] px-4 py-3 sm:grid-cols-3 xl:grid-cols-6"
      data-testid="reservation-detail-kpi"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-0 rounded-lg border border-[#E8DFD0] bg-white px-3 py-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-0.5 truncate font-display text-lg text-[#251605]">{item.value}</p>
          {item.hint ? (
            <p className={cn("truncate text-[11px]", hintTone(item.hint))}>{item.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function hintTone(hint: string): string {
  const lower = hint.toLowerCase();
  if (lower.includes("not assigned") || lower.includes("pending") || lower.includes("required")) {
    return "text-amber-700";
  }
  if (lower.includes("due in") || lower.includes("confirmed")) return "text-emerald-700";
  return "text-muted-foreground";
}
