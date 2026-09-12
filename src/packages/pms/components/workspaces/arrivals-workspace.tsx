import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  AssignRoomDialog,
  CheckInDialog,
  NoShowDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { StayMoneyStrip } from "@/packages/pms/components/frontoffice/fo-stay-money-cells";
import { listFoStaySignals } from "@/packages/pms/lib/fo-exceptions.functions";
import { listArrivals, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";

const ALL = "all";

/**
 * Phase 7D.2F1 — the arrivals list also backs the Check-In and Room Assignment
 * tabs of the canonical Front Office. Same data, same actions, only the
 * pre-applied filter differs.
 */
export type ArrivalsVariant = "arrivals" | "checkin" | "assignment";

export function ArrivalsWorkspace({
  membership,
  variant = "arrivals",
  embedded = false,
}: {
  membership: RestaurantMembership;
  variant?: ArrivalsVariant;
  embedded?: boolean;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);

  const [date, setDate] = useState(today);
  useEffect(() => {
    setDate(today);
  }, [today]);
  const [status, setStatus] = useState(variant === "checkin" ? "confirmed" : ALL);
  const [assignment, setAssignment] = useState(variant === "assignment" ? "unassigned" : ALL);
  const [checkIn, setCheckIn] = useState<FrontOfficeStay | null>(null);
  const [assign, setAssign] = useState<FrontOfficeStay | null>(null);
  const [noShow, setNoShow] = useState<FrontOfficeStay | null>(null);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchArrivals = useServerFn(listArrivals);
  const fetchSignals = useServerFn(listFoStaySignals);

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, date, status, assignment],
    queryFn: () =>
      fetchArrivals({
        data: {
          restaurantId,
          date,
          ...(status !== ALL ? { status: status as "pending" | "confirmed" } : {}),
          ...(assignment !== ALL ? { assignment: assignment as "assigned" | "unassigned" } : {}),
        },
      }),
    enabled: canManage,
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading arrivals…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        {embedded ? null : (
          <h1 className="font-display text-2xl">
            <PageHeading fallback="Arrivals" />
          </h1>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access Front Office for this property.
        </p>
      </div>
    );
  }

  const rows = arrivalsQuery.data ?? [];
  const signalsQuery = useQuery({
    queryKey: ["front-office", "stay-signals", restaurantId, rows.map((r) => r.id).join(",")],
    queryFn: () => fetchSignals({ data: { restaurantId, reservationIds: rows.map((r) => r.id) } }),
    enabled: canManage && rows.length > 0,
    retry: false,
  });
  const folioLane = signalsQuery.data?.folioLane ?? "coming_soon";
  const signals = Object.values(signalsQuery.data?.byStay ?? {});
  const emptyText =
    variant === "checkin"
      ? "No arrivals are waiting to be checked in for this date."
      : variant === "assignment"
        ? "Every arrival for this date already has a room."
        : "No arrivals for this date.";

  return (
    <div className="space-y-6">
      {embedded ? (
        <p className="text-sm text-muted-foreground">
          {variant === "checkin"
            ? `Confirmed arrivals ready to check in on ${formatStayDate(date)}.`
            : variant === "assignment"
              ? `Arrivals still without a room on ${formatStayDate(date)}.`
              : `Reservations arriving on ${formatStayDate(date)} at ${membership.restaurant.name}.`}
        </p>
      ) : (
        <div>
          <h1 className="font-display text-2xl">
            <PageHeading fallback="Arrivals" />
          </h1>
          <p className="text-sm text-muted-foreground">
            Reservations arriving on {formatStayDate(date)} at {membership.restaurant.name}.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        {variant === "checkin" ? null : (
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        )}
        {variant === "assignment" ? null : (
          <Select value={assignment} onValueChange={setAssignment}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Room assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any assignment</SelectItem>
              <SelectItem value="assigned">Room assigned</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {arrivalsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading arrivals…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((stay) => (
            <li key={stay.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/restaurant/pms/reservations/$reservationId"
                      params={{ reservationId: stay.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {stay.confirmationNumber}
                    </Link>
                    <ReservationStatusBadge status={stay.status} />
                  </div>
                  <p className="mt-1 text-sm">
                    {stay.guestName}
                    {stay.guestVip ? " · VIP" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stay.roomTypeName} · {stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)} · {stay.nights} night
                    {stay.nights === 1 ? "" : "s"}
                  </p>
                  {stay.walkInIncomplete ? (
                    <p className="mt-2 text-xs font-medium text-[#C89933]">Walk-in incomplete — finish check-in</p>
                  ) : null}
                  <StayMoneyStrip
                    folioLane={folioLane}
                    signal={signalsQuery.data?.byStay?.[stay.id]}
                    signals={signals}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAssign(stay)}>
                    {stay.roomNumber ? "Change room" : "Assign room"}
                  </Button>
                  {stay.status === "confirmed" ? (
                    <Button size="sm" onClick={() => setCheckIn(stay)}>
                      Check in
                    </Button>
                  ) : null}
                  {stay.status === "confirmed" && stay.arrivalDate < today ? (
                    <Button variant="ghost" size="sm" onClick={() => setNoShow(stay)}>
                      No-show
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {assign ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={assign}
          open
          onOpenChange={(v) => !v && setAssign(null)}
        />
      ) : null}
      {checkIn ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={checkIn}
          open
          onOpenChange={(v) => !v && setCheckIn(null)}
        />
      ) : null}
      {noShow ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={noShow}
          today={today}
          open
          onOpenChange={(v) => !v && setNoShow(null)}
        />
      ) : null}
    </div>
  );
}
