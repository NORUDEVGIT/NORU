import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeDepartureQuickView,
  type FoDepartureQuickView,
} from "@/packages/pms/lib/fo-departure.functions";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
import { departureMenuItems, departureExceptionOwner } from "@/packages/pms/lib/fo-departure";
import { CREDIT_BLOCK_BANNER, isCreditBalance, REFUND_IN_CASHIERING_CTA } from "@/packages/pms/lib/fo-check-out";
import { foOperationalQueryOptions } from "@/packages/pms/lib/fo-freshness";
import { useMoney } from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";

function openDepartureException(
  key: FoDepartureQuickView["exceptions"][number]["key"],
  qv: FoDepartureQuickView,
  onAction: (action: DepartureQuickViewAction, qv: FoDepartureQuickView) => void,
) {
  const owner = departureExceptionOwner(key, qv.financial.balance);
  if (owner === "guest_request") {
    document.getElementById("fo-departure-requests")?.scrollIntoView({ block: "nearest" });
    return;
  }
  onAction(owner, qv);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function timingLabel(qv: FoDepartureQuickView): string {
  if (qv.timing === "overdue") return "Overdue";
  if (qv.timing === "late_checkout") return "Late checkout";
  return "Due now";
}

export type DepartureQuickViewAction =
  | "open_folio"
  | "late_checkout"
  | "amend_stay"
  | "open_guest"
  | "check_out"
  | "room_move"
  | "open_maintenance"
  | "unarrived";

export function DepartureQuickViewSheet({
  restaurantId,
  reservationId,
  reservationRoomId = null,
  open,
  onOpenChange,
  onAction,
}: {
  restaurantId: string;
  reservationId: string | null;
  reservationRoomId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: DepartureQuickViewAction, qv: FoDepartureQuickView) => void;
}) {
  const money = useMoney();
  const fetchQv = useServerFn(getFrontOfficeDepartureQuickView);
  const qvQuery = useQuery({
    queryKey: ["front-office", "departures-qv", restaurantId, reservationId, reservationRoomId],
    queryFn: () =>
      fetchQv({
        data: {
          restaurantId,
          reservationId: reservationId!,
          ...(reservationRoomId ? { reservationRoomId } : {}),
        },
      }),
    enabled: open && Boolean(reservationId),
    ...foOperationalQueryOptions(),
    retry: false,
  });

  const qv = qvQuery.data;
  const denied = qvQuery.isError && isPermissionDeniedMessage(qvQuery.error);
  const menu = qv ? departureMenuItems(qv.hints) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
        data-testid="fo-departure-qv"
      >
        <SheetHeader>
          <SheetTitle>Departure Quick View</SheetTitle>
          <SheetDescription>Can this guest be checked out now?</SheetDescription>
        </SheetHeader>

        {denied ? (
          <PermissionDeniedPanel title="Cannot open this stay" />
        ) : qvQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading stay…</p>
        ) : qvQuery.isError ? (
          <div className="space-y-2 text-sm">
            <p className="text-destructive">
              {qvQuery.error instanceof Error ? qvQuery.error.message : "Could not load this stay."}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void qvQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : qv ? (
          <div className="space-y-5 pb-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg">{qv.guest.fullName}</p>
                <p className="text-sm text-muted-foreground">{qv.stay.confirmationNumber}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ReservationStatusBadge status={qv.stay.status} />
                  {qv.guest.vip ? <VipBadge /> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: qv.stay.id }}>
                    Open Reservation
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="More stay actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {menu.map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        onSelect={() => onAction(item.id as DepartureQuickViewAction, qv)}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest</h3>
              <dl className="space-y-1.5">
                <Field label="Phone" value={qv.guest.phone || "—"} />
                <Field label="Email" value={qv.guest.email || "—"} />
              </dl>
              {qv.hints.canOpenGuest ? (
                <Button type="button" variant="link" className="h-auto px-0" onClick={() => onAction("open_guest", qv)}>
                  Guest Profile
                </Button>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</h3>
              <dl className="space-y-1.5">
                <Field label="Confirmation" value={qv.stay.confirmationNumber} />
                <Field label="Status" value={qv.stay.status.replaceAll("_", " ")} />
                <Field
                  label="Dates"
                  value={`${formatStayDate(qv.stay.arrivalDate)} → ${formatStayDate(qv.stay.departureDate)} · ${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                />
                <Field label="Room" value={qv.room.roomNumber ? `Room ${qv.room.roomNumber}` : "Unassigned"} />
                <Field label="Room type" value={qv.stay.roomTypeName} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Departure</h3>
              <dl className="space-y-1.5">
                <Field label="Checkout time" value={qv.settings.checkOutTime || qv.lateCheckout.policy.checkOutTime || "Not configured"} />
                <Field
                  label="Late checkout"
                  value={
                    qv.lateCheckout.granted
                      ? qv.lateCheckout.until
                        ? `Granted · ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(qv.lateCheckout.until))}`
                        : "Granted"
                      : "Not set"
                  }
                />
                <Field label="Timing" value={timingLabel(qv)} />
              </dl>
            </section>

            <section className="space-y-2" data-testid="fo-departure-preparation">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preparation</h3>
              <ul className="space-y-1 text-sm">
                <li>{qv.room.assigned ? "Room is assigned." : "Room is not assigned."}</li>
                <li>
                  {qv.readiness.missingFolio
                    ? "Folio is missing. Check-out opens it."
                    : qv.financial.balance != null && isCreditBalance(qv.financial.balance)
                      ? "Folio has a credit. Refund stays in Cashiering."
                      : qv.readiness.needsSettlement
                        ? "Balance is due. Settlement stays in check-out."
                        : "Folio balance is ready."}
                </li>
                <li>
                  {qv.hints.canHandoffUnarrived
                    ? "This room is not in-house. Checkout does not apply."
                    : "Completing check-out applies the Housekeeping departure transition."}
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                {qv.hints.canCheckOut ? (
                  <Button type="button" size="sm" data-testid="fo-departure-check-out" onClick={() => onAction("check_out", qv)}>
                    Check out
                  </Button>
                ) : null}
                {qv.hints.canHandoffUnarrived ? (
                  <Button type="button" size="sm" data-testid="fo-departure-unarrived" onClick={() => onAction("unarrived", qv)}>
                    Did not arrive
                  </Button>
                ) : null}
                {qv.hints.canSetLateCheckout ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => onAction("late_checkout", qv)}>
                    Late checkout
                  </Button>
                ) : null}
                {qv.financial.balance != null && isCreditBalance(qv.financial.balance) ? (
                  <Button type="button" size="sm" variant="outline" data-testid="fo-departure-refund" onClick={() => onAction("open_folio", qv)}>
                    {REFUND_IN_CASHIERING_CTA}
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial</h3>
              {qv.financial.lane === "permission_denied" ? (
                <PermissionDeniedPanel title="Folio permission denied" />
              ) : (
                <dl className="space-y-1.5">
                  <Field
                    label="Folio"
                    value={
                      qv.financial.lane !== "live"
                        ? "Not available"
                        : qv.financial.folioNumber || (qv.financial.folioId ? "Open" : "None yet")
                    }
                  />
                  <Field
                    label="Balance"
                    value={
                      qv.financial.lane !== "live" || qv.financial.balance == null
                        ? "—"
                        : money(qv.financial.balance)
                    }
                  />
                  <Field
                    label="Folio status"
                    value={
                      qv.financial.lane !== "live"
                        ? "—"
                        : qv.financial.status
                          ? qv.financial.status
                          : qv.financial.folioId
                            ? "open"
                            : "No folio"
                    }
                  />
                  <Field
                    label="Settlement"
                    value={
                      qv.financial.lane !== "live"
                        ? "—"
                        : qv.readiness.missingFolio
                          ? "Folio required"
                          : qv.financial.needsSettlement
                            ? "Required"
                            : "Ready"
                    }
                  />
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Payments stay in Cashiering.</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</h3>
              <dl className="space-y-1.5">
                <Field label="Room" value={qv.room.roomNumber ? `Room ${qv.room.roomNumber}` : "Unassigned"} />
                <Field label="Housekeeping" value={qv.room.housekeepingStatus || "—"} />
                <Field label="Status" value={qv.room.status || "—"} />
                {qv.room.maintenanceStatus && qv.room.maintenanceStatus !== "none" ? (
                  <Field label="Maintenance" value={qv.room.maintenanceStatus} />
                ) : null}
              </dl>
            </section>

            <div id="fo-departure-requests">
              <FoGuestServicesPanel
                restaurantId={restaurantId}
                reservationId={qv.stay.id}
                guestId={qv.stay.guestId}
                compact
              />
            </div>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exceptions</h3>
              {qv.exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No operational exceptions.</p>
              ) : (
                <ul className="space-y-1">
                  {qv.exceptions.map((item) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        data-testid={`fo-departure-exception-${item.key}`}
                        className={
                          item.blocking
                            ? "w-full rounded-lg bg-destructive/10 px-2.5 py-1.5 text-left text-sm text-destructive"
                            : "w-full rounded-lg bg-[#F4E9D0] px-2.5 py-1.5 text-left text-sm text-[#251605]"
                        }
                        onClick={() => openDepartureException(item.key, qv, onAction)}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {qv.readiness.needsSettlement || qv.readiness.missingFolio ? (
              <p className="text-sm text-destructive">
                {qv.readiness.missingFolio
                  ? "Folio is missing. Check-out opens it."
                  : qv.financial.balance != null && isCreditBalance(qv.financial.balance)
                    ? CREDIT_BLOCK_BANNER
                    : "Settlement is part of check-out."}
              </p>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
              {qv.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent reservation history.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {qv.history.map((item, index) => (
                    <li key={`${item.createdAt}-${index}`}>
                      <span className="font-medium">{item.eventType.replaceAll("_", " ")}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}
                      </span>
                      {item.notes ? <p className="text-muted-foreground">{item.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
