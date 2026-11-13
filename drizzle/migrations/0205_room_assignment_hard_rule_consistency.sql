-- Room assignment hard-rule consistency.
--
-- Assignment Eligibility (pms_evaluate_room_assignment) enforces the
-- occupancy and housekeeping hard rules when they are configured for the
-- property. The server-side safety check that every reservation write path
-- runs, assert_room_assignable, never received guest counts and never read the
-- housekeeping rules, so a room that Assignment Eligibility refuses could still
-- be accepted when it arrived already selected: a reservation created with a
-- room, an amended reservation, a room assignment, a check-in or a room move.
--
-- This migration adds one internal helper that asks the existing canonical
-- function for its verdict and raises a staff-facing domain error for the two
-- blockers that the safety check did not cover. No rule logic is copied: the
-- occupancy comparison, the housekeeping readiness test and the property
-- toggles all stay inside pms_evaluate_room_assignment.
--
-- The helper runs only when a room is newly selected or when something that
-- the rule depends on changed. Re-saving an unrelated field on a reservation
-- that already holds a room is not re-checked, so an in-house stay in a dirty
-- room, or a future stay whose room is dirty today, can still be edited.
--
-- assert_room_assignable keeps its signature and behaviour. Sellable, room
-- type, maintenance, out-of-order / out-of-service, overlap and block checks
-- are unchanged and still run first. change_hotel_stay_dates does not select a
-- room and is not changed.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

CREATE OR REPLACE FUNCTION public.pms_assert_room_assignment_hard_rules(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid,
  _adults integer,
  _children integer,
  _check_occupancy boolean DEFAULT true,
  _check_housekeeping boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  occupancy_rule_on boolean := false;
  housekeeping_rule_on boolean := false;
  evaluation jsonb;
BEGIN
  IF _room_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(rules.require_occupancy_match, false),
    COALESCE(rules.require_housekeeping_readiness, false)
      OR COALESCE(rules.housekeeping_affects_assignment, false)
  INTO occupancy_rule_on, housekeeping_rule_on
  FROM public.pms_inventory_rules rules
  WHERE rules.restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  occupancy_rule_on := occupancy_rule_on AND COALESCE(_check_occupancy, false);
  housekeeping_rule_on := housekeeping_rule_on AND COALESCE(_check_housekeeping, false);

  -- Nothing configured that this call enforces: behave exactly as before.
  IF NOT occupancy_rule_on AND NOT housekeeping_rule_on THEN
    RETURN;
  END IF;

  evaluation := public.pms_evaluate_room_assignment(
    _restaurant_id => _restaurant_id,
    _room_id => _room_id,
    _room_type_id => _room_type_id,
    _arrival => _arrival,
    _departure => _departure,
    _exclude_reservation_id => _exclude_reservation_id,
    _adults => _adults,
    _children => _children,
    _for_check_in => false
  );

  IF occupancy_rule_on AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(evaluation->'blockers', '[]'::jsonb)) blocker
    WHERE blocker->>'code' = 'OCCUPANCY_EXCEEDED'
  ) THEN
    RAISE EXCEPTION 'ROOM_CAPACITY_EXCEEDED';
  END IF;

  IF housekeeping_rule_on AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(evaluation->'blockers', '[]'::jsonb)) blocker
    WHERE blocker->>'code' = 'HOUSEKEEPING_NOT_READY'
  ) THEN
    RAISE EXCEPTION 'ROOM_HOUSEKEEPING_NOT_READY';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean
) TO service_role;

COMMENT ON FUNCTION public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean
) IS
  'Raises ROOM_CAPACITY_EXCEEDED or ROOM_HOUSEKEEPING_NOT_READY when the canonical room assignment evaluation reports the matching blocker and the property rule is on. Called by reservation write paths when a room is selected.';

-- Create: every preassigned room unit is checked with that unit's guest count.
CREATE OR REPLACE FUNCTION public.assert_reservation_room_units(
  _restaurant_id uuid,
  _reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  demand_row record;
  assigned_row record;
  available_count integer;
  explicit_overbooking boolean;
BEGIN
  explicit_overbooking := current_setting('noru.overbooking_requested', true) = '1';

  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
      AND unit.room_id IS NOT NULL
    GROUP BY unit.room_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;

  FOR demand_row IN
    SELECT
      room_unit.room_type_id,
      room_unit.arrival_date,
      room_unit.departure_date,
      count(*) FILTER (WHERE room_unit.room_id IS NULL)::integer AS unassigned_need
    FROM public.hotel_reservation_rooms room_unit
    WHERE room_unit.restaurant_id = _restaurant_id
      AND room_unit.reservation_id = _reservation_id
    GROUP BY room_unit.room_type_id, room_unit.arrival_date, room_unit.departure_date
  LOOP
    IF COALESCE(demand_row.unassigned_need, 0) > 0 THEN
      available_count := public.pms_count_available_inventory(
        _restaurant_id,
        demand_row.room_type_id,
        demand_row.arrival_date,
        demand_row.departure_date,
        _reservation_id
      );
      IF demand_row.unassigned_need > available_count AND NOT explicit_overbooking THEN
        RAISE EXCEPTION 'NO_AVAILABILITY';
      END IF;
    END IF;
  END LOOP;

  FOR assigned_row IN
    SELECT
      room_unit.room_id,
      room_unit.room_type_id,
      room_unit.arrival_date,
      room_unit.departure_date,
      room_unit.adults,
      room_unit.children
    FROM public.hotel_reservation_rooms room_unit
    WHERE room_unit.restaurant_id = _restaurant_id
      AND room_unit.reservation_id = _reservation_id
      AND room_unit.room_id IS NOT NULL
  LOOP
    PERFORM public.assert_room_assignable(
      _restaurant_id,
      assigned_row.room_id,
      assigned_row.room_type_id,
      assigned_row.arrival_date,
      assigned_row.departure_date,
      _reservation_id
    );
    PERFORM public.pms_assert_room_assignment_hard_rules(
      _restaurant_id,
      assigned_row.room_id,
      assigned_row.room_type_id,
      assigned_row.arrival_date,
      assigned_row.departure_date,
      _reservation_id,
      assigned_row.adults,
      assigned_row.children
    );
  END LOOP;
END;
$$;

-- Assign Room, check-in and room move all select a room for one reservation
-- room unit through this function.
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
DECLARE
  unit_adults integer;
  unit_children integer;
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

  SELECT unit.adults, unit.children
  INTO unit_adults, unit_children
  FROM public.hotel_reservation_rooms unit
  WHERE unit.id = _unit_id
    AND unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id;

  PERFORM public.pms_assert_room_assignment_hard_rules(
    _restaurant_id,
    _room_id,
    _room_type_id,
    _arrival,
    _departure,
    _reservation_id,
    unit_adults,
    unit_children
  );
END;
$$;

-- Amend: the room is checked when it is newly selected or changed. Occupancy
-- is also checked when the guest count changes. An unrelated edit on a
-- reservation that keeps the same room and the same guests is not re-checked.
CREATE OR REPLACE FUNCTION public.amend_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
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
  room_selected boolean;
  guests_changed boolean;
BEGIN
  INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;

  PERFORM 1 FROM public.hotel_reservation_counters
  WHERE restaurant_id = _restaurant_id FOR UPDATE;

  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, _room_type_id, _room_id, _arrival, _departure, existing.id
  );

  IF _room_id IS NOT NULL THEN
    room_selected := existing.room_id IS DISTINCT FROM _room_id;
    guests_changed := existing.adults IS DISTINCT FROM _adults
      OR existing.children IS DISTINCT FROM _children;

    IF room_selected OR guests_changed THEN
      PERFORM public.pms_assert_room_assignment_hard_rules(
        _restaurant_id, _room_id, _room_type_id, _arrival, _departure, existing.id,
        _adults, _children,
        _check_occupancy => true,
        _check_housekeeping => room_selected
      );
    END IF;
  END IF;

  UPDATE public.hotel_reservations
  SET room_type_id = _room_type_id,
      room_id = _room_id,
      arrival_date = _arrival,
      departure_date = _departure,
      adults = _adults,
      children = _children,
      special_requests = _special_requests,
      notes = _notes
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id,
    CASE
      WHEN existing.room_id IS DISTINCT FROM updated.room_id AND existing.room_id IS NULL THEN 'room_assigned'
      WHEN existing.room_id IS DISTINCT FROM updated.room_id THEN 'room_changed'
      ELSE 'amended'
    END,
    jsonb_build_object(
      'arrival_date', existing.arrival_date, 'departure_date', existing.departure_date,
      'adults', existing.adults, 'children', existing.children,
      'room_type_id', existing.room_type_id, 'room_id', existing.room_id,
      'special_requests', existing.special_requests, 'notes', existing.notes
    ),
    jsonb_build_object(
      'arrival_date', updated.arrival_date, 'departure_date', updated.departure_date,
      'adults', updated.adults, 'children', updated.children,
      'room_type_id', updated.room_type_id, 'room_id', updated.room_id,
      'special_requests', updated.special_requests, 'notes', updated.notes
    ),
    _membership_id
  );

  RETURN updated;
END;
$$;
