-- Overbooking V1.
-- Allowance is room-type specific. There is no shared property numerical pool.
-- pms_inventory_rules.overbooking_allowed is the property master switch only.
-- Property maximum_overbooking and percentage_limit are deprecated and unused.
-- available stays physical and clamped.
-- Explicit owner/manager override only. No mutable consumption counter.
-- Do not apply from an agent.

CREATE TABLE public.pms_reservation_overbooking_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  approved_by_membership_id uuid NOT NULL,
  requested_by_membership_id uuid NOT NULL,
  reason text NOT NULL,
  nights jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_reservation_overbooking_approvals_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pms_reservation_overbooking_approvals_approver_fk
    FOREIGN KEY (approved_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_reservation_overbooking_approvals_requester_fk
    FOREIGN KEY (requested_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_reservation_overbooking_approvals_reason_check
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT pms_reservation_overbooking_approvals_nights_check
    CHECK (jsonb_typeof(nights) = 'array')
);

CREATE INDEX pms_reservation_overbooking_approvals_reservation_idx
  ON public.pms_reservation_overbooking_approvals (restaurant_id, reservation_id, created_at DESC);

COMMENT ON TABLE public.pms_reservation_overbooking_approvals IS
  'Immutable evidence of an explicit overbooking decision. Not an allowance counter. Consumption is derived from room-type shortages.';

ALTER TABLE public.pms_reservation_overbooking_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read overbooking approvals"
  ON public.pms_reservation_overbooking_approvals
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

GRANT SELECT ON public.pms_reservation_overbooking_approvals TO authenticated;
GRANT ALL ON public.pms_reservation_overbooking_approvals TO service_role;

CREATE TABLE public.pms_room_type_overbooking_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  maximum_overbooking integer,
  percentage_limit numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  CONSTRAINT pms_room_type_overbooking_rules_room_type_unique
    UNIQUE (restaurant_id, room_type_id),
  CONSTRAINT pms_room_type_overbooking_rules_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pms_room_type_overbooking_rules_created_by_fk
    FOREIGN KEY (created_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_room_type_overbooking_rules_updated_by_fk
    FOREIGN KEY (updated_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_room_type_overbooking_rules_maximum_check
    CHECK (maximum_overbooking IS NULL OR maximum_overbooking >= 0),
  CONSTRAINT pms_room_type_overbooking_rules_percentage_check
    CHECK (percentage_limit IS NULL OR (percentage_limit >= 0 AND percentage_limit <= 100))
);

COMMENT ON TABLE public.pms_room_type_overbooking_rules IS
  'Per room-type overbooking allowance. Independent of every other room type. Not a shared property pool.';
COMMENT ON COLUMN public.pms_inventory_rules.overbooking_allowed IS
  'Property master switch. When false, no room type may overbook. It does not set a room count.';
COMMENT ON COLUMN public.pms_inventory_rules.maximum_overbooking IS
  'Deprecated. Unused by the booking engine. Numeric allowance lives on pms_room_type_overbooking_rules.';
COMMENT ON COLUMN public.pms_inventory_rules.percentage_limit IS
  'Deprecated. Unused by the booking engine. Percentage lives on pms_room_type_overbooking_rules.';
COMMENT ON COLUMN public.pms_inventory_rules.room_type_limit_enabled IS
  'Deprecated. Room-type rules are the V1 model, so this flag is not an operational switch.';
COMMENT ON COLUMN public.pms_inventory_rules.date_based_limit_enabled IS
  'Not operational. Date-specific overbooking limits are not implemented.';

ALTER TABLE public.pms_room_type_overbooking_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read room type overbooking rules"
  ON public.pms_room_type_overbooking_rules
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers insert room type overbooking rules"
  ON public.pms_room_type_overbooking_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers update room type overbooking rules"
  ON public.pms_room_type_overbooking_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
CREATE POLICY "Managers delete room type overbooking rules"
  ON public.pms_room_type_overbooking_rules
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_room_type_overbooking_rules TO authenticated;
GRANT ALL ON public.pms_room_type_overbooking_rules TO service_role;

DROP TRIGGER IF EXISTS set_pms_room_type_overbooking_rules_updated_at
  ON public.pms_room_type_overbooking_rules;
CREATE TRIGGER set_pms_room_type_overbooking_rules_updated_at
  BEFORE UPDATE ON public.pms_room_type_overbooking_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed',
    'no_show','repriced','expected_arrival_updated','late_checkout_updated',
    'room_guest_added','room_guest_removed','room_primary_guest_changed',
    'external_reservation_created','external_reservation_modified','external_reservation_cancelled',
    'overbooked'
  ));

CREATE OR REPLACE FUNCTION public.pms_room_type_overbooking_allowance(
  _property_allowed boolean,
  _type_enabled boolean,
  _maximum integer,
  _percentage numeric,
  _physical_capacity integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(_property_allowed, false) IS NOT TRUE THEN 0
    WHEN COALESCE(_type_enabled, false) IS NOT TRUE THEN 0
    WHEN _maximum IS NULL AND _percentage IS NULL THEN 0
    WHEN _maximum IS NOT NULL AND _percentage IS NULL THEN GREATEST(_maximum, 0)
    WHEN _maximum IS NULL AND _percentage IS NOT NULL THEN
      floor(GREATEST(_physical_capacity, 0) * _percentage / 100.0)::integer
    ELSE LEAST(
      GREATEST(_maximum, 0),
      floor(GREATEST(_physical_capacity, 0) * _percentage / 100.0)::integer
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_overbooking_allowance(boolean, boolean, integer, numeric, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_overbooking_allowance(boolean, boolean, integer, numeric, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_room_type_night_position(
  _restaurant_id uuid,
  _night date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_type_id uuid,
  room_type_name text,
  physical_capacity integer,
  demand integer,
  physical_available integer,
  shortage integer,
  overbooking_enabled boolean,
  maximum_overbooking integer,
  percentage_limit numeric,
  configuration_invalid boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  property_business_date date;
  type_row record;
  pool_count integer;
  operational_removed integer;
  reservation_pinned integer;
  type_hold boolean;
  quantity_hold integer;
  unassigned integer;
  physical_before integer;
  reservation_demand integer;
  pool_ids uuid[];
  type_enabled boolean;
  type_maximum integer;
  type_percentage numeric;
BEGIN
  SELECT COALESCE(
    property.business_date,
    (now() AT TIME ZONE COALESCE(property.timezone, 'Europe/London'))::date
  )
  INTO property_business_date
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  FOR type_row IN
    SELECT room_type.id, room_type.name
    FROM public.room_types room_type
    WHERE room_type.restaurant_id = _restaurant_id
    ORDER BY room_type.id
  LOOP
    SELECT COALESCE(array_agg(room.id), ARRAY[]::uuid[]), count(*)::integer
    INTO pool_ids, pool_count
    FROM public.hotel_rooms room
    JOIN public.room_types room_type
      ON room_type.id = room.room_type_id
     AND room_type.restaurant_id = room.restaurant_id
    WHERE room.restaurant_id = _restaurant_id
      AND room.room_type_id = type_row.id
      AND room.active
      AND room_type.active
      AND room_type.sellable
      AND (
        COALESCE((
          SELECT rules.sellable_status_required
          FROM public.pms_inventory_rules rules
          WHERE rules.restaurant_id = _restaurant_id
        ), true) IS NOT TRUE
        OR room.sellable
      )
      AND (
        COALESCE((
          SELECT rules.maintenance_affects_availability
          FROM public.pms_inventory_rules rules
          WHERE rules.restaurant_id = _restaurant_id
        ), false) IS NOT TRUE
        OR room.maintenance_status = 'normal'
      );

    SELECT count(*)::integer
    INTO operational_removed
    FROM public.hotel_rooms room
    WHERE room.id = ANY (pool_ids)
      AND (
        (
          _night = property_business_date
          AND room.status IN ('out_of_order', 'out_of_service')
        )
        OR EXISTS (
          SELECT 1
          FROM public.pms_operational_inventory_blocks block
          WHERE block.restaurant_id = _restaurant_id
            AND block.room_id = room.id
            AND block.target_kind = 'room'
            AND block.status = 'active'
            AND block.inventory_impact = 'remove_from_inventory'
            AND block.start_date <= _night
            AND block.end_date > _night
        )
      );

    SELECT count(*)::integer
    INTO reservation_pinned
    FROM unnest(pool_ids) AS pool_room (id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.hotel_rooms room
      WHERE room.id = pool_room.id
        AND (
          (
            _night = property_business_date
            AND room.status IN ('out_of_order', 'out_of_service')
          )
          OR EXISTS (
            SELECT 1
            FROM public.pms_operational_inventory_blocks block
            WHERE block.restaurant_id = _restaurant_id
              AND block.room_id = room.id
              AND block.target_kind = 'room'
              AND block.status = 'active'
              AND block.inventory_impact = 'remove_from_inventory'
              AND block.start_date <= _night
              AND block.end_date > _night
          )
        )
    )
    AND public.pms_room_unit_claims_room(
      _restaurant_id, pool_room.id, _night, _exclude_reservation_id
    );

    SELECT EXISTS (
      SELECT 1
      FROM public.pms_operational_inventory_blocks block
      WHERE block.restaurant_id = _restaurant_id
        AND block.room_type_id = type_row.id
        AND block.target_kind = 'room_type'
        AND block.status = 'active'
        AND block.inventory_impact = 'remove_from_inventory'
        AND block.start_date <= _night
        AND block.end_date > _night
    )
    INTO type_hold;

    SELECT COALESCE(sum(block.quantity), 0)::integer
    INTO quantity_hold
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.room_type_id = type_row.id
      AND block.target_kind = 'quantity'
      AND block.status = 'active'
      AND block.inventory_impact = 'remove_from_inventory'
      AND block.start_date <= _night
      AND block.end_date > _night;

    unassigned := public.pms_unassigned_room_demand(
      _restaurant_id,
      type_row.id,
      _night,
      _exclude_reservation_id,
      pool_ids
    );

    IF type_hold THEN
      physical_before := 0;
    ELSE
      physical_before := GREATEST(
        pool_count - operational_removed - LEAST(
          quantity_hold,
          GREATEST(pool_count - operational_removed, 0)
        ),
        0
      );
    END IF;

    reservation_demand := reservation_pinned + unassigned;
    SELECT COALESCE(rule.enabled, false), rule.maximum_overbooking, rule.percentage_limit
    INTO type_enabled, type_maximum, type_percentage
    FROM public.pms_room_type_overbooking_rules rule
    WHERE rule.restaurant_id = _restaurant_id
      AND rule.room_type_id = type_row.id;

    room_type_id := type_row.id;
    room_type_name := type_row.name;
    physical_capacity := physical_before;
    demand := reservation_demand;
    physical_available := GREATEST(physical_before - reservation_demand, 0);
    shortage := GREATEST(reservation_demand - physical_before, 0);
    overbooking_enabled := COALESCE(type_enabled, false);
    maximum_overbooking := type_maximum;
    percentage_limit := type_percentage;
    configuration_invalid := COALESCE(type_enabled, false)
      AND type_maximum IS NULL
      AND type_percentage IS NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_night_position(uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_night_position(uuid, date, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_property_overbooking_night(
  _restaurant_id uuid,
  _night date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules public.pms_inventory_rules%ROWTYPE;
  physical integer := 0;
  confirmed integer := 0;
  available_sum integer := 0;
  total_shortage integer := 0;
  types_overbooked integer := 0;
  allowance integer := 0;
  remaining integer := 0;
  property_allowed boolean := false;
  types jsonb := '[]'::jsonb;
  position_row record;
BEGIN
  SELECT * INTO rules
  FROM public.pms_inventory_rules
  WHERE restaurant_id = _restaurant_id;
  property_allowed := COALESCE(rules.overbooking_allowed, false);

  FOR position_row IN
    SELECT *
    FROM public.pms_room_type_night_position(_restaurant_id, _night, _exclude_reservation_id)
  LOOP
    allowance := public.pms_room_type_overbooking_allowance(
      property_allowed,
      position_row.overbooking_enabled,
      position_row.maximum_overbooking,
      position_row.percentage_limit,
      position_row.physical_capacity
    );
    remaining := GREATEST(allowance - position_row.shortage, 0);
    physical := physical + position_row.physical_capacity;
    confirmed := confirmed + position_row.demand;
    available_sum := available_sum + position_row.physical_available;
    total_shortage := total_shortage + position_row.shortage;
    IF position_row.shortage > 0 THEN
      types_overbooked := types_overbooked + 1;
    END IF;
    types := types || jsonb_build_array(jsonb_build_object(
      'roomTypeId', position_row.room_type_id,
      'roomTypeName', position_row.room_type_name,
      'physicalCapacity', position_row.physical_capacity,
      'demand', position_row.demand,
      'physicalAvailable', position_row.physical_available,
      'shortage', position_row.shortage,
      'overbookingEnabled', position_row.overbooking_enabled,
      'maximumOverbooking', position_row.maximum_overbooking,
      'percentageLimit', position_row.percentage_limit,
      'configurationInvalid', position_row.configuration_invalid,
      'overbookingAllowance', allowance,
      'overbookingConsumed', position_row.shortage,
      'overbookingRemaining', remaining,
      'effectiveBookable', position_row.physical_available + remaining
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'night', _night,
    'physicalCapacity', physical,
    'confirmedDemand', confirmed,
    'physicalAvailable', available_sum,
    'totalOverbookedRooms', total_shortage,
    'roomTypesOverbooked', types_overbooked,
    'propertyOverbookingEnabled', property_allowed,
    'alertEnabled', COALESCE(rules.overbooking_alert_enabled, false),
    'roomTypes', types
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_property_overbooking_night(uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_property_overbooking_night(uuid, date, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_property_overbooking_board(
  _restaurant_id uuid,
  _start date,
  _end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  night date;
  rows jsonb := '[]'::jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_PRIVILEGE';
  END IF;
  IF _end < _start THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;
  IF _end - _start > 31 THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  FOR night IN
    SELECT day_value::date
    FROM generate_series(_start, _end, interval '1 day') AS day_value
    ORDER BY 1
  LOOP
    rows := rows || jsonb_build_array(
      public.pms_property_overbooking_night(_restaurant_id, night, NULL)
    );
  END LOOP;
  RETURN jsonb_build_object('nights', rows);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_property_overbooking_board(uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_property_overbooking_board(uuid, date, date)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pms_lock_overbooking_scope(
  _restaurant_id uuid,
  _arrival date,
  _departure date,
  _room_type_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  type_id uuid;
  night date;
BEGIN
  -- Room type, then night. Same order on every caller so two stays cannot deadlock.
  FOR type_id IN
    SELECT DISTINCT candidate
    FROM unnest(COALESCE(_room_type_ids, ARRAY[]::uuid[])) AS candidate
    WHERE candidate IS NOT NULL
    ORDER BY 1
  LOOP
    FOR night IN
      SELECT day_value::date
      FROM generate_series(_arrival, (_departure - 1), interval '1 day') AS day_value
      ORDER BY 1
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtext('noru-overbooking'),
        hashtext(_restaurant_id::text || '|' || type_id::text || '|' || night::text)
      );
    END LOOP;
  END LOOP;

  PERFORM 1
  FROM public.room_types room_type
  WHERE room_type.restaurant_id = _restaurant_id
    AND room_type.id = ANY (COALESCE(_room_type_ids, ARRAY[]::uuid[]))
  ORDER BY room_type.id
  FOR UPDATE;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_lock_overbooking_scope(uuid, date, date, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_lock_overbooking_scope(uuid, date, date, uuid[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_prepare_explicit_overbooking(
  _restaurant_id uuid,
  _membership_id uuid,
  _reason text,
  _arrival date,
  _departure date,
  _room_type_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rules public.pms_inventory_rules%ROWTYPE;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_users member
    WHERE member.id = _membership_id
      AND member.restaurant_id = _restaurant_id
      AND member.active
      AND member.role IN ('owner', 'manager')
  ) THEN
    RAISE EXCEPTION 'OVERBOOKING_APPROVAL_REQUIRED';
  END IF;

  IF NULLIF(btrim(COALESCE(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'OVERBOOKING_REASON_REQUIRED';
  END IF;

  SELECT * INTO rules
  FROM public.pms_inventory_rules
  WHERE restaurant_id = _restaurant_id;

  IF NOT FOUND OR rules.overbooking_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'OVERBOOKING_NOT_ALLOWED';
  END IF;

  PERFORM public.pms_lock_overbooking_scope(
    _restaurant_id, _arrival, _departure, _room_type_ids
  );
  PERFORM set_config('noru.overbooking_requested', '1', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_prepare_explicit_overbooking(uuid, uuid, text, date, date, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_prepare_explicit_overbooking(uuid, uuid, text, date, date, uuid[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_enforce_explicit_overbooking(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  span record;
  night date;
  with_state jsonb;
  without_state jsonb;
  approved jsonb := '[]'::jsonb;
  type_row jsonb;
  shortage_with integer;
  shortage_without integer;
  type_additional integer;
  prior jsonb;
  type_allowance integer;
  type_remaining integer;
  locked_types uuid[];
BEGIN
  PERFORM set_config('noru.overbooking_requested', '0', true);

  SELECT min(unit.arrival_date) AS arrival, max(unit.departure_date) AS departure
  INTO span
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id;

  IF span.arrival IS NULL THEN
    SELECT reservation.arrival_date, reservation.departure_date
    INTO span
    FROM public.hotel_reservations reservation
    WHERE reservation.id = _reservation_id
      AND reservation.restaurant_id = _restaurant_id;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT unit.room_type_id), ARRAY[]::uuid[])
  INTO locked_types
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id;
  PERFORM public.pms_lock_overbooking_scope(
    _restaurant_id, span.arrival, span.departure, locked_types
  );

  FOR night IN
    SELECT day_value::date
    FROM generate_series(span.arrival, (span.departure - 1), interval '1 day') AS day_value
    ORDER BY 1
  LOOP
    with_state := public.pms_property_overbooking_night(_restaurant_id, night, NULL);
    without_state := public.pms_property_overbooking_night(_restaurant_id, night, _reservation_id);

    FOR type_row IN
      SELECT with_type.value
      FROM jsonb_array_elements(with_state->'roomTypes') AS with_type (value)
      ORDER BY with_type.value->>'roomTypeId'
    LOOP
      SELECT without_type.value
      INTO prior
      FROM jsonb_array_elements(without_state->'roomTypes') AS without_type (value)
      WHERE without_type.value->>'roomTypeId' = type_row->>'roomTypeId';
      shortage_without := COALESCE((prior->>'shortage')::integer, 0);
      shortage_with := COALESCE((type_row->>'shortage')::integer, 0);
      type_additional := shortage_with - shortage_without;
      IF type_additional <= 0 THEN
        CONTINUE;
      END IF;

      IF COALESCE((type_row->>'overbookingEnabled')::boolean, false) IS NOT TRUE
         OR COALESCE((with_state->>'propertyOverbookingEnabled')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'OVERBOOKING_NOT_ALLOWED';
      END IF;
      IF COALESCE((type_row->>'configurationInvalid')::boolean, false) THEN
        RAISE EXCEPTION 'OVERBOOKING_CONFIGURATION_INVALID';
      END IF;

      type_allowance := COALESCE((prior->>'overbookingAllowance')::integer, 0);
      type_remaining := GREATEST(
        type_allowance - COALESCE((prior->>'overbookingConsumed')::integer, 0),
        0
      );
      IF type_additional > type_remaining THEN
        RAISE EXCEPTION 'OVERBOOKING_LIMIT_REACHED: % for %',
          COALESCE(type_row->>'roomTypeName', 'Room type'),
          night;
      END IF;

      approved := approved || jsonb_build_array(jsonb_build_object(
        'date', night,
        'room_type_id', type_row->>'roomTypeId',
        'room_type_name', type_row->>'roomTypeName',
        'physical_capacity', (type_row->>'physicalCapacity')::integer,
        'demand_before', COALESCE((prior->>'demand')::integer, 0),
        'requested_rooms', (type_row->>'demand')::integer - COALESCE((prior->>'demand')::integer, 0),
        'room_type_allowance', type_allowance,
        'room_type_consumed_before', COALESCE((prior->>'overbookingConsumed')::integer, 0),
        'room_type_remaining_before', type_remaining,
        'shortage_approved', type_additional
      ));
    END LOOP;
  END LOOP;

  IF jsonb_array_length(approved) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pms_reservation_overbooking_approvals (
    restaurant_id, reservation_id, approved_by_membership_id, requested_by_membership_id, reason, nights
  ) VALUES (
    _restaurant_id, _reservation_id, _membership_id, _membership_id, btrim(_reason), approved
  );

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'overbooked',
    jsonb_build_object('reason', btrim(_reason), 'nights', approved),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_enforce_explicit_overbooking(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_enforce_explicit_overbooking(uuid, uuid, uuid, text)
  TO service_role;

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
  available_count integer;
  explicit_overbooking boolean;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  PERFORM 1
  FROM public.room_types
  WHERE id = _room_type_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  explicit_overbooking := current_setting('noru.overbooking_requested', true) = '1';

  available_count := public.pms_count_available_inventory(
    _restaurant_id,
    _room_type_id,
    _arrival,
    _departure,
    _exclude_reservation_id
  );

  IF available_count <= 0 AND NOT explicit_overbooking THEN
    RAISE EXCEPTION 'NO_AVAILABILITY';
  END IF;

  IF _room_id IS NOT NULL THEN
    PERFORM public.assert_room_assignable(
      _restaurant_id,
      _room_id,
      _room_type_id,
      _arrival,
      _departure,
      _exclude_reservation_id
    );
  END IF;
END;
$$;

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
    SELECT room_unit.room_id, room_unit.room_type_id, room_unit.arrival_date, room_unit.departure_date
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
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hotel_reservation_overbooking(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _status text,
  _rate_plan_id uuid,
  _membership_id uuid,
  _overbooking_reason text,
  _promotion_activation_id uuid DEFAULT NULL,
  _package_activation_ids uuid[] DEFAULT NULL,
  _company_master_id uuid DEFAULT NULL,
  _travel_agent_master_id uuid DEFAULT NULL,
  _commercial_booking_source text DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _guarantee_method text DEFAULT NULL,
  _rooms integer DEFAULT 1,
  _infants integer DEFAULT 0,
  _quote_currency text DEFAULT NULL,
  _room_units jsonb DEFAULT NULL,
  _reservation_mode text DEFAULT NULL,
  _room_guest_assignments jsonb DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
  type_ids uuid[] := ARRAY[_room_type_id];
  unit jsonb;
BEGIN
  IF _room_units IS NOT NULL AND jsonb_typeof(_room_units) = 'array' THEN
    FOR unit IN SELECT value FROM jsonb_array_elements(_room_units)
    LOOP
      IF NULLIF(unit->>'room_type_id', '') IS NOT NULL THEN
        type_ids := type_ids || (unit->>'room_type_id')::uuid;
      END IF;
    END LOOP;
  END IF;
  PERFORM public.pms_prepare_explicit_overbooking(
    _restaurant_id, _membership_id, _overbooking_reason, _arrival, _departure, type_ids
  );

  created := public.create_hotel_reservation_priced_commercial(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _rate_plan_id, _membership_id,
    _promotion_activation_id, _package_activation_ids,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method,
    _rooms, _infants, _quote_currency, _room_units, _reservation_mode, _room_guest_assignments
  );

  PERFORM public.pms_enforce_explicit_overbooking(
    _restaurant_id, created.id, _membership_id, _overbooking_reason
  );
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_overbooking(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, text,
  uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_overbooking(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, text,
  uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_overbooking(
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
  _rate_plan_id uuid,
  _membership_id uuid,
  _overbooking_reason text,
  _infants integer DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  lock_arrival date;
  lock_departure date;
  type_ids uuid[];
BEGIN
  SELECT * INTO existing
  FROM public.hotel_reservations
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  lock_arrival := LEAST(existing.arrival_date, _arrival);
  lock_departure := GREATEST(existing.departure_date, _departure);
  SELECT COALESCE(array_agg(DISTINCT unit.room_type_id), ARRAY[]::uuid[]) || _room_type_id
  INTO type_ids
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id;
  PERFORM public.pms_prepare_explicit_overbooking(
    _restaurant_id, _membership_id, _overbooking_reason, lock_arrival, lock_departure, type_ids
  );

  updated := public.amend_hotel_reservation_priced(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _rate_plan_id, _membership_id, _infants
  );

  PERFORM public.pms_enforce_explicit_overbooking(
    _restaurant_id, updated.id, _membership_id, _overbooking_reason
  );
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation_overbooking(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_overbooking(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, text, integer
) TO service_role;
