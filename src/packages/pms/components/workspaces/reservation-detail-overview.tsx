import type { ReactNode } from "react";
import { BedDouble, User, Wallet } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  DETAIL_DASH,
  depositStatusLabel,
  overviewChannelLabel,
  parseDepositRequirementSnapshot,
  storedRatePerNight,
  type DetailWorkspaceTab,
  type OverviewCatalogueRow,
  type ReservationDetailOverviewInput,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  groupCombinedSubtotal,
  groupOccupancyTotals,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";

type GuestBits = {
  profileNumber?: string | null;
  nationality?: string | null;
  idDocumentType?: string | null;
  idDocumentNumber?: string | null;
};

/**
 * Simple reservation overview: Guest Information, Stay & Accommodation and
 * Financials & Folio Summary. Props stay compatible with the old dashboard so
 * callers don't change; onAssignRoom / onChangeRoom are optional.
 */
export function ReservationDetailOverviewDashboard({
  reservation,
  guest,
  roomMeta,
  money,
  editable,
  catalogues,
  onEditTab,
  onAssignRoom,
}: {
  reservation: ReservationDetailOverviewInput;
  guest: GuestBits | null;
  createdBy?: string | null;
  coverUrl?: string | null;
  roomMeta: { occupancy?: string | null; beds?: string | null } | null;
  money: (value: number, currency?: string | null) => string;
  editable: boolean;
  catalogues: {
    sources?: OverviewCatalogueRow[];
    channels: OverviewCatalogueRow[];
    segments?: OverviewCatalogueRow[];
    distributionChannels?: { id: string; name: string }[];
  };
  onEditTab: (tab: DetailWorkspaceTab) => void;
  onAssignRoom?: () => void;
}) {
  const currency = reservation.currency;
  const fmt = (value: number) => money(value, currency);

  const group = isGroupReservation(reservation as never);
  const occupancy = groupOccupancyTotals(reservation as never);
  // Group reservations manage rooms per unit in the Rooms tab.
  const assignRoom = () => (group || !onAssignRoom ? onEditTab("rooms") : onAssignRoom());

  const nights =
    reservation.nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const ratePerNight = storedRatePerNight(
    reservation.nightlyRates,
    reservation.roomSubtotal,
    reservation.nights,
  );
  const total = group ? groupCombinedSubtotal(reservation as never) : reservation.roomSubtotal;
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const channel = overviewChannelLabel(
    reservation.source,
    reservation.salesChannel,
    catalogues.channels,
    catalogues.distributionChannels,
  );

  const guestsLine = group
    ? `${occupancy.rooms} Rooms · ${occupancy.adults} Adults${
        occupancy.children ? ` · ${occupancy.children} Children` : ""
      }`
    : `${nights} Night${nights === 1 ? "" : "s"} · ${reservation.adults} Adult${
        reservation.adults === 1 ? "" : "s"
      }${reservation.children ? ` · ${reservation.children} Children` : ""}`;

  const roomCategory = group
    ? `${occupancy.rooms} rooms`
    : `${reviewDash(reservation.roomTypeName)}${
        ratePerNight == null ? "" : ` (${fmt(ratePerNight)} / night)`
      }`;

  return (
    <div className="space-y-4" data-testid="reservation-detail-overview">
      <OverviewCard
        icon={<User className="size-4 text-[#C9A227]" />}
        title="Guest Information"
        right={
          channel ? (
            <span className="text-[11px] text-gray-500">
              Channel: <span className="font-semibold text-gray-900">{channel}</span>
            </span>
          ) : null
        }
        testId="overview-card-guest"
      >
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <OverviewItem label="Full Name" value={reviewDash(reservation.guestName)} strong />
          <OverviewItem label="Nationality" value={reviewDash(guest?.nationality)} />
          <OverviewItem label="Phone" value={reviewDash(reservation.guestPhone)} />
          <OverviewItem label="Email" value={reviewDash(reservation.guestEmail)} />
          <OverviewItem label="Document Type" value={reviewDash(guest?.idDocumentType)} />
        </div>
      </OverviewCard>

      <OverviewCard
        icon={<BedDouble className="size-4 text-[#C9A227]" />}
        title="Stay & Accommodation"
        right={
          editable && !assigned ? (
            <button
              type="button"
              onClick={assignRoom}
              className="text-xs font-semibold text-[#C9A227] hover:underline"
            >
              Assign Room
            </button>
          ) : null
        }
        testId="overview-card-stay"
      >
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <OverviewItem
            label="Arrival Date"
            value={formatStayDate(reservation.arrivalDate)}
            strong
          />
          <OverviewItem
            label="Departure Date"
            value={formatStayDate(reservation.departureDate)}
            strong
          />
          <OverviewItem label="Duration & Guests" value={guestsLine} strong />
          <div>
            <p className="text-xs text-gray-500">Assigned Unit</p>
            <span
              className={cn(
                "mt-1 inline-block rounded-md border border-[#C9A227]/50 px-2 py-0.5 text-xs font-bold",
                assigned ? "bg-[#C9A227]/10 text-gray-900" : "bg-[#fff8dc] text-[#8C6D23]",
              )}
            >
              {group
                ? `${occupancy.rooms} rooms`
                : assigned
                  ? `Room ${reservation.roomNumber}`
                  : "Unassigned Unit"}
            </span>
          </div>
          <OverviewItem
            label="Room Category"
            value={`${roomCategory}${roomMeta?.occupancy ? ` · ${roomMeta.occupancy}` : ""}`}
            strong
          />
        </div>
      </OverviewCard>

      <OverviewCard
        icon={<Wallet className="size-4 text-[#C9A227]" />}
        title="Financials & Folio Summary"
        right={<ReservationStatusBadge status={reservation.status as never} />}
        testId="overview-card-rate"
      >
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center">
          <OverviewStat label="Room Total" value={total == null ? DETAIL_DASH : fmt(total)} />
          <OverviewStat
            label="Deposit"
            value={deposit?.amount == null ? DETAIL_DASH : fmt(deposit.amount)}
          />
          <OverviewStat label="Deposit Status" value={depositStatusLabel(deposit)} />
        </div>
      </OverviewCard>
    </div>
  );
}

function OverviewCard({
  icon,
  title,
  right,
  testId,
  children,
}: {
  icon: ReactNode;
  title: string;
  right?: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-800">
          {icon}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function OverviewItem({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("break-words text-sm text-gray-900", strong && "font-bold")}>{value}</p>
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
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