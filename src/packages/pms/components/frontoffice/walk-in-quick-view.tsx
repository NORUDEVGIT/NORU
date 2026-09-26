import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { getFrontOfficeWalkInQuickView, type FoWalkInQuickView } from "@/packages/pms/lib/fo-walkin.functions";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
import { walkInMenuItems, type FoWalkInActionId } from "@/packages/pms/lib/fo-walkin";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function WalkInQuickViewSheet({
  restaurantId,
  reservationId,
  open,
  onOpenChange,
  onAction,
}: {
  restaurantId: string;
  reservationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: FoWalkInActionId, qv: FoWalkInQuickView) => void;
}) {
  const money = useMoney();
  const fetchQv = useServerFn(getFrontOfficeWalkInQuickView);
  const qvQuery = useQuery({
    queryKey: ["front-office", "walkin-qv", restaurantId, reservationId],
    queryFn: () => fetchQv({ data: { restaurantId, reservationId: reservationId! } }),
    enabled: open && Boolean(reservationId),
    retry: false,
  });

  const qv = qvQuery.data;
  const denied = qvQuery.isError && isPermissionDeniedMessage(qvQuery.error);
  const menu = qv ? walkInMenuItems({ status: qv.stay.status, hints: qv.hints }) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
        data-testid="fo-walkin-qv"
      >
        <SheetHeader>
          <SheetTitle>Walk-In Quick View</SheetTitle>
          <SheetDescription>What remains before this walk-in can become in-house?</SheetDescription>
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
                  <span className="text-xs text-muted-foreground">{qv.stay.source === "walk_in" ? "walk_in" : qv.stay.source ?? "—"}</span>
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
                      <DropdownMenuItem key={item.id} onSelect={() => onAction(item.id, qv)}>
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
                <Field
                  label="Profile"
                  value={qv.verification.complete ? "Complete" : qv.verification.missing.join(", ") || "Incomplete"}
                />
              </dl>
              {qv.hints.canViewGuest ? (
                <Button type="button" variant="link" className="h-auto px-0" onClick={() => onAction("open_guest", qv)}>
                  Guest Profile
                </Button>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</h3>
              <dl className="space-y-1.5">
                <Field label="Confirmation" value={qv.stay.confirmationNumber} />
                <Field
                  label="Dates"
                  value={`${formatStayDate(qv.stay.arrivalDate)} → ${formatStayDate(qv.stay.departureDate)} · ${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                />
                <Field
                  label="Occupancy"
                  value={`${qv.stay.adults} adult${qv.stay.adults === 1 ? "" : "s"}${qv.stay.children ? ` · ${qv.stay.children} child${qv.stay.children === 1 ? "" : "ren"}` : ""}`}
                />
                <Field label="Room type" value={qv.stay.roomTypeName} />
                <Field label="Room" value={qv.room.roomNumber ? `Room ${qv.room.roomNumber}` : "Unassigned"} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</h3>
              <dl className="space-y-1.5">
                <Field label="Rate plan" value={qv.pricing.ratePlanName || "—"} />
                <Field label="Nights" value={String(qv.pricing.nights)} />
                <Field label="Nightly" value={qv.pricing.nightlyRate == null ? "—" : money(qv.pricing.nightlyRate)} />
                <Field label="Total" value={qv.pricing.roomSubtotal == null ? "—" : money(qv.pricing.roomSubtotal)} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</h3>
              <dl className="space-y-1.5">
                <Field label="Assigned" value={qv.room.assigned ? "Yes" : "No"} />
                <Field label="Eligibility" value={!qv.room.assigned ? "—" : qv.room.eligible ? "Eligible" : "Not eligible"} />
                <Field
                  label="Readiness"
                  value={!qv.room.assigned ? "—" : qv.room.ready ? "Ready" : qv.room.readyReason || "Not ready"}
                />
                <Field label="Housekeeping" value={qv.room.housekeepingStatus || "—"} />
                <Field label="Status" value={qv.room.status || "—"} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial</h3>
              {qv.financial.lane === "permission_denied" ? (
                <PermissionDeniedPanel title="Folio permission denied" />
              ) : (
                <dl className="space-y-1.5">
                  <Field
                    label="Deposit"
                    value={
                      qv.financial.depositWaived
                        ? "Waived"
                        : qv.financial.depositPosted > 0
                          ? money(qv.financial.depositPosted)
                          : qv.financial.depositRequired
                            ? "Required"
                            : "—"
                    }
                  />
                  <Field
                    label="Folio"
                    value={
                      qv.financial.lane !== "live"
                        ? "Not available"
                        : qv.financial.folioNumber || (qv.financial.folioId ? "Open" : "None yet")
                    }
                  />
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Payments stay in Cashiering.</p>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness</h3>
              <dl className="space-y-1.5">
                <Field label="Registration" value={qv.registration.complete ? "Complete" : qv.registration.waived ? "Waived" : "Incomplete"} />
                <Field label="Assignment" value={qv.readiness.roomAssigned ? "Assigned" : "Unassigned"} />
                <Field label="Room ready" value={qv.readiness.roomReady ? "Ready" : "Not ready"} />
                <Field label="Deposit" value={qv.readiness.depositSatisfied ? "Satisfied" : "Outstanding"} />
                <Field label="Check-in" value={qv.readiness.canComplete ? "Eligible" : "Blocked"} />
              </dl>
            </section>

            <FoGuestServicesPanel
              restaurantId={restaurantId}
              reservationId={qv.stay.id}
              guestId={qv.stay.guestId}
              compact
            />

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exceptions</h3>
              {qv.exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No operational exceptions.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {qv.exceptions.map((item) => (
                    <li key={item.key}>{item.label}</li>
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
