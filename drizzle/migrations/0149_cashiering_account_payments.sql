-- Company and group cash payments and cash refunds stamp the actor's open
-- hotel cashier shift inside this post. Refunds must name a payment or deposit
-- on the same account and cannot exceed what that source still has left.
-- No new tables. Account deposits are not stamped and have no new workflow.
-- hotel_drawer_figures already sums every stamped cash payment, deposit, and
-- refund on the shift, so this migration does not replace it.

CREATE OR REPLACE FUNCTION public.post_financial_account_transaction(
  _restaurant_id uuid,
  _account_id uuid,
  _type text,
  _category text,
  _description text,
  _amount numeric,
  _membership_id uuid,
  _payment_method text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _original_transaction_id uuid DEFAULT NULL
) RETURNS public.folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  source public.folio_transactions%ROWTYPE;
  signed numeric(12,2);
  linked numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  shift_id uuid := NULL;
  source_id uuid := _original_transaction_id;
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_method text := NULLIF(btrim(COALESCE(_payment_method, '')), '');
BEGIN
  IF _type NOT IN ('charge','payment','deposit','refund','adjustment','discount') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;
  IF clean_desc IS NULL THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;

  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF txn.financial_account_id IS DISTINCT FROM acct.id OR txn.transaction_type IS DISTINCT FROM _type THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN txn;
    END IF;
  END IF;

  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;

  IF _type IN ('payment','deposit') THEN
    source_id := NULL;
    IF clean_method IS NULL THEN RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED'; END IF;
    IF clean_method NOT IN ('cash','card','bank_transfer','mobile_money','other') THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
    END IF;
  END IF;

  IF _type = 'refund' THEN
    IF source_id IS NULL THEN RAISE EXCEPTION 'SOURCE_REQUIRED'; END IF;
    SELECT * INTO source FROM public.folio_transactions
    WHERE id = source_id
      AND restaurant_id = _restaurant_id
      AND financial_account_id = acct.id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_ACCOUNT'; END IF;
    IF source.transaction_type NOT IN ('payment','deposit') THEN
      RAISE EXCEPTION 'SOURCE_NOT_A_PAYMENT';
    END IF;
    IF source.payment_method IS NULL
      OR source.payment_method NOT IN ('cash','card','bank_transfer','mobile_money','other') THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED';
    END IF;
    IF clean_method IS NOT NULL AND clean_method IS DISTINCT FROM source.payment_method THEN
      RAISE EXCEPTION 'REFUND_METHOD_MISMATCH';
    END IF;
    clean_method := source.payment_method;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO linked
    FROM public.folio_transactions
    WHERE financial_account_id = acct.id
      AND transaction_type = 'refund'
      AND original_transaction_id = source.id;
    IF round(_amount, 2) > round(-source.amount - linked, 2) + 0.001 THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_SOURCE';
    END IF;
  END IF;

  IF _type = 'adjustment' THEN
    signed := _amount;
  ELSE
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := CASE _type
      WHEN 'charge' THEN _amount WHEN 'refund' THEN _amount ELSE -_amount END;
  END IF;

  IF clean_method = 'cash' AND _type IN ('payment','refund') THEN
    SELECT id INTO shift_id FROM public.hotel_cashier_shifts
    WHERE restaurant_id = _restaurant_id
      AND membership_id = _membership_id
      AND status = 'open'
    LIMIT 1;
  END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, financial_account_id, transaction_type, category, description, amount,
    posted_by_membership_id, payment_method, idempotency_key, original_transaction_id,
    hotel_cashier_shift_id
  ) VALUES (
    _restaurant_id, acct.id, _type, _category, clean_desc, round(signed, 2),
    _membership_id, clean_method, clean_key, source_id, shift_id
  ) RETURNING * INTO txn;
  RETURN txn;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_financial_account_transaction(uuid, uuid, text, text, text, numeric, uuid, text, text, uuid) TO authenticated, service_role;
