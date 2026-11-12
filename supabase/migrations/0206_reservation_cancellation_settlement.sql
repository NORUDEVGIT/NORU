-- Reservation cancellation settlement.
-- Cancellation reverses room and package charges that are no longer billable through
-- post_folio_charge_correction. Posted rows are never updated or deleted.
-- Invoiced charge groups are reported for the credit-note workflow and are not corrected.
-- A fee-only folio opens without posting the stay room charge. Package charges still
-- post when any folio opens, and settlement reverses them with the room charge.
-- A deposit allocation is released by a negative allocation row linked to the original,
-- so every existing SUM(amount) over folio_deposit_allocations nets the release.
-- Dual-lane with drizzle/migrations/0206_reservation_cancellation_settlement.sql.

-- ---------------------------------------------------------------------------
-- Deposit allocation release rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.folio_deposit_allocations
  ADD COLUMN IF NOT EXISTS released_allocation_id uuid
  REFERENCES public.folio_deposit_allocations(id);

ALTER TABLE public.folio_deposit_allocations
  DROP CONSTRAINT IF EXISTS folio_deposit_allocations_amount_check;
ALTER TABLE public.folio_deposit_allocations
  ADD CONSTRAINT folio_deposit_allocations_amount_check CHECK (
    (released_allocation_id IS NULL AND amount > 0)
    OR (released_allocation_id IS NOT NULL AND amount < 0)
  );

CREATE INDEX IF NOT EXISTS folio_deposit_allocations_released_idx
  ON public.folio_deposit_allocations (released_allocation_id)
  WHERE released_allocation_id IS NOT NULL;

COMMENT ON COLUMN public.folio_deposit_allocations.released_allocation_id IS
  'Set on a negative release row. Points at the allocation it releases. Releases never exceed the original amount.';

CREATE OR REPLACE FUNCTION public.folio_deposit_allocations_release_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  original public.folio_deposit_allocations%ROWTYPE;
  released numeric(12,2);
BEGIN
  IF NEW.released_allocation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO original FROM public.folio_deposit_allocations
  WHERE id = NEW.released_allocation_id
  FOR UPDATE;
  IF NOT FOUND
     OR original.released_allocation_id IS NOT NULL
     OR original.restaurant_id IS DISTINCT FROM NEW.restaurant_id
     OR original.deposit_transaction_id IS DISTINCT FROM NEW.deposit_transaction_id
     OR original.charge_transaction_id IS DISTINCT FROM NEW.charge_transaction_id THEN
    RAISE EXCEPTION 'ALLOCATION_RELEASE_INVALID';
  END IF;
  SELECT COALESCE(-sum(amount), 0) INTO released
  FROM public.folio_deposit_allocations
  WHERE released_allocation_id = original.id;
  IF round(released - NEW.amount, 2) > round(original.amount, 2) + 0.001 THEN
    RAISE EXCEPTION 'ALLOCATION_RELEASE_EXCEEDS';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folio_deposit_allocations_release_guard ON public.folio_deposit_allocations;
CREATE TRIGGER folio_deposit_allocations_release_guard
  BEFORE INSERT ON public.folio_deposit_allocations
  FOR EACH ROW EXECUTE FUNCTION public.folio_deposit_allocations_release_guard();

-- ---------------------------------------------------------------------------
-- Fee-only folio
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_reservation_fee_folio(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
) RETURNS public.guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  next_number bigint;
  prop_currency text;
BEGIN
  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN folio;
  END IF;

  IF res.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_BILLABLE';
  END IF;

  SELECT currency_code INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;

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
                       'confirmation_number', res.confirmation_number, 'currency', folio.currency,
                       'fee_only', true),
    _membership_id
  );

  PERFORM public.ensure_primary_folio_window(_restaurant_id, folio.id);
  RETURN folio;
END;
$$;

-- ---------------------------------------------------------------------------
-- Package charges follow the live charge
-- ---------------------------------------------------------------------------
-- A restored reservation posts its reversed package again. The reversed row stays
-- in the ledger, so a package can own more than one charge row. The posting key
-- still stops a duplicate first post.

DROP INDEX IF EXISTS public.folio_transactions_package_charge_once;

CREATE INDEX IF NOT EXISTS folio_transactions_package_charge_lookup
  ON public.folio_transactions (restaurant_id, reference_id)
  WHERE reference_type = 'reservation_package_charge'
    AND transaction_type = 'charge';

-- ---------------------------------------------------------------------------
-- Charge group remainder (parent plus its tax and service children)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.charge_group_remaining_gross(
  _restaurant_id uuid,
  _charge_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parent public.folio_transactions%ROWTYPE;
  total numeric(12,2);
BEGIN
  SELECT * INTO parent FROM public.folio_transactions
  WHERE id = _charge_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR parent.transaction_type <> 'charge' THEN
    RETURN 0;
  END IF;
  SELECT round(
    COALESCE(public.correctable_charge_remainder(_restaurant_id, parent.id), 0)
    + COALESCE((
      SELECT sum(COALESCE(public.correctable_charge_remainder(_restaurant_id, child.id), 0))
      FROM public.folio_transactions child
      WHERE child.restaurant_id = _restaurant_id
        AND child.original_transaction_id = parent.id
        AND child.transaction_type = 'charge'
        AND child.category IN ('tax', 'service_charge')
        AND child.folio_id IS NOT DISTINCT FROM parent.folio_id
    ), 0),
    2
  ) INTO total;
  RETURN COALESCE(total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_reservation_package_charge(
  _restaurant_id uuid,
  _package_row_id uuid,
  _membership_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  reservation public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  existing public.folio_transactions%ROWTYPE;
  posted public.folio_transactions%ROWTYPE;
  actor uuid;
  previous_room text;
  charge_key text;
  prior integer := 0;
  entered numeric(12,2);
  parent_amount numeric(12,2);
  remaining numeric(12,2);
  has_inclusive boolean := false;
  tax_row record;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR package_row.applied_amount IS NULL OR package_row.applied_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = package_row.reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO existing
  FROM public.folio_transactions t
  WHERE t.restaurant_id = _restaurant_id
    AND t.reference_type = 'reservation_package_charge'
    AND t.reference_id = package_row.id
    AND t.transaction_type = 'charge'
    AND public.charge_group_remaining_gross(_restaurant_id, t.id) > 0
  ORDER BY t.posted_at DESC, t.id DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN existing.id;
  END IF;

  SELECT count(*) INTO prior
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND reference_type = 'reservation_package_charge'
    AND reference_id = package_row.id
    AND transaction_type = 'charge';

  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = package_row.reservation_id
    AND restaurant_id = _restaurant_id;

  -- A reversed package on a cancelled or no-show stay is not billed again.
  IF prior > 0 AND reservation.status IN ('cancelled', 'no_show') THEN
    SELECT * INTO existing
    FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND reference_type = 'reservation_package_charge'
      AND reference_id = package_row.id
      AND transaction_type = 'charge'
    ORDER BY posted_at DESC, id DESC
    LIMIT 1;
    RETURN existing.id;
  END IF;

  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;
  IF reservation.currency IS NOT NULL
     AND folio.currency IS NOT NULL
     AND reservation.currency IS DISTINCT FROM folio.currency THEN
    RAISE EXCEPTION 'PACKAGE_CURRENCY_MISMATCH';
  END IF;

  actor := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('noru.package_actor_membership_id', true), '')), '')::uuid,
    NULLIF(btrim(COALESCE(package_row.snapshot ->> 'appliedByMembershipId', '')), '')::uuid,
    _membership_id
  );
  charge_key := 'pkgchg' || replace(package_row.id::text, '-', '')
    || CASE WHEN prior > 0 THEN 'r' || prior::text ELSE '' END;
  previous_room := current_setting('noru.reservation_room_id', true);
  PERFORM set_config(
    'noru.reservation_room_id',
    COALESCE(package_row.reservation_room_id::text, ''),
    true
  );
  PERFORM set_config('noru.charge_source', 'package', true);

  entered := round(package_row.applied_amount, 2);
  parent_amount := entered;
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL, 'package', NULL) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;
  IF has_inclusive THEN
    remaining := parent_amount;
    FOR tax_row IN
      SELECT *
      FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL, 'package', NULL) t
      WHERE t.calculation = 'inclusive'
    LOOP
      remaining := round(
        remaining - public.compute_folio_tax_component_amount(
          remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
        ),
        2
      );
    END LOOP;
    IF remaining > 0 THEN
      parent_amount := remaining;
    END IF;
  END IF;

  BEGIN
    posted := public.post_folio_transaction(
      _restaurant_id,
      folio.id,
      'charge',
      'package',
      COALESCE(NULLIF(btrim(package_row.package_name), ''), 'Package') || ' package',
      parent_amount,
      'reservation_package_charge',
      package_row.id,
      actor,
      NULL,
      charge_key,
      NULL
    );
    PERFORM public.append_folio_tax_and_service_lines(
      _restaurant_id,
      folio.id,
      posted.id,
      entered,
      'folio',
      actor,
      NULL,
      NULL
    );
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
    RAISE;
  END;

  RETURN posted.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_reservation_package_charge(
  _restaurant_id uuid,
  _package_row_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  actor uuid;
  reverse_key text;
BEGIN
  SELECT * INTO charge
  FROM public.folio_transactions t
  WHERE t.restaurant_id = _restaurant_id
    AND t.reference_type = 'reservation_package_charge'
    AND t.reference_id = _package_row_id
    AND t.transaction_type = 'charge'
    AND public.charge_group_remaining_gross(_restaurant_id, t.id) > 0
  ORDER BY t.posted_at DESC, t.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE id = charge.folio_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id;

  actor := COALESCE(
    _membership_id,
    NULLIF(btrim(COALESCE(current_setting('noru.package_actor_membership_id', true), '')), '')::uuid
  );

  reverse_key := 'pkgrev' || replace(_package_row_id::text, '-', '');
  IF EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = reverse_key
  ) THEN
    reverse_key := 'pkgrev' || replace(charge.id::text, '-', '');
  END IF;

  PERFORM public.post_folio_charge_correction(
    _restaurant_id,
    charge.id,
    'reverse_remaining',
    NULL,
    'Reverse ' || COALESCE(NULLIF(btrim(package_row.package_name), ''), 'package') || ' package',
    actor,
    reverse_key
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation / no-show / unit removal settlement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_reservation_cancellation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid,
  _kind text,
  _membership_id uuid,
  _dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
  alloc record;
  unit_count integer := 0;
  active_count integer := 0;
  active_subtotal numeric(12,2);
  is_aggregate boolean;
  legacy_invoice boolean := false;
  remaining_gross numeric(12,2);
  target numeric(12,2);
  live_after numeric(12,2);
  alloc_net_total numeric(12,2);
  excess numeric(12,2);
  release_amount numeric(12,2);
  alloc_net numeric(12,2);
  correction_mode text;
  correction_key text;
  release_key text;
  planned_reversal numeric(12,2) := 0;
  reversed jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
  released jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  balance_now numeric(12,2);
  balance_after numeric(12,2);
  credits numeric(12,2);
  fees numeric(12,2);
  description_text text;
BEGIN
  IF _kind NOT IN ('cancel', 'noshow', 'unit_removal') THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT_KIND';
  END IF;
  IF NOT COALESCE(_dry_run, true) AND _membership_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED';
  END IF;

  IF COALESCE(_dry_run, true) THEN
    SELECT * INTO res FROM public.hotel_reservations
    WHERE id = _reservation_id AND restaurant_id = _restaurant_id;
  ELSE
    SELECT * INTO res FROM public.hotel_reservations
    WHERE id = _reservation_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF _reservation_room_id IS NOT NULL THEN
    SELECT * INTO unit FROM public.hotel_reservation_rooms
    WHERE id = _reservation_room_id
      AND restaurant_id = _restaurant_id
      AND reservation_id = res.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
    END IF;
  END IF;

  SELECT count(*) INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id;

  IF COALESCE(_dry_run, true) THEN
    SELECT * INTO folio FROM public.guest_folios
    WHERE restaurant_id = _restaurant_id AND reservation_id = res.id;
  ELSE
    SELECT * INTO folio FROM public.guest_folios
    WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'dry_run', COALESCE(_dry_run, true),
      'kind', _kind,
      'reservation_id', res.id,
      'reservation_room_id', _reservation_room_id,
      'folio_id', NULL,
      'folio_number', NULL,
      'folio_status', NULL,
      'currency', res.currency,
      'reversed', '[]'::jsonb,
      'pending', '[]'::jsonb,
      'released', '[]'::jsonb,
      'skipped', '[]'::jsonb,
      'reversal_total', 0,
      'fees_posted', 0,
      'credits', 0,
      'balance', 0,
      'refund_due', 0,
      'amount_due', 0,
      'closable', false
    );
  END IF;

  legacy_invoice := EXISTS (
    SELECT 1 FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND coverage_scope = 'legacy_folio'
  );

  FOR charge IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND transaction_type = 'charge'
      AND reference_type IN ('reservation_room_charge', 'reservation_package_charge')
      AND category NOT IN ('tax', 'service_charge')
    ORDER BY posted_at, id
  LOOP
    is_aggregate := charge.reference_type = 'reservation_room_charge'
      AND charge.reference_id = res.id
      AND charge.reservation_room_id IS NULL;

    IF _reservation_room_id IS NOT NULL THEN
      IF charge.reference_type = 'reservation_room_charge' THEN
        IF NOT (
          charge.reference_id = unit.id
          OR charge.reservation_room_id = unit.id
          OR is_aggregate
        ) THEN
          CONTINUE;
        END IF;
      ELSE
        IF NOT (
          charge.reservation_room_id = unit.id
          OR EXISTS (
            SELECT 1 FROM public.hotel_reservation_packages pkg
            WHERE pkg.id = charge.reference_id
              AND pkg.restaurant_id = _restaurant_id
              AND pkg.reservation_room_id = unit.id
          )
        ) THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    remaining_gross := public.charge_group_remaining_gross(_restaurant_id, charge.id);
    IF remaining_gross <= 0 THEN
      CONTINUE;
    END IF;

    correction_mode := 'reverse_remaining';
    target := remaining_gross;
    correction_key := 'cxrev' || replace(charge.id::text, '-', '');

    -- A reservation-wide room line on a multi-room stay: take only this unit's share.
    IF _reservation_room_id IS NOT NULL AND is_aggregate AND unit_count > 1 THEN
      SELECT count(*), COALESCE(sum(COALESCE(room_subtotal, 0)), 0)
      INTO active_count, active_subtotal
      FROM public.hotel_reservation_rooms
      WHERE restaurant_id = _restaurant_id
        AND reservation_id = res.id
        AND (status IN ('pending', 'confirmed') OR id = unit.id);
      IF active_count > 1 THEN
        IF active_subtotal <= 0 OR COALESCE(unit.room_subtotal, 0) <= 0 THEN
          skipped := skipped || jsonb_build_array(jsonb_build_object(
            'charge_id', charge.id, 'reason', 'unit_share_unknown'));
          CONTINUE;
        END IF;
        correction_mode := 'adjust_amount';
        target := round(remaining_gross * unit.room_subtotal / active_subtotal, 2);
        IF target <= 0 THEN
          CONTINUE;
        END IF;
        IF target > remaining_gross THEN
          target := remaining_gross;
        END IF;
        correction_key := 'cxadj' || replace(unit.id::text, '-', '')
          || left(replace(charge.id::text, '-', ''), 16);
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND idempotency_key = correction_key
    ) THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object(
        'charge_id', charge.id, 'reason', 'already_corrected'));
      CONTINUE;
    END IF;

    IF legacy_invoice OR public.group_is_billed(_restaurant_id, charge.id) THEN
      pending := pending || jsonb_build_array(jsonb_build_object(
        'charge_id', charge.id,
        'reference_type', charge.reference_type,
        'description', charge.description,
        'amount', target,
        'reason', CASE WHEN legacy_invoice THEN 'legacy_invoice_manual' ELSE 'credit_note_required' END
      ));
      CONTINUE;
    END IF;

    IF folio.status <> 'open' THEN
      pending := pending || jsonb_build_array(jsonb_build_object(
        'charge_id', charge.id,
        'reference_type', charge.reference_type,
        'description', charge.description,
        'amount', target,
        'reason', 'folio_closed'
      ));
      CONTINUE;
    END IF;

    -- Allocations on this group may not exceed what stays live after the correction.
    live_after := round(remaining_gross - target, 2);
    SELECT COALESCE(round(sum(a.amount), 2), 0) INTO alloc_net_total
    FROM public.folio_deposit_allocations a
    WHERE a.restaurant_id = _restaurant_id
      AND a.charge_transaction_id IN (
        SELECT charge.id
        UNION ALL
        SELECT child.id FROM public.folio_transactions child
        WHERE child.restaurant_id = _restaurant_id
          AND child.original_transaction_id = charge.id
          AND child.transaction_type = 'charge'
          AND child.category IN ('tax', 'service_charge')
      );
    excess := round(alloc_net_total - live_after, 2);

    IF excess > 0 THEN
      FOR alloc IN
        SELECT a.id, a.deposit_transaction_id, a.charge_transaction_id, a.amount
        FROM public.folio_deposit_allocations a
        WHERE a.restaurant_id = _restaurant_id
          AND a.released_allocation_id IS NULL
          AND a.charge_transaction_id IN (
            SELECT charge.id
            UNION ALL
            SELECT child.id FROM public.folio_transactions child
            WHERE child.restaurant_id = _restaurant_id
              AND child.original_transaction_id = charge.id
              AND child.transaction_type = 'charge'
              AND child.category IN ('tax', 'service_charge')
          )
        ORDER BY a.created_at DESC, a.id DESC
      LOOP
        EXIT WHEN excess <= 0;
        SELECT round(alloc.amount + COALESCE(sum(r.amount), 0), 2) INTO alloc_net
        FROM public.folio_deposit_allocations r
        WHERE r.released_allocation_id = alloc.id;
        IF alloc_net <= 0 THEN
          CONTINUE;
        END IF;
        release_amount := least(alloc_net, excess);
        release_key := 'cxrel' || replace(alloc.id::text, '-', '') || left(md5(correction_key), 8);
        IF NOT COALESCE(_dry_run, true) THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.folio_deposit_allocations
            WHERE restaurant_id = _restaurant_id AND idempotency_key = release_key
          ) THEN
            INSERT INTO public.folio_deposit_allocations (
              restaurant_id, deposit_transaction_id, charge_transaction_id, amount,
              idempotency_key, actor_membership_id, released_allocation_id
            ) VALUES (
              _restaurant_id, alloc.deposit_transaction_id, alloc.charge_transaction_id,
              -release_amount, release_key, _membership_id, alloc.id
            );
            INSERT INTO public.folio_history (
              restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
            ) VALUES (
              _restaurant_id, folio.id, 'deposit_allocated', _membership_id,
              'Deposit allocation released',
              jsonb_build_object(
                'released', true,
                'allocation_id', alloc.id,
                'deposit_transaction_id', alloc.deposit_transaction_id,
                'charge_transaction_id', alloc.charge_transaction_id,
                'amount', -release_amount,
                'reason', _kind
              )
            );
          END IF;
        END IF;
        released := released || jsonb_build_array(jsonb_build_object(
          'allocation_id', alloc.id,
          'deposit_transaction_id', alloc.deposit_transaction_id,
          'amount', release_amount
        ));
        excess := round(excess - release_amount, 2);
      END LOOP;
    END IF;

    description_text := CASE _kind
      WHEN 'noshow' THEN 'No-show reversal'
      WHEN 'unit_removal' THEN 'Room removed reversal'
      ELSE 'Cancellation reversal'
    END || ' — ' || COALESCE(NULLIF(btrim(charge.description), ''), 'charge');

    IF NOT COALESCE(_dry_run, true) THEN
      PERFORM public.post_folio_charge_correction(
        _restaurant_id,
        charge.id,
        correction_mode,
        CASE WHEN correction_mode = 'adjust_amount' THEN target ELSE NULL END,
        left(description_text, 200),
        _membership_id,
        correction_key
      );
    END IF;

    planned_reversal := round(planned_reversal + target, 2);
    reversed := reversed || jsonb_build_array(jsonb_build_object(
      'charge_id', charge.id,
      'reference_type', charge.reference_type,
      'description', charge.description,
      'mode', correction_mode,
      'amount', target
    ));
  END LOOP;

  SELECT COALESCE(round(sum(amount), 2), 0) INTO balance_now
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id;
  SELECT COALESCE(round(-sum(amount), 2), 0) INTO credits
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND folio_id = folio.id
    AND transaction_type IN ('payment', 'deposit', 'refund');
  SELECT COALESCE(round(sum(amount), 2), 0) INTO fees
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND folio_id = folio.id
    AND transaction_type = 'charge'
    AND reference_type IN ('reservation_cancel', 'reservation_no_show');

  balance_after := CASE
    WHEN COALESCE(_dry_run, true) THEN round(balance_now - planned_reversal, 2)
    ELSE balance_now
  END;

  RETURN jsonb_build_object(
    'dry_run', COALESCE(_dry_run, true),
    'kind', _kind,
    'reservation_id', res.id,
    'reservation_room_id', _reservation_room_id,
    'folio_id', folio.id,
    'folio_number', folio.folio_number,
    'folio_status', folio.status,
    'currency', folio.currency,
    'reversed', reversed,
    'pending', pending,
    'released', released,
    'skipped', skipped,
    'reversal_total', planned_reversal,
    'fees_posted', fees,
    'credits', credits,
    'balance', balance_after,
    'refund_due', greatest(-balance_after, 0),
    'amount_due', greatest(balance_after, 0),
    'closable', folio.status = 'open'
      AND abs(balance_after) < 0.01
      AND jsonb_array_length(pending) = 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Release deposit allocations above what a charge group keeps live
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_charge_allocations_above(
  _restaurant_id uuid,
  _charge_id uuid,
  _live_after numeric,
  _membership_id uuid,
  _release_seed text,
  _reason text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  charge_row public.folio_transactions%ROWTYPE;
  alloc record;
  alloc_net_total numeric(12,2);
  alloc_net numeric(12,2);
  excess numeric(12,2);
  release_amount numeric(12,2);
  release_key text;
  released_total numeric(12,2) := 0;
BEGIN
  SELECT * INTO charge_row FROM public.folio_transactions
  WHERE id = _charge_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(round(sum(a.amount), 2), 0) INTO alloc_net_total
  FROM public.folio_deposit_allocations a
  WHERE a.restaurant_id = _restaurant_id
    AND a.charge_transaction_id IN (
      SELECT charge_row.id
      UNION ALL
      SELECT child.id FROM public.folio_transactions child
      WHERE child.restaurant_id = _restaurant_id
        AND child.original_transaction_id = charge_row.id
        AND child.transaction_type = 'charge'
        AND child.category IN ('tax', 'service_charge')
    );
  excess := round(alloc_net_total - _live_after, 2);

  IF excess > 0 THEN
    FOR alloc IN
      SELECT a.id, a.deposit_transaction_id, a.charge_transaction_id, a.amount
      FROM public.folio_deposit_allocations a
      WHERE a.restaurant_id = _restaurant_id
        AND a.released_allocation_id IS NULL
        AND a.charge_transaction_id IN (
          SELECT charge_row.id
          UNION ALL
          SELECT child.id FROM public.folio_transactions child
          WHERE child.restaurant_id = _restaurant_id
            AND child.original_transaction_id = charge_row.id
            AND child.transaction_type = 'charge'
            AND child.category IN ('tax', 'service_charge')
        )
      ORDER BY a.created_at DESC, a.id DESC
    LOOP
      EXIT WHEN excess <= 0;
      SELECT round(alloc.amount + COALESCE(sum(r.amount), 0), 2) INTO alloc_net
      FROM public.folio_deposit_allocations r
      WHERE r.released_allocation_id = alloc.id;
      IF alloc_net <= 0 THEN
        CONTINUE;
      END IF;
      release_amount := least(alloc_net, excess);
      release_key := 'cxrel' || replace(alloc.id::text, '-', '') || left(md5(_release_seed), 8);
      IF NOT EXISTS (
        SELECT 1 FROM public.folio_deposit_allocations
        WHERE restaurant_id = _restaurant_id AND idempotency_key = release_key
      ) THEN
        INSERT INTO public.folio_deposit_allocations (
          restaurant_id, deposit_transaction_id, charge_transaction_id, amount,
          idempotency_key, actor_membership_id, released_allocation_id
        ) VALUES (
          _restaurant_id, alloc.deposit_transaction_id, alloc.charge_transaction_id,
          -release_amount, release_key, _membership_id, alloc.id
        );
        INSERT INTO public.folio_history (
          restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
        ) VALUES (
          _restaurant_id, charge_row.folio_id, 'deposit_allocated', _membership_id,
          'Deposit allocation released',
          jsonb_build_object(
            'released', true,
            'allocation_id', alloc.id,
            'deposit_transaction_id', alloc.deposit_transaction_id,
            'charge_transaction_id', alloc.charge_transaction_id,
            'amount', -release_amount,
            'reason', _reason
          )
        );
      END IF;
      released_total := round(released_total + release_amount, 2);
      excess := round(excess - release_amount, 2);
    END LOOP;
  END IF;

  RETURN released_total;
END;
$$;

-- ---------------------------------------------------------------------------
-- Restore: post the stay charge again when cancellation reversed it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.repost_reservation_charges_after_restore(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  pkg public.hotel_reservation_packages%ROWTYPE;
  unit_count integer := 0;
  primary_window uuid;
  default_group uuid;
  prior integer;
  posted integer := 0;
  previous_room text;
  fee public.folio_transactions%ROWTYPE;
  remaining_fee numeric(12,2);
  fee_key text;
BEGIN
  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  IF res.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  -- A reinstated stay is no longer cancelled or a no-show, so its fee is reversed.
  -- Each fee gets one deterministic correction key; a fee already reversed is skipped.
  FOR fee IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
      AND transaction_type = 'charge'
      AND reference_type IN ('reservation_cancel', 'reservation_no_show')
      AND category NOT IN ('tax', 'service_charge')
    ORDER BY posted_at, id
  LOOP
    remaining_fee := public.charge_group_remaining_gross(_restaurant_id, fee.id);
    CONTINUE WHEN remaining_fee <= 0;

    IF public.group_is_billed(_restaurant_id, fee.id) OR EXISTS (
      SELECT 1 FROM public.guest_folio_invoices
      WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
        AND coverage_scope = 'legacy_folio'
    ) THEN
      RAISE EXCEPTION 'FEE_INVOICED';
    END IF;

    fee_key := 'rsrfee' || replace(fee.id::text, '-', '');
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND idempotency_key = fee_key
    );

    PERFORM public.release_charge_allocations_above(
      _restaurant_id, fee.id, 0, _membership_id, fee_key, 'Cancellation fee reversed on reinstatement'
    );
    PERFORM public.post_folio_charge_correction(
      _restaurant_id,
      fee.id,
      'reverse_remaining',
      NULL,
      left('Fee reversed on reinstatement — ' || COALESCE(NULLIF(btrim(fee.description), ''), 'fee'), 200),
      _membership_id,
      fee_key
    );
  END LOOP;

  -- Only stays whose room charge was posted before can need a repost.
  IF NOT EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
      AND transaction_type = 'charge' AND reference_type = 'reservation_room_charge'
  ) THEN
    RETURN 0;
  END IF;

  SELECT default_room_tax_group_id INTO default_group
  FROM public.restaurants WHERE id = _restaurant_id;
  primary_window := public.ensure_primary_folio_window(_restaurant_id, folio.id);

  SELECT count(*) INTO unit_count
  FROM public.hotel_reservation_rooms
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id;

  IF unit_count <= 1 OR EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
      AND transaction_type = 'charge' AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
  ) THEN
    IF COALESCE(res.room_subtotal, 0) > 0 AND NOT EXISTS (
      SELECT 1 FROM public.folio_transactions t
      WHERE t.restaurant_id = _restaurant_id AND t.folio_id = folio.id
        AND t.transaction_type = 'charge' AND t.reference_type = 'reservation_room_charge'
        AND t.reference_id = res.id
        AND public.charge_group_remaining_gross(_restaurant_id, t.id) > 0
    ) THEN
      SELECT count(*) INTO prior FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
        AND transaction_type = 'charge' AND reference_type = 'reservation_room_charge'
        AND reference_id = res.id;
      PERFORM public.post_folio_charge_with_tax(
        _restaurant_id, folio.id, 'room',
        'Room charge — reservation ' || res.confirmation_number,
        res.room_subtotal, 'room', 'reservation_room_charge', res.id, _membership_id,
        primary_window, 'rsrpl' || replace(res.id::text, '-', '') || prior::text, default_group
      );
      posted := posted + 1;
    END IF;
  ELSE
    FOR unit IN
      SELECT * FROM public.hotel_reservation_rooms
      WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
        AND status IN ('pending', 'confirmed')
        AND COALESCE(room_subtotal, 0) > 0
      ORDER BY unit_sequence
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.folio_transactions t
        WHERE t.restaurant_id = _restaurant_id AND t.folio_id = folio.id
          AND t.transaction_type = 'charge' AND t.reference_type = 'reservation_room_charge'
          AND (t.reference_id = unit.id OR t.reservation_room_id = unit.id)
          AND public.charge_group_remaining_gross(_restaurant_id, t.id) > 0
      ) THEN
        CONTINUE;
      END IF;
      SELECT count(*) INTO prior FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
        AND transaction_type = 'charge' AND reference_type = 'reservation_room_charge'
        AND reference_id = unit.id;
      previous_room := current_setting('noru.reservation_room_id', true);
      PERFORM set_config('noru.reservation_room_id', unit.id::text, true);
      BEGIN
        PERFORM public.post_folio_charge_with_tax(
          _restaurant_id, folio.id, 'room',
          'Room charge — room ' || unit.unit_sequence::text || ' — ' || res.confirmation_number,
          unit.room_subtotal, 'room', 'reservation_room_charge', unit.id, _membership_id,
          primary_window, 'rsrpl' || replace(unit.id::text, '-', '') || prior::text, default_group
        );
        PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
        RAISE;
      END;
      posted := posted + 1;
    END LOOP;
  END IF;

  FOR pkg IN
    SELECT * FROM public.hotel_reservation_packages
    WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
      AND COALESCE(applied_amount, 0) > 0
    ORDER BY created_at, id
  LOOP
    -- Packages that were never posted, or still have a live charge, need nothing.
    IF NOT EXISTS (
      SELECT 1 FROM public.folio_transactions t
      WHERE t.restaurant_id = _restaurant_id AND t.folio_id = folio.id
        AND t.transaction_type = 'charge' AND t.reference_type = 'reservation_package_charge'
        AND t.reference_id = pkg.id
    ) OR EXISTS (
      SELECT 1 FROM public.folio_transactions t
      WHERE t.restaurant_id = _restaurant_id AND t.folio_id = folio.id
        AND t.transaction_type = 'charge' AND t.reference_type = 'reservation_package_charge'
        AND t.reference_id = pkg.id
        AND public.charge_group_remaining_gross(_restaurant_id, t.id) > 0
    ) THEN
      CONTINUE;
    END IF;
    IF pkg.reservation_room_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.hotel_reservation_rooms
      WHERE id = pkg.reservation_room_id AND status IN ('pending', 'confirmed')
    ) THEN
      CONTINUE;
    END IF;
    PERFORM set_config('noru.package_actor_membership_id', COALESCE(_membership_id::text, ''), true);
    PERFORM public.post_reservation_package_charge(_restaurant_id, pkg.id, _membership_id);
    PERFORM set_config('noru.package_actor_membership_id', '', true);
    posted := posted + 1;
  END LOOP;

  RETURN posted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Historical report: cancelled and no-show stays that still need settlement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_cancelled_reservation_settlement_exceptions(
  _restaurant_id uuid
) RETURNS TABLE (
  reservation_id uuid,
  confirmation_number text,
  status text,
  folio_id uuid,
  folio_number text,
  currency text,
  reversible_amount numeric,
  pending_count integer,
  refund_due numeric,
  amount_due numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stay record;
  plan jsonb;
BEGIN
  FOR stay IN
    SELECT r.id, r.confirmation_number, r.status, f.id AS folio_id
    FROM public.hotel_reservations r
    JOIN public.guest_folios f
      ON f.restaurant_id = r.restaurant_id AND f.reservation_id = r.id
    WHERE r.restaurant_id = _restaurant_id
      AND r.status IN ('cancelled', 'no_show')
      AND f.status = 'open'
    ORDER BY r.arrival_date DESC, r.id
  LOOP
    plan := public.settle_reservation_cancellation(
      _restaurant_id, stay.id, NULL,
      CASE WHEN stay.status = 'no_show' THEN 'noshow' ELSE 'cancel' END,
      NULL, true
    );
    IF (plan->>'reversal_total')::numeric > 0
       OR jsonb_array_length(plan->'pending') > 0
       OR (plan->>'refund_due')::numeric > 0
       OR (plan->>'amount_due')::numeric > 0 THEN
      reservation_id := stay.id;
      confirmation_number := stay.confirmation_number;
      status := stay.status;
      folio_id := stay.folio_id;
      folio_number := plan->>'folio_number';
      currency := plan->>'currency';
      reversible_amount := (plan->>'reversal_total')::numeric;
      pending_count := jsonb_array_length(plan->'pending');
      refund_due := (plan->>'refund_due')::numeric;
      amount_due := (plan->>'amount_due')::numeric;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.folio_deposit_allocations_release_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_reservation_fee_folio(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_group_remaining_gross(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_reservation_cancellation(uuid, uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repost_reservation_charges_after_restore(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_charge_allocations_above(uuid, uuid, numeric, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_cancelled_reservation_settlement_exceptions(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.open_reservation_fee_folio(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_group_remaining_gross(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_reservation_cancellation(uuid, uuid, uuid, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.repost_reservation_charges_after_restore(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_cancelled_reservation_settlement_exceptions(uuid) TO service_role;
