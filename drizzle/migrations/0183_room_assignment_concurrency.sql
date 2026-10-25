-- FO-06: assign one reservation room only if the caller's snapshot is still current.
-- The existing room eligibility assertion locks the target hotel room, so the
-- eligibility recheck and assignment are serialized for concurrent staff actions.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

DROP FUNCTION IF EXISTS public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid);

CREATE FUNCTION public.assign_hotel_reservation_room_unit(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL,
  _expected_room_id uuid DEFAULT NULL,
  _expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
BEGIN
  SELECT *
  INTO existing
  FROM public.hotel_reservations
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  unit := public.resolve_reservation_room_unit(
    _restaurant_id, _reservation_id, _reservation_room_id
  );

  IF unit.id IS NULL THEN
    RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
  END IF;

  IF _expected_updated_at IS NOT NULL
     AND existing.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'ASSIGNMENT_STALE';
  END IF;

  IF _expected_room_id IS NOT NULL
     AND unit.room_id IS DISTINCT FROM _expected_room_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_STALE';
  END IF;

  IF unit.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF unit.room_id IS NOT DISTINCT FROM _room_id THEN
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    RETURN updated;
  END IF;

  -- assert_reservation_room_unit_room -> assert_room_assignable locks the
  -- selected hotel_rooms row before it checks overlap and eligibility.
  PERFORM public.assert_reservation_room_unit_room(
    _restaurant_id,
    existing.id,
    unit.id,
    _room_id,
    unit.room_type_id,
    unit.arrival_date,
    unit.departure_date
  );

  UPDATE public.hotel_reservation_rooms
  SET room_id = _room_id
  WHERE id = unit.id;

  PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);

  SELECT *
  INTO updated
  FROM public.hotel_reservations
  WHERE id = existing.id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    existing.id,
    CASE WHEN unit.room_id IS NULL THEN 'room_assigned' ELSE 'room_changed' END,
    jsonb_build_object('room_id', unit.room_id),
    jsonb_build_object(
      'room_id', _room_id,
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    ),
    _membership_id
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz)
  TO service_role;
