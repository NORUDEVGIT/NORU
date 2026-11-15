-- Room requirement final enforcement.
--
-- Each reservation room unit stores accessible_room_required and
-- connecting_room_required (0208). Assignment Eligibility already evaluates
-- them through pms_evaluate_room_assignment, but the final write paths only
-- enforced occupancy and housekeeping (0205). A room refused by the candidate
-- list could still be accepted when it arrived already selected.
--
-- This migration extends the existing hard-rule helper with the two stored
-- requirement values. The helper still calls the canonical evaluator once; the
-- accessible-room test and the connecting-room test (hotel_room_links,
-- kind = 'connecting') stay inside pms_evaluate_room_assignment and are not
-- copied. A requirement blocks only when the unit requires it and the property
-- rule (require_accessibility_match / require_connecting_room_match) is on.
--
-- Requirement values always come from the stored room unit, never from the
-- caller:
--   * assert_reservation_room_unit_room (Assign Room, check-in, room move)
--     reads the unit it is asked to check.
--   * assert_reservation_room_units (create with a preassigned room) reads
--     every assigned unit.
--   * amend_hotel_reservation reads the only unit when the room changes. A
--     reservation with more than one unit raises ROOM_UNIT_REQUIRED instead of
--     guessing which room is meant.
--   * A trigger on hotel_reservation_rooms re-checks a unit whenever it gains
--     a room or a requirement is turned on while it holds a room. This covers
--     the requirement save after create (0209) and the requirement edit on an
--     assigned room. A requirement turned off is never blocked.
--
-- Occupancy and housekeeping behaviour from 0205 is unchanged. Sellable, room
-- type, maintenance, out-of-order / out-of-service, overlap and block checks
-- are unchanged and still run first.
--
-- 0205, 0208 and 0209 are not edited. The helper changes signature, so the
-- 10-argument version is dropped and the 12-argument version is created with
-- the same server-only grants.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY — do not apply from an agent.

DROP FUNCTION IF EXISTS public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean
);

CREATE FUNCTION public.pms_assert_room_assignment_hard_rules(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid,
  _adults integer,
  _children integer,
  _check_occupancy boolean DEFAULT true,
  _check_housekeeping boolean DEFAULT true,
  _accessible_required boolean DEFAULT false,
  _connecting_required boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  occupancy_rule_on boolean := false;
  housekeeping_rule_on boolean := false;
  accessibility_rule_on boolean := false;
  connecting_rule_on boolean := false;
  evaluation jsonb;
BEGIN
  IF _room_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(rules.require_occupancy_match, false),
    COALESCE(rules.require_housekeeping_readiness, false)
      OR COALESCE(rules.housekeeping_affects_assignment, false),
    COALESCE(rules.require_accessibility_match, false),
    COALESCE(rules.require_connecting_room_match, false)
  INTO occupancy_rule_on, housekeeping_rule_on, accessibility_rule_on, connecting_rule_on
  FROM public.pms_inventory_rules rules
  WHERE rules.restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  occupancy_rule_on := occupancy_rule_on AND COALESCE(_check_occupancy, false);
  housekeeping_rule_on := housekeeping_rule_on AND COALESCE(_check_housekeeping, false);
  accessibility_rule_on := accessibility_rule_on AND COALESCE(_accessible_required, false);
  connecting_rule_on := connecting_rule_on AND COALESCE(_connecting_required, false);

  -- Nothing configured that this call enforces: behave exactly as before.
  IF NOT occupancy_rule_on
     AND NOT housekeeping_rule_on
     AND NOT accessibility_rule_on
     AND NOT connecting_rule_on THEN
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
    _accessible_required => accessibility_rule_on,
    _connecting_required => connecting_rule_on,
    _for_check_in => false
  );

  -- A stay requirement is checked before the operational rules so a room that
  -- can never serve this stay is reported as such.
  IF accessibility_rule_on AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(evaluation->'blockers', '[]'::jsonb)) blocker
    WHERE blocker->>'code' = 'ACCESSIBILITY_MISMATCH'
  ) THEN
    RAISE EXCEPTION 'ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET';
  END IF;

  IF connecting_rule_on AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(evaluation->'blockers', '[]'::jsonb)) blocker
    WHERE blocker->>'code' = 'CONNECTING_ROOM_REQUIRED'
  ) THEN
    RAISE EXCEPTION 'ROOM_CONNECTING_REQUIREMENT_NOT_MET';
  END IF;

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
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean, boolean, boolean
) TO service_role;

COMMENT ON FUNCTION public.pms_assert_room_assignment_hard_rules(
  uuid, uuid, uuid, date, date, uuid, integer, integer, boolean, boolean, boolean, boolean
) IS
  'Raises ROOM_ACCESSIBILITY_REQUIREMENT_NOT_MET, ROOM_CONNECTING_REQUIREMENT_NOT_MET, ROOM_CAPACITY_EXCEEDED or ROOM_HOUSEKEEPING_NOT_READY when the canonical room assignment evaluation reports the matching blocker and the property rule is on. Requirement values must come from the stored reservation room unit.';

-- Create: every preassigned room unit is checked with that unit's guest count
-- and stored requirements.
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
      room_unit.children,
      room_unit.accessible_room_required,
      room_unit.connecting_room_required
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
      assigned_row.children,
      _accessible_required => COALESCE(assigned_row.accessible_room_required, false),
      _connecting_required => COALESCE(assigned_row.connecting_room_required, false)
    );
  END LOOP;
END;
$$;

-- Assign Room, check-in and room move all select a room for one reservation
-- room unit through this function. The unit's own stored requirements apply.
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
  unit_accessible_required boolean;
  unit_connecting_required boolean;
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

  SELECT unit.adults, unit.children, unit.accessible_room_required, unit.connecting_room_required
  INTO unit_adults, unit_children, unit_accessible_required, unit_connecting_required
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
    unit_children,
    _accessible_required => COALESCE(unit_accessible_required, false),
    _connecting_required => COALESCE(unit_connecting_required, false)
  );
END;
$$;

-- Amend: the room is checked when it is newly selected or changed. Occupancy
-- is also checked when the guest count changes. An unrelated edit on a
-- reservation that keeps the same room and the same guests is not re-checked.
-- A room change uses the requirements stored on the reservation's only unit.
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
  unit_count integer := 0;
  unit_accessible_required boolean := false;
  unit_connecting_required boolean := false;
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

    IF room_selected THEN
      SELECT count(*)::integer
      INTO unit_count
      FROM public.hotel_reservation_rooms unit
      WHERE unit.restaurant_id = _restaurant_id
        AND unit.reservation_id = existing.id;

      IF unit_count > 1 THEN
        RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
      END IF;

      IF unit_count = 1 THEN
        SELECT
          COALESCE(unit.accessible_room_required, false),
          COALESCE(unit.connecting_room_required, false)
        INTO unit_accessible_required, unit_connecting_required
        FROM public.hotel_reservation_rooms unit
        WHERE unit.restaurant_id = _restaurant_id
          AND unit.reservation_id = existing.id;
      END IF;
    END IF;

    IF room_selected OR guests_changed THEN
      PERFORM public.pms_assert_room_assignment_hard_rules(
        _restaurant_id, _room_id, _room_type_id, _arrival, _departure, existing.id,
        _adults, _children,
        _check_occupancy => true,
        _check_housekeeping => room_selected,
        _accessible_required => room_selected AND unit_accessible_required,
        _connecting_required => room_selected AND unit_connecting_required
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

-- Backstop on the room unit itself. Whatever path writes the row, a unit that
-- holds a room on an active stay cannot end up with a hard requirement that
-- the room does not meet. Checked when the unit gains or changes room (stored
-- requirements) and when a requirement is turned on (only the newly required
-- ones, so an older assignment is not re-judged by an unrelated save). Turning
-- a requirement off never blocks. Occupancy and housekeeping stay with the
-- write paths that already check them.
CREATE OR REPLACE FUNCTION public.pms_enforce_room_unit_requirements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  check_accessible boolean := false;
  check_connecting boolean := false;
BEGIN
  IF NEW.room_id IS NULL
     OR NEW.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    check_accessible := COALESCE(NEW.accessible_room_required, false);
    check_connecting := COALESCE(NEW.connecting_room_required, false);
  ELSE
    check_accessible := COALESCE(NEW.accessible_room_required, false)
      AND NOT COALESCE(OLD.accessible_room_required, false);
    check_connecting := COALESCE(NEW.connecting_room_required, false)
      AND NOT COALESCE(OLD.connecting_room_required, false);
  END IF;

  IF NOT check_accessible AND NOT check_connecting THEN
    RETURN NEW;
  END IF;

  PERFORM public.pms_assert_room_assignment_hard_rules(
    NEW.restaurant_id,
    NEW.room_id,
    NEW.room_type_id,
    NEW.arrival_date,
    NEW.departure_date,
    NEW.reservation_id,
    NEW.adults,
    NEW.children,
    _check_occupancy => false,
    _check_housekeeping => false,
    _accessible_required => check_accessible,
    _connecting_required => check_connecting
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_enforce_room_unit_requirements()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pms_enforce_room_unit_requirements() IS
  'Trigger: refuses a reservation room unit that holds a room failing its stored accessible / connecting room requirement while the property rule is on.';

DROP TRIGGER IF EXISTS trg_hotel_reservation_rooms_requirements
  ON public.hotel_reservation_rooms;
CREATE TRIGGER trg_hotel_reservation_rooms_requirements
  BEFORE INSERT OR UPDATE OF room_id, accessible_room_required, connecting_room_required
  ON public.hotel_reservation_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_enforce_room_unit_requirements();
