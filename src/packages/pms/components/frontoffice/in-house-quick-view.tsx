import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeInHouseQuickView,
  type FoInHouseQuickView,
} from "@/packages/pms/lib/fo-inhouse.functions";
import { inHouseMenuItems } from "@/packages/pms/lib/fo-inhouse";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
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

export type InHouseQuickViewAction =
  | "room_move"
  | "amend_stay"
  | "upgrade"
  | "guests"
  | "special"
  | "late_checkout"
  | "add_service"
  | "guest_request"
  | "open_guest"
  | "open_folio"
  | "check_out";

export function InHouseQuickViewSheet({
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
  onAction: (action: InHouseQuickViewAction, qv: FoInHouseQuickView) => void;
}) {
  const money = useMoney();
  const fetchQv = useServerFn(getFrontOfficeInHouseQuickView);
  const qvQuery = useQuery({
    queryKey: ["front-office", "inhouse-qv", restaurantId, reservationId],
    queryFn: () => fetchQv({ data: { restaurantId, reservationId: reservationId! } }),
    enabled: open && Boolean(reservationId),
    retry: false,
  });

  const qv = qvQuery.data;
  const denied = qvQuery.isError && isPermissionDeniedMessage(qvQuery.error);
  const menu = qv ? inHouseMenuItems(qv.hints) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto sm:max-w-md"
        data-testid="fo-inhouse-qv"
      >
        <SheetHeader>
          <SheetTitle>In-House Quick View</SheetTitle>
          <SheetDescription>What does Front Desk need to know or do for this guest right now?</SheetDescription>
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
                        onSelect={() => onAction(item.id as InHouseQuickViewAction, qv)}
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
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay</h3>
              <dl className="space-y-1.5">
                <Field
                  label="Dates"
                  value={`${formatStayDate(qv.stay.arrivalDate)} → ${formatStayDate(qv.stay.departureDate)} · ${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                />
                <Field label="Room" value={qv.room.roomNumber ? `Room ${qv.room.roomNumber}` : "Unassigned"} />
                <Field label="Room type" value={qv.stay.roomTypeName} />
                <Field
                  label="Occupancy"
                  value={`${qv.stay.adults} adult${qv.stay.adults === 1 ? "" : "s"}${qv.stay.children ? ` · ${qv.stay.children} child${qv.stay.children === 1 ? "" : "ren"}` : ""}`}
                />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room</h3>
              <dl className="space-y-1.5">
                <Field label="Status" value={qv.room.status || "—"} />
                <Field label="Housekeeping" value={qv.room.housekeepingStatus || "—"} />
                <Field label="Floor" value={qv.room.floor || "—"} />
                {qv.room.maintenanceStatus && qv.room.maintenanceStatus !== "none" ? (
                  <Field label="Maintenance" value={qv.room.maintenanceStatus} />
                ) : null}
              </dl>
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
                    label="Status"
                    value={qv.financial.open ? "Open" : qv.financial.folioId ? "Open" : "No folio"}
                  />
                </dl>
              )}
              <p className="text-xs text-muted-foreground">Payments stay in Cashiering.</p>
            </section>

            <FoGuestServicesPanel
              restaurantId={restaurantId}
              reservationId={qv.stay.id}
              guestId={qv.stay.guestId}
            />

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stay controls</h3>
              <dl className="space-y-1.5">
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
                <Field label="Checkout time" value={qv.lateCheckout.policy.checkOutTime || "Not configured"} />
                <Field label="Requests" value={qv.stay.specialRequests?.trim() || "—"} />
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exceptions</h3>
              {qv.exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No operational exceptions.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {qv.exceptions.map((item) => (
                    <li key={item.key} className={item.blocking ? "text-destructive" : "text-foreground"}>
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
