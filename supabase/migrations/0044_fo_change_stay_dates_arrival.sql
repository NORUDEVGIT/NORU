-- FO-API1 — Arrival-shift dates (Issue #48).
--
-- RPC-only. Replaces departure-only change_hotel_stay_dates with an atomic
-- arrival + departure writer. No new tables or columns (arrival_date and
-- departure_date already exist).
--
-- Postgres cannot CREATE OR REPLACE a changed argument list: drop the 4-arg
-- function, then create the 5-arg one.
--
-- Does NOT rewrite nightly_rate_snapshot / room_subtotal (no invented package
-- math; AMD1 out of scope).
--
-- Do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0044_fo_change_stay_dates_arrival.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.change_hotel_stay_dates(uuid, uuid, date, date, uuid);
--   -- then restore the 4-arg function from drizzle/migrations/0014_front_office_operations.sql
--   ALTER TABLE public.hotel_reservation_history DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
--   ALTER TABLE public.hotel_reservation_history ADD CONSTRAINT hotel_reservation_history_event_check
--     CHECK (event_type IN (
--       'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
--       'check_in','check_out','room_moved','stay_extended','stay_shortened','no_show','repriced'
--     ));

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed','no_show','repriced'
  ));

DROP FUNCTION IF EXISTS public.change_hotel_stay_dates(uuid, uuid, date, uuid);

CREATE FUNCTION public.change_hotel_stay_dates(
  _restaurant_id uuid,
  _reservation_id uuid,
  _arrival date,
  _departure date,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  previous_nights integer;
  next_nights integer;
  history_event text;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF _arrival = existing.arrival_date AND _departure = existing.departure_date THEN
    RAISE EXCEPTION 'DATES_UNCHANGED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, existing.room_type_id, existing.room_id,
    _arrival, _departure, existing.id
  );

  IF existing.room_id IS NOT NULL THEN
    PERFORM public.assert_room_assignable(
      _restaurant_id, existing.room_id, existing.room_type_id,
      _arrival, _departure, existing.id
    );
  END IF;

  UPDATE public.hotel_reservations
  SET arrival_date = _arrival,
      departure_date = _departure
  WHERE id = existing.id
  RETURNING * INTO updated;

  previous_nights := existing.departure_date - existing.arrival_date;
  next_nights := _departure - _arrival;
  history_event := CASE
    WHEN next_nights > previous_nights THEN 'stay_extended'
    WHEN next_nights < previous_nights THEN 'stay_shortened'
    ELSE 'stay_dates_changed'
  END;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, history_event,
    jsonb_build_object(
      'arrival_date', existing.arrival_date,
      'departure_date', existing.departure_date
    ),
    jsonb_build_object(
      'arrival_date', _arrival,
      'departure_date', _departure
    ),
    _membership_id
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid) TO service_role;

COMMENT ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid) IS
  'FO-API1: atomic arrival + departure stay-date writer. Does not reprice.';
