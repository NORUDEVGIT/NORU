import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { storedRatePerNight } from "@/packages/pms/lib/reservation-detail-overview";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  confirmReservationRoomTypeChange,
  listReservationRatePlans,
  previewReservationRoomTypeChange,
  type RoomTypeChangeImpact,
} from "@/packages/pms/lib/reservation-room-type.functions";
import {
  getRoomTypeAvailability,
  type ReservationDetail,
} from "@/packages/pms/lib/reservations.functions";
import type { ReservationRoomUnit } from "@/packages/pms/lib/reservation-room-units";

function moneyOrDash(money: (value: number) => string, value: number | null): string {
  return value == null ? "—" : money(value);
}

export function RoomTypeChangeDialog({
  open,
  onOpenChange,
  restaurantId,
  reservation,
  unit,
  money,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  reservation: ReservationDetail;
  unit: ReservationRoomUnit | null;
  money: (value: number) => string;
  onSaved: () => void;
}) {
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchPlans = useServerFn(listReservationRatePlans);
  const previewChange = useServerFn(previewReservationRoomTypeChange);
  const confirmChange = useServerFn(confirmReservationRoomTypeChange);
  const [roomTypeId, setRoomTypeId] = useState(unit?.roomTypeId ?? reservation.roomTypeId);
  const [ratePlanId, setRatePlanId] = useState(unit?.ratePlanId ?? reservation.ratePlanId ?? "");
  const [impact, setImpact] = useState<RoomTypeChangeImpact | null>(null);

  useEffect(() => {
    if (!open) return;
    setRoomTypeId(unit?.roomTypeId ?? reservation.roomTypeId);
    setRatePlanId(unit?.ratePlanId ?? reservation.ratePlanId ?? "");
    setImpact(null);
  }, [
    open,
    unit?.id,
    unit?.roomTypeId,
    unit?.ratePlanId,
    reservation.roomTypeId,
    reservation.ratePlanId,
  ]);

  const availabilityQuery = useQuery({
    queryKey: [
      "room-type-change-availability",
      restaurantId,
      reservation.id,
      unit?.arrivalDate ?? reservation.arrivalDate,
      unit?.departureDate ?? reservation.departureDate,
    ],
    queryFn: () =>
      fetchAvailability({
        data: {
          restaurantId,
          arrival: unit?.arrivalDate ?? reservation.arrivalDate,
          departure: unit?.departureDate ?? reservation.departureDate,
          excludeReservationId: reservation.id,
        },
      }),
    enabled: open,
  });

  const plansQuery = useQuery({
    queryKey: ["room-type-change-plans", restaurantId, roomTypeId],
    queryFn: () => fetchPlans({ data: { restaurantId, roomTypeId } }),
    enabled: open && Boolean(roomTypeId),
  });

  useEffect(() => {
    const plans = plansQuery.data;
    if (!plans) return;
    setRatePlanId((current) =>
      plans.some((plan) => plan.id === current) ? current : (plans[0]?.id ?? ""),
    );
  }, [plansQuery.data]);

  const review = useMutation({
    mutationFn: () => {
      if (!unit) throw new Error("Choose which room this action applies to.");
      if (!ratePlanId) throw new Error("Choose a rate plan that applies to the new room type.");
      return previewChange({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: unit.id,
          roomTypeId,
          ratePlanId,
        },
      });
    },
    onSuccess: (result) => setImpact(result),
    onError: (error: Error) => toast.error(error.message),
  });

  const confirm = useMutation({
    mutationFn: () => {
      if (!unit || !impact) throw new Error("Review the room type change before confirming.");
      return confirmChange({
        data: {
          restaurantId,
          reservationId: reservation.id,
          reservationRoomId: unit.id,
          roomTypeId: impact.proposed.roomTypeId,
          ratePlanId: impact.proposed.ratePlanId ?? "",
        },
      });
    },
    onSuccess: () => {
      toast.success("Room type updated.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nights = nightsBetween(
    unit?.arrivalDate ?? reservation.arrivalDate,
    unit?.departureDate ?? reservation.departureDate,
  );
  const currentNightly = storedRatePerNight(unit?.nightlyRates, unit?.roomSubtotal, nights);
  const currentType =
    unit?.roomTypeName ??
    availabilityQuery.data?.find((type) => type.roomTypeId === unit?.roomTypeId)?.name ??
    reservation.roomTypeName;
  const currentPlan = unit?.ratePlanName ?? reservation.ratePlanName ?? "—";
  const reviewed =
    impact != null &&
    impact.reservationRoomId === unit?.id &&
    impact.proposed.roomTypeId === roomTypeId &&
    impact.proposed.ratePlanId === ratePlanId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="room-type-change">
        <DialogHeader>
          <DialogTitle>Change Room Type</DialogTitle>
          <DialogDescription>
            Room {unit?.unitSequence ?? 1}. This updates the selected room only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-[#251605]">
          <p data-testid="room-type-change-current">
            Current: {currentType} · {currentPlan} ·{" "}
            {currentNightly == null ? "—" : `${money(currentNightly)}/night`}
          </p>
          <div className="space-y-1">
            <Label htmlFor="room-type-change-type">New Room Type</Label>
            <Select
              value={roomTypeId}
              onValueChange={(value) => {
                setRoomTypeId(value);
                setImpact(null);
              }}
            >
              <SelectTrigger id="room-type-change-type">
                <SelectValue placeholder="Select a room type" />
              </SelectTrigger>
              <SelectContent>
                {(availabilityQuery.data ?? []).map((type) => (
                  <SelectItem key={type.roomTypeId} value={type.roomTypeId}>
                    {type.name}
                    {type.available > 0 ? ` · ${type.available} available` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="room-type-change-plan">Eligible Rate Plan</Label>
            <Select
              value={ratePlanId || undefined}
              onValueChange={(value) => {
                setRatePlanId(value);
                setImpact(null);
              }}
            >
              <SelectTrigger id="room-type-change-plan">
                <SelectValue placeholder="Select a rate plan" />
              </SelectTrigger>
              <SelectContent>
                {(plansQuery.data ?? []).map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.code} · {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reviewed && impact ? (
            <div
              className="rounded-md border border-[#DDD4C5] bg-[#FBF8F2] p-3"
              data-testid="room-type-change-impact"
            >
              <p className="mb-2 font-medium">Current → Proposed</p>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
                <dt>Room Type</dt>
                <dd>
                  {impact.current.roomTypeName} → {impact.proposed.roomTypeName}
                </dd>
                <dt>Rate Plan</dt>
                <dd>
                  {impact.current.ratePlanName ?? "—"} → {impact.proposed.ratePlanName ?? "—"}
                </dd>
                <dt>Rate / night</dt>
                <dd>
                  {moneyOrDash(money, impact.current.nightly)} →{" "}
                  {moneyOrDash(money, impact.proposed.nightly)}
                </dd>
                <dt>Stay total</dt>
                <dd>
                  {moneyOrDash(money, impact.current.stayTotal)} →{" "}
                  {moneyOrDash(money, impact.proposed.stayTotal)}
                </dd>
                <dt>Payment requirement</dt>
                <dd>
                  {moneyOrDash(money, impact.current.paymentRequirement)} →{" "}
                  {moneyOrDash(money, impact.proposed.paymentRequirement)}
                </dd>
                <dt>Package impact</dt>
                <dd>
                  <p>{impact.packageImpact}</p>
                  {impact.packages.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {impact.packages.map((line) => (
                        <li
                          key={line.id}
                          data-testid={line.kept ? "package-kept" : "package-incompatible"}
                        >
                          {line.kept ? "Kept" : "Incompatible"} · {line.name} ·{" "}
                          {moneyOrDash(money, line.amount)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </dd>
                <dt>Availability</dt>
                <dd>{impact.availability}</dd>
              </dl>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {reviewed ? (
            <Button
              type="button"
              data-testid="room-type-change-confirm"
              disabled={confirm.isPending || !impact?.proposed.ratePlanId}
              onClick={() => confirm.mutate()}
            >
              Confirm Change
            </Button>
          ) : (
            <Button
              type="button"
              data-testid="room-type-change-review"
              disabled={review.isPending || !roomTypeId || !ratePlanId}
              onClick={() => review.mutate()}
            >
              Review Impact
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
