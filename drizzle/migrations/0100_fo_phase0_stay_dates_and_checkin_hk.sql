-- FO Phase 0 — stay-date RPC alignment + HK guest_check_in on check-in RPC.
-- Dual-lane. No new tables. Does not reprice. Does not replace the availability engine.
--
-- Stay dates: drizzle 0014 still published the 4-arg departure-only function.
-- Canonical runtime is the 5-arg writer from supabase/migrations/0044.
-- This migration is idempotent: drop 4-arg if present, CREATE OR REPLACE 5-arg.
--
-- Check-in: Housekeeping-owned transition via pms_housekeeping_transition_target.
-- FO must not UPDATE hotel_rooms.housekeeping_status outside this RPC.

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed',
    'no_show','repriced','expected_arrival_updated','late_checkout_updated'
  ));

DROP FUNCTION IF EXISTS public.change_hotel_stay_dates(uuid, uuid, date, uuid);

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
  'FO-API1 / Phase 0: atomic arrival + departure stay-date writer. Does not reprice.';

CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
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
  target_room uuid;
  room public.hotel_rooms%ROWTYPE;
  target_status text;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.departure_date <= existing.arrival_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  target_room := COALESCE(_room_id, existing.room_id);
  IF target_room IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  PERFORM public.assert_room_assignable(
    _restaurant_id, target_room, existing.room_type_id,
    existing.arrival_date, existing.departure_date, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_id = target_room, status = 'checked_in'
  WHERE id = existing.id
  RETURNING * INTO updated;

  IF existing.room_id IS DISTINCT FROM target_room THEN
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, existing.id,
      CASE WHEN existing.room_id IS NULL THEN 'room_assigned' ELSE 'room_changed' END,
      jsonb_build_object('room_id', existing.room_id),
      jsonb_build_object('room_id', target_room),
      _membership_id
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_in',
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', 'checked_in', 'room_id', target_room),
    _membership_id
  );

  PERFORM public.open_folio_for_reservation(_restaurant_id, existing.id, _membership_id);

  -- Housekeeping-owned transition. Fallback is the current HK status so
  -- properties without Card2 settings do not change readiness on check-in.
  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = target_room AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF FOUND THEN
    target_status := public.pms_housekeeping_transition_target(
      _restaurant_id, 'guest_check_in', room.housekeeping_status
    );
    IF target_status IS NOT NULL
      AND target_status IN ('dirty', 'clean', 'inspected', 'pickup')
      AND room.housekeeping_status <> target_status
    THEN
      UPDATE public.hotel_rooms SET housekeeping_status = target_status WHERE id = room.id;
      IF target_status = 'dirty' THEN
        INSERT INTO public.housekeeping_history (
          restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
        ) VALUES (
          _restaurant_id, room.id, 'room_dirty',
          jsonb_build_object('housekeeping_status', room.housekeeping_status),
          jsonb_build_object(
            'housekeeping_status', target_status,
            'reservation_id', existing.id,
            'automatic_transition', true,
            'event_code', 'guest_check_in'
          ),
          _membership_id
        );
      END IF;
    END IF;
  END IF;

  RETURN updated;
END;
$$;
