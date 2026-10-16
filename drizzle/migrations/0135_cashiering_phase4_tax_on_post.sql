-- Cashiering Phase 4 Plan A — tax and service-charge lines at post time.
-- Dual-lane with supabase/migrations/0135_cashiering_phase4_tax_on_post.sql.
-- Settings Card 3 (pms_taxes, pms_tax_groups, pms_service_charges) drive immutable
-- sibling ledger lines linked to the parent charge. No invoice issue (Phase 11).

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_category_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_category_check CHECK (
    category IN (
      'room','manual','payment','deposit','refund','adjustment','discount',
      'future_restaurant','transfer','tax','service_charge'
    )
  );

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb;

COMMENT ON COLUMN public.folio_transactions.tax_snapshot IS
  'Immutable snapshot of Card 3 tax or service-charge row applied at post time. Settings edits must not rewrite posted lines.';

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS default_room_tax_group_id uuid;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_default_room_tax_group_fk;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_default_room_tax_group_fk
  FOREIGN KEY (default_room_tax_group_id, id)
  REFERENCES public.pms_tax_groups (id, restaurant_id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.restaurants.default_room_tax_group_id IS
  'Optional Card 3 tax group applied when posting room charges. When unset, active taxes with room/all basis apply.';

CREATE OR REPLACE FUNCTION public.folio_transactions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.folio_id IS DISTINCT FROM OLD.folio_id
      OR NEW.financial_account_id IS DISTINCT FROM OLD.financial_account_id
      OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
      OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
      OR NEW.posted_by_membership_id IS DISTINCT FROM OLD.posted_by_membership_id
      OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.original_transaction_id IS DISTINCT FROM OLD.original_transaction_id
      OR NEW.hotel_cashier_shift_id IS DISTINCT FROM OLD.hotel_cashier_shift_id
      OR NEW.folio_window_id IS DISTINCT FROM OLD.folio_window_id
      OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id
      OR NEW.transfer_direction IS DISTINCT FROM OLD.transfer_direction
      OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Applicable Card 3 taxes for a folio charge basis (room | folio).
-- Hybrid: when _default_tax_group_id is set and _tax_basis = room, only taxes in that active group apply.
CREATE OR REPLACE FUNCTION public.resolve_folio_tax_rows(
  _restaurant_id uuid,
  _tax_basis text,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS TABLE (
  tax_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text,
  calculation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tax_basis NOT IN ('room', 'folio') THEN
    RAISE EXCEPTION 'INVALID_TAX_BASIS';
  END IF;

  IF _default_tax_group_id IS NOT NULL AND _tax_basis = 'room' THEN
    RETURN QUERY
    SELECT
      t.id,
      t.code,
      t.name,
      t.charge_type,
      t.amount,
      t.basis,
      t.calculation
    FROM public.pms_taxes t
    INNER JOIN public.pms_tax_group_taxes gt
      ON gt.tax_id = t.id AND gt.restaurant_id = t.restaurant_id
    INNER JOIN public.pms_tax_groups g
      ON g.id = gt.tax_group_id AND g.restaurant_id = t.restaurant_id
    WHERE t.restaurant_id = _restaurant_id
      AND g.id = _default_tax_group_id
      AND g.active = true
      AND t.active = true
    ORDER BY
      CASE WHEN t.calculation = 'inclusive' THEN 0 ELSE 1 END,
      CASE WHEN t.charge_type = 'fixed' THEN 0 ELSE 1 END,
      t.code;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.code,
    t.name,
    t.charge_type,
    t.amount,
    t.basis,
    t.calculation
  FROM public.pms_taxes t
  WHERE t.restaurant_id = _restaurant_id
    AND t.active = true
    AND t.basis IN (_tax_basis, 'all')
  ORDER BY
    CASE WHEN t.calculation = 'inclusive' THEN 0 ELSE 1 END,
    CASE WHEN t.charge_type = 'fixed' THEN 0 ELSE 1 END,
    t.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_folio_service_charge_rows(
  _restaurant_id uuid,
  _tax_basis text
) RETURNS TABLE (
  service_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id,
    s.code,
    s.name,
    s.charge_type,
    s.amount,
    s.basis
  FROM public.pms_service_charges s
  WHERE s.restaurant_id = _restaurant_id
    AND s.active = true
    AND s.basis IN (_tax_basis, 'all')
  ORDER BY
    CASE WHEN s.charge_type = 'fixed' THEN 0 ELSE 1 END,
    s.code;
$$;

-- Single tax/service component amount for a base. Rounded to 2dp per line.
CREATE OR REPLACE FUNCTION public.compute_folio_tax_component_amount(
  _base numeric,
  _charge_type text,
  _rate numeric,
  _calculation text
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  line numeric;
BEGIN
  IF _base IS NULL OR _base <= 0 THEN
    RETURN 0;
  END IF;
  IF _charge_type = 'fixed' THEN
    IF _calculation = 'inclusive' THEN
      line := least(_rate, _base);
    ELSE
      line := _rate;
    END IF;
  ELSIF _calculation = 'inclusive' THEN
    line := _base * _rate / (100 + _rate);
  ELSE
    line := _base * _rate / 100;
  END IF;
  RETURN round(line, 2);
END;
$$;

-- Inclusive pass: fixed taxes first, then percentage on remaining gross (single pass).
-- Exclusive pass: fixed then percentage on net base. Parent is net when any inclusive tax exists.
CREATE OR REPLACE FUNCTION public.append_folio_tax_and_service_lines(
  _restaurant_id uuid,
  _folio_id uuid,
  _parent_id uuid,
  _entered_amount numeric,
  _tax_basis text,
  _membership_id uuid,
  _folio_window_id uuid DEFAULT NULL,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tax_row record;
  svc_row record;
  remaining numeric(12,2);
  parent_base numeric(12,2);
  line_amt numeric(12,2);
  has_inclusive boolean := false;
  snap jsonb;
BEGIN
  IF _entered_amount IS NULL OR _entered_amount <= 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = _folio_id
      AND original_transaction_id = _parent_id
      AND category IN ('tax', 'service_charge')
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  remaining := round(_entered_amount, 2);
  parent_base := remaining;

  IF has_inclusive THEN
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
      WHERE t.calculation = 'inclusive'
    LOOP
      line_amt := public.compute_folio_tax_component_amount(
        remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
      );
      IF line_amt <= 0 THEN
        CONTINUE;
      END IF;
      remaining := round(remaining - line_amt, 2);
      snap := jsonb_build_object(
        'taxId', tax_row.tax_id,
        'code', tax_row.code,
        'name', tax_row.name,
        'chargeType', tax_row.charge_type,
        'amount', tax_row.amount,
        'basis', tax_row.basis,
        'calculation', tax_row.calculation,
        'lineAmount', line_amt
      );
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
      ) VALUES (
        _restaurant_id, _folio_id, 'charge', 'tax',
        tax_row.name || ' (' || tax_row.code || ')', line_amt,
        _membership_id, _parent_id, _folio_window_id, snap
      );
    END LOOP;
    parent_base := remaining;
  ELSE
    parent_base := round(_entered_amount, 2);
  END IF;

  UPDATE public.folio_transactions
  SET amount = parent_base
  WHERE id = _parent_id
    AND restaurant_id = _restaurant_id
    AND category IN ('room', 'manual')
    AND amount IS DISTINCT FROM parent_base;

  FOR tax_row IN
    SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
    WHERE t.calculation = 'exclusive'
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, tax_row.charge_type, tax_row.amount, tax_row.calculation
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    snap := jsonb_build_object(
      'taxId', tax_row.tax_id,
      'code', tax_row.code,
      'name', tax_row.name,
      'chargeType', tax_row.charge_type,
      'amount', tax_row.amount,
      'basis', tax_row.basis,
      'calculation', tax_row.calculation,
      'lineAmount', line_amt
    );
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
    ) VALUES (
      _restaurant_id, _folio_id, 'charge', 'tax',
      tax_row.name || ' (' || tax_row.code || ')', line_amt,
      _membership_id, _parent_id, _folio_window_id, snap
    );
  END LOOP;

  FOR svc_row IN
    SELECT * FROM public.resolve_folio_service_charge_rows(_restaurant_id, _tax_basis)
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, svc_row.charge_type, svc_row.amount, 'exclusive'
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    snap := jsonb_build_object(
      'serviceChargeId', svc_row.service_id,
      'code', svc_row.code,
      'name', svc_row.name,
      'chargeType', svc_row.charge_type,
      'amount', svc_row.amount,
      'basis', svc_row.basis,
      'lineAmount', line_amt
    );
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
    ) VALUES (
      _restaurant_id, _folio_id, 'charge', 'service_charge',
      svc_row.name || ' (' || svc_row.code || ')', line_amt,
      _membership_id, _parent_id, _folio_window_id, snap
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_charge_with_tax(
  _restaurant_id uuid,
  _folio_id uuid,
  _category text,
  _description text,
  _amount numeric,
  _tax_basis text,
  _reference_type text,
  _reference_id uuid,
  _membership_id uuid,
  _folio_window_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  txn public.folio_transactions%ROWTYPE;
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  default_group uuid;
  parent_amount numeric(12,2);
  has_inclusive boolean := false;
  tax_row record;
  remaining numeric(12,2);
BEGIN
  IF _category NOT IN ('room', 'manual') THEN
    RAISE EXCEPTION 'INVALID_CHARGE_CATEGORY';
  END IF;
  IF _tax_basis NOT IN ('room', 'folio') THEN
    RAISE EXCEPTION 'INVALID_TAX_BASIS';
  END IF;
  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF txn.folio_id IS DISTINCT FROM folio.id OR txn.transaction_type IS DISTINCT FROM 'charge' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN txn;
    END IF;
  END IF;

  default_group := _default_tax_group_id;
  IF default_group IS NULL AND _tax_basis = 'room' THEN
    SELECT default_room_tax_group_id INTO default_group
    FROM public.restaurants WHERE id = _restaurant_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, default_group) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  parent_amount := round(_amount, 2);
  IF has_inclusive THEN
    remaining := parent_amount;
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, default_group) t
      WHERE t.calculation = 'inclusive'
    LOOP
      remaining := round(
        remaining - public.compute_folio_tax_component_amount(
          remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
        ),
        2
      );
    END LOOP;
    parent_amount := remaining;
  END IF;

  BEGIN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id, idempotency_key, folio_window_id
    ) VALUES (
      _restaurant_id, folio.id, 'charge', _category, clean_desc, parent_amount,
      _reference_type, _reference_id, _membership_id, clean_key, _folio_window_id
    ) RETURNING * INTO txn;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      RETURN txn;
  END;

  PERFORM public.append_folio_tax_and_service_lines(
    _restaurant_id, folio.id, txn.id, _amount, _tax_basis, _membership_id,
    _folio_window_id, default_group
  );

  SELECT * INTO txn FROM public.folio_transactions WHERE id = txn.id;
  RETURN txn;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_transaction(
  _restaurant_id uuid,
  _folio_id uuid,
  _type text,
  _category text,
  _description text,
  _amount numeric,
  _reference_type text,
  _reference_id uuid,
  _membership_id uuid,
  _payment_method text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _original_transaction_id uuid DEFAULT NULL
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  source public.folio_transactions%ROWTYPE;
  signed numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  settled numeric(12,2);
  linked numeric(12,2);
  hotel_shift uuid;
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_method text := NULLIF(btrim(COALESCE(_payment_method, '')), '');
BEGIN
  IF _type NOT IN ('charge','payment','deposit','refund','adjustment','discount') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;

  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  IF clean_method IS NOT NULL AND clean_method NOT IN ('cash','card','bank_transfer','mobile_money','other') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;

  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF txn.folio_id IS DISTINCT FROM folio.id OR txn.transaction_type IS DISTINCT FROM _type THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN txn;
    END IF;
  END IF;

  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF _type IN ('payment','deposit','refund') AND clean_method IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED';
  END IF;

  IF _original_transaction_id IS NOT NULL AND _type NOT IN ('refund','adjustment','discount') THEN
    RAISE EXCEPTION 'SOURCE_NOT_ALLOWED';
  END IF;

  IF _type IN ('refund','adjustment','discount') AND _original_transaction_id IS NULL THEN
    RAISE EXCEPTION 'SOURCE_REQUIRED';
  END IF;

  IF _original_transaction_id IS NOT NULL THEN
    SELECT * INTO source FROM public.folio_transactions
    WHERE id = _original_transaction_id
      AND restaurant_id = _restaurant_id
      AND folio_id = folio.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO';
    END IF;
    IF _type = 'refund' AND source.transaction_type NOT IN ('payment','deposit') THEN
      RAISE EXCEPTION 'SOURCE_NOT_A_PAYMENT';
    END IF;
    IF _type = 'discount' AND source.transaction_type <> 'charge' THEN
      RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
    END IF;
  END IF;

  IF _type = 'charge' AND _category IN ('manual', 'room') THEN
    txn := public.post_folio_charge_with_tax(
      _restaurant_id,
      _folio_id,
      _category,
      clean_desc,
      _amount,
      CASE _category WHEN 'room' THEN 'room' ELSE 'folio' END,
      _reference_type,
      _reference_id,
      _membership_id,
      NULL,
      clean_key,
      NULL
    );
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id,
      CASE _category WHEN 'room' THEN 'room_charge_posted' ELSE 'manual_charge_posted' END,
      jsonb_build_object('transaction_id', txn.id, 'amount', txn.amount, 'category', _category,
                         'reference_type', _reference_type, 'idempotency_key', clean_key,
                         'entered_amount', _amount),
      clean_desc, _membership_id
    );
    RETURN txn;
  END IF;

  IF _type = 'adjustment' THEN
    IF _amount = 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := _amount;
  ELSE
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := CASE _type
      WHEN 'charge' THEN _amount
      WHEN 'refund' THEN _amount
      ELSE -_amount
    END;
  END IF;

  IF _type = 'refund' THEN
    SELECT COALESCE(-sum(amount), 0) INTO settled
    FROM public.folio_transactions
    WHERE folio_id = folio.id AND transaction_type IN ('payment','deposit','refund');

    IF _amount > settled THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_SETTLED';
    END IF;
  END IF;

  IF _type = 'refund' THEN
    SELECT COALESCE(sum(amount), 0) INTO linked
    FROM public.folio_transactions
    WHERE folio_id = folio.id
      AND transaction_type = 'refund'
      AND original_transaction_id = source.id;
    IF _amount > (-source.amount - linked) THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_SOURCE';
    END IF;
  END IF;

  BEGIN
    hotel_shift := NULL;
    IF clean_method = 'cash' AND _type IN ('payment','deposit','refund') THEN
      SELECT id INTO hotel_shift FROM public.hotel_cashier_shifts
      WHERE restaurant_id = _restaurant_id
        AND membership_id = _membership_id
        AND status = 'open'
      LIMIT 1;
    END IF;

    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id, payment_method, idempotency_key,
      original_transaction_id, hotel_cashier_shift_id
    ) VALUES (
      _restaurant_id, folio.id, _type, _category, clean_desc, signed,
      _reference_type, _reference_id, _membership_id, clean_method, clean_key,
      _original_transaction_id, hotel_shift
    ) RETURNING * INTO txn;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      IF txn.folio_id IS DISTINCT FROM folio.id OR txn.transaction_type IS DISTINCT FROM _type THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN txn;
  END;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id,
    CASE _type
      WHEN 'charge' THEN 'manual_charge_posted'
      WHEN 'payment' THEN 'payment_received'
      WHEN 'deposit' THEN 'deposit_received'
      WHEN 'refund' THEN 'refund_posted'
      WHEN 'discount' THEN 'discount_posted'
      ELSE 'adjustment_posted'
    END,
    jsonb_build_object('transaction_id', txn.id, 'amount', signed, 'category', _category,
                       'reference_type', _reference_type, 'payment_method', clean_method,
                       'idempotency_key', clean_key, 'original_transaction_id', _original_transaction_id),
    clean_desc, _membership_id
  );

  RETURN txn;
END;
$$;

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
  primary_window uuid;
  parent_txn public.folio_transactions%ROWTYPE;
  default_group uuid;
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

  IF charge_amount > 0 THEN
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

REVOKE ALL ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_folio_tax_component_amount(numeric, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.append_folio_tax_and_service_lines(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_folio_charge_with_tax(uuid, uuid, text, text, numeric, text, text, uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_folio_tax_component_amount(numeric, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_folio_tax_and_service_lines(uuid, uuid, uuid, numeric, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_charge_with_tax(uuid, uuid, text, text, numeric, text, text, uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.post_folio_charge_with_tax(uuid, uuid, text, text, numeric, text, text, uuid, uuid, uuid, text, uuid) IS
  'Posts a room or manual charge with Card 3 tax and service-charge sibling lines. Parent stores net base when inclusive taxes apply; child lines are immutable snapshots.';
COMMENT ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) IS
  'Append-only guest folio post. Manual and room charges delegate to post_folio_charge_with_tax. Payments, deposits, and refunds unchanged.';
