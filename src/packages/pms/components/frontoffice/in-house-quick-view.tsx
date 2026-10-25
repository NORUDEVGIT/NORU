import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";

import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeInHouseQuickView,
  type FoInHouseQuickView,
} from "@/packages/pms/lib/fo-inhouse.functions";
import { inHouseMenuItems } from "@/packages/pms/lib/fo-inhouse";
import { foOperationalQueryOptions } from "@/packages/pms/lib/fo-freshness";
import { FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS } from "@/packages/pms/lib/fo-check-in-workspace";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
import { useMoney } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";

/** Same compact card pattern as FoCheckInWorkspaceSheet, kept local to avoid cross-file coupling. */
function Card({
  title,
  testId,
  actions,
  children,
}: {
  title: string;
  testId?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {actions}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <dl className="space-y-1">{children}</dl>;
}

function DlRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 text-sm">
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
  | "open_maintenance"
  | "check_out";

export function InHouseQuickViewSheet({
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
  onAction: (action: InHouseQuickViewAction, qv: FoInHouseQuickView) => void;
}) {
  const money = useMoney();
  const fetchQv = useServerFn(getFrontOfficeInHouseQuickView);
  const qvQuery = useQuery({
    queryKey: ["front-office", "inhouse-qv", restaurantId, reservationId, reservationRoomId],
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

  // Canonical hints decide what is visible; this component only relabels and
  // regroups the same ids for the header / More actions dropdown.
  const menu = qv ? inHouseMenuItems(qv.hints) : [];
  const amendStayAvailable = menu.some((item) => item.id === "amend_stay");
  const maintenanceRelevant = Boolean(
    qv?.room.maintenanceStatus && qv.room.maintenanceStatus !== "none",
  );
  const amendSubItems: { id: InHouseQuickViewAction; label: string }[] = amendStayAvailable
    ? [
        { id: "amend_stay", label: "Extend Stay" },
        { id: "amend_stay", label: "Early Departure" },
        { id: "guests", label: "Occupancy" },
        { id: "upgrade", label: "Room type change" },
        { id: "special", label: "Special Request" },
      ]
    : [];
  const flatItems = menu
    .filter(
      (item) =>
        !["room_move", "check_out", "amend_stay", "upgrade", "guests", "special"].includes(item.id),
    )
    .map((item) => ({
      id: item.id as InHouseQuickViewAction,
      label: item.id === "open_guest" ? "Update Guest" : item.label,
    }))
    .concat(maintenanceRelevant ? [{ id: "open_maintenance" as const, label: "Maintenance" }] : []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-dvh w-full flex-col gap-0 overflow-hidden p-0",
          FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
        )}
        data-testid="fo-inhouse-qv"
      >
        {qv ? (
          <SheetHeader
            className="shrink-0 space-y-2 border-b border-border py-4 pl-5 pr-12 text-left"
            data-testid="fo-inhouse-qv-header"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <SheetTitle className="font-display text-xl">{qv.guest.fullName}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{qv.stay.confirmationNumber}</span>
                  <ReservationStatusBadge status={qv.stay.status} />
                  {qv.guest.vip ? <VipBadge /> : null}
                  {qv.room.roomNumber ? (
                    <span
                      className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
                      data-testid="fo-inhouse-qv-room"
                    >
                      Room {qv.room.roomNumber}
                    </span>
                  ) : null}
                </SheetDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {qv.hints.canCheckOut ? (
                  <Button
                    size="sm"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    onClick={() => onAction("check_out", qv)}
                    data-testid="fo-inhouse-qv-check-out"
                  >
                    Check Out
                  </Button>
                ) : null}
                {qv.hints.canMoveRoom ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction("room_move", qv)}
                    data-testid="fo-inhouse-qv-move-room"
                  >
                    Move Room
                  </Button>
                ) : null}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="fo-inhouse-qv-menu">
                      More actions
                      <ChevronDown className="ml-1 size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {amendSubItems.length > 0 ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Amend Stay</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {amendSubItems.map((item) => (
                            <DropdownMenuItem
                              key={`${item.id}-${item.label}`}
                              data-testid={
                                item.label === "Extend Stay"
                                  ? "fo-inhouse-extend"
                                  : item.label === "Early Departure"
                                    ? "fo-inhouse-early-departure"
                                    : undefined
                              }
                              onSelect={() => onAction(item.id, qv)}
                            >
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    {amendSubItems.length > 0 && flatItems.length > 0 ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {flatItems.map((item) => (
                      <DropdownMenuItem key={item.id} onSelect={() => onAction(item.id, qv)}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </SheetHeader>
        ) : null}

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {denied ? (
            <PermissionDeniedPanel title="Cannot open this stay" />
          ) : qvQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading stay…</p>
          ) : qvQuery.isError ? (
            <div className="space-y-2 text-sm">
              <p className="text-destructive">
                {qvQuery.error instanceof Error
                  ? qvQuery.error.message
                  : "Could not load this stay."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void qvQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : qv ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <Card title="Stay Information" testId="fo-inhouse-qv-stay-information">
                <FieldGroup>
                  <DlRow label="Arrival" value={formatStayDate(qv.stay.arrivalDate)} />
                  <DlRow label="Departure" value={formatStayDate(qv.stay.departureDate)} />
                  <DlRow
                    label="Nights"
                    value={`${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                  />
                  <DlRow
                    label="Adults / Children"
                    value={`${qv.stay.adults} / ${qv.stay.children ?? 0}`}
                  />
                  <DlRow label="Room Type" value={qv.stay.roomTypeName} />
                  <DlRow
                    label="Late Checkout"
                    value={
                      qv.lateCheckout.granted
                        ? qv.lateCheckout.until
                          ? `Granted · ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(qv.lateCheckout.until))}`
                          : "Granted"
                        : "Not set"
                    }
                  />
                  <DlRow
                    label="Checkout Time"
                    value={qv.lateCheckout.policy.checkOutTime || "Not configured"}
                  />
                </FieldGroup>
              </Card>

              <Card title="Guest Information" testId="fo-inhouse-qv-guest">
                <FieldGroup>
                  <div className="flex items-center gap-2 pb-1">
                    <p className="font-display text-base font-semibold">{qv.guest.fullName}</p>
                    {qv.guest.vip ? <VipBadge /> : null}
                  </div>
                  <DlRow label="Phone" value={qv.guest.phone || "—"} />
                  <DlRow label="Email" value={qv.guest.email || "—"} />
                </FieldGroup>
              </Card>

              <Card title="Room Information" testId="fo-inhouse-qv-room-information">
                <FieldGroup>
                  <DlRow
                    label="Room"
                    value={qv.room.roomNumber ? `Room ${qv.room.roomNumber}` : "Unassigned"}
                  />
                  <DlRow label="Room Type" value={qv.stay.roomTypeName} />
                  <DlRow label="Building" value={qv.room.building || "—"} />
                  <DlRow label="Floor" value={qv.room.floor || "—"} />
                  <DlRow label="Status" value={qv.room.status || "—"} />
                  <DlRow label="Housekeeping" value={qv.room.housekeepingStatus || "—"} />
                  {maintenanceRelevant ? (
                    <DlRow label="Maintenance" value={qv.room.maintenanceStatus} />
                  ) : null}
                </FieldGroup>
              </Card>

              <Card title="Financial Overview" testId="fo-inhouse-qv-financial">
                {qv.financial.lane === "permission_denied" ? (
                  <PermissionDeniedPanel title="Folio permission denied" />
                ) : (
                  <FieldGroup>
                    <DlRow
                      label="Folio"
                      value={
                        qv.financial.lane !== "live"
                          ? "Not available"
                          : qv.financial.folioNumber || (qv.financial.folioId ? "Open" : "None yet")
                      }
                    />
                    <DlRow
                      label="Balance"
                      value={
                        qv.financial.lane !== "live" || qv.financial.balance == null
                          ? "—"
                          : money(qv.financial.balance)
                      }
                    />
                    <DlRow
                      label="Status"
                      value={
                        qv.financial.open ? "Open" : qv.financial.folioId ? "Open" : "No folio"
                      }
                    />
                  </FieldGroup>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Payments stay in Cashiering.</p>
              </Card>

              <Card
                title="Special Requests / Guest Services"
                testId="fo-inhouse-qv-special-requests"
              >
                <p className="text-sm text-foreground">
                  {qv.stay.specialRequests?.trim() || "No special request."}
                </p>
                <div className="mt-3">
                  <FoGuestServicesPanel
                    restaurantId={restaurantId}
                    reservationId={qv.stay.id}
                    guestId={qv.stay.guestId}
                  />
                </div>
              </Card>

              <Card title="Internal Notes" testId="fo-inhouse-qv-notes">
                <p className="text-sm text-foreground" id="fo-inhouse-notes">
                  {qv.notes?.trim() || "No internal note."}
                </p>
              </Card>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
