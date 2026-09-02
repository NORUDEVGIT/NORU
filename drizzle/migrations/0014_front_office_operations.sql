-- Phase 6E — Front Office operations. Operational statuses, derived occupancy, safe transitions.

ALTER TABLE public.hotel_reservations DROP CONSTRAINT hotel_reservations_status_check;
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_status_check
  CHECK (status IN ('pending','confirmed','cancelled','checked_in','checked_out','no_show'));

ALTER TABLE public.hotel_reservations DROP CONSTRAINT hotel_reservations_source_check;
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_source_check
  CHECK (source IN ('staff','walk_in','future_online'));

ALTER TABLE public.hotel_reservation_history DROP CONSTRAINT hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','no_show'
  ));

-- Checked-in stays block inventory exactly like pending/confirmed ones.
CREATE OR REPLACE FUNCTION public.count_reserved_rooms(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.hotel_reservations res
  WHERE res.restaurant_id = _restaurant_id
    AND res.room_type_id = _room_type_id
    AND res.status IN ('pending','confirmed','checked_in')
    AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
    AND res.arrival_date < _departure
    AND res.departure_date > _arrival;
$$;

CREATE OR REPLACE FUNCTION public.assert_reservation_capacity(
  _restaurant_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sellable integer;
  reserved integer;
  room_ok boolean;
  room_clash integer;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  sellable := public.count_sellable_rooms(_restaurant_id, _room_type_id);
  reserved := public.count_reserved_rooms(_restaurant_id, _room_type_id, _arrival, _departure, _exclude_reservation_id);

  IF sellable - reserved <= 0 THEN
    RAISE EXCEPTION 'NO_AVAILABILITY';
  END IF;

  IF _room_id IS NOT NULL THEN
    SELECT true INTO room_ok
    FROM public.hotel_rooms r
    WHERE r.id = _room_id
      AND r.restaurant_id = _restaurant_id
      AND r.room_type_id = _room_type_id
      AND r.active = true
      AND r.status = 'available';

    IF room_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
    END IF;

    SELECT count(*) INTO room_clash
    FROM public.hotel_reservations res
    WHERE res.restaurant_id = _restaurant_id
      AND res.room_id = _room_id
      AND res.status IN ('pending','confirmed','checked_in')
      AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
      AND res.arrival_date < _departure
      AND res.departure_date > _arrival;

    IF room_clash > 0 THEN
      RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
    END IF;
  END IF;
END;
$$;

-- Shared room guard: locks the physical room and re-checks restrictions + conflicts.
CREATE OR REPLACE FUNCTION public.assert_room_assignable(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  clash integer;
BEGIN
  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND
     OR room.room_type_id <> _room_type_id
     OR room.active IS NOT TRUE
     OR room.status <> 'available' THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;

  SELECT count(*) INTO clash
  FROM public.hotel_reservations res
  WHERE res.restaurant_id = _restaurant_id
    AND res.room_id = _room_id
    AND res.status IN ('pending','confirmed','checked_in')
    AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
    AND res.arrival_date < _departure
    AND res.departure_date > _arrival;

  IF clash > 0 THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;
END;
$$;

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

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
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
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  UPDATE public.hotel_reservations
  SET status = 'checked_out'
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_out',
    jsonb_build_object('status', existing.status, 'room_id', existing.room_id),
    jsonb_build_object('status', 'checked_out'),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_hotel_reservation_room(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _reason text,
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
BEGIN
  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.room_id = _room_id THEN
    RAISE EXCEPTION 'SAME_ROOM';
  END IF;

  -- Same room type only in this phase: a type change would affect pricing.
  PERFORM public.assert_room_assignable(
    _restaurant_id, _room_id, existing.room_type_id,
    existing.arrival_date, existing.departure_date, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_id = _room_id
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'room_moved',
    jsonb_build_object('room_id', existing.room_id),
    jsonb_build_object('room_id', _room_id),
    btrim(_reason),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_hotel_stay_dates(
  _restaurant_id uuid,
  _reservation_id uuid,
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
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF _departure <= existing.arrival_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF _departure = existing.departure_date THEN
    RAISE EXCEPTION 'DATES_UNCHANGED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, existing.room_type_id, existing.room_id,
    existing.arrival_date, _departure, existing.id
  );

  IF existing.room_id IS NOT NULL THEN
    PERFORM public.assert_room_assignable(
      _restaurant_id, existing.room_id, existing.room_type_id,
      existing.arrival_date, _departure, existing.id
    );
  END IF;

  UPDATE public.hotel_reservations
  SET departure_date = _departure
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id,
    CASE WHEN _departure > existing.departure_date THEN 'stay_extended' ELSE 'stay_shortened' END,
    jsonb_build_object('departure_date', existing.departure_date),
    jsonb_build_object('departure_date', _departure),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_hotel_reservation_no_show(
  _restaurant_id uuid,
  _reservation_id uuid,
  _business_date date,
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

  IF existing.arrival_date >= _business_date THEN
    RAISE EXCEPTION 'NOT_PAST_DUE';
  END IF;

  UPDATE public.hotel_reservations
  SET status = 'no_show'
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'no_show',
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', 'no_show'),
    _membership_id
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid) TO service_role;
