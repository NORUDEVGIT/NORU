-- Qualify pms_inventory_rules columns inside pms_evaluate_room_assignment.
-- The previous function declared PL/pgSQL variables with the same names as
-- pms_inventory_rules columns. PostgreSQL 42702 then rejected
-- require_occupancy_match as an ambiguous column reference.
-- Business rules are unchanged. Dirty rooms stay assignable unless a property
-- housekeeping rule or an actual check-in readiness check says otherwise.

CREATE OR REPLACE FUNCTION public.pms_evaluate_room_assignment(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL,
  _adults integer DEFAULT NULL,
  _children integer DEFAULT NULL,
  _required_bed_type text DEFAULT NULL,
  _accessible_required boolean DEFAULT false,
  _connecting_required boolean DEFAULT false,
  _preferred_building_id uuid DEFAULT NULL,
  _preferred_floor_id uuid DEFAULT NULL,
  _guest_preference_matched boolean DEFAULT false,
  _for_check_in boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  room_type public.room_types%ROWTYPE;
  property_business_date date;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  preference_score integer := 0;
  preference_reasons text[] := ARRAY[]::text[];
  rule_sellable_required boolean := true;
  rule_require_type_match boolean := true;
  rule_require_occupancy_match boolean := false;
  rule_require_bed_match boolean := false;
  rule_require_accessibility_match boolean := false;
  rule_require_connecting_match boolean := false;
  rule_require_maintenance boolean := false;
  rule_require_housekeeping boolean := false;
  rule_housekeeping_affects boolean := false;
  rule_use_building boolean := false;
  rule_use_floor boolean := false;
  rule_use_guest boolean := false;
  maintenance_prevents boolean;
  housekeeping_ready boolean := true;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_PRIVILEGE';
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = _room_id
    AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'blockers', jsonb_build_array(
        jsonb_build_object('code', 'ROOM_NOT_FOUND')
      ),
      'warnings', '[]'::jsonb,
      'preferenceScore', 0,
      'preferenceReasons', '[]'::jsonb
    );
  END IF;

  SELECT *
  INTO room_type
  FROM public.room_types
  WHERE id = room.room_type_id
    AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_TYPE_NOT_FOUND')
    );
  END IF;

  SELECT COALESCE(
    property.business_date,
    (now() AT TIME ZONE COALESCE(property.timezone, 'Europe/London'))::date
  )
  INTO property_business_date
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  rule_sellable_required := COALESCE((
    SELECT rules.sellable_status_required
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), true);
  rule_require_type_match := COALESCE((
    SELECT rules.require_room_type_match
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), true);
  rule_require_occupancy_match := COALESCE((
    SELECT rules.require_occupancy_match
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_require_bed_match := COALESCE((
    SELECT rules.require_bed_type_match
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_require_accessibility_match := COALESCE((
    SELECT rules.require_accessibility_match
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_require_connecting_match := COALESCE((
    SELECT rules.require_connecting_room_match
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_require_maintenance := COALESCE((
    SELECT rules.require_maintenance_availability
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_require_housekeeping := COALESCE((
    SELECT rules.require_housekeeping_readiness
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_housekeeping_affects := COALESCE((
    SELECT rules.housekeeping_affects_assignment
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_use_building := COALESCE((
    SELECT rules.use_building_preference
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_use_floor := COALESCE((
    SELECT rules.use_floor_preference
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);
  rule_use_guest := COALESCE((
    SELECT rules.use_guest_preference
    FROM public.pms_inventory_rules rules
    WHERE rules.restaurant_id = _restaurant_id
  ), false);

  IF NOT room.active THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_INACTIVE')
    );
  END IF;

  IF _arrival <= property_business_date
     AND _departure > property_business_date
     AND room.status <> 'available' THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'ROOM_OPERATIONALLY_UNAVAILABLE',
        'status', room.status
      )
    );
  END IF;

  IF rule_require_type_match AND room.room_type_id <> _room_type_id THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_TYPE_MISMATCH')
    );
  END IF;

  IF rule_sellable_required AND NOT room.sellable THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_NOT_SELLABLE')
    );
  END IF;

  IF rule_require_occupancy_match
     AND COALESCE(_adults, 0) + COALESCE(_children, 0)
         > COALESCE(room_type.max_occupancy, 0) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'OCCUPANCY_EXCEEDED')
    );
  END IF;

  IF rule_require_bed_match
     AND _required_bed_type IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.room_type_beds bed
       WHERE bed.restaurant_id = _restaurant_id
         AND bed.room_type_id = room.room_type_id
         AND bed.bed_type = _required_bed_type
     ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'BED_TYPE_MISMATCH')
    );
  END IF;

  IF rule_require_accessibility_match
     AND _accessible_required
     AND NOT room.accessible THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ACCESSIBILITY_MISMATCH')
    );
  END IF;

  IF rule_require_connecting_match
     AND _connecting_required
     AND NOT EXISTS (
       SELECT 1
       FROM public.hotel_room_links link
       WHERE link.restaurant_id = _restaurant_id
         AND link.kind = 'connecting'
         AND (link.room_id = room.id OR link.other_room_id = room.id)
     ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'CONNECTING_ROOM_REQUIRED')
    );
  END IF;

  IF public.pms_stay_overlaps_room(
    _restaurant_id,
    room.id,
    _arrival,
    _departure,
    _exclude_reservation_id
  ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_ALREADY_BOOKED')
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.status = 'active'
      AND block.inventory_impact IN (
        'remove_from_inventory',
        'assignment_only'
      )
      AND block.start_date < _departure
      AND block.end_date > _arrival
      AND (
        (block.target_kind = 'room' AND block.room_id = room.id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_BLOCKED')
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.status = 'active'
      AND block.inventory_impact = 'warning_only'
      AND block.start_date < _departure
      AND block.end_date > _arrival
      AND (
        (block.target_kind = 'room' AND block.room_id = room.id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'WARNING_BLOCK')
    );
  END IF;

  IF rule_require_maintenance THEN
    SELECT COALESCE((
      SELECT status_rule.prevents_room_assignment
      FROM public.pms_maintenance_status_rules status_rule
      WHERE status_rule.restaurant_id = _restaurant_id
        AND status_rule.maintenance_status = room.maintenance_status
        AND status_rule.active
    ), false)
    INTO maintenance_prevents;

    IF maintenance_prevents THEN
      blockers := blockers || jsonb_build_array(
        jsonb_build_object('code', 'MAINTENANCE_NOT_CLEAR')
      );
    END IF;
  END IF;

  IF _for_check_in OR rule_require_housekeeping OR rule_housekeeping_affects THEN
    housekeeping_ready := true;

    IF COALESCE((
      SELECT settings.clean_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.housekeeping_status NOT IN ('clean', 'inspected') THEN
      housekeeping_ready := false;
    END IF;

    IF COALESCE((
      SELECT settings.inspection_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.housekeeping_status <> 'inspected' THEN
      housekeeping_ready := false;
    END IF;

    IF COALESCE((
      SELECT settings.maintenance_clear_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.maintenance_status <> 'normal' THEN
      housekeeping_ready := false;
    END IF;

    IF NOT housekeeping_ready THEN
      blockers := blockers || jsonb_build_array(
        jsonb_build_object('code', 'HOUSEKEEPING_NOT_READY')
      );
    END IF;
  END IF;

  IF rule_use_building AND _preferred_building_id IS NOT NULL THEN
    IF room.building_id = _preferred_building_id THEN
      preference_score := preference_score + 10;
      preference_reasons := array_append(
        preference_reasons,
        'building_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'BUILDING_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  IF rule_use_floor AND _preferred_floor_id IS NOT NULL THEN
    IF room.floor_id = _preferred_floor_id THEN
      preference_score := preference_score + 10;
      preference_reasons := array_append(
        preference_reasons,
        'floor_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'FLOOR_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  IF rule_use_guest THEN
    IF _guest_preference_matched THEN
      preference_score := preference_score + 5;
      preference_reasons := array_append(
        preference_reasons,
        'guest_preference_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'GUEST_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'warnings', warnings,
    'preferenceScore', preference_score,
    'preferenceReasons', to_jsonb(preference_reasons)
  );
END;
$$;

