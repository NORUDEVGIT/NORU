import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import type { ReservationActionCapabilities } from "@/packages/pms/components/reservations/reservation-context-actions";
import { ReservationQuickViewPanel } from "@/packages/pms/components/reservations/reservation-quick-view";
import type { FolioDetail } from "@/packages/pms/lib/cashiering.functions";
import { stayNights } from "@/packages/pms/lib/folio-workspace";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/packages/pms/lib/reservation-dates";
import { getReservationQuickView } from "@/packages/pms/lib/reservation-workspace/quick-view.server";
import type {
  ReservationDeskRow,
  ReservationQuickView,
} from "@/packages/pms/lib/reservation-workspace/shared-read-models";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";

const READ_ONLY_RESERVATION_ACTIONS: ReservationActionCapabilities = {
  edit: false,
  create: false,
  cancel: false,
  assign: false,
  stayEdit: false,
  checkIn: false,
  checkOut: false,
  noShow: false,
  folio: false,
};

function reservationStatusOf(value: string | null | undefined): ReservationStatus {
  if (value && (RESERVATION_STATUSES as readonly string[]).includes(value)) {
    return value as ReservationStatus;
  }
  return "confirmed";
}

function deskRowFromFolio(folio: FolioDetail, quickView?: ReservationQuickView): ReservationDeskRow {
  const arrivalDate = quickView?.stay.arrivalDate ?? folio.arrivalDate ?? "";
  const departureDate = quickView?.stay.departureDate ?? folio.departureDate ?? arrivalDate;
  return {
    reservationId: quickView?.reservationId ?? folio.reservationId ?? "",
    confirmationNumber: quickView?.confirmationNumber ?? folio.confirmationNumber ?? "Reservation",
    arrivalDate,
    departureDate,
    nights: quickView?.stay.nights ?? stayNights(arrivalDate, departureDate) ?? 0,
    adults: quickView?.stay.adults ?? folio.adults ?? 0,
    children: quickView?.stay.children ?? folio.children ?? 0,
    status: quickView?.stay.status ?? reservationStatusOf(folio.reservationStatus),
    source: quickView?.stay.source ?? folio.bookingSource ?? "",
    roomTypeId: quickView?.room.roomTypeId ?? "",
    roomTypeName: quickView?.room.roomTypeName ?? folio.roomTypeName ?? "",
    roomId: quickView?.room.roomId ?? null,
    roomNumber: quickView?.room.roomNumber ?? folio.roomNumber,
    guestId: quickView?.identity.guestId ?? folio.guestId,
    guestName: quickView?.identity.guestName ?? folio.guestName,
    guestPhone: quickView?.identity.phone ?? folio.guestPhone,
    guestEmail: quickView?.identity.email ?? folio.guestEmail,
    guestVip: quickView?.identity.vip ?? Boolean(folio.guestVip),
    ratePlanId: quickView?.commercial.ratePlanId ?? folio.ratePlanId ?? null,
    ratePlanName: quickView?.commercial.ratePlanName ?? folio.ratePlanName ?? null,
    roomSubtotal: quickView?.commercial.roomSubtotal ?? null,
    currency: quickView?.commercial.currency ?? folio.currency,
    companyMasterId: quickView?.identity.company?.id ?? folio.companyMasterId,
    companyName: quickView?.identity.company?.name ?? null,
    travelAgentMasterId: quickView?.identity.travelAgent?.id ?? null,
    travelAgentName: quickView?.identity.travelAgent?.name ?? null,
    groupAccountMasterId: quickView?.identity.group?.id ?? folio.groupAccountMasterId,
    groupName: quickView?.identity.group?.name ?? null,
    commercialBookingSource:
      quickView?.commercial.commercialBookingSource ?? folio.bookingSource ?? null,
    marketSegment: quickView?.commercial.marketSegment ?? folio.marketSegment ?? null,
    externalReference: quickView?.commercial.externalReference ?? null,
    guaranteeMethod: quickView?.commercial.guaranteeMethod ?? folio.guaranteeMethod ?? null,
    specialRequests: quickView?.operational.specialRequests ?? null,
    notes: quickView?.operational.notes ?? null,
    createdAt: quickView?.generatedAt ?? folio.openedAt,
    updatedAt: quickView?.updatedAt ?? folio.openedAt,
    hints: {
      canOpen: true,
      canAssignRoom: false,
      canConfirm: false,
      canCancel: false,
      canCheckIn: false,
      canCheckOut: false,
    },
  };
}

export function FolioReservationQuickView({
  restaurantId,
  reservationId,
  folio,
  businessDate,
  onClose,
  onOpenFull,
}: {
  restaurantId: string;
  reservationId: string;
  folio: FolioDetail;
  businessDate: string;
  onClose: () => void;
  onOpenFull?: () => void;
}) {
  const fetchQuickView = useServerFn(getReservationQuickView);
  const query = useQuery({
    queryKey: ["reservation-quick-view", restaurantId, reservationId],
    queryFn: () => fetchQuickView({ data: { restaurantId, reservationId } }),
  });
  const quickView = query.data;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="folio-reservation-quick-view"
        className="z-[60] flex h-[min(85vh,860px)] w-[min(92vw,820px)] max-w-[820px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[820px]"
      >
        <DialogTitle className="sr-only">{folio.confirmationNumber ?? "Reservation"}</DialogTitle>
        <DialogDescription className="sr-only">{folio.guestName}</DialogDescription>
        <div className="min-h-0 flex-1 [&_aside]:h-full [&_aside]:min-h-0 [&_aside]:rounded-none [&_aside]:border-0 [&_aside]:shadow-none">
          <ReservationQuickViewPanel
            row={deskRowFromFolio(folio, quickView)}
            loading={query.isLoading}
            error={query.isError}
            errorDetail={query.error instanceof Error ? query.error.message : null}
            quickView={quickView}
            onRetry={() => void query.refetch()}
            businessDate={quickView?.businessDate ?? businessDate}
            canManage={false}
            capabilities={READ_ONLY_RESERVATION_ACTIONS}
            onAction={(actionId) => {
              if (actionId === "open") onOpenFull?.();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
