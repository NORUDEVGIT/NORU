import { addDays } from "@/packages/pms/lib/reservation-dates";

/** Create Reservation launch context. Standard is the Reservations desk default. */
export type ReservationCreateMode = "standard" | "walk-in";

export function isWalkInCreateMode(mode: ReservationCreateMode | null | undefined): boolean {
  return mode === "walk-in";
}

/**
 * Walk-in seeds only. Commercial booking source stays on the New Reservation controls.
 * `businessDate` must already be the property business date.
 */
export function walkInCreateDefaults(businessDate: string) {
  return {
    arrival: businessDate,
    departure: addDays(businessDate, 1),
    adults: 1,
    children: 0,
    status: "confirmed" as const,
    source: "walk_in" as const,
  };
}
