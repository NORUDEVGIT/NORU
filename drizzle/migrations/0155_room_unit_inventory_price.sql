-- STAY-08D: room units own inventory and price.
--
-- Availability counts hotel_reservation_rooms. A booking with no unit row
-- still counts as one room. rooms_requested is not an inventory quantity.
-- An assigned unit blocks that physical room. An unassigned unit consumes
-- one room of its type.
--
-- The reservation room total is the sum of unit room_subtotal values.
-- One unit keeps the priced master amount, including a one-room
-- rooms_requested multiplier. More than one unit replaces the master price
-- fields with that sum. The first room remains the master room, rate plan,
-- and occupancy until STAY-08G.
--
-- A multi-room stay can still save notes. Changing its dates, room,
-- occupancy, or rate plan raises MULTI_ROOM_AMEND_UNSUPPORTED so an amend
-- cannot replace the aggregate with the first room's price.
--
-- Front Office check-in, check-out, and no-show writers are not replaced.
-- Packages stay on the reservation.
--
-- Dual-lane: byte-identical copies.
-- Do not apply from an agent.


CREATE OR REPLACE FUNCTION public.pms_room_unit_claims_room(
  _restaurant_id uuid,
  _room_id uuid,
  _night date,
  _exclude_reservation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    JOIN public.hotel_reservations reservation
      ON reservation.id = unit.reservation_id
     AND reservation.restaurant_id = unit.restaurant_id
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.room_id = _room_id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND unit.arrival_date <= _night
      AND unit.departure_date > _night
  )
  OR EXISTS (
    SELECT 1
    FROM public.hotel_reservations reservation
    WHERE reservation.restaurant_id = _restaurant_id
      AND reservation.room_id = _room_id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND reservation.arrival_date <= _night
      AND reservation.departure_date > _night
      AND NOT EXISTS (
        SELECT 1
        FROM public.hotel_reservation_rooms unit
        WHERE unit.reservation_id = reservation.id
          AND unit.restaurant_id = reservation.restaurant_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.pms_room_unit_claims_room(uuid, uuid, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_unit_claims_room(uuid, uuid, date, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_stay_overlaps_room(
  _restaurant_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms unit
    JOIN public.hotel_reservations reservation
      ON reservation.id = unit.reservation_id
     AND reservation.restaurant_id = unit.restaurant_id
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.room_id = _room_id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND unit.arrival_date < _departure
      AND unit.departure_date > _arrival
  )
  OR EXISTS (
    SELECT 1
    FROM public.hotel_reservations reservation
    WHERE reservation.restaurant_id = _restaurant_id
      AND reservation.room_id = _room_id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND reservation.arrival_date < _departure
      AND reservation.departure_date > _arrival
      AND NOT EXISTS (
        SELECT 1
        FROM public.hotel_reservation_rooms unit
        WHERE unit.reservation_id = reservation.id
          AND unit.restaurant_id = reservation.restaurant_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.pms_stay_overlaps_room(uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_stay_overlaps_room(uuid, uuid, date, date, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.pms_unassigned_room_demand(
  _restaurant_id uuid,
  _room_type_id uuid,
  _night date,
  _exclude_reservation_id uuid,
  _pool_room_ids uuid[]
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    SELECT count(*)::integer
    FROM public.hotel_reservation_rooms unit
    JOIN public.hotel_reservations reservation
      ON reservation.id = unit.reservation_id
     AND reservation.restaurant_id = unit.restaurant_id
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.room_type_id = _room_type_id
      AND (
        unit.room_id IS NULL
        OR NOT (unit.room_id = ANY (COALESCE(_pool_room_ids, ARRAY[]::uuid[])))
      )
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND unit.arrival_date <= _night
      AND unit.departure_date > _night
  ) + (
    SELECT count(*)::integer
    FROM public.hotel_reservations reservation
    WHERE reservation.restaurant_id = _restaurant_id
      AND reservation.room_type_id = _room_type_id
      AND (
        reservation.room_id IS NULL
        OR NOT (reservation.room_id = ANY (COALESCE(_pool_room_ids, ARRAY[]::uuid[])))
      )
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND reservation.arrival_date <= _night
      AND reservation.departure_date > _night
      AND NOT EXISTS (
        SELECT 1
        FROM public.hotel_reservation_rooms unit
        WHERE unit.reservation_id = reservation.id
          AND unit.restaurant_id = reservation.restaurant_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.pms_unassigned_room_demand(uuid, uuid, date, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_unassigned_room_demand(uuid, uuid, date, uuid, uuid[])
  TO service_role;


CREATE OR REPLACE FUNCTION public.pms_room_type_availability(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_type_id uuid,
  arrival date,
  departure date,
  business_date date,
  physical_capacity integer,
  available integer,
  limiting_date date,
  overbooking_allowance integer,
  nightly jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  property_business_date date;
  capacity_count integer;
  available_count integer;
  limiting_night date;
  nightly_rows jsonb;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_PRIVILEGE';
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

  WITH policy AS (
    SELECT
      COALESCE((
        SELECT rules.sellable_status_required
        FROM public.pms_inventory_rules rules
        WHERE rules.restaurant_id = _restaurant_id
      ), true) AS sellable_required,
      COALESCE((
        SELECT rules.maintenance_affects_availability
        FROM public.pms_inventory_rules rules
        WHERE rules.restaurant_id = _restaurant_id
      ), false) AS maintenance_affects
  ),
  pool AS (
    SELECT room.id, room.status
    FROM public.hotel_rooms room
    JOIN public.room_types room_type
      ON room_type.id = room.room_type_id
     AND room_type.restaurant_id = room.restaurant_id
    CROSS JOIN policy
    WHERE room.restaurant_id = _restaurant_id
      AND room.room_type_id = _room_type_id
      AND room.active
      AND room_type.active
      AND room_type.sellable
      AND (NOT policy.sellable_required OR room.sellable)
      AND (
        NOT policy.maintenance_affects
        OR room.maintenance_status = 'normal'
      )
  ),
  nights AS (
    SELECT day_value::date AS night
    FROM generate_series(
      _arrival::timestamp,
      (_departure - 1)::timestamp,
      interval '1 day'
    ) AS day_value
  ),
  claims AS (
    SELECT
      nights.night,
      (SELECT count(*)::integer FROM pool) AS capacity,
      (
        SELECT count(*)::integer
        FROM pool
        WHERE (
          nights.night = property_business_date
          AND pool.status IN ('out_of_order', 'out_of_service')
        )
        OR EXISTS (
          SELECT 1
          FROM public.pms_operational_inventory_blocks block
          WHERE block.restaurant_id = _restaurant_id
            AND block.room_type_id = _room_type_id
            AND block.room_id = pool.id
            AND block.target_kind = 'room'
            AND block.status = 'active'
            AND block.inventory_impact = 'remove_from_inventory'
            AND block.start_date <= nights.night
            AND block.end_date > nights.night
        )
        OR public.pms_room_unit_claims_room(
          _restaurant_id,
          pool.id,
          nights.night,
          _exclude_reservation_id
        )
      ) AS pinned_room_claims,
      EXISTS (
        SELECT 1
        FROM public.pms_operational_inventory_blocks block
        WHERE block.restaurant_id = _restaurant_id
          AND block.room_type_id = _room_type_id
          AND block.target_kind = 'room_type'
          AND block.status = 'active'
          AND block.inventory_impact = 'remove_from_inventory'
          AND block.start_date <= nights.night
          AND block.end_date > nights.night
      ) AS type_hold,
      COALESCE((
        SELECT sum(block.quantity)::integer
        FROM public.pms_operational_inventory_blocks block
        WHERE block.restaurant_id = _restaurant_id
          AND block.room_type_id = _room_type_id
          AND block.target_kind = 'quantity'
          AND block.status = 'active'
          AND block.inventory_impact = 'remove_from_inventory'
          AND block.start_date <= nights.night
          AND block.end_date > nights.night
      ), 0) AS quantity_hold,
      public.pms_unassigned_room_demand(
        _restaurant_id,
        _room_type_id,
        nights.night,
        _exclude_reservation_id,
        ARRAY(SELECT pool.id FROM pool)
      ) AS unrepresented_reservation_demand
    FROM nights
  ),
  after_pinned AS (
    SELECT
      claims.*,
      GREATEST(claims.capacity - claims.pinned_room_claims, 0) AS free_after_pinned
    FROM claims
  ),
  after_holds AS (
    SELECT
      after_pinned.*,
      CASE
        WHEN after_pinned.type_hold THEN 0
        ELSE GREATEST(
          after_pinned.free_after_pinned
          - LEAST(
              after_pinned.quantity_hold,
              after_pinned.free_after_pinned
            ),
          0
        )
      END AS free_after_holds
    FROM after_pinned
  ),
  calculated AS (
    SELECT
      after_holds.*,
      GREATEST(
        after_holds.free_after_holds
        - after_holds.unrepresented_reservation_demand,
        0
      ) AS nightly_available
    FROM after_holds
  )
  SELECT
    COALESCE(max(calculated.capacity), 0)::integer,
    COALESCE(min(calculated.nightly_available), 0)::integer,
    (
      array_agg(
        calculated.night
        ORDER BY calculated.nightly_available, calculated.night
      )
    )[1],
    jsonb_agg(
      jsonb_build_object(
        'date', calculated.night,
        'physicalCapacity', calculated.capacity,
        'pinnedRoomClaims', calculated.pinned_room_claims,
        'typeHold', calculated.type_hold,
        'quantityHoldApplied',
          LEAST(calculated.quantity_hold, calculated.free_after_pinned),
        'unrepresentedReservationDemand',
          calculated.unrepresented_reservation_demand,
        'available', calculated.nightly_available
      )
      ORDER BY calculated.night
    )
  INTO capacity_count, available_count, limiting_night, nightly_rows
  FROM calculated;

  RETURN QUERY SELECT
    _room_type_id,
    _arrival,
    _departure,
    property_business_date,
    capacity_count,
    available_count,
    limiting_night,
    0,
    COALESCE(nightly_rows, '[]'::jsonb);
END;
$$;

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
  property_business_date date;
  sellable_required boolean;
  require_type_match boolean;
  require_maintenance boolean;
  maintenance_prevents boolean;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = _room_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
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

  SELECT
    COALESCE((
      SELECT rules.sellable_status_required
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT rules.require_room_type_match
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT rules.require_maintenance_availability
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false)
  INTO sellable_required, require_type_match, require_maintenance;

  IF room.active IS NOT TRUE
     OR (require_type_match AND room.room_type_id <> _room_type_id)
     OR (
       _arrival <= property_business_date
       AND _departure > property_business_date
       AND room.status <> 'available'
     )
     OR (sellable_required AND room.sellable IS NOT TRUE) THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;

  IF require_maintenance THEN
    SELECT COALESCE((
      SELECT status_rule.prevents_room_assignment
      FROM public.pms_maintenance_status_rules status_rule
      WHERE status_rule.restaurant_id = _restaurant_id
        AND status_rule.maintenance_status = room.maintenance_status
        AND status_rule.active
    ), false)
    INTO maintenance_prevents;

    IF maintenance_prevents THEN
      RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
    END IF;
  END IF;

  IF public.pms_stay_overlaps_room(
    _restaurant_id,
    _room_id,
    _arrival,
    _departure,
    _exclude_reservation_id
  ) THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
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
        (block.target_kind = 'room' AND block.room_id = _room_id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;
END;
$$;

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
  sellable_required boolean;
  require_type_match boolean;
  require_occupancy_match boolean;
  require_bed_match boolean;
  require_accessibility_match boolean;
  require_connecting_match boolean;
  require_maintenance boolean;
  require_housekeeping boolean;
  housekeeping_affects boolean;
  use_building boolean;
  use_floor boolean;
  use_guest boolean;
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

  SELECT
    COALESCE((SELECT sellable_status_required FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), true),
    COALESCE((SELECT require_room_type_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), true),
    COALESCE((SELECT require_occupancy_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_bed_type_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_accessibility_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_connecting_room_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_maintenance_availability FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_housekeeping_readiness FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT housekeeping_affects_assignment FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_building_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_floor_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_guest_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false)
  INTO
    sellable_required,
    require_type_match,
    require_occupancy_match,
    require_bed_match,
    require_accessibility_match,
    require_connecting_match,
    require_maintenance,
    require_housekeeping,
    housekeeping_affects,
    use_building,
    use_floor,
    use_guest;

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

  IF require_type_match AND room.room_type_id <> _room_type_id THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_TYPE_MISMATCH')
    );
  END IF;

  IF sellable_required AND NOT room.sellable THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_NOT_SELLABLE')
    );
  END IF;

  IF require_occupancy_match
     AND COALESCE(_adults, 0) + COALESCE(_children, 0)
         > COALESCE(room_type.max_occupancy, 0) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'OCCUPANCY_EXCEEDED')
    );
  END IF;

  IF require_bed_match
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

  IF require_accessibility_match
     AND _accessible_required
     AND NOT room.accessible THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ACCESSIBILITY_MISMATCH')
    );
  END IF;

  IF require_connecting_match
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

  IF require_maintenance THEN
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

  IF _for_check_in OR require_housekeeping OR housekeeping_affects THEN
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

  IF use_building AND _preferred_building_id IS NOT NULL THEN
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

  IF use_floor AND _preferred_floor_id IS NOT NULL THEN
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

  IF use_guest THEN
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

CREATE OR REPLACE FUNCTION public.pms_assert_operational_block_activatable(
  _restaurant_id uuid,
  _block_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  type_policy public.pms_inventory_block_type_rules%ROWTYPE;
BEGIN
  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  PERFORM 1
  FROM public.room_types
  WHERE id = block.room_type_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  SELECT *
  INTO type_policy
  FROM public.pms_inventory_block_type_rules
  WHERE restaurant_id = _restaurant_id
    AND block_type = block.block_type;

  IF NOT FOUND
     OR type_policy.enabled IS NOT TRUE
     OR type_policy.inventory_impact <> block.inventory_impact
     OR type_policy.approval_required <> block.approval_required THEN
    RAISE EXCEPTION 'BLOCK_POLICY_CHANGED';
  END IF;

  IF block.target_kind = 'room' THEN
    PERFORM 1
    FROM public.hotel_rooms
    WHERE id = block.room_id
      AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    IF block.inventory_impact IN (
      'remove_from_inventory',
      'assignment_only'
    )
    AND public.pms_stay_overlaps_room(
      _restaurant_id,
      block.room_id,
      block.start_date,
      block.end_date,
      NULL
    ) THEN
      RAISE EXCEPTION 'BLOCK_CONFLICTS_WITH_RESERVATION';
    END IF;
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
BEGIN
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
      IF demand_row.unassigned_need > available_count THEN
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

REVOKE ALL ON FUNCTION public.assert_reservation_room_units(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_reservation_room_units(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_reservation_room_total(
  _restaurant_id uuid,
  _reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_count integer;
  total numeric;
  next_currency text;
  next_nightly jsonb;
  any_priced boolean;
BEGIN
  SELECT count(*) INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;

  IF COALESCE(unit_count, 0) = 0 THEN
    RETURN;
  END IF;

  IF unit_count = 1 THEN
    UPDATE public.hotel_reservations reservation
       SET room_subtotal = unit.room_subtotal,
           currency = COALESCE(unit.currency, reservation.currency),
           nightly_rate_snapshot = unit.nightly_rate_snapshot,
           priced_at = COALESCE(unit.priced_at, reservation.priced_at)
      FROM public.hotel_reservation_rooms unit
     WHERE reservation.id = _reservation_id
       AND reservation.restaurant_id = _restaurant_id
       AND unit.reservation_id = reservation.id
       AND unit.restaurant_id = reservation.restaurant_id
       AND unit.unit_sequence = 1;
    RETURN;
  END IF;

  SELECT
    sum(unit.room_subtotal),
    (array_agg(unit.currency ORDER BY unit.unit_sequence) FILTER (WHERE unit.currency IS NOT NULL))[1],
    bool_or(unit.priced_at IS NOT NULL)
  INTO total, next_currency, any_priced
  FROM public.hotel_reservation_rooms unit
  WHERE unit.restaurant_id = _restaurant_id
    AND unit.reservation_id = _reservation_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('date', night.night, 'rate', night.rate)
      ORDER BY night.night
    ),
    '[]'::jsonb
  )
  INTO next_nightly
  FROM (
    SELECT line->>'date' AS night, sum((line->>'rate')::numeric) AS rate
    FROM public.hotel_reservation_rooms unit
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(unit.nightly_rate_snapshot) = 'array' THEN unit.nightly_rate_snapshot
        ELSE '[]'::jsonb
      END
    ) AS line
    WHERE unit.restaurant_id = _restaurant_id
      AND unit.reservation_id = _reservation_id
    GROUP BY line->>'date'
  ) AS night;

  UPDATE public.hotel_reservations
     SET room_subtotal = total,
         currency = COALESCE(next_currency, currency),
         nightly_rate_snapshot = next_nightly,
         priced_at = CASE WHEN any_priced THEN now() ELSE priced_at END
   WHERE id = _reservation_id
     AND restaurant_id = _restaurant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_reservation_room_total(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_reservation_room_total(uuid, uuid)
  TO service_role;


CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced(
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
  _company_master_id uuid DEFAULT NULL,
  _travel_agent_master_id uuid DEFAULT NULL,
  _commercial_booking_source text DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _external_reference text DEFAULT NULL,
  _guarantee_method text DEFAULT NULL,
  _rooms integer DEFAULT 1,
  _infants integer DEFAULT 0,
  _quote_currency text DEFAULT NULL,
  _room_units jsonb DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
  pricing jsonb;
  plan public.hotel_rate_plans%ROWTYPE;
  cancel_row public.pms_rate_cancellation_policies%ROWTYPE;
  refund_row public.pms_rate_refundability_codes%ROWTYPE;
  unit jsonb;
  unit_index integer;
  unit_count integer;
  unit_type uuid;
  unit_adults integer;
  unit_children integer;
  unit_infants integer;
  unit_plan uuid;
  unit_cap integer;
  unit_pricing jsonb;
BEGIN
  created := public.create_hotel_reservation(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
  );

  UPDATE public.hotel_reservations
     SET rooms_requested = COALESCE(_rooms, 1),
         infants = COALESCE(_infants, 0)
   WHERE id = created.id
  RETURNING * INTO created;

  IF _rate_plan_id IS NOT NULL THEN
    pricing := public.price_hotel_stay(
      _restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure,
      COALESCE(_rooms, 1), _adults, _children, COALESCE(_infants, 0), _quote_currency, CURRENT_DATE
    );

    SELECT * INTO plan FROM public.hotel_rate_plans
     WHERE id = _rate_plan_id AND restaurant_id = _restaurant_id;
    IF plan.cancellation_policy_id IS NOT NULL THEN
      SELECT * INTO cancel_row FROM public.pms_rate_cancellation_policies
       WHERE id = plan.cancellation_policy_id AND restaurant_id = _restaurant_id;
    END IF;
    IF plan.refundability_id IS NOT NULL THEN
      SELECT * INTO refund_row FROM public.pms_rate_refundability_codes
       WHERE id = plan.refundability_id AND restaurant_id = _restaurant_id;
    END IF;

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now(),
        cancellation_policy_snapshot = CASE
          WHEN cancel_row.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', cancel_row.id,
            'code', cancel_row.code,
            'name', cancel_row.name,
            'deadline_hours', cancel_row.deadline_hours,
            'penalty_type', cancel_row.penalty_type,
            'penalty_value', cancel_row.penalty_value
          )
        END,
        refundability_snapshot = CASE
          WHEN refund_row.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'id', refund_row.id,
            'code', refund_row.code,
            'name', refund_row.name,
            'kind', refund_row.kind
          )
        END
    WHERE id = created.id
    RETURNING * INTO created;
  END IF;

  unit_count := CASE
    WHEN _room_units IS NULL OR jsonb_typeof(_room_units) <> 'array' THEN 0
    ELSE jsonb_array_length(_room_units)
  END;

  IF unit_count > 20 THEN
    RAISE EXCEPTION 'INVALID_ROOM_UNITS';
  END IF;

  IF unit_count > 0 THEN
    unit := _room_units->0;
    IF (unit->>'room_type_id')::uuid IS DISTINCT FROM _room_type_id
       OR COALESCE((unit->>'adults')::integer, _adults) IS DISTINCT FROM _adults
       OR COALESCE((unit->>'children')::integer, _children) IS DISTINCT FROM _children
       OR COALESCE((unit->>'infants')::integer, COALESCE(_infants, 0)) IS DISTINCT FROM COALESCE(_infants, 0)
       OR NULLIF(unit->>'rate_plan_id', '')::uuid IS DISTINCT FROM _rate_plan_id
    THEN
      RAISE EXCEPTION 'ROOM_UNIT_MASTER_MISMATCH';
    END IF;
  END IF;

  INSERT INTO public.hotel_reservation_rooms (
    restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
    arrival_date, departure_date, adults, children, infants, rate_plan_id,
    currency, nightly_rate_snapshot, room_subtotal, priced_at
  ) VALUES (
    created.restaurant_id, created.id, 1, created.room_type_id, created.room_id,
    created.arrival_date, created.departure_date, created.adults, created.children,
    created.infants, created.rate_plan_id, created.currency, created.nightly_rate_snapshot,
    created.room_subtotal, created.priced_at
  );

  FOR unit_index IN 1..GREATEST(unit_count - 1, 0) LOOP
    unit := _room_units->unit_index;
    unit_type := NULLIF(unit->>'room_type_id', '')::uuid;
    unit_adults := COALESCE((unit->>'adults')::integer, 1);
    unit_children := COALESCE((unit->>'children')::integer, 0);
    unit_infants := COALESCE((unit->>'infants')::integer, 0);
    unit_plan := NULLIF(unit->>'rate_plan_id', '')::uuid;

    SELECT room_type.max_occupancy INTO unit_cap
      FROM public.room_types room_type
     WHERE room_type.id = unit_type
       AND room_type.restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
    END IF;
    IF unit_cap IS NOT NULL AND unit_adults + unit_children > unit_cap THEN
      RAISE EXCEPTION 'OCCUPANCY_EXCEEDED';
    END IF;

    unit_pricing := NULL;
    IF unit_plan IS NOT NULL THEN
      unit_pricing := public.price_hotel_stay(
        _restaurant_id, unit_plan, unit_type, created.arrival_date, created.departure_date,
        1, unit_adults, unit_children, unit_infants, created.currency, CURRENT_DATE
      );
    END IF;

    INSERT INTO public.hotel_reservation_rooms (
      restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
      arrival_date, departure_date, adults, children, infants, rate_plan_id,
      currency, nightly_rate_snapshot, room_subtotal, priced_at
    ) VALUES (
      created.restaurant_id,
      created.id,
      unit_index + 1,
      unit_type,
      NULL,
      created.arrival_date,
      created.departure_date,
      unit_adults,
      unit_children,
      unit_infants,
      unit_plan,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE unit_pricing->>'currency' END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE unit_pricing->'nightly' END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE (unit_pricing->>'subtotal')::numeric END,
      CASE WHEN unit_pricing IS NULL THEN NULL ELSE now() END
    );
  END LOOP;

  PERFORM public.assert_reservation_room_units(created.restaurant_id, created.id);
  PERFORM public.sync_reservation_room_total(created.restaurant_id, created.id);
  SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;

  RETURN created;
END;
$$;


CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_priced(
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
  _infants integer DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  before_row public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  pricing jsonb;
  stay_changed boolean;
  dates_changed boolean;
  extended boolean;
  deposit_type text;
  deposit_value numeric;
  computed_amount numeric;
  first_night numeric;
  unit_count integer;
BEGIN
  SELECT * INTO before_row
    FROM public.hotel_reservations
   WHERE id = _reservation_id
     AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF before_row.status IN ('checked_out', 'no_show') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  SELECT count(*) INTO unit_count
    FROM public.hotel_reservation_rooms
   WHERE reservation_id = _reservation_id
     AND restaurant_id = _restaurant_id;

  IF COALESCE(unit_count, 0) > 1 AND (
    before_row.arrival_date IS DISTINCT FROM _arrival
    OR before_row.departure_date IS DISTINCT FROM _departure
    OR before_row.room_type_id IS DISTINCT FROM _room_type_id
    OR before_row.room_id IS DISTINCT FROM _room_id
    OR before_row.adults IS DISTINCT FROM _adults
    OR before_row.children IS DISTINCT FROM _children
    OR (_infants IS NOT NULL AND before_row.infants IS DISTINCT FROM _infants)
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id
  ) THEN
    RAISE EXCEPTION 'MULTI_ROOM_AMEND_UNSUPPORTED';
  END IF;

  dates_changed := before_row.arrival_date IS DISTINCT FROM _arrival
    OR before_row.departure_date IS DISTINCT FROM _departure;
  IF dates_changed AND before_row.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  updated := public.amend_hotel_reservation(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _membership_id
  );

  IF _infants IS NOT NULL AND before_row.infants IS DISTINCT FROM _infants THEN
    UPDATE public.hotel_reservations
       SET infants = _infants
     WHERE id = updated.id
    RETURNING * INTO updated;
  END IF;

  stay_changed := dates_changed
    OR before_row.room_type_id IS DISTINCT FROM updated.room_type_id
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id
    OR before_row.adults IS DISTINCT FROM updated.adults
    OR before_row.children IS DISTINCT FROM updated.children
    OR (_infants IS NOT NULL AND before_row.infants IS DISTINCT FROM _infants);

  IF dates_changed THEN
    extended := before_row.arrival_date IS NOT DISTINCT FROM updated.arrival_date
      AND updated.departure_date > before_row.departure_date;
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id,
      updated.id,
      CASE WHEN extended THEN 'stay_extended' ELSE 'stay_dates_changed' END,
      jsonb_build_object(
        'arrival_date', before_row.arrival_date,
        'departure_date', before_row.departure_date,
        'adults', before_row.adults,
        'children', before_row.children,
        'infants', before_row.infants,
        'nights', (before_row.departure_date - before_row.arrival_date)
      ),
      jsonb_build_object(
        'arrival_date', updated.arrival_date,
        'departure_date', updated.departure_date,
        'adults', updated.adults,
        'children', updated.children,
        'infants', updated.infants,
        'nights', (updated.departure_date - updated.arrival_date)
      ),
      _membership_id
    );
  END IF;

  IF _rate_plan_id IS NOT NULL AND stay_changed THEN
    pricing := public.price_hotel_stay(
      _restaurant_id,
      _rate_plan_id,
      updated.room_type_id,
      updated.arrival_date,
      updated.departure_date,
      1,
      updated.adults,
      updated.children,
      COALESCE(updated.infants, 0),
      updated.currency,
      CURRENT_DATE
    );

    UPDATE public.hotel_reservations
       SET rate_plan_id = _rate_plan_id,
           currency = pricing->>'currency',
           room_subtotal = (pricing->>'subtotal')::numeric,
           nightly_rate_snapshot = pricing->'nightly',
           priced_at = now()
     WHERE id = updated.id
    RETURNING * INTO updated;

    IF updated.deposit_requirement_snapshot IS NOT NULL THEN
      deposit_type := updated.deposit_requirement_snapshot->>'deposit_type';
      deposit_value := COALESCE((updated.deposit_requirement_snapshot->>'deposit_value')::numeric, 0);
      first_night := COALESCE((pricing->'nightly'->0->>'rate')::numeric, 0);
      computed_amount := CASE deposit_type
        WHEN 'none' THEN 0
        WHEN 'fixed' THEN round(deposit_value, 2)
        WHEN 'percent' THEN round((pricing->>'subtotal')::numeric * deposit_value / 100.0, 2)
        WHEN 'first_night' THEN round(first_night, 2)
        ELSE COALESCE((updated.deposit_requirement_snapshot->>'computed_amount')::numeric, 0)
      END;
      UPDATE public.hotel_reservations
         SET deposit_requirement_snapshot = jsonb_set(
           updated.deposit_requirement_snapshot,
           '{computed_amount}',
           to_jsonb(computed_amount),
           true
         )
       WHERE id = updated.id
      RETURNING * INTO updated;
    END IF;

    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, updated.id, 'repriced',
      jsonb_build_object(
        'rate_plan_id', before_row.rate_plan_id,
        'room_subtotal', before_row.room_subtotal,
        'currency', before_row.currency,
        'adults', before_row.adults,
        'children', before_row.children,
        'infants', before_row.infants
      ),
      jsonb_build_object(
        'rate_plan_id', updated.rate_plan_id,
        'room_subtotal', updated.room_subtotal,
        'currency', updated.currency,
        'adults', updated.adults,
        'children', updated.children,
        'infants', updated.infants,
        'rooms', 1
      ),
      _membership_id
    );
  END IF;

  IF stay_changed THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, updated.id, NULL, 'reevaluate'
    );
    PERFORM public.sync_hotel_reservation_packages(
      _restaurant_id, updated.id, NULL, 'reevaluate'
    );
  END IF;

  IF COALESCE(unit_count, 0) = 1 THEN
    UPDATE public.hotel_reservation_rooms
       SET room_type_id = updated.room_type_id,
           room_id = updated.room_id,
           arrival_date = updated.arrival_date,
           departure_date = updated.departure_date,
           adults = updated.adults,
           children = updated.children,
           infants = COALESCE(updated.infants, 0),
           rate_plan_id = updated.rate_plan_id,
           currency = updated.currency,
           nightly_rate_snapshot = updated.nightly_rate_snapshot,
           room_subtotal = updated.room_subtotal,
           priced_at = updated.priced_at
     WHERE reservation_id = updated.id
       AND restaurant_id = updated.restaurant_id
       AND unit_sequence = 1;
    PERFORM public.sync_reservation_room_total(updated.restaurant_id, updated.id);
    SELECT * INTO updated
      FROM public.hotel_reservations
     WHERE id = updated.id;
  END IF;

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_availability(uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_availability(uuid, uuid, date, date, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.pms_evaluate_room_assignment(
  uuid, uuid, uuid, date, date, uuid, integer, integer, text, boolean, boolean, uuid, uuid, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_evaluate_room_assignment(
  uuid, uuid, uuid, date, date, uuid, integer, integer, text, boolean, boolean, uuid, uuid, boolean, boolean
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pms_assert_operational_block_activatable(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid, integer
) TO service_role;


DO $$
DECLARE
  booking record;
BEGIN
  FOR booking IN
    SELECT reservation_id, restaurant_id
    FROM public.hotel_reservation_rooms
    GROUP BY reservation_id, restaurant_id
    HAVING count(*) > 1
  LOOP
    PERFORM public.sync_reservation_room_total(booking.restaurant_id, booking.reservation_id);
  END LOOP;
END $$;
