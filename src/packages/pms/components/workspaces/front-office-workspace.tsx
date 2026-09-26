import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FrontOfficeChrome } from "@/packages/pms/components/frontoffice/front-office-chrome";
import { ComingSoonPanel, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { RoomRackCalendar } from "@/packages/pms/components/frontoffice/room-rack-calendar";
import { ReservationSideSheet, type SideSheetAction } from "@/packages/pms/components/frontoffice/reservation-side-sheet";
import {
  AmendmentsFrame,
  CancellationsFrame,
  GuestSearchDialog,
  NoShowsFrame,
  StayPickerDialog,
} from "@/packages/pms/components/frontoffice/front-office-frames";
import { ExceptionsFrame, useFoExceptionDesk } from "@/packages/pms/components/frontoffice/fo-exceptions-frame";
import { FoAuditViewer } from "@/packages/pms/components/frontoffice/fo-audit-viewer";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  RoomMoveDialog,
  StayDatesDialog,
  WalkInDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { FoAmendKindSheet, type FoAmendKind } from "@/packages/pms/components/frontoffice/fo-amend-sheet";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import { ArrivalsWorkspace } from "@/packages/pms/components/workspaces/arrivals-workspace";
import { DeparturesWorkspace } from "@/packages/pms/components/workspaces/departures-workspace";
import { InHouseWorkspace } from "@/packages/pms/components/workspaces/in-house-workspace";
import { WalkInsWorkspace } from "@/packages/pms/components/workspaces/walk-ins-workspace";
import { RoomQuickViewSheet, RoomOperationsHistorySheet, type RoomQuickViewAction } from "@/packages/pms/components/frontoffice/room-quick-view";
import type { FoRoomQuickView } from "@/packages/pms/lib/front-office-room-operations";
import { LIST_COMING_SOON_COLUMNS, foRackSearchSlice, invokeFoAction, resolveFoNav, type FoNavId, type FoSearch } from "@/packages/pms/lib/front-office-shell";
import { ComingSoonChip } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { listArrivals, listInHouse, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { getCashieringAccess } from "@/packages/pms/lib/cashiering.functions";
import type { FoRackFocus } from "@/packages/pms/lib/fo-exceptions";
import type { FoControlAction, FrontOfficeExceptionItem } from "@/packages/pms/lib/fo-control";
import { HK_HREF, INVENTORY_HREF, MAINTENANCE_HREF } from "@/packages/pms/lib/front-office-room-operations";
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

type LiveDialog = "assign" | "checkin" | "move" | "stay" | "checkout" | "noshow";
type PickerKind = "check_in" | "room_move" | "extend_stay" | "check_out" | "guest_request" | null;

const SHEET_AMEND: Record<string, FoAmendKind> = {
  upgrade_downgrade: "upgrade",
  add_remove_guest: "guests",
  add_service: "service",
  add_special_request: "special",
  guest_request: "guest_request",
};

/**
 * Issue #29 — Front Office command shell. Replaces the tab desk. Landing view
 * is Room Rack + Calendar. Existing list workspaces stay mounted under the
 * new nav. No new backend.
 */
export function FrontOfficeWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: FoSearch;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);
  const navigate = useNavigate();
  const initialTab = search.tab;

  const [view, setView] = useState<FoNavId>(() => resolveFoNav(initialTab));
  const [phone, setPhone] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [checkInStep, setCheckInStep] = useState<"stay" | "registration">("stay");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [sheetStay, setSheetStay] = useState<FrontOfficeStay | null>(null);
  const [dialogStay, setDialogStay] = useState<FrontOfficeStay | null>(null);
  const [dialog, setDialog] = useState<LiveDialog | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [amendKind, setAmendKind] = useState<FoAmendKind | null>(null);
  const [amendStay, setAmendStay] = useState<FrontOfficeStay | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [rackFocus, setRackFocus] = useState<FoRackFocus | null>(null);
  const [searchCancelStay, setSearchCancelStay] = useState<FrontOfficeStay | null>(null);
  const [roomQvId, setRoomQvId] = useState<string | null>(null);
  const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);

  const onRackSearchChange = useCallback(
    (next: { horizon: FoSearch["horizon"]; date: string; group: NonNullable<FoSearch["group"]> | "none" }) => {
      void navigate({
        to: "/restaurant/pms/front-office",
        search: {
          tab: "rack",
          ...foRackSearchSlice({
            horizon: next.horizon,
            date: next.date,
            group: next.group,
          }),
        },
        replace: true,
      });
    },
    [navigate],
  );

  function goToFoTab(id: FoNavId) {
    setComingSoon(null);
    setView(id);
    void navigate({
      to: "/restaurant/pms/front-office",
      search: { tab: id, ...foRackSearchSlice(search) },
      replace: true,
    });
  }

  function openStayQuickView(stay: FrontOfficeStay) {
    setRoomQvId(null);
    setHistoryRoomId(null);
    setSheetStay(stay);
  }

  function openRoomQuickView(roomId: string) {
    setSheetStay(null);
    setHistoryRoomId(null);
    setRoomQvId(roomId);
  }

  function runAfterRoomQuickView(fn: () => void) {
    setRoomQvId(null);
    if (phone) {
      window.setTimeout(fn, 220);
      return;
    }
    fn();
  }

  function onRoomQuickViewAction(action: RoomQuickViewAction, stay: FrontOfficeStay | null, view: FoRoomQuickView) {
    if (action === "open_housekeeping" || action === "open_maintenance" || action === "view_block") {
      setRoomQvId(null);
      return;
    }
    if (action === "view_history") {
      runAfterRoomQuickView(() => setHistoryRoomId(view.roomId));
      return;
    }
    if (action === "open_stay" && stay) {
      runAfterRoomQuickView(() => setSheetStay(stay));
      return;
    }
    if ((action === "assign" || action === "reassign") && stay) {
      runAfterRoomQuickView(() => openDialog("assign", stay));
      return;
    }
    if (action === "move" && stay) {
      runAfterRoomQuickView(() => openDialog("move", stay));
      return;
    }
    if (action === "check_in" && stay) {
      runAfterRoomQuickView(() => {
        setCheckInStep("stay");
        openDialog("checkin", stay);
      });
      return;
    }
    if (action === "check_out" && stay) {
      runAfterRoomQuickView(() => openDialog("checkout", stay));
    }
  }

  useEffect(() => {
    setView(resolveFoNav(initialTab));
  }, [initialTab]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const fetchAccess = useServerFn(getBookingsAccess);
  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const fetchCashiering = useServerFn(getCashieringAccess);
  const cashieringQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchCashiering({ data: { restaurantId } }),
    retry: false,
    enabled: canManage,
  });
  const canOpenCashiering = !!cashieringQuery.data;

  const exceptionDesk = useFoExceptionDesk(restaurantId, today, canManage);

  const fetchArrivals = useServerFn(listArrivals);
  const fetchInHouse = useServerFn(listInHouse);
  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, today, "confirmed", "all"],
    queryFn: () => fetchArrivals({ data: { restaurantId, date: today, status: "confirmed" } }),
    enabled: canManage && picker === "check_in",
    retry: false,
  });
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, ""],
    queryFn: () => fetchInHouse({ data: { restaurantId, today } }),
    enabled: canManage && (picker === "room_move" || picker === "extend_stay" || picker === "check_out" || picker === "guest_request"),
    retry: false,
  });

  function openDialog(kind: LiveDialog, stay: FrontOfficeStay) {
    setDialogStay(stay);
    setDialog(kind);
  }

  function onQuickAction(actionId: string) {
    const result = invokeFoAction(actionId, {});
    if (result.lane === "coming_soon") {
      setComingSoon(actionId);
      return;
    }
    if (actionId === "new_reservation") {
      void navigate({ to: "/restaurant/bookings/new" });
      return;
    }
    if (actionId === "walk_in") {
      setWalkIn(true);
      return;
    }
    if (actionId === "guest_search") {
      setSearchTerm("");
      setSearchOpen(true);
      return;
    }
    if (actionId === "check_in" || actionId === "room_move" || actionId === "extend_stay" || actionId === "check_out") {
      setPicker(actionId);
    }
    if (actionId === "guest_request") {
      setPicker("guest_request");
    }
  }

  function onExceptionAction(action: FoControlAction, stay: FrontOfficeStay | null, row: FrontOfficeExceptionItem) {
    if (action === "open_housekeeping") {
      void navigate({ to: HK_HREF });
      return;
    }
    if (action === "open_maintenance") {
      void navigate({ to: MAINTENANCE_HREF });
      return;
    }
    if (action === "open_inventory") {
      void navigate({ to: INVENTORY_HREF });
      return;
    }
    if (action === "open_folio") {
      if (canOpenCashiering) {
        void navigate({ to: "/restaurant/pms/cashiering", search: { tab: "folios" } });
        return;
      }
      if (stay) setSheetStay(stay);
      return;
    }
    if (action === "open_guest" && (stay?.guestId || row.guestId)) {
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: stay?.guestId ?? row.guestId! },
      });
      return;
    }
    if (action === "open_guest_services" && (stay?.guestId || row.guestId)) {
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: stay?.guestId ?? row.guestId! },
        search: guestProfileSearch({ card: "services" }),
      });
      return;
    }
    if (!stay) {
      if (row.roomId) openRoomQuickView(row.roomId);
      return;
    }
    if (action === "assign_room") {
      openDialog("assign", stay);
      return;
    }
    if (action === "move_room") {
      openDialog("move", stay);
      return;
    }
    if (action === "check_out") {
      openDialog("checkout", stay);
      return;
    }
    if (action === "amend_stay") {
      openDialog("stay", stay);
      return;
    }
    if (action === "set_late_checkout") {
      goToFoTab("inhouse");
      setSheetStay(stay);
      return;
    }
    if (action === "open_arrival") {
      goToFoTab("arrivals");
      setSheetStay(stay);
      return;
    }
    if (action === "open_inhouse") {
      goToFoTab("inhouse");
      setSheetStay(stay);
      return;
    }
    if (action === "open_departure") {
      goToFoTab("departures");
      setSheetStay(stay);
      return;
    }
  }

  function onSheetAction(action: SideSheetAction, stay: FrontOfficeStay) {
    const result = invokeFoAction(action, {});
    if (result.lane === "coming_soon") {
      setComingSoon(action);
      return;
    }
    if (action === "view") {
      void navigate({ to: "/restaurant/pms/reservations/$reservationId", params: { reservationId: stay.id } });
      return;
    }
    if (action === "view_folio") {
      setSheetStay(stay);
      return;
    }
    const map: Record<
      Exclude<
        SideSheetAction,
        | "view"
        | "view_folio"
        | "amend_notes"
        | "upgrade_downgrade"
        | "add_remove_guest"
        | "add_service"
        | "add_special_request"
        | "guest_request"
      >,
      LiveDialog
    > = {
      assign: "assign",
      room_move: "move",
      extend_stay: "stay",
      check_in: "checkin",
      check_out: "checkout",
      no_show: "noshow",
    };
    if (action === "amend_notes") {
      setView("amendments");
      setSheetStay(null);
      return;
    }
    const amend = SHEET_AMEND[action];
    if (amend) {
      setSheetStay(null);
      setAmendStay(stay);
      setAmendKind(amend);
      return;
    }
    const kind = map[action as keyof typeof map];
    if (kind) setSheetStay(null);
    if (kind === "checkin") {
      setCheckInStep("stay");
    }
    if (kind) openDialog(kind, stay);
  }

  if (accessQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Front Office…</p>;
  }
  if (!canManage) {
    return (
      <PermissionDeniedPanel message="Only owners, managers and receptionists can access Front Office for this property." />
    );
  }

  return (
    <FrontOfficeChrome
      membership={membership}
      active={view}
      onNavigate={goToFoTab}
      onQuickAction={onQuickAction}
      onGuestSearch={(term) => {
        setSearchTerm(term ?? "");
        setSearchOpen(true);
      }}
      exceptionBadge={exceptionDesk.failed ? 0 : exceptionDesk.badgeCount}
      onNotifications={() => {
        setView("exceptions");
        goToFoTab("exceptions");
      }}
      onFoActivity={() => setAuditOpen(true)}
      helpOpen={helpOpen}
      onHelpOpenChange={setHelpOpen}
      canOpenCashiering={canOpenCashiering}
    >
      {comingSoon ? (
        <ComingSoonPanel
          title="Coming soon"
          description="That Front Office action is not live. No reservation, inventory or money write was sent."
        />
      ) : null}

      {view === "rack" ? (
        <div className="space-y-3">
          <RoomRackCalendar
            restaurantId={restaurantId}
            today={today}
            viewport={phone ? "phone" : "wide"}
            rackFocus={rackFocus}
            initialHorizon={search.horizon}
            initialFocusDate={search.date}
            initialGroup={search.group ?? "none"}
            onSelectStay={openStayQuickView}
            onSelectRoom={openRoomQuickView}
            onRackSearchChange={onRackSearchChange}
            onWalkIn={() => setWalkIn(true)}
          />
        </div>
      ) : null}
      {view === "arrivals" ? (
        <ListFrame title="Arrivals">
          <ArrivalsWorkspace membership={membership} variant="arrivals" embedded />
        </ListFrame>
      ) : null}
      {view === "inhouse" ? (
        <ListFrame title="In-House Guests">
          <InHouseWorkspace membership={membership} embedded />
        </ListFrame>
      ) : null}
      {view === "departures" ? (
        <ListFrame title="Departures">
          <DeparturesWorkspace membership={membership} embedded />
        </ListFrame>
      ) : null}
      {view === "walkins" ? (
        <ListFrame title="Walk-ins">
          <WalkInsWorkspace membership={membership} embedded />
        </ListFrame>
      ) : null}
      {view === "amendments" ? <AmendmentsFrame restaurantId={restaurantId} today={today} /> : null}
      {view === "cancellations" ? <CancellationsFrame restaurantId={restaurantId} /> : null}
      {view === "noshows" ? <NoShowsFrame restaurantId={restaurantId} today={today} /> : null}
      {view === "exceptions" ? (
        <ExceptionsFrame
          restaurantId={restaurantId}
          today={today}
          onAction={onExceptionAction}
          onOpenSheet={openStayQuickView}
        />
      ) : null}

      {sheetStay ? (
        <ReservationSideSheet
          restaurantId={restaurantId}
          stay={sheetStay}
          open
          hasOpenDiscrepancy={Boolean(sheetStay.roomId && exceptionDesk.openDiscrepancyRoomIds.has(sheetStay.roomId))}
          onOpenChange={(open) => !open && setSheetStay(null)}
          onAction={onSheetAction}
        />
      ) : null}
      {roomQvId ? (
        <RoomQuickViewSheet
          restaurantId={restaurantId}
          roomId={roomQvId}
          businessDate={today}
          hasDiscrepancy={exceptionDesk.openDiscrepancyRoomIds.has(roomQvId)}
          open
          phone={phone}
          onOpenChange={(open) => !open && setRoomQvId(null)}
          onAction={onRoomQuickViewAction}
        />
      ) : null}
      {historyRoomId ? (
        <RoomOperationsHistorySheet
          restaurantId={restaurantId}
          roomId={historyRoomId}
          open
          onOpenChange={(open) => !open && setHistoryRoomId(null)}
        />
      ) : null}

      <WalkInDialog
        restaurantId={restaurantId}
        today={today}
        open={walkIn}
        onOpenChange={setWalkIn}
        onCreated={(created) => {
          setCheckInStep("registration");
          openDialog("checkin", created);
        }}
      />
      <GuestSearchDialog
        restaurantId={restaurantId}
        today={today}
        open={searchOpen}
        initialTerm={searchTerm}
        onOpenChange={setSearchOpen}
        onOpenStay={(stay) => {
          setSearchOpen(false);
          openStayQuickView(stay);
        }}
        onShowOnRack={(stay) => {
          setSearchOpen(false);
          setRackFocus({
            ...(stay.arrivalDate ? { focusDate: stay.arrivalDate } : {}),
            ...(stay.roomId ? { roomId: stay.roomId } : {}),
          });
          setView("rack");
        }}
        onCheckIn={(stay) => {
          setSearchOpen(false);
          setCheckInStep("stay");
          openDialog("checkin", stay);
        }}
        onCheckOut={(stay) => {
          setSearchOpen(false);
          openDialog("checkout", stay);
        }}
        onCancel={(stay) => {
          setSearchOpen(false);
          setSearchCancelStay(stay);
        }}
      />
      {searchCancelStay ? (
        <FoCancelStepper
          restaurantId={restaurantId}
          stay={searchCancelStay}
          open
          onOpenChange={(v) => !v && setSearchCancelStay(null)}
        />
      ) : null}
      <FoAuditViewer restaurantId={restaurantId} open={auditOpen} onOpenChange={setAuditOpen} />

      <StayPickerDialog
        title={
          picker === "check_in"
            ? "Check-in"
            : picker === "room_move"
              ? "Room Move"
              : picker === "extend_stay"
                ? "Extend Stay"
                : picker === "guest_request"
                  ? "Guest Request"
                  : "Check-out"
        }
        stays={picker === "check_in" ? (arrivalsQuery.data ?? []) : (inHouseQuery.data ?? [])}
        loading={picker === "check_in" ? arrivalsQuery.isLoading : inHouseQuery.isLoading}
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        onPick={(stay) => {
          if (picker === "check_in") {
            setCheckInStep("stay");
            openDialog("checkin", stay);
          }
          if (picker === "room_move") openDialog("move", stay);
          if (picker === "extend_stay") openDialog("stay", stay);
          if (picker === "check_out") openDialog("checkout", stay);
          if (picker === "guest_request") {
            setAmendStay(stay);
            setAmendKind("guest_request");
          }
        }}
      />

      {dialogStay && dialog === "assign" ? (
        <AssignRoomDialog restaurantId={restaurantId} stay={dialogStay} open onOpenChange={(v) => !v && setDialog(null)} />
      ) : null}
      {dialogStay && dialog === "checkin" ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          open
          initialStep={checkInStep}
          onOpenChange={(v) => {
            if (!v) {
              setDialog(null);
              setCheckInStep("stay");
            }
          }}
        />
      ) : null}
      {dialogStay && dialog === "move" ? (
        <RoomMoveDialog restaurantId={restaurantId} stay={dialogStay} open onOpenChange={(v) => !v && setDialog(null)} />
      ) : null}
      {dialogStay && dialog === "stay" ? (
        <StayDatesDialog restaurantId={restaurantId} stay={dialogStay} open onOpenChange={(v) => !v && setDialog(null)} />
      ) : null}
      {dialogStay && dialog === "checkout" ? (
        <CheckOutDialog restaurantId={restaurantId} stay={dialogStay} open onOpenChange={(v) => !v && setDialog(null)} />
      ) : null}
      {dialogStay && dialog === "noshow" ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          today={today}
          open
          onOpenChange={(v) => !v && setDialog(null)}
        />
      ) : null}
      {amendStay && amendKind ? (
        <FoAmendKindSheet
          kind={amendKind}
          restaurantId={restaurantId}
          stay={amendStay}
          open
          onOpenChange={(v) => {
            if (!v) {
              setAmendKind(null);
              setAmendStay(null);
            }
          }}
        />
      ) : null}
    </FrontOfficeChrome>
  );
}

function ListFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {LIST_COMING_SOON_COLUMNS.map((col) => (
            <ComingSoonChip key={col.id} label={col.label} />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
