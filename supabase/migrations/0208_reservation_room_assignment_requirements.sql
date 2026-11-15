-- Reservation room units can record whether the stay requires an accessible
-- room or a connecting room. These are stay requirements, not room
-- capabilities. Existing units default to false, so assignment behaviour is
-- unchanged until a later phase reads the columns.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

ALTER TABLE public.hotel_reservation_rooms
  ADD COLUMN IF NOT EXISTS accessible_room_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connecting_room_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hotel_reservation_rooms.accessible_room_required IS
  'Whether this reservation room unit requires an accessible room for assignment. This is a reservation requirement, not a room capability.';

COMMENT ON COLUMN public.hotel_reservation_rooms.connecting_room_required IS
  'Whether this reservation room unit requires a room with connecting-room capability. This is a reservation requirement, not a room capability.';
