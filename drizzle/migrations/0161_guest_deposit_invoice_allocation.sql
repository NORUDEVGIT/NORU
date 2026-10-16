-- A guest deposit can settle an issued invoice without becoming a new payment.
-- Charge allocations already tied to that invoice count once. Applied amounts
-- reduce the refundable remainder until they are released.
-- Dual-lane with drizzle/migrations/0161_guest_deposit_invoice_allocation.sql.

ALTER TABLE public.folio_history DROP CONSTRAINT IF EXISTS folio_history_event_check;
ALTER TABLE public.folio_history ADD CONSTRAINT folio_history_event_check CHECK (
  event_type = ANY (ARRAY[
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received',
    'deposit_received','refund_posted','adjustment_posted','discount_posted',
    'folio_closed','cashier_shift_opened','cashier_shift_closed',
    'restaurant_charge_posted','restaurant_charge_reversed',
    'checkout_unsettled_exception','folio_transfer_out','folio_transfer_in',
    'deposit_allocated','settlement_write_off','financial_account_closed',
    'invoice_issued','invoice_reprinted',
    'cross_ledger_transfer_out','cross_ledger_transfer_in',
    'invoice_draft_created','invoice_draft_updated','invoice_draft_deleted',
    'credit_note_issued','debit_note_issued',
    'guest_payment_allocated','guest_payment_allocation_reversed',
    'guest_deposit_allocated','guest_deposit_allocation_reversed'
  ])
);

CREATE TABLE IF NOT EXISTS public.guest_deposit_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  guest_folio_id uuid NOT NULL,
  deposit_transaction_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  reverses_allocation_id uuid,
  operation_id uuid NOT NULL,
  idempotency_key text,
  reason text,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_deposit_invoice_allocations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_deposit_invoice_allocations_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT guest_deposit_invoice_allocations_sign CHECK (
    (amount > 0 AND reverses_allocation_id IS NULL)
    OR (
      amount < 0
      AND reverses_allocation_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL
    )
  ),
  CONSTRAINT guest_deposit_invoice_allocations_key_length CHECK (
    idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 80
  ),
  CONSTRAINT guest_deposit_invoice_allocations_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 500
  ),
  CONSTRAINT guest_deposit_invoice_allocations_folio_property
    FOREIGN KEY (guest_folio_id, restaurant_id)
    REFERENCES public.guest_folios (id, restaurant_id),
  CONSTRAINT guest_deposit_invoice_allocations_deposit_property
    FOREIGN KEY (deposit_transaction_id, restaurant_id)
    REFERENCES public.folio_transactions (id, restaurant_id),
  CONSTRAINT guest_deposit_invoice_allocations_invoice_property
    FOREIGN KEY (invoice_id, restaurant_id)
    REFERENCES public.guest_folio_invoices (id, restaurant_id),
  CONSTRAINT guest_deposit_invoice_allocations_reversal_property
    FOREIGN KEY (reverses_allocation_id, restaurant_id)
    REFERENCES public.guest_deposit_invoice_allocations (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS guest_deposit_invoice_allocations_folio_idx
  ON public.guest_deposit_invoice_allocations (guest_folio_id);
CREATE INDEX IF NOT EXISTS guest_deposit_invoice_allocations_deposit_idx
  ON public.guest_deposit_invoice_allocations (deposit_transaction_id);
CREATE INDEX IF NOT EXISTS guest_deposit_invoice_allocations_invoice_idx
  ON public.guest_deposit_invoice_allocations (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS guest_deposit_invoice_allocations_idempotency
  ON public.guest_deposit_invoice_allocations (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guest_deposit_invoice_allocations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ALLOCATION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guest_deposit_invoice_allocations_no_mutation
  ON public.guest_deposit_invoice_allocations;
CREATE TRIGGER guest_deposit_invoice_allocations_no_mutation
  BEFORE UPDATE OR DELETE ON public.guest_deposit_invoice_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guest_deposit_invoice_allocations_immutable();

ALTER TABLE public.guest_deposit_invoice_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cashiering staff read guest deposit allocations"
  ON public.guest_deposit_invoice_allocations;
CREATE POLICY "Cashiering staff read guest deposit allocations"
  ON public.guest_deposit_invoice_allocations FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

GRANT SELECT ON public.guest_deposit_invoice_allocations TO authenticated;
GRANT ALL ON public.guest_deposit_invoice_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.guest_invoice_deposit_cover(
  _restaurant_id uuid,
  _invoice_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invoice_net numeric(12,2);
  charge_net numeric(12,2);
  charge_ids uuid[];
BEGIN
  SELECT COALESCE(round(sum(amount), 2), 0) INTO invoice_net
  FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = _invoice_id;

  SELECT COALESCE(array_agg(DISTINCT parent_id), ARRAY[]::uuid[]) INTO charge_ids
  FROM (
    SELECT (group_row->>'parentTransactionId')::uuid AS parent_id
    FROM public.guest_folio_invoices inv
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(inv.snapshot->'groups', '[]'::jsonb)) group_row
    WHERE inv.id = _invoice_id
      AND inv.restaurant_id = _restaurant_id
      AND group_row->>'parentTransactionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) ids;

  SELECT COALESCE(round(sum(amount), 2), 0) INTO charge_net
  FROM public.folio_deposit_allocations
  WHERE restaurant_id = _restaurant_id
    AND charge_transaction_id = ANY(charge_ids);

  RETURN round(COALESCE(invoice_net, 0) + COALESCE(charge_net, 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.guest_invoice_deposit_cover(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_invoice_deposit_cover(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.preview_guest_deposit_invoice_allocation(
  _restaurant_id uuid,
  _folio_id uuid,
  _deposit_id uuid,
  _targets jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  dep public.folio_transactions%ROWTYPE;
  item jsonb;
  inv public.guest_folio_invoices%ROWTYPE;
  face numeric(12,2);
  refunded numeric(12,2);
  charge_held numeric(12,2);
  invoice_held numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  payment_allocated numeric(12,2);
  effective_net numeric(12,2);
  outstanding numeric(12,2);
  proposed numeric(12,2);
  operation_total numeric(12,2) := 0;
  seen uuid[] := ARRAY[]::uuid[];
  lines jsonb := '[]'::jsonb;
  inv_currency text;
  invoice_id uuid;
BEGIN
  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) = 0 THEN
    RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID';
  END IF;
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  SELECT * INTO dep FROM public.folio_transactions
  WHERE id = _deposit_id AND restaurant_id = _restaurant_id AND folio_id = folio.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO'; END IF;
  IF dep.transaction_type IS DISTINCT FROM 'deposit' OR dep.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_GUEST_DEPOSIT';
  END IF;
  face := round(-dep.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    AND transaction_type = 'refund' AND original_transaction_id = dep.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO charge_held
  FROM public.folio_deposit_allocations
  WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = dep.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO invoice_held
  FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = dep.id;
  available := round(face - refunded - charge_held - invoice_held, 2);
  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    proposed := round(COALESCE((item->>'amount')::numeric, 0), 2);
    IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
    invoice_id := (item->>'invoiceId')::uuid;
    IF invoice_id = ANY(seen) THEN RAISE EXCEPTION 'ALLOCATION_DUPLICATE_TARGET'; END IF;
    seen := array_append(seen, invoice_id);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.folio_id IS DISTINCT FROM folio.id THEN
      RAISE EXCEPTION 'ALLOCATION_FOLIO_MISMATCH';
    END IF;
    IF inv.coverage_scope = 'legacy_folio' THEN
      RAISE EXCEPTION 'LEGACY_INVOICE_ALLOCATION_UNSUPPORTED';
    END IF;
    IF inv.coverage_scope IS DISTINCT FROM 'charge_groups'
      OR inv.issued_number IS NULL
      OR inv.snapshot IS NULL
      OR inv.snapshot->'totals'->>'invoiceTotal' IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(
      NULLIF(inv.snapshot->'property'->>'currencyCode', ''),
      NULLIF(inv.snapshot->'folio'->>'currency', '')
    );
    IF inv_currency IS NULL OR inv_currency IS DISTINCT FROM folio.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round((inv.snapshot->'totals'->>'invoiceTotal')::numeric, 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND guest_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO payment_allocated
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND guest_payment_invoice_allocations.invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(
      effective_net - payment_allocated - public.guest_invoice_deposit_cover(_restaurant_id, inv.id),
      2
    );
    operation_total := round(operation_total + proposed, 2);
    lines := lines || jsonb_build_array(jsonb_build_object(
      'invoiceId', inv.id,
      'invoiceNumber', inv.issued_number,
      'issuedAt', inv.issued_at,
      'effectiveNet', effective_net,
      'allocated', payment_allocated,
      'outstanding', outstanding,
      'proposed', proposed,
      'remainingOutstanding', round(outstanding - proposed, 2)
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'payment', jsonb_build_object(
      'id', dep.id, 'face', face, 'refunded', refunded,
      'allocated', round(charge_held + invoice_held, 2),
      'available', available, 'currency', folio.currency
    ),
    'targets', lines,
    'operationTotal', operation_total,
    'remainingAvailable', round(available - operation_total, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_guest_deposit_invoice_allocation(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_guest_deposit_invoice_allocation(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_guest_deposit_invoice_allocations(
  _restaurant_id uuid,
  _folio_id uuid,
  _deposit_id uuid,
  _targets jsonb,
  _expected_available numeric,
  _idempotency_key text,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  dep public.folio_transactions%ROWTYPE;
  anchor public.guest_deposit_invoice_allocations%ROWTYPE;
  inv public.guest_folio_invoices%ROWTYPE;
  item jsonb;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  invoice_ids uuid[] := ARRAY[]::uuid[];
  invoice_id uuid;
  proposed numeric(12,2);
  expected_outstanding numeric(12,2);
  face numeric(12,2);
  refunded numeric(12,2);
  charge_held numeric(12,2);
  invoice_held numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  payment_allocated numeric(12,2);
  effective_net numeric(12,2);
  outstanding numeric(12,2);
  operation_total numeric(12,2) := 0;
  op_id uuid;
  seen uuid[] := ARRAY[]::uuid[];
  inv_currency text;
BEGIN
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) = 0 THEN
    RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID';
  END IF;
  IF _expected_available IS NULL THEN RAISE EXCEPTION 'ALLOCATION_STALE'; END IF;

  SELECT * INTO anchor FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF anchor.amount < 0
      OR anchor.guest_folio_id IS DISTINCT FROM _folio_id
      OR anchor.deposit_transaction_id IS DISTINCT FROM _deposit_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'operationId', anchor.operation_id);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    proposed := round(COALESCE((item->>'amount')::numeric, 0), 2);
    IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
    IF item->>'expectedOutstanding' IS NULL THEN RAISE EXCEPTION 'ALLOCATION_STALE'; END IF;
    invoice_id := (item->>'invoiceId')::uuid;
    IF invoice_id = ANY(seen) THEN RAISE EXCEPTION 'ALLOCATION_DUPLICATE_TARGET'; END IF;
    seen := array_append(seen, invoice_id);
    operation_total := round(operation_total + proposed, 2);
  END LOOP;
  SELECT COALESCE(array_agg(val ORDER BY val), ARRAY[]::uuid[]) INTO invoice_ids
  FROM unnest(seen) AS t(val);

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  SELECT * INTO dep FROM public.folio_transactions
  WHERE id = _deposit_id AND restaurant_id = _restaurant_id AND folio_id = folio.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO'; END IF;
  IF dep.transaction_type IS DISTINCT FROM 'deposit' OR dep.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_GUEST_DEPOSIT';
  END IF;

  PERFORM inv_lock.id FROM public.guest_folio_invoices inv_lock
  WHERE inv_lock.restaurant_id = _restaurant_id AND inv_lock.id = ANY(invoice_ids)
  ORDER BY inv_lock.id
  FOR UPDATE;

  face := round(-dep.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    AND transaction_type = 'refund' AND original_transaction_id = dep.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO charge_held
  FROM public.folio_deposit_allocations
  WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = dep.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO invoice_held
  FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = dep.id;
  available := round(face - refunded - charge_held - invoice_held, 2);
  IF abs(available - round(_expected_available, 2)) > 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_STALE';
  END IF;
  IF operation_total > available + 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_DEPOSIT';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    invoice_id := (item->>'invoiceId')::uuid;
    proposed := round((item->>'amount')::numeric, 2);
    expected_outstanding := round((item->>'expectedOutstanding')::numeric, 2);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.folio_id IS DISTINCT FROM folio.id THEN
      RAISE EXCEPTION 'ALLOCATION_FOLIO_MISMATCH';
    END IF;
    IF inv.coverage_scope = 'legacy_folio' THEN
      RAISE EXCEPTION 'LEGACY_INVOICE_ALLOCATION_UNSUPPORTED';
    END IF;
    IF inv.coverage_scope IS DISTINCT FROM 'charge_groups'
      OR inv.issued_number IS NULL
      OR inv.snapshot IS NULL
      OR inv.snapshot->'totals'->>'invoiceTotal' IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(
      NULLIF(inv.snapshot->'property'->>'currencyCode', ''),
      NULLIF(inv.snapshot->'folio'->>'currency', '')
    );
    IF inv_currency IS NULL OR inv_currency IS DISTINCT FROM folio.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round((inv.snapshot->'totals'->>'invoiceTotal')::numeric, 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND guest_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO payment_allocated
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND guest_payment_invoice_allocations.invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(
      effective_net - payment_allocated - public.guest_invoice_deposit_cover(_restaurant_id, inv.id),
      2
    );
    IF abs(outstanding - expected_outstanding) > 0.01 THEN
      RAISE EXCEPTION 'ALLOCATION_STALE';
    END IF;
    IF proposed > outstanding + 0.01 THEN
      RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE';
    END IF;
  END LOOP;

  op_id := gen_random_uuid();
  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    invoice_id := (item->>'invoiceId')::uuid;
    proposed := round((item->>'amount')::numeric, 2);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    INSERT INTO public.guest_deposit_invoice_allocations (
      restaurant_id, guest_folio_id, deposit_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, folio.id, dep.id, invoice_id, proposed,
      NULL, op_id,
      CASE WHEN invoice_id = invoice_ids[1] THEN clean_key ELSE NULL END,
      NULL, _membership_id
    );
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, folio.id, 'guest_deposit_allocated', _membership_id,
      'Deposit allocated to ' || inv.issued_number,
      jsonb_build_object(
        'deposit_transaction_id', dep.id,
        'invoice_id', inv.id,
        'invoice_number', inv.issued_number,
        'amount', proposed,
        'operation_id', op_id
      )
    );
  END LOOP;

  RETURN jsonb_build_object('replayed', false, 'operationId', op_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO anchor FROM public.guest_deposit_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF NOT FOUND OR anchor.amount < 0
      OR anchor.guest_folio_id IS DISTINCT FROM _folio_id
      OR anchor.deposit_transaction_id IS DISTINCT FROM _deposit_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'operationId', anchor.operation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_guest_deposit_invoice_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_guest_deposit_invoice_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_excess_guest_deposit_invoice_allocation(
  _restaurant_id uuid,
  _invoice_id uuid,
  _projected_net numeric,
  _note_number text,
  _membership_id uuid,
  _idempotency_key text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  active numeric(12,2);
  needed numeric(12,2);
  alloc public.guest_deposit_invoice_allocations%ROWTYPE;
  reversed numeric(12,2);
  remaining numeric(12,2);
  take numeric(12,2);
  reason text;
  op_id uuid;
  release_key text;
BEGIN
  SELECT COALESCE(round(sum(amount), 2), 0) INTO active
  FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = _invoice_id;
  needed := round(active - COALESCE(_projected_net, 0), 2);
  IF needed <= 0.01 THEN RETURN 0; END IF;

  FOR alloc IN
    SELECT *
    FROM public.guest_deposit_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND invoice_id = _invoice_id
      AND amount > 0
      AND reverses_allocation_id IS NULL
    ORDER BY created_at DESC, id
    FOR UPDATE
  LOOP
    EXIT WHEN needed <= 0.01;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO reversed
    FROM public.guest_deposit_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND reverses_allocation_id = alloc.id;
    remaining := round(alloc.amount + reversed, 2);
    IF remaining <= 0.01 THEN CONTINUE; END IF;
    take := LEAST(remaining, needed);
    reason := left('Released for credit note ' || COALESCE(_note_number, ''), 500);
    op_id := gen_random_uuid();
    release_key := CASE
      WHEN _idempotency_key IS NULL THEN NULL
      ELSE left('cnrel-d:' || alloc.id::text || ':' || _idempotency_key, 80)
    END;
    INSERT INTO public.guest_deposit_invoice_allocations (
      restaurant_id, guest_folio_id, deposit_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, alloc.guest_folio_id, alloc.deposit_transaction_id, alloc.invoice_id,
      -take, alloc.id, op_id, release_key, reason, _membership_id
    );
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, alloc.guest_folio_id, 'guest_deposit_allocation_reversed', _membership_id,
      reason,
      jsonb_build_object(
        'deposit_transaction_id', alloc.deposit_transaction_id,
        'invoice_id', alloc.invoice_id,
        'allocation_id', alloc.id,
        'amount', -take,
        'reason', reason,
        'operation_id', op_id
      )
    );
    needed := round(needed - take, 2);
  END LOOP;

  IF needed > 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE_NET:%:%:%',
      'ETB',
      to_char(active, 'FM999999990.00'),
      to_char(needed, 'FM999999990.00');
  END IF;
  RETURN round(active - COALESCE(_projected_net, 0), 2);
END;
$$;

REVOKE ALL ON FUNCTION public.release_excess_guest_deposit_invoice_allocation(uuid, uuid, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_excess_guest_deposit_invoice_allocation(uuid, uuid, numeric, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_guest_invoice_settlement_excess()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  guest public.guest_folio_invoices%ROWTYPE;
  original_total numeric(12,2);
  existing_delta numeric(12,2);
  projected numeric(12,2);
  pay_active numeric(12,2);
  deposit_active numeric(12,2);
  excess numeric(12,2);
  pay_release numeric(12,2);
  deposit_release numeric(12,2);
  release_key text;
BEGIN
  IF NEW.note_type IS DISTINCT FROM 'credit' OR NEW.guest_invoice_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO guest FROM public.guest_folio_invoices
  WHERE id = NEW.guest_invoice_id AND restaurant_id = NEW.restaurant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  original_total := round(COALESCE((guest.snapshot->'totals'->>'invoiceTotal')::numeric, 0), 2);
  SELECT COALESCE(round(sum(total_delta), 2), 0) INTO existing_delta
  FROM public.invoice_credit_notes
  WHERE restaurant_id = NEW.restaurant_id AND guest_invoice_id = NEW.guest_invoice_id;
  projected := round(original_total + existing_delta + COALESCE(NEW.total_delta, 0), 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO pay_active
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = NEW.restaurant_id AND invoice_id = NEW.guest_invoice_id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO deposit_active
  FROM public.guest_deposit_invoice_allocations
  WHERE restaurant_id = NEW.restaurant_id AND invoice_id = NEW.guest_invoice_id;
  excess := round(pay_active + deposit_active - projected, 2);
  IF excess <= 0.01 THEN RETURN NEW; END IF;
  pay_release := LEAST(excess, pay_active);
  deposit_release := round(excess - pay_release, 2);
  release_key := left(COALESCE(NEW.idempotency_key, NEW.id::text) || ':cov', 80);
  IF pay_release > 0.01 THEN
    PERFORM public.release_excess_guest_invoice_allocation(
      NEW.restaurant_id,
      NEW.guest_invoice_id,
      round(pay_active - pay_release, 2),
      NEW.note_number,
      NEW.issued_by_membership_id,
      release_key
    );
  END IF;
  IF deposit_release > 0.01 THEN
    PERFORM public.release_excess_guest_deposit_invoice_allocation(
      NEW.restaurant_id,
      NEW.guest_invoice_id,
      round(deposit_active - deposit_release, 2),
      NEW.note_number,
      NEW.issued_by_membership_id,
      release_key
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_credit_notes_deposit_release ON public.invoice_credit_notes;
CREATE TRIGGER invoice_credit_notes_deposit_release
  BEFORE INSERT ON public.invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.release_guest_invoice_settlement_excess();

REVOKE ALL ON FUNCTION public.release_guest_invoice_settlement_excess() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_guest_invoice_settlement_excess() TO service_role;

-- Payment allocation outstanding now leaves room for deposit cover.
CREATE OR REPLACE FUNCTION public.preview_guest_payment_invoice_allocation(
  _restaurant_id uuid,
  _folio_id uuid,
  _payment_id uuid,
  _targets jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  item jsonb;
  inv public.guest_folio_invoices%ROWTYPE;
  face numeric(12,2);
  refunded numeric(12,2);
  allocated numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  inv_allocated numeric(12,2);
  effective_net numeric(12,2);
  outstanding numeric(12,2);
  proposed numeric(12,2);
  operation_total numeric(12,2) := 0;
  seen uuid[] := ARRAY[]::uuid[];
  lines jsonb := '[]'::jsonb;
  inv_currency text;
  invoice_id uuid;
BEGIN
  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) = 0 THEN
    RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID';
  END IF;
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = _payment_id AND restaurant_id = _restaurant_id AND folio_id = folio.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO'; END IF;
  IF pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_GUEST_PAYMENT';
  END IF;
  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND payment_transaction_id = pay.id;
  available := round(face - refunded - allocated, 2);
  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    proposed := round(COALESCE((item->>'amount')::numeric, 0), 2);
    IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
    invoice_id := (item->>'invoiceId')::uuid;
    IF invoice_id = ANY(seen) THEN RAISE EXCEPTION 'ALLOCATION_DUPLICATE_TARGET'; END IF;
    seen := array_append(seen, invoice_id);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.folio_id IS DISTINCT FROM folio.id THEN
      RAISE EXCEPTION 'ALLOCATION_FOLIO_MISMATCH';
    END IF;
    IF inv.coverage_scope = 'legacy_folio' THEN
      RAISE EXCEPTION 'LEGACY_INVOICE_ALLOCATION_UNSUPPORTED';
    END IF;
    IF inv.coverage_scope IS DISTINCT FROM 'charge_groups'
      OR inv.issued_number IS NULL
      OR inv.snapshot IS NULL
      OR inv.snapshot->'totals'->>'invoiceTotal' IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(
      NULLIF(inv.snapshot->'property'->>'currencyCode', ''),
      NULLIF(inv.snapshot->'folio'->>'currency', '')
    );
    IF inv_currency IS NULL OR inv_currency IS DISTINCT FROM folio.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round((inv.snapshot->'totals'->>'invoiceTotal')::numeric, 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND guest_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND guest_payment_invoice_allocations.invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(effective_net - inv_allocated - public.guest_invoice_deposit_cover(_restaurant_id, inv.id), 2);
    operation_total := round(operation_total + proposed, 2);
    lines := lines || jsonb_build_array(jsonb_build_object(
      'invoiceId', inv.id,
      'invoiceNumber', inv.issued_number,
      'issuedAt', inv.issued_at,
      'effectiveNet', effective_net,
      'allocated', inv_allocated,
      'outstanding', outstanding,
      'proposed', proposed,
      'remainingOutstanding', round(outstanding - proposed, 2)
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'payment', jsonb_build_object(
      'id', pay.id, 'face', face, 'refunded', refunded, 'allocated', allocated,
      'available', available, 'currency', folio.currency
    ),
    'targets', lines,
    'operationTotal', operation_total,
    'remainingAvailable', round(available - operation_total, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_guest_payment_invoice_allocation(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_guest_payment_invoice_allocation(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_guest_payment_invoice_allocations(
  _restaurant_id uuid,
  _folio_id uuid,
  _payment_id uuid,
  _targets jsonb,
  _expected_available numeric,
  _idempotency_key text,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  anchor public.guest_payment_invoice_allocations%ROWTYPE;
  inv public.guest_folio_invoices%ROWTYPE;
  item jsonb;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  invoice_ids uuid[] := ARRAY[]::uuid[];
  invoice_id uuid;
  proposed numeric(12,2);
  expected_outstanding numeric(12,2);
  face numeric(12,2);
  refunded numeric(12,2);
  allocated numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  inv_allocated numeric(12,2);
  effective_net numeric(12,2);
  outstanding numeric(12,2);
  operation_total numeric(12,2) := 0;
  op_id uuid;
  seen uuid[] := ARRAY[]::uuid[];
  inv_currency text;
  matched integer;
BEGIN
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) = 0 THEN
    RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID';
  END IF;
  IF _expected_available IS NULL THEN RAISE EXCEPTION 'ALLOCATION_STALE'; END IF;

  SELECT * INTO anchor FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF anchor.amount < 0
      OR anchor.guest_folio_id IS DISTINCT FROM _folio_id
      OR anchor.payment_transaction_id IS DISTINCT FROM _payment_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT count(*) INTO matched
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND operation_id = anchor.operation_id;
    IF matched IS DISTINCT FROM jsonb_array_length(_targets) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.guest_payment_invoice_allocations existing
        WHERE existing.restaurant_id = _restaurant_id
          AND existing.operation_id = anchor.operation_id
          AND existing.invoice_id = (item->>'invoiceId')::uuid
          AND existing.amount = round((item->>'amount')::numeric, 2)
      ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
    END LOOP;
    RETURN jsonb_build_object(
      'replayed', true,
      'operationId', anchor.operation_id,
      'rows', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', row.id, 'invoiceId', row.invoice_id, 'amount', row.amount, 'operationId', row.operation_id
        ) ORDER BY row.invoice_id), '[]'::jsonb)
        FROM public.guest_payment_invoice_allocations row
        WHERE row.restaurant_id = _restaurant_id AND row.operation_id = anchor.operation_id
      )
    );
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    proposed := round(COALESCE((item->>'amount')::numeric, 0), 2);
    IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
    IF item->>'expectedOutstanding' IS NULL THEN RAISE EXCEPTION 'ALLOCATION_STALE'; END IF;
    invoice_id := (item->>'invoiceId')::uuid;
    IF invoice_id = ANY(seen) THEN RAISE EXCEPTION 'ALLOCATION_DUPLICATE_TARGET'; END IF;
    seen := array_append(seen, invoice_id);
    operation_total := round(operation_total + proposed, 2);
  END LOOP;
  SELECT COALESCE(array_agg(val ORDER BY val), ARRAY[]::uuid[]) INTO invoice_ids
  FROM unnest(seen) AS t(val);

  -- Lock order: 1 guest_folios, 2 payment folio_transactions, 3 invoices by id.
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = _payment_id AND restaurant_id = _restaurant_id AND folio_id = folio.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO'; END IF;
  IF pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_GUEST_PAYMENT';
  END IF;

  PERFORM inv_lock.id FROM public.guest_folio_invoices inv_lock
  WHERE inv_lock.restaurant_id = _restaurant_id AND inv_lock.id = ANY(invoice_ids)
  ORDER BY inv_lock.id
  FOR UPDATE;

  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND payment_transaction_id = pay.id;
  available := round(face - refunded - allocated, 2);
  IF abs(available - round(_expected_available, 2)) > 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_STALE';
  END IF;
  IF operation_total > available + 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_PAYMENT';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    invoice_id := (item->>'invoiceId')::uuid;
    proposed := round((item->>'amount')::numeric, 2);
    expected_outstanding := round((item->>'expectedOutstanding')::numeric, 2);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.folio_id IS DISTINCT FROM folio.id THEN
      RAISE EXCEPTION 'ALLOCATION_FOLIO_MISMATCH';
    END IF;
    IF inv.coverage_scope = 'legacy_folio' THEN
      RAISE EXCEPTION 'LEGACY_INVOICE_ALLOCATION_UNSUPPORTED';
    END IF;
    IF inv.coverage_scope IS DISTINCT FROM 'charge_groups'
      OR inv.issued_number IS NULL
      OR inv.snapshot IS NULL
      OR inv.snapshot->'totals'->>'invoiceTotal' IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(
      NULLIF(inv.snapshot->'property'->>'currencyCode', ''),
      NULLIF(inv.snapshot->'folio'->>'currency', '')
    );
    IF inv_currency IS NULL OR inv_currency IS DISTINCT FROM folio.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round((inv.snapshot->'totals'->>'invoiceTotal')::numeric, 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND guest_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND guest_payment_invoice_allocations.invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(effective_net - inv_allocated - public.guest_invoice_deposit_cover(_restaurant_id, inv.id), 2);
    IF abs(outstanding - expected_outstanding) > 0.01 THEN
      RAISE EXCEPTION 'ALLOCATION_STALE';
    END IF;
    IF proposed > outstanding + 0.01 THEN
      RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE';
    END IF;
  END LOOP;

  op_id := gen_random_uuid();
  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    invoice_id := (item->>'invoiceId')::uuid;
    proposed := round((item->>'amount')::numeric, 2);
    SELECT * INTO inv FROM public.guest_folio_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    INSERT INTO public.guest_payment_invoice_allocations (
      restaurant_id, guest_folio_id, payment_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, folio.id, pay.id, invoice_id, proposed,
      NULL, op_id,
      CASE WHEN invoice_id = invoice_ids[1] THEN clean_key ELSE NULL END,
      NULL, _membership_id
    );
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, folio.id, 'guest_payment_allocated', _membership_id,
      'Payment allocated to ' || inv.issued_number,
      jsonb_build_object(
        'payment_transaction_id', pay.id,
        'invoice_id', inv.id,
        'invoice_number', inv.issued_number,
        'amount', proposed,
        'operation_id', op_id
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'replayed', false,
    'operationId', op_id,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', row.id, 'invoiceId', row.invoice_id, 'amount', row.amount, 'operationId', row.operation_id
      ) ORDER BY row.invoice_id), '[]'::jsonb)
      FROM public.guest_payment_invoice_allocations row
      WHERE row.operation_id = op_id
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO anchor FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF NOT FOUND OR anchor.amount < 0
      OR anchor.guest_folio_id IS DISTINCT FROM _folio_id
      OR anchor.payment_transaction_id IS DISTINCT FROM _payment_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT count(*) INTO matched
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND operation_id = anchor.operation_id;
    IF matched IS DISTINCT FROM jsonb_array_length(_targets) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.guest_payment_invoice_allocations existing
        WHERE existing.restaurant_id = _restaurant_id
          AND existing.operation_id = anchor.operation_id
          AND existing.invoice_id = (item->>'invoiceId')::uuid
          AND existing.amount = round((item->>'amount')::numeric, 2)
      ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
    END LOOP;
    RETURN jsonb_build_object(
      'replayed', true,
      'operationId', anchor.operation_id,
      'rows', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', row.id, 'invoiceId', row.invoice_id, 'amount', row.amount, 'operationId', row.operation_id
        ) ORDER BY row.invoice_id), '[]'::jsonb)
        FROM public.guest_payment_invoice_allocations row
        WHERE row.restaurant_id = _restaurant_id AND row.operation_id = anchor.operation_id
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_guest_payment_invoice_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_guest_payment_invoice_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) TO service_role;

-- A deposit applied to a charge or an invoice cannot be refunded until that application is released.
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
  allocated numeric(12,2) := 0;
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
    allocated := 0;
    IF source.transaction_type = 'payment' THEN
      SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
      FROM public.guest_payment_invoice_allocations
      WHERE restaurant_id = _restaurant_id
        AND payment_transaction_id = source.id;
    ELSIF source.transaction_type = 'deposit' THEN
      SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
      FROM (
        SELECT amount FROM public.folio_deposit_allocations
        WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = source.id
        UNION ALL
        SELECT amount FROM public.guest_deposit_invoice_allocations
        WHERE restaurant_id = _restaurant_id AND deposit_transaction_id = source.id
      ) held;
    END IF;
    IF round(_amount, 2) > round(-source.amount - linked - allocated, 2) + 0.001 THEN
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
