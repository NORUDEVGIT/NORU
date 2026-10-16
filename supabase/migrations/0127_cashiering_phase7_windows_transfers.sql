-- Cashiering Phase 7 — guest folio windows and folio-to-folio transfers.
-- Dual-lane with supabase/migrations/0127_cashiering_phase7_windows_transfers.sql.
-- Routing from pms_billing_rules is not executed here. No stored balance.

CREATE TABLE IF NOT EXISTS public.guest_folio_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid NOT NULL,
  window_number integer NOT NULL,
  label text NOT NULL DEFAULT 'Window 1',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folio_windows_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_folio_windows_folio_same_property FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT guest_folio_windows_number_check CHECK (window_number >= 1),
  CONSTRAINT guest_folio_windows_label_check CHECK (btrim(label) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_folio_windows_number_unique
  ON public.guest_folio_windows (restaurant_id, folio_id, window_number);

CREATE UNIQUE INDEX IF NOT EXISTS guest_folio_windows_one_primary
  ON public.guest_folio_windows (restaurant_id, folio_id)
  WHERE is_primary;

COMMENT ON TABLE public.guest_folio_windows IS
  'Charge/payment windows within a guest folio. Balance per window is derived from folio_transactions.folio_window_id.';

GRANT SELECT, INSERT ON public.guest_folio_windows TO authenticated;
GRANT ALL ON public.guest_folio_windows TO service_role;
ALTER TABLE public.guest_folio_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read folio windows" ON public.guest_folio_windows;
CREATE POLICY "Managers read folio windows" ON public.guest_folio_windows
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert folio windows" ON public.guest_folio_windows;
CREATE POLICY "Managers insert folio windows" ON public.guest_folio_windows
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

INSERT INTO public.guest_folio_windows (restaurant_id, folio_id, window_number, label, is_primary)
SELECT gf.restaurant_id, gf.id, 1, 'Window 1', true
FROM public.guest_folios gf
WHERE NOT EXISTS (
  SELECT 1 FROM public.guest_folio_windows w
  WHERE w.folio_id = gf.id AND w.restaurant_id = gf.restaurant_id
);

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS folio_window_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_id uuid,
  ADD COLUMN IF NOT EXISTS transfer_direction text;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_window_same_property;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_window_same_property
  FOREIGN KEY (folio_window_id, restaurant_id)
  REFERENCES public.guest_folio_windows (id, restaurant_id);

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_transfer_direction_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_transfer_direction_check CHECK (
    transfer_direction IS NULL OR transfer_direction IN ('out','in')
  );

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_type_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_type_check CHECK (
    transaction_type IN (
      'charge','payment','deposit','refund','adjustment','discount',
      'transfer_out','transfer_in'
    )
  );

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_category_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_category_check CHECK (
    category IN (
      'room','manual','payment','deposit','refund','adjustment','discount',
      'future_restaurant','transfer'
    )
  );

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
      OR NEW.folio_window_id IS DISTINCT FROM OLD.folio_window_id
      OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id
      OR NEW.transfer_direction IS DISTINCT FROM OLD.transfer_direction
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_primary_folio_window(
  _restaurant_id uuid,
  _folio_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  window_id uuid;
BEGIN
  SELECT id INTO window_id FROM public.guest_folio_windows
  WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id AND is_primary
  LIMIT 1;
  IF FOUND THEN
    RETURN window_id;
  END IF;
  INSERT INTO public.guest_folio_windows (restaurant_id, folio_id, window_number, label, is_primary)
  VALUES (_restaurant_id, _folio_id, 1, 'Window 1', true)
  RETURNING id INTO window_id;
  RETURN window_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferable_charge_remainder(
  _restaurant_id uuid,
  _charge_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  charge public.folio_transactions%ROWTYPE;
  moved numeric(12,2);
BEGIN
  SELECT * INTO charge FROM public.folio_transactions
  WHERE id = _charge_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR charge.transaction_type <> 'charge' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(sum(abs(amount)), 0) INTO moved
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND original_transaction_id = charge.id
    AND transaction_type = 'transfer_out';
  RETURN round(charge.amount - moved, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_transfer(
  _restaurant_id uuid,
  _source_folio_id uuid,
  _target_folio_id uuid,
  _source_transaction_id uuid,
  _target_window_id uuid,
  _amount numeric,
  _description text,
  _membership_id uuid,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source_folio public.guest_folios%ROWTYPE;
  target_folio public.guest_folios%ROWTYPE;
  source_line public.folio_transactions%ROWTYPE;
  target_window public.guest_folio_windows%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  transfer uuid := gen_random_uuid();
  remainder numeric(12,2);
  out_txn public.folio_transactions%ROWTYPE;
  in_txn public.folio_transactions%ROWTYPE;
  existing public.folio_transactions%ROWTYPE;
BEGIN
  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
    LIMIT 1;
    IF FOUND THEN
      IF existing.transaction_type <> 'transfer_out' OR existing.folio_id IS DISTINCT FROM _source_folio_id THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      SELECT * INTO in_txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND transfer_id = existing.transfer_id AND transfer_direction = 'in';
      RETURN jsonb_build_object(
        'transfer_id', existing.transfer_id,
        'transfer_out_id', existing.id,
        'transfer_in_id', in_txn.id
      );
    END IF;
  END IF;

  SELECT * INTO source_folio FROM public.guest_folios
  WHERE id = _source_folio_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF source_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  SELECT * INTO target_folio FROM public.guest_folios
  WHERE id = _target_folio_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF target_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  SELECT * INTO source_line FROM public.folio_transactions
  WHERE id = _source_transaction_id
    AND restaurant_id = _restaurant_id
    AND folio_id = source_folio.id;
  IF NOT FOUND OR source_line.transaction_type <> 'charge' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;

  remainder := public.transferable_charge_remainder(_restaurant_id, source_line.id);
  IF remainder IS NULL OR _amount > remainder + 0.001 THEN
    RAISE EXCEPTION 'TRANSFER_EXCEEDS_REMAINDER';
  END IF;

  SELECT * INTO target_window FROM public.guest_folio_windows
  WHERE id = _target_window_id AND restaurant_id = _restaurant_id AND folio_id = target_folio.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_WINDOW_NOT_FOUND';
  END IF;

  PERFORM public.ensure_primary_folio_window(_restaurant_id, source_folio.id);

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id, idempotency_key,
    original_transaction_id, folio_window_id, transfer_id, transfer_direction
  ) VALUES (
    _restaurant_id, source_folio.id, 'transfer_out', 'transfer', clean_desc, -round(_amount, 2),
    'folio_transfer', transfer, _membership_id, clean_key,
    source_line.id, source_line.folio_window_id, transfer, 'out'
  ) RETURNING * INTO out_txn;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id,
    original_transaction_id, folio_window_id, transfer_id, transfer_direction
  ) VALUES (
    _restaurant_id, target_folio.id, 'transfer_in', 'transfer', clean_desc, round(_amount, 2),
    'folio_transfer', transfer, _membership_id,
    source_line.id, target_window.id, transfer, 'in'
  ) RETURNING * INTO in_txn;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, source_folio.id, 'folio_transfer_out', _membership_id, clean_desc,
    jsonb_build_object('transfer_id', transfer, 'amount', _amount, 'target_folio_id', target_folio.id)
  );
  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, target_folio.id, 'folio_transfer_in', _membership_id, clean_desc,
    jsonb_build_object('transfer_id', transfer, 'amount', _amount, 'source_folio_id', source_folio.id)
  );

  RETURN jsonb_build_object(
    'transfer_id', transfer,
    'transfer_out_id', out_txn.id,
    'transfer_in_id', in_txn.id
  );
END;
$$;

ALTER TABLE public.folio_history DROP CONSTRAINT IF EXISTS folio_history_event_check;
ALTER TABLE public.folio_history ADD CONSTRAINT folio_history_event_check CHECK (
  event_type = ANY (ARRAY[
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received',
    'deposit_received','refund_posted','adjustment_posted','discount_posted',
    'folio_closed','cashier_shift_opened','cashier_shift_closed',
    'restaurant_charge_posted','restaurant_charge_reversed',
    'checkout_unsettled_exception','folio_transfer_out','folio_transfer_in'
  ])
);

GRANT EXECUTE ON FUNCTION public.ensure_primary_folio_window(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transferable_charge_remainder(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_transfer(uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, text) TO authenticated, service_role;

-- Ensure every guest folio has a primary window at open (and when reusing an existing folio).
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

  SELECT currency_code INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;

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

  IF charge_amount > 0 AND NOT EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
  ) THEN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id, folio_window_id
    ) VALUES (
      _restaurant_id, folio.id, 'charge', 'room',
      'Room charge — reservation ' || res.confirmation_number, charge_amount,
      'reservation_room_charge', res.id, _membership_id, primary_window
    );

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'room_charge_posted',
      jsonb_build_object('reservation_id', res.id, 'amount', charge_amount,
                         'currency', folio.currency, 'nightly', res.nightly_rate_snapshot),
      _membership_id
    );
  END IF;

  RETURN folio;
END;
$$;
