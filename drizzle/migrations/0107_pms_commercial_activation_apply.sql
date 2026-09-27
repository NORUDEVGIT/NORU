-- P5A-04 — Commercial activation preview/apply persist.
-- Dual-lane with supabase/migrations/0107_pms_commercial_activation_apply.sql.
-- Does not edit 0016 price_hotel_stay or 0104–0106 in place.
-- Does not rewrite hotel_reservation_promotions or hotel_reservation_packages.
-- One operation_id per apply. History is immutable via the existing 0104 trigger.

CREATE OR REPLACE FUNCTION public.commercial_effective_scope(
  _activation_ids uuid[],
  _master_ids uuid[]
)
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(cardinality(_activation_ids), 0) > 0 THEN _activation_ids
    ELSE COALESCE(_master_ids, ARRAY[]::uuid[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_hotel_promotion_activation(
  _restaurant_id uuid,
  _membership_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_variable
DECLARE
  operation text := upper(btrim(_payload->>'operation'));
  activation_id uuid := NULLIF(_payload->>'activationId', '')::uuid;
  promotion_id uuid := NULLIF(_payload->>'promotionId', '')::uuid;
  valid_from date := NULLIF(_payload->>'validFrom', '')::date;
  valid_to date := NULLIF(_payload->>'validTo', '')::date;
  booking_from date := NULLIF(_payload->>'bookingFrom', '')::date;
  booking_to date := NULLIF(_payload->>'bookingTo', '')::date;
  priority integer := COALESCE((_payload->>'priority')::integer, 100);
  reason text := NULLIF(btrim(_payload->>'reason'), '');
  expected_version text := COALESCE(btrim(_payload->>'expectedVersion'), 'absent');
  room_ids uuid[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'roomTypeIds')::uuid), ARRAY[]::uuid[]);
  plan_ids uuid[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'ratePlanIds')::uuid), ARRAY[]::uuid[]);
  master public.pms_promotions%ROWTYPE;
  activation public.hotel_promotion_activations%ROWTYPE;
  master_room_ids uuid[];
  before_state jsonb;
  after_state jsonb;
  action_type text;
  operation_id uuid := gen_random_uuid();
  proposed_active boolean;
  other public.hotel_promotion_activations%ROWTYPE;
  other_rooms uuid[];
  other_plans uuid[];
  effective_rooms uuid[];
  effective_plans uuid[];
  owned_rooms integer;
  owned_plans integer;
BEGIN
  IF operation NOT IN ('CREATE', 'EDIT', 'DEACTIVATE') THEN
    RAISE EXCEPTION 'COMMERCIAL_OPERATION_INVALID';
  END IF;
  IF priority < 0 THEN
    RAISE EXCEPTION 'COMMERCIAL_DATES_INVALID';
  END IF;

  IF operation = 'CREATE' THEN
    IF expected_version IS DISTINCT FROM 'absent' THEN
      RAISE EXCEPTION 'COMMERCIAL_ACTIVATION_STALE';
    END IF;
    IF promotion_id IS NULL THEN
      RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
    END IF;
    SELECT * INTO master FROM public.pms_promotions
    WHERE id = promotion_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
    END IF;
    IF master.active IS NOT TRUE THEN
      RAISE EXCEPTION 'PROMOTION_INACTIVE';
    END IF;
    IF master.promo_kind IS DISTINCT FROM 'percent' AND master.promo_kind IS DISTINCT FROM 'fixed' THEN
      RAISE EXCEPTION 'PROMOTION_KIND_UNSUPPORTED';
    END IF;
  ELSE
    IF activation_id IS NULL THEN
      RAISE EXCEPTION 'PROMOTION_ACTIVATION_NOT_FOUND';
    END IF;
    SELECT * INTO activation FROM public.hotel_promotion_activations
    WHERE id = activation_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROMOTION_ACTIVATION_NOT_FOUND';
    END IF;
    IF expected_version = 'absent' OR activation.updated_at IS DISTINCT FROM expected_version::timestamptz THEN
      RAISE EXCEPTION 'COMMERCIAL_ACTIVATION_STALE';
    END IF;
    promotion_id := activation.promotion_id;
    SELECT * INTO master FROM public.pms_promotions
    WHERE id = promotion_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
    END IF;
    IF operation = 'DEACTIVATE' THEN
      valid_from := activation.valid_from;
      valid_to := activation.valid_to;
      booking_from := activation.booking_from;
      booking_to := activation.booking_to;
      priority := activation.priority;
      reason := activation.reason;
      SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO room_ids
      FROM public.hotel_promotion_activation_room_types
      WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
      SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO plan_ids
      FROM public.hotel_promotion_activation_rate_plans
      WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    END IF;
  END IF;

  IF valid_from IS NULL OR valid_to IS NULL OR booking_from IS NULL OR booking_to IS NULL
     OR valid_to < valid_from OR booking_to < booking_from THEN
    RAISE EXCEPTION 'COMMERCIAL_DATES_INVALID';
  END IF;
  IF valid_from < master.valid_from OR valid_to > master.valid_to THEN
    RAISE EXCEPTION 'COMMERCIAL_MASTER_WINDOW_BROADEN';
  END IF;

  SELECT count(*) INTO owned_rooms FROM public.room_types
  WHERE restaurant_id = _restaurant_id AND id = ANY (room_ids);
  SELECT count(*) INTO owned_plans FROM public.hotel_rate_plans
  WHERE restaurant_id = _restaurant_id AND id = ANY (plan_ids);
  IF owned_rooms IS DISTINCT FROM COALESCE(cardinality(room_ids), 0)
     OR owned_plans IS DISTINCT FROM COALESCE(cardinality(plan_ids), 0) THEN
    RAISE EXCEPTION 'COMMERCIAL_SCOPE_WRONG_PROPERTY';
  END IF;

  IF operation = 'CREATE' THEN
    SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO master_room_ids
    FROM public.pms_promotion_room_types
    WHERE promotion_id = master.id AND restaurant_id = _restaurant_id;
  ELSE
    master_room_ids := COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(activation.master_room_type_ids)::uuid
    ), ARRAY[]::uuid[]);
  END IF;

  IF cardinality(master_room_ids) > 0 AND cardinality(room_ids) > 0
     AND EXISTS (SELECT 1 FROM unnest(room_ids) AS x WHERE NOT (x = ANY (master_room_ids))) THEN
    RAISE EXCEPTION 'PROMOTION_SCOPE_BROADEN';
  END IF;

  proposed_active := operation IS DISTINCT FROM 'DEACTIVATE';
  effective_rooms := public.commercial_effective_scope(room_ids, master_room_ids);
  effective_plans := public.commercial_effective_scope(plan_ids, ARRAY[]::uuid[]);

  IF proposed_active THEN
    FOR other IN
      SELECT * FROM public.hotel_promotion_activations
      WHERE restaurant_id = _restaurant_id
        AND active IS TRUE
        AND promotion_id = master.id
        AND valid_from = valid_from
        AND valid_to = valid_to
        AND booking_from = booking_from
        AND booking_to = booking_to
        AND (activation_id IS NULL OR id IS DISTINCT FROM activation_id)
    LOOP
      SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO other_rooms
      FROM public.hotel_promotion_activation_room_types
      WHERE activation_id = other.id AND restaurant_id = _restaurant_id;
      SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO other_plans
      FROM public.hotel_promotion_activation_rate_plans
      WHERE activation_id = other.id AND restaurant_id = _restaurant_id;
      IF public.commercial_effective_scope(other_rooms, COALESCE(ARRAY(
           SELECT jsonb_array_elements_text(other.master_room_type_ids)::uuid
         ), ARRAY[]::uuid[])) IS NOT DISTINCT FROM effective_rooms
         AND public.commercial_effective_scope(other_plans, ARRAY[]::uuid[]) IS NOT DISTINCT FROM effective_plans THEN
        RAISE EXCEPTION 'PROMOTION_ACTIVATION_DUPLICATE';
      END IF;
    END LOOP;
  END IF;

  IF operation = 'CREATE' THEN
    INSERT INTO public.hotel_promotion_activations (
      restaurant_id, promotion_id, valid_from, valid_to, booking_from, booking_to,
      active, priority, reason, created_by_membership_id,
      promotion_code, promotion_name, promo_kind, promo_value,
      master_valid_from, master_valid_to, master_room_type_ids
    ) VALUES (
      _restaurant_id, master.id, valid_from, valid_to, booking_from, booking_to,
      true, priority, reason, _membership_id,
      master.code, master.name, master.promo_kind, master.promo_value,
      master.valid_from, master.valid_to, to_jsonb(master_room_ids)
    )
    RETURNING * INTO activation;
    action_type := 'promotion_activation_created';
    before_state := NULL;
  ELSIF operation = 'DEACTIVATE' THEN
    before_state := jsonb_build_object(
      'active', activation.active,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'bookingFrom', activation.booking_from,
      'bookingTo', activation.booking_to,
      'priority', activation.priority,
      'reason', activation.reason,
      'roomTypeIds', to_jsonb(room_ids),
      'ratePlanIds', to_jsonb(plan_ids)
    );
    UPDATE public.hotel_promotion_activations
    SET active = false, reason = reason
    WHERE id = activation.id
    RETURNING * INTO activation;
    action_type := 'promotion_activation_deactivated';
  ELSE
    SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO other_rooms
    FROM public.hotel_promotion_activation_room_types
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO other_plans
    FROM public.hotel_promotion_activation_rate_plans
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    before_state := jsonb_build_object(
      'active', activation.active,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'bookingFrom', activation.booking_from,
      'bookingTo', activation.booking_to,
      'priority', activation.priority,
      'reason', activation.reason,
      'roomTypeIds', to_jsonb(other_rooms),
      'ratePlanIds', to_jsonb(other_plans)
    );
    UPDATE public.hotel_promotion_activations
    SET valid_from = valid_from,
        valid_to = valid_to,
        booking_from = booking_from,
        booking_to = booking_to,
        priority = priority,
        reason = reason,
        active = true
    WHERE id = activation.id
    RETURNING * INTO activation;
    action_type := 'promotion_activation_edited';
  END IF;

  IF operation IS DISTINCT FROM 'DEACTIVATE' THEN
    DELETE FROM public.hotel_promotion_activation_room_types
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    DELETE FROM public.hotel_promotion_activation_rate_plans
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    IF cardinality(room_ids) > 0 THEN
      INSERT INTO public.hotel_promotion_activation_room_types (restaurant_id, activation_id, room_type_id)
      SELECT _restaurant_id, activation.id, x FROM unnest(room_ids) AS x;
    END IF;
    IF cardinality(plan_ids) > 0 THEN
      INSERT INTO public.hotel_promotion_activation_rate_plans (restaurant_id, activation_id, rate_plan_id)
      SELECT _restaurant_id, activation.id, x FROM unnest(plan_ids) AS x;
    END IF;
  END IF;

  after_state := jsonb_build_object(
    'active', activation.active,
    'validFrom', activation.valid_from,
    'validTo', activation.valid_to,
    'bookingFrom', activation.booking_from,
    'bookingTo', activation.booking_to,
    'priority', activation.priority,
    'reason', activation.reason,
    'roomTypeIds', to_jsonb(room_ids),
    'ratePlanIds', to_jsonb(plan_ids),
    'promotionCode', activation.promotion_code,
    'promotionName', activation.promotion_name,
    'promoKind', activation.promo_kind,
    'promoValue', activation.promo_value
  );

  INSERT INTO public.hotel_commercial_change_events (
    restaurant_id, operation_id, entity_type, entity_id, master_id, action_type,
    before_state, after_state, reason, actor_membership_id, source
  ) VALUES (
    _restaurant_id, operation_id, 'promotion_activation', activation.id, activation.promotion_id, action_type,
    before_state, after_state, reason, _membership_id, 'rate_revenue'
  );

  RETURN jsonb_build_object(
    'operationId', operation_id,
    'activationId', activation.id,
    'actionType', action_type,
    'expectedVersion', activation.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_hotel_package_activation(
  _restaurant_id uuid,
  _membership_id uuid,
  _payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_variable
DECLARE
  operation text := upper(btrim(_payload->>'operation'));
  activation_id uuid := NULLIF(_payload->>'activationId', '')::uuid;
  package_id uuid := NULLIF(_payload->>'packageId', '')::uuid;
  valid_from date := NULLIF(_payload->>'validFrom', '')::date;
  valid_to date := NULLIF(_payload->>'validTo', '')::date;
  reason text := NULLIF(btrim(_payload->>'reason'), '');
  expected_version text := COALESCE(btrim(_payload->>'expectedVersion'), 'absent');
  room_ids uuid[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'roomTypeIds')::uuid), ARRAY[]::uuid[]);
  plan_ids uuid[] := COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'ratePlanIds')::uuid), ARRAY[]::uuid[]);
  master public.pms_packages%ROWTYPE;
  activation public.hotel_package_activations%ROWTYPE;
  master_room_ids uuid[];
  master_plan_ids uuid[];
  components jsonb := '[]'::jsonb;
  before_state jsonb;
  after_state jsonb;
  action_type text;
  operation_id uuid := gen_random_uuid();
  proposed_active boolean;
  other public.hotel_package_activations%ROWTYPE;
  other_rooms uuid[];
  other_plans uuid[];
  effective_rooms uuid[];
  effective_plans uuid[];
  owned_rooms integer;
  owned_plans integer;
BEGIN
  IF operation NOT IN ('CREATE', 'EDIT', 'DEACTIVATE') THEN
    RAISE EXCEPTION 'COMMERCIAL_OPERATION_INVALID';
  END IF;

  IF operation = 'CREATE' THEN
    IF expected_version IS DISTINCT FROM 'absent' THEN
      RAISE EXCEPTION 'COMMERCIAL_ACTIVATION_STALE';
    END IF;
    IF package_id IS NULL THEN
      RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
    END IF;
    SELECT * INTO master FROM public.pms_packages
    WHERE id = package_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
    END IF;
    IF master.active IS NOT TRUE THEN
      RAISE EXCEPTION 'PACKAGE_INACTIVE';
    END IF;
    IF master.package_price <= 0 THEN
      RAISE EXCEPTION 'PACKAGE_PRICE_INVALID';
    END IF;
  ELSE
    IF activation_id IS NULL THEN
      RAISE EXCEPTION 'PACKAGE_ACTIVATION_NOT_FOUND';
    END IF;
    SELECT * INTO activation FROM public.hotel_package_activations
    WHERE id = activation_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PACKAGE_ACTIVATION_NOT_FOUND';
    END IF;
    IF expected_version = 'absent' OR activation.updated_at IS DISTINCT FROM expected_version::timestamptz THEN
      RAISE EXCEPTION 'COMMERCIAL_ACTIVATION_STALE';
    END IF;
    package_id := activation.package_id;
    SELECT * INTO master FROM public.pms_packages
    WHERE id = package_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
    END IF;
    IF operation = 'DEACTIVATE' THEN
      valid_from := activation.valid_from;
      valid_to := activation.valid_to;
      reason := activation.reason;
      SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO room_ids
      FROM public.hotel_package_activation_room_types
      WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
      SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO plan_ids
      FROM public.hotel_package_activation_rate_plans
      WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    END IF;
  END IF;

  IF valid_from IS NULL OR valid_to IS NULL OR valid_to < valid_from THEN
    RAISE EXCEPTION 'COMMERCIAL_DATES_INVALID';
  END IF;

  SELECT count(*) INTO owned_rooms FROM public.room_types
  WHERE restaurant_id = _restaurant_id AND id = ANY (room_ids);
  SELECT count(*) INTO owned_plans FROM public.hotel_rate_plans
  WHERE restaurant_id = _restaurant_id AND id = ANY (plan_ids);
  IF owned_rooms IS DISTINCT FROM COALESCE(cardinality(room_ids), 0)
     OR owned_plans IS DISTINCT FROM COALESCE(cardinality(plan_ids), 0) THEN
    RAISE EXCEPTION 'COMMERCIAL_SCOPE_WRONG_PROPERTY';
  END IF;

  IF operation = 'CREATE' THEN
    SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO master_room_ids
    FROM public.pms_package_room_types
    WHERE package_id = master.id AND restaurant_id = _restaurant_id;
    SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO master_plan_ids
    FROM public.pms_package_rate_plans
    WHERE package_id = master.id AND restaurant_id = _restaurant_id;
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'componentType', c.component_kind,
        'componentId', COALESCE(c.meal_plan_id, c.room_amenity_id, c.fo_service_id),
        'label', COALESCE(mp.name, ra.name, c.component_kind),
        'quantity', c.quantity
      ) ORDER BY c.sort_order
    ), '[]'::jsonb)
      INTO components
    FROM public.pms_package_components c
    LEFT JOIN public.pms_meal_plans mp ON mp.id = c.meal_plan_id AND mp.restaurant_id = c.restaurant_id
    LEFT JOIN public.room_amenities ra ON ra.id = c.room_amenity_id AND ra.restaurant_id = c.restaurant_id
    WHERE c.package_id = master.id AND c.restaurant_id = _restaurant_id;
  ELSE
    master_room_ids := COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(activation.master_room_type_ids)::uuid
    ), ARRAY[]::uuid[]);
    master_plan_ids := COALESCE(ARRAY(
      SELECT jsonb_array_elements_text(activation.master_rate_plan_ids)::uuid
    ), ARRAY[]::uuid[]);
    components := activation.components_snapshot;
  END IF;

  IF cardinality(master_room_ids) > 0 AND cardinality(room_ids) > 0
     AND EXISTS (SELECT 1 FROM unnest(room_ids) AS x WHERE NOT (x = ANY (master_room_ids))) THEN
    RAISE EXCEPTION 'PACKAGE_SCOPE_BROADEN';
  END IF;
  IF cardinality(master_plan_ids) > 0 AND cardinality(plan_ids) > 0
     AND EXISTS (SELECT 1 FROM unnest(plan_ids) AS x WHERE NOT (x = ANY (master_plan_ids))) THEN
    RAISE EXCEPTION 'PACKAGE_SCOPE_BROADEN';
  END IF;

  proposed_active := operation IS DISTINCT FROM 'DEACTIVATE';
  effective_rooms := public.commercial_effective_scope(room_ids, master_room_ids);
  effective_plans := public.commercial_effective_scope(plan_ids, master_plan_ids);

  IF proposed_active THEN
    FOR other IN
      SELECT * FROM public.hotel_package_activations
      WHERE restaurant_id = _restaurant_id
        AND active IS TRUE
        AND package_id = master.id
        AND valid_from = valid_from
        AND valid_to = valid_to
        AND (activation_id IS NULL OR id IS DISTINCT FROM activation_id)
    LOOP
      SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO other_rooms
      FROM public.hotel_package_activation_room_types
      WHERE activation_id = other.id AND restaurant_id = _restaurant_id;
      SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO other_plans
      FROM public.hotel_package_activation_rate_plans
      WHERE activation_id = other.id AND restaurant_id = _restaurant_id;
      IF public.commercial_effective_scope(other_rooms, COALESCE(ARRAY(
           SELECT jsonb_array_elements_text(other.master_room_type_ids)::uuid
         ), ARRAY[]::uuid[])) IS NOT DISTINCT FROM effective_rooms
         AND public.commercial_effective_scope(other_plans, COALESCE(ARRAY(
           SELECT jsonb_array_elements_text(other.master_rate_plan_ids)::uuid
         ), ARRAY[]::uuid[])) IS NOT DISTINCT FROM effective_plans THEN
        RAISE EXCEPTION 'PACKAGE_ACTIVATION_DUPLICATE';
      END IF;
    END LOOP;
  END IF;

  IF operation = 'CREATE' THEN
    INSERT INTO public.hotel_package_activations (
      restaurant_id, package_id, valid_from, valid_to, active, reason, created_by_membership_id,
      package_code, package_name, package_type, package_price, charge_basis, components_snapshot,
      master_room_type_ids, master_rate_plan_ids
    ) VALUES (
      _restaurant_id, master.id, valid_from, valid_to, true, reason, _membership_id,
      master.code, master.name, master.type, master.package_price, 'per_stay', components,
      to_jsonb(master_room_ids), to_jsonb(master_plan_ids)
    )
    RETURNING * INTO activation;
    action_type := 'package_activation_created';
    before_state := NULL;
  ELSIF operation = 'DEACTIVATE' THEN
    before_state := jsonb_build_object(
      'active', activation.active,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'reason', activation.reason,
      'roomTypeIds', to_jsonb(room_ids),
      'ratePlanIds', to_jsonb(plan_ids)
    );
    UPDATE public.hotel_package_activations
    SET active = false, reason = reason
    WHERE id = activation.id
    RETURNING * INTO activation;
    action_type := 'package_activation_deactivated';
  ELSE
    SELECT COALESCE(array_agg(room_type_id), ARRAY[]::uuid[]) INTO other_rooms
    FROM public.hotel_package_activation_room_types
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    SELECT COALESCE(array_agg(rate_plan_id), ARRAY[]::uuid[]) INTO other_plans
    FROM public.hotel_package_activation_rate_plans
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    before_state := jsonb_build_object(
      'active', activation.active,
      'validFrom', activation.valid_from,
      'validTo', activation.valid_to,
      'reason', activation.reason,
      'roomTypeIds', to_jsonb(other_rooms),
      'ratePlanIds', to_jsonb(other_plans)
    );
    UPDATE public.hotel_package_activations
    SET valid_from = valid_from,
        valid_to = valid_to,
        reason = reason,
        active = true
    WHERE id = activation.id
    RETURNING * INTO activation;
    action_type := 'package_activation_edited';
  END IF;

  IF operation IS DISTINCT FROM 'DEACTIVATE' THEN
    DELETE FROM public.hotel_package_activation_room_types
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    DELETE FROM public.hotel_package_activation_rate_plans
    WHERE activation_id = activation.id AND restaurant_id = _restaurant_id;
    IF cardinality(room_ids) > 0 THEN
      INSERT INTO public.hotel_package_activation_room_types (restaurant_id, activation_id, room_type_id)
      SELECT _restaurant_id, activation.id, x FROM unnest(room_ids) AS x;
    END IF;
    IF cardinality(plan_ids) > 0 THEN
      INSERT INTO public.hotel_package_activation_rate_plans (restaurant_id, activation_id, rate_plan_id)
      SELECT _restaurant_id, activation.id, x FROM unnest(plan_ids) AS x;
    END IF;
  END IF;

  after_state := jsonb_build_object(
    'active', activation.active,
    'validFrom', activation.valid_from,
    'validTo', activation.valid_to,
    'reason', activation.reason,
    'roomTypeIds', to_jsonb(room_ids),
    'ratePlanIds', to_jsonb(plan_ids),
    'packageCode', activation.package_code,
    'packageName', activation.package_name,
    'packagePrice', activation.package_price,
    'chargeBasis', activation.charge_basis,
    'components', activation.components_snapshot
  );

  INSERT INTO public.hotel_commercial_change_events (
    restaurant_id, operation_id, entity_type, entity_id, master_id, action_type,
    before_state, after_state, reason, actor_membership_id, source
  ) VALUES (
    _restaurant_id, operation_id, 'package_activation', activation.id, activation.package_id, action_type,
    before_state, after_state, reason, _membership_id, 'rate_revenue'
  );

  RETURN jsonb_build_object(
    'operationId', operation_id,
    'activationId', activation.id,
    'actionType', action_type,
    'expectedVersion', activation.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_effective_scope(uuid[], uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_hotel_promotion_activation(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_hotel_package_activation(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_effective_scope(uuid[], uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_hotel_promotion_activation(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_hotel_package_activation(uuid, uuid, jsonb) TO service_role;
