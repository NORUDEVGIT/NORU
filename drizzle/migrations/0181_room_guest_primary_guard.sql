-- CI1-R04: a room unit cannot drop its primary named guest.
-- Removing the primary is rejected until another occupant is primary.
-- hotel_reservations.guest_id stays the booker. Occupancy counts stay booked.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

CREATE OR REPLACE FUNCTION public.manage_reservation_room_guest(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid,
  _action text,
  _guest_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit public.hotel_reservation_rooms%ROWTYPE;
  occupant public.hotel_reservation_room_guests%ROWTYPE;
  previous_primary uuid;
  named_count integer;
  primary_flag boolean;
BEGIN
  IF _action NOT IN ('add', 'remove', 'set_primary') THEN
    RAISE EXCEPTION 'INVALID_ROOM_GUEST_ACTION';
  END IF;

  SELECT * INTO unit
  FROM public.hotel_reservation_rooms
  WHERE id = _reservation_room_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;

  IF unit.status IN ('cancelled', 'checked_out', 'no_show') THEN
    RAISE EXCEPTION 'ROOM_GUEST_HISTORICAL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_profiles profile
    WHERE profile.id = _guest_id
      AND profile.restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'GUEST_NOT_FOUND';
  END IF;

  SELECT * INTO occupant
  FROM public.hotel_reservation_room_guests
  WHERE reservation_room_id = unit.id
    AND guest_id = _guest_id
  FOR UPDATE;

  IF _action = 'add' THEN
    IF occupant.id IS NOT NULL THEN
      RAISE EXCEPTION 'ROOM_GUEST_DUPLICATE';
    END IF;
    SELECT count(*) INTO named_count
    FROM public.hotel_reservation_room_guests
    WHERE reservation_room_id = unit.id;
    IF named_count >= unit.adults + unit.children THEN
      RAISE EXCEPTION 'OCCUPANT_CAPACITY';
    END IF;
    primary_flag := NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_room_guests primary_occupant
      WHERE primary_occupant.reservation_room_id = unit.id
        AND primary_occupant.is_primary
    );
    INSERT INTO public.hotel_reservation_room_guests (
      restaurant_id, reservation_id, reservation_room_id, guest_id, is_primary
    ) VALUES (
      _restaurant_id, _reservation_id, unit.id, _guest_id, primary_flag
    );
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id,
      _reservation_id,
      'room_guest_added',
      jsonb_build_object(
        'reservation_room_id', unit.id,
        'unit_sequence', unit.unit_sequence,
        'guest_id', _guest_id,
        'is_primary', primary_flag
      ),
      _membership_id
    );
    RETURN;
  END IF;

  IF occupant.id IS NULL THEN
    RAISE EXCEPTION 'ROOM_GUEST_NOT_FOUND';
  END IF;

  IF _action = 'remove' THEN
    IF occupant.is_primary THEN
      RAISE EXCEPTION 'ROOM_GUEST_PRIMARY_REQUIRED';
    END IF;
    DELETE FROM public.hotel_reservation_room_guests
    WHERE reservation_room_id = unit.id
      AND guest_id = _guest_id;
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, actor_membership_id
    ) VALUES (
      _restaurant_id,
      _reservation_id,
      'room_guest_removed',
      jsonb_build_object(
        'reservation_room_id', unit.id,
        'unit_sequence', unit.unit_sequence,
        'guest_id', _guest_id,
        'was_primary', occupant.is_primary
      ),
      _membership_id
    );
    RETURN;
  END IF;

  IF occupant.is_primary THEN
    RETURN;
  END IF;

  SELECT primary_occupant.guest_id INTO previous_primary
  FROM public.hotel_reservation_room_guests primary_occupant
  WHERE primary_occupant.reservation_room_id = unit.id
    AND primary_occupant.is_primary
  FOR UPDATE;

  UPDATE public.hotel_reservation_room_guests
     SET is_primary = false
   WHERE reservation_room_id = unit.id
     AND is_primary;

  UPDATE public.hotel_reservation_room_guests
     SET is_primary = true
   WHERE reservation_room_id = unit.id
     AND guest_id = _guest_id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'room_primary_guest_changed',
    jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence,
      'guest_id', previous_primary
    ),
    jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence,
      'guest_id', _guest_id
    ),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_reservation_room_guest(uuid, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_reservation_room_guest(uuid, uuid, uuid, text, uuid, uuid)
  TO service_role;
