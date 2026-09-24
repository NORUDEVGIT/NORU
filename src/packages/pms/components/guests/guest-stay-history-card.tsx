import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, StickyNote } from "lucide-react";

import { GuestStayActions } from "@/packages/pms/components/guests/guest-stay-actions";
import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  GUEST_BOOKINGS_ACTIVE_EMPTY,
  GUEST_BOOKINGS_COPY,
  GUEST_BOOKINGS_EMPTY,
  GUEST_BOOKINGS_PAGE_SIZE,
  GUEST_BOOKINGS_SELECT_EMPTY,
  GUEST_BOOKINGS_TITLE,
  bookingRowActions,
  filterGuestBookings,
  guestBookingsCsv,
  paginateGuestBookings,
  pickActiveBooking,
  stayNumberForBooking,
  uniqueBookingIds,
  type GuestBookingFilters,
} from "@/packages/pms/lib/guest-bookings-workspace";
import {
  WAVE3_QUOTED_ROOM_TOTAL_LABEL,
  WAVE3_STAY_HISTORY_CONTEXT,
  isInHouseStay,
  reservationHref,
  stayRoomNumberLabel,
  wave3StayHistoryEmpty,
  type GuestStay,
} from "@/packages/pms/lib/guest-profile-wave3";
import { getGuestBookingDetail, listGuestStays } from "@/packages/pms/lib/guests.functions";
import { RESERVATION_STATUSES, propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

export function GuestStayHistoryCard({
  restaurantId,
  guestId,
  guestName,
  guestProfileNumber,
  timezone,
  onOpenFinancial,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  guestProfileNumber?: string | null;
  timezone: string;
  onOpenFinancial?: () => void;
}) {
  const fetchStays = useServerFn(listGuestStays);
  const fetchDetail = useServerFn(getGuestBookingDetail);
  const profileActions = useOptionalGuestProfileActions();
  const today = propertyToday(timezone);
  const [filters, setFilters] = useState<GuestBookingFilters>({
    search: "",
    status: "all",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const stays = staysQuery.data?.stays ?? [];
  const access = staysQuery.data?.access ?? {
    reservation: false,
    frontOffice: false,
    folio: false,
  };
  const filtered = useMemo(() => filterGuestBookings(stays, filters), [stays, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / GUEST_BOOKINGS_PAGE_SIZE));
  const paged = paginateGuestBookings(filtered, Math.min(page, pageCount));
  const selected = filtered.find((stay) => stay.id === selectedId) ?? null;
  const active = pickActiveBooking(stays, today);
  const actionStay = selected ?? active;
  const quick = bookingRowActions(actionStay, access);

  useEffect(() => {
    setPage(1);
  }, [filters.search, filters.status, filters.from, filters.to]);

  const detailQuery = useQuery({
    queryKey: ["guest-booking-detail", restaurantId, guestId, selected?.id],
    queryFn: () =>
      fetchDetail({
        data: { restaurantId, guestId, reservationId: selected!.id },
      }),
    enabled: Boolean(selected),
    retry: false,
  });

  function printHistory() {
    window.print();
  }

  function exportCsv() {
    const csv = guestBookingsCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `guest-bookings-${guestId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (staysQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading stay history…</p>;
  }
  if (staysQuery.isError) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border bg-card p-6"
        data-testid="guest-stay-history"
      >
        <h2 className="font-display text-xl" data-testid="guest-stay-history-guest-name">
          {guestName}
        </h2>
        <p className="mt-1 text-sm font-medium">{GUEST_BOOKINGS_TITLE}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {staysQuery.error instanceof Error
            ? staysQuery.error.message
            : "Stay history could not be loaded."}
        </p>
      </div>
    );
  }

  const newReservation = (
    <Button asChild>
      <Link to="/restaurant/bookings/new" search={{ guestId }} data-testid="guest-bookings-new">
        <CalendarPlus className="mr-2 size-4" />
        New Reservation
      </Link>
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="guest-stay-history">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl" data-testid="guest-stay-history-guest-name">
            {guestName}
          </h2>
          <p className="mt-1 text-sm font-medium">{GUEST_BOOKINGS_TITLE}</p>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="guest-stay-history-context">
            {WAVE3_STAY_HISTORY_CONTEXT}. {GUEST_BOOKINGS_COPY} Confirmation numbers and dates match
            Reservations.
          </p>
        </div>
        {newReservation}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          placeholder="Search confirmation, room, rate…"
          data-testid="guest-bookings-search"
        />
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              status: value as GuestBookingFilters["status"],
            }))
          }
        >
          <SelectTrigger data-testid="guest-bookings-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {RESERVATION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
          data-testid="guest-bookings-from"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
          data-testid="guest-bookings-to"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          {stays.length === 0 ? (
            <div
              className="rounded-2xl border border-dashed border-border bg-card p-6"
              data-testid="guest-stay-history-empty"
            >
              <p className="text-sm font-medium">{GUEST_BOOKINGS_EMPTY}</p>
              <p className="mt-2 text-sm text-muted-foreground">{wave3StayHistoryEmpty(guestName)}</p>
              <div className="mt-4">{newReservation}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6">
              <p className="text-sm text-muted-foreground">No bookings match these filters.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
                <table className="w-full text-left text-sm" data-testid="guest-bookings-table">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Confirmation</th>
                      <th className="px-4 py-3">Stay No.</th>
                      <th className="px-4 py-3">Arrival</th>
                      <th className="px-4 py-3">Departure</th>
                      <th className="px-4 py-3">Nights</th>
                      <th className="px-4 py-3">Room Type</th>
                      <th className="px-4 py-3">Room</th>
                      <th className="px-4 py-3">Rate Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Total Amount</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((stay) => (
                      <tr
                        key={stay.id}
                        className={cn(
                          "cursor-pointer border-t border-border",
                          selectedId === stay.id && "bg-accent/40",
                        )}
                        data-testid="guest-stay-row"
                        onClick={() => setSelectedId(stay.id)}
                      >
                        <td className="px-4 py-3 font-medium">{stay.confirmationNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {stayNumberForBooking(stay) || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatStayDate(stay.arrivalDate)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatStayDate(stay.departureDate)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{stay.nights}</td>
                        <td className="px-4 py-3 text-muted-foreground">{stay.roomTypeName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{stayRoomNumberLabel(stay)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{stay.ratePlanName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <ReservationStatusBadge status={stay.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{stay.sourceLabel ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {stay.roomSubtotal == null ? "—" : stay.roomSubtotal}
                        </td>
                        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <GuestStayActions stay={stay} access={access} today={today} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-3 md:hidden">
                {paged.map((stay) => (
                  <li
                    key={stay.id}
                    className={cn(
                      "rounded-2xl border border-border bg-card p-4",
                      selectedId === stay.id && "ring-1 ring-border",
                    )}
                    data-testid="guest-stay-row"
                    onClick={() => setSelectedId(stay.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{stay.confirmationNumber}</span>
                      <ReservationStatusBadge status={stay.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)} ·{" "}
                      {stay.nights} night{stay.nights === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stay.roomTypeName} · {stayRoomNumberLabel(stay)}
                    </p>
                    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                      <GuestStayActions stay={stay} access={access} today={today} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>

              {pageCount > 1 ? (
                <div className="flex items-center justify-between text-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-muted-foreground">
                    Page {Math.min(page, pageCount)} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}

          <section
            className="rounded-2xl border border-border bg-card p-5"
            data-testid="guest-booking-details"
          >
            <h3 className="font-display text-lg">Booking Details</h3>
            {!selected ? (
              <p className="mt-2 text-sm text-muted-foreground">{GUEST_BOOKINGS_SELECT_EMPTY}</p>
            ) : (
              <BookingDetails stay={selected} timeline={detailQuery.data?.timeline ?? []} />
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-booking-active">
            <h3 className="font-display text-lg">
              {active && isInHouseStay(active.status) ? "Current Stay" : "Upcoming Reservation"}
            </h3>
            {!active ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">{GUEST_BOOKINGS_ACTIVE_EMPTY}</p>
                <div className="mt-3">{newReservation}</div>
              </>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <DetailRow label="Confirmation" value={active.confirmationNumber} />
                <DetailRow
                  label="Dates"
                  value={`${formatStayDate(active.arrivalDate)} → ${formatStayDate(active.departureDate)}`}
                />
                <DetailRow label="Room type" value={active.roomTypeName} />
                <DetailRow label="Room" value={stayRoomNumberLabel(active)} />
                <DetailRow label="Rate plan" value={active.ratePlanName} />
                <DetailRow label="Source" value={active.sourceLabel} />
                <DetailRow label="Status" value={active.status.replaceAll("_", " ")} />
                {access.reservation ? (
                  <Button asChild className="mt-2" variant="outline" size="sm">
                    <Link
                      to="/restaurant/pms/reservations/$reservationId"
                      params={{ reservationId: active.id }}
                    >
                      Open Reservation
                    </Link>
                  </Button>
                ) : null}
              </dl>
            )}
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5"
            data-testid="guest-booking-quick-actions"
          >
            <h3 className="font-display text-lg">Quick Actions</h3>
            <div className="mt-3 grid gap-2">
              {newReservation}
              <Button
                variant="outline"
                onClick={() => profileActions?.openNote()}
                disabled={!profileActions?.canManage}
              >
                <StickyNote className="mr-2 size-4" />
                Add Note
              </Button>
              {quick.view === "enabled" && actionStay ? (
                <Button asChild variant="outline">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: actionStay.id }}
                    title={reservationHref(actionStay.id)}
                  >
                    Open Reservation
                  </Link>
                </Button>
              ) : null}
              {quick.modify === "enabled" && actionStay ? (
                <Button asChild variant="outline">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: actionStay.id }}
                  >
                    Modify Reservation
                  </Link>
                </Button>
              ) : null}
              {quick.cancel === "enabled" && actionStay ? (
                <Button asChild variant="outline">
                  <Link to="/restaurant/pms/front-office" search={{ tab: "cancellations" }}>
                    Cancel Reservation
                  </Link>
                </Button>
              ) : null}
              {quick.checkIn === "enabled" ? (
                <Button asChild variant="outline">
                  <Link to="/restaurant/pms/front-office" search={{ tab: "arrivals" }}>
                    Check-in
                  </Link>
                </Button>
              ) : null}
              {quick.checkOut === "enabled" ? (
                <Button asChild variant="outline">
                  <Link to="/restaurant/pms/front-office" search={{ tab: "departures" }}>
                    Check-out
                  </Link>
                </Button>
              ) : null}
              {quick.folio === "enabled" && actionStay?.folioNumber ? (
                <Button asChild variant="outline">
                  <Link
                    to="/restaurant/pms/cashiering"
                    search={{ tab: "folios", folio: actionStay.folioNumber }}
                  >
                    Folio
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link to="/restaurant/pms/guest-services">Guest Services</Link>
              </Button>
              <Button variant="outline" onClick={printHistory} data-testid="guest-bookings-print">
                Print Stay/Booking History
              </Button>
              <Button variant="outline" onClick={exportCsv} data-testid="guest-bookings-export">
                Export CSV
              </Button>
              <Button variant="outline" onClick={onOpenFinancial} disabled={!onOpenFinancial}>
                View Financial Summary
              </Button>
            </div>
          </section>
        </div>
      </div>

      <article className="guest-bookings-print hidden print:block" data-testid="guest-bookings-print">
        <h1>{guestName}</h1>
        <p>
          Profile no. {guestProfileNumber ?? "—"} · {GUEST_BOOKINGS_TITLE}
        </p>
        <table>
          <thead>
            <tr>
              <th>Confirmation</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Nights</th>
              <th>Room</th>
              <th>Room type</th>
              <th>Rate plan</th>
              <th>Status</th>
              <th>Source</th>
              <th>{WAVE3_QUOTED_ROOM_TOTAL_LABEL}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((stay) => (
              <tr key={stay.id}>
                <td>{stay.confirmationNumber}</td>
                <td>{stay.arrivalDate}</td>
                <td>{stay.departureDate}</td>
                <td>{stay.nights}</td>
                <td>{stay.roomNumber ?? ""}</td>
                <td>{stay.roomTypeName}</td>
                <td>{stay.ratePlanName ?? ""}</td>
                <td>{stay.status}</td>
                <td>{stay.sourceLabel ?? ""}</td>
                <td>{stay.roomSubtotal ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sr-only">{uniqueBookingIds(filtered).join(",")}</p>
      </article>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .guest-bookings-print, .guest-bookings-print * { visibility: visible; }
          .guest-bookings-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function BookingDetails({
  stay,
  timeline,
}: {
  stay: GuestStay;
  timeline: Array<{ id: string; label: string; createdAt: string }>;
}) {
  return (
    <div className="mt-3 grid gap-4 md:grid-cols-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Booking information</p>
        <dl className="mt-2 space-y-1 text-sm">
          <DetailRow label="Confirmation" value={stay.confirmationNumber} />
          <DetailRow label="Arrival" value={formatStayDate(stay.arrivalDate)} />
          <DetailRow label="Departure" value={formatStayDate(stay.departureDate)} />
          <DetailRow label="Nights" value={String(stay.nights)} />
          <DetailRow label="Status" value={stay.status.replaceAll("_", " ")} />
          <DetailRow label="Source" value={stay.sourceLabel} />
        </dl>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Room / rate</p>
        <dl className="mt-2 space-y-1 text-sm">
          <DetailRow label="Room type" value={stay.roomTypeName} />
          <DetailRow label="Room number" value={stayRoomNumberLabel(stay)} />
          <DetailRow label="Rate plan" value={stay.ratePlanName} />
          <DetailRow
            label="Total amount"
            value={stay.roomSubtotal == null ? null : String(stay.roomSubtotal)}
          />
        </dl>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Occupancy</p>
        <dl className="mt-2 space-y-1 text-sm">
          <DetailRow label="Adults" value={String(stay.adults)} />
          <DetailRow label="Children" value={String(stay.children)} />
        </dl>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">Timeline</p>
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No recorded reservation history yet.</p>
        ) : (
          <ol className="mt-2 space-y-1 text-sm">
            {timeline.map((item) => (
              <li key={item.id}>
                {item.label} · {formatStayDate(item.createdAt.slice(0, 10))}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
