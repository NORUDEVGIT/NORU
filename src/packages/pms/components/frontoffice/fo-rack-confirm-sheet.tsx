import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { listAssignableRooms } from "@/packages/pms/lib/reservations.functions";
import {
  changeStayDates,
  listOccupancy,
  moveReservationRoom,
} from "@/packages/pms/lib/frontoffice.functions";
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
  stayDateWriteInput,
  type AssignableLookup,
  type RackConfirmDraft,
  type RackDatesDraft,
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
  editableDates = false,
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
  editableDates?: boolean;
}) {
  const money = useMoney();
  const queryClient = useQueryClient();
  const fetchAssignable = useServerFn(listAssignableRooms);
  const fetchOccupancy = useServerFn(listOccupancy);
  const move = useServerFn(moveReservationRoom);
  const change = useServerFn(changeStayDates);
  const [editArrival, setEditArrival] = useState(draft?.kind === "change_dates" ? draft.nextArrivalDate : "");
  const [editDeparture, setEditDeparture] = useState(
    draft?.kind === "change_dates" ? draft.nextDepartureDate : "",
  );

  const seedArrival = draft?.kind === "change_dates" ? draft.nextArrivalDate : "";
  const seedDeparture = draft?.kind === "change_dates" ? draft.nextDepartureDate : "";
  useEffect(() => {
    if (!open) return;
    setEditArrival(seedArrival);
    setEditDeparture(seedDeparture);
  }, [open, seedArrival, seedDeparture]);

  const dateDraft: RackDatesDraft | null =
    draft?.kind === "change_dates"
      ? {
          ...draft,
          nextArrivalDate: editableDates ? editArrival : draft.nextArrivalDate,
          nextDepartureDate: editableDates ? editDeparture : draft.nextDepartureDate,
        }
      : null;
  const activeDraft: RackConfirmDraft | null = dateDraft ?? draft;

  const arrival = dateDraft ? dateDraft.nextArrivalDate : activeDraft?.arrivalDate;
  const departure = dateDraft ? dateDraft.nextDepartureDate : activeDraft?.departureDate;
  const roomTypeId = activeDraft?.currentRoomTypeId ?? null;
  const needsAssignable =
    !!activeDraft && (activeDraft.kind === "move_room" || !!activeDraft.currentRoomId);

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
    enabled:
      open &&
      needsAssignable &&
      !!roomTypeId &&
      !!arrival &&
      !!departure &&
      departure > (arrival ?? ""),
    retry: false,
  });

  const occupancyQuery = useQuery({
    queryKey: ["front-office", "occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
    enabled: open && !!dateDraft?.currentRoomId && dateDraft.currentRoomStatus === undefined,
    retry: false,
  });

  const lookup: AssignableLookup | null = !activeDraft
    ? null
    : !needsAssignable
      ? { state: "ready", roomIds: [] }
      : assignableQuery.isPending
        ? { state: "pending" }
        : assignableQuery.isError
          ? { state: "error" }
          : assignableQuery.data
            ? { state: "ready", roomIds: assignableQuery.data.map((room) => room.id) }
            : { state: "pending" };

  const overlapRoomId = activeDraft?.kind === "move_room" ? activeDraft.targetRoomId : activeDraft?.currentRoomId;
  const localOverlap =
    !!activeDraft &&
    !!overlapRoomId &&
    roomHasOverlap({
      roomId: overlapRoomId,
      arrival: arrival ?? activeDraft.arrivalDate,
      departure: departure ?? activeDraft.departureDate,
      excludeReservationId: activeDraft.reservationId,
      stays: overlappingStays,
    });

  const occupancyRoom =
    dateDraft?.currentRoomId && occupancyQuery.data
      ? occupancyQuery.data.find((room) => room.id === dateDraft.currentRoomId)
      : undefined;
  const evaluatedDraft: RackConfirmDraft | null =
    dateDraft && dateDraft.currentRoomId && dateDraft.currentRoomStatus === undefined
      ? occupancyQuery.isError
        ? { ...dateDraft, currentRoomStatus: null }
        : occupancyQuery.data
          ? { ...dateDraft, currentRoomStatus: occupancyRoom?.status ?? null }
          : dateDraft
      : activeDraft;

  const checks = evaluatedDraft ? evaluateRackChecks(evaluatedDraft, lookup, localOverlap) : [];
  const canConfirm = canConfirmRackChecks(checks);
  const rate = dateDraft ? rackRateImpact(dateDraft) : null;

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
          ...stayDateWriteInput(dateDraft ?? draft),
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
            {editableDates && dateDraft ? (
              <div className="grid grid-cols-2 gap-3" data-testid="fo-stay-date-editors">
                <div className="space-y-2">
                  <Label htmlFor="fo-edit-arrival">Arrival</Label>
                  <Input
                    id="fo-edit-arrival"
                    type="date"
                    value={editArrival}
                    onChange={(e) => setEditArrival(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fo-edit-departure">Departure</Label>
                  <Input
                    id="fo-edit-departure"
                    type="date"
                    value={editDeparture}
                    onChange={(e) => setEditDeparture(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
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
                      {formatFoDate(dateDraft?.nextArrivalDate ?? draft.nextArrivalDate)} →{" "}
                      {formatFoDate(dateDraft?.nextDepartureDate ?? draft.nextDepartureDate)}
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
