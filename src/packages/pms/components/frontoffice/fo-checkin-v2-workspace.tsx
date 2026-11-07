/**
 * Shared Check-In workspace — Guest & Reservation, Registration, Payment, Agreement, and Review.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Home,
  Mail,
  Phone,
  RefreshCw,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useMoney, useRestaurantTimezone } from "@/core/state/property-format";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  FoCheckInV2Registration,
  type CheckInRegistrationHandle,
} from "@/packages/pms/components/frontoffice/fo-checkin-v2-registration";
import { FoCheckInV2Payment } from "@/packages/pms/components/frontoffice/fo-checkin-v2-payment";
import { FoCheckInV2Key } from "@/packages/pms/components/frontoffice/fo-checkin-v2-key";
import {
  FoCheckInV2Agreement,
  type CheckInAgreementActions,
  type CheckInAgreementHandle,
} from "@/packages/pms/components/frontoffice/fo-checkin-v2-agreement";
import {
  FoCheckInV2Review,
  type CheckInReviewActions,
  type CheckInReviewHandle,
} from "@/packages/pms/components/frontoffice/fo-checkin-v2-review";
import {
  registrationCompletionProjection,
  type RegistrationCompletionProjection,
} from "@/packages/pms/lib/fo-check-in-readiness";
import type { CheckInPaymentSummary } from "@/packages/pms/lib/fo-checkin-v2-payment-model";
import type { CheckInAgreementSummary } from "@/packages/pms/lib/fo-checkin-v2-agreement-model";
import { unitAlreadyCheckedIn } from "@/packages/pms/lib/fo-checkin-v2-review-model";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import {
  CHECKIN_V2_STEPS,
  FO_CHECKIN_V2_SHEET_CLASS,
  checkInRoomReadiness,
  checkInStep1Presentation,
  classifyCheckInUnitFailure,
  guestAddressSummary,
  projectCheckInStep1Readiness,
  registrationProgressLabel,
  uniformNightlyAmount,
  type CheckInRoomChip,
  type CheckInV2StepId,
} from "@/packages/pms/lib/fo-checkin-v2-model";
import { FO_CHECK_IN_POLL_MS, foOperationalQueryOptions } from "@/packages/pms/lib/fo-freshness";
import { getCheckInReadiness } from "@/packages/pms/lib/fo-check-in-readiness.functions";
import {
  getCheckInUnit,
  type CheckInUnitRead,
} from "@/packages/pms/lib/fo-check-in-unit.functions";
import type { CheckInSiblingUnit } from "@/packages/pms/lib/fo-check-in-unit";
import {
  getGuest,
  getGuestStayOverview,
  guestListItems,
  listGuests,
} from "@/packages/pms/lib/guests.functions";
import {
  CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
  CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  roomOccupantCapacity,
  roomOccupantsMutable,
} from "@/packages/pms/lib/reservation-room-occupants";
import {
  assignReservationRoom,
  getReservation,
  listCheckInRoomCandidates,
  manageReservationRoomGuest,
  type CheckInRoomCandidate,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import {
  NO_FOLIO_LABEL,
  type ReservationCashieringSummary,
} from "@/packages/pms/lib/reservation-cashiering-summary";
import { getReservationCashieringSummary } from "@/packages/pms/lib/fo-check-in.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { usePackageChargeRules } from "@/packages/pms/lib/use-package-charge-rules";
import { useReservationServiceCharges } from "@/packages/pms/lib/use-reservation-service-charges";
import { serviceLineDetail } from "@/packages/pms/lib/reservation-service-lines";
import { packageChargeFigures } from "@/packages/pms/lib/room-charge-guest-total";
import { SHELL_ICON_BUTTON, SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Input } from "@/shared/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

function moneyText(money: (amount: number) => string, amount: number | null): string | null {
  if (amount == null) return null;
  return money(amount);
}

function ledgerFigure(amount: number | null | undefined, money: (value: number) => string): string {
  if (amount === undefined) return "—";
  if (amount === null) return NO_FOLIO_LABEL;
  return money(amount);
}

function physicalRoomLabel(status: string | null): string {
  if (status === "available") return "Physically available";
  if (status === "out_of_order") return "Out of order";
  if (status === "out_of_service") return "Out of service";
  if (!status) return "Physical status unavailable";
  return status.replaceAll("_", " ");
}

function SectionCard({
  title,
  icon,
  children,
  testId,
  actions,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  testId?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#DDD4C5] bg-white" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 border-b border-[#E8DFD0] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center text-[#8B6914]">
              {icon}
            </span>
          ) : null}
          <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
            {title}
          </h3>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
        ) : null}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function FieldRow({
  label,
  value,
  stacked,
}: {
  label: string;
  value: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="py-0.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">{label}</dt>
        <dd className="mt-0.5 min-w-0 text-sm font-medium text-[#251605]">{value}</dd>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-0.5 text-sm">
      <dt className="text-[#6B5E4E]">{label}</dt>
      <dd className="min-w-0 font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

function StatusChip({ label }: { label: CheckInRoomChip }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#436436]/15 px-2.5 py-0.5 text-xs font-semibold text-[#436436]">
      <Check className="size-3" />
      {label}
    </span>
  );
}

function StepRail({
  currentStep,
  complete,
  registrationCompletion,
  paymentRecorded,
  agreementSigned,
}: {
  currentStep: CheckInV2StepId;
  complete: boolean;
  registrationCompletion: RegistrationCompletionProjection | null;
  paymentRecorded: boolean;
  agreementSigned: boolean;
}) {
  const currentIndex = CHECKIN_V2_STEPS.findIndex((step) => step.id === currentStep);
  return (
    <nav
      aria-label="Check-In steps"
      className="flex h-9 min-w-0 items-center overflow-x-auto"
      data-testid="fo-ci-v2-stepper"
    >
      <ol className="flex min-w-0 items-center" data-testid="fo-ci-v2-progress">
        {CHECKIN_V2_STEPS.map((step, index) => {
          const registrationLabel =
            step.id === "registration"
              ? registrationProgressLabel({
                  current: step.id === currentStep,
                  visited: index < currentIndex,
                  completion: registrationCompletion,
                })
              : null;
          const backendDone =
            (step.id === "payment_guarantee" && paymentRecorded) ||
            (step.id === "review_checkin" && complete);
          const agreementDone = step.id === "agreement_signature" && agreementSigned;
          const reviewDone = step.id === "review_checkin" && complete;
          const completed =
            registrationLabel === "Completed" ||
            (step.id !== "registration" &&
              (index < currentIndex ||
                agreementDone ||
                reviewDone ||
                (backendDone && step.id !== currentStep)));
          const current = step.id === currentStep && !agreementDone && !reviewDone && !completed;
          return (
            <li key={step.id} data-testid={`fo-ci-v2-progress-${step.id}`}>
              <span
                className={cn(
                  "relative flex h-9 items-center gap-1 px-2.5 text-xs font-medium",
                  completed && "text-[#436436]",
                  current && "text-[#251605]",
                  !completed && !current && "text-muted-foreground",
                )}
                aria-current={current ? "step" : undefined}
              >
                {completed ? <CheckCircle2 className="size-3" /> : null}
                {completed ? null : <span className="tabular-nums">{step.number}</span>}
                <span className="hidden whitespace-nowrap sm:inline">{step.label}</span>
                <span
                  className="sr-only"
                  data-testid={`fo-ci-v2-progress-label-${step.id}`}
                >
                  {registrationLabel ??
                    (current ? "In progress" : completed ? "Completed" : "Pending")}
                </span>
                {completed ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#436436]" />
                ) : null}
                {current ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function LoadingScreen() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8"
      data-testid="fo-ci-v2-loading"
    >
      <div className="size-8 animate-spin rounded-full border-2 border-[#DDD4C5] border-t-[#C89933]" />
      <p className="text-sm text-[#6B5E4E]">Loading check-in…</p>
    </div>
  );
}

function ErrorScreen({
  heading,
  message,
  onRetry,
  testId,
}: {
  heading: string;
  message: string;
  onRetry?: () => void;
  testId: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid={testId}
    >
      <div className="space-y-1">
        <p className="font-semibold text-[#251605]">{heading}</p>
        <p className="max-w-sm text-sm text-[#6B5E4E]">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 size-3.5" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function ChooseRoomScreen({
  restaurantId,
  reservationId,
  onSelect,
}: {
  restaurantId: string;
  reservationId: string;
  onSelect: (reservationRoomId: string) => void;
}) {
  const fetchReservation = useServerFn(getReservation);
  const query = useQuery({
    queryKey: ["fo-ci-v2-choose-room", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    retry: false,
  });
  const rooms = query.data?.rooms ?? [];
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="fo-ci-v2-room-unit-required"
    >
      <Home className="size-6 text-[#8B6914]" />
      <div className="space-y-1">
        <p className="font-semibold text-[#251605]">Choose which room</p>
        <p className="max-w-sm text-sm text-[#6B5E4E]">
          This reservation has more than one room. Check-in continues on the room you select.
        </p>
      </div>
      {query.isLoading ? <p className="text-sm text-[#6B5E4E]">Loading rooms…</p> : null}
      {query.isError ? (
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      ) : null}
      {rooms.length > 0 ? (
        <div className="flex w-full max-w-md flex-col gap-2 text-left">
          {rooms.map((room) => (
            <Button
              key={room.id}
              type="button"
              variant="outline"
              className="h-auto justify-between px-3 py-2"
              onClick={() => onSelect(room.id)}
              data-testid="fo-ci-v2-choose-room"
            >
              <span>
                {room.roomNumber ? `Room ${room.roomNumber}` : `Room ${room.unitSequence}`}
              </span>
              {room.status ? <ReservationStatusBadge status={room.status as never} /> : null}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CheckInFinanceLines({
  summary,
  pending,
  money,
}: {
  summary: ReservationCashieringSummary | null;
  pending: boolean;
  money: (value: number) => string;
}) {
  if (pending || !summary) {
    return <p className="text-xs text-[#6B5E4E]">Loading folio…</p>;
  }
  const outstanding =
    summary.depositRequired == null
      ? null
      : Math.max(0, (summary.depositRequired ?? 0) - (summary.depositReceived ?? 0));
  const rows: Array<[string, string]> = [
    ["Payment Received", ledgerFigure(summary.paymentReceived, money)],
    ["Deposit Required", summary.depositRequired == null ? "—" : money(summary.depositRequired)],
    ["Deposit Received", ledgerFigure(summary.depositReceived, money)],
    ["Outstanding", outstanding == null ? "—" : money(outstanding)],
    ...(summary.refunded ? [["Refunded", ledgerFigure(summary.refunded, money)] as [string, string]] : []),
    ["Folio Balance", ledgerFigure(summary.folioBalance, money)],
  ];
  return (
    <dl data-testid="fo-ci-v2-finance">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 py-0.5 text-xs">
          <dt className="text-[#6B5E4E]">{label}</dt>
          <dd className="font-medium text-[#251605]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CheckInFinanceSection({
  summary,
  pending,
  money,
}: {
  summary: ReservationCashieringSummary | null;
  pending: boolean;
  money: (value: number) => string;
}) {
  return (
    <SectionCard
      title="Payment & Deposit"
      icon={<Building2 className="size-3.5" />}
      testId="fo-ci-v2-finance-section"
    >
      <CheckInFinanceLines summary={summary} pending={pending} money={money} />
    </SectionCard>
  );
}

function GuestStaySummary({
  restaurantId,
  unit,
  reservation,
}: {
  restaurantId: string;
  unit: CheckInUnitRead;
  reservation: ReservationDetail | null;
}) {
  const view = checkInStep1Presentation(unit);
  const fetchStays = useServerFn(getGuestStayOverview);
  const stayQuery = useQuery({
    queryKey: ["fo-ci-v2-guest-stays", restaurantId, view.guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId: view.guestId } }),
    enabled: Boolean(view.guestId),
    retry: false,
  });
  const returning = Boolean(stayQuery.data?.lastStay);
  const guestKnown = Boolean(view.guestId) && stayQuery.isFetched;
  return (
    <SectionCard title="Guest & Stay Summary" testId="fo-ci-v2-stay-summary">
      <p className="sr-only">Reservation loaded</p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[#251605]" data-testid="fo-ci-v2-guest-name">
          {view.guestName}
        </p>
        {view.bookerFallback ? (
          <span
            className="rounded-full bg-[#C89933]/15 px-2 py-0.5 text-[10px] font-medium text-[#8B6914]"
            data-testid="fo-ci-v2-booker-label"
          >
            Booker
          </span>
        ) : null}
        {guestKnown ? (
          returning ? (
            <span
              className="rounded-full bg-[#436436]/15 px-2 py-0.5 text-[10px] font-medium text-[#436436]"
              data-testid="fo-ci-v2-returning-guest"
            >
              Returning Guest
            </span>
          ) : (
            <span className="rounded-full bg-[#E8DFD0] px-2 py-0.5 text-[10px] font-medium text-[#6B5E4E]">
              New Guest
            </span>
          )
        ) : null}
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        <FieldRow stacked label="Arrival" value={formatStayDate(unit.arrivalDate)} />
        <FieldRow stacked label="Departure" value={formatStayDate(unit.departureDate)} />
        <FieldRow stacked label="Nights" value={String(view.nights)} />
        <FieldRow stacked label="Adults / Children" value={`${unit.adults} / ${unit.children}`} />
        <FieldRow stacked label="Room Type" value={view.roomTypeName ?? "—"} />
        <FieldRow stacked label="Rate Plan" value={unit.ratePlanName ?? "—"} />
        <FieldRow
          stacked
          label="Unit / Room"
          value={
            <span data-testid="fo-ci-v2-summary-room">
              {view.roomNumber ? `Room ${view.roomNumber}` : "Unassigned"}
            </span>
          }
        />
        {reservation?.status ? (
          <FieldRow
            stacked
            label="Status"
            value={<ReservationStatusBadge status={reservation.status} />}
          />
        ) : null}
      </dl>
    </SectionCard>
  );
}

function GuestInformationSection({
  restaurantId,
  unit,
  onProfileNumber,
}: {
  restaurantId: string;
  unit: CheckInUnitRead;
  onProfileNumber: (value: string | null) => void;
}) {
  const view = checkInStep1Presentation(unit);
  const fetchGuest = useServerFn(getGuest);
  const fetchStays = useServerFn(getGuestStayOverview);
  const [editOpen, setEditOpen] = useState(false);
  const guestQuery = useQuery({
    queryKey: ["fo-ci-v2-guest", restaurantId, view.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: view.guestId } }),
    enabled: Boolean(view.guestId),
    ...foOperationalQueryOptions(FO_CHECK_IN_POLL_MS),
    retry: false,
  });
  const stayQuery = useQuery({
    queryKey: ["fo-ci-v2-guest-stays", restaurantId, view.guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId: view.guestId } }),
    enabled: Boolean(view.guestId),
    retry: false,
  });
  const guest = guestQuery.data?.guest ?? null;
  const profileNumber = guest?.profileNumber ?? null;
  useEffect(() => {
    onProfileNumber(profileNumber);
  }, [onProfileNumber, profileNumber]);
  const address = guest
    ? guestAddressSummary([
        guest.addressLine1,
        guest.addressLine2,
        guest.city,
        guest.region,
        guest.country,
      ])
    : null;

  return (
    <SectionCard
      title="Guest Information"
      icon={<User className="size-3.5" />}
      testId="fo-ci-v2-guest-info"
      actions={
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!guest}
          onClick={() => setEditOpen(true)}
          data-testid="fo-ci-v2-edit-guest-details"
        >
          Edit Guest Details
        </Button>
      }
    >
      {guest ? (
        <GuestFormDialog
          restaurantId={restaurantId}
          open={editOpen}
          onOpenChange={setEditOpen}
          guest={guest}
          onSaved={() => void guestQuery.refetch()}
        />
      ) : null}
      <dl>
        {profileNumber ? <FieldRow label="Guest ID" value={profileNumber} /> : null}
        {guest?.vipStatus ? <FieldRow label="VIP" value="VIP" /> : null}
        {guestQuery.isError ? (
          <p className="text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-guest-unavailable">
            Guest profile unavailable.
          </p>
        ) : null}
        {guest?.phone ? (
          <FieldRow
            label="Phone"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5 text-[#6B5E4E]" />
                {guest.phone}
              </span>
            }
          />
        ) : null}
        {guest?.email ? (
          <FieldRow
            label="Email"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5 text-[#6B5E4E]" />
                {guest.email}
              </span>
            }
          />
        ) : null}
        {guest?.nationality ? <FieldRow label="Nationality" value={guest.nationality} /> : null}
        {address ? <FieldRow label="Address" value={address} /> : null}
        {stayQuery.data?.lastStay ? (
          <FieldRow
            label="Last stay"
            value={
              <span data-testid="fo-ci-v2-previous-stay">
                {formatStayDate(stayQuery.data.lastStay.arrivalDate)} {"\u2192"}{" "}
                {formatStayDate(stayQuery.data.lastStay.departureDate)}
              </span>
            }
          />
        ) : null}
      </dl>
    </SectionCard>
  );
}

function RoomAssignmentSection({
  restaurantId,
  reservationId,
  unit,
  assignmentNotes,
  onChanged,
}: {
  restaurantId: string;
  reservationId: string;
  unit: CheckInUnitRead;
  assignmentNotes: string | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const assign = useServerFn(assignReservationRoom);
  const fetchCandidates = useServerFn(listCheckInRoomCandidates);
  const candidateQuery = useQuery({
    queryKey: [
      "fo-ci-v2-room-candidates",
      restaurantId,
      reservationId,
      unit.roomTypeId,
      unit.arrivalDate,
      unit.departureDate,
      unit.adults,
      unit.children,
    ],
    queryFn: () =>
      fetchCandidates({
        data: {
          restaurantId,
          roomTypeId: unit.roomTypeId,
          arrival: unit.arrivalDate,
          departure: unit.departureDate,
          excludeReservationId: reservationId,
          adults: unit.adults,
          children: unit.children,
        },
      }),
    enabled: Boolean(unit.roomTypeId),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (roomId: string) =>
      assign({
        data: {
          restaurantId,
          reservationId,
          roomId,
          ...(unit.reservationRoomId ? { reservationRoomId: unit.reservationRoomId } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Room assignment saved.");
      setOpen(false);
      onChanged();
      void candidateQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const candidates = candidateQuery.data ?? [];
  const assigned = unit.roomId
    ? (candidates.find((room) => room.id === unit.roomId) ?? null)
    : null;
  const readiness = checkInRoomReadiness({
    roomId: unit.roomId,
    display: assigned ? [{ id: assigned.id, eligible: assigned.eligible }] : [],
    assignedRoom: assigned
      ? {
          floor: assigned.floor,
          building: assigned.building,
          housekeepingStatus: assigned.housekeepingStatus,
        }
      : null,
    readyForCheckIn: assigned?.readyForCheckIn ?? null,
  });

  // Filter presentation of rooms:
  // List only rooms that are currently eligible and ready for check-in.
  // The normal list should not show dirty, OOS, blocked, or ineligible rooms.
  const eligibleRooms = candidates.filter((room) => {
    if (!room.eligible || !room.readyForCheckIn) return false;
    const hk = (room.housekeepingStatus ?? "").toLowerCase();
    if (hk === "dirty") return false;
    const ms = (room.maintenanceStatus ?? "").toLowerCase();
    if (ms === "out_of_service" || ms === "oos" || ms === "out_of_order" || ms === "ooo") return false;
    const phys = (room.physicalStatus ?? "").toLowerCase();
    if (phys === "out_of_service" || phys === "oos" || phys === "blocked") return false;
    return true;
  });

  const alternativeRooms = eligibleRooms.filter((room) => room.id !== unit.roomId);
  const query = search.trim().toLowerCase();
  const filteredAlternatives = query
    ? alternativeRooms.filter((room) => room.roomNumber.toLowerCase().includes(query))
    : alternativeRooms;

  return (
    <SectionCard
      title="Room Assignment"
      icon={<Home className="size-3.5" />}
      testId="fo-ci-v2-room-assignment"
      actions={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              data-testid="fo-ci-v2-change-room"
            >
              {unit.roomId ? "Change Room" : "Assign Room"}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80 p-3 z-[80] bg-white rounded-xl border border-[#DDD4C5] shadow-xl space-y-2.5"
            data-testid="fo-ci-v2-change-room-dialog"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                Eligible Rooms
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px] text-[#8A641A]"
                onClick={() => void candidateQuery.refetch()}
              >
                Refresh
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-[#6B5E4E]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search room number"
                className="h-8 pl-8 text-xs rounded-[6px] border-[#CCCCCC]"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
              {candidateQuery.isLoading ? (
                <p className="py-4 text-center text-xs text-[#6B5E4E]">Loading rooms…</p>
              ) : filteredAlternatives.length === 0 ? (
                <div className="py-4 text-center space-y-2">
                  <p className="text-xs text-[#6B5E4E]">
                    No other rooms are currently ready and eligible for check-in.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void candidateQuery.refetch()}
                  >
                    Refresh rooms
                  </Button>
                </div>
              ) : (
                filteredAlternatives.map((room) => (
                  <RoomCandidateButton
                    key={room.id}
                    room={room}
                    roomTypeName={unit.roomTypeName}
                    pending={mutation.isPending}
                    current={room.id === unit.roomId}
                    onSelect={() => mutation.mutate(room.id)}
                  />
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      }
    >
      {unit.roomNumber ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-[#251605]" data-testid="fo-ci-v2-room-number">
            Room {unit.roomNumber}
          </p>
          {unit.roomTypeName ? <p className="text-sm text-[#6B5E4E]">{unit.roomTypeName}</p> : null}
          {readiness.floor || readiness.building ? (
            <p className="text-xs text-[#6B5E4E]">
              {readiness.floor ? `Floor ${readiness.floor}` : ""}
              {readiness.floor && readiness.building ? " · " : ""}
              {readiness.building ? `Building ${readiness.building}` : ""}
            </p>
          ) : null}
          {assigned ? (
            <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-room-physical">
              {physicalRoomLabel(assigned.physicalStatus)}
              {assigned.housekeepingStatus ? ` · Housekeeping ${assigned.housekeepingStatus}` : ""}
            </p>
          ) : null}
          {readiness.chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" data-testid="fo-ci-v2-room-readiness">
              {readiness.chips.map((chip) => (
                <StatusChip key={chip} label={chip} />
              ))}
            </div>
          ) : readiness.statusUnavailable ? (
            <p className="text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-room-status-unavailable">
              Room status unavailable.
            </p>
          ) : null}
          {assigned && !assigned.eligible && assigned.ineligibilityReason ? (
            <p className="text-sm text-[#8B6914]">{assigned.ineligibilityReason}</p>
          ) : null}
          {assigned && !assigned.readyForCheckIn && assigned.readyReason ? (
            <p className="text-sm text-[#8B6914]" data-testid="fo-ci-v2-room-ready-reason">
              {assigned.readyReason}
            </p>
          ) : null}
          {assignmentNotes ? (
            <p className="text-sm text-[#251605]" data-testid="fo-ci-v2-unit-notes">
              Assignment notes: {assignmentNotes}
            </p>
          ) : null}
        </div>
      ) : (
        <p
          className="text-sm text-[#6B5E4E]"
          data-testid="fo-ci-v2-room-unassigned"
        >
          No room assigned
        </p>
      )}
    </SectionCard>
  );
}

function RoomCandidateButton({
  room,
  roomTypeName,
  pending,
  current,
  onSelect,
}: {
  room: CheckInRoomCandidate;
  roomTypeName: string | null;
  pending: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const meta = [
    roomTypeName,
    room.building ? `Building ${room.building}` : null,
    room.floor ? `Floor ${room.floor}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "h-auto w-full justify-between p-2 text-left rounded-[6px] border-[#E8DFD0] transition-colors hover:border-[#8A641A] hover:bg-[#FBF7F1]",
        current && "border-[#8A641A] bg-[#C89933]/10",
      )}
      disabled={pending || current || !room.eligible}
      onClick={onSelect}
      data-testid="fo-ci-v2-assignable-room"
      data-eligible={room.eligible ? "true" : "false"}
      data-ready={room.readyForCheckIn ? "true" : "false"}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs text-[#251605]">Room {room.roomNumber}</span>
          {current ? (
            <span className="text-[10px] text-[#8A641A] font-medium bg-[#C89933]/20 rounded px-1">
              Current
            </span>
          ) : null}
        </div>
        {meta ? <p className="truncate text-[11px] text-[#6B5E4E]">{meta}</p> : null}
        <p className="text-[10px] text-[#436436] font-medium">Ready for check-in</p>
      </div>
    </Button>
  );
}

function GuestListSection({
  restaurantId,
  reservationId,
  unit,
  onChanged,
}: {
  restaurantId: string;
  reservationId: string;
  unit: CheckInUnitRead;
  onChanged: () => void;
}) {
  const view = checkInStep1Presentation(unit);
  const manage = useServerFn(manageReservationRoomGuest);
  const [adding, setAdding] = useState(false);
  const mutable = Boolean(view.reservationRoomId) && roomOccupantsMutable(unit.status);
  const atCapacity = view.occupants.length >= roomOccupantCapacity(unit.adults, unit.children);
  const historical = Boolean(view.reservationRoomId) && !roomOccupantsMutable(unit.status);
  const addGuestReason = !view.reservationRoomId
    ? null
    : historical
      ? "Guests cannot be changed after this room is cancelled, checked out, or marked no-show."
      : atCapacity
        ? "Guest capacity reached"
        : null;
  const mutation = useMutation({
    mutationFn: (input: { guestId: string; action: "add" | "remove" | "set_primary" }) => {
      if (!view.reservationRoomId) throw new Error("This stay has no room unit for guest changes.");
      return manage({
        data: {
          restaurantId,
          reservationId,
          reservationRoomId: view.reservationRoomId,
          guestId: input.guestId,
          action: input.action,
        },
      });
    },
    onSuccess: () => {
      setAdding(false);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <SectionCard
      title="Guests for This Stay"
      icon={<Users className="size-3.5" />}
      testId="fo-ci-v2-guest-list"
      actions={
        mutable ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={atCapacity || mutation.isPending}
            onClick={() => setAdding(true)}
            data-testid="fo-ci-v2-add-guest"
          >
            Add Guest
          </Button>
        ) : undefined
      }
    >
      {addGuestReason ? (
        <p className="mb-2 text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-add-guest-disabled">
          {addGuestReason}
        </p>
      ) : null}
      {view.occupants.length === 0 ? (
        <p className="text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-no-occupants">
          {view.legacyNoUnit
            ? "This stay has no separate room guest list."
            : "No named guests on this room yet."}
        </p>
      ) : view.occupants.length === 1 ? (
        <div className="space-y-2">
          <div
            className="flex items-center justify-between gap-3"
            data-testid="fo-ci-v2-primary-occupant"
          >
            <p className="text-sm text-[#251605]">
              {view.occupants[0].name}
              <span className="text-[#6B5E4E]">
                {" "}
                · Primary · {unit.adults} Adult{unit.adults === 1 ? "" : "s"}
                {unit.children > 0
                  ? ` · ${unit.children} Child${unit.children === 1 ? "" : "ren"}`
                  : ""}
              </span>
            </p>
            {mutable && !(view.occupants[0].isPrimary && view.occupants.length === 1) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ guestId: view.occupants[0].guestId, action: "remove" })
                }
              >
                Remove Guest
              </Button>
            ) : null}
          </div>
          {atCapacity ? (
            <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-capacity-reached">
              Guest capacity reached
            </p>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8DFD0] text-xs uppercase text-[#6B5E4E]">
                <th className="pb-2 pr-3 text-left font-medium">#</th>
                <th className="pb-2 pr-3 text-left font-medium">Guest Name</th>
                <th className="pb-2 text-left font-medium">Relationship</th>
              </tr>
            </thead>
            <tbody>
              {view.occupants.map((occupant, index) => (
                <tr
                  key={occupant.guestId}
                  className="border-b border-[#E8DFD0]/70 last:border-0"
                  data-testid={
                    occupant.isPrimary ? "fo-ci-v2-primary-occupant" : "fo-ci-v2-occupant"
                  }
                >
                  <td className="py-2 pr-3 text-[#6B5E4E]">{index + 1}</td>
                  <td className="py-2 pr-3 font-medium text-[#251605]">{occupant.name}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {occupant.isPrimary ? (
                        <span className="rounded-full bg-[#C89933]/15 px-2 py-0.5 text-xs font-medium text-[#8B6914]">
                          Primary Guest
                        </span>
                      ) : (
                        <span className="text-[#6B5E4E]">—</span>
                      )}
                      {mutable && !occupant.isPrimary ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({ guestId: occupant.guestId, action: "set_primary" })
                          }
                        >
                          Change Primary
                        </Button>
                      ) : null}
                      {mutable && !(occupant.isPrimary && view.occupants.length === 1) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({ guestId: occupant.guestId, action: "remove" })
                          }
                        >
                          Remove Guest
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {atCapacity ? (
            <p className="mt-2 text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-capacity-reached">
              Guest capacity reached
            </p>
          ) : null}
        </div>
      )}
      {adding && view.reservationRoomId ? (
        <AddGuestSearch
          restaurantId={restaurantId}
          takenGuestIds={view.occupants.map((occupant) => occupant.guestId)}
          pending={mutation.isPending}
          onCancel={() => setAdding(false)}
          onSelect={(guestId) => mutation.mutate({ guestId, action: "add" })}
        />
      ) : null}
    </SectionCard>
  );
}

function AddGuestSearch({
  restaurantId,
  takenGuestIds,
  pending,
  onCancel,
  onSelect,
}: {
  restaurantId: string;
  takenGuestIds: string[];
  pending: boolean;
  onCancel: () => void;
  onSelect: (guestId: string) => void;
}) {
  const fetchGuests = useServerFn(listGuests);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebounced(search),
      CREATE_RESERVATION_GUEST_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  const trimmed = debounced.trim();
  const guestsQuery = useQuery({
    queryKey: ["fo-ci-v2-guest-search", restaurantId, trimmed],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: CREATE_RESERVATION_GUEST_SEARCH_LIMIT,
          offset: 0,
          search: trimmed,
        },
      }),
    enabled: trimmed.length > 0,
  });
  const matches = guestListItems(guestsQuery.data).filter(
    (guest) => !takenGuestIds.includes(guest.id),
  );
  return (
    <div className="mt-3 space-y-2" data-testid="fo-ci-v2-add-guest-search">
      <Input
        value={search}
        className="h-9"
        placeholder="Search an existing guest profile"
        onChange={(event) => setSearch(event.target.value)}
      />
      {matches.length > 0 ? (
        <ul className="max-h-32 overflow-auto rounded-md border border-[#DDD4C5] bg-white">
          {matches.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[#251605] hover:bg-[#FBF7F1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C89933] disabled:opacity-50"
                disabled={pending}
                onClick={() => onSelect(guest.id)}
              >
                {guest.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function ExpandableText({
  text,
  empty,
  testId,
}: {
  text?: string | null;
  empty: string;
  testId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = Boolean(text && text.length > 120);
  if (!text) return <p className="mt-1 text-sm text-[#6B5E4E]">{empty}</p>;
  return (
    <div className="mt-1 space-y-1">
      <p className={cn("text-sm text-[#251605]", !expanded && isLong && "line-clamp-2")} data-testid={testId}>
        {text}
      </p>
      {isLong ? (
        <button
          type="button"
          className="text-xs font-medium text-[#8A641A] hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "View all"}
        </button>
      ) : null}
    </div>
  );
}

function RequestsNotesRateSection({
  restaurantId,
  unit,
  reservation,
  money,
}: {
  restaurantId: string;
  unit: CheckInUnitRead;
  reservation: ReservationDetail | null;
  money: (amount: number) => string;
}) {
  const view = checkInStep1Presentation(unit);
  const nightly =
    view.siblings.length === 0 ? uniformNightlyAmount(reservation?.nightlyRates) : null;
  const nightlyText = moneyText(money, nightly);
  const charge = moneyText(money, unit.subtotal);
  const packageRules = usePackageChargeRules(restaurantId, unit.packages.length > 0);
  const services = useReservationServiceCharges(restaurantId, reservation?.id ?? null);
  const packageLabel =
    unit.packages.length === 0
      ? "None"
      : unit.packages
          .map((pkg) => {
            const amount =
              pkg.appliedAmount == null
                ? null
                : moneyText(money, packageChargeFigures(pkg.appliedAmount, packageRules.data).total);
            return amount ? `${pkg.packageName} (${amount})` : pkg.packageName;
          })
          .join(", ");
  return (
    <SectionCard title="Requests, Notes & Rate" testId="fo-ci-v2-requests-notes-rate">
      <div className="grid gap-4 md:grid-cols-3">
        <div data-testid="fo-ci-v2-requests">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Special Requests
          </p>
          <ExpandableText
            text={reservation?.specialRequests}
            empty="No special requests."
            testId="fo-ci-v2-special-requests"
          />
        </div>
        <div data-testid="fo-ci-v2-internal-notes">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Internal Notes
          </p>
          <ExpandableText
            text={reservation?.notes}
            empty="No internal notes."
            testId="fo-ci-v2-internal-note"
          />
        </div>
        <div data-testid="fo-ci-v2-packages">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Rate & Package
          </p>
          <dl className="mt-1">
            <FieldRow label="Rate Plan" value={unit.ratePlanName || "BAR — Best Available Rate"} />
            {nightlyText ? <FieldRow label="Nightly Amount" value={nightlyText} /> : null}
            <FieldRow
              label="Unit Subtotal"
              value={<span data-testid="fo-ci-v2-subtotal">{charge || "—"}</span>}
            />
            <FieldRow label="Package" value={packageLabel} />
            {services.lines.length > 0 ? (
              <div data-testid="fo-ci-v2-services">
                {services.lines.map(({ charge: line, figures }) => {
                  const detail = serviceLineDetail(line, money);
                  return (
                    <FieldRow
                      key={line.id}
                      label={detail ? `${line.serviceName} · ${detail}` : line.serviceName}
                      value={`${figures.total != null ? money(figures.total) : "—"} · ${
                        line.folioTransactionId ? "Posted" : "Pending"
                      }`}
                    />
                  );
                })}
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </SectionCard>
  );
}

function SiblingRoomsSection({
  siblings,
  onSwitchUnit,
}: {
  siblings: CheckInSiblingUnit[];
  onSwitchUnit: (id: string) => void;
}) {
  if (siblings.length === 0) return null;
  return (
    <SectionCard
      title="Other Rooms on This Reservation"
      icon={<Home className="size-3.5" />}
      testId="fo-ci-v2-siblings"
    >
      <div className="space-y-2">
        {siblings.map((sibling) => (
          <div
            key={sibling.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[#E8DFD0] px-3 py-2"
            data-testid="fo-ci-v2-sibling-room"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#251605]">
                {sibling.roomNumber ? `Room ${sibling.roomNumber}` : "Unassigned room"}
              </span>
              {sibling.status ? <ReservationStatusBadge status={sibling.status as never} /> : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => onSwitchUnit(sibling.id)}
              data-testid="fo-ci-v2-sibling-switch"
            >
              Open this room
            </Button>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function FoCheckInV2Workspace({
  restaurantId,
  reservationId,
  reservationRoomId,
  open,
  onOpenChange,
  confirmationNumber,
}: {
  restaurantId: string;
  reservationId: string;
  reservationRoomId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmationNumber?: string | null;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchUnit = useServerFn(getCheckInUnit);
  const fetchReservation = useServerFn(getReservation);
  const fetchReadiness = useServerFn(getCheckInReadiness);
  const fetchCashiering = useServerFn(getReservationCashieringSummary);
  const timezone = useRestaurantTimezone();
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);
  const [step, setStep] = useState<CheckInV2StepId>("guest_reservation");
  const [switchUnitId, setSwitchUnitId] = useState<string | null>(null);
  const [profileNumber, setProfileNumber] = useState<string | null>(null);
  const [depositSummary, setDepositSummary] = useState<CheckInPaymentSummary | null>(null);
  const [depositSatisfied, setDepositSatisfied] = useState(false);
  const [agreementSummary, setAgreementSummary] = useState<CheckInAgreementSummary | null>(null);
  const [agreementSigned, setAgreementSigned] = useState(false);
  const registrationRef = useRef<CheckInRegistrationHandle>(null);
  const agreementRef = useRef<CheckInAgreementHandle>(null);
  const reviewRef = useRef<CheckInReviewHandle>(null);
  const [agreementActions, setAgreementActions] = useState<CheckInAgreementActions>({
    canSign: false,
    canSave: false,
    busy: false,
  });
  const [reviewActions, setReviewActions] = useState<CheckInReviewActions>({
    canComplete: false,
    busy: false,
    checkedIn: false,
    roomReadiness: null,
    blockerHint: null,
  });
  const onAgreementReady = useCallback((signed: boolean) => {
    setAgreementSigned((current) => (current === signed ? current : signed));
  }, []);
  const onAgreementActions = useCallback((actions: CheckInAgreementActions) => {
    setAgreementActions((current) =>
      current.canSign === actions.canSign &&
      current.canSave === actions.canSave &&
      current.busy === actions.busy
        ? current
        : actions,
    );
  }, []);
  const onReviewActions = useCallback((actions: CheckInReviewActions) => {
    setReviewActions((current) =>
      current.canComplete === actions.canComplete &&
      current.busy === actions.busy &&
      current.checkedIn === actions.checkedIn &&
      current.roomReadiness === actions.roomReadiness &&
      current.blockerHint === actions.blockerHint
        ? current
        : actions,
    );
  }, []);
  const onAgreementSummary = useCallback((summary: CheckInAgreementSummary) => {
    setAgreementSummary((current) =>
      current &&
      current.version === summary.version &&
      current.status === summary.status &&
      current.signedBy === summary.signedBy &&
      current.signedAt === summary.signedAt
        ? current
        : summary,
    );
  }, []);
  const onDepositReady = useCallback((satisfied: boolean) => {
    setDepositSatisfied((current) => (current === satisfied ? current : satisfied));
  }, []);
  const onDepositSummary = useCallback((summary: CheckInPaymentSummary) => {
    setDepositSummary((current) =>
      current &&
      current.required === summary.required &&
      current.received === summary.received &&
      current.outstanding === summary.outstanding &&
      current.status === summary.status &&
      current.guarantee === summary.guarantee &&
      current.guaranteeNote === summary.guaranteeNote &&
      current.folioScope === summary.folioScope
        ? current
        : summary,
    );
  }, []);
  const activeRoomId = switchUnitId ?? reservationRoomId ?? null;
  const reviewScope = `${reservationId}:${activeRoomId ?? "legacy"}`;
  const [reviewScopeSeen, setReviewScopeSeen] = useState(reviewScope);
  if (reviewScopeSeen !== reviewScope) {
    setReviewScopeSeen(reviewScope);
    setReviewActions({
      canComplete: false,
      busy: false,
      checkedIn: false,
      roomReadiness: null,
      blockerHint: null,
    });
  }

  useEffect(() => {
    if (!open) return;
    setStep("guest_reservation");
    setSwitchUnitId(null);
  }, [open, reservationId, reservationRoomId]);

  const unitQuery = useQuery({
    queryKey: ["fo-ci-v2-unit", restaurantId, reservationId, activeRoomId],
    queryFn: () =>
      fetchUnit({
        data: {
          restaurantId,
          reservationId,
          ...(activeRoomId ? { reservationRoomId: activeRoomId } : {}),
        },
      }),
    enabled: open,
    ...foOperationalQueryOptions(FO_CHECK_IN_POLL_MS),
    retry: false,
  });
  const reservationQuery = useQuery({
    queryKey: ["fo-ci-v2-reservation", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    enabled: open && Boolean(unitQuery.data),
    ...foOperationalQueryOptions(FO_CHECK_IN_POLL_MS),
    retry: false,
  });
  const readinessQuery = useQuery({
    queryKey: ["fo-ci-v2-readiness", restaurantId, reservationId, activeRoomId],
    queryFn: () =>
      fetchReadiness({
        data: {
          restaurantId,
          reservationId,
          ...(activeRoomId ? { reservationRoomId: activeRoomId } : {}),
        },
      }),
    enabled: open && Boolean(unitQuery.data),
    refetchOnWindowFocus: "always",
    refetchInterval: FO_CHECK_IN_POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const cashieringQuery = useQuery({
    queryKey: ["fo-ci-v2-cashiering", restaurantId, reservationId],
    queryFn: () => fetchCashiering({ data: { restaurantId, reservationId } }),
    enabled: open,
    ...foOperationalQueryOptions(FO_CHECK_IN_POLL_MS),
    retry: false,
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStep("guest_reservation");
      setSwitchUnitId(null);
    }
    onOpenChange(next);
  }

  function reloadUnit() {
    void queryClient.invalidateQueries({
      queryKey: ["fo-ci-v2-unit", restaurantId, reservationId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["fo-ci-v2-cashiering", restaurantId, reservationId],
    });
  }

  const unit = unitQuery.data ?? null;
  const registrationCompletion = readinessQuery.data
    ? registrationCompletionProjection({
        complete: readinessQuery.data.registration.complete,
        waived: readinessQuery.data.registration.waived,
        savedSnapshotExists: Boolean(unit?.progress.registrationSnapshot),
        identitySatisfied:
          readinessQuery.data.identity.valid &&
          !readinessQuery.data.blockers.some((item) => item.code === "IDENTITY_DOCUMENT"),
        missingRequirements: readinessQuery.data.blockers
          .filter((item) => item.code === "GUEST_FIELDS")
          .map((item) => item.message),
      })
    : null;
  const failure = unitQuery.isError ? classifyCheckInUnitFailure(unitQuery.error) : null;
  const reservation = reservationQuery.data ?? null;
  const view = unit ? checkInStep1Presentation(unit) : null;
  const unitNotes =
    unit?.reservationRoomId && reservation?.rooms
      ? (reservation.rooms.find((room) => room.id === unit.reservationRoomId)?.assignmentNotes ??
        null)
      : null;
  const stepReadiness = readinessQuery.data
    ? projectCheckInStep1Readiness(readinessQuery.data, {
        arrivalDate: unit?.arrivalDate ?? null,
        persistedBusinessDate: businessDate,
        timezone,
      })
    : null;
  const canContinueStep = Boolean(unit && stepReadiness?.canContinue);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={FO_CHECKIN_V2_SHEET_CLASS}
        data-testid="fo-ci-v2-workspace"
      >
        <header className="shrink-0 space-y-0 border-b border-[#3A2A16] bg-[#1F140A] px-4 py-2 text-left">
          <DialogDescription className="sr-only">
            Check-In
            {view ? ` · ${view.guestName}` : ""}
            {(confirmationNumber ?? reservation?.confirmationNumber)
              ? ` · ${confirmationNumber ?? reservation?.confirmationNumber}`
              : ""}
            {view?.roomNumber ? ` · Room ${view.roomNumber}` : " · Unassigned"}
          </DialogDescription>
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="font-display text-sm font-semibold text-[#F3E9D8]">
              Check-In
            </DialogTitle>
            {view ? (
              <>
                <span className="text-[#8A7A61]">·</span>
                <span
                  className="truncate font-display text-sm font-semibold text-[#F3E9D8]"
                  data-testid="fo-ci-v2-header-guest-name"
                >
                  {view.guestName}
                </span>
              </>
            ) : null}
            {(confirmationNumber ?? reservation?.confirmationNumber) ? (
              <span
                className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#C89933]"
                data-testid="fo-ci-v2-header-confirmation"
              >
                {confirmationNumber ?? reservation?.confirmationNumber}
              </span>
            ) : null}
            <span
              className="hidden"
              data-testid="fo-ci-v2-confirmation"
            >
              {confirmationNumber ?? reservation?.confirmationNumber}
            </span>
            {view?.roomNumber ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#F3E9D8]">
                Room {view.roomNumber}
              </span>
            ) : view ? (
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#C89933]">
                Unassigned
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={cn(SHELL_ICON_BUTTON, "size-8 border-white/10 bg-white/5 text-[#F3E9D8] hover:bg-white/10")}
                    data-testid="fo-ci-v2-refresh"
                    aria-label="Refresh check-in"
                    onClick={() => {
                      void unitQuery.refetch();
                      void reservationQuery.refetch();
                      void readinessQuery.refetch();
                      void cashieringQuery.refetch();
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh check-in</TooltipContent>
              </Tooltip>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-[#F3E9D8] hover:bg-white/10 hover:text-white"
                onClick={() => handleOpenChange(false)}
                aria-label="Close check-in workspace"
                data-testid="fo-ci-v2-close-btn"
              >
                <X className="size-4" />
              </Button>
            </span>
          </div>
        </header>
        <div className="flex h-9 shrink-0 items-center border-b border-[#DDD4C5] bg-white px-2">
          <StepRail
            currentStep={step}
            complete={
              step === "review_checkin" &&
              (reviewActions.checkedIn || unitAlreadyCheckedIn(unitQuery.data?.status))
            }
            registrationCompletion={registrationCompletion}
            paymentRecorded={Boolean(view?.paymentRecorded || depositSatisfied)}
            agreementSigned={agreementSigned || agreementSummary?.status === "Signed"}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {unitQuery.isLoading ? (
            <LoadingScreen />
          ) : failure === "permission_denied" ? (
            <PermissionDeniedPanel
              message="You don't have access to check in this reservation."
              className="m-6"
            />
          ) : failure === "room_unit_required" ? (
            <ChooseRoomScreen
              restaurantId={restaurantId}
              reservationId={reservationId}
              onSelect={(id) => {
                setStep("guest_reservation");
                setSwitchUnitId(id);
              }}
            />
          ) : failure === "unit_not_found" ? (
            <ErrorScreen
              heading="Room not found"
              message="That room is not on this reservation."
              onRetry={() => void unitQuery.refetch()}
              testId="fo-ci-v2-unit-not-found"
            />
          ) : failure === "reservation_not_found" ? (
            <ErrorScreen
              heading="Reservation not found"
              message="This reservation could not be found for the property."
              onRetry={() => void unitQuery.refetch()}
              testId="fo-ci-v2-reservation-not-found"
            />
          ) : failure === "retryable" ? (
            <ErrorScreen
              heading="Could not load check-in"
              message="Check-in details could not be loaded. Try again."
              onRetry={() => void unitQuery.refetch()}
              testId="fo-ci-v2-error"
            />
          ) : !unit || !view ? null : (
            <div className="p-4 lg:p-5">
              <div
                className="min-w-0 space-y-3"
                data-testid="fo-ci-v2-step1-main"
                data-reservation-room-id={view.progressReservationRoomId ?? ""}
              >
                {step === "guest_reservation" ? (
                  <>
                    <div className="sr-only" data-testid="fo-ci-v2-reservation-header">
                      Reservation loaded
                    </div>
                    {stepReadiness && stepReadiness.hardBlockers.length > 0 ? (
                      <div
                        className="rounded-lg border border-[#C89933]/40 bg-[#C89933]/10 px-3 py-2"
                        data-testid="fo-ci-v2-step1-blockers"
                      >
                        {stepReadiness.hardBlockers.map((blocker) => (
                          <p key={blocker.code} className="text-sm text-[#8B6914]">
                            {blocker.code === "ROOM_REQUIRED"
                              ? "Assign a room to continue"
                              : blocker.message}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {stepReadiness?.arrivalVersusBusinessDate === "past" ? (
                      <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-arrival-note">
                        Arrival is before the property business date. This does not block this step.
                      </p>
                    ) : stepReadiness?.arrivalVersusBusinessDate === "early" ? (
                      <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-arrival-note">
                        Arrival is after the property business date. This does not block this step.
                      </p>
                    ) : null}
                    <GuestStaySummary
                      restaurantId={restaurantId}
                      unit={unit}
                      reservation={reservation}
                    />
                    <div className="grid gap-3 lg:grid-cols-2">
                      <RoomAssignmentSection
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        unit={unit}
                        assignmentNotes={unitNotes}
                        onChanged={reloadUnit}
                      />
                      <GuestInformationSection
                        restaurantId={restaurantId}
                        unit={unit}
                        onProfileNumber={setProfileNumber}
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <GuestListSection
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        unit={unit}
                        onChanged={reloadUnit}
                      />
                      <CheckInFinanceSection
                        summary={cashieringQuery.data ?? null}
                        pending={cashieringQuery.isLoading}
                        money={money}
                      />
                    </div>
                    <RequestsNotesRateSection
                      restaurantId={restaurantId}
                      unit={unit}
                      reservation={reservation}
                      money={money}
                    />
                    {unit.siblings.length > 0 ? (
                      <SiblingRoomsSection
                        siblings={unit.siblings}
                        onSwitchUnit={setSwitchUnitId}
                      />
                    ) : null}
                  </>
                ) : step === "registration" ? (
                  <FoCheckInV2Registration
                    ref={registrationRef}
                    restaurantId={restaurantId}
                    reservationId={reservationId}
                    reservationRoomId={activeRoomId}
                    unit={unit}
                    reservation={reservation}
                    profileNumber={profileNumber}
                    roomGuests={
                      <GuestListSection
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        unit={unit}
                        onChanged={reloadUnit}
                      />
                    }
                    registrationCompletion={registrationCompletion}
                    onSaved={reloadUnit}
                  />
                ) : step === "payment_guarantee" ? (
                  <FoCheckInV2Payment
                    restaurantId={restaurantId}
                    reservationId={reservationId}
                    reservationRoomId={activeRoomId}
                    unit={unit}
                    reservation={reservation}
                    cashiering={cashieringQuery.data ?? null}
                    cashieringPending={cashieringQuery.isLoading}
                    onReady={onDepositReady}
                    onSummary={onDepositSummary}
                    onRefresh={reloadUnit}
                  />
                ) : step === "agreement_signature" ? (
                  <FoCheckInV2Agreement
                    ref={agreementRef}
                    restaurantId={restaurantId}
                    reservationId={reservationId}
                    reservationRoomId={activeRoomId}
                    unit={unit}
                    confirmationNumber={
                      confirmationNumber ?? reservation?.confirmationNumber ?? null
                    }
                    onReady={onAgreementReady}
                    onSummary={onAgreementSummary}
                    onActions={onAgreementActions}
                    onRefresh={reloadUnit}
                  />
                ) : step === "review_checkin" ? (
                    <FoCheckInV2Review
                      ref={reviewRef}
                      restaurantId={restaurantId}
                      reservationId={reservationId}
                      reservationRoomId={activeRoomId}
                      unit={unit}
                      reservation={reservation}
                      confirmationNumber={
                        confirmationNumber ?? reservation?.confirmationNumber ?? null
                      }
                      onEdit={setStep}
                      onActions={onReviewActions}
                      onClose={() => handleOpenChange(false)}
                      onRefresh={reloadUnit}
                    >
                      <FoCheckInV2Key
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        reservationRoomId={activeRoomId}
                        unit={unit}
                        onRefresh={reloadUnit}
                      />
                    </FoCheckInV2Review>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <footer
          className="shrink-0 border-t border-[#E8DFD0] bg-white px-4 py-2"
          data-testid="fo-ci-v2-footer"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
                onClick={() => handleOpenChange(false)}
                data-testid="fo-ci-v2-cancel-btn"
              >
                Cancel
              </Button>
              {step === "registration" ? (
                <Button
                  variant="ghost"
                  className="h-9 text-[#4a2c1a]"
                  onClick={() => setStep("guest_reservation")}
                  data-testid="fo-ci-v2-back-guest"
                >
                  Back
                </Button>
              ) : step === "payment_guarantee" ? (
                <Button
                  variant="ghost"
                  className="h-9 text-[#4a2c1a]"
                  onClick={() => setStep("registration")}
                  data-testid="fo-ci-v2-back-registration"
                >
                  Back
                </Button>
              ) : step === "agreement_signature" ? (
                <Button
                  variant="ghost"
                  className="h-9 text-[#4a2c1a]"
                  onClick={() => setStep("payment_guarantee")}
                  data-testid="fo-ci-v2-back-payment"
                >
                  Back
                </Button>
              ) : step === "review_checkin" ? (
                <Button
                  variant="ghost"
                  className="h-9 text-[#4a2c1a]"
                  onClick={() => setStep("agreement_signature")}
                  data-testid="fo-ci-v2-back-agreement"
                >
                  Back
                </Button>
              ) : null}
            </div>
            {step === "registration" ? (
              <Button
                className={SHELL_PRIMARY_BUTTON}
                data-testid="fo-ci-v2-save-continue"
                onClick={() => {
                  void registrationRef.current?.save().then((saved) => {
                    if (saved) setStep("payment_guarantee");
                  });
                }}
              >
                Next: Payment & Guarantee
                {/* Save & Continue */}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : step === "payment_guarantee" ? (
              <Button
                className={SHELL_PRIMARY_BUTTON}
                data-testid="fo-ci-v2-continue-agreement"
                disabled={!depositSatisfied}
                onClick={() => setStep("agreement_signature")}
              >
                Next: Agreement & Signature
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : step === "guest_reservation" ? (
              <div className="flex flex-col items-end gap-1">
                {!canContinueStep ? (
                  <p className="text-xs text-[#8B6914]" data-testid="fo-ci-v2-next-blocker">
                    {readinessQuery.isError
                      ? readinessQuery.error instanceof Error
                        ? readinessQuery.error.message
                        : "Check-in readiness could not be loaded."
                      : stepReadiness?.hardBlockers[0]?.code === "ROOM_REQUIRED" ||
                          stepReadiness?.continueMessage ===
                            "Assign a room before completing check-in."
                        ? "Assign a room to continue"
                        : (stepReadiness?.continueMessage ??
                          (unit ? "Checking check-in readiness…" : "Load the reservation first."))}
                  </p>
                ) : null}
                <Button
                  className={SHELL_PRIMARY_BUTTON}
                  onClick={() => setStep("registration")}
                  data-testid="fo-ci-v2-next-registration"
                  disabled={!canContinueStep}
                >
                  Next: Registration
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </div>
            ) : step === "agreement_signature" ? (
              agreementSigned ? (
                <Button
                  className={SHELL_PRIMARY_BUTTON}
                  data-testid="fo-ci-v2-continue-review"
                  onClick={() => setStep("review_checkin")}
                >
                  Next: Review & Check-In
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    data-testid="fo-ci-v2-save-agreement-draft"
                    disabled={!agreementActions.canSave || agreementActions.busy}
                    onClick={() => void agreementRef.current?.save()}
                  >
                    Save as Draft
                  </Button>
                  <Button
                    className={SHELL_PRIMARY_BUTTON}
                    data-testid="fo-ci-v2-sign-agreement-footer"
                    disabled={!agreementActions.canSign || agreementActions.busy}
                    onClick={() => void agreementRef.current?.sign()}
                  >
                    {agreementActions.busy ? "Signing…" : "Sign Agreement"}
                  </Button>
                </div>
              )
            ) : step === "review_checkin" ? (
              <div className="flex flex-col items-end gap-1">
                {!reviewActions.canComplete && reviewActions.blockerHint ? (
                  <p className="text-xs text-red-800" id="fo-ci-v2-complete-reason">
                    {reviewActions.blockerHint}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  data-testid="fo-ci-v2-print-registration"
                  onClick={() => reviewRef.current?.print()}
                >
                  Print Registration Form
                </Button>
                {reviewActions.checkedIn || unitAlreadyCheckedIn(unit?.status) ? null : (
                  <Button
                    className={cn(
                      SHELL_PRIMARY_BUTTON,
                      "disabled:opacity-70 disabled:text-[#251605]",
                    )}
                    data-testid="fo-ci-v2-complete-checkin"
                    disabled={!reviewActions.canComplete || reviewActions.busy}
                    aria-describedby={
                      !reviewActions.canComplete && reviewActions.blockerHint
                        ? "fo-ci-v2-complete-reason"
                        : undefined
                    }
                    onClick={() => reviewRef.current?.requestComplete()}
                  >
                    {reviewActions.busy ? "Completing…" : "Complete Check-In"}
                  </Button>
                )}
                </div>
              </div>
            ) : null}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
