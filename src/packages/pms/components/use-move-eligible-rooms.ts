import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listReservationRoomDisplay } from "@/packages/pms/lib/reservation-room-display.functions";
import { listAssignableRooms } from "@/packages/pms/lib/reservations.functions";

/** The stay being dragged. Eligibility is resolved for this unit, not for a generic vacancy list. */
export type MoveDragStay = {
  reservationId: string;
  reservationRoomId: string | null;
  roomId: string | null;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
};

/**
 * Rooms the existing assignment read already marks eligible for this stay.
 * A unit id uses the reservation-room display read. A header stay uses the
 * same assignable-room read the move confirmation sheet uses.
 */
export function useMoveEligibleRoomIds(
  restaurantId: string,
  stay: MoveDragStay | null,
): Set<string> | null {
  const loadDisplay = useServerFn(listReservationRoomDisplay);
  const loadAssignable = useServerFn(listAssignableRooms);
  const query = useQuery({
    queryKey: [
      "move-eligible-rooms",
      restaurantId,
      stay?.reservationId ?? null,
      stay?.reservationRoomId ?? null,
      stay?.roomTypeId ?? null,
      stay?.arrivalDate ?? null,
      stay?.departureDate ?? null,
    ],
    enabled: Boolean(
      stay && stay.roomTypeId && stay.arrivalDate && stay.departureDate > stay.arrivalDate,
    ),
    queryFn: async () => {
      if (!stay) return [] as string[];
      if (stay.reservationRoomId) {
        const rows = await loadDisplay({
          data: {
            restaurantId,
            reservationId: stay.reservationId,
            reservationRoomId: stay.reservationRoomId,
          },
        });
        return rows.filter((row) => row.eligible).map((row) => row.id);
      }
      const rows = await loadAssignable({
        data: {
          restaurantId,
          roomTypeId: stay.roomTypeId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.reservationId,
        },
      });
      return rows.map((row) => row.id);
    },
    staleTime: 15_000,
  });
  if (!stay || !query.data) return null;
  return new Set(query.data);
}
