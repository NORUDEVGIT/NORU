import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { FoActionModal, FO_ACTION_CONTROL, foActionRoomChip } from "@/packages/pms/components/frontoffice/fo-action-modal";
import { addDays, formatStayDate } from "@/packages/pms/lib/reservation-dates";
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

  const currentNights = dateDraft ? stayNights(dateDraft.arrivalDate, dateDraft.departureDate) : 0;
  const nextNights = dateDraft && arrival && departure ? stayNights(arrival, departure) : currentNights;
  const extensionLine = dateKind === "extend" ? extensionSummary(currentNights, nextNights) : null;
  const chargeDelta =
    quoteQuery.data == null
      ? null
      : authoritativeRoomChargeDelta(quoteQuery.data.previousSubtotal, quoteQuery.data.quotedSubtotal);
  const confirmLabel =
    draft.kind === "move_room"
      ? "Move Room"
      : dateKind === "extend"
        ? "Extend Stay"
        : dateKind === "early_departure"
          ? "Confirm Early Departure"
          : "Confirm";
  const actionTitle =
    draft.kind === "move_room"
      ? "Move Room"
      : dateKind
        ? stayDateConfirmationTitle(dateKind)
        : confirmSheetTitle(draft.kind);

  return (
    <FoActionModal
      open={open}
      onOpenChange={onOpenChange}
      action={actionTitle}
      guestName={draft.guestName}
      confirmation={draft.confirmationNumber}
      roomLabel={foActionRoomChip(draft.currentRoomNumber)}
      size={draft.kind === "move_room" ? "small" : "large"}
      confirmLabel={confirmLabel}
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
      testId="fo-rack-confirm-sheet"
      confirmTestId="fo-rack-confirm"
    >
          <div className="space-y-3">
            {editableDates && dateDraft ? (
              <div className="space-y-3" data-testid="fo-stay-date-editors">
                <section className="rounded-lg border border-[#E8DFD0] bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">
                    Current Stay
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#251605]">
                    {formatStayDate(dateDraft.arrivalDate)} → {formatStayDate(dateDraft.departureDate)} ·{" "}
                    {stayNightLabel(currentNights)}
                  </p>
                </section>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fo-edit-departure">New Departure</Label>
                    <Input
                      id="fo-edit-departure"
                      type="date"
                      className={FO_ACTION_CONTROL}
                      value={editDeparture}
                      onChange={(e) => setEditDeparture(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fo-edit-nights">Nights</Label>
                    <Input
                      id="fo-edit-nights"
                      type="number"
                      min={1}
                      className={FO_ACTION_CONTROL}
                      value={nextNights || ""}
                      onChange={(e) => {
                        const nights = Number(e.target.value);
                        if (!Number.isFinite(nights) || nights < 1) return;
                        setEditDeparture(addDays(editArrival || dateDraft.arrivalDate, nights));
                      }}
                    />
                  </div>
                </div>
                <input
                  id="fo-edit-arrival"
                  type="hidden"
                  value={editArrival}
                  onChange={(e) => setEditArrival(e.target.value)}
                />
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
                      ) : failedChecks.length > 0 ? (
                        <div role="alert">
                          <p className="mt-2 text-sm font-medium text-red-800">
                            {failedChecks[0]?.detail || failedChecks[0]?.label}
                          </p>
                        </div>
                      ) : checksPassed ? null : (
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
                      View validation details
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

              </div>
            ) : dateDraft ? (
              <div className="space-y-3">
                <section className="rounded-lg border border-[#E8DFD0] bg-white p-3" data-testid="fo-stay-change">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#6B5E4E]">Current Stay</dt>
                      <dd className="font-medium text-[#251605]">
                        {formatStayDate(dateDraft.arrivalDate)} → {formatStayDate(dateDraft.departureDate)} ·{" "}
                        {stayNightLabel(currentNights)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#6B5E4E]">New Stay</dt>
                      <dd className="font-medium text-[#251605]">
                        {formatStayDate(dateDraft.nextArrivalDate)} → {formatStayDate(dateDraft.nextDepartureDate)} ·{" "}
                        {stayNightLabel(nextNights)}
                      </dd>
                    </div>
                  </dl>
                  {extensionLine ? (
                    <p className="mt-2 text-sm font-medium text-[#436436]" data-testid="fo-stay-extension">
                      {extensionLine}
                    </p>
                  ) : null}
                </section>

                <section
                  className="rounded-lg border border-[#E8DFD0] bg-white p-3"
                  data-testid="fo-stay-date-finance"
                  data-stay-kind={dateKind ?? "dates_changed"}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#6B5E4E]">Impact</p>
                  {quoteQuery.isPending ? (
                    <p className="mt-2 text-sm text-[#6B5E4E]" data-testid="fo-stay-date-quote-loading">
                      Calculating the updated room price…
                    </p>
                  ) : quoteQuery.isError ? (
                    <div className="mt-2" role="alert" data-testid="fo-stay-date-quote-error">
                      <p className="text-sm text-red-800">Could not calculate the updated room price.</p>
                    </div>
                  ) : quoteQuery.data ? (
                    <dl className="mt-2 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-[#6B5E4E]">Room Charge</dt>
                        <dd className="font-medium text-[#251605]" data-testid="fo-stay-date-quoted">
                          {money(quoteQuery.data.previousSubtotal)} → {money(quoteQuery.data.quotedSubtotal)}
                        </dd>
                      </div>
                      {chargeDelta != null ? (
                        <div className="flex justify-between gap-3" data-testid="fo-stay-folio-impact">
                          <dt className="text-[#6B5E4E]">Folio Adjustment</dt>
                          <dd className="font-semibold text-[#251605]" data-testid="fo-stay-date-delta">
                            {chargeDelta > 0 ? `+${money(chargeDelta)}` : money(chargeDelta)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {folioQuery.data?.folioBalance != null ? (
                    <p className="sr-only" data-testid="fo-stay-folio-balance">
                      {money(folioQuery.data.folioBalance)}
                    </p>
                  ) : null}
                  {dateKind === "early_departure" && quoteQuery.data && (quoteQuery.data.penaltyAmount ?? 0) > 0 ? (
                    <p className="mt-2 text-sm font-medium text-[#251605]" data-testid="fo-stay-date-policy">
                      Early departure penalty {money(quoteQuery.data.penaltyAmount ?? 0)} will be posted to the folio.
                    </p>
                  ) : dateKind === "early_departure" && quoteQuery.data ? (
                    <p className="mt-2 text-xs text-[#6B5E4E]" data-testid="fo-stay-date-policy">
                      {quoteQuery.data.policyLine}
                    </p>
                  ) : null}
                </section>

                {failedChecks.length > 0 ? (
                  <section className="space-y-2" data-testid="fo-stay-validation">
                    <ul className="space-y-1">
                      {failedChecks
                        .filter((item) => item.state === "fail")
                        .map((item) => (
                          <li key={item.id} data-state={item.state} className="text-sm font-medium text-red-800">
                            {item.detail || item.label}
                          </li>
                        ))}
                      {failedChecks
                        .filter((item) => item.state !== "fail")
                        .map((item) => (
                          <li key={item.id} data-state={item.state} className="text-sm text-amber-800">
                            {item.detail || item.label}
                          </li>
                        ))}
                    </ul>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-[#6B5E4E]"
                      onClick={() => setShowChecks((value) => !value)}
                      data-testid="fo-stay-validation-details"
                    >
                      View validation details
                      <ChevronDown className={showChecks ? "size-3.5 rotate-180" : "size-3.5"} />
                    </button>
                    {showChecks ? (
                      <ul className="space-y-2" data-testid="fo-rack-checklist">
                        {checks.map((item) => (
                          <li key={item.id} data-state={item.state} className="text-sm text-[#251605]">
                            {item.label}
                            {item.detail ? (
                              <span className="mt-0.5 block text-xs text-[#6B5E4E]">{item.detail}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-[#6B5E4E]"
                    onClick={() => setShowChecks((value) => !value)}
                    data-testid="fo-stay-validation-details"
                  >
                    View validation details
                    <ChevronDown className={showChecks ? "size-3.5 rotate-180" : "size-3.5"} />
                  </button>
                )}
                {showChecks && failedChecks.length === 0 ? (
                  <ul className="space-y-2" data-testid="fo-rack-checklist">
                    {checks.map((item) => (
                      <li key={item.id} data-state={item.state} className="text-sm text-[#251605]">
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
    </FoActionModal>
  );
}
