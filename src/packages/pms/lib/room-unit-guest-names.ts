import { isMissingSchemaError } from "./pms-set2-structure";
import { roomGuestDisplayName } from "./reservation-room-occupants";
import type { ReservationRoomOccupant } from "./reservation-room-units";

type GuestNameClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        in: (
          column: string,
          values: string[],
        ) => PromiseLike<{
          data: unknown[] | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/** Guest name recorded on each room unit. Empty when that unit has no occupant. */
export async function unitOccupantNames(
  supabase: GuestNameClient,
  restaurantId: string,
  reservationRoomIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (reservationRoomIds.length === 0) return names;
  const occupantResult = await supabase
    .from("hotel_reservation_room_guests")
    .select("reservation_room_id, guest_id, is_primary")
    .eq("restaurant_id", restaurantId)
    .in("reservation_room_id", reservationRoomIds);
  if (occupantResult.error && !isMissingSchemaError(occupantResult.error)) {
    throw new Error(occupantResult.error.message);
  }
  const occupantRows = (occupantResult.error ? [] : (occupantResult.data ?? [])) as Array<{
    reservation_room_id: string;
    guest_id: string;
    is_primary: boolean;
  }>;
  const guestIds = [...new Set(occupantRows.map((row) => row.guest_id))];
  const profileResult =
    guestIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("guest_profiles")
          .select("id, first_name, last_name")
          .eq("restaurant_id", restaurantId)
          .in("id", guestIds);
  if (profileResult.error) throw new Error(profileResult.error.message);
  const profileNames = new Map(
    ((profileResult.data ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>).map((profile) => [
      profile.id,
      [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || "Guest",
    ]),
  );
  const byUnit = new Map<string, ReservationRoomOccupant[]>();
  for (const row of occupantRows) {
    const list = byUnit.get(row.reservation_room_id) ?? [];
    list.push({
      guestId: row.guest_id,
      name: profileNames.get(row.guest_id) ?? "Guest",
      isPrimary: row.is_primary,
    });
    byUnit.set(row.reservation_room_id, list);
  }
  for (const [unitId, occupants] of byUnit) {
    const name = roomGuestDisplayName(occupants, "");
    if (name) names.set(unitId, name);
  }
  return names;
}
