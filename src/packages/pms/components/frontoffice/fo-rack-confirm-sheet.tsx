import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CheckCircle2, ChevronDown } from "lucide-react";
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
import { getReservationCashieringSummary } from "@/packages/pms/lib/fo-check-in.functions";
import { ROOM_LEGEND } from "@/packages/pms/lib/front-office-shell";
import { HK_STATUS_CODES, HK_STATUS_LABELS, type HkStatusCode } from "@/packages/pms/lib/pms-set4-hk-inventory";
import { listAssignableRooms } from "@/packages/pms/lib/reservations.functions";
import {
  changeStayDates,
  listOccupancy,
  moveReservationRoom,
  quoteInHouseStayChange,
} from "@/packages/pms/lib/frontoffice.functions";
import {
  authoritativeRoomChargeDelta,
  extensionSummary,
  stayDateChangeKind,
  stayDateConfirmationTitle,
  stayNightLabel,
  stayNights,
} from "@/packages/pms/lib/fo-stay-date-finance";
import { useMoney } from "@/core/state/property-format";
import {
  RACK_CONFIRM_WIDTH_PX,
  RACK_MOVE_REASON,
  UNAVAILABLE_TO_VERIFY,
  canConfirmRackChecks,
  confirmSheetTitle,
  evaluateRackChecks,
  formatFoDate,
  roomHasOverlap,
  stayDateWriteInput,
  type AssignableLookup,
  type RackConfirmDraft,
  type RackDatesDraft,
} from "@/packages/pms/lib/fo-rack-power";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function roomStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return ROOM_LEGEND.find((row) => row.key === status)?.label ?? null;
}

function housekeepingLabel(status: string | null, known: boolean): string | null {
  if (!known || !status) return null;
  if ((HK_STATUS_CODES as readonly string[]).includes(status)) {
    return HK_STATUS_LABELS[status as HkStatusCode];
  }
  return null;
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
  const quoteStayChange = useServerFn(quoteInHouseStayChange);
  const fetchCashiering = useServerFn(getReservationCashieringSummary);
  const [showChecks, setShowChecks] = useState(false);
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

  const quoteQuery = useQuery({
    queryKey: [
      "front-office",
      "stay-date-quote",
      restaurantId,
      draft?.reservationId,
      arrival,
      departure,
    ],
    queryFn: () =>
      quoteStayChange({
        data: {
          restaurantId,
          reservationId: draft!.reservationId,
          arrival: arrival!,
          departure: departure!,
        },
      }),
    enabled: open && !!dateDraft && !!arrival && !!departure && departure > arrival,
    retry: false,
  });

  const folioQuery = useQuery({
    queryKey: ["fo-stay-date-folio", restaurantId, draft?.reservationId],
    queryFn: () =>
      fetchCashiering({
        data: { restaurantId, reservationId: draft!.reservationId },
      }),
    enabled: open && !!dateDraft && !!draft?.reservationId,
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
  const dateKind =
    dateDraft && arrival && departure
      ? stayDateChangeKind(dateDraft.arrivalDate, dateDraft.departureDate, arrival, departure)
      : null;
  const quoteReady = !dateDraft || (quoteQuery.isSuccess && !quoteQuery.isFetching);
  const canConfirm = canConfirmRackChecks(checks) && quoteReady;
  const checksPassed = checks.length > 0 && checks.every((item) => item.state === "pass");
  const failedChecks = checks.filter((item) => item.state !== "pass");

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
            expectedRoomId: draft.currentRoomId,
            expectedArrival: draft.arrivalDate,
            expectedDeparture: draft.departureDate,
          },
        });
      }
      const dates = dateDraft ?? draft;
      if (dates.kind !== "change_dates") return;
      return change({
        data: {
          restaurantId,
          reservationId: draft.reservationId,
          ...stayDateWriteInput(dates),
          expectedRoomId: dates.currentRoomId,
          expectedArrival: dates.arrivalDate,
          expectedDeparture: dates.departureDate,
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

  const roomLabel = draft.currentRoomNumber ? `Room ${draft.currentRoomNumber}` : "Unassigned";
  const subtitle =
    draft.kind === "move_room"
      ? `${draft.guestName} · ${draft.confirmationNumber} · ${
          draft.currentRoomNumber ? `Current room ${draft.currentRoomNumber}` : "Unassigned"
        }`
      : `${draft.guestName} · ${draft.confirmationNumber} · ${roomLabel}`;
  const currentNights = dateDraft ? stayNights(dateDraft.arrivalDate, dateDraft.departureDate) : 0;
  const nextNights = dateDraft && arrival && departure ? stayNights(arrival, departure) : currentNights;
  const extensionLine = dateKind === "extend" ? extensionSummary(currentNights, nextNights) : null;
  const chargeDelta =
    quoteQuery.data == null
      ? null
      : authoritativeRoomChargeDelta(quoteQuery.data.previousSubtotal, quoteQuery.data.quotedSubtotal);
  const confirmLabel =
    draft.kind === "move_room"
      ? "Confirm Room Move"
      : dateKind === "extend"
        ? "Confirm Extension"
        : "Confirm";
  const folioBalance = folioQuery.data?.folioBalance;

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
            <SheetTitle className="text-[#251605]">
              {dateKind ? stayDateConfirmationTitle(dateKind) : confirmSheetTitle(draft.kind)}
            </SheetTitle>
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
            {draft.kind === "move_room" ? (
              <div className="space-y-3">
                <section
                  className="rounded-xl border border-[#E8DFD0] bg-white p-3"
                  data-testid="fo-room-change"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                    Room change
                  </p>
                  <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
                    <div>
                      <p className="text-xs text-[#6B5E4E]">Current room</p>
                      <p className="text-lg font-semibold text-[#251605]">
                        {draft.currentRoomNumber ?? "Unassigned"}
                      </p>
                      {draft.currentRoomTypeName ? (
                        <p className="text-sm text-[#6B5E4E]">{draft.currentRoomTypeName}</p>
                      ) : null}
                    </div>
                    <p className="hidden pt-6 text-[#8C7E72] sm:block" aria-hidden>
                      →
                    </p>
                    <p className="text-center text-[#8C7E72] sm:hidden" aria-hidden>
                      ↓
                    </p>
                    <div data-testid="fo-room-change-destination">
                      <p className="text-xs text-[#6B5E4E]">New room</p>
                      <p className="text-lg font-semibold text-[#251605]">{draft.targetRoomNumber}</p>
                      {draft.targetRoomTypeName ? (
                        <p className="text-sm text-[#6B5E4E]">{draft.targetRoomTypeName}</p>
                      ) : null}
                      {roomStatusLabel(draft.targetStatus) ? (
                        <p className="mt-1 text-sm text-[#251605]" data-testid="fo-room-change-status">
                          {roomStatusLabel(draft.targetStatus)}
                        </p>
                      ) : null}
                      {housekeepingLabel(draft.targetHousekeeping, draft.hkKnown) ? (
                        <p className="text-xs text-[#6B5E4E]" data-testid="fo-room-change-housekeeping">
                          Housekeeping: {housekeepingLabel(draft.targetHousekeeping, draft.hkKnown)}
                        </p>
                      ) : null}
                      {checksPassed ? (
                        <p className="mt-1 text-sm font-medium text-[#436436]">Ready for move</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section
                  className="rounded-xl border border-[#E8DFD0] bg-white p-3"
                  data-testid="fo-move-validation"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                        Validation
                      </p>
                      {lookup?.state === "error" ? (
                        <div className="mt-2" role="alert">
                          <p className="text-sm font-medium text-red-800">
                            Could not validate this room move.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 h-8 text-xs"
                            onClick={() => void assignableQuery.refetch()}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : checksPassed ? (
                        <div role="status">
                          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#436436]">
                            <CheckCircle2 className="size-4" aria-hidden />
                            All move checks passed
                          </p>
                          <p className="mt-1 text-xs text-[#6B5E4E]">
                            The destination room is eligible for this in-house move.
                          </p>
                        </div>
                      ) : failedChecks.length > 0 ? (
                        <div role="alert">
                          <p className="mt-2 text-sm font-medium text-red-800">Room move cannot continue</p>
                          <p className="mt-1 text-sm text-[#251605]">
                            {failedChecks[0]?.label}
                            {failedChecks[0]?.detail ? `. ${failedChecks[0].detail}` : ""}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[#6B5E4E]">Checking this room…</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-[#6B5E4E]"
                      onClick={() => setShowChecks((value) => !value)}
                      aria-expanded={showChecks}
                      data-testid="fo-move-validation-details"
                    >
                      View details
                      <ChevronDown className={showChecks ? "size-3.5 rotate-180" : "size-3.5"} />
                    </button>
                  </div>
                  {showChecks || failedChecks.length > 0 ? (
                    <ul className="mt-3 space-y-2" data-testid="fo-rack-checklist">
                      {(checksPassed ? checks : failedChecks).map((item) => (
                        <li key={item.id} data-state={item.state} className="text-sm text-[#251605]">
                          <span className="mr-2 text-xs uppercase tracking-wide text-[#6B5E4E]">
                            {item.state === "pass"
                              ? "Pass"
                              : item.state === "fail"
                                ? "Fail"
                                : UNAVAILABLE_TO_VERIFY}
                          </span>
                          {item.label}
                          {item.detail ? (
                            <span className="mt-0.5 block text-xs text-[#6B5E4E]">{item.detail}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <p className="text-xs text-[#6B5E4E]" data-testid="fo-move-note">
                  The guest will be reassigned to the new room using the existing in-house room-move
                  workflow.
                </p>
              </div>
            ) : dateDraft ? (
              <div className="space-y-3">
                <section className="rounded-xl border border-[#E8DFD0] bg-white p-3" data-testid="fo-stay-change">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                    <CalendarDays className="size-3.5" />
                    Stay change
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[#6B5E4E]">Current stay</p>
                      <p className="font-medium text-[#251605]">
                        {formatFoDate(dateDraft.arrivalDate)} → {formatFoDate(dateDraft.departureDate)}
                      </p>
                      <p className="text-xs text-[#6B5E4E]">{stayNightLabel(currentNights)}</p>
                    </div>
                    <p className="pt-4 text-[#8C7E72]">→</p>
                    <div>
                      <p className="text-xs text-[#6B5E4E]">New stay</p>
                      <p className="font-medium text-[#251605]">
                        {formatFoDate(dateDraft.nextArrivalDate)} → {formatFoDate(dateDraft.nextDepartureDate)}
                      </p>
                      <p className="text-xs text-[#6B5E4E]">{stayNightLabel(nextNights)}</p>
                    </div>
                  </div>
                  {extensionLine ? (
                    <p className="mt-3 text-sm font-medium text-[#436436]" data-testid="fo-stay-extension">
                      {extensionLine}
                    </p>
                  ) : null}
                </section>

                <section
                  className="rounded-xl border border-[#E8DFD0] bg-white p-3"
                  data-testid="fo-stay-date-finance"
                  data-stay-kind={dateKind ?? "dates_changed"}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                    Financial impact
                  </p>
                  <p className="text-[11px] text-[#8C7E72]">Room charges</p>
                  {quoteQuery.isPending ? (
                    <p className="mt-3 text-sm text-[#6B5E4E]" data-testid="fo-stay-date-quote-loading">
                      Calculating the updated room price…
                    </p>
                  ) : quoteQuery.isError ? (
                    <div className="mt-3" role="alert" data-testid="fo-stay-date-quote-error">
                      <p className="text-sm text-red-800">Could not calculate the updated room price.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 text-xs"
                        onClick={() => void quoteQuery.refetch()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : quoteQuery.data ? (
                    <dl className="mt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#6B5E4E]">Current room total</dt>
                        <dd className="font-medium text-[#251605]">
                          {money(quoteQuery.data.previousSubtotal)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#6B5E4E]">New room total</dt>
                        <dd className="font-medium text-[#251605]" data-testid="fo-stay-date-quoted">
                          {money(quoteQuery.data.quotedSubtotal)}
                        </dd>
                      </div>
                      {chargeDelta != null ? (
                        <div className="flex justify-between gap-3 border-t border-[#E8DFD0] pt-2">
                          <dt className="font-medium text-[#251605]">
                            {dateKind === "extend" ? "Additional room charge" : "Room charge change"}
                          </dt>
                          <dd className="font-semibold text-[#436436]" data-testid="fo-stay-date-delta">
                            {chargeDelta > 0 ? `+ ${money(chargeDelta)}` : money(chargeDelta)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  <div className="mt-4 border-t border-[#E8DFD0] pt-3" data-testid="fo-stay-folio-impact">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                      Folio impact
                    </p>
                    {folioQuery.isPending ? (
                      <p className="mt-2 text-sm text-[#6B5E4E]">Loading folio balance…</p>
                    ) : folioQuery.isError ? (
                      <p className="mt-2 text-sm text-[#8B4513]">Folio balance could not be loaded.</p>
                    ) : folioBalance == null ? (
                      <p className="mt-2 text-sm text-[#6B5E4E]">No folio is open.</p>
                    ) : (
                      <dl className="mt-2 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-[#6B5E4E]">Current folio balance</dt>
                          <dd className="font-medium text-[#251605]" data-testid="fo-stay-folio-balance">
                            {money(folioBalance)}
                          </dd>
                        </div>
                        {chargeDelta != null ? (
                          <div className="flex justify-between gap-3">
                            <dt className="text-[#6B5E4E]">Room charge adjustment</dt>
                            <dd className="font-medium text-[#251605]">
                              {chargeDelta > 0 ? `+ ${money(chargeDelta)}` : money(chargeDelta)}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    )}
                  </div>

                  {dateKind === "early_departure" && quoteQuery.data ? (
                    <p className="mt-3 text-xs text-[#6B5E4E]" data-testid="fo-stay-date-policy">
                      {quoteQuery.data.policyLine}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-[#6B5E4E]">
                    The room charge on the open folio will be adjusted automatically. A closed or
                    invoiced folio cannot be changed.
                  </p>
                </section>

                <section className="rounded-xl border border-[#E8DFD0] bg-white p-3" data-testid="fo-stay-validation">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                        Validation
                      </p>
                      {checksPassed ? (
                        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#436436]">
                          <CheckCircle2 className="size-4" />
                          All checks passed
                        </p>
                      ) : failedChecks.length > 0 ? (
                        <p className="mt-2 text-sm font-medium text-red-800">
                          {failedChecks[0]?.detail || failedChecks[0]?.label}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-[#6B5E4E]">Checking the stay…</p>
                      )}
                      {checksPassed && dateKind === "extend" ? (
                        <p className="mt-1 text-xs text-[#6B5E4E]">Stay extension is valid and eligible.</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-[#6B5E4E]"
                      onClick={() => setShowChecks((value) => !value)}
                      data-testid="fo-stay-validation-details"
                    >
                      View details
                      <ChevronDown className={showChecks ? "size-3.5 rotate-180" : "size-3.5"} />
                    </button>
                  </div>
                  {showChecks || !checksPassed ? (
                    <ul className="mt-3 space-y-2" data-testid="fo-rack-checklist">
                      {(checksPassed ? checks : failedChecks).map((item) => (
                        <li key={item.id} data-state={item.state} className="text-sm text-[#251605]">
                          <span className="mr-2 text-xs uppercase tracking-wide text-[#6B5E4E]">
                            {item.state === "pass"
                              ? "Pass"
                              : item.state === "fail"
                                ? "Fail"
                                : UNAVAILABLE_TO_VERIFY}
                          </span>
                          {item.label}
                          {item.detail ? <span className="mt-0.5 block text-xs text-[#6B5E4E]">{item.detail}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-[#CCCCCC] px-5 py-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                data-testid="fo-rack-confirm"
                className="h-auto bg-[#C89933] py-2 text-[#251605] hover:bg-[#C89933]/90"
                disabled={!canConfirm || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                <span className="block">{mutation.isPending ? "Saving…" : confirmLabel}</span>
                {dateKind === "extend" && chargeDelta != null && chargeDelta > 0 ? (
                  <span className="block text-[11px] font-normal">
                    Adds {money(chargeDelta)} to room charges
                  </span>
                ) : null}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
