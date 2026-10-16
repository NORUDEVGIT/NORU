-- Cashiering Phase 10 — extended settlement for financial accounts and write-offs.
-- Dual-lane with supabase/migrations/0130_cashiering_phase10_extended_settlement.sql.

CREATE OR REPLACE FUNCTION public.close_financial_account(
  _restaurant_id uuid,
  _account_id uuid,
  _membership_id uuid
) RETURNS public.financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  bal numeric(12,2);
BEGIN
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status = 'closed' THEN RETURN acct; END IF;

  bal := public.financial_account_balance(_restaurant_id, acct.id);
  IF abs(bal) >= 0.01 THEN
    RAISE EXCEPTION 'BALANCE_NOT_ZERO';
  END IF;

  UPDATE public.financial_accounts
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE id = acct.id
  RETURNING * INTO acct;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, NULL, 'financial_account_closed', _membership_id,
    'Financial account closed at zero balance',
    jsonb_build_object('financial_account_id', acct.id, 'account_number', acct.account_number)
  );

  RETURN acct;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_settlement_write_off(
  _restaurant_id uuid,
  _folio_id uuid DEFAULT NULL,
  _account_id uuid DEFAULT NULL,
  _amount numeric DEFAULT NULL,
  _reason text DEFAULT NULL,
  _membership_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS public.folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  bal numeric(12,2);
  signed numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;
  IF (_folio_id IS NULL) = (_account_id IS NULL) THEN
    RAISE EXCEPTION 'WRITE_OFF_TARGET_REQUIRED';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN RETURN txn; END IF;
  END IF;

  IF _folio_id IS NOT NULL THEN
    SELECT * INTO folio FROM public.guest_folios
    WHERE id = _folio_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
    IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO bal
    FROM public.folio_transactions WHERE folio_id = folio.id;
    IF _amount IS NULL OR _amount <= 0 OR _amount > bal + 0.001 THEN
      RAISE EXCEPTION 'INVALID_WRITE_OFF_AMOUNT';
    END IF;
    signed := -round(_amount, 2);
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, posted_by_membership_id, idempotency_key
    ) VALUES (
      _restaurant_id, folio.id, 'adjustment', 'adjustment',
      'Settlement write-off: ' || clean_reason, signed,
      'settlement_write_off', _membership_id, clean_key
    ) RETURNING * INTO txn;
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, folio.id, 'settlement_write_off', _membership_id, clean_reason,
      jsonb_build_object('amount', _amount, 'transaction_id', txn.id)
    );
    RETURN txn;
  END IF;

  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
  bal := public.financial_account_balance(_restaurant_id, acct.id);
  IF _amount IS NULL OR _amount <= 0 OR _amount > bal + 0.001 THEN
    RAISE EXCEPTION 'INVALID_WRITE_OFF_AMOUNT';
  END IF;
  signed := -round(_amount, 2);
  INSERT INTO public.folio_transactions (
    restaurant_id, financial_account_id, transaction_type, category, description, amount,
    reference_type, posted_by_membership_id, idempotency_key
  ) VALUES (
    _restaurant_id, acct.id, 'adjustment', 'adjustment',
    'Settlement write-off: ' || clean_reason, signed,
    'settlement_write_off', _membership_id, clean_key
  ) RETURNING * INTO txn;
  RETURN txn;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_financial_account(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_settlement_write_off(uuid, uuid, uuid, numeric, text, uuid, text) TO authenticated, service_role;
