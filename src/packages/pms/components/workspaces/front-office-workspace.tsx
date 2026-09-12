import { useEffect, useState, type ReactNode } from "react";
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
  ExceptionsFrame,
  GuestSearchDialog,
  NoShowsFrame,
  StayPickerDialog,
  WalkInsFrame,
} from "@/packages/pms/components/frontoffice/front-office-frames";
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
import { ArrivalsWorkspace } from "@/packages/pms/components/workspaces/arrivals-workspace";
import { DeparturesList, InHouseList } from "@/packages/pms/components/frontoffice/stay-lists";
import { LIST_COMING_SOON_COLUMNS, invokeFoAction, resolveFoNav, type FoNavId } from "@/packages/pms/lib/front-office-shell";
import { ComingSoonChip } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { listArrivals, listInHouse, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getBookingsAccess } from "@/packages/pms/lib/reservations.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import { useAuth } from "@/core/state/auth-store";
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
  initialTab,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<FoNavId>(() => resolveFoNav(initialTab));
  const [phone, setPhone] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [checkInStep, setCheckInStep] = useState<"stay" | "registration">("stay");
  const [searchOpen, setSearchOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [sheetStay, setSheetStay] = useState<FrontOfficeStay | null>(null);
  const [dialogStay, setDialogStay] = useState<FrontOfficeStay | null>(null);
  const [dialog, setDialog] = useState<LiveDialog | null>(null);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [amendKind, setAmendKind] = useState<FoAmendKind | null>(null);
  const [amendStay, setAmendStay] = useState<FrontOfficeStay | null>(null);

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
      setAmendStay(stay);
      setAmendKind(amend);
      return;
    }
    const kind = map[action as keyof typeof map];
    if (kind === "checkin") {
      setCheckInStep("stay");
      setSheetStay(null);
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
      propertyName={membership.restaurant.name}
      userLabel={user?.email ?? membership.restaurant.name}
      roleLabel={membership.role}
      businessDate={today}
      active={view}
      onNavigate={(id) => {
        setComingSoon(null);
        setView(id);
      }}
      onQuickAction={onQuickAction}
      onGuestSearch={() => setSearchOpen(true)}
    >
      {comingSoon ? (
        <ComingSoonPanel
          title="Coming soon"
          description="That Front Office action is not live. No reservation, inventory or money write was sent."
        />
      ) : null}

      {view === "rack" ? (
        <RoomRackCalendar
          restaurantId={restaurantId}
          today={today}
          viewport={phone ? "phone" : "wide"}
          onSelectStay={(stay) => setSheetStay(stay)}
        />
      ) : null}
      {view === "arrivals" ? (
        <ListFrame title="Arrivals">
          <ArrivalsWorkspace membership={membership} variant="arrivals" embedded />
        </ListFrame>
      ) : null}
      {view === "inhouse" ? (
        <ListFrame title="In-House Guests">
          <InHouseList restaurantId={restaurantId} propertyName={membership.restaurant.name} />
        </ListFrame>
      ) : null}
      {view === "departures" ? (
        <ListFrame title="Departures">
          <DeparturesList restaurantId={restaurantId} />
        </ListFrame>
      ) : null}
      {view === "walkins" ? <WalkInsFrame restaurantId={restaurantId} today={today} /> : null}
      {view === "amendments" ? <AmendmentsFrame restaurantId={restaurantId} today={today} /> : null}
      {view === "cancellations" ? <CancellationsFrame restaurantId={restaurantId} /> : null}
      {view === "noshows" ? <NoShowsFrame restaurantId={restaurantId} today={today} /> : null}
      {view === "exceptions" ? <ExceptionsFrame restaurantId={restaurantId} today={today} /> : null}

      <ReservationSideSheet
        restaurantId={restaurantId}
        stay={sheetStay}
        open={!!sheetStay}
        onOpenChange={(open) => !open && setSheetStay(null)}
        onAction={onSheetAction}
      />

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
      <GuestSearchDialog restaurantId={restaurantId} open={searchOpen} onOpenChange={setSearchOpen} />

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
