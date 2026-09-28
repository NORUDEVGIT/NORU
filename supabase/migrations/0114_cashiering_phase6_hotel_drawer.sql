-- Cashiering Phase 6 — hotel drawer, separate from restaurant expected_cash.
-- Dual-lane with supabase/migrations/0114_cashiering_phase6_hotel_drawer.sql.
-- Does not alter close_cashier_shift or pos_cashier_shifts.

CREATE TABLE IF NOT EXISTS public.hotel_cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) NOT NULL,
  closing_count numeric(12,2),
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_cashier_shifts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_cashier_shifts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT hotel_cashier_shifts_opening_check CHECK (opening_cash >= 0),
  CONSTRAINT hotel_cashier_shifts_closing_check CHECK (closing_count IS NULL OR closing_count >= 0),
  CONSTRAINT hotel_cashier_shifts_membership_same_property FOREIGN KEY (membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_cashier_shifts_one_open
  ON public.hotel_cashier_shifts (restaurant_id, membership_id)
  WHERE status = 'open';

COMMENT ON TABLE public.hotel_cashier_shifts IS
  'Hotel cashier drawer. Not a restaurant till and not pos_cashier_shifts.';

CREATE TABLE IF NOT EXISTS public.hotel_drawer_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  hotel_cashier_shift_id uuid NOT NULL,
  movement_type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  idempotency_key text,
  notes text,
  actor_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_drawer_movements_shift_same_property
    FOREIGN KEY (hotel_cashier_shift_id, restaurant_id)
    REFERENCES public.hotel_cashier_shifts (id, restaurant_id),
  CONSTRAINT hotel_drawer_movements_type_check CHECK (
    movement_type IN ('opening','cash_in','cash_out','close_count')
  ),
  CONSTRAINT hotel_drawer_movements_amount_check CHECK (amount >= 0),
  CONSTRAINT hotel_drawer_movements_key_check CHECK (
    idempotency_key IS NULL OR (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 80)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_drawer_movements_idempotency_key
  ON public.hotel_drawer_movements (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS hotel_cashier_shift_id uuid;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_hotel_shift_same_property;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_hotel_shift_same_property
  FOREIGN KEY (hotel_cashier_shift_id, restaurant_id)
  REFERENCES public.hotel_cashier_shifts (id, restaurant_id);

COMMENT ON COLUMN public.folio_transactions.hotel_cashier_shift_id IS
  'Open hotel drawer attributed when a cash payment, deposit, or refund is posted. Null when no hotel drawer was open.';

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
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_drawer_movements_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'HOTEL_DRAWER_MOVEMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_drawer_movements_no_mutation ON public.hotel_drawer_movements;
CREATE TRIGGER hotel_drawer_movements_no_mutation
  BEFORE UPDATE OR DELETE ON public.hotel_drawer_movements
  FOR EACH ROW EXECUTE FUNCTION public.hotel_drawer_movements_immutable();

CREATE OR REPLACE FUNCTION public.hotel_drawer_figures(
  _restaurant_id uuid, _shift_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.hotel_cashier_shifts%ROWTYPE;
  opening numeric(12,2);
  cash_in numeric(12,2);
  cash_out numeric(12,2);
  hotel_cash numeric(12,2);
  expected numeric(12,2);
  closing_count numeric(12,2);
BEGIN
  SELECT * INTO shift FROM public.hotel_cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO opening
  FROM public.hotel_drawer_movements
  WHERE hotel_cashier_shift_id = shift.id AND movement_type = 'opening';
  SELECT COALESCE(sum(amount), 0) INTO cash_in
  FROM public.hotel_drawer_movements
  WHERE hotel_cashier_shift_id = shift.id AND movement_type = 'cash_in';
  SELECT COALESCE(sum(amount), 0) INTO cash_out
  FROM public.hotel_drawer_movements
  WHERE hotel_cashier_shift_id = shift.id AND movement_type = 'cash_out';
  SELECT COALESCE(-sum(amount), 0) INTO hotel_cash
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND hotel_cashier_shift_id = shift.id
    AND payment_method = 'cash'
    AND transaction_type IN ('payment','deposit','refund');

  expected := round(opening + cash_in - cash_out + hotel_cash, 2);
  SELECT amount INTO closing_count
  FROM public.hotel_drawer_movements
  WHERE hotel_cashier_shift_id = shift.id AND movement_type = 'close_count'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'shift_id', shift.id,
    'opening', opening,
    'cash_in', cash_in,
    'cash_out', cash_out,
    'hotel_cash', hotel_cash,
    'expected', expected,
    'closing_count', closing_count,
    'variance', CASE WHEN closing_count IS NULL THEN NULL ELSE round(closing_count - expected, 2) END
  );
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

REVOKE ALL ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text, uuid) IS
  'Append-only guest folio post. A repeated idempotency key returns the original row. A source pointer does not change the source line amount. Payment, deposit, and refund require a method. The entered amount is stored with no tax calculation. A refund cannot exceed the unpaid remainder of its source payment.';



CREATE OR REPLACE FUNCTION public.open_hotel_cashier_shift(
  _restaurant_id uuid, _membership_id uuid, _opening_cash numeric, _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.hotel_cashier_shifts%ROWTYPE;
BEGIN
  IF _opening_cash IS NULL OR _opening_cash < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO shift FROM public.hotel_cashier_shifts
  WHERE restaurant_id = _restaurant_id AND membership_id = _membership_id AND status = 'open'
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_OPEN';
  END IF;

  INSERT INTO public.hotel_cashier_shifts (restaurant_id, membership_id, opening_cash, notes)
  VALUES (_restaurant_id, _membership_id, _opening_cash, NULLIF(btrim(COALESCE(_notes, '')), ''))
  RETURNING * INTO shift;

  INSERT INTO public.hotel_drawer_movements (
    restaurant_id, hotel_cashier_shift_id, movement_type, amount, idempotency_key, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'opening', _opening_cash, 'opening:' || shift.id::text, _membership_id
  );

  RETURN public.hotel_drawer_figures(_restaurant_id, shift.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_hotel_drawer_movement(
  _restaurant_id uuid,
  _shift_id uuid,
  _movement_type text,
  _amount numeric,
  _notes text,
  _membership_id uuid,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.hotel_cashier_shifts%ROWTYPE;
  existing public.hotel_drawer_movements%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
BEGIN
  IF _movement_type NOT IN ('cash_in','cash_out') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO existing FROM public.hotel_drawer_movements
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF existing.hotel_cashier_shift_id IS DISTINCT FROM _shift_id
      OR existing.movement_type IS DISTINCT FROM _movement_type THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN public.hotel_drawer_figures(_restaurant_id, existing.hotel_cashier_shift_id);
  END IF;

  SELECT * INTO shift FROM public.hotel_cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  IF shift.status <> 'open' THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;

  BEGIN
    INSERT INTO public.hotel_drawer_movements (
      restaurant_id, hotel_cashier_shift_id, movement_type, amount, idempotency_key, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, shift.id, _movement_type, _amount, clean_key,
      NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO existing FROM public.hotel_drawer_movements
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF NOT FOUND THEN RAISE; END IF;
      RETURN public.hotel_drawer_figures(_restaurant_id, existing.hotel_cashier_shift_id);
  END;

  RETURN public.hotel_drawer_figures(_restaurant_id, shift.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_hotel_cashier_shift(
  _restaurant_id uuid, _shift_id uuid, _closing_count numeric, _notes text, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.hotel_cashier_shifts%ROWTYPE;
  figures jsonb;
BEGIN
  IF _closing_count IS NULL OR _closing_count < 0 THEN
    RAISE EXCEPTION 'INVALID_CLOSING_CASH';
  END IF;

  SELECT * INTO shift FROM public.hotel_cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  IF shift.status = 'closed' THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;

  INSERT INTO public.hotel_drawer_movements (
    restaurant_id, hotel_cashier_shift_id, movement_type, amount, idempotency_key, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'close_count', _closing_count, 'close:' || shift.id::text,
    NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
  );

  UPDATE public.hotel_cashier_shifts
  SET status = 'closed',
      closed_at = now(),
      closing_count = _closing_count,
      notes = COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = shift.id;

  figures := public.hotel_drawer_figures(_restaurant_id, shift.id);
  RETURN figures;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_hotel_drawers(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.opened_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      s.id,
      s.membership_id,
      s.status,
      s.opened_at,
      s.closed_at,
      s.notes,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'opening')::numeric AS opening,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'cash_in')::numeric AS cash_in,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'cash_out')::numeric AS cash_out,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'hotel_cash')::numeric AS hotel_cash,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'expected')::numeric AS expected,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'closing_count')::numeric AS closing_count,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'variance')::numeric AS variance
    FROM public.hotel_cashier_shifts s
    WHERE s.restaurant_id = _restaurant_id
    ORDER BY s.opened_at DESC
    LIMIT 100
  ) x;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.hotel_drawer_figures(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_hotel_cashier_shift(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_hotel_drawer_movement(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_hotel_cashier_shift(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_hotel_drawers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_drawer_figures(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.open_hotel_cashier_shift(uuid, uuid, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_hotel_drawer_movement(uuid, uuid, text, numeric, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_hotel_cashier_shift(uuid, uuid, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_hotel_drawers(uuid) TO service_role;

ALTER TABLE public.hotel_cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_drawer_movements ENABLE ROW LEVEL SECURITY;
