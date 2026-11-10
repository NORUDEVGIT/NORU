-- NORU-DATA-INTEGRITY-01: atomic whole-booking cancellation through room units.
--
-- hotel_reservation_rooms owns stay status. hotel_reservations.status is the
-- rollup written only by rollup_hotel_reservation_status. Direct booking used to
-- set the header to cancelled and leave the units live, so a later unit-level
-- operation could roll the header back to confirmed.
--
-- This function cancels every cancellable unit by calling the canonical
-- cancel_hotel_reservation_unit (unit update, rollup, history row per unit).
-- It runs in one transaction: any failure rolls back every unit and the header.
-- It never writes hotel_reservations.status itself.
--
-- Transition rule (same as cancel_hotel_reservation_unit):
--   pending, confirmed          -> cancelled
--   cancelled                   -> left unchanged (idempotent)
--   checked_in, checked_out, no_show
--                               -> the whole booking is rejected with
--                                  INVALID_TRANSITION; nothing is changed.
--
-- No schema change. Additive function only.

CREATE OR REPLACE FUNCTION public.cancel_hotel_reservation_all_units(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reason text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  unit_row public.hotel_reservation_rooms%ROWTYPE;
  unit_count integer;
  open_count integer;
  terminal_count integer;
  live_after integer;
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

  -- Lock every unit so a concurrent unit operation cannot interleave.
  PERFORM 1
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;

  SELECT
    count(*),
    count(*) FILTER (WHERE status IN ('pending', 'confirmed')),
    count(*) FILTER (WHERE status NOT IN ('pending', 'confirmed', 'cancelled'))
  INTO unit_count, open_count, terminal_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  -- The rollup has no unit to derive from, so there is nothing to cancel safely.
  IF unit_count = 0 THEN
    RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
  END IF;

  -- A started, finished or no-show stay is history. Do not overwrite it.
  IF terminal_count > 0 THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  FOR unit_row IN
    SELECT *
    FROM public.hotel_reservation_rooms
    WHERE restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id
      AND status IN ('pending', 'confirmed')
    ORDER BY unit_sequence
  LOOP
    PERFORM public.cancel_hotel_reservation_unit(
      _restaurant_id, _reservation_id, _reason, _membership_id, unit_row.id
    );
  END LOOP;

  -- Already fully cancelled: run the canonical rollup so the header agrees.
  IF open_count = 0 THEN
    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, _reservation_id);
  END IF;

  SELECT count(*)
  INTO live_after
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
    AND status <> 'cancelled';

  SELECT *
  INTO updated
  FROM public.hotel_reservations
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id;

  -- Defence in depth: never commit header and units that disagree.
  IF live_after > 0 OR updated.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'CANCELLATION_INCONSISTENT';
  END IF;

  RETURN updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_hotel_reservation_all_units(uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_hotel_reservation_all_units(uuid, uuid, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.cancel_hotel_reservation_all_units(uuid, uuid, text, uuid) IS
  'Atomically cancels every pending/confirmed room unit via cancel_hotel_reservation_unit; the header is derived by rollup_hotel_reservation_status. Rejects started, finished or no-show stays.';
