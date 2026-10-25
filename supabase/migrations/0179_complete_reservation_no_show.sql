-- Atomic, unit-aware Front Office no-show completion.
-- Sequential after 0178. Dual-lane copy:
--   supabase/migrations/0179_complete_reservation_no_show.sql
--
-- IN THE PR ONLY — do not apply from an agent.
-- This preserves mark_hotel_reservation_no_show for older callers and gives
-- completeFoNoShow one transactional status, assignment, and audit writer.

CREATE OR REPLACE FUNCTION public.complete_hotel_reservation_no_show(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid,
  _reason text,
  _additional_notes text DEFAULT NULL,
  _reservation_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  property_business_date date;
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  unit_count integer;
  previous_status text;
  previous_room_id uuid;
  audit_id uuid;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  clean_notes text := NULLIF(btrim(COALESCE(_additional_notes, '')), '');
  unit_context jsonb := '{}'::jsonb;
BEGIN
  IF clean_reason IS NULL OR char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_NO_SHOW_REASON';
  END IF;

  SELECT COALESCE(
    r.business_date,
    (now() AT TIME ZONE COALESCE(NULLIF(r.timezone, ''), 'UTC'))::date
  )
  INTO property_business_date
  FROM public.restaurants r
  WHERE r.id = _restaurant_id
  FOR SHARE;

  IF property_business_date IS NULL THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
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

  SELECT count(*)
  INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  IF unit_count > 1 AND _reservation_room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
  END IF;

  unit := public.resolve_reservation_room_unit(
    _restaurant_id,
    _reservation_id,
    _reservation_room_id
  );

  IF unit.id IS NULL THEN
    IF existing.status <> 'confirmed' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF existing.arrival_date >= property_business_date THEN
      RAISE EXCEPTION 'NOT_PAST_DUE';
    END IF;

    previous_status := existing.status;
    previous_room_id := existing.room_id;
    UPDATE public.hotel_reservations
    SET status = 'no_show',
        room_id = NULL
    WHERE id = existing.id
      AND restaurant_id = _restaurant_id
    RETURNING * INTO updated;
  ELSE
    IF unit.status <> 'confirmed' THEN
      RAISE EXCEPTION 'INVALID_TRANSITION';
    END IF;
    IF unit.arrival_date >= property_business_date THEN
      RAISE EXCEPTION 'NOT_PAST_DUE';
    END IF;

    previous_status := unit.status;
    previous_room_id := unit.room_id;
    UPDATE public.hotel_reservation_rooms
    SET status = 'no_show',
        room_id = NULL
    WHERE id = unit.id
      AND restaurant_id = _restaurant_id
      AND reservation_id = _reservation_id;

    PERFORM public.rollup_hotel_reservation_status(_restaurant_id, existing.id);

    -- Master room_id is a compatibility projection. Keep the first remaining
    -- active assigned unit, without changing physical room or housekeeping state.
    UPDATE public.hotel_reservations reservation
    SET room_id = (
      SELECT sibling.room_id
      FROM public.hotel_reservation_rooms sibling
      WHERE sibling.restaurant_id = _restaurant_id
        AND sibling.reservation_id = _reservation_id
        AND sibling.status IN ('pending', 'confirmed', 'checked_in')
        AND sibling.room_id IS NOT NULL
      ORDER BY sibling.unit_sequence
      LIMIT 1
    )
    WHERE reservation.id = existing.id
      AND reservation.restaurant_id = _restaurant_id;

    SELECT *
    INTO updated
    FROM public.hotel_reservations
    WHERE id = existing.id
      AND restaurant_id = _restaurant_id;

    unit_context := jsonb_build_object(
      'reservation_room_id', unit.id,
      'unit_sequence', unit.unit_sequence
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id,
    reservation_id,
    event_type,
    previous_values,
    new_values,
    notes,
    actor_membership_id
  ) VALUES (
    _restaurant_id,
    existing.id,
    'no_show',
    jsonb_build_object(
      'status', previous_status,
      'room_id', previous_room_id
    ) || unit_context,
    jsonb_build_object(
      'status', 'no_show',
      'room_id', NULL,
      'no_show_reason', clean_reason,
      'additional_notes', clean_notes,
      'business_date', property_business_date
    ) || unit_context,
    CASE
      WHEN clean_notes IS NULL THEN clean_reason
      ELSE clean_reason || ': ' || clean_notes
    END,
    _membership_id
  )
  RETURNING id INTO audit_id;

  RETURN jsonb_build_object(
    'id', updated.id,
    'reservation_status', updated.status,
    'reservation_room_id', unit.id,
    'unit_status', CASE WHEN unit.id IS NULL THEN NULL ELSE 'no_show' END,
    'released_room_id', previous_room_id,
    'business_date', property_business_date,
    'history_id', audit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_hotel_reservation_no_show(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_hotel_reservation_no_show(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;
