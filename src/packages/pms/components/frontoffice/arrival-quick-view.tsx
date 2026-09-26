import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { getFrontOfficeArrivalQuickView, type FoArrivalQuickView } from "@/packages/pms/lib/fo-arrival.functions";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
import { ID_DOCUMENT_LABELS } from "@/packages/pms/lib/fo-check-in";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function etaCopy(qv: FoArrivalQuickView): string {
  if (!qv.eta.expectedArrivalAt) return "Not set";
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(qv.eta.expectedArrivalAt));
  if (!qv.eta.timing) return clock;
  const label = qv.eta.timing === "early" ? "Early" : qv.eta.timing === "late" ? "Late" : "On time";
  return `${clock} · ${label}`;
}

export function ArrivalQuickViewSheet({
  restaurantId,
  reservationId,
  open,
  phone = false,
  onOpenChange,
  onAssign,
  onEta,
  onRegister,
  onCheckIn,
  onOpenFolio,
}: {
  restaurantId: string;
  reservationId: string | null;
  open: boolean;
  phone?: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (qv: FoArrivalQuickView) => void;
  onEta: (qv: FoArrivalQuickView) => void;
  onRegister: (qv: FoArrivalQuickView) => void;
  onCheckIn: (qv: FoArrivalQuickView) => void;
  onOpenFolio: (qv: FoArrivalQuickView) => void;
}) {
  const money = useMoney();
  const fetchQv = useServerFn(getFrontOfficeArrivalQuickView);
  const query = useQuery({
    queryKey: ["fo-arrival-qv", restaurantId, reservationId],
    queryFn: () =>
      fetchQv({ data: { restaurantId, reservationId: reservationId as string } }),
    enabled: open && Boolean(reservationId),
    retry: false,
  });

  const qv = query.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? "bottom" : "right"}
        data-testid="fo-arrival-qv"
        className={cn(
          "z-[60] flex flex-col gap-0 overflow-y-auto p-0",
          phone ? "h-[90dvh] max-h-[90dvh]" : "h-dvh w-full sm:max-w-[440px]",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <SheetTitle>Arrival Quick View</SheetTitle>
          <SheetDescription>Can this guest be checked in now?</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 p-5">
          {query.isLoading ? <p className="text-sm text-muted-foreground">Loading arrival…</p> : null}
          {query.isError ? (
            isPermissionDeniedMessage(query.error) ? (
              <PermissionDeniedPanel message="You don't have access to this arrival." />
            ) : (
              <p className="text-sm text-destructive">
                {query.error instanceof Error ? query.error.message : "Could not load arrival."}
              </p>
            )
          ) : null}
          {qv ? (
            <>
              <div>
                <p className="flex items-center gap-2 font-display text-lg">
                  {qv.guest.fullName}
                  {qv.guest.vip ? <VipBadge /> : null}
                </p>
                <p className="text-xs text-muted-foreground">{qv.stay.confirmationNumber}</p>
                <div className="mt-1">
                  <ReservationStatusBadge status={qv.stay.status} />
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest</h3>
                <dl className="space-y-1.5">
                  <Field label="Phone" value={qv.guest.phone || "—"} />
                  <Field label="Email" value={qv.guest.email || "—"} />
                  <Field
                    label="ID"
                    value={
                      qv.guest.idDocumentType
                        ? `${ID_DOCUMENT_LABELS[qv.guest.idDocumentType]}${qv.guest.idDocumentNumber ? ` · ${qv.guest.idDocumentNumber}` : ""}`
                        : "Not recorded"
                    }
                  />
                  <Field
                    label="Verification"
                    value={qv.verification.complete ? "Complete" : qv.verification.missing.join(" ")}
                  />
                  <Field
                    label="Registration"
                    value={qv.registration.waived ? "Waived" : qv.registration.complete ? "Complete" : "Incomplete"}
                  />
                </dl>
                <p className="text-xs text-muted-foreground">
                  Duplicate matching is not available here. Open Guest Profile to review identity.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</h3>
                <dl className="space-y-1.5">
                  <Field
                    label="Dates"
                    value={`${formatStayDate(qv.stay.arrivalDate)} → ${formatStayDate(qv.stay.departureDate)} · ${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                  />
                  <Field label="Room type" value={qv.stay.roomTypeName} />
                  <Field
                    label="Occupancy"
                    value={`${qv.stay.adults} adult${qv.stay.adults === 1 ? "" : "s"}${qv.stay.children ? ` · ${qv.stay.children} child${qv.stay.children === 1 ? "" : "ren"}` : ""}`}
                  />
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ETA</h3>
                <dl className="space-y-1.5">
                  <Field label="Expected" value={etaCopy(qv)} />
                  <Field label="Check-in time" value={qv.eta.checkInTime || "Not configured"} />
                </dl>
                {qv.eta.timing === "early" ? (
                  <p className="text-xs text-[#C89933]">
                    Early arrival vs property check-in time
                    {qv.eta.earlyCheckinAllowed === false
                      ? ". Early check-in is not allowed in Settings."
                      : qv.eta.earlyCheckinNeedsApproval
                        ? ". Settings mark early check-in as needing approval — there is no approval inbox yet."
                        : qv.eta.earlyCheckinAllowed
                          ? ". Early check-in is allowed in Settings."
                          : "."}
                  </p>
                ) : null}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</h3>
                <dl className="space-y-1.5">
                  <Field label="Assigned" value={qv.room.assigned ? qv.room.roomNumber ?? "Assigned" : "Unassigned"} />
                  <Field
                    label="Readiness"
                    value={
                      !qv.room.assigned
                        ? "Unassigned"
                        : qv.room.ready
                          ? "Ready"
                          : qv.room.readyReason || "Not ready"
                    }
                  />
                  <Field label="Housekeeping" value={qv.room.housekeepingStatus || "—"} />
                  <Field label="Status" value={qv.room.status || "—"} />
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial</h3>
                <dl className="space-y-1.5">
                  <Field
                    label="Folio"
                    value={
                      qv.financial.lane === "permission_denied"
                        ? "Permission denied"
                        : qv.financial.lane !== "live"
                          ? "Not available"
                          : qv.financial.folioId
                            ? qv.financial.folioNumber || "Open"
                            : "None yet"
                    }
                  />
                  <Field
                    label="Deposit"
                    value={
                      qv.financial.depositWaived
                        ? "Waived"
                        : qv.financial.depositPosted > 0
                          ? money(qv.financial.depositPosted)
                          : "Not posted"
                    }
                  />
                  <Field
                    label="Required"
                    value={
                      qv.financial.depositRequiredAmount != null
                        ? money(qv.financial.depositRequiredAmount)
                        : qv.financial.depositRequired
                          ? "Required (amount not configured)"
                          : "Policy A — post or waive"
                    }
                  />
                  <Field label="Guarantee" value={qv.financial.guaranteeMethod || "—"} />
                </dl>
                <p className="text-xs text-muted-foreground">{qv.financial.guaranteeHoldUnsupported}</p>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exceptions</h3>
                {qv.exceptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No arrival blockers.</p>
                ) : (
                  <ul className="space-y-1">
                    {qv.exceptions.map((item) => (
                      <li
                        key={item.key}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-xs",
                          item.blocking ? "bg-destructive/10 text-destructive" : "bg-[#F4E9D0] text-[#251605]",
                        )}
                      >
                        {item.label}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Readiness</h3>
                <ul className="space-y-1 text-sm">
                  <li>Guest verified: {qv.readiness.guestVerified ? "Yes" : "No"}</li>
                  <li>Registration: {qv.readiness.registrationComplete ? "Complete" : "Incomplete"}</li>
                  <li>Stay confirmed: {qv.readiness.stayConfirmed ? "Yes" : "No"}</li>
                  <li>
                    Room: {qv.readiness.roomAssigned ? (qv.readiness.roomReady ? "Ready" : "Not ready") : "Unassigned"}
                  </li>
                  <li>Deposit: {qv.readiness.depositSatisfied ? "Satisfied" : "Outstanding"}</li>
                </ul>
                {qv.readiness.blockers.length > 0 ? (
                  <ul className="space-y-1 text-xs text-destructive">
                    {qv.readiness.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <FoGuestServicesPanel
                restaurantId={restaurantId}
                reservationId={qv.stay.id}
                guestId={qv.stay.guestId}
                compact
              />

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {qv.hints.canAssignRoom ? (
                  <Button size="sm" variant="outline" onClick={() => onAssign(qv)}>
                    {qv.room.assigned ? "Change room" : "Assign Room"}
                  </Button>
                ) : null}
                {qv.hints.canUpdateEta ? (
                  <Button size="sm" variant="outline" onClick={() => onEta(qv)}>
                    Update ETA
                  </Button>
                ) : null}
                {qv.hints.needsRegistration || qv.hints.needsGuestVerification ? (
                  <Button size="sm" variant="outline" onClick={() => onRegister(qv)}>
                    {qv.hints.needsGuestVerification ? "Verify / Complete Guest" : "Register Guest"}
                  </Button>
                ) : null}
                {qv.hints.needsDeposit ? (
                  <Button size="sm" variant="outline" onClick={() => onCheckIn(qv)}>
                    Deposit / Guarantee
                  </Button>
                ) : null}
                {qv.hints.canOpenCheckIn ? (
                  <Button
                    size="sm"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    onClick={() => onCheckIn(qv)}
                  >
                    Check In
                  </Button>
                ) : (
                  <Button size="sm" disabled>
                    Check In
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: qv.stay.id }}>
                    Open Reservation
                  </Link>
                </Button>
                {qv.hints.canViewGuest ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: qv.stay.guestId }}>
                      Open Guest Profile
                    </Link>
                  </Button>
                ) : null}
                {qv.hints.canOpenFolio ? (
                  <Button size="sm" variant="outline" onClick={() => onOpenFolio(qv)}>
                    Open Folio
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
