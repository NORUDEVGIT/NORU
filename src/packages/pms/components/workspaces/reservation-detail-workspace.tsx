import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Menu, MoreHorizontal, Printer, X } from "lucide-react";

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
  AssignRoomDialog,
  CheckInDialog,
  CheckOutDialog,
  NoShowDialog,
  RoomMoveDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { stayFromReservation } from "@/packages/pms/lib/front-office-shell";
import { frontOfficeRoomTargets } from "@/packages/pms/lib/reservation-room-units";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import {
  ReservationDetailOverviewDashboard,
} from "@/packages/pms/components/workspaces/reservation-detail-overview";
import { ReservationDetailStayTab } from "@/packages/pms/components/workspaces/reservation-detail-stay";
import { ReservationDetailGuestTab } from "@/packages/pms/components/workspaces/reservation-detail-guest";
import { ReservationDetailRatesTab } from "@/packages/pms/components/workspaces/reservation-detail-rates";
import { ReservationDetailRoomsTab } from "@/packages/pms/components/workspaces/reservation-detail-rooms";
import { ReservationDetailPackagesTab } from "@/packages/pms/components/workspaces/reservation-detail-packages";
import { ReservationDetailFolioTab } from "@/packages/pms/components/workspaces/reservation-detail-folio";
import { getReservationFolio, getFolio } from "@/packages/pms/lib/cashiering.functions";
import {
  NO_FOLIO_LABEL,
  projectReservationCashieringSummary,
} from "@/packages/pms/lib/reservation-cashiering-summary";
import { reservationDetailEditable } from "@/packages/pms/lib/reservation-lifecycle";
import { ReservationDetailRequestsTab } from "@/packages/pms/components/workspaces/reservation-detail-requests";
import { ReservationDetailNotesTab } from "@/packages/pms/components/workspaces/reservation-detail-notes";
import {
  bookedByLabel,
  overviewCatalogueLabel,
  overviewChannelLabel,
  COMMUNICATION_DEFERRED_COPY,
  DETAIL_DASH,
  DETAIL_PRIMARY_TABS,
  detailPrimaryTab,
  LINKED_DEFERRED_COPY,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
  sourceLabel,
  storedRatePerNight,
  type DetailWorkspaceTab,
} from "@/packages/pms/lib/reservation-detail-overview";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
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
import { presentReservationHistory } from "@/packages/pms/lib/reservation-detail-history";
import {
  groupActionGate,
  groupCombinedSubtotal,
  groupRoomUnits,
  isGroupReservation,
  reservationHeaderGuestLabel,
  reservationHeaderRoomKpi,
} from "@/packages/pms/lib/reservation-detail-group";
import { quoteReservationRoomGuestTotal } from "@/packages/pms/lib/room-charge-guest-total.functions";
import {
  packageChargeFigures,
  sumReservationGuestTotal,
} from "@/packages/pms/lib/room-charge-guest-total";
import {
  reservationServicePrintLine,
  serviceLineDetail,
} from "@/packages/pms/lib/reservation-service-lines";
import { chargeTypeLabel } from "@/packages/pms/lib/reservation-detail-packages";
import { usePackageChargeRules } from "@/packages/pms/lib/use-package-charge-rules";
import { useReservationServiceCharges } from "@/packages/pms/lib/use-reservation-service-charges";
import { getPropertyBusinessDate } from "@/packages/pms/lib/nightaudit.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getReservationCreateSourceChannel } from "@/packages/pms/lib/reservation-source-channel.functions";
import {
  PROPERTY_BUSINESS_DATE_KEY,
  usePropertyBusinessDate,
} from "@/packages/pms/lib/use-property-business-date";
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
import { getGuest } from "@/packages/pms/lib/guests.functions";
import { ReservationPrintDocument } from "@/packages/pms/components/bookings/reservation-print-document";
import { earlyDepartureReservationLabel } from "@/packages/pms/lib/early-departure-policy";
import { snapshotDueDate } from "@/packages/pms/lib/reservation-detail-folio";
import { guestProfilePreferenceChips } from "@/packages/pms/lib/reservation-detail-requests";
import {
  reviewNoShowCopy,
  reviewRefundabilityCopy,
} from "@/packages/pms/lib/create-reservation-review";
import {
  buildPersistedReservationPrintData,
  confirmedTimestampFromHistory,
  formatPrintDateTime,
  formatPropertyContactAddress,
} from "@/packages/pms/lib/reservation-print-document";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import {
  getReservationActions,
  type ReservationActionId,
  type ReservationActionResult,
} from "@/packages/pms/lib/reservation-actions";
import {
  reservationDetailActionInput,
  reservationDetailActionIsDestructive,
  reservationDetailActionLabel,
  reservationDetailSecondaryActions,
} from "@/packages/pms/lib/reservation-detail-actions";

import { cn } from "@/shared/lib/utils";

const UNASSIGNED = "unassigned";

type FrontOfficeAction = "assign_room" | "check_in" | "check_out" | "no_show" | "change_room";

const SECTION_MENU_LABEL: Record<DetailWorkspaceTab, string> = {
  overview: "Overview",
  stay: "Stay",
  guest: "Guest",
  rooms: "Room",
  rates: "Rates",
  packages: "Packages",
  folio: "Folio & Payments",
  requests: "Requests & Preferences",
  notes: "Notes & Traces",
  communication: "Communication",
  linked: "Linked Reservations",
  history: "History",
};

export function ReservationDetailWorkspace({
  membership,
  reservationId,
  embedded = false,
  onCopiedReservation,
  onBackToList,
  onEditReservation,
}: {
  membership: RestaurantMembership;
  reservationId: string;
  embedded?: boolean;
  onCopiedReservation?: (reservationId: string) => void;
  onBackToList?: () => void;
  onEditReservation?: () => void;
}) {
  const navigate = useNavigate();
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const { dateTime, timezone } = useRestaurantTime();
  const money = useMoney();
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);
  const fetchBusinessDate = useServerFn(getPropertyBusinessDate);
  const businessDateQuery = useQuery({
    queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId],
    queryFn: () => fetchBusinessDate({ data: { restaurantId } }),
    retry: false,
  });
  const actionBusinessDate = businessDateQuery.data?.businessDate ?? null;

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchGuest = useServerFn(getGuest);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const fetchSourceChannel = useServerFn(getReservationCreateSourceChannel);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitAmend = useServerFn(amendReservation);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitStatus = useServerFn(setReservationStatus);
  const submitCopy = useServerFn(copyReservation);
  const fetchReservationFolio = useServerFn(getReservationFolio);
  const fetchFolio = useServerFn(getFolio);

  const [amendOpen, setAmendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [foAction, setFoAction] = useState<FrontOfficeAction | null>(null);
  const [foRoomTarget, setFoRoomTarget] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailWorkspaceTab>("overview");

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;
  const permissions = usePmsPermissions(restaurantId);
  const canViewReservation = permissions.can(PMS_PERMISSIONS.RESERVATION_VIEW);

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    enabled: canViewReservation,
    retry: false,
  });

  const reservation = detailQuery.data?.reservation;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, reservation?.guestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: reservation!.guestId } }),
    enabled: canViewReservation && Boolean(reservation?.guestId),
    retry: false,
  });
  const set6Query = useQuery({
    queryKey: ["pms-set6", restaurantId, "reservation-detail-overview"],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    retry: false,
  });
  const sourceChannelQuery = useQuery({
    queryKey: ["reservation-create-source-channel", restaurantId, "detail"],
    queryFn: () => fetchSourceChannel({ data: { restaurantId } }),
    retry: false,
  });
  const commercialQuery = useQuery({
    queryKey: ["reservation-commercial", restaurantId, reservation?.id, "packages"],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId: reservation!.id,
          roomSubtotal: reservation!.roomSubtotal,
        },
      }),
    enabled: canViewReservation && Boolean(reservation?.id),
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
    enabled: canViewReservation && !!reservation && reservation.status !== "cancelled",
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
    enabled: canViewReservation && Boolean(reservation),
    retry: false,
  });

  const previewFolioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, reservation?.id],
    queryFn: () =>
      fetchReservationFolio({ data: { restaurantId, reservationId: reservation!.id } }),
    enabled: canViewReservation && Boolean(reservation?.id),
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["folio", restaurantId, previewFolioQuery.data?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: previewFolioQuery.data!.id } }),
    enabled: Boolean(previewFolioQuery.data?.id),
    retry: false,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId, reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["reservations", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["assignable-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["bookings-dashboard", restaurantId] });
    void queryClient.invalidateQueries({
      queryKey: ["reservation-folio", restaurantId, reservationId],
    });
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["reservation-commercial", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["room-type-availability", restaurantId] });
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

  const roomChargeAmounts = !reservation
    ? []
    : isGroupReservation(reservation)
      ? groupRoomUnits(reservation)
          .map((unit) => unit.roomSubtotal)
          .filter((amount): amount is number => amount != null && Number.isFinite(amount))
      : reservation.roomSubtotal != null && Number.isFinite(reservation.roomSubtotal)
        ? [reservation.roomSubtotal]
        : [];
  const fetchRoomGuestTotal = useServerFn(quoteReservationRoomGuestTotal);
  const packageChargeRules = usePackageChargeRules(restaurantId, canViewReservation);
  const reservationServices = useReservationServiceCharges(
    restaurantId,
    reservation?.id,
    canViewReservation && Boolean(reservation?.id),
  );
  const roomGuestTotalQuery = useQuery({
    queryKey: ["reservation-room-guest-total", restaurantId, roomChargeAmounts],
    queryFn: () => fetchRoomGuestTotal({ data: { restaurantId, amounts: roomChargeAmounts } }),
    enabled: canViewReservation && roomChargeAmounts.length > 0,
  });

  if (accessQuery.isLoading || permissions.isLoading)
    return <p className="text-sm text-muted-foreground">Loading reservation…</p>;
  if (!canViewReservation) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Reservation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to open this reservation.
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
  const stayMutable = reservationDetailEditable({
    status: reservation.status,
    arrivalDate: reservation.arrivalDate,
    businessDate,
    canManage,
  });
  const createdBy =
    reservation.createdByName ??
    history.find((entry) => entry.eventType === "created")?.actorName ??
    null;
  const foStay: FrontOfficeStay = {
    ...stayFromReservation(reservation, businessDate),
    guestEmail: reservation.guestEmail,
    guaranteeMethod: reservation.guaranteeMethod,
    roomUnits: frontOfficeRoomTargets(reservation.rooms),
  };
  const detailActions =
    actionBusinessDate === null
      ? null
      : getReservationActions(
          reservationDetailActionInput({
            status: reservation.status,
            businessDate: actionBusinessDate,
            arrivalDate: reservation.arrivalDate,
            departureDate: reservation.departureDate,
            roomId: reservation.roomId,
            role: accessQuery.data?.role ?? "",
          }),
        );
  function runDetailAction(actionId: ReservationActionId) {
    switch (actionId) {
      case "confirm":
        statusMutation.mutate({ status: "confirmed" });
        return;
      case "reactivate":
        statusMutation.mutate({ status: "pending" });
        return;
      case "cancel":
        setCancelOpen(true);
        return;
      case "assign_room":
      case "check_in":
      case "check_out":
      case "no_show":
      case "change_room":
        setFoRoomTarget(null);
        setFoAction(actionId);
        return;
      case "copy":
        if (isGroupReservation(reservation)) return;
        copyMutation.mutate();
        return;
      case "edit":
        if (isGroupReservation(reservation)) return;
        if (onEditReservation) onEditReservation();
        else setAmendOpen(true);
        return;
      case "open_folio":
        setDetailTab("folio");
        return;
      default:
        return;
    }
  }
  const groupReservation = isGroupReservation(reservation);
  const headerRoomTotal = groupReservation
    ? groupCombinedSubtotal(reservation)
    : reservation.roomSubtotal;
  const baseGuestTotal = roomGuestTotalQuery.data?.total ?? headerRoomTotal;
  const headerPackageTotal =
    Math.round(
      (commercialQuery.data?.packages ?? []).reduce(
        (sum, row) => sum + packageChargeFigures(row.appliedAmount, packageChargeRules.data).total,
        0,
      ) * 100,
    ) / 100;
  const headerServiceTotal = reservationServices.total;
  const headerGuestTotal = sumReservationGuestTotal(
    baseGuestTotal,
    headerPackageTotal,
    headerServiceTotal,
  );
  const headerRoomTax =
    baseGuestTotal != null && headerRoomTotal != null
      ? Math.round((baseGuestTotal - headerRoomTotal) * 100) / 100
      : 0;
  const overviewPackages = (commercialQuery.data?.packages ?? []).map((row) => {
    const qty = Number.isFinite(row.quantity) && row.quantity > 1 ? `× ${row.quantity}` : null;
    return {
      name: row.packageName,
      detail: [chargeTypeLabel(row.chargeBasis), qty, row.roomUnitLabel]
        .filter((part): part is string => Boolean(part))
        .join(" · "),
      amount: packageChargeFigures(row.appliedAmount, packageChargeRules.data).total,
    };
  });
  const overviewServices = reservationServices.lines.map((row) => ({
    name: row.charge.serviceName,
    detail: serviceLineDetail(
      {
        pricingUnit: row.charge.pricingUnit,
        unitAmount: row.charge.unitAmount,
        quantity: row.charge.quantity,
        departmentId: row.charge.departmentId,
      },
      money,
    ),
    amount: row.figures.total,
  }));
  const detailActionBar = detailActions ? (
    <ReservationDetailActionBar
      result={detailActions}
      busy={statusMutation.isPending || copyMutation.isPending}
      onAction={runDetailAction}
      gatedActions={{
        copy: groupActionGate("copy", groupReservation) ?? undefined,
        edit: groupActionGate("amend", groupReservation) ?? undefined,
      }}
    />
  ) : null;

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
      {foAction === "assign_room" ? (
        <AssignRoomDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          initialReservationRoomId={foRoomTarget ?? undefined}
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              setFoRoomTarget(null);
            }
          }}
        />
      ) : null}
      {foAction === "check_in" ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          initialReservationRoomId={foRoomTarget ?? undefined}
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              setFoRoomTarget(null);
            }
          }}
        />
      ) : null}
      {foAction === "check_out" ? (
        <CheckOutDialog
          restaurantId={restaurantId}
          stay={foStay}
          open
          initialReservationRoomId={foRoomTarget ?? undefined}
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              setFoRoomTarget(null);
            }
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
          initialReservationRoomId={foRoomTarget ?? undefined}
          onOpenChange={(open) => {
            if (!open) {
              setFoAction(null);
              setFoRoomTarget(null);
            }
          }}
        />
      ) : null}
    </>
  );

  {
    const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
    const ledgerPending =
      !previewFolioQuery.isFetched || (previewFolioQuery.data?.id != null && !folioQuery.isFetched);
    const cashieringSummary = projectReservationCashieringSummary({
      reservationRoomTotal: headerRoomTotal,
      depositRequirementSnapshot: reservation.depositRequirementSnapshot,
      folio:
        previewFolioQuery.data == null
          ? null
          : folioQuery.data
            ? {
                balance: folioQuery.data.balance,
                transactions: folioQuery.data.transactions,
              }
            : null,
    });
    const paymentReceived = ledgerPending ? undefined : cashieringSummary.paymentReceived;
    const guestDepositReceived = ledgerPending ? undefined : cashieringSummary.depositReceived;
    const paymentRefunded = ledgerPending ? undefined : cashieringSummary.refunded;
    const paymentFigure =
      paymentReceived === undefined
        ? DETAIL_DASH
        : paymentReceived === null
          ? NO_FOLIO_LABEL
          : money(paymentReceived);
    const depositFigure =
      guestDepositReceived === undefined
        ? DETAIL_DASH
        : guestDepositReceived === null
          ? NO_FOLIO_LABEL
          : money(guestDepositReceived);
    const roomType = (availabilityQuery.data ?? []).find(
      (row) => row.roomTypeId === reservation.roomTypeId,
    );
    const appliedPackages = commercialQuery.data?.packages ?? [];
    const packagesKnown = commercialQuery.isFetched && !commercialQuery.isError;
    const ratePerNight = storedRatePerNight(
      reservation.nightlyRates,
      reservation.roomSubtotal,
      reservation.nights,
    );
    const noShowName = snapshotDisplayName(reservation.noShowPolicySnapshot);
    const noShowPenalty = snapshotField(reservation.noShowPolicySnapshot, ["penalty_type"]);
    const persistedRoomUnits = reservation.rooms ?? [];
    const persistedGroup = reservation.reservationMode === "group" || persistedRoomUnits.length > 1;
    const persistedActiveRooms = persistedRoomUnits.filter(
      (unit) => unit.status !== "cancelled" && unit.status !== "no_show",
    );
    const printData = buildPersistedReservationPrintData({
      generatedAt: formatPrintDateTime(new Date()) ?? "",
      propertyName: membership.restaurant.name,
      propertyAddress: formatPropertyContactAddress([
        membership.restaurant.address,
        membership.restaurant.city,
        membership.restaurant.postcode,
        membership.restaurant.country,
      ]),
      propertyPhone: membership.restaurant.phone,
      propertyEmail: membership.restaurant.email,
      status: reservation.status,
      confirmationNumber: reservation.confirmationNumber,
      createdAt: reservation.createdAt,
      confirmedAt: confirmedTimestampFromHistory(history),
      guestName: reservation.guestName,
      phone: reservation.guestPhone,
      email: reservation.guestEmail,
      nationality: guestQuery.data?.guest?.nationality ?? null,
      idDocumentNumber: guestQuery.data?.guest?.idDocumentNumber ?? null,
      bookedBy: bookedByLabel(reservation.bookerGuestId, reservation.guestId),
      bookingSource: sourceLabel(
        reservation.source,
        reservation.commercialBookingSource,
        set6Query.data?.snapshot.sourceCodes,
      ),
      salesChannel: overviewChannelLabel(
        reservation.source,
        reservation.salesChannel,
        set6Query.data?.snapshot.salesChannels ?? [],
        sourceChannelQuery.data?.channels ?? [],
      ),
      marketSegment: overviewCatalogueLabel(
        reservation.marketSegment,
        set6Query.data?.snapshot.marketSegments ?? [],
      ),
      companyName: reservation.companyName,
      travelAgentName: reservation.travelAgentName,
      groupName: reservation.groupName,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      nights: reservation.nights,
      rooms: persistedRoomUnits.length || reservation.roomsRequested,
      adults: persistedGroup
        ? persistedActiveRooms.reduce((sum, unit) => sum + unit.adults, 0)
        : reservation.adults,
      children: persistedGroup
        ? persistedActiveRooms.reduce((sum, unit) => sum + unit.children, 0)
        : reservation.children,
      infants: persistedGroup
        ? persistedActiveRooms.reduce((sum, unit) => sum + unit.infants, 0)
        : reservation.infants,
      roomImageUrl: roomType?.coverUrl ?? null,
      roomName: reservation.roomTypeName,
      roomCode: reservation.roomTypeCode ?? null,
      ratePlan: reservation.ratePlanName,
      inclusions: null,
      ratePerNight: ratePerNight == null ? null : money(ratePerNight),
      roomTotal: reservation.roomSubtotal == null ? null : money(reservation.roomSubtotal),
      packages: appliedPackages.map((row) => ({
        name: row.packageName,
        chargeBasis: row.chargeBasis,
        quantity: Number.isFinite(row.quantity) ? row.quantity : null,
        unitAmount: Number.isFinite(row.unitAmount) ? money(row.unitAmount) : null,
        amount: Number.isFinite(row.appliedAmount)
          ? money(packageChargeFigures(row.appliedAmount, packageChargeRules.data).total)
          : null,
        inclusions:
          row.components
            .map((item) => item.label.trim() || item.componentType.trim())
            .filter((value) => value && !/^[0-9a-f-]{36}$/i.test(value))
            .join(", ") || null,
      })),
      packagesKnown,
      packagesTotal:
        packagesKnown && appliedPackages.length > 0
          ? money(
              appliedPackages.reduce(
                (sum, row) =>
                  sum + packageChargeFigures(row.appliedAmount, packageChargeRules.data).total,
                0,
              ),
            )
          : null,
      paymentType: reservation.guaranteeMethod,
      paymentMethod: deposit?.tenderCode ?? reservation.guaranteeMethod,
      depositRequired: deposit?.required == null ? null : deposit.required ? "Yes" : "No",
      depositAmount: deposit?.amount == null ? null : money(deposit.amount),
      depositDueDate: snapshotDueDate(reservation.depositRequirementSnapshot),
      paymentTerms: [],
      cancellation:
        snapshotDisplayName(reservation.cancellationPolicySnapshot) ??
        snapshotField(reservation.refundabilitySnapshot, ["cancellation", "cancellation_policy"]),
      noShow: reviewNoShowCopy(
        noShowName,
        noShowPenalty ? noShowPenalty.replaceAll("_", " ") : null,
      ),
      earlyDeparture: earlyDepartureReservationLabel({
        snapshot: reservation.earlyDeparturePolicySnapshot,
        legacyRefundabilitySnapshot: reservation.refundabilitySnapshot,
      }),
      refundability: reviewRefundabilityCopy(
        snapshotField(reservation.refundabilitySnapshot, ["kind", "policy_kind", "refundability"]),
        snapshotDisplayName(reservation.refundabilitySnapshot),
      ),
      preferences: guestProfilePreferenceChips(guestQuery.data?.preferences).map(
        (chip) => chip.label,
      ),
      serviceRequests: reservationServices.lines.map((row) =>
        reservationServicePrintLine(
          row.charge.serviceName,
          {
            pricingUnit: row.charge.pricingUnit,
            unitAmount: row.charge.unitAmount,
            quantity: row.charge.quantity,
            departmentId: row.charge.departmentId,
          },
          money,
          reservationServices.rules.data,
        ),
      ),
      specialRequests: reservation.specialRequests,
      roomAssignment: reservation.roomNumber ? `Room ${reservation.roomNumber}` : null,
      reservationKind: persistedGroup ? "group" : "single",
      guestRole: persistedGroup ? "Primary Guest / Booker" : null,
      roomRows: persistedGroup
        ? persistedRoomUnits.map((unit) => {
            const unitNights = nightsBetween(unit.arrivalDate, unit.departureDate);
            const unitRate = storedRatePerNight(unit.nightlyRates, unit.roomSubtotal, unitNights);
            return {
              sequence: String(unit.unitSequence),
              occupant:
                unit.occupants.find((occupant) => occupant.isPrimary)?.name ??
                "No primary occupant",
              roomType: unit.roomTypeName ?? "Room type",
              occupancy: `${unit.adults}A${unit.children ? ` · ${unit.children}C` : ""}${
                unit.infants ? ` · ${unit.infants}I` : ""
              }`,
              ratePlan: unit.ratePlanName ?? "—",
              ratePerNight: unitRate == null ? "—" : money(unitRate),
              subtotal: unit.roomSubtotal == null ? "—" : money(unit.roomSubtotal),
            };
          })
        : undefined,
    });
    const stayPanel = (
      <ReservationDetailStayTab
        restaurantId={restaurantId}
        reservation={reservation}
        editable={(detailActions?.editable ?? false) && stayMutable}
        canManage={stayMutable}
        businessDate={businessDate}
        timezone={timezone}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        packagesTotal={headerPackageTotal}
        servicesTotal={headerServiceTotal}
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
        canManage={stayMutable}
        money={money}
        coverUrl={roomType?.coverUrl ?? null}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        packagesTotal={headerPackageTotal}
        servicesTotal={headerServiceTotal}
        onBackToOverview={() => setDetailTab("overview")}
        onSaved={invalidate}
      />
    );
    const ratesPanel = (
      <ReservationDetailRatesTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={stayMutable}
        money={money}
        folio={folioQuery.data ?? null}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        coverUrl={roomType?.coverUrl ?? null}
        occupancyLabel={
          roomType ? `${roomType.adultCapacity} adults · ${roomType.childCapacity} children` : null
        }
        marketSegments={set6Query.data?.snapshot.marketSegments ?? []}
        onBackToRooms={() => setDetailTab("rooms")}
        onOpenPackages={() => setDetailTab("packages")}
        onSaved={invalidate}
      />
    );
    const roomsPanel = (
      <ReservationDetailRoomsTab
        restaurantId={restaurantId}
        reservation={reservation}
        assignableRooms={rooms}
        canManage={stayMutable}
        businessDate={businessDate}
        money={money}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        packagesTotal={headerPackageTotal}
        servicesTotal={headerServiceTotal}
        coverUrl={roomType?.coverUrl ?? null}
        occupancyLabel={
          roomType ? `${roomType.adultCapacity} adults · ${roomType.childCapacity} children` : null
        }
        onBackToGuest={() => setDetailTab("guest")}
        onSaved={invalidate}
        onOperate={(action, reservationRoomId) => {
          setFoRoomTarget(reservationRoomId);
          setFoAction(action);
        }}
      />
    );
    const packagesPanel = (
      <ReservationDetailPackagesTab
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={stayMutable}
        money={money}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        coverUrl={roomType?.coverUrl ?? null}
      />
    );
    const folioPanel = (
      <ReservationDetailFolioTab
        restaurantId={restaurantId}
        reservation={reservation}
        money={money}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
        packagesTotal={headerPackageTotal}
        servicesTotal={headerServiceTotal}
        coverUrl={roomType?.coverUrl ?? null}
      />
    );
    const requestsPanel = (
      <ReservationDetailRequestsTab
        restaurantId={restaurantId}
        reservation={reservation}
        guest={guestQuery.data?.guest ?? null}
        preferences={guestQuery.data?.preferences ?? null}
        history={history}
        canManage={stayMutable}
        money={money}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
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
        canManage={stayMutable}
        money={money}
        paymentReceived={paymentReceived}
        paymentRefunded={paymentRefunded}
        guestDeposit={guestDepositReceived}
        totalAmount={headerGuestTotal}
        roomGuestTotal={baseGuestTotal}
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
        <ReservationPrintDocument data={printData} />
        <header className="relative shrink-0 bg-[#1F140A] px-4 py-2.5 pr-12 text-[#F3E9D8]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
                <span className="truncate">
                  {reservation.confirmationNumber}
                  <span className="text-[#8A7A61]"> · </span>
                  {reservation.guestName}
                </span>
                <ReservationStatusBadge status={reservation.status} />
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                  {reservationHeaderRoomKpi(reservation).value}
                </span>
                {reservationHeaderGuestLabel(reservation) ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
                    {reservationHeaderGuestLabel(reservation)}
                  </span>
                ) : null}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-testid="reservation-detail-print"
                aria-label="Print"
                className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                onClick={() => window.print()}
              >
                <Printer className="size-4" />
              </button>
              {detailActionBar}
              <button
                type="button"
                aria-label="Close"
                className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
                onClick={() => {
                  if (onBackToList) {
                    onBackToList();
                    return;
                  }
                  void navigate({ to: "/restaurant/pms/reservations" });
                }}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </header>
        <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
        <div className="flex min-h-0 flex-1 flex-col bg-[#F7F4EE]">
          <nav
            className="shrink-0 overflow-x-auto border-b border-[#E8DFD0] bg-[#FBF7F1]"
            aria-label="Reservation detail sections"
            data-testid="reservation-detail-sidebar"
          >
            <ul role="tablist" className="flex min-w-max items-center gap-0.5 px-3 sm:px-4">
              {DETAIL_PRIMARY_TABS.map((tab) => {
                const active = detailPrimaryTab(detailTab).id === tab.id;
                return (
                  <li key={tab.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={
                        tab.tabs.length === 1
                          ? `reservation-detail-tab-${tab.id}`
                          : `reservation-detail-primary-${tab.id}`
                      }
                      onClick={() => {
                        if (!tab.tabs.includes(detailTab)) setDetailTab(tab.tabs[0]!);
                      }}
                      className={cn(
                        "relative whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors",
                        "outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                        active
                          ? "text-[#251605] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#C89933]"
                          : "text-[#5C5346] hover:text-[#251605]",
                      )}
                    >
                      {tab.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="shrink-0 border-b border-[#E8DFD0] bg-[#F7F4EE] px-4 py-1.5 text-xs text-[#5C5346]">
            {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)}
            {" · "}
            {reservation.nights} night{reservation.nights === 1 ? "" : "s"}
            {" | "}
            {reservationHeaderRoomKpi(reservation).value}
            {" | "}
            {headerGuestTotal == null ? DETAIL_DASH : money(headerGuestTotal)} total
            {" | "}
            {paymentFigure} paid
            {" | "}
            {depositFigure} deposit
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="p-3 sm:p-4">
              {detailPrimaryTab(detailTab).tabs.length > 1 ? (
                <div className="mb-2 flex justify-start">
                  <DetailSectionMenu
                    primaryLabel={detailPrimaryTab(detailTab).label}
                    sections={detailPrimaryTab(detailTab).tabs}
                    active={detailTab}
                    onSelect={setDetailTab}
                  />
                </div>
              ) : null}
              {detailTab === "overview" ? (
                <ReservationDetailOverviewDashboard
                  reservation={reservation}
                  totalAmount={headerGuestTotal}
                  roomGuestTotal={baseGuestTotal}
                  packages={overviewPackages}
                  packagesTotal={headerPackageTotal}
                  services={overviewServices}
                  servicesTotal={headerServiceTotal}
                  roomTax={headerRoomTax}
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
                  editable={(detailActions?.editable ?? false) && stayMutable}
                  catalogues={{
                    sources: set6Query.data?.snapshot.sourceCodes ?? [],
                    channels: set6Query.data?.snapshot.salesChannels ?? [],
                    segments: set6Query.data?.snapshot.marketSegments ?? [],
                    distributionChannels: sourceChannelQuery.data?.channels ?? [],
                  }}
                  onEditTab={setDetailTab}
                  paymentReceived={paymentReceived ?? null}
                  depositReceived={guestDepositReceived ?? null}
                  folioBalance={cashieringSummary.folioBalance}
                  roomFloor={rooms.find((row) => row.id === reservation.roomId)?.floor ?? null}
                  roomBuilding={rooms.find((row) => row.id === reservation.roomId)?.building ?? null}
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
                <HistoryList
                  history={history}
                  dateTime={dateTime}
                  reservation={reservation}
                  createdBy={createdBy}
                  money={(value) => money(value)}
                />
              ) : null}
            </div>
          </div>
        </div>
        {childDialogs}
      </div>
    );
  }
}


function DetailSectionMenu({
  primaryLabel,
  sections,
  active,
  onSelect,
}: {
  primaryLabel: string;
  sections: DetailWorkspaceTab[];
  active: DetailWorkspaceTab;
  onSelect: (tab: DetailWorkspaceTab) => void;
}) {
  const currentLabel = SECTION_MENU_LABEL[active];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${primaryLabel}: ${currentLabel}`}
          title={currentLabel}
          data-testid="reservation-detail-section-menu"
          className={cn(
            "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-[#DDD4C5] bg-white px-2.5",
            "text-xs font-medium text-[#251605]",
            "hover:border-[#C89933] hover:bg-[#F7F4EE]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
            "data-[state=open]:border-[#C89933] data-[state=open]:bg-[#F4E9D0]",
          )}
        >
          <Menu className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">{currentLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[80] min-w-48">
        {sections.map((id) => {
          const selected = active === id;
          return (
            <DropdownMenuItem
              key={id}
              data-testid={`reservation-detail-tab-${id}`}
              className={cn(selected && "bg-[#F4E9D0] text-[#251605] focus:bg-[#F4E9D0]")}
              onSelect={() => onSelect(id)}
            >
              <Check
                className={cn("size-3.5 text-[#C89933]", selected ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
              {SECTION_MENU_LABEL[id]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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

const HISTORY_KIND_DOT: Record<string, string> = {
  check_in: "bg-[#3E7A4A]",
  check_out: "bg-[#8A8175]",
  payment: "bg-[#3E7A4A]",
  amendment: "bg-[#C89933]",
  cancel: "bg-[#A45B4A]",
  no_show: "bg-[#B15A5A]",
  assign: "bg-[#8A8175]",
  other: "bg-[#C4B8A6]",
};

function HistoryList({
  history,
  dateTime,
  reservation,
  createdBy,
  money,
}: {
  history: ReservationHistoryEntry[];
  dateTime: (iso: string | null | undefined) => string;
  reservation: ReservationDetail;
  createdBy?: string | null;
  money: (amount: number) => string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showRelated, setShowRelated] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const rows = presentReservationHistory(history, reservation, money);

  const toggleRow = (id: string, open: boolean) => {
    if (open) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setShowRelated(false);
    setShowTechnical(false);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
      <div className="border-b border-[#EEE6D8] px-4 py-3">
        <h2 className="font-display text-base text-[#251605]">History</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Created {dateTime(reservation.createdAt)}
          {createdBy ? ` · ${createdBy}` : ""}
        </p>
      </div>
      {history.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full table-fixed text-sm max-lg:min-w-[720px]">
            <thead className="bg-[#FAF8F4] text-left text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              <tr>
                <th className="w-[10.5rem] px-3 py-2.5">Date / Time</th>
                <th className="w-[9.5rem] px-3 py-2.5">Event</th>
                <th className="px-3 py-2.5">Summary</th>
                <th className="w-[9.5rem] px-3 py-2.5">Changed By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const open = openId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      tabIndex={0}
                      role="button"
                      aria-expanded={open}
                      aria-label={`${row.eventLabel}. ${open ? "Hide details" : "View details"}`}
                      className={cn(
                        "cursor-pointer border-t border-[#EEE6D8] text-[#251605] outline-none",
                        "hover:bg-[#F7F4EE]",
                        "focus-visible:bg-[#F7F4EE] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C89933]",
                        open && "bg-[#FAF8F4]",
                      )}
                      onClick={() => toggleRow(row.id, open)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        toggleRow(row.id, open);
                      }}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-[#5C5346]">
                        {dateTime(row.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              HISTORY_KIND_DOT[row.eventKind] ?? HISTORY_KIND_DOT.other,
                            )}
                            aria-hidden
                          />
                          {row.eventLabel}
                        </span>
                      </td>
                      <td className="truncate px-3 py-2 text-sm">{row.summary}</td>
                      <td className="px-3 py-2 text-sm text-[#5C5346]">{row.actor}</td>
                    </tr>
                    {open ? (
                      <tr className="bg-[#F7F4EE]">
                        <td colSpan={4} className="border-y border-[#EEE6D8] px-3 py-1.5">
                          {row.expand.facts.length > 0 ? (
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-[#251605]">
                              {row.expand.facts.map((fact, index) => (
                                <span key={`${fact.label}-${fact.value}`} className="inline-flex items-baseline gap-1">
                                  {index > 0 ? (
                                    <span className="mr-1 text-[#C4B8A6]" aria-hidden>
                                      |
                                    </span>
                                  ) : null}
                                  <span className="text-[#8A8175]">{fact.label}:</span>
                                  <span>{fact.value}</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {row.expand.relatedEvents.length > 0 ? (
                            <div className="mt-1">
                              <button
                                type="button"
                                className="text-[11px] text-[#8A641A] hover:underline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShowRelated((value) => !value);
                                }}
                              >
                                {showRelated ? "Hide related events" : "View related events"}
                              </button>
                              {showRelated ? (
                                <p className="mt-0.5 text-[11px] text-[#5C5346]">
                                  {row.expand.relatedEvents.join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {row.expand.technical.length > 0 || row.expand.nightlyRates.length > 0 ? (
                            <div className="mt-1">
                              <button
                                type="button"
                                className="text-[11px] text-[#8A8175] hover:underline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShowTechnical((value) => !value);
                                }}
                              >
                                Technical details
                              </button>
                              {showTechnical ? (
                                <div className="mt-1 font-mono text-[10px] leading-4 text-[#6B6256]">
                                  {row.expand.technical.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                  {row.expand.nightlyRates.map((line) => (
                                    <div key={line}>{line}</div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
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

function ReservationDetailActionBar({
  result,
  busy,
  onAction,
  gatedActions,
}: {
  result: ReservationActionResult;
  busy: boolean;
  onAction: (actionId: ReservationActionId) => void;
  gatedActions?: Partial<Record<ReservationActionId, string>>;
}) {
  const secondary = reservationDetailSecondaryActions(result);
  const primary = result.primaryAction;
  const menuActions = [
    ...(primary ? [primary] : []),
    ...secondary.filter((action) => action.id !== primary?.id),
  ];
  if (menuActions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Reservation actions"
          data-testid="reservation-detail-more-actions"
          className="rounded-md p-1.5 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[80]">
        {menuActions.map((action, index) => {
          const destructive = reservationDetailActionIsDestructive(action.id);
          const previous = menuActions[index - 1];
          const divider =
            destructive && previous != null && !reservationDetailActionIsDestructive(previous.id);
          return (
            <Fragment key={action.id}>
              {divider ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className={destructive ? "text-destructive" : undefined}
                disabled={busy || Boolean(gatedActions?.[action.id])}
                title={gatedActions?.[action.id]}
                data-testid={
                  primary?.id === action.id
                    ? "reservation-detail-primary"
                    : `reservation-detail-action-${action.id}`
                }
                onClick={() => onAction(action.id)}
              >
                <span className="flex flex-col items-start">
                  <span>{reservationDetailActionLabel(action)}</span>
                  {gatedActions?.[action.id] ? (
                    <span className="max-w-64 text-[11px] font-normal text-muted-foreground">
                      {gatedActions[action.id]}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const draftReservationId = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      draftReservationId.current = null;
      return;
    }
    if (draftReservationId.current === reservation.id) return;
    draftReservationId.current = reservation.id;
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
  const activeUnits = (reservation.rooms ?? []).filter(
    (unit) => unit.status !== "cancelled" && unit.status !== "no_show",
  );
  const multiRoom = activeUnits.length > 1;

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, reservation.roomTypeId, true],
    queryFn: () =>
      fetchPlans({ data: { restaurantId, roomTypeId: reservation.roomTypeId, activeOnly: true } }),
    enabled: canManage,
    retry: false,
  });

  const reprice = useMutation({
    mutationFn: () =>
      submitReprice({
        data: {
          restaurantId,
          reservationId: reservation.id,
          ratePlanId: planId,
          ...(activeUnits.length === 1 ? { reservationRoomId: activeUnits[0]!.id } : {}),
        },
      }),
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

      {canManage && multiRoom ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Rate plan changes apply to one room at a time on the Rates tab. The booking total rolls up
          from the room units.
        </p>
      ) : null}
      {canManage && !multiRoom ? (
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
