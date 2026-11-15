import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  CONNECTING_PAIR_NOTE,
  CONNECTS_TO_LABEL,
  CONNECTS_TO_NONE,
  REMOVE_PAIR_KEEP_LABEL,
  REMOVE_PAIR_TURN_OFF_LABEL,
  changePairConfirmText,
  connectingPairLine,
  draftPartnerOptions,
  pairForUnit,
  pairUnitOptionLabel,
  pairUnitShortLabel,
  pairedWithText,
  removePairConfirmText,
  savedPartnerOptions,
  type DraftPairUnit,
  type DraftPairs,
  type ReservationPairUnit,
} from "@/packages/pms/lib/reservation-room-pairs";
import {
  listReservationRoomPairs,
  removeReservationRoomPair,
  saveReservationRoomPair,
} from "@/packages/pms/lib/reservation-room-pairs.functions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

const NONE = "__not_paired__";
const SELECT = "h-8 text-xs";

export function reservationRoomPairsQueryKey(restaurantId: string, reservationId: string) {
  return ["reservation-room-pairs", restaurantId, reservationId] as const;
}

/* ------------------------------------------------------------------ create */

/** New Reservation: "Connects to" for one draft room. Held in memory until the reservation exists. */
export function DraftConnectsToSelect({
  idPrefix,
  unitRef,
  units,
  pairs,
  onChange,
}: {
  idPrefix: string;
  unitRef: string;
  units: readonly DraftPairUnit[];
  pairs: DraftPairs;
  onChange: (partnerRef: string | null) => void;
}) {
  const partnerRef = pairs[unitRef] ?? null;
  const options = draftPartnerOptions(units, pairs, unitRef);
  const partner = partnerRef ? units.find((unit) => unit.ref === partnerRef) : undefined;
  return (
    <div className="space-y-1" data-testid={`${idPrefix}-connects-to`}>
      <label className="block text-[11px] font-medium text-[#251605]">{CONNECTS_TO_LABEL}</label>
      <Select
        value={partnerRef ?? NONE}
        onValueChange={(value) => onChange(value === NONE ? null : value)}
      >
        <SelectTrigger className={SELECT} data-testid={`${idPrefix}-connects-to-select`}>
          <SelectValue placeholder={CONNECTS_TO_NONE} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{CONNECTS_TO_NONE}</SelectItem>
          {options.map((unit) => (
            <SelectItem key={unit.ref} value={unit.ref}>
              {unit.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {partner ? (
        <p className="text-[11px] text-[#8A641A]" data-testid={`${idPrefix}-paired-with`}>
          {pairedWithText(`Room ${partner.unitSequence}`)}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ edit */

type PendingAction =
  | { kind: "create"; partner: ReservationPairUnit }
  | { kind: "change"; pairId: string; current: ReservationPairUnit; partner: ReservationPairUnit }
  | { kind: "remove"; pairId: string; current: ReservationPairUnit };

/**
 * Edit Reservation: "Connects to" for the selected room unit. Each change is
 * confirmed and saved on its own, apart from the amendment. Room assignments
 * are never changed here.
 */
export function SavedConnectsToSection({
  restaurantId,
  reservationId,
  unitId,
  disabled = false,
  onSaved,
}: {
  restaurantId: string;
  reservationId: string;
  unitId: string | null;
  disabled?: boolean;
  /** The selected unit's stored connecting requirement after the change. */
  onSaved: (connectingRoomRequired: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fetchPairs = useServerFn(listReservationRoomPairs);
  const submitSave = useServerFn(saveReservationRoomPair);
  const submitRemove = useServerFn(removeReservationRoomPair);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const pairsQuery = useQuery({
    queryKey: reservationRoomPairsQueryKey(restaurantId, reservationId),
    queryFn: () => fetchPairs({ data: { restaurantId, reservationId } }),
    retry: false,
  });

  const run = useMutation({
    mutationFn: async (input: { action: PendingAction; keepRequirement: boolean }) => {
      const { action, keepRequirement } = input;
      if (!unitId) throw new Error("Choose a room first.");
      if (action.kind === "remove") {
        await submitRemove({
          data: {
            restaurantId,
            pairId: action.pairId,
            decisions: [
              { unitId, keepRequirement },
              { unitId: action.current.id, keepRequirement },
            ],
          },
        });
        return keepRequirement;
      }
      await submitSave({
        data: {
          restaurantId,
          unitId,
          partnerUnitId: action.partner.id,
          replaceExisting: action.kind === "change",
          keepReplacedPartnerRequirement: keepRequirement,
        },
      });
      return true;
    },
    onSuccess: async (connecting, input) => {
      setPending(null);
      await queryClient.invalidateQueries({
        queryKey: reservationRoomPairsQueryKey(restaurantId, reservationId),
      });
      await queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId, reservationId] });
      onSaved(connecting);
      toast.success(
        input.action.kind === "remove"
          ? "Connecting-room pair removed."
          : input.action.kind === "change"
            ? "Connecting-room pair changed."
            : "Connecting-room pair created.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const read = pairsQuery.data;
  if (!unitId || !read?.available) return null;
  const units = read.units;
  const self = units.find((unit) => unit.id === unitId);
  if (!self) return null;
  const current = pairForUnit(unitId, read.pairs);
  const currentPartner = current ? units.find((unit) => unit.id === current.partnerId) : undefined;
  const options = savedPartnerOptions(unitId, units, read.pairs);
  if (!current && options.length === 0) return null;

  const selfLabel = pairUnitShortLabel(self);
  const labelOf = (unit: ReservationPairUnit) => pairUnitShortLabel(unit);

  function choose(value: string) {
    if (value === NONE) {
      if (current && currentPartner) {
        setPending({ kind: "remove", pairId: current.pair.pairId, current: currentPartner });
      }
      return;
    }
    if (value === current?.partnerId) return;
    const partner = units.find((unit) => unit.id === value);
    if (!partner) return;
    if (current && currentPartner) {
      setPending({ kind: "change", pairId: current.pair.pairId, current: currentPartner, partner });
    } else {
      setPending({ kind: "create", partner });
    }
  }

  return (
    <div className="space-y-1" data-testid="edit-room-connects-to">
      <label className="block text-[11px] font-medium text-[#251605]">{CONNECTS_TO_LABEL}</label>
      <Select
        value={current?.partnerId ?? NONE}
        disabled={disabled || run.isPending}
        onValueChange={choose}
      >
        <SelectTrigger className={SELECT} data-testid="edit-room-connects-to-select">
          <SelectValue placeholder={CONNECTS_TO_NONE} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{CONNECTS_TO_NONE}</SelectItem>
          {options.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {pairUnitOptionLabel({
                unitSequence: unit.unitSequence,
                roomTypeName: unit.roomTypeName,
                adults: unit.adults,
                children: unit.children,
                confirmationNumber: unit.own ? null : unit.confirmationNumber,
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentPartner ? (
        <p className="text-[11px] text-[#8A641A]" data-testid="edit-room-paired-with">
          {pairedWithText(labelOf(currentPartner))}
        </p>
      ) : null}

      <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <AlertDialogContent data-testid="edit-room-pair-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "remove"
                ? removePairConfirmText(selfLabel, labelOf(pending.current))
                : pending?.kind === "change"
                  ? changePairConfirmText(selfLabel, labelOf(pending.current), labelOf(pending.partner))
                  : pending
                    ? `Pair ${selfLabel} with ${labelOf(pending.partner)}?`
                    : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "remove"
                ? "Room assignments are not changed."
                : pending?.kind === "change"
                  ? `Connecting room required stays on for ${selfLabel} and is turned on for ${labelOf(pending.partner)}. Choose what happens to ${labelOf(pending.current)}. Room assignments are not changed.`
                  : `Connecting room required is turned on for both rooms. Room assignments are not changed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            {pending?.kind === "create" ? (
              <Button
                type="button"
                disabled={run.isPending}
                data-testid="edit-room-pair-create"
                onClick={() => run.mutate({ action: pending, keepRequirement: true })}
              >
                Pair rooms
              </Button>
            ) : pending ? (
              <>
                <Button
                  type="button"
                  disabled={run.isPending}
                  data-testid="edit-room-pair-turn-off"
                  onClick={() => run.mutate({ action: pending, keepRequirement: false })}
                >
                  {pending.kind === "remove"
                    ? REMOVE_PAIR_TURN_OFF_LABEL
                    : `Change pairing and turn off ${labelOf(pending.current)}'s connecting requirement`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={run.isPending}
                  data-testid="edit-room-pair-keep"
                  onClick={() => run.mutate({ action: pending, keepRequirement: true })}
                >
                  {pending.kind === "remove"
                    ? REMOVE_PAIR_KEEP_LABEL
                    : `Change pairing but keep ${labelOf(pending.current)}'s connecting requirement`}
                </Button>
              </>
            ) : null}
            <AlertDialogCancel disabled={run.isPending}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Whether the selected unit is in a saved pair. Drives the locked requirement note. */
export function useSavedUnitPaired(
  restaurantId: string,
  reservationId: string,
  unitId: string | null,
): boolean {
  const fetchPairs = useServerFn(listReservationRoomPairs);
  const pairsQuery = useQuery({
    queryKey: reservationRoomPairsQueryKey(restaurantId, reservationId),
    queryFn: () => fetchPairs({ data: { restaurantId, reservationId } }),
    retry: false,
  });
  if (!unitId || !pairsQuery.data?.available) return false;
  return pairForUnit(unitId, pairsQuery.data.pairs) !== null;
}

/* ------------------------------------------------------------------ display */

/** Reservation detail and Edit: the saved pairs, as staff lines. Nothing when there are none. */
export function ConnectingPairsSummary({
  restaurantId,
  reservationId,
  className,
}: {
  restaurantId: string;
  reservationId: string;
  className?: string | undefined;
}) {
  const fetchPairs = useServerFn(listReservationRoomPairs);
  const pairsQuery = useQuery({
    queryKey: reservationRoomPairsQueryKey(restaurantId, reservationId),
    queryFn: () => fetchPairs({ data: { restaurantId, reservationId } }),
    retry: false,
  });
  const pairs = pairsQuery.data?.available ? pairsQuery.data.pairs : [];
  if (pairs.length === 0) return null;
  return <ConnectingPairsList labels={pairs.map((pair) => pair.label)} className={className} />;
}

export function ConnectingPairsList({
  labels,
  className,
}: {
  labels: readonly string[];
  className?: string | undefined;
}) {
  if (labels.length === 0) return null;
  return (
    <div
      className={cn("rounded-[6px] border border-[#E7E0D4] bg-[#FAF8F4] px-2.5 py-2", className)}
      data-testid="connecting-pairs-summary"
    >
      {labels.map((label) => (
        <p key={label} className="text-xs font-medium text-[#251605]">
          {connectingPairLine(label)}
        </p>
      ))}
      <p className="text-[11px] text-[#6B5E4E]">{CONNECTING_PAIR_NOTE}</p>
    </div>
  );
}
