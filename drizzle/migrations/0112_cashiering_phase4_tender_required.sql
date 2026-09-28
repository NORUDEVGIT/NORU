-- Cashiering Phase 4 — a payment, deposit, or refund must store a method.
-- Dual-lane with supabase/migrations/0112_cashiering_phase4_tender_required.sql.
-- Tax is not calculated here. The signed amount is the entered amount.

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

  IF _type IN ('payment','deposit','refund') AND clean_method IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED';
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
  'Append-only guest folio post. A repeated idempotency key returns the original row. A source pointer does not change the source line amount. Payment, deposit, and refund require a method. The entered amount is stored with no tax calculation.';

