-- Qualify package activation scope lookups.
--
-- sync_hotel_reservation_packages declares a PL/pgSQL variable named activation_id.
-- hotel_package_activation_room_types and hotel_package_activation_rate_plans
-- also have an activation_id column. Unqualified WHERE activation_id = activation.id
-- raises: column reference "activation_id" is ambiguous.
-- Save as Pending and Confirm / Guarantee both reach this function through
-- create_hotel_reservation_priced_commercial when a package activation is selected.
-- The reservation insert and this sync run in that one function, so a raised
-- error rolls the reservation back with the RPC transaction.
--
-- Dual-lane: byte-identical copies.
-- Do not apply from an agent.

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

    SELECT COALESCE(array_agg(activation_room.room_type_id), ARRAY[]::uuid[])
      INTO activation_room_ids
    FROM public.hotel_package_activation_room_types AS activation_room
    WHERE activation_room.activation_id = activation.id
      AND activation_room.restaurant_id = _restaurant_id;

    SELECT COALESCE(array_agg(activation_plan.rate_plan_id), ARRAY[]::uuid[])
      INTO activation_plan_ids
    FROM public.hotel_package_activation_rate_plans AS activation_plan
    WHERE activation_plan.activation_id = activation.id
      AND activation_plan.restaurant_id = _restaurant_id;

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
