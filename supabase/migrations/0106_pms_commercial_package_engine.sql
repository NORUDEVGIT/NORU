-- P5A-03 — Package eligibility persist + atomic reservation package attribution.
-- Dual-lane with supabase/migrations/0106_pms_commercial_package_engine.sql.
-- Does not edit 0016 price_hotel_stay or 0105 in place.
-- Uses 0104 hotel_package_* tables as-is.
-- create_hotel_reservation_priced stays the unpromoted writer.
-- Commercial create gains optional package activation ids.
-- reprice/amend reevaluate existing package attribution after the room snapshot write.

CREATE OR REPLACE FUNCTION public.sync_hotel_reservation_packages(
  _restaurant_id uuid,
  _reservation_id uuid,
  _package_activation_ids uuid[],
  _mode text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reservation public.hotel_reservations%ROWTYPE;
  activation public.hotel_package_activations%ROWTYPE;
  master public.pms_packages%ROWTYPE;
  selected uuid[];
  activation_id uuid;
  last_night date;
  reason text;
  unit_amount numeric(12,2);
  applied_amount numeric(12,2);
  activation_room_ids uuid[];
  activation_plan_ids uuid[];
  master_room_ids uuid[];
  master_plan_ids uuid[];
  effective_room_ids uuid[];
  effective_plan_ids uuid[];
BEGIN
  IF _mode NOT IN ('apply', 'reevaluate') THEN
    RAISE EXCEPTION 'PACKAGE_PRICE_INVALID';
  END IF;

  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF _mode = 'apply' THEN
    selected := COALESCE(_package_activation_ids, ARRAY[]::uuid[]);
    IF cardinality(selected) IS DISTINCT FROM (
      SELECT count(DISTINCT x) FROM unnest(selected) AS x
    ) THEN
      RAISE EXCEPTION 'PACKAGE_DUPLICATE_SELECTION';
    END IF;
  ELSE
    SELECT COALESCE(array_agg(package_activation_id), ARRAY[]::uuid[])
      INTO selected
    FROM public.hotel_reservation_packages
    WHERE reservation_id = reservation.id;
  END IF;

  last_night := reservation.departure_date - 1;

  FOREACH activation_id IN ARRAY selected LOOP
    reason := NULL;
    SELECT * INTO activation
    FROM public.hotel_package_activations
    WHERE id = activation_id;
    IF NOT FOUND THEN
      reason := 'PACKAGE_ACTIVATION_NOT_FOUND';
    ELSIF activation.restaurant_id IS DISTINCT FROM _restaurant_id THEN
      reason := 'PACKAGE_WRONG_PROPERTY';
    ELSIF activation.active IS NOT TRUE THEN
      reason := 'PACKAGE_INACTIVE';
    ELSE
      SELECT * INTO master
      FROM public.pms_packages
      WHERE id = activation.package_id AND restaurant_id = _restaurant_id;
      IF NOT FOUND THEN
        reason := 'PACKAGE_NOT_FOUND';
      ELSIF master.active IS NOT TRUE THEN
        reason := 'PACKAGE_INACTIVE';
      END IF;
    END IF;

    IF reason = 'PACKAGE_ACTIVATION_NOT_FOUND' THEN
      IF _mode = 'apply' THEN
        RAISE EXCEPTION '%', reason;
      END IF;
      DELETE FROM public.hotel_reservation_packages
      WHERE reservation_id = reservation.id
        AND package_activation_id = activation_id;
      CONTINUE;
    END IF;

    IF reason IS NULL AND (
      reservation.arrival_date < activation.valid_from OR last_night > activation.valid_to
    ) THEN
      reason := 'PACKAGE_STAY_WINDOW_MISMATCH';
    END IF;

    SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[])
      INTO activation_room_ids
    FROM public.hotel_package_activation_room_types
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;

    SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[])
      INTO activation_plan_ids
    FROM public.hotel_package_activation_rate_plans
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;

    SELECT COALESCE(
      CASE
        WHEN jsonb_typeof(activation.master_room_type_ids) = 'array' THEN
          ARRAY(SELECT jsonb_array_elements_text(activation.master_room_type_ids)::uuid)
        ELSE ARRAY[]::uuid[]
      END,
      ARRAY[]::uuid[]
    ) INTO master_room_ids;

    SELECT COALESCE(
      CASE
        WHEN jsonb_typeof(activation.master_rate_plan_ids) = 'array' THEN
          ARRAY(SELECT jsonb_array_elements_text(activation.master_rate_plan_ids)::uuid)
        ELSE ARRAY[]::uuid[]
      END,
      ARRAY[]::uuid[]
    ) INTO master_plan_ids;

    -- Activation may narrow master scope. It must never broaden it.
    IF cardinality(activation_room_ids) > 0 THEN
      effective_room_ids := activation_room_ids;
    ELSE
      effective_room_ids := master_room_ids;
    END IF;
    IF cardinality(activation_plan_ids) > 0 THEN
      effective_plan_ids := activation_plan_ids;
    ELSE
      effective_plan_ids := master_plan_ids;
    END IF;

    IF reason IS NULL AND cardinality(master_room_ids) > 0
       AND NOT (reservation.room_type_id = ANY (master_room_ids)) THEN
      reason := 'PACKAGE_ROOM_TYPE_MISMATCH';
    END IF;
    IF reason IS NULL AND cardinality(activation_room_ids) > 0
       AND NOT (reservation.room_type_id = ANY (activation_room_ids)) THEN
      reason := 'PACKAGE_ROOM_TYPE_MISMATCH';
    END IF;
    IF reason IS NULL AND cardinality(master_plan_ids) > 0
       AND (reservation.rate_plan_id IS NULL OR NOT (reservation.rate_plan_id = ANY (master_plan_ids))) THEN
      reason := 'PACKAGE_RATE_PLAN_MISMATCH';
    END IF;
    IF reason IS NULL AND cardinality(activation_plan_ids) > 0
       AND (reservation.rate_plan_id IS NULL OR NOT (reservation.rate_plan_id = ANY (activation_plan_ids))) THEN
      reason := 'PACKAGE_RATE_PLAN_MISMATCH';
    END IF;
    IF reason IS NULL AND activation.charge_basis IS DISTINCT FROM 'per_stay' THEN
      reason := 'PACKAGE_CHARGE_BASIS_UNSUPPORTED';
    END IF;
    IF reason IS NULL AND activation.package_price <= 0 THEN
      reason := 'PACKAGE_PRICE_INVALID';
    END IF;

    IF reason IS NOT NULL THEN
      IF _mode = 'apply' THEN
        RAISE EXCEPTION '%', reason;
      END IF;
      DELETE FROM public.hotel_reservation_packages
      WHERE reservation_id = reservation.id
        AND package_activation_id = activation_id;
      CONTINUE;
    END IF;

    unit_amount := activation.package_price;
    applied_amount := unit_amount;

    INSERT INTO public.hotel_reservation_packages (
      restaurant_id,
      reservation_id,
      package_activation_id,
      package_id,
      package_code,
      package_name,
      charge_basis,
      quantity,
      unit_amount,
      applied_amount,
      components_snapshot,
      snapshot
    ) VALUES (
      _restaurant_id,
      reservation.id,
      activation.id,
      activation.package_id,
      activation.package_code,
      activation.package_name,
      activation.charge_basis,
      1,
      unit_amount,
      applied_amount,
      activation.components_snapshot,
      jsonb_build_object(
        'activationId', activation.id,
        'packageId', activation.package_id,
        'code', activation.package_code,
        'name', activation.package_name,
        'type', activation.package_type,
        'packagePrice', activation.package_price,
        'chargeBasis', activation.charge_basis,
        'components', activation.components_snapshot,
        'validFrom', activation.valid_from,
        'validTo', activation.valid_to,
        'roomTypeIds', to_jsonb(effective_room_ids),
        'ratePlanIds', to_jsonb(effective_plan_ids)
      )
    )
    ON CONFLICT (reservation_id, package_activation_id) DO UPDATE SET
      restaurant_id = EXCLUDED.restaurant_id,
      package_id = EXCLUDED.package_id,
      package_code = EXCLUDED.package_code,
      package_name = EXCLUDED.package_name,
      charge_basis = EXCLUDED.charge_basis,
      quantity = EXCLUDED.quantity,
      unit_amount = EXCLUDED.unit_amount,
      applied_amount = EXCLUDED.applied_amount,
      components_snapshot = EXCLUDED.components_snapshot,
      snapshot = EXCLUDED.snapshot,
      applied_at = now();
  END LOOP;

  IF _mode = 'apply' THEN
    IF cardinality(selected) = 0 THEN
      DELETE FROM public.hotel_reservation_packages WHERE reservation_id = reservation.id;
    ELSE
      DELETE FROM public.hotel_reservation_packages
      WHERE reservation_id = reservation.id
        AND NOT (package_activation_id = ANY (selected));
    END IF;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.create_hotel_reservation_priced_commercial(
  uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text
);

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
  _guarantee_method text DEFAULT NULL
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
    _commercial_booking_source, _market_segment, _external_reference, _guarantee_method
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

CREATE OR REPLACE FUNCTION public.reprice_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _rate_plan_id uuid,
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
  pricing jsonb;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  pricing := public.price_hotel_stay(
    _restaurant_id, _rate_plan_id, existing.room_type_id, existing.arrival_date, existing.departure_date
  );

  UPDATE public.hotel_reservations
  SET rate_plan_id = _rate_plan_id,
      currency = pricing->>'currency',
      room_subtotal = (pricing->>'subtotal')::numeric,
      nightly_rate_snapshot = pricing->'nightly',
      priced_at = now()
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'repriced',
    jsonb_build_object('rate_plan_id', existing.rate_plan_id, 'room_subtotal', existing.room_subtotal,
                       'currency', existing.currency),
    jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                       'currency', updated.currency),
    _membership_id
  );

  PERFORM public.sync_hotel_reservation_promotion(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );
  PERFORM public.sync_hotel_reservation_packages(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );

  RETURN updated;
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
  _membership_id uuid
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
BEGIN
  SELECT * INTO before_row FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  updated := public.amend_hotel_reservation(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _membership_id
  );

  stay_changed := before_row.arrival_date IS DISTINCT FROM updated.arrival_date
    OR before_row.departure_date IS DISTINCT FROM updated.departure_date
    OR before_row.room_type_id IS DISTINCT FROM updated.room_type_id
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id;

  IF _rate_plan_id IS NOT NULL AND stay_changed THEN
    pricing := public.price_hotel_stay(_restaurant_id, _rate_plan_id, updated.room_type_id, updated.arrival_date, updated.departure_date);

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now()
    WHERE id = updated.id
    RETURNING * INTO updated;

    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, updated.id, 'repriced',
      jsonb_build_object('rate_plan_id', before_row.rate_plan_id, 'room_subtotal', before_row.room_subtotal,
                         'currency', before_row.currency),
      jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                         'currency', updated.currency),
      _membership_id
    );
  END IF;

  PERFORM public.sync_hotel_reservation_promotion(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );
  PERFORM public.sync_hotel_reservation_packages(
    _restaurant_id, updated.id, NULL, 'reevaluate'
  );

  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_hotel_reservation_packages(uuid, uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_hotel_reservation_packages(uuid, uuid, uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced_commercial(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid, uuid, uuid[], uuid, uuid, text, text, text, text) TO service_role;
