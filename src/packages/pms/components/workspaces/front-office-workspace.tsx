import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { toast } from "sonner";

import { FrontOfficeChrome } from "@/packages/pms/components/frontoffice/front-office-chrome";
import { ComingSoonPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { RoomRackCalendar } from "@/packages/pms/components/frontoffice/room-rack-calendar";
import {
  ReservationSideSheet,
  type SideSheetAction,
} from "@/packages/pms/components/frontoffice/reservation-side-sheet";
import { FoCheckInWorkspaceSheet } from "@/packages/pms/components/frontoffice/fo-check-in-workspace-sheet";
import {
  foCheckInWorkspaceInitialStep,
  foOpensFullGuestWorkspace,
  type FoRackInHouseTarget,
} from "@/packages/pms/lib/fo-check-in-workspace";
import { foOpenFolioTarget } from "@/packages/pms/lib/fo-folio-tab";
import {
  AmendNotesDialog,
  GuestSearchDialog,
  StayPickerDialog,
} from "@/packages/pms/components/frontoffice/front-office-frames";
import { useFoExceptionDesk } from "@/packages/pms/components/frontoffice/fo-exceptions-frame";
import { FoAuditViewer } from "@/packages/pms/components/frontoffice/fo-audit-viewer";
import {
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  RoomMoveDialog,
  StayDatesDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import {
  FoAmendKindSheet,
  type FoAmendKind,
} from "@/packages/pms/components/frontoffice/fo-amend-sheet";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import {
  InHouseQuickViewSheet,
  type InHouseQuickViewAction,
} from "@/packages/pms/components/frontoffice/in-house-quick-view";
import { LateCheckoutDialog } from "@/packages/pms/components/workspaces/arrivals-departures-dialogs";
import { FoMaintenanceActionModal } from "@/packages/pms/components/frontoffice/fo-maintenance-action-modal";
import {
  getFrontOfficeInHouseQuickView,
  type FoInHouseQuickView,
} from "@/packages/pms/lib/fo-inhouse.functions";
import type { FoGuestWorkspaceTabId } from "@/packages/pms/lib/fo-guest-workspace-tabs";
import {
  FO_RACK_UNRESOLVED_UNIT_MESSAGE,
  type FoRackBarActionId,
} from "@/packages/pms/lib/fo-rack-bar-menu";
import type { DepartureRow } from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import { RoomOperationsHistorySheet } from "@/packages/pms/components/frontoffice/room-quick-view";
import {
  FoHousekeepingTaskModal,
  type FoHkTaskRoomTarget,
} from "@/packages/pms/components/frontoffice/fo-housekeeping-task-modal";
import {
  foRackSearchSlice,
  invokeFoAction,
  resolveFoNav,
  type FoNavId,
  type FoSearch,
} from "@/packages/pms/lib/front-office-shell";
import {
  listArrivals,
  listInHouse,
  type FrontOfficeStay,
} from "@/packages/pms/lib/frontoffice.functions";
import { listFoStayAmendmentHistory } from "@/packages/pms/lib/fo-amendments.functions";
import { stayAmendmentsForReservation } from "@/packages/pms/lib/fo-amendments";
import type { FoRackFocus } from "@/packages/pms/lib/fo-exceptions";
import type { FoControlAction, FrontOfficeExceptionItem } from "@/packages/pms/lib/fo-control";
import {
  HK_HREF,
  INVENTORY_HREF,
  MAINTENANCE_HREF,
} from "@/packages/pms/lib/front-office-room-operations";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { CreateReservationPage } from "@/packages/pms/components/bookings/create-reservation-page";
import {
  ReservationWorkspaceOverlay,
  type ReservationWorkspaceOverlayState,
} from "@/packages/pms/components/reservations/reservation-workspace-overlay";
import { ReservationDetailWorkspace } from "@/packages/pms/components/workspaces/reservation-detail-workspace";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTimezone } from "@/core/state/property-format";
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
function walkInContinueStay(
  created: { id: string; confirmationNumber: string; guestName: string },
  businessDate: string,
): FrontOfficeStay {
  return {
    id: created.id,
    confirmationNumber: created.confirmationNumber,
    guestId: "",
    guestName: created.guestName,
    guestVip: false,
    guestPhone: null,
    guestEmail: null,
    roomTypeId: "",
    roomTypeName: "",
    roomId: null,
    roomNumber: null,
    arrivalDate: businessDate,
    departureDate: businessDate,
    nights: 0,
    adults: 1,
    children: 0,
    status: "confirmed",
    specialRequests: null,
    source: "walk_in",
    overstay: false,
  };
}

function lateRowFromInHouse(qv: FoInHouseQuickView): DepartureRow {
  return {
    reservationId: qv.stay.id,
    confirmationNumber: qv.stay.confirmationNumber,
    guest: { id: qv.stay.guestId, name: qv.guest.fullName, vip: qv.guest.vip },
    stay: {
      arrivalDate: qv.stay.arrivalDate,
      departureDate: qv.stay.departureDate,
      status: qv.stay.status,
      inHouse: qv.stay.status === "checked_in",
      overstay: qv.stay.overstay,
    },
    room: {
      roomTypeId: qv.stay.roomTypeId,
      roomTypeName: qv.stay.roomTypeName,
      roomId: qv.stay.roomId,
      roomNumber: qv.stay.roomNumber,
      housekeepingStatus: qv.room.housekeepingStatus,
      operationalStatus: qv.room.status,
    },
    financial: {
      state:
        qv.financial.lane === "live"
          ? "available"
          : qv.financial.lane === "permission_denied"
            ? "permission_denied"
            : "not_available",
      folioId: qv.financial.folioId,
      balance: qv.financial.balance,
      depositPosted: null,
      depositWaived: null,
    },
    operational: {
      specialRequests: qv.stay.specialRequests,
      lateCheckout: {
        granted: qv.lateCheckout.granted,
        until: qv.lateCheckout.until,
        note: qv.lateCheckout.note,
        policy: qv.lateCheckout.policy,
      },
      exceptionKeys: qv.stay.overstay ? ["overstay"] : [],
    },
    hints: {
      canOpen: true,
      canCheckOut: qv.hints.canCheckOut,
      canExtendStay: qv.hints.canAmendStay,
      canGrantLateCheckout: qv.hints.canSetLateCheckout,
      canOpenFolio: qv.hints.canOpenFolio,
    },
  };
}

export function FrontOfficeWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: FoSearch;
}) {
  const restaurantId = membership.restaurant.id;
  const permissions = usePmsPermissions(restaurantId);
  const timezone = useRestaurantTimezone();
  const today = usePropertyBusinessDate(restaurantId, timezone);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const initialTab = search.tab;

  const [view, setView] = useState<FoNavId>(() => resolveFoNav(initialTab));
  const [phone, setPhone] = useState(false);
  const [reservationOverlay, setReservationOverlay] =
    useState<ReservationWorkspaceOverlayState>(null);
  const [checkInStep, setCheckInStep] = useState<"stay" | "registration">("stay");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [sheetStay, setSheetStay] = useState<FrontOfficeStay | null>(null);
  const [guestTab, setGuestTab] = useState<FoGuestWorkspaceTabId>("overview");
  const [dialogStay, setDialogStay] = useState<FrontOfficeStay | null>(null);
  const [dialog, setDialog] = useState<LiveDialog | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [amendKind, setAmendKind] = useState<FoAmendKind | null>(null);
  const [amendStay, setAmendStay] = useState<FrontOfficeStay | null>(null);
  const [notesStay, setNotesStay] = useState<FrontOfficeStay | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [rackFocus, setRackFocus] = useState<FoRackFocus | null>(null);
  const [searchCancelStay, setSearchCancelStay] = useState<FrontOfficeStay | null>(null);
  const [hkTaskRoom, setHkTaskRoom] = useState<FoHkTaskRoomTarget | null>(null);
  const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);
  const [inHouseQv, setInHouseQv] = useState<FoRackInHouseTarget | null>(null);
  const [inHouseMove, setInHouseMove] = useState<FrontOfficeStay | null>(null);
  const [inHouseDates, setInHouseDates] = useState<FrontOfficeStay | null>(null);
  const [inHouseCheckOut, setInHouseCheckOut] = useState<FrontOfficeStay | null>(null);
  const [inHouseLate, setInHouseLate] = useState<FoInHouseQuickView | null>(null);
  const [inHouseAmend, setInHouseAmend] = useState<{
    stay: FrontOfficeStay;
    kind: FoAmendKind;
  } | null>(null);
  const [inHouseMaintenance, setInHouseMaintenance] = useState<FrontOfficeStay | null>(null);

  const onRackSearchChange = useCallback(
    (next: {
      horizon: FoSearch["horizon"];
      date: string;
      group: NonNullable<FoSearch["group"]> | "none";
    }) => {
      void navigate({
        to: "/restaurant/pms/front-office",
        search: {
          tab: resolveFoNav(search.tab),
          ...foRackSearchSlice({
            horizon: next.horizon,
            date: next.date,
            group: next.group,
          }),
        },
        replace: true,
      });
    },
    [navigate, search.tab],
  );
  const fetchInHouseQuickView = useServerFn(getFrontOfficeInHouseQuickView);

  function goToFoTab(id: FoNavId) {
    setComingSoon(null);
    setView(id);
    void navigate({
      to: "/restaurant/pms/front-office",
      search: { tab: id, ...foRackSearchSlice(search) },
      replace: true,
    });
  }

  function openStayQuickView(stay: FrontOfficeStay, tab: FoGuestWorkspaceTabId = "overview") {
    setGuestTab(tab);
    setHkTaskRoom(null);
    setHistoryRoomId(null);
    setInHouseQv(null);
    setSheetStay(stay);
  }

  function openHkTask(target: FoHkTaskRoomTarget) {
    setSheetStay(null);
    setHistoryRoomId(null);
    setInHouseQv(null);
    setHkTaskRoom(target);
  }

  function openInHouseFromRack(
    target: FoRackInHouseTarget,
    tab: FoGuestWorkspaceTabId = "overview",
  ) {
    setGuestTab(tab);
    setSheetStay(null);
    setHkTaskRoom(null);
    setHistoryRoomId(null);
    setInHouseQv(target);
  }

  function openFolioWorkspace(stay: FrontOfficeStay) {
    const target = foOpenFolioTarget(stay);
    if (target.surface === "in_house") {
      openInHouseFromRack(
        { reservationId: target.reservationId, reservationRoomId: target.reservationRoomId },
        target.tab,
      );
      return;
    }
    openStayQuickView(stay, target.tab);
  }

  function refreshInHouseRack() {
    void queryClient.invalidateQueries({ queryKey: ["front-office", "inhouse-qv"] });
    void queryClient.invalidateQueries({ queryKey: ["front-office", "inhouse-desk"] });
    void queryClient.invalidateQueries({ queryKey: ["front-office", "occupancy"] });
    void queryClient.invalidateQueries({ queryKey: ["front-office", "rack-reservations"] });
  }

  function onInHouseRackAction(action: InHouseQuickViewAction, qv: FoInHouseQuickView) {
    if (action === "open_guest") {
      void navigate({ to: GUEST_PROFILE_DETAIL_PATH, params: { guestId: qv.stay.guestId } });
      return;
    }
    if (action === "open_folio") {
      setGuestTab("folio");
      return;
    }
    if (action === "open_maintenance") {
      setInHouseQv(null);
      setInHouseMaintenance(qv.stay);
      return;
    }
    setInHouseQv(null);
    if (action === "room_move") setInHouseMove(qv.stay);
    if (action === "amend_stay") setInHouseDates(qv.stay);
    if (action === "late_checkout") setInHouseLate(qv);
    if (action === "check_out") setInHouseCheckOut(qv.stay);
    if (action === "upgrade") setInHouseAmend({ stay: qv.stay, kind: "upgrade" });
    if (action === "guests") setInHouseAmend({ stay: qv.stay, kind: "guests" });
    if (action === "special") setInHouseAmend({ stay: qv.stay, kind: "special" });
    if (action === "add_service") setInHouseAmend({ stay: qv.stay, kind: "service" });
    if (action === "guest_request") setInHouseAmend({ stay: qv.stay, kind: "guest_request" });
  }

  async function openLoadedInHouseAction(action: InHouseQuickViewAction, stay: FrontOfficeStay) {
    if (!stay.reservationRoomId) {
      toast.error(FO_RACK_UNRESOLVED_UNIT_MESSAGE);
      return;
    }
    try {
      const qv = await fetchInHouseQuickView({
        data: {
          restaurantId,
          reservationId: stay.id,
          reservationRoomId: stay.reservationRoomId,
        },
      });
      onInHouseRackAction(action, qv);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open that stay action.";
      toast.error(message === "ROOM_UNIT_NOT_FOUND" ? FO_RACK_UNRESOLVED_UNIT_MESSAGE : message);
    }
  }

  function onRackBarAction(action: FoRackBarActionId, stay: FrontOfficeStay) {
    if (stay.status === "checked_in" && action !== "open_maintenance" && !stay.reservationRoomId) {
      toast.error(FO_RACK_UNRESOLVED_UNIT_MESSAGE);
      return;
    }
    if (action === "view_details") {
      openStayQuickView(stay);
      return;
    }
    if (action === "edit_stay") {
      if (stay.status === "checked_in") {
        openInHouseFromRack(
          { reservationId: stay.id, reservationRoomId: stay.reservationRoomId ?? null },
          "edit_details",
        );
        return;
      }
      openStayQuickView(stay, "edit_details");
      return;
    }
    if (action === "open_folio") {
      openFolioWorkspace(stay);
      return;
    }
    if (action === "cancel") {
      setSearchCancelStay(stay);
      return;
    }
    if (action === "check_in") {
      onContinueCheckInFromWorkspace(stay);
      return;
    }
    if (action === "assign_room" || action === "change_room") {
      onSheetAction("assign", stay);
      return;
    }
    if (action === "no_show") {
      onSheetAction("no_show", stay);
      return;
    }
    if (action === "check_out") {
      void openLoadedInHouseAction("check_out", stay);
      return;
    }
    if (action === "move_room") {
      void openLoadedInHouseAction("room_move", stay);
      return;
    }
    if (action === "extend_stay" || action === "early_departure") {
      void openLoadedInHouseAction("amend_stay", stay);
      return;
    }
    if (action === "add_service") {
      void openLoadedInHouseAction("add_service", stay);
      return;
    }
    if (action === "guest_request") {
      void openLoadedInHouseAction("guest_request", stay);
      return;
    }
    if (action === "late_checkout") {
      void openLoadedInHouseAction("late_checkout", stay);
      return;
    }
    if (action === "open_maintenance") {
      setInHouseMaintenance(stay);
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

  const canOpenCashiering = permissions.can(PMS_PERMISSIONS.CASHIERING_VIEW);
  const deskReady = permissions.can(PMS_PERMISSIONS.FRONT_OFFICE_VIEW);

  const exceptionDesk = useFoExceptionDesk(restaurantId, today, deskReady);
  // Reuses the existing exception desk feed (no new fetch, no new business rule) to narrow
  // Rack/Table rows when the burger's "Exceptions" filter is selected.
  const exceptionStayIds = useMemo(
    () => new Set(exceptionDesk.items.map((item) => item.reservationId).filter((id): id is string => Boolean(id))),
    [exceptionDesk.items],
  );
  const exceptionRoomIds = useMemo(
    () => new Set(exceptionDesk.items.map((item) => item.roomId).filter((id): id is string => Boolean(id))),
    [exceptionDesk.items],
  );
  const fetchAmendmentHistory = useServerFn(listFoStayAmendmentHistory);
  const amendmentHistoryQuery = useQuery({
    queryKey: ["front-office", "amended-stay-history", restaurantId],
    queryFn: () => fetchAmendmentHistory({ data: { restaurantId } }),
    enabled: deskReady,
    retry: false,
  });
  const amendmentHistory = amendmentHistoryQuery.data ?? [];
  const amendmentStayIds = useMemo(
    () => new Set(amendmentHistory.map((row) => row.reservationId)),
    [amendmentHistory],
  );

  const fetchArrivals = useServerFn(listArrivals);
  const fetchInHouse = useServerFn(listInHouse);
  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, today, "confirmed", "all"],
    queryFn: () => fetchArrivals({ data: { restaurantId, date: today, status: "confirmed" } }),
    enabled: deskReady && picker === "check_in",
    retry: false,
  });
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, ""],
    queryFn: () => fetchInHouse({ data: { restaurantId, today } }),
    enabled:
      deskReady &&
      (picker === "room_move" ||
        picker === "extend_stay" ||
        picker === "check_out" ||
        picker === "guest_request"),
    retry: false,
  });

  function openDialog(kind: LiveDialog, stay: FrontOfficeStay) {
    setDialogStay(stay);
    setDialog(kind);
  }

  function openWalkInCreate() {
    setReservationOverlay({ type: "new-reservation", mode: "walk-in" });
  }

  function closeReservationOverlay() {
    setReservationOverlay(null);
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
      openWalkInCreate();
      return;
    }
    if (actionId === "guest_search") {
      setSearchTerm("");
      setSearchOpen(true);
      return;
    }
    if (
      actionId === "check_in" ||
      actionId === "room_move" ||
      actionId === "extend_stay" ||
      actionId === "check_out"
    ) {
      setPicker(actionId);
    }
    if (actionId === "guest_request") {
      setPicker("guest_request");
    }
  }

  function onExceptionAction(
    action: FoControlAction,
    stay: FrontOfficeStay | null,
    row: FrontOfficeExceptionItem,
  ) {
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
      if (stay && canOpenCashiering) {
        openFolioWorkspace(stay);
        return;
      }
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
      if (row.roomId) {
        openHkTask({
          roomId: row.roomId,
          roomNumber: row.roomNumber ?? "",
          occupancy: null,
          housekeepingStatus: null,
          guestName: row.guestName ?? null,
        });
      }
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
      void navigate({
        to: "/restaurant/pms/reservations/$reservationId",
        params: { reservationId: stay.id },
      });
      return;
    }
    if (action === "view_folio") {
      if (canOpenCashiering) {
        openFolioWorkspace(stay);
        return;
      }
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
      setSheetStay(null);
      setNotesStay(stay);
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
      setCheckInStep(foCheckInWorkspaceInitialStep(stay));
    }
    if (kind) openDialog(kind, stay);
  }

  function onContinueCheckInFromWorkspace(stay: FrontOfficeStay) {
    setSheetStay(null);
    setCheckInStep(foCheckInWorkspaceInitialStep(stay));
    openDialog("checkin", stay);
  }

  if (permissions.isLoading) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }
  if (permissions.isError || !deskReady) {
    return null;
  }

  return (
    <FrontOfficeChrome
      membership={membership}
      active={view}
      returnTo={search.returnTo}
      returnToLabel={search.returnToLabel}
      onNavigate={goToFoTab}
      onGuestSearch={(term) => {
        setSearchTerm(term ?? "");
        setSearchOpen(true);
      }}
      exceptionBadge={exceptionDesk.failed ? 0 : exceptionDesk.badgeCount}
    >
      {comingSoon ? (
        <ComingSoonPanel
          title="Coming soon"
          description="That Front Office action is not live. No reservation, inventory or money write was sent."
        />
      ) : null}

      {/*
        Front Office is one workspace: Rack and Table only. The burger menu no longer
        navigates to a separate full-page screen per category — `view` now selects an
        in-place filter (`category`) applied to this same Rack/Table dataset. Actions
        those pages used to expose stay reachable through the existing `⋮` menu
        (onRackBarAction) and existing dialogs/sheets below, unchanged.
      */}
      <div className="space-y-3">
        <RoomRackCalendar
          restaurantId={restaurantId}
          restaurantName={membership.restaurant.name}
          today={today}
          viewport={phone ? "phone" : "wide"}
          rackFocus={rackFocus}
          initialHorizon={search.horizon}
          initialFocusDate={search.date}
          initialGroup={search.group ?? "none"}
          category={view}
          exceptionStayIds={exceptionStayIds}
          exceptionRoomIds={exceptionRoomIds}
          amendmentStayIds={amendmentStayIds}
          amendmentHistory={amendmentHistory}
          onSelectStay={openStayQuickView}
          onSelectInHouse={openInHouseFromRack}
          onSelectRoom={openHkTask}
          onRackAction={onRackBarAction}
          canOpenCashiering={canOpenCashiering}
          staffRole={membership.role}
          onRackSearchChange={onRackSearchChange}
          onWalkIn={
            permissions.can(PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN)
              ? () => openWalkInCreate()
              : undefined
          }
        />
      </div>

      {sheetStay && foOpensFullGuestWorkspace(sheetStay, guestTab) ? (
        <FoCheckInWorkspaceSheet
          restaurantId={restaurantId}
          stay={sheetStay}
          open
          canOpenCashiering={canOpenCashiering}
          initialTab={guestTab}
          hasOpenDiscrepancy={Boolean(
            sheetStay.roomId && exceptionDesk.openDiscrepancyRoomIds.has(sheetStay.roomId),
          )}
          onOpenChange={(open) => !open && setSheetStay(null)}
          onAction={onSheetAction}
          onContinueCheckIn={onContinueCheckInFromWorkspace}
        />
      ) : sheetStay ? (
        <ReservationSideSheet
          restaurantId={restaurantId}
          stay={sheetStay}
          open
          hasOpenDiscrepancy={Boolean(
            sheetStay.roomId && exceptionDesk.openDiscrepancyRoomIds.has(sheetStay.roomId),
          )}
          onOpenChange={(open) => !open && setSheetStay(null)}
          onAction={onSheetAction}
        />
      ) : null}
      <FoHousekeepingTaskModal
        restaurantId={restaurantId}
        today={today}
        target={hkTaskRoom}
        open={Boolean(hkTaskRoom)}
        onOpenChange={(open) => {
          if (!open) setHkTaskRoom(null);
        }}
      />
      <InHouseQuickViewSheet
        restaurantId={restaurantId}
        reservationId={inHouseQv?.reservationId ?? null}
        reservationRoomId={inHouseQv?.reservationRoomId ?? null}
        amendmentHistory={
          inHouseQv
            ? stayAmendmentsForReservation(amendmentHistory, inHouseQv.reservationId)
            : []
        }
        initialTab={guestTab}
        open={
          Boolean(inHouseQv) &&
          !inHouseMove &&
          !inHouseDates &&
          !inHouseCheckOut &&
          !inHouseLate &&
          !inHouseAmend &&
          !inHouseMaintenance
        }
        onOpenChange={(open) => {
          if (!open) setInHouseQv(null);
        }}
        onAction={onInHouseRackAction}
      />
      {historyRoomId ? (
        <RoomOperationsHistorySheet
          restaurantId={restaurantId}
          roomId={historyRoomId}
          open
          onOpenChange={(open) => !open && setHistoryRoomId(null)}
        />
      ) : null}

      <ReservationWorkspaceOverlay
        open={reservationOverlay !== null}
        title={reservationOverlay?.type === "new-reservation" ? "New Reservation" : "Reservation"}
        description={
          reservationOverlay?.type === "new-reservation"
            ? "Create a walk-in reservation. Arrival starts on the property business date."
            : "Review the reservation created from Front Office."
        }
        hideVisualHeader={
          reservationOverlay?.type === "new-reservation" ||
          reservationOverlay?.type === "reservation-detail"
        }
        size={reservationOverlay?.type === "reservation-detail" ? "workspace" : "wide"}
        onOpenChange={(open) => {
          if (!open) closeReservationOverlay();
        }}
      >
        {reservationOverlay?.type === "new-reservation" ? (
          <CreateReservationPage
            membership={membership}
            embedded
            mode="walk-in"
            businessDate={today}
            returnToLabel="Return to Front Office"
            onCancel={closeReservationOverlay}
            onCreated={() => {
              void queryClient.invalidateQueries({ queryKey: ["front-office"] });
            }}
            onContinueToCheckIn={(created) => {
              closeReservationOverlay();
              setCheckInStep("stay");
              openDialog("checkin", walkInContinueStay(created, today));
            }}
            onOpenCreatedReservation={(reservationId) => {
              setReservationOverlay({ type: "reservation-detail", reservationId });
            }}
            onReturnToDesk={closeReservationOverlay}
          />
        ) : null}
        {reservationOverlay?.type === "reservation-detail" ? (
          <ReservationDetailWorkspace
            membership={membership}
            reservationId={reservationOverlay.reservationId}
            embedded
            onBackToList={closeReservationOverlay}
            onCopiedReservation={(reservationId) => {
              setReservationOverlay({ type: "reservation-detail", reservationId });
            }}
          />
        ) : null}
      </ReservationWorkspaceOverlay>
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
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          open
          onOpenChange={(v) => !v && setDialog(null)}
        />
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
        <RoomMoveDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          open
          onOpenChange={(v) => !v && setDialog(null)}
        />
      ) : null}
      {dialogStay && dialog === "stay" ? (
        <StayDatesDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          open
          onOpenChange={(v) => !v && setDialog(null)}
        />
      ) : null}
      {dialogStay && dialog === "checkout" ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={dialogStay}
          open
          onOpenChange={(v) => !v && setDialog(null)}
        />
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
      {notesStay ? (
        <AmendNotesDialog
          restaurantId={restaurantId}
          stay={notesStay}
          open
          onOpenChange={(v) => !v && setNotesStay(null)}
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
      {inHouseMove ? (
        <RoomMoveDialog
          restaurantId={restaurantId}
          stay={inHouseMove}
          initialReservationRoomId={inHouseMove.reservationRoomId ?? undefined}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInHouseMove(null);
              refreshInHouseRack();
            }
          }}
        />
      ) : null}
      {inHouseDates ? (
        <StayDatesDialog
          restaurantId={restaurantId}
          stay={inHouseDates}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInHouseDates(null);
              refreshInHouseRack();
            }
          }}
        />
      ) : null}
      {inHouseCheckOut ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={inHouseCheckOut}
          initialReservationRoomId={inHouseCheckOut.reservationRoomId ?? undefined}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInHouseCheckOut(null);
              refreshInHouseRack();
            }
          }}
        />
      ) : null}
      <LateCheckoutDialog
        restaurantId={restaurantId}
        timezone={timezone}
        row={inHouseLate ? lateRowFromInHouse(inHouseLate) : null}
        open={Boolean(inHouseLate)}
        onOpenChange={(open) => {
          if (!open) setInHouseLate(null);
        }}
        onSaved={() => {
          setInHouseLate(null);
          refreshInHouseRack();
        }}
      />
      {inHouseAmend ? (
        <FoAmendKindSheet
          kind={inHouseAmend.kind}
          restaurantId={restaurantId}
          stay={inHouseAmend.stay}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInHouseAmend(null);
              refreshInHouseRack();
            }
          }}
        />
      ) : null}
      {inHouseMaintenance ? (
        <FoMaintenanceActionModal
          restaurantId={restaurantId}
          stay={inHouseMaintenance}
          open
          onOpenChange={(open) => {
            if (!open) {
              setInHouseMaintenance(null);
              refreshInHouseRack();
            }
          }}
        />
      ) : null}
    </FrontOfficeChrome>
  );
}
