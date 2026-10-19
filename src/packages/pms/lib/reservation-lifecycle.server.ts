import { resolvePropertyBusinessDate } from "@/packages/pms/lib/reservation-workspace/business-date";
import { reservationMutationBlock } from "@/packages/pms/lib/reservation-lifecycle";
import { reservationError } from "@/packages/pms/lib/reservations.server";

type QueryResult = { data: unknown; error: { message: string } | null };

type StayReader = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<QueryResult>;
        };
        maybeSingle: () => Promise<QueryResult>;
      };
    };
  };
};

/** Reject ordinary Reservation Detail writes for closed and past-unarrived stays. */
export async function assertReservationDetailEditable(
  db: unknown,
  restaurantId: string,
  reservationId: string,
): Promise<void> {
  const client = db as StayReader;
  const stay = await client
    .from("hotel_reservations")
    .select("status, arrival_date")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (stay.error) throw new Error(stay.error.message);
  const stayRow = stay.data as { status?: string; arrival_date?: string } | null;
  if (!stayRow?.status || !stayRow.arrival_date) throw reservationError("RESERVATION_NOT_FOUND");

  const property = await client
    .from("restaurants")
    .select("timezone, business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  if (property.error) throw new Error(property.error.message);
  const propertyRow = property.data as {
    timezone?: string | null;
    business_date?: string | null;
  } | null;
  const businessDate = resolvePropertyBusinessDate(
    propertyRow?.business_date ? String(propertyRow.business_date).slice(0, 10) : null,
    propertyRow?.timezone || "UTC",
  );
  const block = reservationMutationBlock({
    status: stayRow.status,
    arrivalDate: stayRow.arrival_date,
    businessDate,
  });
  if (block) throw reservationError(block);
}
