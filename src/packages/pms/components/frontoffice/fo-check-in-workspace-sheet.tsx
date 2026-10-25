import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { toast } from "sonner";

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
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { StayBadgeStrip } from "@/packages/pms/components/frontoffice/fo-stay-badges";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import {
  ReservationStatusBadge,
  formatStayDate,
} from "@/packages/pms/components/bookings/reservation-bits";
import { getReservationFolio } from "@/packages/pms/lib/cashiering.functions";
import {
  getReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import { getReservationCommercialAttribution } from "@/packages/pms/lib/revenue/commercial-package.functions";
import { getGuest, listGuestDocuments } from "@/packages/pms/lib/guests.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import {
  isPermissionDeniedMessage,
  stayQuickViewAmendItems,
  stayQuickViewCanAmend,
  stayQuickViewMenuItems,
  type StayQuickViewMenuItem,
} from "@/packages/pms/lib/front-office-shell";
import { liveStayBadges } from "@/packages/pms/lib/fo-rack-power";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { useMoney } from "@/core/state/property-format";
import { getAmendContext, setGuestRequestStatus } from "@/packages/pms/lib/fo-amendments.functions";
import { isStayCancellable } from "@/packages/pms/lib/fo-cancel-noshow";
import {
  FO_FEE_DEFAULTS_SECTION,
  FO_FEE_DEFAULTS_SETTINGS_HREF,
  requiredLabel,
} from "@/packages/pms/lib/fo-fee-defaults";
import { getFoFeeDefaults } from "@/packages/pms/lib/fo-fee-defaults.functions";
import { getFrontOfficeArrivalQuickView } from "@/packages/pms/lib/fo-arrival.functions";
import { GUARANTEE_HOLD_UNSUPPORTED } from "@/packages/pms/lib/fo-arrival";
import { ID_DOCUMENT_LABELS } from "@/packages/pms/lib/fo-check-in";
import {
  FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
  FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE,
  foBuildFolioPreviewDisplay,
  foCheckInWorkspaceProminentUnassigned,
  foDeriveReservationType,
  foGuestDisplayId,
  foGuestIdLooksLikeUuid,
  foGuaranteeStatusLabel,
  foOpensPreArrivalCheckInWorkspace,
  foPackageSummaryLabel,
  foStayInformationSourceLabel,
  foPickGuestIdentityDocumentPreview,
} from "@/packages/pms/lib/fo-check-in-workspace";
import { cashieringRefundHref } from "@/packages/pms/lib/fo-check-out";
import { VipBadge } from "@/packages/pms/components/guests/guest-bits";
import { cn } from "@/shared/lib/utils";
import type { SideSheetAction } from "@/packages/pms/components/frontoffice/reservation-side-sheet";

function OpCard({
  title,
  children,
  className,
  testId,
  prominent,
  actions,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  prominent?: boolean;
  actions?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-3 shadow-sm",
        prominent && "border-[#C89933]/50 ring-1 ring-[#C89933]/20",
        className,
      )}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {actions ? <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <dl className="space-y-1">{children}</dl>;
}

function GuaranteeStatusBadge({ label }: { label: string }) {
  if (label === "—") return <span>—</span>;
  const tone =
    label === "Guaranteed" || label === "Deposit posted"
      ? "text-emerald-700 bg-emerald-500/10"
      : label === "Deposit required"
        ? "text-[#8B6914] bg-[#C89933]/15"
        : "text-muted-foreground bg-muted/60";
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone)}
      data-testid="fo-ci-workspace-guarantee-status"
    >
      {label}
    </span>
  );
}

function DlRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function depositStateCopy(input: {
  depositRequired: boolean | null;
  depositRequiredAmount: number | null;
  depositPosted: number;
  depositWaived: boolean;
  money: (n: number) => string;
}): string {
  if (input.depositWaived) return "Waived";
  if (input.depositPosted > 0) return `Posted · ${input.money(input.depositPosted)}`;
  if (input.depositRequired === true) {
    return input.depositRequiredAmount != null
      ? `Required · ${input.money(input.depositRequiredAmount)}`
      : "Required";
  }
  if (input.depositRequired === false) return "Not required";
  return "—";
}

export function FoCheckInWorkspaceSheet({
  restaurantId,
  stay,
  open,
  hasOpenDiscrepancy = false,
  canOpenCashiering = false,
  onOpenChange,
  onAction,
  onContinueCheckIn,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  hasOpenDiscrepancy?: boolean;
  canOpenCashiering?: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: SideSheetAction, stay: FrontOfficeStay) => void;
  onContinueCheckIn: (stay: FrontOfficeStay) => void;
}) {
  const money = useMoney();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getReservation);
  const fetchFolio = useServerFn(getReservationFolio);
  const fetchAmend = useServerFn(getAmendContext);
  const fetchArrival = useServerFn(getFrontOfficeArrivalQuickView);
  const fetchFees = useServerFn(getFoFeeDefaults);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchGuest = useServerFn(getGuest);
  const fetchDocuments = useServerFn(listGuestDocuments);
  const fetchAssignable = useServerFn(listAssignableRooms);
  const fetchRoomTypes = useServerFn(getRoomTypeAvailability);
  const fetchSources = useServerFn(getPmsSet6Snapshot);
  const setRequestStatus = useServerFn(setGuestRequestStatus);
  const [feeOpen, setFeeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (open) return;
    setFeeOpen(false);
    setCancelOpen(false);
  }, [open]);

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, stay.id],
    queryFn: () => fetchDetail({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, stay.id],
    queryFn: () => fetchFolio({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  const amendQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchAmend({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  const arrivalQuery = useQuery({
    queryKey: ["fo-arrival-qv", restaurantId, stay.id],
    queryFn: () => fetchArrival({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  const feesQuery = useQuery({
    queryKey: ["fo-fee-defaults", restaurantId],
    queryFn: () => fetchFees({ data: { restaurantId } }),
    enabled: open && feeOpen,
    retry: false,
  });

  const commercialQuery = useQuery({
    queryKey: ["fo-ci-commercial", restaurantId, stay.id],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId: stay.id,
          roomSubtotal: detailQuery.data?.reservation?.roomSubtotal ?? null,
        },
      }),
    enabled: open && !!detailQuery.data?.reservation,
    retry: false,
  });

  const guestProfileGuestId = amendQuery.data?.primaryGuest.guestId ?? stay.guestId;

  const guestQuery = useQuery({
    queryKey: ["guest", restaurantId, guestProfileGuestId],
    queryFn: () => fetchGuest({ data: { restaurantId, guestId: guestProfileGuestId as string } }),
    enabled: open && Boolean(guestProfileGuestId),
    retry: false,
  });

  const documentsQuery = useQuery({
    queryKey: ["guest-documents", restaurantId, guestProfileGuestId],
    queryFn: () =>
      fetchDocuments({ data: { restaurantId, guestId: guestProfileGuestId as string } }),
    enabled: open && Boolean(guestProfileGuestId),
    retry: false,
  });

  const assignableQuery = useQuery({
    queryKey: [
      "front-office",
      "assignable",
      restaurantId,
      stay.id,
      stay.roomTypeId,
      stay.arrivalDate,
      stay.departureDate,
    ],
    queryFn: () =>
      fetchAssignable({
        data: {
          restaurantId,
          roomTypeId: stay.roomTypeId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.id,
        },
      }),
    enabled: open && Boolean(stay.roomTypeId),
    retry: false,
  });

  const sourcesQuery = useQuery({
    queryKey: ["pms-set6", restaurantId, "fo-check-in-workspace"],
    queryFn: () => fetchSources({ data: { restaurantId } }),
    enabled: open,
    retry: false,
  });

  const roomTypesQuery = useQuery({
    queryKey: [
      "room-type-availability",
      restaurantId,
      stay.arrivalDate,
      stay.departureDate,
      stay.id,
    ],
    queryFn: () =>
      fetchRoomTypes({
        data: {
          restaurantId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.id,
        },
      }),
    enabled: open,
    retry: false,
  });

  const toggleRequest = useMutation({
    mutationFn: (input: { requestId: string; status: "open" | "done" }) =>
      setRequestStatus({
        data: { restaurantId, requestId: input.requestId, status: input.status },
      }),
    onSuccess: () => {
      toast.success("Guest request updated.");
      void queryClient.invalidateQueries({ queryKey: ["fo-amend"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Something went wrong."),
  });

  const reservation = detailQuery.data?.reservation;
  const arrival = arrivalQuery.data;
  const folioDenied = folioQuery.isError && isPermissionDeniedMessage(folioQuery.error);
  const menuItems = stayQuickViewMenuItems({ status: stay.status, assigned: Boolean(stay.roomId) });
  const amendItems = stayQuickViewAmendItems(stay.status);
  const reservationType = foDeriveReservationType(reservation);
  const prominentUnassigned = foCheckInWorkspaceProminentUnassigned(stay);
  const guestDisplayId = foGuestDisplayId(guestQuery.data?.guest.profileNumber);
  const packageAttributions = commercialQuery.data?.packages ?? [];
  const packageLabel = foPackageSummaryLabel(packageAttributions) ?? "—";

  const guaranteeMethod =
    reservation?.guaranteeMethod ??
    arrival?.financial.guaranteeMethod ??
    stay.guaranteeMethod ??
    null;

  const guaranteeStatus = foGuaranteeStatusLabel({
    guaranteeMethod,
    depositRequired: arrival?.financial.depositRequired ?? null,
    depositPosted: arrival?.financial.depositPosted ?? 0,
    depositWaived: arrival?.financial.depositWaived ?? false,
  });

  const folioNumber = folioQuery.data?.folioNumber ?? arrival?.financial.folioNumber ?? null;
  const folioBalance = folioQuery.data?.balance ?? null;

  const folioPreview = foBuildFolioPreviewDisplay({
    money,
    roomSubtotal: reservation?.roomSubtotal ?? null,
    packages: packageAttributions,
    packagesSubtotal: commercialQuery.data?.packagesSubtotal ?? null,
    grandCommercialSubtotal: commercialQuery.data?.grandCommercialSubtotal ?? null,
    folioBalance,
  });

  const assignedRoomMeta = stay.roomId
    ? assignableQuery.data?.find((room) => room.id === stay.roomId)
    : undefined;
  const roomTypeCover =
    roomTypesQuery.data?.find((type) => type.roomTypeId === stay.roomTypeId)?.coverUrl ?? null;

  const identityPreview = foPickGuestIdentityDocumentPreview(documentsQuery.data?.documents ?? []);

  const reservationSource = foStayInformationSourceLabel(
    reservation?.source ?? stay.source ?? null,
    reservation?.commercialBookingSource ?? null,
    sourcesQuery.data?.snapshot.sourceCodes,
  );

  const specialRequestText =
    stay.specialRequests?.trim() || reservation?.specialRequests?.trim() || null;

  function openViewFolio() {
    if (!canOpenCashiering) {
      toast.message("Cashiering access is required to open folios.");
      return;
    }
    onOpenChange(false);
    if (folioNumber) {
      void navigate({ to: cashieringRefundHref(folioNumber) });
      return;
    }
    void navigate({ to: "/restaurant/pms/cashiering", search: { tab: "folios" } });
  }

  function onStayMenu(action: StayQuickViewMenuItem) {
    if (action.id === "cancel_fees") {
      setFeeOpen((v) => !v);
      return;
    }
    if (action.id === "view_folio") {
      openViewFolio();
      return;
    }
    onAction(action.id as SideSheetAction, stay);
  }

  const roomNumber = stay.roomNumber ?? reservation?.roomNumber ?? arrival?.room.roomNumber ?? null;
  const roomAssigned = Boolean(stay.roomId || reservation?.roomId);
  const headerCheckIn = menuItems.some((item) => item.id === "check_in");
  const headerAssign = !roomAssigned && menuItems.some((item) => item.id === "assign");
  const headerChangeRoom = roomAssigned && foOpensPreArrivalCheckInWorkspace(stay);
  const secondaryItems = menuItems.filter((item) => item.id !== "check_in" && item.id !== "assign");
  const assignmentRequired = stay.status === "confirmed" && !roomAssigned;
  const roomStatus =
    arrival?.room.status ??
    reservation?.roomOperationalStatus ??
    amendQuery.data?.currentRoom?.status ??
    null;
  const housekeepingStatus =
    arrival?.room.housekeepingStatus ??
    reservation?.housekeepingStatus ??
    amendQuery.data?.currentRoom?.housekeepingStatus ??
    null;

  const rateLabel = reservation?.roomSubtotal != null ? money(reservation.roomSubtotal) : "—";

  const idType = arrival?.guest.idDocumentType;
  const idLabel = idType ? ID_DOCUMENT_LABELS[idType] : "—";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            "flex h-dvh w-full flex-col gap-0 overflow-hidden p-0",
            FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
          )}
          data-testid="fo-check-in-workspace"
        >
          <SheetHeader
            className="shrink-0 space-y-2 border-b border-border py-4 pl-5 pr-12 text-left"
            data-testid="fo-ci-workspace-header"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <SheetTitle className="font-display text-xl">{stay.guestName}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{stay.confirmationNumber}</span>
                  <ReservationStatusBadge status={stay.status} />
                  {roomAssigned ? (
                    roomNumber ? (
                      <span
                        className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
                        data-testid="fo-ci-workspace-assigned-room"
                      >
                        Room {roomNumber}
                      </span>
                    ) : null
                  ) : (
                    <span
                      className="inline-flex rounded-full bg-[#C89933]/15 px-2 py-0.5 text-xs font-semibold text-[#8B6914]"
                      data-testid="fo-ci-workspace-unassigned"
                    >
                      Unassigned
                    </span>
                  )}
                </SheetDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {headerAssign ? (
                  <Button
                    size="sm"
                    className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    onClick={() => onAction("assign", stay)}
                    data-testid="fo-ci-workspace-assign-room"
                  >
                    Assign Room
                  </Button>
                ) : null}
                {headerCheckIn ? (
                  <Button
                    size="sm"
                    variant={headerAssign ? "outline" : "default"}
                    className={
                      headerAssign ? undefined : "bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                    }
                    onClick={() => onContinueCheckIn(stay)}
                    data-testid="fo-ci-workspace-check-in"
                  >
                    Check In
                  </Button>
                ) : null}
                {headerChangeRoom ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onAction("assign", stay)}
                    data-testid="fo-ci-workspace-change-room"
                  >
                    Change Room
                  </Button>
                ) : null}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" data-testid="fo-ci-workspace-menu">
                      More actions
                      <ChevronDown className="ml-1 size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {stayQuickViewCanAmend(stay.status) ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Amend Stay</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {amendItems.map((item) => (
                            <DropdownMenuItem key={item.id} onSelect={() => onStayMenu(item)}>
                              {item.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    {stayQuickViewCanAmend(stay.status) && secondaryItems.length > 0 ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {secondaryItems.map((item) => (
                      <DropdownMenuItem key={item.id} onSelect={() => onStayMenu(item)}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <StayBadgeStrip
              badges={liveStayBadges({
                guestVip: stay.guestVip,
                source: reservation?.source ?? stay.source ?? null,
                specialRequests: stay.specialRequests,
                hasOpenDiscrepancy,
              })}
              mode="compact"
            />
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {assignmentRequired ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
                data-testid="fo-ci-workspace-assignment-required"
              >
                <AlertTriangle className="size-4 shrink-0" />
                Room assignment required
              </div>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              <OpCard title="Stay Information" testId="fo-ci-workspace-stay-information">
                <FieldGroup>
                  <DlRow label="Arrival" value={formatStayDate(stay.arrivalDate)} />
                  <DlRow label="Departure" value={formatStayDate(stay.departureDate)} />
                  <DlRow label="Nights" value={String(stay.nights)} />
                  <DlRow
                    label="Adults / Children"
                    value={`${stay.adults} / ${stay.children ?? 0}`}
                  />
                  <DlRow label="Room Type" value={stay.roomTypeName} />
                  <DlRow label="Rate Plan" value={reservation?.ratePlanName ?? "—"} />
                  <DlRow label="Rate" value={rateLabel} />
                  <DlRow
                    label="Package"
                    value={<span data-testid="fo-ci-workspace-package">{packageLabel}</span>}
                  />
                  <DlRow label="Source" value={reservationSource} />
                  <DlRow label="Reservation Type" value={reservationType ?? "—"} />
                </FieldGroup>
              </OpCard>

              <OpCard title="Guest Information" testId="fo-ci-workspace-guest">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
                  <FieldGroup>
                    <div className="flex items-center gap-2 pb-1">
                      <p className="font-display text-base font-semibold">{stay.guestName}</p>
                      {stay.guestVip || guestQuery.data?.guest.vipStatus ? <VipBadge /> : null}
                    </div>
                    {guestDisplayId ? (
                      <DlRow label="Guest ID" value={guestDisplayId} />
                    ) : foGuestIdLooksLikeUuid(guestProfileGuestId) ? (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid="fo-ci-workspace-guest-id-omitted"
                      >
                        Guest profile number is not assigned yet.
                      </p>
                    ) : null}
                    <DlRow label="Phone" value={arrival?.guest.phone ?? stay.guestPhone ?? "—"} />
                    <DlRow label="Email" value={arrival?.guest.email ?? "—"} />
                    <DlRow label="Nationality" value={arrival?.guest.nationality ?? "—"} />
                    <DlRow label="Company" value={reservation?.companyName ?? "—"} />
                    <DlRow label="ID Type" value={idLabel} />
                    <DlRow label="ID Number" value={arrival?.guest.idDocumentNumber ?? "—"} />
                    <DlRow
                      label="Date of Birth"
                      value={
                        amendQuery.data?.primaryGuest.dateOfBirth
                          ? formatStayDate(amendQuery.data.primaryGuest.dateOfBirth)
                          : "—"
                      }
                    />
                    <DlRow
                      label="Address"
                      value={[arrival?.guest.addressLine1].filter(Boolean).join(", ") || "—"}
                    />
                  </FieldGroup>
                  <div
                    className="flex flex-col items-center justify-start gap-1"
                    data-testid="fo-ci-workspace-identity-image"
                  >
                    {identityPreview.url ? (
                      <>
                        <img
                          src={identityPreview.url}
                          alt=""
                          className="aspect-[3/4] w-full max-w-[5.5rem] rounded-md border border-border object-cover"
                        />
                        {identityPreview.verificationStatus === "verified" ? (
                          <p className="text-center text-[10px] font-medium text-emerald-700">
                            Verified on file
                          </p>
                        ) : (
                          <p className="text-center text-[10px] text-muted-foreground">On file</p>
                        )}
                      </>
                    ) : (
                      <p className="text-center text-[10px] text-muted-foreground">
                        No identity document image available
                      </p>
                    )}
                  </div>
                </div>
              </OpCard>

              <OpCard
                title="Room Assignment"
                testId="fo-ci-workspace-room-assignment"
                prominent={prominentUnassigned}
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem]">
                  <FieldGroup>
                    <DlRow
                      label="Room Number"
                      value={
                        <span data-testid="fo-ci-workspace-room-number">
                          {roomNumber ?? (prominentUnassigned ? "Unassigned" : "—")}
                        </span>
                      }
                    />
                    <DlRow label="Room Type" value={stay.roomTypeName} />
                    <DlRow
                      label="Building"
                      value={
                        <span data-testid="fo-ci-workspace-room-building">
                          {assignedRoomMeta?.building ?? "—"}
                        </span>
                      }
                    />
                    <DlRow
                      label="Floor"
                      value={
                        <span data-testid="fo-ci-workspace-room-floor">
                          {assignedRoomMeta?.floor ?? "—"}
                        </span>
                      }
                    />
                    <DlRow
                      label="Room Status"
                      value={
                        <span data-testid="fo-ci-workspace-room-status">{roomStatus ?? "—"}</span>
                      }
                    />
                    <DlRow
                      label="Housekeeping"
                      value={
                        <span data-testid="fo-ci-workspace-room-housekeeping">
                          {housekeepingStatus ?? "—"}
                        </span>
                      }
                    />
                  </FieldGroup>
                  <div
                    className="flex flex-col items-center gap-1"
                    data-testid="fo-ci-workspace-room-cover"
                  >
                    {roomTypeCover ? (
                      <img
                        src={roomTypeCover}
                        alt=""
                        className="aspect-[4/3] w-full rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-2 text-center text-[10px] text-muted-foreground">
                        No room type image
                      </div>
                    )}
                  </div>
                </div>
                {arrival?.room.assigned &&
                arrival.room.ready === false &&
                arrival.room.readyReason ? (
                  <p className="mt-2 text-xs text-muted-foreground">{arrival.room.readyReason}</p>
                ) : null}
              </OpCard>

              <OpCard title="Financial Overview" testId="fo-ci-workspace-financial">
                {folioDenied ? (
                  <PermissionDeniedPanel
                    className="border-0 p-0"
                    message="You don't have access to folios for this property."
                  />
                ) : (
                  <FieldGroup>
                    {folioNumber ? <DlRow label="Folio No." value={folioNumber} /> : null}
                    <DlRow label="Room Charge" value={folioPreview.roomCharge ?? "—"} />
                    <DlRow label="Package" value={folioPreview.packageLine ?? "—"} />
                    <DlRow label="Taxes & Service" value={folioPreview.taxesAndService ?? "—"} />
                    <DlRow label="Estimated Total" value={folioPreview.estimatedTotal ?? "—"} />
                    {folioPreview.folioBalance ? (
                      <DlRow label="Folio Balance" value={folioPreview.folioBalance} />
                    ) : null}
                  </FieldGroup>
                )}
                <div className="mt-2 border-t border-border pt-2">
                  <FieldGroup>
                    <DlRow label="Guarantee Type" value={guaranteeMethod?.trim() || "—"} />
                    <DlRow
                      label="Guarantee Status"
                      value={<GuaranteeStatusBadge label={guaranteeStatus} />}
                    />
                    <DlRow
                      label="Deposit"
                      value={
                        arrival
                          ? depositStateCopy({
                              depositRequired: arrival.financial.depositRequired,
                              depositRequiredAmount: arrival.financial.depositRequiredAmount,
                              depositPosted: arrival.financial.depositPosted,
                              depositWaived: arrival.financial.depositWaived,
                              money,
                            })
                          : "—"
                      }
                    />
                    {arrival?.financial.depositMethod ? (
                      <DlRow label="Tender on file" value={arrival.financial.depositMethod} />
                    ) : null}
                  </FieldGroup>
                </div>
                <p
                  className="mt-2 text-[10px] leading-snug text-muted-foreground"
                  data-testid="fo-ci-workspace-card-auth"
                >
                  Card authorization: Not supported. {GUARANTEE_HOLD_UNSUPPORTED}{" "}
                  {FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE}
                </p>
              </OpCard>

              <OpCard title="Special Requests" testId="fo-ci-workspace-special-requests">
                {specialRequestText || (amendQuery.data?.guestRequests ?? []).length > 0 ? (
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {specialRequestText ? <li>{specialRequestText}</li> : null}
                    {(amendQuery.data?.guestRequests ?? []).map((row) => (
                      <li key={row.id} className="flex items-start justify-between gap-2">
                        <span>{row.requestText}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-xs"
                          onClick={() =>
                            toggleRequest.mutate({
                              requestId: row.id,
                              status: row.status === "open" ? "done" : "open",
                            })
                          }
                        >
                          {row.status === "open" ? "Done" : "Reopen"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No special requests.</p>
                )}
              </OpCard>

              <OpCard title="Internal Notes" testId="fo-ci-workspace-notes">
                {reservation?.notes ? (
                  <p className="whitespace-pre-wrap text-sm">{reservation.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No internal notes.</p>
                )}
              </OpCard>
            </div>

            {feeOpen ? (
              <OpCard title={FO_FEE_DEFAULTS_SECTION} testId="fo-cancel-fee-summary">
                {feesQuery.isError && isPermissionDeniedMessage(feesQuery.error) ? (
                  <PermissionDeniedPanel
                    className="border-0 p-0"
                    message="You don't have access to cancel and no-show fee defaults for this property."
                  />
                ) : feesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading fee policy…</p>
                ) : feesQuery.data ? (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Cancel fee</dt>
                      <dd>
                        {requiredLabel(feesQuery.data.defaults.cancelFeeRequired)} ·{" "}
                        {money(feesQuery.data.defaults.cancelFeeDefault)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">No-show charge</dt>
                      <dd>
                        {requiredLabel(feesQuery.data.defaults.noshowFeeRequired)} ·{" "}
                        {money(feesQuery.data.defaults.noshowFeeDefault)}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {feesQuery.data?.canEdit ? (
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <a href={FO_FEE_DEFAULTS_SETTINGS_HREF}>Settings</a>
                  </Button>
                ) : null}
                {isStayCancellable(stay.status) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel reservation
                  </Button>
                ) : null}
              </OpCard>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      {cancelOpen ? (
        <FoCancelStepper
          restaurantId={restaurantId}
          stay={stay}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
        />
      ) : null}
    </>
  );
}
