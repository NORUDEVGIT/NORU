-- Cashiering Phase 8 — company / group / master financial accounts.
-- Dual-lane with supabase/migrations/0128_cashiering_phase8_financial_accounts.sql.
-- Not a relabel of Guest Profile aggregates. No stored balance.

CREATE TABLE IF NOT EXISTS public.financial_account_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_account_counters TO authenticated;
GRANT ALL ON public.financial_account_counters TO service_role;
ALTER TABLE public.financial_account_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read financial account counters" ON public.financial_account_counters;
CREATE POLICY "Managers read financial account counters" ON public.financial_account_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  master_id uuid NOT NULL,
  account_kind text NOT NULL,
  account_number text NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_accounts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT financial_accounts_number_unique UNIQUE (restaurant_id, account_number),
  CONSTRAINT financial_accounts_kind_check CHECK (account_kind IN ('company','group','master')),
  CONSTRAINT financial_accounts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT financial_accounts_master_same_property FOREIGN KEY (master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_one_per_master
  ON public.financial_accounts (restaurant_id, master_id);

COMMENT ON TABLE public.financial_accounts IS
  'Real billing account for a company, group, or master. Balance is sum(folio_transactions) where financial_account_id is set.';

GRANT SELECT, INSERT, UPDATE ON public.financial_accounts TO authenticated;
GRANT ALL ON public.financial_accounts TO service_role;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read financial accounts" ON public.financial_accounts;
CREATE POLICY "Managers read financial accounts" ON public.financial_accounts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert financial accounts" ON public.financial_accounts;
CREATE POLICY "Managers insert financial accounts" ON public.financial_accounts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update financial accounts" ON public.financial_accounts;
CREATE POLICY "Managers update financial accounts" ON public.financial_accounts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_financial_accounts_updated_at BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.financial_account_participants (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL,
  guest_folio_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (financial_account_id, guest_folio_id),
  CONSTRAINT financial_account_participants_account_same_property
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT financial_account_participants_folio_same_property
    FOREIGN KEY (guest_folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id) ON DELETE CASCADE
);

COMMENT ON TABLE public.financial_account_participants IS
  'Links a master billing account to participant guest folios. Does not close participant folios when master closes.';

GRANT SELECT, INSERT, DELETE ON public.financial_account_participants TO authenticated;
GRANT ALL ON public.financial_account_participants TO service_role;
ALTER TABLE public.financial_account_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read financial account participants" ON public.financial_account_participants;
CREATE POLICY "Managers read financial account participants" ON public.financial_account_participants
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert financial account participants" ON public.financial_account_participants;
CREATE POLICY "Managers insert financial account participants" ON public.financial_account_participants
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete financial account participants" ON public.financial_account_participants;
CREATE POLICY "Managers delete financial account participants" ON public.financial_account_participants
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS financial_account_id uuid;

ALTER TABLE public.folio_transactions
  ALTER COLUMN folio_id DROP NOT NULL;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_account_same_property;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_account_same_property
  FOREIGN KEY (financial_account_id, restaurant_id)
  REFERENCES public.financial_accounts (id, restaurant_id);

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_target_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_target_check CHECK (
    (folio_id IS NOT NULL AND financial_account_id IS NULL)
    OR (folio_id IS NULL AND financial_account_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.financial_account_balance(
  _restaurant_id uuid,
  _account_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(round(sum(amount), 2), 0)
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND financial_account_id = _account_id;
$$;

CREATE OR REPLACE FUNCTION public.open_financial_account(
  _restaurant_id uuid,
  _master_id uuid,
  _account_kind text,
  _currency text,
  _membership_id uuid
) RETURNS public.financial_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  master public.guest_account_masters%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  next_num bigint;
  acct_no text;
BEGIN
  IF _account_kind NOT IN ('company','group','master') THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_KIND';
  END IF;
  SELECT * INTO master FROM public.guest_account_masters
  WHERE id = _master_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MASTER_NOT_FOUND';
  END IF;
  SELECT * INTO acct FROM public.financial_accounts
  WHERE restaurant_id = _restaurant_id AND master_id = _master_id;
  IF FOUND THEN
    RETURN acct;
  END IF;
  INSERT INTO public.financial_account_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_number = public.financial_account_counters.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO next_num;
  acct_no := 'FA-' || lpad(next_num::text, 6, '0');
  INSERT INTO public.financial_accounts (
    restaurant_id, master_id, account_kind, account_number, currency, created_by_membership_id
  ) VALUES (
    _restaurant_id, _master_id, _account_kind, acct_no, _currency, _membership_id
  ) RETURNING * INTO acct;
  RETURN acct;
END;
$$;

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
  signed numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_method text := NULLIF(btrim(COALESCE(_payment_method, '')), '');
BEGIN
  IF _type NOT IN ('charge','payment','deposit','refund','adjustment','discount') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;
  IF clean_desc IS NULL THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;

  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;

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

  IF _type = 'adjustment' THEN
    signed := _amount;
  ELSE
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := CASE _type
      WHEN 'charge' THEN _amount WHEN 'refund' THEN _amount ELSE -_amount END;
  END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, financial_account_id, transaction_type, category, description, amount,
    posted_by_membership_id, payment_method, idempotency_key, original_transaction_id
  ) VALUES (
    _restaurant_id, acct.id, _type, _category, clean_desc, round(signed, 2),
    _membership_id, clean_method, clean_key, _original_transaction_id
  ) RETURNING * INTO txn;
  RETURN txn;
END;
$$;

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
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.financial_account_balance(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_financial_account(uuid, uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_financial_account_transaction(uuid, uuid, text, text, text, numeric, uuid, text, text, uuid) TO authenticated, service_role;
