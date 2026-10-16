import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
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
import { sourceLabel } from "@/packages/pms/lib/reservation-detail-overview";
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
  FO_CHECK_IN_WORKSPACE_MAIN_GRID_CLASS,
  FO_CHECK_IN_WORKSPACE_SHEET_MAX_CLASS,
  FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE,
  foBuildFolioPreviewDisplay,
  foCheckInWorkspaceContinueLabel,
  foCheckInWorkspaceProminentUnassigned,
  foCheckInWorkspaceRoomLabel,
  foDeriveReservationType,
  foGuestDisplayId,
  foGuestIdLooksLikeUuid,
  foGuaranteeStatusLabel,
  foPackageSummaryLabel,
  foPickGuestIdentityDocumentPreview,
} from "@/packages/pms/lib/fo-check-in-workspace";
import { cashieringRefundHref } from "@/packages/pms/lib/fo-check-out";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
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

function TwoColFields({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
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

function StayDetailTile({
  label,
  value,
  editable,
  onEdit,
}: {
  label: string;
  value: ReactNode;
  editable?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-sm font-medium",
          editable && "border-dashed",
        )}
      >
        {value}
      </div>
      {editable && onEdit ? (
        <button
          type="button"
          className="text-xs font-medium text-[#8B6914] hover:underline"
          onClick={onEdit}
        >
          Edit
        </button>
      ) : null}
    </div>
  );
}

function DlRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2 text-sm">
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

  const reservationSource = sourceLabel(
    reservation?.source ?? stay.source ?? null,
    reservation?.commercialBookingSource ?? null,
  );

  const specialRequestText =
    stay.specialRequests?.trim() || reservation?.specialRequests?.trim() || null;

  function onStayMenu(action: StayQuickViewMenuItem) {
    if (action.id === "cancel_fees") {
      setFeeOpen((v) => !v);
      return;
    }
    onAction(action.id as SideSheetAction, stay);
  }

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

  const rateLabel =
    reservation?.roomSubtotal != null && reservation.currency
      ? money(reservation.roomSubtotal)
      : reservation?.roomSubtotal != null
        ? money(reservation.roomSubtotal)
        : "—";

  const idType = arrival?.guest.idDocumentType;
  const idLabel = idType ? ID_DOCUMENT_LABELS[idType] : "—";

  const reservationCardActions = (
    <>
      <Button size="sm" variant="outline" asChild data-testid="fo-ci-workspace-view-reservation">
        <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: stay.id }}>
          View Reservation
        </Link>
      </Button>
      <Button size="sm" variant="outline" asChild data-testid="fo-ci-workspace-edit-reservation">
        <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: stay.id }}>
          Edit Reservation
        </Link>
      </Button>
    </>
  );

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
          <SheetHeader className="shrink-0 space-y-2 border-b border-border px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <SheetTitle className="font-display text-xl">{stay.guestName}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{stay.confirmationNumber}</span>
                  <span aria-hidden>·</span>
                  <ReservationStatusBadge status={stay.status} />
                  <span aria-hidden>·</span>
                  <span
                    className={prominentUnassigned ? "font-semibold text-[#C89933]" : undefined}
                  >
                    {foCheckInWorkspaceRoomLabel(stay)}
                  </span>
                </SheetDescription>
                <p className="text-xs text-muted-foreground">
                  {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)} ·{" "}
                  {stay.roomTypeName} · {stay.nights} night{stay.nights === 1 ? "" : "s"} ·{" "}
                  {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                  {stay.children
                    ? ` · ${stay.children} child${stay.children === 1 ? "" : "ren"}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                  asChild
                  data-testid="fo-ci-workspace-open-reservation"
                >
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: stay.id }}
                  >
                    Open Reservation
                  </Link>
                </Button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Stay actions"
                      data-testid="fo-ci-workspace-menu"
                    >
                      <MoreHorizontal className="size-4" />
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
                    {stayQuickViewCanAmend(stay.status) && menuItems.length > 0 ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {menuItems.map((item) => (
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className={cn("grid gap-4", FO_CHECK_IN_WORKSPACE_MAIN_GRID_CLASS)}>
              <div className="space-y-4">
                <OpCard
                  title="Reservation Information"
                  testId="fo-ci-workspace-reservation"
                  actions={reservationCardActions}
                >
                  <TwoColFields>
                    <FieldGroup>
                      <DlRow label="Reservation No." value={stay.confirmationNumber} />
                      <DlRow label="Source" value={reservationSource} />
                      <DlRow label="Reservation Type" value={reservationType ?? "—"} />
                      <DlRow label="Guarantee Type" value={guaranteeMethod?.trim() || "—"} />
                      <DlRow
                        label="Guarantee Status"
                        value={<GuaranteeStatusBadge label={guaranteeStatus} />}
                      />
                      <DlRow label="Special Requests" value={specialRequestText ?? "—"} />
                    </FieldGroup>
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
                    </FieldGroup>
                  </TwoColFields>
                </OpCard>

                <OpCard
                  title="Guest Information"
                  testId="fo-ci-workspace-guest"
                  actions={
                    guestProfileGuestId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        data-testid="fo-ci-workspace-edit-guest"
                      >
                        <Link
                          to={GUEST_PROFILE_DETAIL_PATH}
                          params={{ guestId: guestProfileGuestId }}
                          search={guestProfileSearch({ card: "identity" })}
                        >
                          Edit
                        </Link>
                      </Button>
                    ) : null
                  }
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem]">
                    <FieldGroup>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Profile
                      </p>
                      <div className="mt-1 flex items-center gap-2">
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
                      <DlRow label="Nationality" value={arrival?.guest.nationality ?? "—"} />
                      <DlRow label="Phone" value={arrival?.guest.phone ?? stay.guestPhone ?? "—"} />
                      <DlRow label="Email" value={arrival?.guest.email ?? "—"} />
                      <DlRow label="Company" value={reservation?.companyName ?? "—"} />
                    </FieldGroup>
                    <FieldGroup>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Identity
                      </p>
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
                      className="flex flex-col items-center justify-start gap-1.5"
                      data-testid="fo-ci-workspace-identity-image"
                    >
                      {identityPreview.url ? (
                        <>
                          <img
                            src={identityPreview.url}
                            alt=""
                            className="aspect-[3/4] w-full max-w-[7.5rem] rounded-md border border-border object-cover"
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
                        <p className="text-center text-xs text-muted-foreground">
                          No identity document image available
                        </p>
                      )}
                    </div>
                  </div>
                  {guestProfileGuestId ? (
                    <Button
                      size="sm"
                      variant="link"
                      className="mt-2 h-auto p-0 text-[#8B6914]"
                      asChild
                      data-testid="fo-ci-workspace-view-profile"
                    >
                      <Link
                        to={GUEST_PROFILE_DETAIL_PATH}
                        params={{ guestId: guestProfileGuestId }}
                      >
                        View Profile
                      </Link>
                    </Button>
                  ) : null}
                </OpCard>

                <OpCard
                  title="Stay Details"
                  testId="fo-ci-workspace-stay-details"
                  actions={
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/restaurant/pms/reservations/$reservationId"
                        params={{ reservationId: stay.id }}
                      >
                        Edit in Reservation
                      </Link>
                    </Button>
                  }
                >
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <StayDetailTile
                      label="Arrival Date"
                      value={formatStayDate(stay.arrivalDate)}
                      editable
                      onEdit={() => onAction("extend_stay", stay)}
                    />
                    <StayDetailTile
                      label="Departure Date"
                      value={formatStayDate(stay.departureDate)}
                      editable
                      onEdit={() => onAction("extend_stay", stay)}
                    />
                    <StayDetailTile label="Nights" value={String(stay.nights)} />
                    <StayDetailTile
                      label="Adults"
                      value={String(stay.adults)}
                      editable
                      onEdit={() => onAction("add_remove_guest", stay)}
                    />
                    <StayDetailTile
                      label="Children"
                      value={String(stay.children ?? 0)}
                      editable
                      onEdit={() => onAction("add_remove_guest", stay)}
                    />
                    <StayDetailTile
                      label="Room Type"
                      value={stay.roomTypeName}
                      editable
                      onEdit={() => onAction("upgrade_downgrade", stay)}
                    />
                    <StayDetailTile label="Rate Plan" value={reservation?.ratePlanName ?? "—"} />
                    <StayDetailTile label="Rate" value={rateLabel} />
                    <StayDetailTile label="Package" value={packageLabel} />
                  </div>
                </OpCard>

                <OpCard
                  title="Room Assignment"
                  testId="fo-ci-workspace-room-assignment"
                  prominent={prominentUnassigned}
                  actions={
                    stay.roomId ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => onAction("assign", stay)}
                        >
                          Find Another Room
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => onAction("assign", stay)}
                        >
                          Change Room
                        </Button>
                      </>
                    ) : null
                  }
                >
                  {prominentUnassigned ? (
                    <p
                      className="mb-2 text-sm font-medium text-[#C89933]"
                      data-testid="fo-ci-workspace-unassigned"
                    >
                      Unassigned — assign a room before check-in.
                    </p>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8.5rem]">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm md:grid-cols-3">
                      <DlRow
                        label="Room Number"
                        value={stay.roomNumber ?? (prominentUnassigned ? "Unassigned" : "—")}
                      />
                      <DlRow label="Room Type" value={stay.roomTypeName} />
                      <DlRow label="Building" value={assignedRoomMeta?.building ?? "—"} />
                      <DlRow label="Floor" value={assignedRoomMeta?.floor ?? "—"} />
                      <DlRow
                        label="Room Status"
                        value={
                          arrival?.room.status ??
                          reservation?.roomOperationalStatus ??
                          amendQuery.data?.currentRoom?.status ??
                          "—"
                        }
                      />
                      <DlRow
                        label="Housekeeping"
                        value={
                          arrival?.room.housekeepingStatus ??
                          reservation?.housekeepingStatus ??
                          amendQuery.data?.currentRoom?.housekeepingStatus ??
                          "—"
                        }
                      />
                    </div>
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
                  {!stay.roomId ? (
                    <Button
                      size="sm"
                      className="mt-3 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                      onClick={() => onAction("assign", stay)}
                      data-testid="fo-ci-workspace-assign-room"
                    >
                      Assign Room
                    </Button>
                  ) : null}
                </OpCard>
              </div>

              <div className="space-y-4">
                <OpCard
                  title="Folio Preview"
                  testId="fo-ci-workspace-folio"
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={openViewFolio}
                      data-testid="fo-ci-workspace-view-folio"
                    >
                      View Folio
                    </Button>
                  }
                >
                  {folioDenied ? (
                    <PermissionDeniedPanel
                      className="border-0 p-0"
                      message="You don't have access to folios for this property."
                    />
                  ) : (
                    <dl className="space-y-1.5">
                      {folioNumber ? <DlRow label="Folio No." value={folioNumber} /> : null}
                      <DlRow label="Room Charge" value={folioPreview.roomCharge ?? "—"} />
                      <DlRow label="Package" value={folioPreview.packageLine ?? "—"} />
                      <DlRow
                        label="Taxes & Service Charge"
                        value={
                          folioPreview.taxesAndService ?? (
                            <span className="text-xs font-normal text-muted-foreground">—</span>
                          )
                        }
                      />
                      <DlRow
                        label="Estimated Total"
                        value={
                          folioPreview.estimatedTotal ?? (
                            <span className="text-xs font-normal text-muted-foreground">—</span>
                          )
                        }
                      />
                      {folioPreview.folioBalance ? (
                        <DlRow label="Folio balance" value={folioPreview.folioBalance} />
                      ) : null}
                    </dl>
                  )}
                  <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                    {FO_FOLIO_PREVIEW_TAXES_UNAVAILABLE}
                  </p>
                </OpCard>

                <OpCard title="Payment / Guarantee" testId="fo-ci-workspace-payment">
                  <dl className="space-y-1.5">
                    <DlRow label="Guarantee Type" value={guaranteeMethod?.trim() || "—"} />
                    <DlRow
                      label="Guarantee Status"
                      value={<GuaranteeStatusBadge label={guaranteeStatus} />}
                    />
                    <DlRow
                      label="Deposit requirement"
                      value={
                        arrival?.financial.depositRequired === true
                          ? arrival.financial.depositRequiredAmount != null
                            ? money(arrival.financial.depositRequiredAmount)
                            : "Required"
                          : arrival?.financial.depositRequired === false
                            ? "Not required"
                            : "—"
                      }
                    />
                    <DlRow
                      label="Deposit posted / waived"
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
                  </dl>
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    data-testid="fo-ci-workspace-card-auth"
                  >
                    Card authorization: Not supported. {GUARANTEE_HOLD_UNSUPPORTED}
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

                <OpCard
                  title="Internal Notes"
                  testId="fo-ci-workspace-notes"
                  actions={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onAction("amend_notes", stay)}
                    >
                      Edit Notes
                    </Button>
                  }
                >
                  {reservation?.notes ? (
                    <p className="whitespace-pre-wrap text-sm">{reservation.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">No internal notes.</p>
                  )}
                </OpCard>

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
            </div>
          </div>

          <footer
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-5 py-3"
            data-testid="fo-ci-workspace-footer"
          >
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <div className="flex flex-wrap gap-2">
              {menuItems.some((item) => item.id === "check_in") ? (
                <Button
                  className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                  onClick={() => onContinueCheckIn(stay)}
                  data-testid="fo-ci-workspace-continue"
                >
                  {foCheckInWorkspaceContinueLabel(stay)}
                </Button>
              ) : null}
            </div>
          </footer>
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
