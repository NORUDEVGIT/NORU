-- Cashiering Phase 9 — deposit allocation lifecycle (derived unallocated remainder).
-- Dual-lane with supabase/migrations/0129_cashiering_phase9_deposit_allocations.sql.

CREATE TABLE IF NOT EXISTS public.folio_deposit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  deposit_transaction_id uuid NOT NULL,
  charge_transaction_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  idempotency_key text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folio_deposit_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT folio_deposit_allocations_key_check CHECK (
    idempotency_key IS NULL OR (char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 80)
  ),
  CONSTRAINT folio_deposit_allocations_deposit_same_property
    FOREIGN KEY (deposit_transaction_id, restaurant_id)
    REFERENCES public.folio_transactions (id, restaurant_id),
  CONSTRAINT folio_deposit_allocations_charge_same_property
    FOREIGN KEY (charge_transaction_id, restaurant_id)
    REFERENCES public.folio_transactions (id, restaurant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS folio_deposit_allocations_idempotency_key
  ON public.folio_deposit_allocations (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.folio_deposit_allocations IS
  'Allocates a deposit credit line to a charge line. Unallocated = deposit credit − allocations − linked deposit refunds.';

GRANT SELECT, INSERT ON public.folio_deposit_allocations TO authenticated;
GRANT ALL ON public.folio_deposit_allocations TO service_role;
ALTER TABLE public.folio_deposit_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read deposit allocations" ON public.folio_deposit_allocations;
CREATE POLICY "Managers read deposit allocations" ON public.folio_deposit_allocations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert deposit allocations" ON public.folio_deposit_allocations;
CREATE POLICY "Managers insert deposit allocations" ON public.folio_deposit_allocations
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.deposit_unallocated_remainder(
  _restaurant_id uuid,
  _deposit_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dep public.folio_transactions%ROWTYPE;
  credit numeric(12,2);
  allocated numeric(12,2);
  refunded numeric(12,2);
BEGIN
  SELECT * INTO dep FROM public.folio_transactions
  WHERE id = _deposit_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR dep.transaction_type <> 'deposit' THEN
    RETURN NULL;
  END IF;
  credit := round(-dep.amount, 2);
  SELECT COALESCE(sum(amount), 0) INTO allocated
  FROM public.folio_deposit_allocations
  WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = dep.id;
  SELECT COALESCE(sum(amount), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND transaction_type = 'refund'
    AND original_transaction_id = dep.id;
  RETURN round(credit - allocated - refunded, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_folio_deposit(
  _restaurant_id uuid,
  _deposit_transaction_id uuid,
  _charge_transaction_id uuid,
  _amount numeric,
  _membership_id uuid,
  _idempotency_key text
) RETURNS public.folio_deposit_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dep public.folio_transactions%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
  remainder numeric(12,2);
  row public.folio_deposit_allocations%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO row FROM public.folio_deposit_allocations
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN RETURN row; END IF;
  END IF;

  SELECT * INTO dep FROM public.folio_transactions
  WHERE id = _deposit_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR dep.transaction_type <> 'deposit' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_DEPOSIT';
  END IF;

  SELECT * INTO charge FROM public.folio_transactions
  WHERE id = _charge_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR charge.transaction_type <> 'charge' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;
  IF dep.folio_id IS DISTINCT FROM charge.folio_id THEN
    RAISE EXCEPTION 'ALLOCATION_SAME_FOLIO_ONLY';
  END IF;

  remainder := public.deposit_unallocated_remainder(_restaurant_id, dep.id);
  IF remainder IS NULL OR _amount > remainder + 0.001 THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_UNALLOCATED';
  END IF;

  INSERT INTO public.folio_deposit_allocations (
    restaurant_id, deposit_transaction_id, charge_transaction_id, amount,
    idempotency_key, actor_membership_id
  ) VALUES (
    _restaurant_id, dep.id, charge.id, round(_amount, 2),
    clean_key, _membership_id
  ) RETURNING * INTO row;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, dep.folio_id, 'deposit_allocated', _membership_id,
    'Deposit allocated to charge',
    jsonb_build_object(
      'deposit_transaction_id', dep.id,
      'charge_transaction_id', charge.id,
      'amount', _amount
    )
  );

  RETURN row;
END;
$$;

ALTER TABLE public.folio_history DROP CONSTRAINT IF EXISTS folio_history_event_check;
ALTER TABLE public.folio_history ADD CONSTRAINT folio_history_event_check CHECK (
  event_type = ANY (ARRAY[
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received',
    'deposit_received','refund_posted','adjustment_posted','discount_posted',
    'folio_closed','cashier_shift_opened','cashier_shift_closed',
    'restaurant_charge_posted','restaurant_charge_reversed',
    'checkout_unsettled_exception','folio_transfer_out','folio_transfer_in',
    'deposit_allocated','settlement_write_off','financial_account_closed'
  ])
);

GRANT EXECUTE ON FUNCTION public.deposit_unallocated_remainder(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_folio_deposit(uuid, uuid, uuid, numeric, uuid, text) TO authenticated, service_role;
