-- Overbooking controls that were stored but ignored.
-- Manager approval and a reason are required only when those switches are on.
-- A date limit replaces the room-type allowance on the nights it covers.
-- Overlapping date limits use the smaller allowance.
-- Do not apply from an agent until this file is reviewed with the app change.

CREATE TABLE IF NOT EXISTS public.pms_overbooking_date_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  maximum_overbooking integer,
  percentage_limit numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_membership_id uuid,
  updated_by_membership_id uuid,
  CONSTRAINT pms_overbooking_date_limits_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pms_overbooking_date_limits_created_by_fk
    FOREIGN KEY (created_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_overbooking_date_limits_updated_by_fk
    FOREIGN KEY (updated_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT pms_overbooking_date_limits_range_check
    CHECK (end_date > start_date),
  CONSTRAINT pms_overbooking_date_limits_maximum_check
    CHECK (maximum_overbooking IS NULL OR maximum_overbooking >= 0),
  CONSTRAINT pms_overbooking_date_limits_percentage_check
    CHECK (percentage_limit IS NULL OR (percentage_limit >= 0 AND percentage_limit <= 100)),
  CONSTRAINT pms_overbooking_date_limits_value_check
    CHECK (maximum_overbooking IS NOT NULL OR percentage_limit IS NOT NULL)
);

COMMENT ON TABLE public.pms_overbooking_date_limits IS
  'Date-range overbooking allowance for one room type. The end date is the release morning and is not itself a covered night.';
COMMENT ON COLUMN public.pms_inventory_rules.date_based_limit_enabled IS
  'When true, a matching date limit replaces the room-type allowance for those nights.';
COMMENT ON COLUMN public.pms_inventory_rules.manager_approval_required IS
  'When true, only an owner or manager can confirm an overbooking.';
COMMENT ON COLUMN public.pms_inventory_rules.overbooking_reason_required IS
  'When true, an overbooking confirmation must store a reason.';

ALTER TABLE public.pms_overbooking_date_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read overbooking date limits" ON public.pms_overbooking_date_limits;
CREATE POLICY "Members read overbooking date limits"
  ON public.pms_overbooking_date_limits
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert overbooking date limits" ON public.pms_overbooking_date_limits;
CREATE POLICY "Managers insert overbooking date limits"
  ON public.pms_overbooking_date_limits
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update overbooking date limits" ON public.pms_overbooking_date_limits;
CREATE POLICY "Managers update overbooking date limits"
  ON public.pms_overbooking_date_limits
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete overbooking date limits" ON public.pms_overbooking_date_limits;
CREATE POLICY "Managers delete overbooking date limits"
  ON public.pms_overbooking_date_limits
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_overbooking_date_limits TO authenticated;
GRANT ALL ON public.pms_overbooking_date_limits TO service_role;

DROP TRIGGER IF EXISTS set_pms_overbooking_date_limits_updated_at
  ON public.pms_overbooking_date_limits;
CREATE TRIGGER set_pms_overbooking_date_limits_updated_at
  BEFORE UPDATE ON public.pms_overbooking_date_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pms_reservation_overbooking_approvals
  DROP CONSTRAINT IF EXISTS pms_reservation_overbooking_approvals_reason_check;
ALTER TABLE public.pms_reservation_overbooking_approvals
  ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE public.pms_reservation_overbooking_approvals
  ADD CONSTRAINT pms_reservation_overbooking_approvals_reason_check
  CHECK (reason IS NULL OR char_length(reason) <= 500);

CREATE OR REPLACE FUNCTION public.pms_room_type_overbooking_effective_limits(
  _restaurant_id uuid,
  _room_type_id uuid,
  _night date,
  _physical_capacity integer
)
RETURNS TABLE (
  enabled boolean,
  maximum_overbooking integer,
  percentage_limit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  base_enabled boolean := false;
  base_maximum integer;
  base_percentage numeric;
  date_based boolean := false;
  chosen_maximum integer;
  chosen_percentage numeric;
  chosen_allowance integer;
  candidate record;
  candidate_allowance integer;
BEGIN
  SELECT COALESCE(rule.enabled, false), rule.maximum_overbooking, rule.percentage_limit
  INTO base_enabled, base_maximum, base_percentage
  FROM public.pms_room_type_overbooking_rules rule
  WHERE rule.restaurant_id = _restaurant_id
    AND rule.room_type_id = _room_type_id;

  SELECT COALESCE(rules.date_based_limit_enabled, false)
  INTO date_based
  FROM public.pms_inventory_rules rules
  WHERE rules.restaurant_id = _restaurant_id;

  enabled := COALESCE(base_enabled, false);
  maximum_overbooking := base_maximum;
  percentage_limit := base_percentage;

  IF date_based IS NOT TRUE OR enabled IS NOT TRUE THEN
    RETURN NEXT;
    RETURN;
  END IF;

  FOR candidate IN
    SELECT limit_row.maximum_overbooking, limit_row.percentage_limit
    FROM public.pms_overbooking_date_limits limit_row
    WHERE limit_row.restaurant_id = _restaurant_id
      AND limit_row.room_type_id = _room_type_id
      AND limit_row.enabled
      AND limit_row.start_date <= _night
      AND limit_row.end_date > _night
    ORDER BY limit_row.id
  LOOP
    candidate_allowance := public.pms_room_type_overbooking_allowance(
      true,
      true,
      candidate.maximum_overbooking,
      candidate.percentage_limit,
      _physical_capacity
    );
    IF chosen_allowance IS NULL OR candidate_allowance < chosen_allowance THEN
      chosen_allowance := candidate_allowance;
      chosen_maximum := candidate.maximum_overbooking;
      chosen_percentage := candidate.percentage_limit;
    END IF;
  END LOOP;

  IF chosen_allowance IS NOT NULL THEN
    maximum_overbooking := chosen_maximum;
    percentage_limit := chosen_percentage;
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_overbooking_effective_limits(uuid, uuid, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_overbooking_effective_limits(uuid, uuid, date, integer)
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
  member_role text;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  SELECT * INTO rules
  FROM public.pms_inventory_rules
  WHERE restaurant_id = _restaurant_id;

  IF NOT FOUND OR rules.overbooking_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'OVERBOOKING_NOT_ALLOWED';
  END IF;

  SELECT member.role
  INTO member_role
  FROM public.restaurant_users member
  WHERE member.id = _membership_id
    AND member.restaurant_id = _restaurant_id
    AND member.active;

  IF member_role IS NULL THEN
    RAISE EXCEPTION 'OVERBOOKING_APPROVAL_REQUIRED';
  END IF;

  IF COALESCE(rules.manager_approval_required, false)
     AND member_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'OVERBOOKING_APPROVAL_REQUIRED';
  END IF;

  IF COALESCE(rules.overbooking_reason_required, false)
     AND NULLIF(btrim(COALESCE(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'OVERBOOKING_REASON_REQUIRED';
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
    SELECT limits.enabled, limits.maximum_overbooking, limits.percentage_limit
    INTO type_enabled, type_maximum, type_percentage
    FROM public.pms_room_type_overbooking_effective_limits(
      _restaurant_id,
      type_row.id,
      _night,
      physical_before
    ) AS limits;

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
    _restaurant_id, _reservation_id, _membership_id, _membership_id, NULLIF(btrim(COALESCE(_reason, '')), ''), approved
  );

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'overbooked',
    jsonb_build_object('reason', NULLIF(btrim(COALESCE(_reason, '')), ''), 'nights', approved),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_night_position(uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_night_position(uuid, date, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.pms_enforce_explicit_overbooking(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_enforce_explicit_overbooking(uuid, uuid, uuid, text)
  TO service_role;
