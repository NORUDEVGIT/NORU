import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { ComingSoonButton, ComingSoonChip, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { getReservationFolio } from "@/packages/pms/lib/cashiering.functions";
import { getReservation } from "@/packages/pms/lib/reservations.functions";
import {
  RESERVED_BADGE_SLOTS,
  actionsForMenu,
  handleReservationBarDrop,
  isPermissionDeniedMessage,
  type FoActionDef,
} from "@/packages/pms/lib/front-office-shell";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { SPECIAL_REQUEST_CATEGORY_LABELS } from "@/packages/pms/lib/fo-amendments";
import { getAmendContext, setGuestRequestStatus } from "@/packages/pms/lib/fo-amendments.functions";

export type SideSheetAction =
  | "view"
  | "assign"
  | "room_move"
  | "extend_stay"
  | "check_in"
  | "check_out"
  | "no_show"
  | "amend_notes"
  | "upgrade_downgrade"
  | "add_remove_guest"
  | "add_service"
  | "add_special_request"
  | "guest_request"
  | "view_folio";

export function ReservationSideSheet({
  restaurantId,
  stay,
  open,
  onOpenChange,
  onAction,
}: {
  restaurantId: string;
  stay: FrontOfficeStay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: SideSheetAction, stay: FrontOfficeStay) => void;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchDetail = useServerFn(getReservation);
  const fetchFolio = useServerFn(getReservationFolio);
  const fetchAmend = useServerFn(getAmendContext);
  const setRequestStatus = useServerFn(setGuestRequestStatus);

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, stay?.id],
    queryFn: () => fetchDetail({ data: { restaurantId, reservationId: stay!.id } }),
    enabled: open && !!stay,
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, stay?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, reservationId: stay!.id } }),
    enabled: open && !!stay,
    retry: false,
  });

  const amendQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay?.id],
    queryFn: () => fetchAmend({ data: { restaurantId, reservationId: stay!.id } }),
    enabled: open && !!stay,
    retry: false,
  });

  const toggleRequest = useMutation({
    mutationFn: (input: { requestId: string; status: "open" | "done" }) =>
      setRequestStatus({ data: { restaurantId, requestId: input.requestId, status: input.status } }),
    onSuccess: () => {
      toast.success("Guest request updated.");
      void queryClient.invalidateQueries({ queryKey: ["fo-amend"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-amendments"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Something went wrong."),
  });

  if (!stay) return null;

  const actions = actionsForMenu("sheet");
  const reservation = detailQuery.data?.reservation;
  const folioDenied = folioQuery.isError && isPermissionDeniedMessage(folioQuery.error);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="fo-reservation-sheet">
        <SheetHeader>
          <SheetTitle>{stay.guestName}</SheetTitle>
          <SheetDescription>
            {stay.confirmationNumber} · {stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ReservationStatusBadge status={stay.status} />
            {stay.overstay ? (
              <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
                Overstay
              </span>
            ) : null}
            {RESERVED_BADGE_SLOTS.map((slot) => (
              <ComingSoonChip key={slot.id} label={slot.label} />
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
              <dd>
                {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room type</dt>
              <dd>{stay.roomTypeName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guests</dt>
              <dd>
                {stay.adults} adult{stay.adults === 1 ? "" : "s"}
                {stay.children ? ` · ${stay.children} child` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Phone</dt>
              <dd>{stay.guestPhone ?? "—"}</dd>
            </div>
          </dl>

          {reservation?.notes ? <p className="text-sm text-muted-foreground">Notes: {reservation.notes}</p> : null}
          {stay.specialRequests || amendQuery.data?.specialRequestCategory ? (
            <p className="text-sm text-muted-foreground">
              Special request
              {amendQuery.data?.specialRequestCategory
                ? ` · ${SPECIAL_REQUEST_CATEGORY_LABELS[amendQuery.data.specialRequestCategory]}`
                : ""}
              : {stay.specialRequests ?? amendQuery.data?.stay.specialRequests ?? "—"}
            </p>
          ) : null}

          <div className="rounded-xl border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Guest requests</p>
            {amendQuery.data?.guestRequestsError ? (
              <p className="mt-2 text-sm text-destructive">{amendQuery.data.guestRequestsError}</p>
            ) : (amendQuery.data?.guestRequests ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No guest requests.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {amendQuery.data?.guestRequests.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{row.requestText}</p>
                      <p className="text-xs capitalize text-muted-foreground">{row.status}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        toggleRequest.mutate({
                          requestId: row.id,
                          status: row.status === "open" ? "done" : "open",
                        })
                      }
                    >
                      {row.status === "open" ? "Done" : "Open"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Folio</p>
            {folioDenied ? (
              <PermissionDeniedPanel
                className="mt-2 border-0 p-0"
                message="You don't have access to folios for this property."
              />
            ) : folioQuery.isLoading ? (
              <p className="mt-1 text-sm text-muted-foreground">Loading folio…</p>
            ) : folioQuery.data ? (
              <p className="mt-1 text-sm">
                {folioQuery.data.folioNumber} · {money(folioQuery.data.balance)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No folio posted yet.</p>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GripVertical className="size-3.5" />
            Drag to move is Coming soon — use Room Move.
          </div>

          <div className="flex flex-col gap-2">
            {actions.map((action) => (
              <SheetActionButton
                key={action.id}
                action={action}
                onLive={() => onAction(action.id as SideSheetAction, stay)}
              />
            ))}
          </div>

          <Button variant="outline" asChild>
            <Link to="/restaurant/pms/reservations/$reservationId" params={{ reservationId: stay.id }}>
              Open reservation
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetActionButton({ action, onLive }: { action: FoActionDef; onLive: () => void }) {
  if (action.lane === "coming_soon") {
    return <ComingSoonButton label={action.label} />;
  }
  return (
    <Button variant={action.id === "view" ? "default" : "outline"} onClick={onLive}>
      {action.label}
    </Button>
  );
}

/** Exported so tests can prove a drop never writes. */
export function onRackBarDropped(reservationId: string, targetRoomId: string) {
  return handleReservationBarDrop({ reservationId, targetRoomId }, {});
}
