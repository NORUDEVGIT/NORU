-- STAY-08E: Front Office commands target one hotel_reservation_rooms row.
-- Unit status uses the reservation vocabulary. The master status is a rollup.
-- Folio and package attribution are unchanged. STAY-08F is not in this migration.
-- Apply 0154 and 0155 before this file.

ALTER TABLE public.hotel_reservation_rooms
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.hotel_reservation_rooms AS unit
SET status = reservation.status
FROM public.hotel_reservations AS reservation
WHERE unit.reservation_id = reservation.id
  AND unit.restaurant_id = reservation.restaurant_id
  AND unit.status IS NULL
  AND reservation.status IN (
    'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
  );

UPDATE public.hotel_reservation_rooms
SET status = 'pending'
WHERE status IS NULL;

ALTER TABLE public.hotel_reservation_rooms
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.hotel_reservation_rooms
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.hotel_reservation_rooms
  DROP CONSTRAINT IF EXISTS hotel_reservation_rooms_status_check;

ALTER TABLE public.hotel_reservation_rooms
  ADD CONSTRAINT hotel_reservation_rooms_status_check
  CHECK (status IN (
    'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
  ));

-- A new unit inserted while the booking is still pending or confirmed
-- starts at the booking status. An in-house booking keeps a new unit pending.
CREATE OR REPLACE FUNCTION public.hotel_reservation_rooms_align_insert_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  master_status text;
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    SELECT reservation.status
    INTO master_status
    FROM public.hotel_reservations reservation
    WHERE reservation.id = NEW.reservation_id
      AND reservation.restaurant_id = NEW.restaurant_id;
    IF master_status IN ('pending', 'confirmed') THEN
      NEW.status := master_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_reservation_rooms_align_insert_status
  ON public.hotel_reservation_rooms;

CREATE TRIGGER hotel_reservation_rooms_align_insert_status
  BEFORE INSERT ON public.hotel_reservation_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.hotel_reservation_rooms_align_insert_status();

CREATE OR REPLACE FUNCTION public.resolve_reservation_room_unit(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid
)
RETURNS public.hotel_reservation_rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit public.hotel_reservation_rooms%ROWTYPE;
  unit_count integer;
BEGIN
  SELECT count(*)
  INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  IF _reservation_room_id IS NOT NULL THEN
    SELECT *
    INTO unit
    FROM public.hotel_reservation_rooms
    WHERE id = _reservation_room_id
      AND restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
    END IF;
    RETURN unit;
  END IF;

  IF unit_count = 0 THEN
    RETURN NULL;
  END IF;

  IF unit_count = 1 THEN
    SELECT *
    INTO unit
    FROM public.hotel_reservation_rooms
    WHERE restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id;
    RETURN unit;
  END IF;

  RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
END;
$$;

CREATE OR REPLACE FUNCTION public.rollup_hotel_reservation_status(
  _restaurant_id uuid,
  _reservation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_count integer;
  rolled text;
  first_room uuid;
BEGIN
  SELECT count(*)
  INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  IF unit_count = 0 THEN
    SELECT status
    INTO rolled
    FROM public.hotel_reservations
    WHERE id = _reservation_id
      AND restaurant_id = _restaurant_id;
    RETURN rolled;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status <> 'cancelled'
  ) THEN
    rolled := 'cancelled';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status NOT IN ('cancelled', 'no_show')
  ) AND EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status = 'no_show'
  ) THEN
    rolled := 'no_show';
  ELSIF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status = 'checked_in'
  ) THEN
    rolled := 'checked_in';
  ELSIF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status = 'checked_out'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status IN ('pending', 'confirmed', 'checked_in')
  ) THEN
    rolled := 'checked_out';
  ELSIF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.status = 'confirmed'
  ) THEN
    rolled := 'confirmed';
  ELSE
    rolled := 'pending';
  END IF;

  SELECT unit.room_id
  INTO first_room
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id
  ORDER BY unit.unit_sequence
  LIMIT 1;

  UPDATE public.hotel_reservations
  SET status = rolled,
      room_id = first_room
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id;

  RETURN rolled;
END;
$$;

-- Other bookings use assert_room_assignable. A sibling unit on this booking
-- is excluded by that reservation id, so it is checked here.
CREATE OR REPLACE FUNCTION public.assert_reservation_room_unit_room(
  _restaurant_id uuid,
  _reservation_id uuid,
  _unit_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _room_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.assert_room_assignable(
    _restaurant_id,
    _room_id,
    _room_type_id,
    _arrival,
    _departure,
    _reservation_id
  );

  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms sibling
    WHERE sibling.restaurant_id = _restaurant_id
      AND sibling.reservation_id = _reservation_id
      AND sibling.id <> _unit_id
      AND sibling.room_id = _room_id
      AND sibling.status IN ('pending', 'confirmed', 'checked_in')
      AND sibling.arrival_date < _departure
      AND sibling.departure_date > _arrival
  ) THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_hotel_reservation_room_unit(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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

  IF unit.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF unit.room_id IS NOT DISTINCT FROM _room_id THEN
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    RETURN updated;
  END IF;

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

DROP FUNCTION IF EXISTS public.check_in_hotel_reservation(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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
  target_room uuid;
  room public.hotel_rooms%ROWTYPE;
  target_status text;
  previous_room uuid;
  previous_status text;
  unit_context jsonb;
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

  previous_status := existing.status;
  unit := public.resolve_reservation_room_unit(
    _restaurant_id, _reservation_id, _reservation_room_id
  );

  IF unit.id IS NULL THEN
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
    previous_room := existing.room_id;
    unit_context := '{}'::jsonb;
  ELSE
    IF unit.status <> 'confirmed' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF unit.departure_date <= unit.arrival_date THEN
      RAISE EXCEPTION 'INVALID_DATES';
    END IF;
    target_room := COALESCE(_room_id, unit.room_id);
    IF target_room IS NULL THEN
      RAISE EXCEPTION 'ROOM_REQUIRED';
    END IF;
    PERFORM public.assert_reservation_room_unit_room(
      _restaurant_id,
      existing.id,
      unit.id,
      target_room,
      unit.room_type_id,
      unit.arrival_date,
      unit.departure_date
    );
    previous_room := unit.room_id;
    UPDATE public.hotel_reservation_rooms
    SET room_id = target_room, status = 'checked_in'
    WHERE id = unit.id;
    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    unit_context := jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    );
  END IF;

  IF previous_room IS DISTINCT FROM target_room THEN
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, existing.id,
      CASE WHEN previous_room IS NULL THEN 'room_assigned' ELSE 'room_changed' END,
      jsonb_build_object('room_id', previous_room) || unit_context,
      jsonb_build_object('room_id', target_room) || unit_context,
      _membership_id
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_in',
    jsonb_build_object('status', CASE WHEN unit.id IS NULL THEN existing.status ELSE unit.status END) || unit_context,
    jsonb_build_object('status', 'checked_in', 'room_id', target_room) || unit_context,
    _membership_id
  );

  -- The first check-in opens the reservation folio. A later room on the same
  -- stay does not call it again, so the existing room charge is not re-appended.
  IF unit.id IS NULL OR previous_status IS DISTINCT FROM 'checked_in' THEN
    PERFORM public.open_folio_for_reservation(_restaurant_id, existing.id, _membership_id);
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = target_room
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF FOUND THEN
    target_status := public.pms_housekeeping_transition_target(
      _restaurant_id, 'guest_check_in', room.housekeeping_status
    );
    IF target_status IS NOT NULL
      AND target_status IN ('dirty', 'clean', 'inspected', 'pickup')
      AND room.housekeeping_status <> target_status
    THEN
      UPDATE public.hotel_rooms
      SET housekeeping_status = target_status
      WHERE id = room.id;
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
          ) || unit_context,
          _membership_id
        );
      END IF;
    END IF;
  END IF;

  RETURN updated;
END;
$$;

DROP FUNCTION IF EXISTS public.check_out_hotel_reservation(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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
  room public.hotel_rooms%ROWTYPE;
  task_id uuid;
  target_status text;
  departure_priority text;
  target_room uuid;
  unit_context jsonb;
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
    IF existing.status <> 'checked_in' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    UPDATE public.hotel_reservations
    SET status = 'checked_out'
    WHERE id = existing.id
    RETURNING * INTO updated;
    target_room := existing.room_id;
    unit_context := '{}'::jsonb;
  ELSE
    IF unit.status <> 'checked_in' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    UPDATE public.hotel_reservation_rooms
    SET status = 'checked_out'
    WHERE id = unit.id;
    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    target_room := unit.room_id;
    unit_context := jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_out',
    jsonb_build_object(
      'status', CASE WHEN unit.id IS NULL THEN existing.status ELSE 'checked_in' END,
      'room_id', target_room
    ) || unit_context,
    jsonb_build_object('status', 'checked_out') || unit_context,
    _membership_id
  );

  IF target_room IS NOT NULL THEN
    SELECT *
    INTO room
    FROM public.hotel_rooms
    WHERE id = target_room
      AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF FOUND THEN
      target_status := public.pms_housekeeping_transition_target(
        _restaurant_id, 'guest_check_out', 'dirty'
      );
      IF target_status IS NOT NULL AND room.housekeeping_status <> target_status THEN
        UPDATE public.hotel_rooms
        SET housekeeping_status = target_status
        WHERE id = room.id;
        INSERT INTO public.housekeeping_history (
          restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
        ) VALUES (
          _restaurant_id, room.id, 'room_dirty',
          jsonb_build_object('housekeeping_status', room.housekeeping_status),
          jsonb_build_object(
            'housekeeping_status', target_status,
            'reservation_id', existing.id,
            'automatic_transition', true
          ) || unit_context,
          _membership_id
        );
      END IF;
      departure_priority := COALESCE(
        public.pms_housekeeping_event_priority(_restaurant_id, 'departure', 'normal'),
        'normal'
      );
      task_id := public.housekeeping_create_task(
        _restaurant_id, room.id, 'departure_cleaning', departure_priority, NULL, _membership_id
      );
    END IF;
  END IF;

  RETURN updated;
END;
$$;

DROP FUNCTION IF EXISTS public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.move_hotel_reservation_room(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _reason text,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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
  previous_room uuid;
  unit_context jsonb;
BEGIN
  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

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
    IF existing.status <> 'checked_in' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF existing.room_id = _room_id THEN
      RAISE EXCEPTION 'SAME_ROOM';
    END IF;
    PERFORM public.assert_room_assignable(
      _restaurant_id, _room_id, existing.room_type_id,
      existing.arrival_date, existing.departure_date, existing.id
    );
    UPDATE public.hotel_reservations
    SET room_id = _room_id
    WHERE id = existing.id
    RETURNING * INTO updated;
    previous_room := existing.room_id;
    unit_context := '{}'::jsonb;
  ELSE
    IF unit.status <> 'checked_in' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF unit.room_id = _room_id THEN
      RAISE EXCEPTION 'SAME_ROOM';
    END IF;
    PERFORM public.assert_reservation_room_unit_room(
      _restaurant_id,
      existing.id,
      unit.id,
      _room_id,
      unit.room_type_id,
      unit.arrival_date,
      unit.departure_date
    );
    previous_room := unit.room_id;
    UPDATE public.hotel_reservation_rooms
    SET room_id = _room_id
    WHERE id = unit.id;
    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    unit_context := jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'room_moved',
    jsonb_build_object('room_id', previous_room) || unit_context,
    jsonb_build_object('room_id', _room_id) || unit_context,
    btrim(_reason),
    _membership_id
  );

  RETURN updated;
END;
$$;

DROP FUNCTION IF EXISTS public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.mark_hotel_reservation_no_show(
  _restaurant_id uuid,
  _reservation_id uuid,
  _business_date date,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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
  unit_context jsonb;
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
    unit_context := '{}'::jsonb;
  ELSE
    IF unit.status <> 'confirmed' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF unit.arrival_date >= _business_date THEN
      RAISE EXCEPTION 'NOT_PAST_DUE';
    END IF;
    UPDATE public.hotel_reservation_rooms
    SET status = 'no_show',
        room_id = NULL
    WHERE id = unit.id;
    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    unit_context := jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'no_show',
    jsonb_build_object(
      'status', CASE WHEN unit.id IS NULL THEN existing.status ELSE unit.status END
    ) || unit_context,
    jsonb_build_object('status', 'no_show') || unit_context,
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_hotel_reservation_unit(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reason text,
  _membership_id uuid,
  _reservation_room_id uuid DEFAULT NULL
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
  rolled text;
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

  IF unit.status = 'cancelled' THEN
    SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
    RETURN updated;
  END IF;

  IF unit.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  UPDATE public.hotel_reservation_rooms
  SET status = 'cancelled',
      room_id = NULL
  WHERE id = unit.id;

  rolled := public.rollup_hotel_reservation_status(_restaurant_id, existing.id);

  IF rolled = 'cancelled' THEN
    UPDATE public.hotel_reservations
    SET cancellation_reason = NULLIF(btrim(_reason), '')
    WHERE id = existing.id
      AND restaurant_id = _restaurant_id;
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'cancelled',
    jsonb_build_object(
      'status', unit.status,
      'room_id', unit.room_id,
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    ),
    jsonb_build_object(
      'status', 'cancelled',
      'room_id', NULL,
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    ),
    NULLIF(btrim(_reason), ''),
    _membership_id
  );

  SELECT * INTO updated FROM public.hotel_reservations WHERE id = existing.id;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_reservation_room_unit(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollup_hotel_reservation_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_reservation_room_unit_room(uuid, uuid, uuid, uuid, uuid, date, date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_hotel_reservation_unit(uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_reservation_room_unit(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollup_hotel_reservation_status(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_reservation_room_unit_room(uuid, uuid, uuid, uuid, uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_hotel_reservation_room_unit(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_hotel_reservation_unit(uuid, uuid, text, uuid, uuid) TO service_role;
