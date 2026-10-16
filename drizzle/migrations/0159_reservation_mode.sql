-- GROUP-RES-01: booking-level reservation mode.
-- single owns exactly one room unit. group may own one or more.
-- This is not a group block. pms_group_id and pms_group_block_id are unchanged.
-- Apply 0153 through 0158 before this file. Do not apply from an agent.

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS reservation_mode text NOT NULL DEFAULT 'single';

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_reservation_mode_check;

ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_reservation_mode_check
  CHECK (reservation_mode IN ('single', 'group'));

COMMENT ON COLUMN public.hotel_reservations.reservation_mode IS
  'Booking mode. single is one room unit. group may own several room units. Not a group block.';

UPDATE public.hotel_reservations AS reservation
   SET reservation_mode = 'group'
 WHERE (
   SELECT count(*)
   FROM public.hotel_reservation_rooms AS unit
   WHERE unit.reservation_id = reservation.id
     AND unit.restaurant_id = reservation.restaurant_id
 ) > 1;

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb
);

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb
);

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
  _room_units jsonb DEFAULT NULL,
  _reservation_mode text DEFAULT NULL
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
  mode_value text;
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

  mode_value := lower(btrim(COALESCE(_reservation_mode, '')));
  IF mode_value = '' THEN
    mode_value := CASE WHEN unit_count > 1 THEN 'group' ELSE 'single' END;
  ELSIF mode_value NOT IN ('single', 'group') THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_MODE';
  END IF;

  IF mode_value = 'single' AND unit_count > 1 THEN
    RAISE EXCEPTION 'SINGLE_RESERVATION_ROOM_LIMIT';
  END IF;

  UPDATE public.hotel_reservations
     SET reservation_mode = mode_value
   WHERE id = created.id
     AND restaurant_id = created.restaurant_id
  RETURNING * INTO created;

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

CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced_commercial(
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
  _reservation_mode text DEFAULT NULL
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
BEGIN
  created := public.create_hotel_reservation_priced(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _rate_plan_id, _membership_id,
    _company_master_id, _travel_agent_master_id,
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method,
    _rooms, _infants, _quote_currency, _room_units, _reservation_mode
  );

  IF _promotion_activation_id IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_promotion(
      _restaurant_id, created.id, _promotion_activation_id, 'apply'
    );
  END IF;

  IF _package_activation_ids IS NOT NULL THEN
    PERFORM public.sync_hotel_reservation_packages(
      _restaurant_id, created.id, _package_activation_ids, 'apply'
    );
  END IF;

  SELECT * INTO created FROM public.hotel_reservations WHERE id = created.id;
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text, integer, integer, text, jsonb, text
) TO service_role;
