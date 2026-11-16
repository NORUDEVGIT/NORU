-- Reservation room pair enforcement.
--
-- 0212 stores explicit connecting-room pairs between reservation room units
-- (hotel_reservation_room_pairs, one active partner per unit). 0211 stores the
-- physical links between rooms (hotel_room_links, undirected). Until now a pair
-- changed nothing about which rooms a unit could be given.
--
-- This migration makes an active pair decide room eligibility and final
-- assignment, without redesigning anything that already exists:
--
--   * pms_evaluate_room_pairing is the one canonical pair evaluator. For a unit,
--     a candidate room and (optionally) a hypothetical partner room it answers
--     whether the pair can still be satisfied:
--       - partner holds a room   -> the candidate must have a physical
--                                   'connecting' link to that room;
--       - partner holds no room  -> the candidate must have at least one
--                                   physically connected room that the partner
--                                   unit could take. Room eligibility for the
--                                   partner is NOT re-implemented: the existing
--                                   pms_evaluate_room_assignment decides it, with
--                                   the partner unit's own dates, room type,
--                                   guests and accessible requirement. The
--                                   partner room is only looked at, never held.
--     Sellable, room type, occupancy, housekeeping, maintenance, blocks,
--     accessibility and connecting capability all stay inside that function.
--   * pms_assert_reservation_room_pairing turns the verdict into a domain error.
--   * Final enforcement reuses the paths 0210 already protects:
--       - assert_reservation_room_unit_room (Assign Room, check-in, Move Room,
--         rack move) re-checks the pair after the existing hard rules;
--       - a deferred constraint trigger on hotel_reservation_rooms re-checks every
--         unit that gains or changes a room, whichever code wrote it (create with
--         a preassigned room, Edit, group auto-assign, group swap, direct writes).
--         It is deferred so a multi-step change inside one transaction is judged
--         on its final state, never on a half-finished swap;
--       - an insert trigger on hotel_reservation_room_pairs re-checks the units
--         that already hold rooms when a pair is created.
--   * Closes the 0212 date gap: a date change that leaves two paired units with no
--     overlapping nights is refused. The pair is never ended silently.
--   * A physical connecting link cannot be removed (or turned into an adjacent
--     link) while an active pair has its two units on exactly those rooms.
--
-- A pair is enforced only while both units are active (pending, confirmed or
-- checked in). Cancellation and no-show already end the pair (0212); an ended
-- pair enforces nothing. Like the capability rule it extends, pair enforcement
-- applies while the property's require_connecting_room_match rule is on. An
-- unpaired unit with connecting_room_required keeps the existing capability-only
-- behaviour (0210).
--
-- 0210, 0211 and 0212 are not edited. pms_evaluate_room_assignment, the 0210
-- helpers and trigger, hotel_room_links and its undirected index are untouched.
-- assert_reservation_room_unit_room is replaced with the 0210 body plus one call.
--
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.
-- IN THE PR ONLY - do not apply from an agent.

-- ---------------------------------------------------------------------------
-- Canonical pair evaluator
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.pms_evaluate_room_pairing(
  _restaurant_id uuid,
  _reservation_room_id uuid,
  _candidate_room_id uuid,
  _partner_room_id uuid DEFAULT NULL,
  _use_partner_room boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit public.hotel_reservation_rooms%ROWTYPE;
  active_pair public.hotel_reservation_room_pairs%ROWTYPE;
  partner public.hotel_reservation_rooms%ROWTYPE;
  connecting_rule_on boolean := false;
  partner_room uuid;
  partner_room_number text;
  partner_context jsonb;
  blockers jsonb := '[]'::jsonb;
  linked record;
  evaluation jsonb;
  partner_room_found boolean := false;
  not_a_pair constant jsonb := jsonb_build_object(
    'paired', false, 'enforced', false, 'eligible', true, 'blockers', '[]'::jsonb
  );
BEGIN
  IF _reservation_room_id IS NULL OR _candidate_room_id IS NULL THEN
    RETURN not_a_pair;
  END IF;

  SELECT * INTO unit
  FROM public.hotel_reservation_rooms room_unit
  WHERE room_unit.id = _reservation_room_id
    AND room_unit.restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RETURN not_a_pair;
  END IF;

  SELECT * INTO active_pair
  FROM public.hotel_reservation_room_pairs pair_row
  WHERE pair_row.restaurant_id = _restaurant_id
    AND pair_row.ended_at IS NULL
    AND (pair_row.unit_a_id = unit.id OR pair_row.unit_b_id = unit.id);
  IF NOT FOUND THEN
    RETURN not_a_pair;
  END IF;

  SELECT * INTO partner
  FROM public.hotel_reservation_rooms room_unit
  WHERE room_unit.restaurant_id = _restaurant_id
    AND room_unit.id = CASE
      WHEN active_pair.unit_a_id = unit.id THEN active_pair.unit_b_id
      ELSE active_pair.unit_a_id
    END;
  IF NOT FOUND THEN
    RETURN not_a_pair;
  END IF;

  partner_room := CASE WHEN COALESCE(_use_partner_room, false) THEN _partner_room_id ELSE partner.room_id END;

  SELECT room.room_number INTO partner_room_number
  FROM public.hotel_rooms room
  WHERE room.id = partner_room
    AND room.restaurant_id = _restaurant_id;

  partner_context := jsonb_build_object(
    'partnerUnitId', partner.id,
    'partnerUnitSequence', partner.unit_sequence,
    'partnerReservationId', partner.reservation_id,
    'sameReservation', partner.reservation_id = unit.reservation_id,
    'partnerConfirmationNumber', (
      SELECT stay.confirmation_number
      FROM public.hotel_reservations stay
      WHERE stay.id = partner.reservation_id
        AND stay.restaurant_id = _restaurant_id
    ),
    'partnerRoomId', partner_room,
    'partnerRoomNumber', partner_room_number
  );

  -- An inactive unit has no pair to keep. An ended pair never reaches this point.
  IF unit.status NOT IN ('pending', 'confirmed', 'checked_in')
     OR partner.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN jsonb_build_object(
      'paired', true, 'enforced', false, 'eligible', true,
      'blockers', '[]'::jsonb, 'partner', partner_context
    );
  END IF;

  SELECT COALESCE(rules.require_connecting_room_match, false)
  INTO connecting_rule_on
  FROM public.pms_inventory_rules rules
  WHERE rules.restaurant_id = _restaurant_id;

  IF NOT COALESCE(connecting_rule_on, false) THEN
    RETURN jsonb_build_object(
      'paired', true, 'enforced', false, 'eligible', true,
      'blockers', '[]'::jsonb, 'partner', partner_context
    );
  END IF;

  IF partner_room IS NOT NULL THEN
    -- The partner already holds a room: the candidate must connect to it.
    IF _candidate_room_id = partner_room
       OR NOT EXISTS (
         SELECT 1
         FROM public.hotel_room_links link
         WHERE link.restaurant_id = _restaurant_id
           AND link.kind = 'connecting'
           AND (
             (link.room_id = _candidate_room_id AND link.other_room_id = partner_room)
             OR (link.room_id = partner_room AND link.other_room_id = _candidate_room_id)
           )
       ) THEN
      blockers := jsonb_build_array(jsonb_build_object(
        -- Re-checking the room the unit already holds is "the current pair is
        -- no longer valid"; choosing a different room is "must connect to".
        'code', CASE
          WHEN unit.room_id IS NOT DISTINCT FROM _candidate_room_id
               AND NOT COALESCE(_use_partner_room, false)
            THEN 'CONNECTING_PAIR_INVALID'
          ELSE 'CONNECTING_PAIR_MISMATCH'
        END,
        'partnerRoomNumber', partner_room_number
      ));
    END IF;
  ELSE
    -- The partner has no room yet: the candidate needs at least one physically
    -- connected room the partner unit could take. Nothing is reserved.
    FOR linked IN
      SELECT DISTINCT
        CASE WHEN link.room_id = _candidate_room_id THEN link.other_room_id ELSE link.room_id END AS room_id
      FROM public.hotel_room_links link
      WHERE link.restaurant_id = _restaurant_id
        AND link.kind = 'connecting'
        AND (link.room_id = _candidate_room_id OR link.other_room_id = _candidate_room_id)
    LOOP
      evaluation := public.pms_evaluate_room_assignment(
        _restaurant_id => _restaurant_id,
        _room_id => linked.room_id,
        _room_type_id => partner.room_type_id,
        _arrival => partner.arrival_date,
        _departure => partner.departure_date,
        _exclude_reservation_id => partner.reservation_id,
        _adults => partner.adults,
        _children => partner.children,
        _accessible_required => COALESCE(partner.accessible_room_required, false),
        _connecting_required => true,
        _for_check_in => false
      );

      -- The evaluator excludes the partner's whole reservation, which would also
      -- hide a sibling unit holding the room, and it counts the unit being
      -- placed as a claim on the room it is leaving. Claims are therefore judged
      -- here, per unit, leaving every other rule to the evaluator.
      IF NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(evaluation->'blockers', '[]'::jsonb)) blocker
           WHERE blocker->>'code' <> 'ROOM_ALREADY_BOOKED'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.hotel_reservation_rooms claim
           JOIN public.hotel_reservations claim_stay
             ON claim_stay.id = claim.reservation_id
            AND claim_stay.restaurant_id = claim.restaurant_id
           WHERE claim.restaurant_id = _restaurant_id
             AND claim.room_id = linked.room_id
             AND claim.id NOT IN (partner.id, unit.id)
             AND claim_stay.status IN ('pending', 'confirmed', 'checked_in')
             AND claim.arrival_date < partner.departure_date
             AND claim.departure_date > partner.arrival_date
         )
         AND NOT EXISTS (
           SELECT 1
           FROM public.hotel_reservations legacy
           WHERE legacy.restaurant_id = _restaurant_id
             AND legacy.room_id = linked.room_id
             AND legacy.status IN ('pending', 'confirmed', 'checked_in')
             AND legacy.arrival_date < partner.departure_date
             AND legacy.departure_date > partner.arrival_date
             AND NOT EXISTS (
               SELECT 1
               FROM public.hotel_reservation_rooms any_unit
               WHERE any_unit.reservation_id = legacy.id
                 AND any_unit.restaurant_id = legacy.restaurant_id
             )
         ) THEN
        partner_room_found := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT partner_room_found THEN
      blockers := jsonb_build_array(jsonb_build_object('code', 'CONNECTING_PARTNER_UNAVAILABLE'));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'paired', true,
    'enforced', true,
    'eligible', jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'partner', partner_context
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_evaluate_room_pairing(uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_evaluate_room_pairing(uuid, uuid, uuid, uuid, boolean)
  TO service_role;

COMMENT ON FUNCTION public.pms_evaluate_room_pairing(uuid, uuid, uuid, uuid, boolean) IS
  'Canonical reservation room pair evaluator. For a unit with an active connecting pair, says whether a candidate room keeps the pair satisfiable: connected to the partner''s room, or (partner without a room) having a connected room the partner unit is eligible for. Room eligibility itself stays in pms_evaluate_room_assignment.';

-- ---------------------------------------------------------------------------
-- Domain errors
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.pms_assert_reservation_room_pairing(
  _restaurant_id uuid,
  _reservation_room_id uuid,
  _room_id uuid,
  _room_just_selected boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  partner_unit_id uuid;
  evaluation jsonb;
  blocker_code text;
  partner_room_number text;
BEGIN
  IF _reservation_room_id IS NULL OR _room_id IS NULL THEN
    RETURN;
  END IF;

  SELECT CASE
           WHEN pair_row.unit_a_id = _reservation_room_id THEN pair_row.unit_b_id
           ELSE pair_row.unit_a_id
         END
  INTO partner_unit_id
  FROM public.hotel_reservation_room_pairs pair_row
  WHERE pair_row.restaurant_id = _restaurant_id
    AND pair_row.ended_at IS NULL
    AND (pair_row.unit_a_id = _reservation_room_id OR pair_row.unit_b_id = _reservation_room_id);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Fixed lock order (the same as the pair guard), so two writers on one pair
  -- run one after the other and each judges the other's stored room.
  PERFORM 1
  FROM public.hotel_reservation_rooms room_unit
  WHERE room_unit.restaurant_id = _restaurant_id
    AND room_unit.id IN (_reservation_room_id, partner_unit_id)
  ORDER BY room_unit.id
  FOR UPDATE;

  evaluation := public.pms_evaluate_room_pairing(
    _restaurant_id, _reservation_room_id, _room_id
  );

  IF COALESCE((evaluation->>'eligible')::boolean, true) THEN
    RETURN;
  END IF;

  blocker_code := evaluation->'blockers'->0->>'code';
  partner_room_number := COALESCE(evaluation->'blockers'->0->>'partnerRoomNumber', '');

  -- A room that was just chosen for the unit is "must connect to"; a room the
  -- unit already held is "the current pair is no longer valid".
  IF blocker_code = 'CONNECTING_PAIR_MISMATCH'
     OR (blocker_code = 'CONNECTING_PAIR_INVALID' AND COALESCE(_room_just_selected, false)) THEN
    RAISE EXCEPTION 'ROOM_CONNECTING_PAIR_MISMATCH[%]', partner_room_number;
  ELSIF blocker_code = 'CONNECTING_PAIR_INVALID' THEN
    RAISE EXCEPTION 'ROOM_CONNECTING_PAIR_INVALID';
  ELSE
    RAISE EXCEPTION 'ROOM_CONNECTING_PARTNER_UNAVAILABLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_assert_reservation_room_pairing(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_assert_reservation_room_pairing(uuid, uuid, uuid, boolean)
  TO service_role;

COMMENT ON FUNCTION public.pms_assert_reservation_room_pairing(uuid, uuid, uuid, boolean) IS
  'Raises ROOM_CONNECTING_PAIR_MISMATCH[room], ROOM_CONNECTING_PAIR_INVALID or ROOM_CONNECTING_PARTNER_UNAVAILABLE when the canonical pair evaluator refuses the room for a unit with an active pair.';

-- ---------------------------------------------------------------------------
-- Assign Room, check-in, Move Room and rack move
-- ---------------------------------------------------------------------------
-- Same body as 0210 with one added call. The unit's own stored requirements
-- still apply; the pair is checked after the existing hard rules.

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

  -- An active pair on this unit: the room must keep the pair satisfiable.
  -- A room the unit does not hold yet is being chosen ("must connect to");
  -- re-checking the room it holds (check-in) is "the current pair is no longer valid".
  PERFORM public.pms_assert_reservation_room_pairing(
    _restaurant_id,
    _unit_id,
    _room_id,
    _room_just_selected => NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_rooms held
      WHERE held.id = _unit_id
        AND held.restaurant_id = _restaurant_id
        AND held.room_id = _room_id
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Backstop for every other writer of a unit's room
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.pms_enforce_room_unit_pairing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_unit public.hotel_reservation_rooms%ROWTYPE;
BEGIN
  -- Deferred: judge the unit as it is when the transaction ends, not as this
  -- statement left it, so a multi-step change is checked on its final state.
  SELECT * INTO current_unit
  FROM public.hotel_reservation_rooms room_unit
  WHERE room_unit.id = NEW.id;

  IF NOT FOUND
     OR current_unit.room_id IS NULL
     OR current_unit.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NULL;
  END IF;

  PERFORM public.pms_assert_reservation_room_pairing(
    current_unit.restaurant_id,
    current_unit.id,
    current_unit.room_id,
    _room_just_selected => TG_OP = 'INSERT' OR OLD.room_id IS DISTINCT FROM NEW.room_id
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_enforce_room_unit_pairing()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pms_enforce_room_unit_pairing() IS
  'Deferred trigger: a unit that holds a room and has an active connecting pair must keep the pair satisfiable, whichever code wrote the room.';

DROP TRIGGER IF EXISTS trg_hotel_reservation_rooms_pairing ON public.hotel_reservation_rooms;
CREATE CONSTRAINT TRIGGER trg_hotel_reservation_rooms_pairing
  AFTER INSERT OR UPDATE OF room_id
  ON public.hotel_reservation_rooms
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_enforce_room_unit_pairing();

-- ---------------------------------------------------------------------------
-- A pair created over units that already hold rooms
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.pms_enforce_room_pair_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_row public.hotel_reservation_rooms%ROWTYPE;
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  FOR unit_row IN
    SELECT room_unit.*
    FROM public.hotel_reservation_rooms room_unit
    WHERE room_unit.restaurant_id = NEW.restaurant_id
      AND room_unit.id IN (NEW.unit_a_id, NEW.unit_b_id)
    ORDER BY room_unit.id
  LOOP
    IF unit_row.room_id IS NOT NULL
       AND unit_row.status IN ('pending', 'confirmed', 'checked_in') THEN
      PERFORM public.pms_assert_reservation_room_pairing(
        unit_row.restaurant_id, unit_row.id, unit_row.room_id
      );
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_enforce_room_pair_assignment()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pms_enforce_room_pair_assignment() IS
  'Trigger: a new pair is refused when a unit that already holds a room cannot keep it connected to its partner.';

DROP TRIGGER IF EXISTS trg_hotel_reservation_room_pairs_assignment ON public.hotel_reservation_room_pairs;
CREATE TRIGGER trg_hotel_reservation_room_pairs_assignment
  AFTER INSERT ON public.hotel_reservation_room_pairs
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_enforce_room_pair_assignment();

-- ---------------------------------------------------------------------------
-- Date changes (closes the 0212 gap)
-- ---------------------------------------------------------------------------
-- An AFTER row trigger fires once the whole statement has run, so one UPDATE
-- that moves both paired units together is judged on the new dates of both.
-- The pair is never ended here; staff remove it explicitly first.

CREATE FUNCTION public.pms_guard_reservation_room_pair_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_unit public.hotel_reservation_rooms%ROWTYPE;
  partner public.hotel_reservation_rooms%ROWTYPE;
BEGIN
  SELECT * INTO current_unit
  FROM public.hotel_reservation_rooms room_unit
  WHERE room_unit.id = NEW.id;

  IF NOT FOUND OR current_unit.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NULL;
  END IF;

  SELECT partner_unit.* INTO partner
  FROM public.hotel_reservation_room_pairs pair_row
  JOIN public.hotel_reservation_rooms partner_unit
    ON partner_unit.restaurant_id = pair_row.restaurant_id
   AND partner_unit.id = CASE
         WHEN pair_row.unit_a_id = current_unit.id THEN pair_row.unit_b_id
         ELSE pair_row.unit_a_id
       END
  WHERE pair_row.restaurant_id = current_unit.restaurant_id
    AND pair_row.ended_at IS NULL
    AND (pair_row.unit_a_id = current_unit.id OR pair_row.unit_b_id = current_unit.id);

  IF NOT FOUND OR partner.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NULL;
  END IF;

  IF NOT (
    current_unit.arrival_date < partner.departure_date
    AND current_unit.departure_date > partner.arrival_date
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_STAYS_DO_NOT_OVERLAP';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_guard_reservation_room_pair_dates()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pms_guard_reservation_room_pair_dates() IS
  'Trigger: refuses a date change that leaves two actively paired units with no overlapping nights. The pair is never ended silently.';

DROP TRIGGER IF EXISTS trg_hotel_reservation_rooms_pair_dates ON public.hotel_reservation_rooms;
CREATE TRIGGER trg_hotel_reservation_rooms_pair_dates
  AFTER UPDATE OF arrival_date, departure_date
  ON public.hotel_reservation_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_guard_reservation_room_pair_dates();

-- ---------------------------------------------------------------------------
-- Physical link deletion guard
-- ---------------------------------------------------------------------------
-- Adjacent links are unaffected. Only a connecting link that an active pair's
-- two assigned units are using right now is protected; changing it to another
-- kind or to other rooms removes it just as much as deleting it.

CREATE FUNCTION public.pms_guard_room_link_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM 'connecting' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.kind = 'connecting'
     AND LEAST(NEW.room_id, NEW.other_room_id) = LEAST(OLD.room_id, OLD.other_room_id)
     AND GREATEST(NEW.room_id, NEW.other_room_id) = GREATEST(OLD.room_id, OLD.other_room_id) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservation_room_pairs pair_row
    JOIN public.hotel_reservation_rooms unit_a
      ON unit_a.id = pair_row.unit_a_id AND unit_a.restaurant_id = pair_row.restaurant_id
    JOIN public.hotel_reservation_rooms unit_b
      ON unit_b.id = pair_row.unit_b_id AND unit_b.restaurant_id = pair_row.restaurant_id
    WHERE pair_row.restaurant_id = OLD.restaurant_id
      AND pair_row.ended_at IS NULL
      AND unit_a.status IN ('pending', 'confirmed', 'checked_in')
      AND unit_b.status IN ('pending', 'confirmed', 'checked_in')
      AND unit_a.room_id IS NOT NULL
      AND unit_b.room_id IS NOT NULL
      AND (
        (unit_a.room_id = OLD.room_id AND unit_b.room_id = OLD.other_room_id)
        OR (unit_a.room_id = OLD.other_room_id AND unit_b.room_id = OLD.room_id)
      )
  ) THEN
    RAISE EXCEPTION 'ROOM_LINK_USED_BY_ACTIVE_PAIR';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_guard_room_link_in_use()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pms_guard_room_link_in_use() IS
  'Trigger: a connecting link cannot be removed while an active reservation room pair has its two assigned units on exactly those rooms.';

DROP TRIGGER IF EXISTS trg_hotel_room_links_in_use ON public.hotel_room_links;
CREATE TRIGGER trg_hotel_room_links_in_use
  BEFORE UPDATE OR DELETE
  ON public.hotel_room_links
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_guard_room_link_in_use();
