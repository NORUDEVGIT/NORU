import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { listAssignableRooms } from "@/packages/pms/lib/reservations.functions";
import { changeStayDates, moveReservationRoom } from "@/packages/pms/lib/frontoffice.functions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import {
  RACK_CONFIRM_WIDTH_PX,
  RACK_MOVE_REASON,
  RATE_IMPACT_UNAVAILABLE_LABEL,
  UNAVAILABLE_TO_VERIFY,
  canConfirmRackChecks,
  confirmSheetTitle,
  evaluateRackChecks,
  formatFoDate,
  rackRateImpact,
  roomHasOverlap,
  type AssignableLookup,
  type RackConfirmDraft,
} from "@/packages/pms/lib/fo-rack-power";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function FoRackConfirmSheet({
  restaurantId,
  draft,
  open,
  overlappingStays,
  onOpenChange,
}: {
  restaurantId: string;
  draft: RackConfirmDraft | null;
  open: boolean;
  overlappingStays: Array<{
    id: string;
    roomId: string | null;
    arrivalDate: string;
    departureDate: string;
    status: string;
  }>;
  onOpenChange: (open: boolean) => void;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchAssignable = useServerFn(listAssignableRooms);
  const move = useServerFn(moveReservationRoom);
  const change = useServerFn(changeStayDates);

  const arrival = draft?.kind === "change_dates" ? draft.nextArrivalDate : draft?.arrivalDate;
  const departure = draft?.kind === "change_dates" ? draft.nextDepartureDate : draft?.departureDate;
  const roomTypeId = draft?.currentRoomTypeId ?? null;

  const assignableQuery = useQuery({
    queryKey: [
      "front-office",
      "rack-assignable",
      restaurantId,
      draft?.reservationId,
      roomTypeId,
      arrival,
      departure,
    ],
    queryFn: () =>
      fetchAssignable({
        data: {
          restaurantId,
          roomTypeId: roomTypeId!,
          arrival: arrival!,
          departure: departure!,
          excludeReservationId: draft!.reservationId,
        },
      }),
    enabled: open && !!draft && !!roomTypeId && !!arrival && !!departure && departure > (arrival ?? ""),
    retry: false,
  });

  const lookup: AssignableLookup | null = !draft
    ? null
    : assignableQuery.isPending
      ? { state: "pending" }
      : assignableQuery.isError
        ? { state: "error" }
        : assignableQuery.data
          ? { state: "ready", roomIds: assignableQuery.data.map((room) => room.id) }
          : { state: "pending" };

  const overlapRoomId = draft?.kind === "move_room" ? draft.targetRoomId : draft?.currentRoomId;
  const localOverlap =
    !!draft &&
    !!overlapRoomId &&
    roomHasOverlap({
      roomId: overlapRoomId,
      arrival: arrival ?? draft.arrivalDate,
      departure: departure ?? draft.departureDate,
      excludeReservationId: draft.reservationId,
      stays: overlappingStays,
    });

  const checks = draft ? evaluateRackChecks(draft, lookup, localOverlap) : [];
  const canConfirm = canConfirmRackChecks(checks);
  const rate = draft?.kind === "change_dates" ? rackRateImpact(draft) : null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!draft || !canConfirm) return;
      if (draft.kind === "move_room") {
        return move({
          data: {
            restaurantId,
            reservationId: draft.reservationId,
            roomId: draft.targetRoomId,
            reason: RACK_MOVE_REASON,
          },
        });
      }
      return change({
        data: {
          restaurantId,
          reservationId: draft.reservationId,
          departure: draft.nextDepartureDate,
        },
      });
    },
    onSuccess: () => {
      toast.success(draft?.kind === "move_room" ? "Guest moved." : "Stay updated.");
      void queryClient.invalidateQueries({ queryKey: ["front-office"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  if (!draft) return null;

  const currentDates = `${formatFoDate(draft.arrivalDate)} → ${formatFoDate(draft.departureDate)}`;
  const subtitle =
    draft.kind === "move_room"
      ? `${draft.guestName} · ${draft.confirmationNumber} · ${draft.currentRoomNumber ? `Room ${draft.currentRoomNumber}` : "Unassigned"}`
      : `${draft.guestName} · ${draft.confirmationNumber} · ${currentDates}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="fo-rack-confirm-sheet"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0"
        style={{ maxWidth: RACK_CONFIRM_WIDTH_PX.max, minWidth: undefined }}
      >
        <div className="mx-auto flex h-full w-full max-w-[560px] flex-col sm:min-w-[480px]">
          <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
            <SheetTitle className="text-[#251605]">{confirmSheetTitle(draft.kind)}</SheetTitle>
            <SheetDescription>{subtitle}</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-xl border border-border p-3" data-testid="fo-rack-before-after">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Before → After</p>
              {draft.kind === "move_room" ? (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Previous room</dt>
                    <dd>{draft.currentRoomNumber ?? "Unassigned"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">New room</dt>
                    <dd>{draft.targetRoomNumber}</dd>
                  </div>
                </dl>
              ) : (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Previous dates</dt>
                    <dd>
                      {formatFoDate(draft.arrivalDate)} → {formatFoDate(draft.departureDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">New dates</dt>
                    <dd>
                      {formatFoDate(draft.nextArrivalDate)} → {formatFoDate(draft.nextDepartureDate)}
                    </dd>
                  </div>
                </dl>
              )}
              {rate ? (
                rate.kind === "available" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Previous rate</p>
                      <p>{money(rate.previous)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">New rate</p>
                      <p>{rate.next == null ? RATE_IMPACT_UNAVAILABLE_LABEL : money(rate.next)}</p>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-3 inline-flex rounded-full bg-[#C89933]/20 px-2.5 py-1 text-xs font-semibold text-[#251605]"
                    data-testid="fo-rate-impact-unavailable"
                  >
                    {RATE_IMPACT_UNAVAILABLE_LABEL}
                  </p>
                )
              ) : null}
            </div>

            <ul className="space-y-2" data-testid="fo-rack-checklist">
              {checks.map((item) => (
                <li
                  key={item.id}
                  data-state={item.state}
                  className="rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <p className="font-medium text-[#251605]">
                    <span className="mr-2 text-xs uppercase tracking-wide text-muted-foreground">
                      {item.state === "pass" ? "Pass" : item.state === "fail" ? "Fail" : UNAVAILABLE_TO_VERIFY}
                    </span>
                    {item.label}
                  </p>
                  {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="shrink-0 border-t border-[#CCCCCC] px-5 py-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                data-testid="fo-rack-confirm"
                className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
                disabled={!canConfirm || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
