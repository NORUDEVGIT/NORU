import { useEffect, useState, type ReactNode } from "react";
import { Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
import { getCheckOutContext } from "@/packages/pms/lib/fo-check-out.functions";
import { inHouseMenuItems } from "@/packages/pms/lib/fo-inhouse";
import { foOperationalQueryOptions } from "@/packages/pms/lib/fo-freshness";
import { FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS } from "@/packages/pms/lib/fo-check-in-workspace";
import {
  foFolioPaymentStatusLabel,
  foGuestWorkspaceTabs,
  foInHouseRoomInventoryNote,
  type FoGuestWorkspaceTabId,
} from "@/packages/pms/lib/fo-guest-workspace-tabs";
import {
  FoGuestWorkspaceTabBar,
  FoWorkflowPanel,
  FoWorkflowUnavailable,
} from "@/packages/pms/components/frontoffice/fo-guest-workspace-tabs";
import { FoGuestServicesPanel } from "@/packages/pms/components/frontoffice/fo-guest-services-panel";
import { FoEditDetailsForm } from "@/packages/pms/components/frontoffice/fo-edit-details-form";
import { FoFolioChargesPanel } from "@/packages/pms/components/frontoffice/fo-folio-charges-panel";
import { useMoney } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
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
  children,
}: {
  title: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid={testId}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
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

const GOLD_BUTTON = "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]";

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
  initialTab = "overview",
  open,
  onOpenChange,
  onAction,
}: {
  restaurantId: string;
  reservationId: string | null;
  reservationRoomId?: string | null;
  initialTab?: FoGuestWorkspaceTabId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: InHouseQuickViewAction, qv: FoInHouseQuickView) => void;
}) {
  const money = useMoney();
  const [tab, setTab] = useState<FoGuestWorkspaceTabId>(initialTab);
  const fetchQv = useServerFn(getFrontOfficeInHouseQuickView);
  const fetchCheckOut = useServerFn(getCheckOutContext);

  useEffect(() => {
    setTab(initialTab);
  }, [reservationId, reservationRoomId, initialTab]);

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
  const folioLive = qv?.financial.lane === "live";

  // Same read the checkout stepper uses; only requested when the folio lane is visible.
  const checkOutQuery = useQuery({
    queryKey: ["fo-check-out", restaurantId, qv?.stay.id],
    queryFn: () => fetchCheckOut({ data: { restaurantId, reservationId: qv!.stay.id } }),
    enabled: open && Boolean(qv) && folioLive,
    retry: false,
  });
  const folio = folioLive ? checkOutQuery.data?.folio : undefined;

  // Canonical hints decide what is visible; tabs only regroup the same action ids.
  const menuIds = new Set((qv ? inHouseMenuItems(qv.hints) : []).map((item) => item.id));
  const amendStayAvailable = menuIds.has("amend_stay");
  const maintenanceRelevant = Boolean(
    qv?.room.maintenanceStatus && qv.room.maintenanceStatus !== "none",
  );
  const canReadFolio = qv?.financial.lane === "live";
  const tabs = qv ? foGuestWorkspaceTabs(qv.stay.status, { canReadFolio }) : [];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "overview";
  const inventoryNote = foInHouseRoomInventoryNote(qv?.room.status);

  const lateCheckoutLabel = qv
    ? qv.lateCheckout.granted
      ? qv.lateCheckout.until
        ? `Granted · ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(qv.lateCheckout.until))}`
        : "Granted"
      : "Not set"
    : "—";

  function financialRows(view: FoInHouseQuickView) {
    if (view.financial.lane === "permission_denied") {
      return <PermissionDeniedPanel title="Folio permission denied" />;
    }
    if (view.financial.lane !== "live") {
      return <p className="text-sm text-muted-foreground">Folio is not available for this stay.</p>;
    }
    const balance = folio?.balance ?? view.financial.balance;
    return (
      <FieldGroup>
        <DlRow
          label="Folio No."
          value={
            folio?.folioNumber ||
            view.financial.folioNumber ||
            (view.financial.folioId ? "Open" : "None yet")
          }
        />
        <DlRow label="Total charges" value={folio ? money(folio.charges) : "—"} />
        <DlRow label="Payments & credits" value={folio ? money(folio.credits) : "—"} />
        <DlRow label="Balance due" value={balance == null ? "—" : money(balance)} />
        <DlRow label="Payment status" value={foFolioPaymentStatusLabel(balance)} />
        <DlRow
          label="Folio status"
          value={
            folio?.status === "closed"
              ? "Closed"
              : folio?.status === "open" || view.financial.folioId
                ? "Open"
                : "No folio"
          }
        />
      </FieldGroup>
    );
  }

  function roomRows(view: FoInHouseQuickView) {
    return (
      <FieldGroup>
        <DlRow
          label="Room"
          value={view.room.roomNumber ? `Room ${view.room.roomNumber}` : "Unassigned"}
        />
        <DlRow label="Room Type" value={view.stay.roomTypeName} />
        <DlRow label="Building" value={view.room.building || "—"} />
        <DlRow label="Floor" value={view.room.floor || "—"} />
        <DlRow
          label="Occupancy"
          value={<span data-testid="fo-inhouse-qv-occupancy">Occupied · In-house</span>}
        />
        {inventoryNote ? <DlRow label="Room Status" value={inventoryNote} /> : null}
        <DlRow label="Housekeeping" value={view.room.housekeepingStatus || "—"} />
        <DlRow
          label="Maintenance"
          value={maintenanceRelevant ? view.room.maintenanceStatus : "None reported"}
        />
      </FieldGroup>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 [&>button]:text-[#F6EFE4] [&>button]:hover:text-white",
          FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
        )}
        data-testid="fo-inhouse-qv"
      >
        {qv ? (
          <SheetHeader
            className="shrink-0 space-y-3 border-b border-[#3A2A16] bg-[#1A1208] pb-0 pl-5 pr-12 pt-4 text-left"
            data-testid="fo-inhouse-qv-header"
          >
            <div className="min-w-0 space-y-2">
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[#C4B39A]">
                <span className="flex size-7 items-center justify-center rounded-md bg-[#C89933] text-[#1A1208]">
                  <Calendar className="size-3.5" />
                </span>
                <span className="font-semibold text-[#C89933]">{qv.stay.confirmationNumber}</span>
                <ReservationStatusBadge status={qv.stay.status} />
                {qv.guest.vip ? <VipBadge /> : null}
                {qv.room.roomNumber ? (
                  <span
                    className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-[#F6EFE4]"
                    data-testid="fo-inhouse-qv-room"
                  >
                    Room {qv.room.roomNumber}
                  </span>
                ) : null}
              </SheetDescription>
              <SheetTitle className="font-display text-xl text-[#F6EFE4]">
                {qv.guest.fullName}
              </SheetTitle>
            </div>
            <FoGuestWorkspaceTabBar tabs={tabs} active={activeTab} onSelect={setTab} />
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
          ) : !qv ? null : activeTab === "overview" ? (
            <div
              role="tabpanel"
              className="grid gap-3 lg:grid-cols-2"
              data-testid="fo-inhouse-qv-overview"
            >
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

              <Card title="Stay & Accommodation" testId="fo-inhouse-qv-stay-information">
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
                  <DlRow label="Late Checkout" value={lateCheckoutLabel} />
                  <DlRow
                    label="Checkout Time"
                    value={qv.lateCheckout.policy.checkOutTime || "Not configured"}
                  />
                </FieldGroup>
              </Card>

              <Card title="Financial Summary" testId="fo-inhouse-qv-financial">
                {financialRows(qv)}
              </Card>

              <Card title="Room Information" testId="fo-inhouse-qv-room-information">
                {roomRows(qv)}
              </Card>

              <Card title="Special Requests / Notes" testId="fo-inhouse-qv-special-requests">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Special requests</p>
                    <p className="text-sm text-foreground">
                      {qv.stay.specialRequests?.trim() || "No special request."}
                    </p>
                  </div>
                  <div data-testid="fo-inhouse-qv-notes">
                    <p className="text-xs text-muted-foreground">Internal notes</p>
                    <p className="text-sm text-foreground" id="fo-inhouse-notes">
                      {qv.notes?.trim() || "No internal note."}
                    </p>
                  </div>
                  <FoGuestServicesPanel
                    restaurantId={restaurantId}
                    reservationId={qv.stay.id}
                    guestId={qv.stay.guestId}
                    summaryOnly
                  />
                </div>
              </Card>
            </div>
          ) : activeTab === "edit_details" ? (
            <FoEditDetailsForm
              restaurantId={restaurantId}
              stay={qv.stay}
              notes={qv.notes}
              testId="fo-inhouse-qv-tab-edit-details"
            />
          ) : activeTab === "move_room" ? (
            <FoWorkflowPanel
              title="Move / Change Room"
              description="Room moves use the existing in-house move workflow for this room unit."
              testId="fo-inhouse-qv-tab-move-room"
            >
              {roomRows(qv)}
              <div className="flex flex-wrap gap-2">
                {qv.hints.canMoveRoom ? (
                  <Button
                    size="sm"
                    className={GOLD_BUTTON}
                    onClick={() => onAction("room_move", qv)}
                    data-testid="fo-inhouse-qv-move-room"
                  >
                    Move Room
                  </Button>
                ) : (
                  <FoWorkflowUnavailable>
                    Room move is not available for this stay.
                  </FoWorkflowUnavailable>
                )}
                {maintenanceRelevant ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction("open_maintenance", qv)}
                    data-testid="fo-inhouse-qv-maintenance"
                  >
                    Maintenance
                  </Button>
                ) : null}
              </div>
            </FoWorkflowPanel>
          ) : activeTab === "extend_stay" ? (
            <FoWorkflowPanel
              title="Extend Stay"
              description="Date changes use the existing priced stay-date workflow."
              testId="fo-inhouse-qv-tab-extend-stay"
            >
              <FieldGroup>
                <DlRow label="Arrival" value={formatStayDate(qv.stay.arrivalDate)} />
                <DlRow label="Departure" value={formatStayDate(qv.stay.departureDate)} />
                <DlRow
                  label="Nights"
                  value={`${qv.stay.nights} night${qv.stay.nights === 1 ? "" : "s"}`}
                />
              </FieldGroup>
              {amendStayAvailable ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className={GOLD_BUTTON}
                    data-testid="fo-inhouse-extend"
                    onClick={() => onAction("amend_stay", qv)}
                  >
                    Extend Stay
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="fo-inhouse-early-departure"
                    onClick={() => onAction("amend_stay", qv)}
                  >
                    Early Departure
                  </Button>
                </div>
              ) : (
                <FoWorkflowUnavailable>
                  Stay dates cannot be changed for this stay.
                </FoWorkflowUnavailable>
              )}
            </FoWorkflowPanel>
          ) : activeTab === "check_out" ? (
            <FoWorkflowPanel
              title="Check-Out / Folio Review"
              description="Review the folio, then settle and check out through the existing checkout workflow. Payments stay in Cashiering."
              testId="fo-inhouse-qv-tab-check-out"
            >
              {financialRows(qv)}
              <div className="flex flex-wrap gap-2">
                {qv.hints.canCheckOut ? (
                  <Button
                    size="sm"
                    className={GOLD_BUTTON}
                    onClick={() => onAction("check_out", qv)}
                    data-testid="fo-inhouse-qv-check-out"
                  >
                    Check Out
                  </Button>
                ) : (
                  <FoWorkflowUnavailable>
                    Check-out is not available for this stay.
                  </FoWorkflowUnavailable>
                )}
                {menuIds.has("open_folio") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTab("folio")}
                    data-testid="fo-inhouse-qv-open-folio"
                  >
                    Open Folio
                  </Button>
                ) : null}
              </div>
            </FoWorkflowPanel>
          ) : activeTab === "folio" ? (
            <FoFolioChargesPanel
              restaurantId={restaurantId}
              reservationId={qv.stay.id}
              reservationRoomId={reservationRoomId}
              guestName={qv.guest.fullName}
              confirmationNumber={qv.stay.confirmationNumber}
              roomNumber={qv.room.roomNumber}
              roomTypeName={qv.stay.roomTypeName}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
