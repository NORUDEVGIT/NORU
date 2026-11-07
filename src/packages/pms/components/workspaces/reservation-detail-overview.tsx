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
import type { ReactNode } from "react";
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
import { guestRatePerNight } from "@/packages/pms/lib/room-charge-guest-total";
import {
  groupCombinedSubtotal,
  groupRoomRateSections,
} from "@/packages/pms/lib/reservation-detail-group";

type GuestBits = {
  profileNumber?: string | null;
  nationality?: string | null;
  idDocumentNumber?: string | null;
};

export type OverviewChargeLine = {
  name: string;
  detail?: string | null;
  amount?: number | null;
};

export function ReservationDetailOverviewDashboard({
  reservation,
  totalAmount,
  roomGuestTotal,
  packages = [],
  packagesTotal = 0,
  services = [],
  servicesTotal = 0,
  roomTax = 0,
  guest,
  createdBy,
  coverUrl,
  roomMeta,
  money,
  editable,
  catalogues,
  onEditTab,
  paymentReceived,
  depositReceived,
  folioBalance,
  roomFloor,
  roomBuilding,
}: {
  reservation: ReservationDetailOverviewInput;
  totalAmount?: number | null;
  roomGuestTotal?: number | null;
  packages?: OverviewChargeLine[];
  packagesTotal?: number;
  services?: OverviewChargeLine[];
  servicesTotal?: number;
  roomTax?: number;
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
  paymentReceived?: number | null;
  depositReceived?: number | null;
  folioBalance?: number | null;
  roomFloor?: string | null;
  roomBuilding?: string | null;
}) {
  const dash = DETAIL_DASH;
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const storedNightly = storedRatePerNight(
    reservation.nightlyRates,
    reservation.roomSubtotal,
    reservation.nights,
  );
  const guestRoomTotal = roomGuestTotal ?? reservation.roomSubtotal;
  const ratePerNight = guestRatePerNight(guestRoomTotal, reservation.nights) ?? storedNightly;
  const currency = reservation.currency;
  const moneyOrDash = (value: number | null | undefined) =>
    value == null ? dash : money(value, currency);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const segment = overviewCatalogueLabel(reservation.marketSegment, catalogues.segments);
  const _tags = reservationTags({
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
  const _infants = infantCount == null ? dash : String(infantCount);
  const cancellation =
    snapshotDisplayName(reservation.cancellationPolicySnapshot) ??
    snapshotField(reservation.refundabilitySnapshot, ["cancellation", "cancellation_policy"]);
  const noShow = overviewNoShowLabel(reservation.noShowPolicySnapshot);
  const earlyDeparture = earlyDepartureReservationLabel({
    snapshot: reservation.earlyDeparturePolicySnapshot,
    legacyRefundabilitySnapshot: reservation.refundabilitySnapshot,
  });
  const _refundability = overviewRefundabilityLabel(reservation.refundabilitySnapshot);
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
  const packageLabel = packages[0]?.name ?? null;
  const buildingFloor = [roomBuilding, roomFloor].filter(Boolean).join(" · ");
  const paymentRows: Array<[string, string]> = [
    ["Payment type", overviewPaymentLabel(reservation.guaranteeMethod)],
    ["Payment method", overviewPaymentLabel(deposit?.tenderCode ?? reservation.guaranteeMethod)],
    [
      "Deposit required",
      deposit?.required === false ? "Not required" : moneyOrDash(deposit?.amount ?? null),
    ],
    [
      "Deposit received",
      depositReceived == null ? "None" : money(depositReceived, currency),
    ],
  ];
  if (deposit?.required != null) {
    paymentRows.splice(2, 0, ["Requirement", deposit.required ? "Required" : "Not required"]);
  }
  if (deposit?.reference) paymentRows.push(["Reference", deposit.reference]);
  const sourceRows: Array<[string, string]> = [
    ["Source", sourceLabel],
    ["Channel", channel],
    ["Market Segment", segment],
    ["Company", overviewPartyName(reservation.companyName, reservation.companyMasterId)],
    ["Travel Agent", overviewPartyName(reservation.travelAgentName, reservation.travelAgentMasterId)],
    ["Group", overviewPartyName(reservation.groupName, reservation.groupAccountMasterId)],
    ["Booked By", bookedByLabel(reservation.bookerGuestId, reservation.guestId)],
    ["Created By", reviewDash(createdBy ?? reservation.createdByName)],
  ];
  const policyRows: Array<[string, string]> = [
    ["Cancellation", reviewDash(cancellation)],
    ["No-Show", reviewDash(noShow)],
    ["Early Departure", reviewDash(earlyDeparture)],
  ].filter(([, value]) => value !== dash);
  const balanceTone =
    folioBalance == null
      ? "text-[#251605]"
      : folioBalance > 0.009
        ? "text-[#9B2C2C]"
        : folioBalance < -0.009
          ? "text-[#1F6B3A]"
          : "text-[#1F6B3A]";
  void editable;
  void onEditTab;

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
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <OverviewCard
            title={groupReservation ? "Primary Guest / Booker" : "Guest Information"}
            icon={<UserRound className="size-4 text-[#B8954F]" />}
            testId="overview-card-guest"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-[11px] font-semibold text-[#765719]">
                {guestInitials(reservation.guestName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#251605]">
                  {reviewDash(reservation.guestName)}
                  {reservation.guestVip ? (
                    <span className="ml-1.5 rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#765719]">
                      VIP
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <OverviewFields
              rows={[
                ["Guest ID", reviewDash(guest?.profileNumber)],
                ["Phone", reviewDash(reservation.guestPhone)],
                ["Email", reviewDash(reservation.guestEmail)],
                ["Nationality", reviewDash(guest?.nationality)],
                ["ID Type / ID", maskIdNumber(guest?.idDocumentNumber) ?? "None"],
              ]}
            />
            <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs text-[#765719]">
              <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: reservation.guestId }}>
                View Full Profile
              </Link>
            </Button>
          </OverviewCard>

          <OverviewCard
            title="Stay & Accommodation"
            icon={<CalendarDays className="size-4 text-[#B8954F]" />}
            testId="overview-card-stay"
          >
            <OverviewFields
              rows={[
                ["Arrival", formatStayDate(reservation.arrivalDate)],
                ["Departure", formatStayDate(reservation.departureDate)],
                ["Nights", String(reservation.nights)],
                ["Adults / Children", `${adults} / ${children}${infantCount ? ` · ${infantCount} infants` : ""}`],
                ["Room Type", reviewDash(reservation.roomTypeName)],
                ["Assigned Room", assigned ? `Room ${reservation.roomNumber}` : "Not assigned"],
                ["Rate Plan", ratePlan],
                ...(packageLabel ? [["Package", packageLabel] as [string, string]] : []),
                ...(groupReservation ? [["Rooms", roomsCount] as [string, string]] : []),
                ...(reservation.purposeOfStay
                  ? [["Purpose", reservation.purposeOfStay] as [string, string]]
                  : []),
              ]}
            />
          </OverviewCard>

          <OverviewCard title="Requests & Notes" testId="overview-card-requests">
            <OverviewFields
              rows={[
                [
                  "Special Requests",
                  reservation.specialRequests?.trim() || "No special request.",
                ],
                ["Room Preferences", preferenceFromStay(reservation.specialRequests, "floor")],
                ["Internal Notes", reservation.notes?.trim() || "None"],
              ]}
            />
          </OverviewCard>
        </div>

        <div className="space-y-3">
          <OverviewCard
            title="Financial Summary"
            icon={<FileText className="size-4 text-[#B8954F]" />}
            testId="overview-card-rate"
          >
            {groupReservation ? (
              <div className="space-y-2 text-sm" data-testid="overview-group-rates">
                {groupRates.map((section) => (
                  <div key={section.sequence} className="text-xs">
                    <p className="font-medium text-[#251605]">
                      Room {section.sequence} · {section.ratePlanName}
                    </p>
                  </div>
                ))}
                <OverviewFields
                  rows={[
                    ["Room Charge", moneyOrDash(guestRoomTotal ?? groupCombinedSubtotal(reservation))],
                  ]}
                />
              </div>
            ) : (
              <OverviewFields
                rows={[
                  ["Room Charge", moneyOrDash(guestRoomTotal)],
                  ["Rate per Night", moneyOrDash(ratePerNight)],
                ]}
              />
            )}
            <OverviewChargeBlock
              label="Packages"
              lines={packages}
              total={packagesTotal}
              moneyOrDash={moneyOrDash}
              testId="overview-rate-packages"
            />
            <OverviewChargeBlock
              label="Extra Services"
              lines={services}
              total={servicesTotal}
              moneyOrDash={moneyOrDash}
              testId="overview-rate-services"
            />
            <OverviewFields
              rows={[
                ["Taxes & Fees", roomTax > 0 ? moneyOrDash(roomTax) : "None"],
                ["Total Amount", moneyOrDash(totalAmount ?? reservation.roomSubtotal)],
                ["Payments", paymentReceived == null ? "None" : money(paymentReceived, currency)],
                ["Deposit", depositReceived == null ? "None" : money(depositReceived, currency)],
              ]}
            />
            <p className={cn("text-sm font-semibold", balanceTone)}>
              Balance {folioBalance == null ? dash : money(folioBalance, currency)}
            </p>
          </OverviewCard>

          <OverviewCard
            title="Room Information"
            icon={<BedDouble className="size-4 text-[#B8954F]" />}
            testId="overview-card-room"
          >
            {groupReservation ? (
              <div className="space-y-1.5" data-testid="overview-group-rooms">
                {roomUnits.map((unit) => {
                  const primary = unit.occupants.find((occupant) => occupant.isPrimary);
                  return (
                    <div
                      key={unit.id}
                      className="rounded-[6px] border border-[#DDD4C5] bg-[#FBF7F1] px-2 py-1.5 text-xs"
                    >
                      <p className="font-medium text-[#251605]">
                        {unit.roomNumber ? `Room ${unit.roomNumber}` : `Room ${unit.unitSequence}`} ·{" "}
                        {unit.roomTypeName ?? "Room type"}
                      </p>
                      <p className="text-muted-foreground">{primary?.name ?? "No primary occupant"}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                {coverUrl ? (
                  <img src={coverUrl} alt="" className="h-10 w-14 rounded object-cover" />
                ) : null}
                <OverviewFields
                  rows={[
                    ["Room Number", assigned ? `Room ${reservation.roomNumber}` : "Not assigned"],
                    ["Room Type", reviewDash(reservation.roomTypeName)],
                    ...(buildingFloor ? [["Building / Floor", buildingFloor] as [string, string]] : []),
                    ["Operational", reservation.roomOperationalStatus?.trim() || "Not configured"],
                    ["Housekeeping", reservation.housekeepingStatus?.trim() || "Not configured"],
                  ]}
                />
              </>
            )}
          </OverviewCard>

          <OverviewCard
            title="Payment & Deposit"
            icon={<CreditCard className="size-4 text-[#B8954F]" />}
            testId="overview-card-guarantee"
          >
            <OverviewFields rows={paymentRows} omitEmpty />
          </OverviewCard>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <OverviewCard
          title="Booking Source & Classification"
          icon={<Share2 className="size-4 text-[#B8954F]" />}
          compact
          testId="overview-card-source"
        >
          <OverviewFields rows={sourceRows} omitEmpty />
        </OverviewCard>

        <OverviewCard title="Stay Policies" compact testId="overview-card-policies">
          {policyRows.length > 0 ? (
            <OverviewFields rows={policyRows} />
          ) : (
            <p className="text-sm text-muted-foreground">Not configured</p>
          )}
        </OverviewCard>
      </div>
      <div className="hidden" data-testid="overview-card-additional" />
    </div>
  );
}

function OverviewCard({
  title,
  icon,
  testId,
  compact,
  children,
}: {
  title: string;
  icon?: ReactNode;
  testId: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-[#DDD4C5] bg-white shadow-sm",
        compact ? "p-3" : "p-3.5",
      )}
      data-testid={testId}
    >
      <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold text-[#251605]">
        {icon}
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function OverviewFields({
  rows,
  omitEmpty = false,
}: {
  rows: Array<[string, string]>;
  omitEmpty?: boolean;
}) {
  const visible = omitEmpty
    ? rows.filter(([, value]) => {
        const trimmed = value.trim();
        return trimmed && trimmed !== DETAIL_DASH && trimmed !== OVERVIEW_LABEL_UNAVAILABLE;
      })
    : rows;
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <dl className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-3 gap-y-1.5">
      {visible.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm text-[#251605]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OverviewChargeBlock({
  label,
  lines,
  total,
  moneyOrDash,
  testId,
}: {
  label: string;
  lines: OverviewChargeLine[];
  total: number;
  moneyOrDash: (value: number | null | undefined) => string;
  testId: string;
}) {
  if (lines.length === 0) {
    return (
      <OverviewFields
        rows={[[label, DETAIL_DASH]]}
      />
    );
  }
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-[#251605]">{moneyOrDash(total)}</p>
      </div>
      <ul className="space-y-1">
        {lines.map((line, index) => (
          <li
            key={`${line.name}-${index}`}
            className="flex items-start justify-between gap-3 text-xs text-[#251605]"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{line.name}</span>
              {line.detail ? (
                <span className="block text-[11px] text-muted-foreground">{line.detail}</span>
              ) : null}
            </span>
            <span className="shrink-0">{line.amount == null ? DETAIL_DASH : moneyOrDash(line.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
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
