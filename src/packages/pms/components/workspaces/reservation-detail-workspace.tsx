import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Printer, Send } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import {
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  RoomMoveDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { stayFromReservation } from "@/packages/pms/lib/front-office-shell";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  ReservationDetailKpiStrip,
  ReservationDetailOverviewDashboard,
} from "@/packages/pms/components/workspaces/reservation-detail-overview";
import { ReservationDetailStayTab } from "@/packages/pms/components/workspaces/reservation-detail-stay";
import { ReservationDetailGuestTab } from "@/packages/pms/components/workspaces/reservation-detail-guest";
import { ReservationDetailRatesTab } from "@/packages/pms/components/workspaces/reservation-detail-rates";
import { ReservationDetailRoomsTab } from "@/packages/pms/components/workspaces/reservation-detail-rooms";
import { ReservationDetailPackagesTab } from "@/packages/pms/components/workspaces/reservation-detail-packages";
import { ReservationDetailFolioTab } from "@/packages/pms/components/workspaces/reservation-detail-folio";
import { ReservationDetailRequestsTab } from "@/packages/pms/components/workspaces/reservation-detail-requests";
import { ReservationDetailNotesTab } from "@/packages/pms/components/workspaces/reservation-detail-notes";
import {
  arriveInLabel,
  COMMUNICATION_DEFERRED_COPY,
  DETAIL_DASH,
  DETAIL_SIDEBAR_ITEMS,
  depositStatusLabel,
  LINKED_DEFERRED_COPY,
  parseDepositRequirementSnapshot,
  stayStatusLabel,
  type DetailWorkspaceTab,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  amendReservation,
  assignReservationRoom,
  copyReservation,
  getBookingsAccess,
  getReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
  setReservationStatus,
  type ReservationDetail,
  type ReservationHistoryEntry,
} from "@/packages/pms/lib/reservations.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { reservationAmendImpact } from "@/packages/pms/lib/reservation-amend-impact";
import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { listGuests } from "@/packages/pms/lib/guests.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import {
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
} from "@/packages/pms/lib/create-reservation-phase1";
import { FALLBACK_CASHIERING_TENDERS } from "@/packages/pms/lib/pms-polish1-payment-admin";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { listRatePlans, repriceReservation } from "@/packages/pms/lib/rates.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { ReservationGuestMastersCard } from "@/packages/pms/components/guests/reservation-guest-masters";
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { PmsDocumentHeader } from "@/packages/pms/components/settings/pms-document-header";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";

import { cn } from "@/shared/lib/utils";

const UNASSIGNED = "unassigned";

type FrontOfficeAction = "check_in" | "check_out" | "no_show" | "change_room";

const DETAIL_TABS: Array<{ id: DetailWorkspaceTab; label: string; deferred?: boolean }> = [
  { id: "overview", label: "Overview" },
  ...DETAIL_SIDEBAR_ITEMS.filter((item) => item.id !== "overview"),
];

export function ReservationDetailWorkspace({
  membership,
  reservationId,
  embedded = false,
  onCopiedReservation,
  onBackToList,
}: {
  membership: RestaurantMembership;
  reservationId: string;
  embedded?: boolean;
  onCopiedReservation?: (reservationId: string) => void;
  onBackToList?: () => void;
}) {
  const restaurantId = membership.restaurant.id;
  const set1 = usePmsSet1Foundation(restaurantId);
  const queryClient = useQueryClient();
  const { dateTime, timezone } = useRestaurantTime();
  const money = useMoney();
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchGuest = useServerFn(getGuest);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitAmend = useServerFn(amendReservation);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitStatus = useServerFn(setReservationStatus);
  const submitCopy = useServerFn(copyReservation);

  const [amendOpen, setAmendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [foAction, setFoAction] = useState<FrontOfficeAction | null>(null);
  const [detailTab, setDetailTab] = useState<DetailWorkspaceTab>("overview");

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    enabled: canManage,
    retry: false,
  });

  const reservation = detailQuery.data?.reservation;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, reservation?.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: reservation!.guestId } }),
    enabled: canManage && Boolean(reservation?.guestId),
    retry: false,
  });

  const roomsQuery = useQuery({
    queryKey: [
      "assignable-rooms",
      restaurantId,
      reservation?.roomTypeId,
      reservation?.arrivalDate,
      reservation?.departureDate,
      reservationId,
    ],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: reservation!.roomTypeId,
          arrival: reservation!.arrivalDate,
          departure: reservation!.departureDate,
          excludeReservationId: reservationId,
        },
      }),
    enabled: canManage && !!reservation && reservation.status !== "cancelled",
  });

  const availabilityQuery = useQuery({
    queryKey: [
      "reservation-detail-availability",
      restaurantId,
      reservation?.arrivalDate,
      reservation?.departureDate,
    ],
    queryFn: () =>
      fetchAvailability({
        data: {
          restaurantId,
          arrival: reservation!.arrivalDate,
          departure: reservation!.departureDate,
        },
      }),
    enabled: canManage && Boolean(reservation),
    retry: false,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId, reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["reservations", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["assignable-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["bookings-dashboard", restaurantId] });
  }

  const statusMutation = useMutation({
    mutationFn: (vars: { status: "pending" | "confirmed" }) =>
      submitStatus({
        data: {
          restaurantId,
          reservationId,
          status: vars.status,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: (roomId: string | null) =>
      submitAssign({ data: { restaurantId, reservationId, roomId } }),
    onSuccess: () => {
      toast.success("Room assignment updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyMutation = useMutation({
    mutationFn: () => submitCopy({ data: { restaurantId, reservationId } }),
    onSuccess: (result) => {
      toast.success(`Copied as ${result.confirmationNumber}.`);
      invalidate();
      onCopiedReservation?.(result.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading reservation…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Reservation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access reservations for this property.
        </p>
      </div>
    );
  }
  if (detailQuery.isLoading)
    return <p className="text-sm text-muted-foreground">Loading reservation…</p>;
  if (detailQuery.isError || !reservation) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Reservation not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This reservation doesn't exist for {membership.restaurant.name}.
        </p>
        {embedded ? null : (
          <Button asChild className="mt-4" variant="outline">
            <Link to="/restaurant/pms/reservations">Back to reservations</Link>
          </Button>
        )}
      </div>
    );
  }

  const history = detailQuery.data?.history ?? [];
  const rooms = roomsQuery.data ?? [];
  const cancelled = reservation.status === "cancelled";
  const createdBy =
    reservation.createdByName ??
    history.find((entry) => entry.eventType === "created")?.actorName ??
    null;
  const foStay: FrontOfficeStay = {
    ...stayFromReservation(reservation, businessDate),
    guestEmail: reservation.guestEmail,
    guaranteeMethod: reservation.guaranteeMethod,
  };
  const showCheckIn = reservation.status === "confirmed";
  const showCheckOut = reservation.status === "checked_in";
  const showChangeRoom = reservation.status === "checked_in" && Boolean(reservation.roomId);
  const showNoShow = reservation.status === "confirmed" && reservation.arrivalDate <= businessDate;

  const lifecycleButtons = !cancelled ? (
    <>
      {reservation.status === "pending" ? (
        <Button
          disabled={statusMutation.isPending}
          onClick={() => statusMutation.mutate({ status: "confirmed" })}
        >
          Confirm
        </Button>
      ) : null}
      {showCheckIn ? (
        <Button variant="outline" onClick={() => setFoAction("check_in")}>
          Check In
        </Button>
      ) : null}
      {showCheckOut ? (
        <Button variant="outline" onClick={() => setFoAction("check_out")}>
          Check Out
        </Button>
      ) : null}
      {showChangeRoom ? (
        <Button variant="outline" onClick={() => setFoAction("change_room")}>
          Change Room
        </Button>
      ) : null}
      {showNoShow ? (
        <Button variant="outline" onClick={() => setFoAction("no_show")}>
          Mark No-Show
        </Button>
      ) : null}
      <Button variant="outline" onClick={() => setAmendOpen(true)}>
        Amend stay
      </Button>
      <Button
        variant="outline"
        disabled={copyMutation.isPending}
        onClick={() => copyMutation.mutate()}
      >
        Copy stay
      </Button>
      <Button
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/5"
        onClick={() => setCancelOpen(true)}
      >
        Cancel reservation
      </Button>
    </>
  ) : (
    <Button
      disabled={statusMutation.isPending}
      onClick={() => statusMutation.mutate({ status: "pending" })}
    >
      Restore reservation
    </Button>
  );

  const childDialogs = (
    <>
      <AmendDialog
        open={amendOpen}
        onOpenChange={setAmendOpen}
        reservation={reservation}
        restaurantId={restaurantId}
        onSaved={invalidate}
        amend={submitAmend}
        fetchAvailability={fetchAvailability}
        fetchRooms={fetchRooms}
      />
      <FoCancelStepper
        restaurantId={restaurantId}
        stay={foStay}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
      {foAction === "check_in" ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          onOpenChange={(open) => {
            if (!open) setFoAction(null);
          }}
        />
      ) : null}
      {foAction === "check_out" ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          onOpenChange={(open) => {
            if (!open) setFoAction(null);
          }}
        />
      ) : null}
      {foAction === "no_show" ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={foStay}
          today={businessDate}
          open
          onOpenChange={(open) => {
            if (!open) setFoAction(null);
          }}
        />
      ) : null}
      {foAction === "change_room" ? (
        <RoomMoveDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          onOpenChange={(open) => {
            if (!open) setFoAction(null);
          }}
        />
      ) : null}
    </>
  );

  if (embedded) {
    const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
    const roomType = (availabilityQuery.data ?? []).find(
      (row) => row.roomTypeId === reservation.roomTypeId,
    );
    const assigned = Boolean(reservation.roomId && reservation.roomNumber);
    const stayPanel = (
      <ReservationDetailStayTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToOverview={() => setDetailTab("overview")}
        onSaved={invalidate}
      />
    );
    const guestPanel = (
      <ReservationDetailGuestTab
        restaurantId={restaurantId}
        reservation={reservation}
        guest={guestQuery.data?.guest ?? null}
        preferences={guestQuery.data?.preferences ?? null}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToOverview={() => setDetailTab("overview")}
        onSaved={invalidate}
      />
    );
    const ratesPanel = (
      <ReservationDetailRatesTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        occupancyLabel={
          roomType ? `${roomType.adultCapacity} adults · ${roomType.childCapacity} children` : null
        }
        onBackToRooms={() => setDetailTab("rooms")}
        onSaved={invalidate}
      />
    );
    const roomsPanel = (
      <ReservationDetailRoomsTab
        restaurantId={restaurantId}
        reservation={reservation}
        assignableRooms={rooms}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        occupancyLabel={
          roomType ? `${roomType.adultCapacity} adults · ${roomType.childCapacity} children` : null
        }
        onBackToGuest={() => setDetailTab("guest")}
        onChangeRoomType={() => setAmendOpen(true)}
        onSaved={invalidate}
      />
    );
    const packagesPanel = (
      <ReservationDetailPackagesTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToRates={() => setDetailTab("rates")}
      />
    );
    const folioPanel = (
      <ReservationDetailFolioTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToPackages={() => setDetailTab("packages")}
      />
    );
    const requestsPanel = (
      <ReservationDetailRequestsTab
        restaurantId={restaurantId}
        reservation={reservation}
        guest={guestQuery.data?.guest ?? null}
        preferences={guestQuery.data?.preferences ?? null}
        history={history}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToFolio={() => setDetailTab("folio")}
        onSaved={invalidate}
      />
    );
    const notesPanel = (
      <ReservationDetailNotesTab
        restaurantId={restaurantId}
        reservation={reservation}
        guest={guestQuery.data?.guest ?? null}
        guestHistory={guestQuery.data?.history ?? []}
        history={history}
        canManage={canManage && !cancelled}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        onBackToRequests={() => setDetailTab("requests")}
        onSaved={invalidate}
      />
    );
    const deferredPanel = (title: string, copy: string) => (
      <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg">{title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{copy}</p>
      </section>
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-workspace">
        <header className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-3 pr-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reservation Detail
          </p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex flex-wrap items-center gap-3 font-display text-2xl text-[#251605]">
                {reservation.confirmationNumber}
                <span className="text-lg font-normal">{reservation.guestName}</span>
                <ReservationStatusBadge status={reservation.status} />
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {dateTime(reservation.createdAt)}
                {createdBy ? ` · ${createdBy}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-3.5" />
                Print
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                title="Send is not available in this workspace yet."
              >
                <Send className="size-3.5" />
                Send
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    More Actions
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[80]">
                  {!cancelled && reservation.status === "pending" ? (
                    <DropdownMenuItem
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ status: "confirmed" })}
                    >
                      Confirm
                    </DropdownMenuItem>
                  ) : null}
                  {showCheckIn ? (
                    <DropdownMenuItem onClick={() => setFoAction("check_in")}>
                      Check In
                    </DropdownMenuItem>
                  ) : null}
                  {showCheckOut ? (
                    <DropdownMenuItem onClick={() => setFoAction("check_out")}>
                      Check Out
                    </DropdownMenuItem>
                  ) : null}
                  {showChangeRoom ? (
                    <DropdownMenuItem onClick={() => setFoAction("change_room")}>
                      Change Room
                    </DropdownMenuItem>
                  ) : null}
                  {showNoShow ? (
                    <DropdownMenuItem onClick={() => setFoAction("no_show")}>
                      Mark No-Show
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={copyMutation.isPending}
                    onClick={() => copyMutation.mutate()}
                  >
                    Copy stay
                  </DropdownMenuItem>
                  {!cancelled ? (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setCancelOpen(true)}
                    >
                      Cancel reservation
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ status: "pending" })}
                    >
                      Restore reservation
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="sm" onClick={() => onBackToList?.()}>
                <ArrowLeft className="size-3.5" />
                Back to List
              </Button>
            </div>
          </div>
        </header>
        <ReservationDetailKpiStrip
          items={[
            {
              label: "Arrive in",
              value: arriveInLabel(reservation.arrivalDate, businessDate),
            },
            {
              label: "Stay Status",
              value: stayStatusLabel({
                status: reservation.status,
                arrivalDate: reservation.arrivalDate,
                departureDate: reservation.departureDate,
                businessDate,
              }),
            },
            { label: "Nights", value: String(reservation.nights) },
            {
              label: "Room",
              value: assigned ? `Room ${reservation.roomNumber}` : "Not Assigned",
              hint: assigned ? reservation.roomTypeName : "Not Assigned",
            },
            {
              label: "Total Amount",
              value:
                reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal),
            },
            {
              label: "Deposit",
              value: deposit?.amount == null ? DETAIL_DASH : money(deposit.amount),
              hint: depositStatusLabel(deposit),
            },
          ]}
        />
        <div className="flex min-h-0 flex-1">
          <nav
            className="hidden w-52 shrink-0 overflow-y-auto border-r border-[#DDD4C5] bg-white py-2 md:block"
            aria-label="Reservation detail"
            data-testid="reservation-detail-sidebar"
          >
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={detailTab === tab.id}
                onClick={() => setDetailTab(tab.id)}
                className={cn(
                  "flex w-full items-center px-4 py-2 text-left text-sm",
                  detailTab === tab.id
                    ? "bg-[#F4E9D0] font-medium text-[#251605]"
                    : "text-muted-foreground hover:bg-[#F7F4EE]",
                  tab.deferred && detailTab !== tab.id ? "text-muted-foreground/70" : null,
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-[#DDD4C5] bg-white px-3 py-2 md:hidden">
              <div className="flex min-w-max gap-1 overflow-x-auto" role="tablist">
                {DETAIL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={cn(
                      "whitespace-nowrap rounded-full px-3 py-1 text-xs",
                      detailTab === tab.id
                        ? "bg-[#F4E9D0] font-medium text-[#251605]"
                        : "text-muted-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              {detailTab === "overview" ? (
                <ReservationDetailOverviewDashboard
                  reservation={reservation}
                  guest={guestQuery.data?.guest ?? null}
                  createdBy={createdBy}
                  coverUrl={roomType?.coverUrl ?? null}
                  roomMeta={{
                    occupancy: roomType
                      ? `${roomType.adultCapacity} adults · ${roomType.childCapacity} children`
                      : null,
                    beds: null,
                  }}
                  money={(value) => money(value)}
                  onEditTab={setDetailTab}
                />
              ) : null}
              {detailTab === "stay" ? stayPanel : null}
              {detailTab === "rooms" ? roomsPanel : null}
              {detailTab === "guest" ? guestPanel : null}
              {detailTab === "rates" ? ratesPanel : null}
              {detailTab === "packages" ? packagesPanel : null}
              {detailTab === "folio" ? folioPanel : null}
              {detailTab === "requests" ? requestsPanel : null}
              {detailTab === "notes" ? notesPanel : null}
              {detailTab === "communication"
                ? deferredPanel("Communication", COMMUNICATION_DEFERRED_COPY)
                : null}
              {detailTab === "linked"
                ? deferredPanel("Linked Reservations", LINKED_DEFERRED_COPY)
                : null}
              {detailTab === "history" ? (
                <HistoryList history={history} dateTime={dateTime} />
              ) : null}
            </div>
          </div>
        </div>
        {childDialogs}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && set1.data ? <PmsDocumentHeader identity={set1.data.snapshot.identity} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded ? null : (
            <Link
              to="/restaurant/pms/reservations"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" /> All reservations
            </Link>
          )}
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-2xl">
            {reservation.confirmationNumber}
            <ReservationStatusBadge status={reservation.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {reservation.guestName}
            {reservation.guestVip ? " · VIP" : ""} · {formatStayDate(reservation.arrivalDate)} →{" "}
            {formatStayDate(reservation.departureDate)} · {reservation.nights} night
            {reservation.nights === 1 ? "" : "s"}
            {reservation.roomNumber ? ` · Room ${reservation.roomNumber}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{lifecycleButtons}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <h2 className="font-display text-lg">Stay</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Room type" value={reservation.roomTypeName} />
            <Field label="Room" value={reservation.roomNumber ?? "Unassigned"} />
            <Field label="Arrival" value={formatStayDate(reservation.arrivalDate)} />
            <Field label="Departure" value={formatStayDate(reservation.departureDate)} />
            <Field
              label="Occupancy"
              value={`${reservation.adults} adult${reservation.adults === 1 ? "" : "s"}${
                reservation.children > 0 ? `, ${reservation.children} children` : ""
              }`}
            />
            <Field
              label="Source"
              value={reservation.source === "staff" ? "Staff" : reservation.source}
            />
            <Field
              label="Booking source"
              value={displayValue(reservation.commercialBookingSource)}
            />
            <Field label="Market segment" value={displayValue(reservation.marketSegment)} />
            <Field label="Guarantee" value={displayValue(reservation.guaranteeMethod)} />
            <Field label="Company" value={displayValue(reservation.companyName)} />
            <Field label="Travel Agent" value={displayValue(reservation.travelAgentName)} />
            <Field label="Group" value={displayValue(reservation.groupName)} />
            <Field label="Special requests" value={reservation.specialRequests ?? "—"} />
            <Field label="Internal notes" value={reservation.notes ?? "—"} />
            {reservation.cancellationReason ? (
              <Field label="Cancellation reason" value={reservation.cancellationReason} />
            ) : null}
          </dl>

          {!cancelled ? (
            <div className="mt-4 max-w-sm space-y-1">
              <Label>Room assignment</Label>
              <Select
                value={reservation.roomId ?? UNASSIGNED}
                onValueChange={(v) => assignMutation.mutate(v === UNASSIGNED ? null : v)}
                disabled={assignMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign later" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
                  {reservation.roomId && reservation.roomNumber ? (
                    <SelectItem value={reservation.roomId}>
                      Room {reservation.roomNumber}
                    </SelectItem>
                  ) : null}
                  {rooms
                    .filter((r) => r.id !== reservation.roomId)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.roomNumber}
                        {r.floor ? ` · Floor ${r.floor}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Guest</h2>
          {guestQuery.data ? (
            <div className="mt-3">
              <GuestRestrictionWarn guest={guestQuery.data.guest} />
            </div>
          ) : null}
          <dl className="mt-3 space-y-3">
            <Field label="Name" value={reservation.guestName} />
            <Field label="Phone" value={reservation.guestPhone ?? "—"} />
            <Field label="Email" value={reservation.guestEmail ?? "—"} />
          </dl>
          {embedded ? null : (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: reservation.guestId }}>
                Open guest profile
              </Link>
            </Button>
          )}
        </section>
      </div>

      <ReservationGuestMastersCard restaurantId={restaurantId} reservationId={reservationId} />

      <NotesEditor
        reservation={reservation}
        restaurantId={restaurantId}
        canManage={canManage && !cancelled}
        amend={submitAmend}
        onSaved={invalidate}
      />

      <PricingSection
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        onRepriced={invalidate}
      />

      <HistoryList history={history} dateTime={dateTime} />

      {childDialogs}
    </div>
  );
}

function displayValue(value: string | null | undefined, fallback = "—"): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function HistoryList({
  history,
  dateTime,
}: {
  history: ReservationHistoryEntry[];
  dateTime: (iso: string | null | undefined) => string;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg">History</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {history.map((entry) => {
            const changes = reservationHistoryChanges(entry.previousValues, entry.newValues);
            return (
              <li key={entry.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize">
                    {entry.eventType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">{dateTime(entry.createdAt)}</span>
                  {entry.actorName ? (
                    <span className="text-xs text-muted-foreground">· {entry.actorName}</span>
                  ) : null}
                </div>
                {entry.notes ? (
                  <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>
                ) : null}
                {changes.length > 0 ? (
                  <dl className="mt-2 space-y-1">
                    {changes.map((change) => (
                      <div key={change.key} className="text-xs">
                        <dt className="font-medium capitalize text-muted-foreground">
                          {change.key.replace(/_/g, " ")}
                        </dt>
                        <dd>
                          {change.from} → {change.to}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NotesEditor({
  reservation,
  restaurantId,
  canManage,
  amend,
  onSaved,
}: {
  reservation: ReservationDetail;
  restaurantId: string;
  canManage: boolean;
  amend: ReturnType<typeof useServerFn<typeof amendReservation>>;
  onSaved: () => void;
}) {
  const [specialRequests, setSpecialRequests] = useState(reservation.specialRequests ?? "");
  const [notes, setNotes] = useState(reservation.notes ?? "");

  useEffect(() => {
    setSpecialRequests(reservation.specialRequests ?? "");
    setNotes(reservation.notes ?? "");
  }, [reservation.id, reservation.specialRequests, reservation.notes]);

  const save = useMutation({
    mutationFn: () =>
      amend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: reservation.arrivalDate,
          departure: reservation.departureDate,
          adults: reservation.adults,
          children: reservation.children,
          specialRequests,
          notes,
          ratePlanId: reservation.ratePlanId,
        },
      }),
    onSuccess: () => {
      toast.success("Notes updated.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg">Notes</h2>
      <div className="mt-3 space-y-3">
        <div className="space-y-1">
          <Label htmlFor="detail-special-requests">Special requests</Label>
          <Textarea
            id="detail-special-requests"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            maxLength={2000}
            disabled={!canManage}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="detail-notes">Internal notes</Label>
          <Textarea
            id="detail-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            disabled={!canManage}
          />
        </div>
        {canManage ? (
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save notes"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function AmendDialog({
  open,
  onOpenChange,
  reservation,
  restaurantId,
  onSaved,
  amend,
  fetchAvailability,
  fetchRooms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: ReservationDetail;
  restaurantId: string;
  onSaved: () => void;
  amend: ReturnType<typeof useServerFn<typeof amendReservation>>;
  fetchAvailability: ReturnType<typeof useServerFn<typeof getRoomTypeAvailability>>;
  fetchRooms: ReturnType<typeof useServerFn<typeof listAssignableRooms>>;
}) {
  const [arrival, setArrival] = useState(reservation.arrivalDate);
  const [departure, setDeparture] = useState(reservation.departureDate);
  const [roomTypeId, setRoomTypeId] = useState(reservation.roomTypeId);
  const [roomId, setRoomId] = useState(reservation.roomId ?? UNASSIGNED);
  const [adults, setAdults] = useState(reservation.adults);
  const [children, setChildren] = useState(reservation.children);
  const [specialRequests, setSpecialRequests] = useState(reservation.specialRequests ?? "");
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [guestId, setGuestId] = useState(reservation.guestId);
  const [guestName, setGuestName] = useState(reservation.guestName);
  const [guestSearch, setGuestSearch] = useState("");
  const [commercialBookingSource, setCommercialBookingSource] = useState(
    reservation.commercialBookingSource ?? "",
  );
  const [marketSegment, setMarketSegment] = useState(reservation.marketSegment ?? "");
  const [externalReference, setExternalReference] = useState(reservation.externalReference ?? "");
  const [guaranteeMethod, setGuaranteeMethod] = useState(reservation.guaranteeMethod ?? "");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const fetchGuests = useServerFn(listGuests);
  const fetchQuotes = useServerFn(quoteStay);

  useEffect(() => {
    if (!open) return;
    setArrival(reservation.arrivalDate);
    setDeparture(reservation.departureDate);
    setRoomTypeId(reservation.roomTypeId);
    setRoomId(reservation.roomId ?? UNASSIGNED);
    setAdults(reservation.adults);
    setChildren(reservation.children);
    setSpecialRequests(reservation.specialRequests ?? "");
    setNotes(reservation.notes ?? "");
    setGuestId(reservation.guestId);
    setGuestName(reservation.guestName);
    setGuestSearch("");
    setCommercialBookingSource(reservation.commercialBookingSource ?? "");
    setMarketSegment(reservation.marketSegment ?? "");
    setExternalReference(reservation.externalReference ?? "");
    setGuaranteeMethod(reservation.guaranteeMethod ?? "");
    setStep("edit");
  }, [open, reservation]);

  const datesValid = departure > arrival;

  const availabilityQuery = useQuery({
    queryKey: ["room-type-availability", restaurantId, arrival, departure, reservation.id],
    queryFn: () =>
      fetchAvailability({
        data: { restaurantId, arrival, departure, excludeReservationId: reservation.id },
      }),
    enabled: open && datesValid,
  });

  const roomsQuery = useQuery({
    queryKey: [
      "assignable-rooms",
      restaurantId,
      roomTypeId,
      arrival,
      departure,
      reservation.id,
      "amend",
    ],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId,
          arrival,
          departure,
          excludeReservationId: reservation.id,
        },
      }),
    enabled: open && datesValid && !!roomTypeId,
  });

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, guestSearch, "amend"],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active",
          limit: 8,
          ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}),
        },
      }),
    enabled: open && step === "edit",
  });

  const quoteQuery = useQuery({
    queryKey: ["amend-quote", restaurantId, roomTypeId, arrival, departure, reservation.ratePlanId],
    queryFn: () =>
      fetchQuotes({
        data: {
          restaurantId,
          roomTypeId,
          arrival,
          departure,
          ...(reservation.ratePlanId ? { ratePlanId: reservation.ratePlanId } : {}),
        },
      }),
    enabled: open && datesValid && !!reservation.ratePlanId,
  });

  const selectedType = (availabilityQuery.data ?? []).find((row) => row.roomTypeId === roomTypeId);
  const selectedRoom = (roomsQuery.data ?? []).find((row) => row.id === roomId);
  const proposedTotal = quoteQuery.data?.[0]?.quote?.subtotal ?? null;
  const impact = reservationAmendImpact(
    {
      guestId: reservation.guestId,
      guestName: reservation.guestName,
      arrival: reservation.arrivalDate,
      departure: reservation.departureDate,
      adults: reservation.adults,
      children: reservation.children,
      roomTypeId: reservation.roomTypeId,
      roomTypeName: reservation.roomTypeName,
      roomId: reservation.roomId,
      roomNumber: reservation.roomNumber,
      specialRequests: reservation.specialRequests ?? "",
      notes: reservation.notes ?? "",
      commercialBookingSource: reservation.commercialBookingSource ?? "",
      marketSegment: reservation.marketSegment ?? "",
      externalReference: reservation.externalReference ?? "",
      guaranteeMethod: reservation.guaranteeMethod ?? "",
      available: null,
      currentTotal: reservation.roomSubtotal,
      proposedTotal: reservation.roomSubtotal,
    },
    {
      guestId,
      guestName,
      arrival,
      departure,
      adults,
      children,
      roomTypeId,
      roomTypeName: selectedType?.name ?? reservation.roomTypeName,
      roomId: roomId === UNASSIGNED ? null : roomId,
      roomNumber:
        roomId === UNASSIGNED ? null : (selectedRoom?.roomNumber ?? reservation.roomNumber),
      specialRequests,
      notes,
      commercialBookingSource,
      marketSegment,
      externalReference,
      guaranteeMethod,
      available: selectedType?.available ?? null,
      currentTotal: reservation.roomSubtotal,
      proposedTotal,
    },
  );

  const save = useMutation({
    mutationFn: () =>
      amend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId,
          roomTypeId,
          roomId: roomId === UNASSIGNED ? null : roomId,
          arrival,
          departure,
          adults,
          children,
          specialRequests,
          notes,
          ratePlanId: reservation.ratePlanId,
          commercialBookingSource: commercialBookingSource || null,
          marketSegment: marketSegment || null,
          externalReference: externalReference || null,
          guaranteeMethod: guaranteeMethod || null,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation amended.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nights = datesValid ? nightsBetween(arrival, departure) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[70] max-h-[90vh] max-w-2xl overflow-y-auto"
        data-testid="amend-stay-dialog"
      >
        <DialogHeader>
          <DialogTitle>{step === "edit" ? "Amend stay" : "Review amendment"}</DialogTitle>
          <DialogDescription>
            {step === "edit"
              ? "Change the stay, then review availability, assignment and rate impact before saving."
              : "Confirm Current → Proposed differences. Availability is rechecked on save."}
          </DialogDescription>
        </DialogHeader>

        {step === "edit" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="amend-guest-search">Guest</Label>
              <p className="text-sm">{guestName}</p>
              <Input
                id="amend-guest-search"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search guests to change"
              />
              {guestSearch.trim() ? (
                <div className="max-h-32 overflow-y-auto rounded-xl border border-border">
                  {(guestsQuery.data ?? []).map((guest) => (
                    <button
                      key={guest.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setGuestId(guest.id);
                        setGuestName(guest.fullName || "Guest");
                        setGuestSearch("");
                      }}
                    >
                      {guest.fullName}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="amend-arrival">Arrival</Label>
                <Input
                  id="amend-arrival"
                  type="date"
                  value={arrival}
                  onChange={(e) => setArrival(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amend-departure">Departure</Label>
                <Input
                  id="amend-departure"
                  type="date"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amend-adults">Adults</Label>
                <Input
                  id="amend-adults"
                  type="number"
                  min={1}
                  value={adults}
                  onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amend-children">Children</Label>
                <Input
                  id="amend-children"
                  type="number"
                  min={0}
                  value={children}
                  onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Room type</Label>
              <Select
                value={roomTypeId}
                onValueChange={(v) => {
                  setRoomTypeId(v);
                  setRoomId(UNASSIGNED);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(availabilityQuery.data ?? []).map((a) => (
                    <SelectItem key={a.roomTypeId} value={a.roomTypeId} disabled={a.available <= 0}>
                      {a.name} — {a.available} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Room</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign later" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
                  {(roomsQuery.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Room {r.roomNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="amend-special-requests">Special requests</Label>
              <Textarea
                id="amend-special-requests"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                maxLength={2000}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="amend-notes">Internal notes</Label>
              <Textarea
                id="amend-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Booking source</Label>
                <Select
                  value={commercialBookingSource || "none"}
                  onValueChange={(value) =>
                    setCommercialBookingSource(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEFAULT_BOOKING_SOURCES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Market segment</Label>
                <Select
                  value={marketSegment || "none"}
                  onValueChange={(value) => setMarketSegment(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {DEFAULT_MARKET_SEGMENTS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="amend-external-reference">External reference</Label>
                <Input
                  id="amend-external-reference"
                  value={externalReference}
                  onChange={(e) => setExternalReference(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Guarantee</Label>
                <Select
                  value={guaranteeMethod || "none"}
                  onValueChange={(value) => setGuaranteeMethod(value === "none" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {FALLBACK_CASHIERING_TENDERS.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {datesValid
                ? `${nights} night${nights === 1 ? "" : "s"}`
                : "Departure must be after arrival."}
            </p>
          </>
        ) : (
          <div className="space-y-3" data-testid="amend-impact-review">
            {impact.changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes to save.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1">Field</th>
                    <th className="py-1">Current</th>
                    <th className="py-1">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.changes.map((change) => (
                    <tr key={change.field} className="border-t border-border">
                      <td className="py-2 font-medium">{change.field}</td>
                      <td className="py-2">{change.current}</td>
                      <td className="py-2">{change.proposed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {impact.availabilityNone ? (
              <p className="text-sm text-destructive">
                The proposed room type has no remaining availability.
              </p>
            ) : null}
            {impact.assignmentCleared ? (
              <p className="text-sm text-muted-foreground">The assigned room will be cleared.</p>
            ) : null}
            {impact.rateMayChange ? (
              <p className="text-sm text-muted-foreground">
                Stay dates or room type changed — the server will reprice if a rate plan is
                attached.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {step === "review" ? (
            <Button variant="outline" onClick={() => setStep("edit")}>
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {step === "edit" ? (
            <Button disabled={!datesValid} onClick={() => setStep("review")}>
              Review changes
            </Button>
          ) : (
            <Button
              disabled={
                !datesValid ||
                impact.availabilityNone ||
                impact.changes.length === 0 ||
                save.isPending
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Confirm amendment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingSection({
  restaurantId,
  reservation,
  canManage,
  onRepriced,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  onRepriced: () => void;
}) {
  const money = useMoney();
  const fetchPlans = useServerFn(listRatePlans);
  const submitReprice = useServerFn(repriceReservation);
  const [planId, setPlanId] = useState(reservation.ratePlanId ?? "");

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, reservation.roomTypeId, true],
    queryFn: () =>
      fetchPlans({ data: { restaurantId, roomTypeId: reservation.roomTypeId, activeOnly: true } }),
    enabled: canManage,
    retry: false,
  });

  const reprice = useMutation({
    mutationFn: () =>
      submitReprice({ data: { restaurantId, reservationId: reservation.id, ratePlanId: planId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Repriced — new stay total ${money(result.subtotal)}.`);
      onRepriced();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nightly = reservation.nightlyRates ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Pricing</h2>
      {nightly.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No pricing snapshot for this reservation. Existing stays keep their original terms — pick
          a rate plan below to price it.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Night</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {nightly.map((n) => (
                <tr key={n.date} className="border-t border-border">
                  <td className="px-3 py-2">{formatStayDate(n.date)}</td>
                  <td className="px-3 py-2 text-right">{money(n.rate)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30 font-medium">
                <td className="px-3 py-2">Room subtotal</td>
                <td className="px-3 py-2 text-right">{money(reservation.roomSubtotal ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-1">
            <Label>Rate plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select rate plan" />
              </SelectTrigger>
              <SelectContent>
                {(plansQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!planId || reprice.isPending}
            onClick={() => reprice.mutate()}
          >
            {reprice.isPending ? "Repricing…" : "Reprice stay"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Repricing recalculates every night on the server and records a history entry.
          </p>
        </div>
      ) : null}
    </section>
  );
}
