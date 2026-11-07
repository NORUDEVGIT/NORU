import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, X } from "lucide-react";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { ArrivalEtaEditor } from "@/packages/pms/components/workspaces/arrivals-departures-dialogs";
import { getFolio, type FolioDetail } from "@/packages/pms/lib/cashiering.functions";
import { foGuestDisplayId, foGuestIdLooksLikeUuid } from "@/packages/pms/lib/fo-check-in-workspace";
import { HK_STATUS_LABELS, type HkStatusCode } from "@/packages/pms/lib/pms-set4-hk-inventory";
import { FOLIO_MISSING_COPY, folioLedgerSummary } from "@/packages/pms/lib/reservation-detail-folio";
import type { ArrivalExceptionKey, ArrivalRow } from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { formatClockInZone } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "room", label: "Room" },
  { id: "eta", label: "ETA" },
  { id: "folio", label: "Folio" },
] as const;

type ArrivalGuestTab = (typeof TABS)[number]["id"];

const ARRIVAL_EXCEPTION_LABELS: Record<ArrivalExceptionKey, string> = {
  unassigned: "Unassigned",
  room_not_ready: "Room not ready",
  room_unavailable: "Room unavailable",
  payment_issue: "Payment issue",
  special_request: "Special request",
};

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-500/25 text-[#F3E9D8]",
  confirmed: "bg-emerald-500/25 text-[#F3E9D8]",
  cancelled: "bg-white/10 text-[#F3E9D8]",
  checked_in: "bg-white/15 text-[#F3E9D8]",
  checked_out: "bg-white/10 text-[#C4B6A0]",
  no_show: "bg-white/10 text-[#F3E9D8]",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  checked_in: "In-House",
  checked_out: "Checked Out",
  no_show: "No-Show",
};

function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Cashiering balance = charges − credits. Positive is amount due; negative is credit. */
export function formatArrivalBalance(value: number | null, currency: string): string {
  if (value == null) return "—";
  if (value < 0) return `Credit ${formatMoney(Math.abs(value), currency)}`;
  return formatMoney(value, currency);
}

function financialBalanceLabel(financial: ArrivalRow["financial"], currency: string): string {
  if (financial.state === "permission_denied") return "Permission denied";
  if (financial.state !== "available") return "Coming soon";
  if (financial.balance != null) return formatArrivalBalance(financial.balance, currency);
  if (financial.folioId) return "Folio open";
  return "No folio";
}

function hkLabel(status: string | null): string {
  if (!status) return "—";
  if (status in HK_STATUS_LABELS) return HK_STATUS_LABELS[status as HkStatusCode];
  return status.replaceAll("_", " ");
}

function guestIdLabel(guestId: string): string {
  return foGuestDisplayId(guestId) ?? (foGuestIdLooksLikeUuid(guestId) ? "—" : guestId);
}

function checkInBlocker(row: ArrivalRow): string | null {
  if (row.hints.canCheckIn) return null;
  if (!row.room.assigned) return "Assign a room before check-in.";
  if (row.stay.status !== "confirmed") {
    return "Check-in is available after the reservation is confirmed.";
  }
  if (!row.room.ready) return "Room is not ready for check-in.";
  return "Check-in is not available for this arrival.";
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm leading-5">
      <dt className="text-[#7A6B58]">{label}</dt>
      <dd className="max-w-[60%] text-right font-medium text-[#251605]">{value}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">{title}</h2>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </section>
  );
}

export function ArrivalGuestWorkspace({
  restaurantId,
  row,
  open,
  timezone,
  currencyCode,
  canManage,
  onClose,
  onOpenReservation,
  onOpenHistory,
  onSaved,
}: {
  restaurantId: string;
  row: ArrivalRow | null;
  open: boolean;
  timezone: string;
  currencyCode: string;
  canManage: boolean;
  onClose: () => void;
  onOpenReservation: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<ArrivalGuestTab>("overview");

  useEffect(() => {
    setTab("overview");
  }, [row?.reservationId]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="arrival-quick-view"
        className="z-[60] flex h-fit max-h-[85vh] w-[min(92vw,860px)] max-w-[860px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[860px] [&>button.absolute]:hidden"
      >
        {row ? (
          <ArrivalGuestBody
            restaurantId={restaurantId}
            row={row}
            tab={tab}
            onTab={setTab}
            timezone={timezone}
            currencyCode={currencyCode}
            canManage={canManage}
            onClose={onClose}
            onOpenReservation={onOpenReservation}
            onOpenHistory={onOpenHistory}
            onSaved={onSaved}
          />
        ) : (
          <>
            <DialogTitle className="sr-only">Arrival</DialogTitle>
            <DialogDescription className="sr-only">Arrival guest details</DialogDescription>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArrivalGuestBody({
  restaurantId,
  row,
  tab,
  onTab,
  timezone,
  currencyCode,
  canManage,
  onClose,
  onOpenReservation,
  onOpenHistory,
  onSaved,
}: {
  restaurantId: string;
  row: ArrivalRow;
  tab: ArrivalGuestTab;
  onTab: (tab: ArrivalGuestTab) => void;
  timezone: string;
  currencyCode: string;
  canManage: boolean;
  onClose: () => void;
  onOpenReservation: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onSaved: () => void;
}) {
  const assignmentLabel = row.room.assigned
    ? row.room.roomNumber
      ? `Room ${row.room.roomNumber}`
      : "Assigned"
    : "Unassigned";
  const readinessLabel = row.room.assigned
    ? row.room.ready
      ? "Ready"
      : "Not ready"
    : "Unassigned";
  const eligibilityLabel = row.room.assigned
    ? row.hints.canCheckIn
      ? "Eligible for check-in"
      : checkInBlocker(row) ?? "Not eligible"
    : "Assign a room before check-in.";

  function onException(key: ArrivalExceptionKey) {
    if (key === "unassigned" || key === "room_not_ready" || key === "room_unavailable") {
      onTab("room");
      return;
    }
    if (key === "payment_issue") onTab("folio");
  }

  return (
    <div className="flex min-h-0 flex-col">
      <header className="relative shrink-0 bg-[#1F140A] px-4 py-2 pr-3 text-[#F3E9D8]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
              <span className="truncate">
                {row.confirmationNumber}
                <span className="text-[#8A7A61]"> · </span>
                {row.guest.name}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_CHIP[row.stay.status] ?? "bg-white/10 text-[#F3E9D8]",
                )}
              >
                {STATUS_LABEL[row.stay.status] ?? row.stay.status}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                {assignmentLabel}
              </span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                  aria-label="Arrival actions"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]">
                {row.hints.canOpen ? (
                  <DropdownMenuItem onSelect={() => onOpenReservation(row.reservationId)}>
                    Open Reservation
                  </DropdownMenuItem>
                ) : null}
                {row.hints.canViewGuest ? (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/restaurant/pms/guests/$guestId"
                      params={{ guestId: row.guest.id }}
                    >
                      View Guest
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {canManage && row.hints.canUpdateEta ? (
                  <DropdownMenuItem onSelect={() => onTab("eta")}>Update ETA</DropdownMenuItem>
                ) : null}
                {row.hints.canOpenFolio && row.financial.folioId ? (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/restaurant/pms/cashiering/folios/$folioId"
                      params={{ folioId: row.financial.folioId }}
                    >
                      Open Folio
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => onOpenHistory(row.reservationId)}>
                  History
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <DialogTitle className="sr-only">
          {row.confirmationNumber} · {row.guest.name}
        </DialogTitle>
        <DialogDescription className="sr-only">Arrival guest details</DialogDescription>
      </header>
      <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
      <div className="flex min-h-0 flex-col bg-[#F7F4EE]">
        <nav
          className="shrink-0 overflow-x-auto border-b border-[#E8DFD0] bg-[#FBF7F1]"
          aria-label="Arrival sections"
        >
          <ul role="tablist" className="flex min-w-max items-center gap-0.5 px-3">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <li key={item.id} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onTab(item.id)}
                    className={cn(
                      "relative whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors",
                      "outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                      active
                        ? "text-[#251605] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#C89933]"
                        : "text-[#5C5346] hover:text-[#251605]",
                    )}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-h-0 overflow-y-auto p-3">
          {tab === "overview" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Card title="Stay">
                <Fact label="Arrival" value={formatStayDate(row.stay.arrivalDate)} />
                <Fact label="Departure" value={formatStayDate(row.stay.departureDate)} />
                <Fact label="Nights" value={String(row.stay.nights)} />
                <Fact
                  label="Adults / Children"
                  value={`${row.stay.adults} / ${row.stay.children}`}
                />
                <Fact label="Room Type" value={row.room.roomTypeName || "—"} />
                <Fact
                  label="Reservation Status"
                  value={STATUS_LABEL[row.stay.status] ?? row.stay.status}
                />
              </Card>
              <Card title="Guest">
                <Fact label="Guest Name" value={row.guest.name} />
                <Fact label="Guest ID" value={guestIdLabel(row.guest.id)} />
                <Fact label="Phone" value={row.guest.phone?.trim() || "—"} />
                <Fact label="Email" value={row.guest.email?.trim() || "—"} />
              </Card>
              <Card title="Operational Status">
                <Fact label="Assignment" value={assignmentLabel} />
                <Fact label="Room Readiness" value={readinessLabel} />
                <Fact
                  label="ETA"
                  value={formatClockInZone(row.operational.expectedArrivalTime, timezone)}
                />
                <Fact label="Guarantee" value={row.commercial.guaranteeMethod ?? "—"} />
                <Fact label="Balance" value={financialBalanceLabel(row.financial, currencyCode)} />
                <Fact label="Special Requests" value={row.operational.specialRequests?.trim() || "—"} />
              </Card>
              <section className="rounded-lg border border-[#DDD4C5] bg-white p-3 shadow-sm sm:col-span-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A6B58]">
                  Exceptions
                </h2>
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.operational.exceptionKeys.length === 0 ? (
                    <span className="text-sm text-[#7A6B58]">None</span>
                  ) : (
                    row.operational.exceptionKeys.map((key) => {
                      const clickable =
                        key === "unassigned" ||
                        key === "room_not_ready" ||
                        key === "room_unavailable" ||
                        key === "payment_issue";
                      const label = ARRIVAL_EXCEPTION_LABELS[key];
                      const className =
                        "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-950";
                      return clickable ? (
                        <button
                          key={key}
                          type="button"
                          className={className}
                          onClick={() => onException(key)}
                        >
                          {label}
                        </button>
                      ) : (
                        <span key={key} className={className}>
                          {label}
                        </span>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "room" ? (
            <Card title="Room">
              <Fact
                label="Room Number"
                value={row.room.assigned ? row.room.roomNumber ?? "—" : "Unassigned"}
              />
              <Fact label="Room Type" value={row.room.roomTypeName || "—"} />
              <Fact
                label="Housekeeping Status"
                value={row.room.assigned ? hkLabel(row.room.housekeepingStatus) : "—"}
              />
              <Fact label="Readiness" value={readinessLabel} />
              <Fact label="Room Eligibility" value={eligibilityLabel} />
            </Card>
          ) : null}

          {tab === "eta" ? (
            <ArrivalEtaEditor
              restaurantId={restaurantId}
              timezone={timezone}
              row={row}
              canUpdate={canManage && row.hints.canUpdateEta}
              onSaved={onSaved}
            />
          ) : null}

          {tab === "folio" ? (
            <ArrivalFolioPanel restaurantId={restaurantId} row={row} currencyCode={currencyCode} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ArrivalFolioPanel({
  restaurantId,
  row,
  currencyCode,
}: {
  restaurantId: string;
  row: ArrivalRow;
  currencyCode: string;
}) {
  const fetchFolio = useServerFn(getFolio);
  const folioId = row.financial.folioId;
  const allowed = row.financial.state === "available" && Boolean(folioId);
  const folioQuery = useQuery({
    queryKey: ["arrival-guest-folio", restaurantId, folioId],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: folioId! } }) as Promise<FolioDetail | null>,
    enabled: allowed,
    retry: false,
  });

  if (row.financial.state === "permission_denied") {
    return <p className="text-sm text-[#7A6B58]">Permission denied.</p>;
  }
  if (row.financial.state !== "available") {
    return <p className="text-sm text-[#7A6B58]">Folio is not available yet.</p>;
  }
  if (!folioId) {
    return <p className="text-sm text-[#7A6B58]">{FOLIO_MISSING_COPY}</p>;
  }
  if (folioQuery.isLoading) {
    return <p className="text-sm text-[#7A6B58]">Loading folio…</p>;
  }
  if (folioQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {folioQuery.error instanceof Error ? folioQuery.error.message : "Could not load folio."}
      </p>
    );
  }

  const folio = folioQuery.data;
  const summary = folioLedgerSummary(folio);
  const currency = folio?.currency || currencyCode;

  return (
    <Card title="Folio">
      <Fact label="Folio Number" value={folio?.folioNumber ?? "—"} />
      <Fact
        label="Total Charges"
        value={folio ? formatMoney(folio.charges, currency) : "—"}
      />
      <Fact
        label="Payments / Credits"
        value={folio ? formatMoney(folio.credits, currency) : "—"}
      />
      <Fact
        label="Outstanding Balance"
        value={
          summary
            ? formatArrivalBalance(summary.balance, currency)
            : formatArrivalBalance(row.financial.balance, currency)
        }
      />
      <Fact
        label="Deposits"
        value={
          summary
            ? formatMoney(summary.depositCredits, currency)
            : formatMoney(row.financial.depositPosted, currency)
        }
      />
    </Card>
  );
}
