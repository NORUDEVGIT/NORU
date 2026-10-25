-- Selected-unit package remove, and stay-package reevaluate by unit rate plan.
-- A stay package remains only when every active room unit's effective rate plan
-- is allowed. The first unit copied onto hotel_reservations.rate_plan_id is not
-- the only pointer. Apply still uses that reservation pointer.
-- Room-scoped rows stay out of stay reevaluate.
-- Remove from a selected unit deletes that unit's row, or a stay row only when
-- stay scope is explicit. A sibling unit row is rejected.
-- Checked-in stays can still change packages. Closed, cancelled, no-show, and
-- past unarrived stays cannot. Those rules stay in the server function as well.
-- Package amounts stay snapshots. room_subtotal and the folio are not written.
-- One activation per unit, and a stay row still blocks a unit row.
-- Dual-lane with supabase/migrations/0176_reservation_unit_packages.sql.
-- Do not apply from an agent.

CREATE OR REPLACE FUNCTION public.assert_hotel_reservation_package_mutable(
  _restaurant_id uuid,
  _reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stay_status text;
  stay_arrival date;
  business_date date;
  property_timezone text;
BEGIN
  SELECT reservation.status, reservation.arrival_date
    INTO stay_status, stay_arrival
  FROM public.hotel_reservations AS reservation
  WHERE reservation.id = _reservation_id
    AND reservation.restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT property.business_date, property.timezone
    INTO business_date, property_timezone
  FROM public.restaurants AS property
  WHERE property.id = _restaurant_id;

  IF business_date IS NULL THEN
    business_date := (now() AT TIME ZONE COALESCE(NULLIF(btrim(property_timezone), ''), 'UTC'))::date;
  END IF;

  IF stay_status IN ('checked_out', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'RESERVATION_CLOSED';
  END IF;

  IF stay_status IN ('pending', 'confirmed') AND stay_arrival < business_date THEN
    RAISE EXCEPTION 'ARRIVAL_PASSED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_hotel_reservation_package_mutable(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_hotel_reservation_package_mutable(uuid, uuid)
  TO service_role;

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
    WHERE reservation_id = reservation.id
      AND reservation_room_id IS NULL;
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
        AND package_activation_id = activation_id
        AND reservation_room_id IS NULL;
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
    -- Reevaluate uses every active unit rate plan. Apply keeps the reservation pointer.
    -- Room-scoped package rows stay out of this loop.
    IF _mode = 'reevaluate' AND EXISTS (
      SELECT 1
      FROM public.hotel_reservation_rooms AS stay_unit
      WHERE stay_unit.restaurant_id = _restaurant_id
        AND stay_unit.reservation_id = reservation.id
        AND stay_unit.status IS DISTINCT FROM 'cancelled'
        AND stay_unit.status IS DISTINCT FROM 'no_show'
    ) THEN
      IF reason IS NULL AND cardinality(master_plan_ids) > 0 AND EXISTS (
        SELECT 1
        FROM public.hotel_reservation_rooms AS stay_unit
        WHERE stay_unit.restaurant_id = _restaurant_id
          AND stay_unit.reservation_id = reservation.id
          AND stay_unit.status IS DISTINCT FROM 'cancelled'
          AND stay_unit.status IS DISTINCT FROM 'no_show'
          AND (
            COALESCE(stay_unit.rate_plan_id, reservation.rate_plan_id) IS NULL
            OR NOT (
              COALESCE(stay_unit.rate_plan_id, reservation.rate_plan_id) = ANY (master_plan_ids)
            )
          )
      ) THEN
        reason := 'PACKAGE_RATE_PLAN_MISMATCH';
      END IF;
      IF reason IS NULL AND cardinality(activation_plan_ids) > 0 AND EXISTS (
        SELECT 1
        FROM public.hotel_reservation_rooms AS stay_unit
        WHERE stay_unit.restaurant_id = _restaurant_id
          AND stay_unit.reservation_id = reservation.id
          AND stay_unit.status IS DISTINCT FROM 'cancelled'
          AND stay_unit.status IS DISTINCT FROM 'no_show'
          AND (
            COALESCE(stay_unit.rate_plan_id, reservation.rate_plan_id) IS NULL
            OR NOT (
              COALESCE(stay_unit.rate_plan_id, reservation.rate_plan_id) = ANY (activation_plan_ids)
            )
          )
      ) THEN
        reason := 'PACKAGE_RATE_PLAN_MISMATCH';
      END IF;
    ELSE
      IF reason IS NULL AND cardinality(master_plan_ids) > 0
         AND (reservation.rate_plan_id IS NULL OR NOT (reservation.rate_plan_id = ANY (master_plan_ids))) THEN
        reason := 'PACKAGE_RATE_PLAN_MISMATCH';
      END IF;
      IF reason IS NULL AND cardinality(activation_plan_ids) > 0
         AND (reservation.rate_plan_id IS NULL OR NOT (reservation.rate_plan_id = ANY (activation_plan_ids))) THEN
        reason := 'PACKAGE_RATE_PLAN_MISMATCH';
      END IF;
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
        AND package_activation_id = activation_id
        AND reservation_room_id IS NULL;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.hotel_reservation_packages AS room_package
      WHERE room_package.reservation_id = reservation.id
        AND room_package.package_activation_id = activation.id
        AND room_package.reservation_room_id IS NOT NULL
    ) THEN
      IF _mode = 'apply' THEN
        RAISE EXCEPTION 'PACKAGE_ALREADY_ROOM_SCOPED';
      END IF;
      CONTINUE;
    END IF;

    -- per_stay: quantity 1 and the activation price once. Not nights or guests.
    unit_amount := activation.package_price;
    applied_amount := unit_amount;

    INSERT INTO public.hotel_reservation_packages (
      restaurant_id,
      reservation_id,
      reservation_room_id,
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
      NULL,
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
    ON CONFLICT (reservation_id, package_activation_id) WHERE reservation_room_id IS NULL DO UPDATE SET
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
      DELETE FROM public.hotel_reservation_packages
      WHERE reservation_id = reservation.id
        AND reservation_room_id IS NULL;
    ELSE
      DELETE FROM public.hotel_reservation_packages
      WHERE reservation_id = reservation.id
        AND reservation_room_id IS NULL
        AND NOT (package_activation_id = ANY (selected));
    END IF;
  END IF;
END;
$$;

-- One explicit room package. Quantity is 1. Price is package_price once for that unit.
-- Sibling units are not inserted. The package is not posted to the folio here.
CREATE OR REPLACE FUNCTION public.apply_hotel_reservation_room_package(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid,
  _package_activation_id uuid,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reservation public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  activation public.hotel_package_activations%ROWTYPE;
  master public.pms_packages%ROWTYPE;
  last_night date;
  scope_rate_plan uuid;
  activation_room_ids uuid[];
  activation_plan_ids uuid[];
  master_room_ids uuid[];
  master_plan_ids uuid[];
  effective_room_ids uuid[];
  effective_plan_ids uuid[];
  package_row_id uuid;
BEGIN
  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  PERFORM public.assert_hotel_reservation_package_mutable(_restaurant_id, reservation.id);

  SELECT * INTO unit
  FROM public.hotel_reservation_rooms
  WHERE id = _reservation_room_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = reservation.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;

  SELECT * INTO activation
  FROM public.hotel_package_activations
  WHERE id = _package_activation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_ACTIVATION_NOT_FOUND';
  END IF;
  IF activation.restaurant_id IS DISTINCT FROM _restaurant_id THEN
    RAISE EXCEPTION 'PACKAGE_WRONG_PROPERTY';
  END IF;
  IF activation.active IS NOT TRUE THEN
    RAISE EXCEPTION 'PACKAGE_INACTIVE';
  END IF;

  SELECT * INTO master
  FROM public.pms_packages
  WHERE id = activation.package_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;
  IF master.active IS NOT TRUE THEN
    RAISE EXCEPTION 'PACKAGE_INACTIVE';
  END IF;

  last_night := unit.departure_date - 1;
  IF unit.arrival_date < activation.valid_from OR last_night > activation.valid_to THEN
    RAISE EXCEPTION 'PACKAGE_STAY_WINDOW_MISMATCH';
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

  IF cardinality(master_room_ids) > 0
     AND NOT (unit.room_type_id = ANY (master_room_ids)) THEN
    RAISE EXCEPTION 'PACKAGE_ROOM_TYPE_MISMATCH';
  END IF;
  IF cardinality(activation_room_ids) > 0
     AND NOT (unit.room_type_id = ANY (activation_room_ids)) THEN
    RAISE EXCEPTION 'PACKAGE_ROOM_TYPE_MISMATCH';
  END IF;

  scope_rate_plan := COALESCE(unit.rate_plan_id, reservation.rate_plan_id);
  IF cardinality(master_plan_ids) > 0
     AND (scope_rate_plan IS NULL OR NOT (scope_rate_plan = ANY (master_plan_ids))) THEN
    RAISE EXCEPTION 'PACKAGE_RATE_PLAN_MISMATCH';
  END IF;
  IF cardinality(activation_plan_ids) > 0
     AND (scope_rate_plan IS NULL OR NOT (scope_rate_plan = ANY (activation_plan_ids))) THEN
    RAISE EXCEPTION 'PACKAGE_RATE_PLAN_MISMATCH';
  END IF;
  IF activation.charge_basis IS DISTINCT FROM 'per_stay' THEN
    RAISE EXCEPTION 'PACKAGE_CHARGE_BASIS_UNSUPPORTED';
  END IF;
  IF activation.package_price <= 0 THEN
    RAISE EXCEPTION 'PACKAGE_PRICE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_reservation_packages
    WHERE reservation_id = reservation.id
      AND package_activation_id = activation.id
      AND reservation_room_id IS NULL
  ) THEN
    RAISE EXCEPTION 'PACKAGE_ALREADY_RESERVATION_SCOPED';
  END IF;

  INSERT INTO public.hotel_reservation_packages (
    restaurant_id,
    reservation_id,
    reservation_room_id,
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
    unit.id,
    activation.id,
    activation.package_id,
    activation.package_code,
    activation.package_name,
    'per_stay',
    1,
    activation.package_price,
    activation.package_price,
    activation.components_snapshot,
    jsonb_build_object(
      'activationId', activation.id,
      'packageId', activation.package_id,
      'code', activation.package_code,
      'name', activation.package_name,
      'type', activation.package_type,
      'packagePrice', activation.package_price,
      'chargeBasis', 'per_stay',
      'quantity', 1,
      'reservationRoomId', unit.id,
      'unitSequence', unit.unit_sequence,
      'appliedByMembershipId', _membership_id,
      'components', activation.components_snapshot,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'roomTypeIds', to_jsonb(effective_room_ids),
      'ratePlanIds', to_jsonb(effective_plan_ids)
    )
  )
  ON CONFLICT (reservation_id, package_activation_id, reservation_room_id)
    WHERE reservation_room_id IS NOT NULL
  DO UPDATE SET
    package_id = EXCLUDED.package_id,
    package_code = EXCLUDED.package_code,
    package_name = EXCLUDED.package_name,
    charge_basis = EXCLUDED.charge_basis,
    quantity = EXCLUDED.quantity,
    unit_amount = EXCLUDED.unit_amount,
    applied_amount = EXCLUDED.applied_amount,
    components_snapshot = EXCLUDED.components_snapshot,
    snapshot = EXCLUDED.snapshot,
    applied_at = now()
  RETURNING id INTO package_row_id;

  RETURN package_row_id;
END;
$$;


DROP FUNCTION IF EXISTS public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.release_hotel_reservation_room_package(
  _restaurant_id uuid,
  _reservation_id uuid,
  _package_row_id uuid,
  _membership_id uuid,
  _selected_reservation_room_id uuid DEFAULT NULL,
  _stay_scope boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;

  PERFORM public.assert_hotel_reservation_package_mutable(_restaurant_id, _reservation_id);

  IF _selected_reservation_room_id IS NOT NULL OR _stay_scope IS NOT NULL THEN
    IF _selected_reservation_room_id IS NULL THEN
      RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_rooms AS selected_unit
      WHERE selected_unit.id = _selected_reservation_room_id
        AND selected_unit.restaurant_id = _restaurant_id
        AND selected_unit.reservation_id = _reservation_id
    ) THEN
      RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
    END IF;

    IF package_row.reservation_room_id IS NULL THEN
      IF _stay_scope IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'PACKAGE_STAY_SCOPE_REQUIRED';
      END IF;
    ELSIF package_row.reservation_room_id IS DISTINCT FROM _selected_reservation_room_id THEN
      RAISE EXCEPTION 'PACKAGE_SIBLING_UNIT';
    ELSIF _stay_scope IS TRUE THEN
      RAISE EXCEPTION 'PACKAGE_STAY_SCOPE_REQUIRED';
    END IF;
  END IF;

  DELETE FROM public.hotel_reservation_packages
  WHERE id = package_row.id;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'package_removed',
    jsonb_build_object(
      'package_id', package_row.package_id,
      'package_name', package_row.package_name,
      'reservation_room_id', package_row.reservation_room_id,
      'applied_amount', package_row.applied_amount
    ),
    jsonb_build_object('package_id', null, 'reservation_room_id', package_row.reservation_room_id),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid, boolean)
  TO service_role;
