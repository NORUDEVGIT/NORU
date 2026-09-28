-- Cashiering Phase 0 — financial safety on the existing guest ledger.
-- Dual-lane with supabase/migrations/0110_cashiering_phase0_ledger_safety.sql.
--
-- Does not add a mutable balance column on guest folios. Balance remains sum(folio_transactions.amount).
-- Does not add a second ledger, company folio, or city-ledger table.
-- Does not change close_cashier_shift / restaurant expected_cash.
-- close_guest_folio is unchanged and still raises BALANCE_NOT_ZERO unless abs(sum(amount)) < 0.01.
--
-- Break-glass: folio_transactions_no_mutation fires for every role, including
-- service_role (RLS bypass does not skip triggers). The only operational bypass
-- is a database owner running
--   ALTER TABLE public.folio_transactions DISABLE TRIGGER folio_transactions_no_mutation;
-- The application has no UPDATE or DELETE of folio_transactions.

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.folio_transactions.idempotency_key IS
  'User-triggered post replay key. Null for system posts (room charge, restaurant order). Unique per property when set.';

CREATE UNIQUE INDEX IF NOT EXISTS folio_transactions_idempotency_key
  ON public.folio_transactions (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.guest_folios
  ADD COLUMN IF NOT EXISTS settlement_exception text,
  ADD COLUMN IF NOT EXISTS settlement_exception_kind text,
  ADD COLUMN IF NOT EXISTS settlement_exception_reason text,
  ADD COLUMN IF NOT EXISTS settlement_exception_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_exception_amount numeric(12,2);

ALTER TABLE public.guest_folios
  DROP CONSTRAINT IF EXISTS guest_folios_settlement_exception_check;
ALTER TABLE public.guest_folios
  ADD CONSTRAINT guest_folios_settlement_exception_check CHECK (
    settlement_exception IS NULL OR settlement_exception = 'unsettled_checkout'
  );

ALTER TABLE public.guest_folios
  DROP CONSTRAINT IF EXISTS guest_folios_settlement_exception_kind_check;
ALTER TABLE public.guest_folios
  ADD CONSTRAINT guest_folios_settlement_exception_kind_check CHECK (
    settlement_exception_kind IS NULL OR settlement_exception_kind IN ('unpaid', 'credit')
  );

COMMENT ON COLUMN public.guest_folios.settlement_exception IS
  'Checkout left this folio open. Not a stored balance and not a settled flag. Clear only by a later zero-balance close, which does not rewrite ledger lines.';
COMMENT ON COLUMN public.guest_folios.settlement_exception_amount IS
  'Derived balance snapshot at the moment of the unsettled checkout. Not a live folio balance and not maintained afterward.';

ALTER TABLE public.folio_history DROP CONSTRAINT IF EXISTS folio_history_event_check;
ALTER TABLE public.folio_history ADD CONSTRAINT folio_history_event_check CHECK (
  event_type = ANY (ARRAY[
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received',
    'deposit_received','refund_posted','adjustment_posted','discount_posted',
    'folio_closed','cashier_shift_opened','cashier_shift_closed',
    'restaurant_charge_posted','restaurant_charge_reversed',
    'checkout_unsettled_exception'
  ])
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
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folio_transactions_no_mutation ON public.folio_transactions;
CREATE TRIGGER folio_transactions_no_mutation
  BEFORE UPDATE OR DELETE ON public.folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.folio_transactions_immutable();

COMMENT ON FUNCTION public.folio_transactions_immutable() IS
  'Blocks changes to committed folio lines, including payment_method. No column is legally mutable. service_role is not exempt.';

-- Replace the 9-arg poster so payment_method and idempotency_key are insert-time only.
DROP FUNCTION IF EXISTS public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid);

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
  _idempotency_key text DEFAULT NULL
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
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
      reference_type, reference_id, posted_by_membership_id, payment_method, idempotency_key
    ) VALUES (
      _restaurant_id, folio.id, _type, _category, clean_desc, signed,
      _reference_type, _reference_id, _membership_id, clean_method, clean_key
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
                       'idempotency_key', clean_key),
    clean_desc, _membership_id
  );

  RETURN txn;
END;
$$;

REVOKE ALL ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.post_folio_transaction(uuid, uuid, text, text, text, numeric, text, uuid, uuid, text, text) IS
  'Append-only guest folio post. payment_method is written on insert. A repeated idempotency_key returns the original row and does not insert again.';
