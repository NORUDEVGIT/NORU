-- STAY-08F: one guest folio per reservation.
-- Room accommodation lines may name hotel_reservation_rooms.id.
-- Reservation-wide lines keep reservation_room_id null.
-- Existing ledger rows are not updated.
-- A package stays reservation-scoped unless apply_hotel_reservation_room_package
-- writes one room-scoped row. per_stay price is the activation price once.
-- Apply 0154, 0155, and 0156 before this file.
-- STAY-08G is not in this migration.

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS reservation_room_id uuid;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_room_unit_same_property;

ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_room_unit_same_property
  FOREIGN KEY (reservation_room_id, restaurant_id)
  REFERENCES public.hotel_reservation_rooms (id, restaurant_id);

COMMENT ON COLUMN public.folio_transactions.reservation_room_id IS
  'Optional room unit for a reservation_room_charge line. Null means the charge belongs to the reservation. Historical rows stay null.';

CREATE OR REPLACE FUNCTION public.folio_transactions_assign_room_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw text;
BEGIN
  IF NEW.reservation_room_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.reference_type IS DISTINCT FROM 'reservation_room_charge' THEN
    RETURN NEW;
  END IF;
  raw := current_setting('noru.reservation_room_id', true);
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NEW;
  END IF;
  NEW.reservation_room_id := raw::uuid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folio_transactions_assign_room_unit ON public.folio_transactions;

CREATE TRIGGER folio_transactions_assign_room_unit
  BEFORE INSERT ON public.folio_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.folio_transactions_assign_room_unit();

CREATE OR REPLACE FUNCTION public.open_folio_for_reservation(
  _restaurant_id uuid, _reservation_id uuid, _membership_id uuid
) RETURNS guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  next_number bigint;
  prop_currency text;
  charge_amount numeric(12,2);
  unit_charge numeric(12,2);
  primary_window uuid;
  parent_txn public.folio_transactions%ROWTYPE;
  default_group uuid;
  unit_count integer := 0;
  unit public.hotel_reservation_rooms%ROWTYPE;
  split_done boolean := false;
BEGIN
  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF res.status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_BILLABLE';
  END IF;

  SELECT currency_code, default_room_tax_group_id
  INTO prop_currency, default_group
  FROM public.restaurants WHERE id = _restaurant_id;

  SELECT * INTO folio FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.guest_folio_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 0) ON CONFLICT (restaurant_id) DO NOTHING;

    SELECT last_number INTO next_number FROM public.guest_folio_counters
    WHERE restaurant_id = _restaurant_id FOR UPDATE;

    next_number := next_number + 1;
    UPDATE public.guest_folio_counters
    SET last_number = next_number, updated_at = now() WHERE restaurant_id = _restaurant_id;

    INSERT INTO public.guest_folios (
      restaurant_id, guest_id, reservation_id, folio_number, status, currency, created_by_membership_id
    ) VALUES (
      _restaurant_id, res.guest_id, res.id, 'FL-' || lpad(next_number::text, 6, '0'), 'open',
      COALESCE(res.currency, prop_currency, 'GBP'), _membership_id
    ) RETURNING * INTO folio;

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'folio_opened',
      jsonb_build_object('folio_number', folio.folio_number, 'reservation_id', res.id,
                         'confirmation_number', res.confirmation_number, 'currency', folio.currency),
      _membership_id
    );
  END IF;

  primary_window := public.ensure_primary_folio_window(_restaurant_id, folio.id);
  charge_amount := COALESCE(res.room_subtotal, 0);

  SELECT count(*) INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = res.id;

  -- One room, or a stay that already has a reservation-wide room charge,
  -- keeps that single line. Two or more rooms with no aggregate line
  -- each get their own charge. A later open does not add the aggregate on top.
  IF unit_count > 1 AND NOT EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
  ) THEN
    -- STAY-08F multi-room charges
    FOR unit IN
      SELECT * FROM public.hotel_reservation_rooms
      WHERE restaurant_id = _restaurant_id
        AND reservation_id = res.id
      ORDER BY unit_sequence
    LOOP
      unit_charge := COALESCE(unit.room_subtotal, 0);
      IF unit_charge <= 0 THEN
        CONTINUE;
      END IF;

      SELECT * INTO parent_txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND folio_id = folio.id
        AND reference_type = 'reservation_room_charge'
        AND reference_id = unit.id
      LIMIT 1;
      IF FOUND THEN
        split_done := true;
        CONTINUE;
      END IF;

      PERFORM set_config('noru.reservation_room_id', unit.id::text, true);
      BEGIN
        parent_txn := public.post_folio_charge_with_tax(
          _restaurant_id,
          folio.id,
          'room',
          'Room charge — room ' || unit.unit_sequence::text || ' — ' || res.confirmation_number,
          unit_charge,
          'room',
          'reservation_room_charge',
          unit.id,
          _membership_id,
          primary_window,
          NULL,
          default_group
        );
        PERFORM set_config('noru.reservation_room_id', '', true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('noru.reservation_room_id', '', true);
        RAISE;
      END;

      INSERT INTO public.folio_history (
        restaurant_id, folio_id, event_type, new_values, actor_membership_id
      ) VALUES (
        _restaurant_id, folio.id, 'room_charge_posted',
        jsonb_build_object(
          'reservation_id', res.id,
          'reservation_room_id', unit.id,
          'unit_sequence', unit.unit_sequence,
          'amount', unit_charge,
          'currency', folio.currency,
          'transaction_id', parent_txn.id
        ),
        _membership_id
      );
      split_done := true;
    END LOOP;
  END IF;

  IF NOT split_done AND charge_amount > 0 THEN
    SELECT * INTO parent_txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
    LIMIT 1;

    IF NOT FOUND THEN
      parent_txn := public.post_folio_charge_with_tax(
        _restaurant_id,
        folio.id,
        'room',
        'Room charge — reservation ' || res.confirmation_number,
        charge_amount,
        'room',
        'reservation_room_charge',
        res.id,
        _membership_id,
        primary_window,
        NULL,
        default_group
      );

      INSERT INTO public.folio_history (
        restaurant_id, folio_id, event_type, new_values, actor_membership_id
      ) VALUES (
        _restaurant_id, folio.id, 'room_charge_posted',
        jsonb_build_object('reservation_id', res.id, 'amount', charge_amount,
                           'currency', folio.currency, 'nightly', res.nightly_rate_snapshot,
                           'transaction_id', parent_txn.id),
        _membership_id
      );
    ELSE
      PERFORM public.append_folio_tax_and_service_lines(
        _restaurant_id, folio.id, parent_txn.id, charge_amount, 'room',
        _membership_id, primary_window, default_group
      );
    END IF;
  END IF;

  RETURN folio;
END;
$$;

ALTER TABLE public.hotel_reservation_packages
  ADD COLUMN IF NOT EXISTS reservation_room_id uuid;

ALTER TABLE public.hotel_reservation_packages
  DROP CONSTRAINT IF EXISTS hotel_reservation_packages_room_unit_same_property;

ALTER TABLE public.hotel_reservation_packages
  ADD CONSTRAINT hotel_reservation_packages_room_unit_same_property
  FOREIGN KEY (reservation_room_id, restaurant_id)
  REFERENCES public.hotel_reservation_rooms (id, restaurant_id)
  ON DELETE CASCADE;

ALTER TABLE public.hotel_reservation_packages
  DROP CONSTRAINT IF EXISTS hotel_reservation_packages_reservation_activation_unique;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservation_packages_reservation_scope_unique
  ON public.hotel_reservation_packages (reservation_id, package_activation_id)
  WHERE reservation_room_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservation_packages_room_scope_unique
  ON public.hotel_reservation_packages (reservation_id, package_activation_id, reservation_room_id)
  WHERE reservation_room_id IS NOT NULL;

COMMENT ON COLUMN public.hotel_reservation_packages.reservation_room_id IS
  'Null is one reservation-level per_stay package. A value is that package for one room unit. Existing rows stay null.';

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

REVOKE ALL ON FUNCTION public.folio_transactions_assign_room_unit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.folio_transactions_assign_room_unit() TO service_role;
REVOKE ALL ON FUNCTION public.apply_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid)
  TO service_role;
