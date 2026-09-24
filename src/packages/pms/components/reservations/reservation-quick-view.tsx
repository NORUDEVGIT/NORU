import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  BedDouble,
  CalendarDays,
  ClipboardList,
  Contact,
  DoorOpen,
  ExternalLink,
  FileText,
  Hotel,
  LogIn,
  LogOut,
  NotebookText,
  UserRound,
} from "lucide-react";

import { ReservationStatusBadge } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import {
  getReservationContextActions,
  type ReservationContextActionId,
} from "@/packages/pms/components/reservations/reservation-context-actions";
import { ReservationContextMenu } from "@/packages/pms/components/reservations/reservation-context-menu";
import type {
  QuickViewExceptionKey,
  ReservationDeskRow,
  ReservationQuickView,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

type QuickViewTab = "overview" | "guest" | "stay" | "notes";

const TABS: Array<{ id: QuickViewTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "guest", label: "Guest" },
  { id: "stay", label: "Stay Details" },
  { id: "notes", label: "Notes" },
];

const EXCEPTION_LABELS: Record<QuickViewExceptionKey, string> = {
  unassigned: "Unassigned",
  room_unavailable: "Room unavailable",
  room_not_ready: "Room not ready",
  missing_rate_snapshot: "Missing rate snapshot",
  overdue_arrival: "Overdue arrival",
  overdue_departure: "Overstay",
};

export function ReservationQuickViewPanel({
  row,
  loading,
  error,
  quickView,
  onRetry,
  businessDate,
  canManage,
  onAction,
}: {
  row: ReservationDeskRow | null;
  loading: boolean;
  error: boolean;
  quickView: ReservationQuickView | undefined;
  onRetry: () => void;
  businessDate: string;
  canManage: boolean;
  onAction: (actionId: ReservationContextActionId) => void;
}) {
  const [tab, setTab] = useState<QuickViewTab>("overview");

  useEffect(() => {
    setTab("overview");
  }, [row?.reservationId]);

  if (!row) return <NoSelection />;

  const actionContext = {
    status: quickView?.stay.status ?? row.status,
    roomId: quickView?.room.roomId ?? row.roomId,
    arrivalDate: quickView?.stay.arrivalDate ?? row.arrivalDate,
    businessDate: quickView?.businessDate ?? businessDate,
    hints: quickView?.actionHints ?? row.hints,
    canManage,
    ...(quickView
      ? {
          financial: {
            state: quickView.financial.state,
            folioId: quickView.financial.folioId,
          },
        }
      : {}),
  };
  const actions = getReservationContextActions(actionContext);
  const visibleActions = new Set(actions.map((action) => action.id));

  return (
    <aside
      className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm"
      aria-label={`Quick View for reservation ${row.confirmationNumber}`}
      data-testid="reservation-quick-view"
    >
      <header className="border-b border-border bg-[#FAF8F4] px-4 pb-0 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#765719]">{row.confirmationNumber}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-xl font-semibold text-[#251605]">
                {row.guestName}
              </h2>
              {(quickView?.identity.vip ?? row.guestVip) ? <VipBadge /> : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ReservationStatusBadge status={quickView?.stay.status ?? row.status} />
            <ReservationContextMenu
              context={actionContext}
              onAction={onAction}
              triggerLabel={`Actions for reservation ${row.confirmationNumber}`}
            />
          </div>
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto" role="tablist" aria-label="Quick View">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`quick-view-${item.id}`}
              onClick={() => setTab(item.id)}
              className={cn(
                "shrink-0 border-b-2 pb-2 text-xs font-medium transition-colors",
                tab === item.id
                  ? "border-[#C89933] text-[#6B4A0A]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <QuickViewSkeleton />
        ) : error ? (
          <QuickViewError onRetry={onRetry} />
        ) : quickView ? (
          <div id={`quick-view-${tab}`} role="tabpanel">
            {tab === "overview" ? <OverviewTab quickView={quickView} /> : null}
            {tab === "guest" ? <GuestTab quickView={quickView} /> : null}
            {tab === "stay" ? <StayDetailsTab quickView={quickView} /> : null}
            {tab === "notes" ? <NotesTab quickView={quickView} /> : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 border-t border-border bg-[#FAF8F4] p-3">
        <Button
          className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
          onClick={() => onAction("open")}
        >
          <ExternalLink className="size-4" />
          Open Reservation
        </Button>
        {quickView ? (
          <div className="grid grid-cols-2 gap-2">
            {visibleActions.has("assign_room") ? (
              <Button
                variant="outline"
                className="justify-start text-xs"
                onClick={() => onAction("assign_room")}
              >
                <BedDouble className="size-3.5" />
                Assign Room
              </Button>
            ) : null}
            {visibleActions.has("change_room") ? (
              <Button
                variant="outline"
                className="justify-start text-xs"
                onClick={() => onAction("change_room")}
              >
                <DoorOpen className="size-3.5" />
                Change Room
              </Button>
            ) : null}
            {visibleActions.has("check_in") ? (
              <Button
                variant="outline"
                className="justify-start text-xs"
                onClick={() => onAction("check_in")}
              >
                <LogIn className="size-3.5" />
                Check In
              </Button>
            ) : null}
            {visibleActions.has("check_out") ? (
              <Button
                variant="outline"
                className="justify-start text-xs"
                onClick={() => onAction("check_out")}
              >
                <LogOut className="size-3.5" />
                Check Out
              </Button>
            ) : null}
            {visibleActions.has("open_folio") ? (
              <Button
                variant="outline"
                className="justify-start text-xs"
                onClick={() => onAction("open_folio")}
              >
                <Banknote className="size-3.5" />
                Open Folio
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function OverviewTab({ quickView }: { quickView: ReservationQuickView }) {
  return (
    <div className="space-y-4">
      <DetailSection icon={<CalendarDays className="size-3.5" />} title="Stay Summary">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          <Field label="Arrival" value={formatDate(quickView.stay.arrivalDate)} />
          <Field label="Departure" value={formatDate(quickView.stay.departureDate)} />
          <Field label="Nights" value={quickView.stay.nights} />
          <Field
            label="Guests"
            value={`${quickView.stay.adults} adult${quickView.stay.adults === 1 ? "" : "s"} · ${quickView.stay.children} children`}
          />
          <Field label="Status" value={humanize(quickView.stay.status)} />
        </dl>
      </DetailSection>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <DetailCard icon={<BedDouble className="size-3.5" />} title="Room">
          <dl className="space-y-2">
            <Info label="Room Type" value={quickView.room.roomTypeName} />
            <Info
              label="Assigned"
              value={quickView.room.assigned ? quickView.room.roomNumber : "Unassigned"}
            />
            <Info label="Operational" value={humanize(quickView.room.operationalStatus)} />
            <Info label="Housekeeping" value={humanize(quickView.room.housekeepingStatus)} />
          </dl>
        </DetailCard>

        <DetailCard icon={<Hotel className="size-3.5" />} title="Commercial">
          <dl className="space-y-2">
            <Info label="Source" value={humanize(quickView.stay.source)} />
            <Info label="Rate Plan" value={quickView.commercial.ratePlanName} />
            <Info
              label="Room Total"
              value={formatMoney(quickView.commercial.roomSubtotal, quickView.commercial.currency)}
            />
            <Info label="Booking Source" value={quickView.commercial.commercialBookingSource} />
            <Info label="Market Segment" value={quickView.commercial.marketSegment} />
            <Info label="Guarantee" value={quickView.commercial.guaranteeMethod} />
          </dl>
        </DetailCard>
      </div>

      <FinancialCard quickView={quickView} />

      {quickView.operational.exceptionKeys.length ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle className="size-4 shrink-0" />
            <h3 className="text-xs font-semibold">Needs attention</h3>
          </div>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-amber-900">
            {quickView.operational.exceptionKeys.map((key) => (
              <li key={key}>{EXCEPTION_LABELS[key]}</li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-800">No active exceptions</p>
        </section>
      )}

      <DetailSection icon={<ClipboardList className="size-3.5" />} title="Operational">
        <dl className="space-y-3">
          <Field label="Special requests" value={quickView.operational.specialRequests} />
          <Field
            label="Last history event"
            value={
              quickView.operational.lastHistoryEvent
                ? `${humanize(quickView.operational.lastHistoryEvent.eventType)} · ${formatDateTime(
                    quickView.operational.lastHistoryEvent.createdAt,
                  )}`
                : null
            }
          />
          {quickView.operational.lastHistoryEvent?.notes ? (
            <Field label="Event note" value={quickView.operational.lastHistoryEvent.notes} />
          ) : null}
        </dl>
      </DetailSection>
    </div>
  );
}

function GuestTab({ quickView }: { quickView: ReservationQuickView }) {
  return (
    <div className="space-y-4">
      <DetailSection icon={<UserRound className="size-3.5" />} title="Guest">
        <dl className="space-y-3 text-xs">
          <Info label="Name" value={quickView.identity.guestName} />
          <Info label="Phone" value={quickView.identity.phone} />
          <Info label="Email" value={quickView.identity.email} />
          <Info label="VIP" value={quickView.identity.vip ? "Yes" : "No"} />
        </dl>
      </DetailSection>
      <DetailSection icon={<Contact className="size-3.5" />} title="Relationships">
        <dl className="space-y-3 text-xs">
          <Info label="Company" value={quickView.identity.company?.name} />
          <Info label="Travel Agent" value={quickView.identity.travelAgent?.name} />
          <Info label="Group" value={quickView.identity.group?.name} />
        </dl>
      </DetailSection>
    </div>
  );
}

function StayDetailsTab({ quickView }: { quickView: ReservationQuickView }) {
  return (
    <div className="space-y-4">
      <DetailSection icon={<CalendarDays className="size-3.5" />} title="Stay">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Arrival" value={formatDate(quickView.stay.arrivalDate)} />
          <Field label="Departure" value={formatDate(quickView.stay.departureDate)} />
          <Field label="Nights" value={quickView.stay.nights} />
          <Field label="Adults" value={quickView.stay.adults} />
          <Field label="Children" value={quickView.stay.children} />
          <Field label="Status" value={humanize(quickView.stay.status)} />
        </dl>
      </DetailSection>
      <DetailSection icon={<DoorOpen className="size-3.5" />} title="Room Assignment">
        <dl className="space-y-3 text-xs">
          <Info label="Room Type" value={quickView.room.roomTypeName} />
          <Info label="Room Number" value={quickView.room.roomNumber} />
          <Info label="Assignment" value={quickView.room.assigned ? "Assigned" : "Unassigned"} />
          <Info label="Housekeeping" value={humanize(quickView.room.housekeepingStatus)} />
          <Info label="Operational" value={humanize(quickView.room.operationalStatus)} />
        </dl>
      </DetailSection>
      <DetailSection icon={<Hotel className="size-3.5" />} title="Booking">
        <dl className="space-y-3 text-xs">
          <Info label="Source" value={humanize(quickView.stay.source)} />
          <Info label="Rate Plan" value={quickView.commercial.ratePlanName} />
          <Info label="Guarantee" value={quickView.commercial.guaranteeMethod} />
          <Info label="Updated" value={formatDateTime(quickView.updatedAt)} />
        </dl>
      </DetailSection>
    </div>
  );
}

function NotesTab({ quickView }: { quickView: ReservationQuickView }) {
  const hasNotes = Boolean(
    quickView.operational.notes?.trim() || quickView.operational.specialRequests?.trim(),
  );
  if (!hasNotes) {
    return (
      <EmptyTab
        icon={<NotebookText className="size-5" />}
        title="No reservation notes"
        description="Notes and special requests recorded on this reservation will appear here."
      />
    );
  }
  return (
    <div className="space-y-4">
      <NoteCard
        title="Reservation notes"
        value={quickView.operational.notes}
        icon={<FileText className="size-4" />}
      />
      <NoteCard
        title="Special requests"
        value={quickView.operational.specialRequests}
        icon={<ClipboardList className="size-4" />}
      />
    </div>
  );
}

function FinancialCard({ quickView }: { quickView: ReservationQuickView }) {
  if (quickView.financial.state === "permission_denied") {
    return (
      <DetailCard icon={<Banknote className="size-3.5" />} title="Financial">
        <p className="text-xs text-muted-foreground">Financial details unavailable.</p>
      </DetailCard>
    );
  }
  if (quickView.financial.state === "not_available") {
    return (
      <DetailCard icon={<Banknote className="size-3.5" />} title="Financial">
        <p className="text-xs text-muted-foreground">Financial signal is not available.</p>
      </DetailCard>
    );
  }
  return (
    <DetailCard icon={<Banknote className="size-3.5" />} title="Financial">
      {quickView.financial.folioId ? (
        <dl className="space-y-2">
          <Info label="Folio" value={quickView.financial.folioNumber ?? "Available"} />
          <Info
            label="Balance"
            value={formatMoney(quickView.financial.balance, quickView.commercial.currency)}
          />
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">No folio is available for this reservation.</p>
      )}
    </DetailCard>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#251605]">
        <span className="text-[#8A641A]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-[#FAF8F4] p-3">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#251605]">
        <span className="text-[#8A641A]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-medium text-foreground">{display(value)}</dd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(84px,auto)_minmax(0,1fr)] items-start gap-x-3">
      <dt className="text-[10px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-xs font-medium leading-5 text-foreground">
        {display(value)}
      </dd>
    </div>
  );
}

function NoteCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | null;
  icon: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-[#FAF8F4] p-4">
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <span className="text-[#8A641A]">{icon}</span>
        {title}
      </h3>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
        {value?.trim() || "—"}
      </p>
    </section>
  );
}

function EmptyTab({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
      <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5">{description}</p>
    </div>
  );
}

function NoSelection() {
  return (
    <div className="grid min-h-[520px] place-items-center rounded-xl border border-dashed border-[#CFC4B4] bg-white p-6 text-center">
      <div>
        <div className="mx-auto grid size-10 place-items-center rounded-full bg-[#F4E9D0] text-[#8A641A]">
          <ClipboardList className="size-5" />
        </div>
        <p className="mt-3 font-medium text-[#251605]">Select a reservation to view details</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Quick View shows stay, room, commercial and operational information.
        </p>
      </div>
    </div>
  );
}

function QuickViewSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading reservation details">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function QuickViewError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">Could not load Quick View.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        The selected reservation remains available. Try loading its operational summary again.
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function display(value: ReactNode): ReactNode {
  return value === null || value === undefined || value === "" ? "—" : value;
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency ?? "GBP",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toFixed(2)}`.trim();
  }
}

function humanize(value: string | null): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
