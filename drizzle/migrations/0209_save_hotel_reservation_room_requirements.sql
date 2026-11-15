-- Save reservation room requirements atomically.
--
-- Create Reservation stores accessible_room_required and connecting_room_required
-- on each room unit after the create RPC returns. This function saves every
-- requested unit in one call: all units are validated first, then updated in a
-- single statement. Any failure raises and rolls back the whole call, so no unit
-- keeps a partial change.
--
-- _units is a jsonb array. Every entry must give unit_sequence (integer >= 1) and
-- both requirement values as JSON booleans. Nothing is defaulted.
--
-- Server only. The application calls it through the service_role client. The
-- project default privileges grant EXECUTE on new public functions to anon and
-- authenticated, so those grants are revoked here explicitly.
--
-- No table, column, assignment or eligibility change.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.

CREATE OR REPLACE FUNCTION public.save_hotel_reservation_room_requirements(
  _restaurant_id uuid,
  _reservation_id uuid,
  _units jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  entry jsonb;
  entry_count integer;
  distinct_count integer;
  found_count integer;
  blocked_count integer;
  updated_count integer;
BEGIN
  IF _restaurant_id IS NULL OR _reservation_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIREMENTS_INVALID';
  END IF;
  IF _units IS NULL OR jsonb_typeof(_units) <> 'array' THEN
    RAISE EXCEPTION 'ROOM_REQUIREMENTS_INVALID';
  END IF;
  entry_count := jsonb_array_length(_units);
  IF entry_count < 1 OR entry_count > 50 THEN
    RAISE EXCEPTION 'ROOM_REQUIREMENTS_INVALID';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(_units) LOOP
    IF jsonb_typeof(entry) <> 'object'
       OR jsonb_typeof(entry -> 'unit_sequence') IS DISTINCT FROM 'number'
       OR jsonb_typeof(entry -> 'accessible_room_required') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(entry -> 'connecting_room_required') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'ROOM_REQUIREMENTS_INVALID';
    END IF;
    IF (entry ->> 'unit_sequence')::numeric <> trunc((entry ->> 'unit_sequence')::numeric)
       OR (entry ->> 'unit_sequence')::numeric < 1
       OR (entry ->> 'unit_sequence')::numeric > 1000 THEN
      RAISE EXCEPTION 'ROOM_REQUIREMENTS_INVALID';
    END IF;
  END LOOP;

  SELECT count(DISTINCT (value ->> 'unit_sequence')::integer)
    INTO distinct_count
  FROM jsonb_array_elements(_units);
  IF distinct_count <> entry_count THEN
    RAISE EXCEPTION 'ROOM_REQUIREMENTS_DUPLICATE_UNIT';
  END IF;

  PERFORM 1
  FROM public.hotel_reservations
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  WITH requested AS (
    SELECT (value ->> 'unit_sequence')::integer AS unit_sequence
    FROM jsonb_array_elements(_units)
  ),
  locked AS (
    SELECT room.unit_sequence, room.status
    FROM public.hotel_reservation_rooms room
    JOIN requested USING (unit_sequence)
    WHERE room.reservation_id = _reservation_id
      AND room.restaurant_id = _restaurant_id
    FOR UPDATE OF room
  )
  SELECT count(*), count(*) FILTER (WHERE status NOT IN ('pending', 'confirmed'))
    INTO found_count, blocked_count
  FROM locked;
  IF found_count <> entry_count THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;
  IF blocked_count > 0 THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_EDITABLE';
  END IF;

  UPDATE public.hotel_reservation_rooms room
  SET accessible_room_required = (requested.value ->> 'accessible_room_required')::boolean,
      connecting_room_required = (requested.value ->> 'connecting_room_required')::boolean
  FROM jsonb_array_elements(_units) AS requested(value)
  WHERE room.reservation_id = _reservation_id
    AND room.restaurant_id = _restaurant_id
    AND room.unit_sequence = (requested.value ->> 'unit_sequence')::integer;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> entry_count THEN
    RAISE EXCEPTION 'ROOM_REQUIREMENTS_INCOMPLETE';
  END IF;

  RETURN jsonb_build_object(
    'reservation_id', _reservation_id,
    'units_updated', updated_count
  );
END;
$$;

COMMENT ON FUNCTION public.save_hotel_reservation_room_requirements(uuid, uuid, jsonb) IS
  'Saves accessible_room_required and connecting_room_required for the listed room units of one reservation. All units or none. Server only.';

REVOKE ALL ON FUNCTION public.save_hotel_reservation_room_requirements(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_hotel_reservation_room_requirements(uuid, uuid, jsonb)
  TO service_role;
