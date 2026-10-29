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
  ChevronRight,
  Circle,
  Clock,
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
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
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

function expectedArrivalLabel(value: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value;
  const time = value.length >= 16 ? value.slice(11, 16) : "";
  const dated = formatStayDate(date);
  return time && time !== "00:00" ? `${dated} ${time}` : dated;
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
    <section className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm" data-testid={testId}>
      <div className="flex items-center justify-between gap-3 border-b border-[#E8DFD0] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#C89933]/15 text-[#8B6914]">
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
      <div className="p-4">{children}</div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
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

function StepRail({ currentStep, complete }: { currentStep: CheckInV2StepId; complete: boolean }) {
  const currentIndex = CHECKIN_V2_STEPS.findIndex((step) => step.id === currentStep);
  return (
    <nav aria-label="Check-In steps" className="flex items-center" data-testid="fo-ci-v2-stepper">
      {CHECKIN_V2_STEPS.map((step, index) => {
        const isDone = index < currentIndex || (complete && index <= currentIndex);
        const isActive = step.id === currentStep && !isDone;
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                isActive && "bg-[#C89933] text-[#251605]",
                isDone && "bg-[#436436]/15 text-[#436436]",
                !isActive && !isDone && "text-[#6B5E4E]",
              )}
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  isActive && "bg-[#251605] text-[#C89933]",
                  isDone && "bg-[#436436] text-white",
                  !isActive && !isDone && "bg-[#E8DFD0] text-[#6B5E4E]",
                )}
              >
                {isDone ? <Check className="size-3" /> : step.number}
              </span>
              <span className="hidden md:inline">{step.label}</span>
            </div>
            {index < CHECKIN_V2_STEPS.length - 1 ? (
              <ChevronRight className="mx-0.5 size-3.5 shrink-0 text-[#DDD4C5]" />
            ) : null}
          </div>
        );
      })}
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
    ["Payment received", ledgerFigure(summary.paymentReceived, money)],
    ["Deposit required", summary.depositRequired == null ? "—" : money(summary.depositRequired)],
    ["Deposit received", ledgerFigure(summary.depositReceived, money)],
    ["Outstanding", outstanding == null ? "—" : money(outstanding)],
    ...(summary.refunded ? [["Refunded", ledgerFigure(summary.refunded, money)] as [string, string]] : []),
    ["Folio balance", ledgerFigure(summary.folioBalance, money)],
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
      <p className="mt-2 text-xs text-[#6B5E4E]">
        Deposit required is the reservation requirement. Received amounts come from the folio.
        {summary && summary.folioBalance == null ? " No folio is open." : ""}
      </p>
    </SectionCard>
  );
}

function CheckInSummaryColumn({
  unit,
  profileNumber,
  money,
  currentStep,
  registrationCompletion,
  depositSummary,
  agreementSummary,
  checkedIn,
  confirmationNumber,
  roomReadiness,
  cashiering,
  cashieringPending,
}: {
  unit: CheckInUnitRead;
  profileNumber: string | null;
  money: (amount: number) => string;
  currentStep: CheckInV2StepId;
  registrationCompletion: RegistrationCompletionProjection | null;
  depositSummary: CheckInPaymentSummary | null;
  agreementSummary: CheckInAgreementSummary | null;
  checkedIn: boolean;
  confirmationNumber: string | null;
  roomReadiness: string | null;
  cashiering: ReservationCashieringSummary | null;
  cashieringPending: boolean;
}) {
  const view = checkInStep1Presentation(unit);
  const charge = moneyText(money, unit.subtotal);
  return (
    <aside
      className="flex flex-col gap-4 rounded-xl border border-[#E8DFD0] bg-white p-4 shadow-sm lg:sticky lg:top-0"
      data-testid="fo-ci-v2-summary"
      data-reservation-room-id={view.progressReservationRoomId ?? ""}
      aria-label="Check-In Summary"
    >
      <p className="text-sm font-semibold text-[#251605]">Check-In Summary</p>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">Guest</p>
        <p className="font-semibold text-[#251605]" data-testid="fo-ci-v2-summary-guest-name">
          {view.guestName}
        </p>
        {profileNumber ? <p className="text-xs text-[#6B5E4E]">{profileNumber}</p> : null}
        {view.bookerFallback ? (
          <span className="mt-1 inline-block rounded-full bg-[#C89933]/15 px-2 py-0.5 text-[10px] font-medium text-[#8B6914]">
            Booker
          </span>
        ) : null}
      </div>
      {confirmationNumber ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Reservation
          </p>
          <p
            className="text-sm font-medium text-[#251605]"
            data-testid="fo-ci-v2-summary-confirmation"
          >
            {confirmationNumber}
          </p>
          <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-summary-status">
            {checkedIn ? "Checked In" : (unit.status ?? "—")}
          </p>
        </div>
      ) : checkedIn ? (
        <p className="text-xs font-medium text-[#436436]" data-testid="fo-ci-v2-summary-status">
          Checked In
        </p>
      ) : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">Stay</p>
        <p className="text-sm font-medium text-[#251605]">
          {formatStayDate(unit.arrivalDate)} {"\u2192"} {formatStayDate(unit.departureDate)}
        </p>
        <p className="text-xs text-[#6B5E4E]">
          {view.nights} night{view.nights === 1 ? "" : "s"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">Room</p>
        <p className="text-sm font-medium text-[#251605]" data-testid="fo-ci-v2-summary-room">
          {view.roomNumber ? `Room ${view.roomNumber}` : "No room assigned"}
        </p>
        {view.roomTypeName ? <p className="text-xs text-[#6B5E4E]">{view.roomTypeName}</p> : null}
        {roomReadiness ? (
          <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-summary-room-readiness">
            {roomReadiness}
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">Guests</p>
        <p className="text-sm font-medium text-[#251605]">
          {unit.adults} Adult{unit.adults === 1 ? "" : "s"}
          {unit.children > 0
            ? ` \u00b7 ${unit.children} Child${unit.children === 1 ? "" : "ren"}`
            : " \u00b7 0 Children"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
          Rate Plan
        </p>
        <p className="text-sm font-medium text-[#251605]">{unit.ratePlanName ?? "—"}</p>
        {charge ? <p className="text-xs text-[#6B5E4E]">{charge} unit subtotal</p> : null}
      </div>
      <CheckInFinanceLines summary={cashiering} pending={cashieringPending} money={money} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
          Registration
        </p>
        <p className="text-sm font-medium text-[#251605]" data-testid="fo-ci-v2-registration-status">
          {registrationCompletion?.label ?? "—"}
        </p>
        {registrationCompletion?.detail ? (
          <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-registration-detail">
            {registrationCompletion.detail}
          </p>
        ) : null}
      </div>
      {depositSummary ? (
        <div data-testid="fo-ci-v2-summary-deposit">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Deposit
          </p>
          <p className="text-xs text-[#251605]">Required: {depositSummary.required}</p>
          <p className="text-xs text-[#251605]">Received: {depositSummary.received}</p>
          <p className="text-xs text-[#251605]">Outstanding: {depositSummary.outstanding}</p>
          <p className="text-xs font-medium text-[#251605]">Status: {depositSummary.status}</p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Guarantee
          </p>
          <p className="text-xs text-[#251605]" data-testid="fo-ci-v2-summary-guarantee">
            {depositSummary.guarantee}
          </p>
          <p className="text-xs text-[#6B5E4E]">{depositSummary.guaranteeNote}</p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Folio
          </p>
          <p className="text-xs text-[#251605]" data-testid="fo-ci-v2-summary-folio">
            {depositSummary.folioScope} scoped
          </p>
        </div>
      ) : null}
      {agreementSummary ? (
        <div data-testid="fo-ci-v2-summary-agreement">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">
            Agreement
          </p>
          <p className="text-xs text-[#251605]">{agreementSummary.version}</p>
          <p className="text-xs font-medium text-[#251605]">Status: {agreementSummary.status}</p>
          {agreementSummary.signedBy ? (
            <p className="text-xs text-[#251605]">Signed by: {agreementSummary.signedBy}</p>
          ) : null}
          {agreementSummary.signedAt ? (
            <p className="text-xs text-[#251605]">Signed at: {agreementSummary.signedAt}</p>
          ) : null}
        </div>
      ) : null}
      <div className="border-t border-[#E8DFD0] pt-3" data-testid="fo-ci-v2-progress">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B5E4E]">Progress</p>
        {CHECKIN_V2_STEPS.map((step) => {
          const stepIndex = CHECKIN_V2_STEPS.findIndex((item) => item.id === step.id);
          const currentIndex = CHECKIN_V2_STEPS.findIndex((item) => item.id === currentStep);
          const registrationLabel =
            step.id === "registration"
              ? registrationProgressLabel({
                  current: step.id === currentStep,
                  visited: stepIndex < currentIndex,
                  completion: registrationCompletion,
                })
              : null;
          const backendDone =
            (step.id === "payment_guarantee" && view.paymentRecorded) ||
            (step.id === "review_checkin" && view.reviewComplete);
          const agreementDone =
            step.id === "agreement_signature" && agreementSummary?.status === "Signed";
          const reviewDone = step.id === "review_checkin" && (checkedIn || view.reviewComplete);
          const completed =
            registrationLabel === "Completed" ||
            (step.id !== "registration" &&
              (stepIndex < currentIndex ||
                agreementDone ||
                reviewDone ||
                (backendDone && step.id !== currentStep)));
          const current =
            step.id === currentStep && !agreementDone && !reviewDone && !completed;
          return (
            <div
              key={step.id}
              className="flex items-center gap-2 py-1"
              data-testid={`fo-ci-v2-progress-${step.id}`}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                  completed && !current && "bg-[#436436] text-white",
                  current && "bg-[#C89933] text-[#251605]",
                  !completed && !current && "bg-[#E8DFD0] text-[#6B5E4E]",
                )}
              >
                {completed ? <Check className="size-3" /> : step.number}
              </span>
              <span
                className={cn(
                  "text-xs",
                  current ? "font-semibold text-[#251605]" : "text-[#6B5E4E]",
                )}
              >
                {step.label}
                <span
                  className="mt-0.5 block text-[10px] font-medium"
                  data-testid={`fo-ci-v2-progress-label-${step.id}`}
                >
                  {registrationLabel ??
                    (current ? "In progress" : completed ? "Completed" : "Pending")}
                </span>
              </span>
              {completed && !current ? (
                <CheckCircle2 className="ml-auto size-3.5 text-[#436436]" />
              ) : null}
              {current ? (
                <Circle className="ml-auto size-3.5 fill-[#C89933] text-[#C89933]" />
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
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
  const returning = Boolean(stayQuery.data?.lastStay);

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
      <div className="flex gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#251605]/10 text-lg font-bold text-[#251605]">
          {view.guestName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#251605]" data-testid="fo-ci-v2-guest-name">
              {view.guestName}
            </p>
            {view.bookerFallback ? (
              <span
                className="rounded-full bg-[#C89933]/15 px-2 py-0.5 text-xs font-medium text-[#8B6914]"
                data-testid="fo-ci-v2-booker-label"
              >
                Booker
              </span>
            ) : null}
            {returning ? (
              <span
                className="rounded-full bg-[#436436]/15 px-2 py-0.5 text-xs font-medium text-[#436436]"
                data-testid="fo-ci-v2-returning-guest"
              >
                Returning Guest
              </span>
            ) : null}
            {guest?.vipStatus ? (
              <span className="rounded-full bg-[#C89933]/15 px-2 py-0.5 text-xs font-medium text-[#8B6914]">
                VIP
              </span>
            ) : null}
          </div>
          {profileNumber ? <p className="text-xs text-[#6B5E4E]">{profileNumber}</p> : null}
          {guestQuery.isError ? (
            <p className="text-sm text-[#6B5E4E]" data-testid="fo-ci-v2-guest-unavailable">
              Guest profile unavailable.
            </p>
          ) : null}
          {guest?.phone ? (
            <p className="flex items-center gap-1.5 text-sm text-[#251605]">
              <Phone className="size-3.5 text-[#6B5E4E]" />
              {guest.phone}
            </p>
          ) : null}
          {guest?.email ? (
            <p className="flex items-center gap-1.5 text-sm text-[#251605]">
              <Mail className="size-3.5 text-[#6B5E4E]" />
              {guest.email}
            </p>
          ) : null}
          {guest?.nationality ? (
            <p className="text-sm text-[#251605]">{guest.nationality}</p>
          ) : null}
          {address ? <p className="text-sm text-[#6B5E4E]">{address}</p> : null}
          {stayQuery.data?.lastStay ? (
            <p className="text-xs text-[#6B5E4E]" data-testid="fo-ci-v2-previous-stay">
              Last stay {formatStayDate(stayQuery.data.lastStay.arrivalDate)} {"\u2192"}{" "}
              {formatStayDate(stayQuery.data.lastStay.departureDate)}
            </p>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function ReservationDetailsSection({
  unit,
  reservation,
  confirmationNumber,
  money,
}: {
  unit: CheckInUnitRead;
  reservation: ReservationDetail | null;
  confirmationNumber: string | null;
  money: (amount: number) => string;
}) {
  const view = checkInStep1Presentation(unit);
  const number = confirmationNumber ?? reservation?.confirmationNumber ?? null;
  const source = reservation?.commercialBookingSource || reservation?.source || null;
  const nightly =
    view.siblings.length === 0 ? uniformNightlyAmount(reservation?.nightlyRates) : null;
  const charge = moneyText(money, unit.subtotal);
  const nightlyText = moneyText(money, nightly);
  return (
    <SectionCard
      title="Reservation Details"
      icon={<Building2 className="size-3.5" />}
      testId="fo-ci-v2-reservation-details"
    >
      <dl>
        {number ? (
          <FieldRow
            label="Reservation No."
            value={<span data-testid="fo-ci-v2-confirmation">{number}</span>}
          />
        ) : null}
        {reservation?.status ? (
          <FieldRow label="Status" value={<ReservationStatusBadge status={reservation.status} />} />
        ) : null}
        {source ? <FieldRow label="Booking Source" value={source} /> : null}
        <FieldRow label="Arrival" value={formatStayDate(unit.arrivalDate)} />
        <FieldRow label="Departure" value={formatStayDate(unit.departureDate)} />
        <FieldRow label="Nights" value={String(view.nights)} />
        {view.roomTypeName ? <FieldRow label="Room Type" value={view.roomTypeName} /> : null}
        {unit.ratePlanName ? <FieldRow label="Rate Plan" value={unit.ratePlanName} /> : null}
        {nightlyText ? <FieldRow label="Nightly Amount" value={nightlyText} /> : null}
        {charge ? (
          <FieldRow
            label="Unit Subtotal"
            value={<span data-testid="fo-ci-v2-subtotal">{charge}</span>}
          />
        ) : null}
        {reservation?.companyName ? (
          <FieldRow label="Company" value={reservation.companyName} />
        ) : null}
        {reservation?.travelAgentName ? (
          <FieldRow label="Travel Agency" value={reservation.travelAgentName} />
        ) : null}
        {reservation?.groupName ? <FieldRow label="Group" value={reservation.groupName} /> : null}
      </dl>
    </SectionCard>
  );
}

function StayUnitDetailsSection({
  unit,
  reservation,
}: {
  unit: CheckInUnitRead;
  reservation: ReservationDetail | null;
}) {
  const view = checkInStep1Presentation(unit);
  const expected = expectedArrivalLabel(reservation?.expectedArrivalAt ?? null);
  return (
    <SectionCard
      title="Stay Details"
      icon={<Clock className="size-3.5" />}
      testId="fo-ci-v2-stay-details"
    >
      <dl>
        {unit.sequence != null ? (
          <FieldRow label="Unit" value={`Room unit ${unit.sequence}`} />
        ) : null}
        <FieldRow label="Arrival" value={formatStayDate(unit.arrivalDate)} />
        <FieldRow label="Departure" value={formatStayDate(unit.departureDate)} />
        <FieldRow label="Adults" value={String(unit.adults)} />
        <FieldRow label="Children" value={String(unit.children)} />
        {expected ? <FieldRow label="Expected Arrival" value={expected} /> : null}
        {reservation?.purposeOfStay ? (
          <FieldRow label="Purpose of Visit" value={reservation.purposeOfStay} />
        ) : null}
        {unit.status ? (
          <FieldRow
            label="Unit Status"
            value={<ReservationStatusBadge status={unit.status as never} />}
          />
        ) : null}
        {view.legacyNoUnit ? <FieldRow label="Room Unit" value="Legacy stay" /> : null}
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
        <div className="space-y-2">
          <p className="text-lg font-semibold text-[#251605]" data-testid="fo-ci-v2-room-number">
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
        <div
          className="rounded-xl border border-dashed border-[#C89933]/50 bg-[#C89933]/5 p-4 text-center"
          data-testid="fo-ci-v2-room-unassigned"
        >
          <p className="text-sm font-semibold text-[#8B6914]">No room assigned</p>
          <p className="mt-1 text-xs text-[#6B5E4E]">
            Assign a room of this room type. Assignable and not-ready rooms are listed separately.
          </p>
        </div>
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
        ? "Add Guest is unavailable because named guests already match adults plus children."
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
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-[#251605]">{view.occupants[0].name}</p>
                <span className="rounded-full bg-[#C89933]/15 px-2 py-0.5 text-xs font-medium text-[#8B6914]">
                  Primary Guest
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#6B5E4E]">
                {unit.adults} Adult{unit.adults === 1 ? "" : "s"} · {unit.children} Child{unit.children === 1 ? "" : "ren"}
              </p>
            </div>
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
              Guest capacity reached.
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
              Guest capacity reached.
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

function SpecialRequestsSection({ requests }: { requests?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = Boolean(requests && requests.length > 120);

  return (
    <SectionCard
      title="Special Requests"
      icon={<Clock className="size-3.5" />}
      testId="fo-ci-v2-requests"
    >
      {requests ? (
        <div className="space-y-1">
          <p
            className={cn("text-sm text-[#251605]", !expanded && isLong && "line-clamp-2")}
            data-testid="fo-ci-v2-special-requests"
          >
            {requests}
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
      ) : (
        <p className="text-sm text-[#6B5E4E]">No special requests.</p>
      )}
    </SectionCard>
  );
}

function InternalNotesSection({ notes }: { notes?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = Boolean(notes && notes.length > 120);

  return (
    <SectionCard
      title="Internal Notes"
      icon={<Clock className="size-3.5" />}
      testId="fo-ci-v2-internal-notes"
    >
      {notes ? (
        <div className="space-y-1">
          <p
            className={cn("text-sm text-[#251605]", !expanded && isLong && "line-clamp-2")}
            data-testid="fo-ci-v2-internal-note"
          >
            {notes}
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
      ) : (
        <p className="text-sm text-[#6B5E4E]">No internal notes.</p>
      )}
    </SectionCard>
  );
}

function PackagesRateSection({
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
  return (
    <SectionCard
      title="Packages & Rate"
      icon={<Building2 className="size-3.5" />}
      testId="fo-ci-v2-packages"
    >
      <dl>
        <FieldRow label="Rate Plan" value={unit.ratePlanName || "BAR — Best Available Rate"} />
        {nightlyText ? <FieldRow label="Nightly Amount" value={nightlyText} /> : null}
        <FieldRow label="Unit Subtotal" value={charge || "—"} />
        {unit.packages.length > 0 ? (
          <>
            <p className="my-1.5 text-xs text-[#6B5E4E]">
              Package amounts include the taxes the folio posts on them.
            </p>
            {unit.packages.map((pkg) => (
              <FieldRow
                key={pkg.id}
                label={pkg.packageName}
                value={
                  pkg.appliedAmount == null
                    ? "—"
                    : (moneyText(
                        money,
                        packageChargeFigures(pkg.appliedAmount, packageRules.data).total,
                      ) ?? "—")
                }
              />
            ))}
          </>
        ) : (
          <FieldRow label="Packages" value="None" />
        )}
        {services.lines.length > 0 ? (
          <div data-testid="fo-ci-v2-services">
            <p className="my-1.5 text-xs text-[#6B5E4E]">
              Reservation services post to the folio at check-in, taxed by pricing unit.
            </p>
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
      current.roomReadiness === actions.roomReadiness
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
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "z-[70] flex h-dvh flex-col gap-0 overflow-hidden border-l bg-[#FBF7F1] p-0 shadow-xl [&>button.absolute]:hidden",
          FO_CHECKIN_V2_SHEET_CLASS,
        )}
        data-testid="fo-ci-v2-workspace"
      >
        <SheetHeader className="shrink-0 border-b border-[#E8DFD0] bg-white px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle className="text-xl font-extrabold text-[#251605]">Check-In</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs text-[#6B5E4E]">
                Find reservation and review guest and booking details
              </SheetDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="fo-ci-v2-refresh"
              onClick={() => {
                void unitQuery.refetch();
                void reservationQuery.refetch();
                void readinessQuery.refetch();
                void cashieringQuery.refetch();
              }}
            >
              Refresh
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              onClick={() => handleOpenChange(false)}
              aria-label="Close check-in workspace"
              data-testid="fo-ci-v2-close-btn"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 overflow-x-auto pb-1">
            <StepRail
              currentStep={step}
              complete={
                step === "review_checkin" &&
                (reviewActions.checkedIn || unitAlreadyCheckedIn(unitQuery.data?.status))
              }
            />
          </div>
        </SheetHeader>

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
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-5">
              <div className="min-w-0 space-y-4" data-testid="fo-ci-v2-step1-main">
                {step === "guest_reservation" ? (
                  <>
                    <div
                      className="rounded-xl border border-[#E8DFD0] bg-white px-4 py-3"
                      data-testid="fo-ci-v2-reservation-header"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#251605]">Reservation loaded</p>
                        {(confirmationNumber ?? reservation?.confirmationNumber) ? (
                          <span
                            className="font-mono text-sm font-bold text-[#251605]"
                            data-testid="fo-ci-v2-header-confirmation"
                          >
                            {confirmationNumber ?? reservation?.confirmationNumber}
                          </span>
                        ) : null}
                        {unit.status ? (
                          <ReservationStatusBadge status={unit.status as never} />
                        ) : null}
                      </div>
                      <p
                        className="mt-1 text-base font-bold text-[#251605]"
                        data-testid="fo-ci-v2-header-guest-name"
                      >
                        {view.guestName}
                      </p>
                      <p className="text-xs text-[#6B5E4E]">
                        {formatStayDate(unit.arrivalDate)} {"\u2192"}{" "}
                        {formatStayDate(unit.departureDate)} {"\u00b7"} {view.nights} night
                        {view.nights === 1 ? "" : "s"}
                        {view.roomTypeName ? ` \u00b7 ${view.roomTypeName}` : ""}
                        {view.roomNumber ? ` \u00b7 Room ${view.roomNumber}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[#6B5E4E]">
                        Loaded reservation. This is not a check-in readiness result.
                      </p>
                    </div>
                    {stepReadiness && stepReadiness.hardBlockers.length > 0 ? (
                      <div
                        className="rounded-xl border border-[#C89933]/40 bg-[#C89933]/10 px-4 py-3"
                        data-testid="fo-ci-v2-step1-blockers"
                      >
                        {stepReadiness.hardBlockers.map((blocker) => (
                          <p key={blocker.code} className="text-sm text-[#8B6914]">
                            {blocker.message}
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
                    <div className="grid gap-4 xl:grid-cols-3">
                      <GuestInformationSection
                        restaurantId={restaurantId}
                        unit={unit}
                        onProfileNumber={setProfileNumber}
                      />
                      <ReservationDetailsSection
                        unit={unit}
                        reservation={reservation}
                        confirmationNumber={confirmationNumber ?? null}
                        money={money}
                      />
                      <StayUnitDetailsSection unit={unit} reservation={reservation} />
                    </div>
                    {/* Operational Row: Room Assignment & Guests for this stay */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <RoomAssignmentSection
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        unit={unit}
                        assignmentNotes={unitNotes}
                        onChanged={reloadUnit}
                      />
                      <GuestListSection
                        restaurantId={restaurantId}
                        reservationId={reservationId}
                        unit={unit}
                        onChanged={reloadUnit}
                      />
                    </div>
                    {/* Context Row: Special Requests & Internal Notes */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <SpecialRequestsSection requests={reservation?.specialRequests} />
                      <InternalNotesSection notes={reservation?.notes} />
                    </div>
                    {/* Commercial Row: Payment & Deposit & Packages & Rate */}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <CheckInFinanceSection
                        summary={cashieringQuery.data ?? null}
                        pending={cashieringQuery.isLoading}
                        money={money}
                      />
                      <PackagesRateSection
                        restaurantId={restaurantId}
                        unit={unit}
                        reservation={reservation}
                        money={money}
                      />
                    </div>
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
                  <div className="space-y-4">
                    <FoCheckInV2Key
                      restaurantId={restaurantId}
                      reservationId={reservationId}
                      reservationRoomId={activeRoomId}
                      unit={unit}
                      onRefresh={reloadUnit}
                    />
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
                    />
                  </div>
                ) : null}
              </div>
              <div data-testid="fo-ci-v2-summary-col">
                <CheckInSummaryColumn
                  unit={unit}
                  profileNumber={profileNumber}
                  money={money}
                  currentStep={step}
                  registrationCompletion={registrationCompletion}
                  depositSummary={depositSummary}
                  agreementSummary={agreementSummary}
                  checkedIn={reviewActions.checkedIn || unitAlreadyCheckedIn(unit.status)}
                  confirmationNumber={confirmationNumber ?? reservation?.confirmationNumber ?? null}
                  roomReadiness={reviewActions.roomReadiness}
                  cashiering={cashieringQuery.data ?? null}
                  cashieringPending={cashieringQuery.isLoading}
                />
              </div>
            </div>
          )}
        </div>

        <footer
          className="shrink-0 border-t border-[#E8DFD0] bg-white px-5 py-3"
          data-testid="fo-ci-v2-footer"
        >
          <div className="flex items-center justify-between gap-3">
            {step === "registration" ? (
              <Button
                variant="outline"
                onClick={() => setStep("guest_reservation")}
                data-testid="fo-ci-v2-back-guest"
              >
                Back
              </Button>
            ) : step === "payment_guarantee" ? (
              <Button
                variant="outline"
                onClick={() => setStep("registration")}
                data-testid="fo-ci-v2-back-registration"
              >
                Back
              </Button>
            ) : step === "agreement_signature" ? (
              <Button
                variant="outline"
                onClick={() => setStep("payment_guarantee")}
                data-testid="fo-ci-v2-back-payment"
              >
                Back
              </Button>
            ) : step === "guest_reservation" ? (
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                data-testid="fo-ci-v2-cancel-btn"
              >
                Cancel
              </Button>
            ) : step === "review_checkin" ? (
              <Button
                variant="outline"
                onClick={() => setStep("agreement_signature")}
                data-testid="fo-ci-v2-back-agreement"
              >
                Back
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStep("payment_guarantee")}>
                Back
              </Button>
            )}
            {step === "registration" ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                data-testid="fo-ci-v2-save-continue"
                onClick={() => {
                  void registrationRef.current?.save().then((saved) => {
                    if (saved) setStep("payment_guarantee");
                  });
                }}
              >
                Save & Continue
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : step === "payment_guarantee" ? (
              <Button
                className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                data-testid="fo-ci-v2-continue-agreement"
                disabled={!depositSatisfied}
                onClick={() => setStep("agreement_signature")}
              >
                Continue to Agreement & Signature
                <ArrowRight className="ml-2 size-4" />
              </Button>
            ) : step === "guest_reservation" ? (
              <div className="flex flex-col items-end gap-1">
                <Button
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                  onClick={() => setStep("registration")}
                  data-testid="fo-ci-v2-next-registration"
                  disabled={!canContinueStep}
                >
                  Next: Registration
                  <ArrowRight className="ml-2 size-4" />
                </Button>
                {!canContinueStep ? (
                  <p className="text-xs text-[#8B6914]" data-testid="fo-ci-v2-next-blocker">
                    {readinessQuery.isError
                      ? readinessQuery.error instanceof Error
                        ? readinessQuery.error.message
                        : "Check-in readiness could not be loaded."
                      : (stepReadiness?.continueMessage ??
                        (unit ? "Checking check-in readiness…" : "Load the reservation first."))}
                  </p>
                ) : null}
              </div>
            ) : step === "agreement_signature" ? (
              agreementSigned ? (
                <Button
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
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
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    data-testid="fo-ci-v2-sign-agreement-footer"
                    disabled={!agreementActions.canSign || agreementActions.busy}
                    onClick={() => void agreementRef.current?.sign()}
                  >
                    {agreementActions.busy ? "Signing…" : "Sign Agreement"}
                  </Button>
                </div>
              )
            ) : step === "review_checkin" ? (
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
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    data-testid="fo-ci-v2-complete-checkin"
                    disabled={!reviewActions.canComplete || reviewActions.busy}
                    aria-describedby="fo-ci-v2-complete-reason"
                    onClick={() => reviewRef.current?.requestComplete()}
                  >
                    {reviewActions.busy ? "Completing…" : "Complete Check-In"}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
