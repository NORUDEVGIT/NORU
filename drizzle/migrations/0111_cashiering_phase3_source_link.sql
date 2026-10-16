-- Cashiering Phase 3 — source link on an existing guest-ledger line.
-- Dual-lane with supabase/migrations/0111_cashiering_phase3_source_link.sql.
--
-- Adds original_transaction_id. A refund, adjustment, discount, or room-charge
-- reversal may point at another line on the same folio and property.
-- The original row is not updated. Balance remains sum(amount).

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS original_transaction_id uuid;

COMMENT ON COLUMN public.folio_transactions.original_transaction_id IS
  'Optional source line for a refund, adjustment, discount, or room-charge reversal. Same folio and property. Null when no source was chosen. Not a second copy of the amount.';

CREATE UNIQUE INDEX IF NOT EXISTS folio_transactions_identity_folio
  ON public.folio_transactions (id, restaurant_id, folio_id);

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_original_same_folio;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_original_same_folio
  FOREIGN KEY (original_transaction_id, restaurant_id, folio_id)
  REFERENCES public.folio_transactions (id, restaurant_id, folio_id);

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_original_not_self;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_original_not_self CHECK (
    original_transaction_id IS NULL OR original_transaction_id <> id
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
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text);

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

  IF _original_transaction_id IS NOT NULL AND _type NOT IN ('refund','adjustment','discount') THEN
    RAISE EXCEPTION 'SOURCE_NOT_ALLOWED';
  END IF;

  IF _original_transaction_id IS NOT NULL THEN
    SELECT * INTO source FROM public.folio_transactions
    WHERE id = _original_transaction_id
      AND restaurant_id = _restaurant_id
      AND folio_id = folio.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO';
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

  BEGIN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id, payment_method, idempotency_key,
      original_transaction_id
    ) VALUES (
      _restaurant_id, folio.id, _type, _category, clean_desc, signed,
      _reference_type, _reference_id, _membership_id, clean_method, clean_key,
      _original_transaction_id
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
  'Append-only guest folio post. A repeated idempotency key returns the original row. A source pointer does not change the source line amount.';

CREATE OR REPLACE FUNCTION public.reverse_order_room_charge(
  _restaurant_id uuid, _order_id uuid, _reason text, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  original public.folio_transactions%ROWTYPE;
  reversal public.folio_transactions%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED'; END IF;

  SELECT * INTO ord FROM public.orders
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF ord.room_charge_folio_id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  SELECT * INTO original FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND reference_type = 'restaurant_order' AND reference_id = ord.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  IF EXISTS (SELECT 1 FROM public.folio_transactions
             WHERE restaurant_id = _restaurant_id
               AND reference_type = 'restaurant_order_reversal' AND reference_id = ord.id) THEN
    RAISE EXCEPTION 'CHARGE_ALREADY_REVERSED';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = ord.room_charge_folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id, original_transaction_id
  ) VALUES (
    _restaurant_id, folio.id, 'adjustment', 'restaurant',
    'Reversal — Restaurant Order #' || ord.order_number || ' (' || clean_reason || ')',
    -original.amount, 'restaurant_order_reversal', ord.id, _membership_id, original.id
  ) RETURNING * INTO reversal;

  UPDATE public.orders SET
    billing_method = 'direct',
    room_charge_folio_id = NULL,
    room_charge_reservation_id = NULL,
    room_charge_posted_at = NULL,
    room_charge_posted_by_membership_id = NULL,
    updated_at = now()
  WHERE id = ord.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'restaurant_charge_reversed',
    jsonb_build_object('transaction_id', original.id, 'amount', original.amount),
    jsonb_build_object('order_id', ord.id, 'order_number', ord.order_number,
                       'reversal_transaction_id', reversal.id, 'amount', reversal.amount,
                       'original_transaction_id', original.id),
    clean_reason, _membership_id
  );

  RETURN jsonb_build_object('order_id', ord.id, 'reversal_transaction_id', reversal.id, 'amount', reversal.amount);
END;
$$;
