-- FO-03: in-house stay dates must move the matching room units, then reprice
-- and reconcile through the existing Rate and Cashiering functions.
-- change_hotel_stay_dates still does not calculate a price.
-- apply_inhouse_stay_date_change is the one transaction Front Office calls.
-- An early-departure penalty on the rate plan is recorded and is not posted
-- as a second folio charge. Room-charge correction stays in reconcile.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

CREATE OR REPLACE FUNCTION public.change_hotel_stay_dates(
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

  UPDATE public.hotel_reservation_rooms
     SET arrival_date = _arrival,
         departure_date = _departure
   WHERE restaurant_id = _restaurant_id
     AND reservation_id = existing.id
     AND status NOT IN ('cancelled', 'no_show', 'checked_out')
     AND arrival_date = existing.arrival_date
     AND departure_date = existing.departure_date;

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

COMMENT ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, date, uuid) IS
  'FO-03: atomic stay-date writer. Aligns active room units that share the previous master dates. Does not reprice.';

CREATE OR REPLACE FUNCTION public.apply_inhouse_stay_date_change(
  _restaurant_id uuid,
  _reservation_id uuid,
  _arrival date,
  _departure date,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  active_count integer;
  affected_count integer;
  previous_subtotal numeric;
  next_subtotal numeric;
  penalty_type text;
BEGIN
  SELECT * INTO existing
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
    AND status NOT IN ('cancelled', 'no_show', 'checked_out');

  SELECT count(*) INTO affected_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
    AND status NOT IN ('cancelled', 'no_show', 'checked_out')
    AND arrival_date = existing.arrival_date
    AND departure_date = existing.departure_date;

  IF active_count > 0 AND affected_count <> active_count THEN
    RAISE EXCEPTION 'UNIT_DATES_DIVERGED';
  END IF;

  FOR unit IN
    SELECT *
    FROM public.hotel_reservation_rooms
    WHERE restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id
      AND status NOT IN ('cancelled', 'no_show', 'checked_out')
      AND arrival_date = existing.arrival_date
      AND departure_date = existing.departure_date
  LOOP
    IF unit.rate_plan_id IS NULL THEN
      RAISE EXCEPTION 'RATE_PLAN_REQUIRED';
    END IF;
    PERFORM public.assert_reservation_unit_room_charge_reconcilable(
      _restaurant_id, _reservation_id, unit.id
    );
  END LOOP;

  previous_subtotal := round(COALESCE(existing.room_subtotal, 0), 2);
  penalty_type := COALESCE(existing.early_departure_policy_snapshot->>'penalty_type', 'none');

  PERFORM public.change_hotel_stay_dates(
    _restaurant_id, _reservation_id, _arrival, _departure, _membership_id
  );

  FOR unit IN
    SELECT *
    FROM public.hotel_reservation_rooms
    WHERE restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id
      AND status NOT IN ('cancelled', 'no_show', 'checked_out')
      AND arrival_date = _arrival
      AND departure_date = _departure
  LOOP
    PERFORM public.reprice_hotel_reservation_room(
      _restaurant_id,
      _reservation_id,
      unit.id,
      unit.rate_plan_id,
      _membership_id
    );
    PERFORM public.reconcile_reservation_unit_room_charge(
      _restaurant_id,
      _reservation_id,
      unit.id,
      _membership_id
    );
  END LOOP;

  SELECT room_subtotal INTO next_subtotal
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'amended',
    jsonb_build_object(
      'room_subtotal', previous_subtotal,
      'early_departure_penalty_type', penalty_type,
      'early_departure_penalty_posted', false
    ),
    jsonb_build_object(
      'room_subtotal', round(COALESCE(next_subtotal, 0), 2),
      'early_departure_penalty_type', penalty_type,
      'early_departure_penalty_posted', false,
      'room_charge_reconciled', affected_count > 0
    ),
    _membership_id
  );

  RETURN jsonb_build_object(
    'id', _reservation_id,
    'arrival', _arrival,
    'departure', _departure,
    'previous_room_subtotal', previous_subtotal,
    'room_subtotal', round(COALESCE(next_subtotal, 0), 2),
    'early_departure_penalty_posted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inhouse_stay_date_change(uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_inhouse_stay_date_change(uuid, uuid, date, date, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_inhouse_stay_date_change(uuid, uuid, date, date, uuid) IS
  'FO-03: one transaction for in-house dates. Writes dates, reprices each matching room through reprice_hotel_reservation_room, then reconciles a posted room charge. Does not post an early-departure penalty.';
