import { nightsBetween } from "@/packages/pms/lib/reservation-dates";

export type StayAmendmentResult = {
  previousNights: number;
  nextNights: number;
  previousAdults: number;
  nextAdults: number;
  previousChildren: number;
  nextChildren: number;
  previousInfants: number;
  nextInfants: number;
  currency: string | null;
  previousRoomSubtotal: number | null;
  nextRoomSubtotal: number | null;
  roomSubtotalDelta: number | null;
};

function moneyNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildStayAmendmentResult(input: {
  previousArrival: string;
  nextArrival: string;
  previousDeparture: string;
  nextDeparture: string;
  previousAdults: number;
  nextAdults: number;
  previousChildren: number;
  nextChildren: number;
  previousInfants: number;
  nextInfants: number;
  currency: string | null;
  previousRoomSubtotal: unknown;
  nextRoomSubtotal: unknown;
}): StayAmendmentResult | null {
  const stayChanged =
    input.previousArrival !== input.nextArrival ||
    input.previousDeparture !== input.nextDeparture ||
    input.previousAdults !== input.nextAdults ||
    input.previousChildren !== input.nextChildren ||
    input.previousInfants !== input.nextInfants;
  if (!stayChanged) return null;

  const previousRoomSubtotal = moneyNumber(input.previousRoomSubtotal);
  const nextRoomSubtotal = moneyNumber(input.nextRoomSubtotal);
  return {
    previousNights: nightsBetween(input.previousArrival, input.previousDeparture),
    nextNights: nightsBetween(input.nextArrival, input.nextDeparture),
    previousAdults: input.previousAdults,
    nextAdults: input.nextAdults,
    previousChildren: input.previousChildren,
    nextChildren: input.nextChildren,
    previousInfants: input.previousInfants,
    nextInfants: input.nextInfants,
    currency: input.currency,
    previousRoomSubtotal,
    nextRoomSubtotal,
    roomSubtotalDelta:
      previousRoomSubtotal == null || nextRoomSubtotal == null
        ? null
        : round2(nextRoomSubtotal - previousRoomSubtotal),
  };
}
