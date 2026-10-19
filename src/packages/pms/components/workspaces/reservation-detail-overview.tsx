import {
  BedDouble,
  Calendar,
  CalendarDays,
  Coins,
  CreditCard,
  DoorOpen,
  FileText,
  Moon,
  Share2,
  UserRound,
  Wallet,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import { maskIdNumber } from "@/packages/pms/lib/guest-profile-wave2";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  bookedByLabel,
  DETAIL_DASH,
  OVERVIEW_LABEL_UNAVAILABLE,
  overviewBookingSourceLabel,
  overviewCatalogueLabel,
  overviewChannelLabel,
  overviewNoShowLabel,
  overviewPartyName,
  overviewPaymentLabel,
  overviewRefundabilityLabel,
  parseDepositRequirementSnapshot,
  preferenceFromStay,
  reservationTags,
  snapshotDisplayName,
  snapshotField,
  storedRatePerNight,
  type DetailWorkspaceTab,
  type OverviewCatalogueRow,
  type ReservationDetailOverviewInput,
} from "@/packages/pms/lib/reservation-detail-overview";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import {
  groupCombinedSubtotal,
  groupRoomRateSections,
} from "@/packages/pms/lib/reservation-detail-group";

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
  editable,
  catalogues,
  onEditTab,
}: {
  reservation: ReservationDetailOverviewInput;
  guest: GuestBits | null;
  createdBy: string | null;
  coverUrl: string | null;
  roomMeta: { occupancy?: string | null; beds?: string | null } | null;
  money: (value: number, currency?: string | null) => string;
  editable: boolean;
  catalogues: {
    sources: OverviewCatalogueRow[];
    channels: OverviewCatalogueRow[];
    segments: OverviewCatalogueRow[];
    distributionChannels?: { id: string; name: string }[];
  };
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
  const segment = overviewCatalogueLabel(reservation.marketSegment, catalogues.segments);
  const tags = reservationTags({
    guestVip: reservation.guestVip,
    marketSegment:
      segment === DETAIL_DASH || segment === OVERVIEW_LABEL_UNAVAILABLE ? null : segment,
    source: reservation.source,
  });
  const roomUnits = reservation.rooms ?? [];
  const groupReservation = reservation.reservationMode === "group" || roomUnits.length > 1;
  const groupRates = groupReservation ? groupRoomRateSections(reservation) : [];
  const activeRoomUnits = roomUnits.filter(
    (unit) => unit.status !== "cancelled" && unit.status !== "no_show",
  );
  const roomsCount =
    roomUnits.length > 0
      ? String(roomUnits.length)
      : reservation.roomsRequested == null
        ? dash
        : String(reservation.roomsRequested);
  const adults = groupReservation
    ? activeRoomUnits.reduce((sum, unit) => sum + unit.adults, 0)
    : reservation.adults;
  const children = groupReservation
    ? activeRoomUnits.reduce((sum, unit) => sum + unit.children, 0)
    : reservation.children;
  const infantCount = groupReservation
    ? activeRoomUnits.reduce((sum, unit) => sum + unit.infants, 0)
    : reservation.infants;
  const infants = infantCount == null ? dash : String(infantCount);
  const cancellation =
    snapshotDisplayName(reservation.cancellationPolicySnapshot) ??
    snapshotField(reservation.refundabilitySnapshot, ["cancellation", "cancellation_policy"]);
  const noShow = overviewNoShowLabel(reservation.noShowPolicySnapshot);
  const earlyDeparture = earlyDepartureReservationLabel({
    snapshot: reservation.earlyDeparturePolicySnapshot,
    legacyRefundabilitySnapshot: reservation.refundabilitySnapshot,
  });
  const refundability = overviewRefundabilityLabel(reservation.refundabilitySnapshot);
  const sourceLabel = overviewBookingSourceLabel(
    reservation.source,
    reservation.commercialBookingSource,
    catalogues.sources,
  );
  const channel = overviewChannelLabel(
    reservation.source,
    reservation.salesChannel,
    catalogues.channels,
    catalogues.distributionChannels,
  );
  const ratePlan = overviewPartyName(reservation.ratePlanName, reservation.ratePlanId);
  const vipTreatment = reservation.guestVip ? "Yes" : dash;
  const editTab = (tab: DetailWorkspaceTab) => (editable ? () => onEditTab(tab) : undefined);
  const paymentRows: Array<[string, string]> = [
    ["Payment Type", overviewPaymentLabel(reservation.guaranteeMethod)],
    ["Payment Method", overviewPaymentLabel(deposit?.tenderCode ?? reservation.guaranteeMethod)],
    ["Deposit Required", deposit?.required == null ? dash : deposit.required ? "Yes" : "No"],
    ["Deposit Amount", moneyOrDash(deposit?.amount ?? null)],
  ];
  if (deposit?.reference) paymentRows.push(["Payment Reference", deposit.reference]);

  return (
    <div className="space-y-3" data-testid="reservation-detail-overview">
      {groupReservation ? (
        <div
          className="inline-flex items-center gap-2 rounded-[6px] border border-[#CCC] bg-white px-3 py-1.5 text-xs"
          data-testid="overview-reservation-type"
        >
          <span className="text-muted-foreground">Reservation Type</span>
          <span className="font-medium text-[#251605]">Group Reservation</span>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard
          title={groupReservation ? "Primary Guest / Booker" : "Guest Information"}
          icon={<UserRound className="size-4 text-[#B8954F]" />}
          onEdit={editTab("guest")}
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
          onEdit={editTab("stay")}
          testId="overview-card-stay"
        >
          <OverviewFields
            rows={[
              ["Arrival Date", formatStayDate(reservation.arrivalDate)],
              ["Departure Date", formatStayDate(reservation.departureDate)],
              ["Nights", String(reservation.nights)],
              ["Rooms", roomsCount],
              ["Adults", String(adults)],
              ["Children", String(children)],
              ["Infants", infants],
              ["Purpose of Stay", reviewDash(reservation.purposeOfStay)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Room Information"
          icon={<BedDouble className="size-4 text-[#B8954F]" />}
          onEdit={editTab("rooms")}
          testId="overview-card-room"
        >
          {groupReservation ? (
            <div className="space-y-2" data-testid="overview-group-rooms">
              <p className="text-xs text-muted-foreground">
                {roomUnits.length} room units. Open Rooms to manage occupants and operational
                actions.
              </p>
              {roomUnits.map((unit) => {
                const primary = unit.occupants.find((occupant) => occupant.isPrimary);
                return (
                  <div
                    key={unit.id}
                    className="rounded-[6px] border border-[#DDD4C5] bg-[#FBF7F1] px-2 py-1.5 text-xs"
                  >
                    <p className="font-medium text-[#251605]">
                      Room {unit.unitSequence} · {unit.roomTypeName ?? "Room type"}
                    </p>
                    <p className="text-muted-foreground">
                      {primary?.name ?? "No primary occupant"} ·{" "}
                      {unit.ratePlanName ?? "No rate plan"}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
                    <BedDouble className="size-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-[#251605]">
                    {reviewDash(reservation.roomTypeName)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}
                  </p>
                </div>
              </div>
              <OverviewFields
                rows={[
                  ["Room Assignment", assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"],
                  ["Room Type", reviewDash(reservation.roomTypeName)],
                  ["Rate Plan", ratePlan],
                  ["Occupancy", reviewDash(roomMeta?.occupancy)],
                  ["Beds", reviewDash(roomMeta?.beds)],
                  ["Operational", reviewDash(reservation.roomOperationalStatus)],
                  ["Housekeeping", reviewDash(reservation.housekeepingStatus)],
                ]}
              />
            </>
          )}
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
              ["Source", sourceLabel],
              ["Channel", channel],
              ["Market Segment", segment],
              ["Company", overviewPartyName(reservation.companyName, reservation.companyMasterId)],
              [
                "Travel Agent",
                overviewPartyName(reservation.travelAgentName, reservation.travelAgentMasterId),
              ],
              ["Group", overviewPartyName(reservation.groupName, reservation.groupAccountMasterId)],
              ["Booked by", bookedByLabel(reservation.bookerGuestId, reservation.guestId)],
              ["Created by", reviewDash(createdBy ?? reservation.createdByName)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Rate & Financial Summary"
          icon={<FileText className="size-4 text-[#B8954F]" />}
          onEdit={editTab("rates")}
          testId="overview-card-rate"
        >
          {groupReservation ? (
            <div className="space-y-2 text-sm" data-testid="overview-group-rates">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Rate Plans
              </p>
              <p className="text-xs text-muted-foreground">
                {groupRates.length} room-specific plans
              </p>
              {groupRates.map((section) => (
                <div key={section.sequence} className="text-xs">
                  <p className="font-medium text-[#251605]">
                    Room {section.sequence} · {section.ratePlanName}
                  </p>
                  <p className="text-muted-foreground">
                    {section.uniformRate == null
                      ? "Room-specific nightly rates"
                      : `${money(section.uniformRate, currency)} / night`}
                  </p>
                </div>
              ))}
              <p className="font-medium text-[#251605]">
                Combined Room Total {moneyOrDash(groupCombinedSubtotal(reservation))}
              </p>
            </div>
          ) : (
            <OverviewFields
              rows={[
                ["Rate Plan", ratePlan],
                ["Rate per Night", moneyOrDash(ratePerNight)],
                ["Nights", String(reservation.nights)],
                ["Room Total", moneyOrDash(reservation.roomSubtotal)],
                ["Packages", dash],
                ["Extra Services", dash],
                ["Taxes & Fees", dash],
                ["Total Amount", moneyOrDash(reservation.roomSubtotal)],
              ]}
            />
          )}
        </OverviewCard>

        <OverviewCard
          title="Payment & Deposit"
          icon={<CreditCard className="size-4 text-[#B8954F]" />}
          testId="overview-card-guarantee"
        >
          <OverviewFields rows={paymentRows} />
        </OverviewCard>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <OverviewCard title="Stay Policies" testId="overview-card-policies">
          <OverviewFields
            rows={[
              ["Cancellation Policy", reviewDash(cancellation)],
              ["No-Show Policy", reviewDash(noShow)],
              ["Early Departure Policy", reviewDash(earlyDeparture)],
              ["Refundability", reviewDash(refundability)],
            ]}
          />
        </OverviewCard>

        <OverviewCard
          title="Special Requests & Preferences"
          onEdit={editTab("requests")}
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
          onEdit={editTab("notes")}
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

export type ReservationDetailKpiItem = {
  label: string;
  value: string;
  hint?: string | null;
  icon?: React.ReactNode;
  iconBg?: string;
};

function getKpiIconFallback(label: string): { icon: React.ReactNode; iconBg: string } {
  const lower = label.toLowerCase();
  if (lower.includes("arrive")) {
    return {
      icon: <Calendar className="size-4 text-[#2563EB]" />,
      iconBg: "bg-[#EAF2FD]",
    };
  }
  if (lower.includes("status")) {
    return {
      icon: <BedDouble className="size-4 text-[#16A34A]" />,
      iconBg: "bg-[#EAF7EE]",
    };
  }
  if (lower.includes("night")) {
    return {
      icon: <Moon className="size-4 text-[#7C3AED]" />,
      iconBg: "bg-[#F1EFFD]",
    };
  }
  if (lower.includes("room")) {
    return {
      icon: <DoorOpen className="size-4 text-[#6366F1]" />,
      iconBg: "bg-[#ECE9FB]",
    };
  }
  if (lower.includes("total amount") || lower.includes("subtotal")) {
    return {
      icon: <FileText className="size-4 text-[#8C6D3B]" />,
      iconBg: "bg-[#F7F2EA]",
    };
  }
  if (lower.includes("payment")) {
    return {
      icon: <Wallet className="size-4 text-[#16A34A]" />,
      iconBg: "bg-[#EAF7EE]",
    };
  }
  if (lower.includes("deposit")) {
    return {
      icon: <Coins className="size-4 text-[#D97706]" />,
      iconBg: "bg-[#FDF3E3]",
    };
  }
  return {
    icon: <FileText className="size-4 text-[#8C7A6B]" />,
    iconBg: "bg-[#F4EFE6]",
  };
}

export function ReservationDetailKpiStrip({ items }: { items: ReservationDetailKpiItem[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-2.5 border-b border-[#DDD4C5] bg-[#FBF8F2] px-4 py-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7"
      data-testid="reservation-detail-kpi"
    >
      {items.map((item) => {
        const fallback = getKpiIconFallback(item.label);
        const icon = item.icon ?? fallback.icon;
        const iconBg = item.iconBg ?? fallback.iconBg;
        return (
          <div
            key={item.label}
            className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#E8DFD0] bg-white p-2.5 shadow-2xs"
          >
            {icon ? (
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10",
                  iconBg,
                )}
              >
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8C7A6B]">
                {item.label}
              </p>
              <p className="mt-0.5 truncate font-display text-base font-bold text-[#251605]">
                {item.value}
              </p>
              {item.hint ? (
                <p className={cn("truncate text-[11px]", hintTone(item.hint))}>{item.hint}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function hintTone(hint: string): string {
  const lower = hint.toLowerCase();
  if (lower.includes("not assigned") || lower.includes("required")) {
    return "text-[#C2410C] font-medium";
  }
  if (lower.includes("pending")) {
    return "text-amber-700 font-medium";
  }
  if (lower.includes("due in") || lower.includes("confirmed") || lower.includes("% of total")) {
    return "text-[#15803D] font-medium";
  }
  return "text-muted-foreground";
}
