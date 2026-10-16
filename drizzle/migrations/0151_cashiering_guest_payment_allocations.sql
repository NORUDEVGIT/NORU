-- Guest payment allocation against issued charge-group guest invoices.
-- Allocation classifies a posted guest payment. It does not insert folio_transactions,
-- change the folio balance, tender receipts, cashier shifts, or folio_deposit_allocations.
-- Deposits are not invoice settlement. legacy_folio invoices are rejected.
-- Lock order: guest_folios, payment folio_transactions, guest_folio_invoices by id.
-- The idempotency key is stored on the lowest invoice id row.
-- Guest credit-note issuance still does not check guest_folios.status. That existing
-- gap is left unchanged; this migration only adds the allocation net guard.
-- Dual-lane with drizzle/migrations/0151_cashiering_guest_payment_allocations.sql.

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
    'guest_payment_allocated','guest_payment_allocation_reversed'
  ])
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_folio_invoices_id_restaurant
  ON public.guest_folio_invoices (id, restaurant_id);

CREATE TABLE public.guest_payment_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  guest_folio_id uuid NOT NULL,
  payment_transaction_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  reverses_allocation_id uuid,
  operation_id uuid NOT NULL,
  idempotency_key text,
  reason text,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_payment_invoice_allocations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_payment_invoice_allocations_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT guest_payment_invoice_allocations_sign CHECK (
    (amount > 0 AND reverses_allocation_id IS NULL)
    OR (
      amount < 0
      AND reverses_allocation_id IS NOT NULL
      AND NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL
    )
  ),
  CONSTRAINT guest_payment_invoice_allocations_key_length CHECK (
    idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 80
  ),
  CONSTRAINT guest_payment_invoice_allocations_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 500
  ),
  CONSTRAINT guest_payment_invoice_allocations_folio_property
    FOREIGN KEY (guest_folio_id, restaurant_id)
    REFERENCES public.guest_folios (id, restaurant_id),
  CONSTRAINT guest_payment_invoice_allocations_payment_property
    FOREIGN KEY (payment_transaction_id, restaurant_id)
    REFERENCES public.folio_transactions (id, restaurant_id),
  CONSTRAINT guest_payment_invoice_allocations_invoice_property
    FOREIGN KEY (invoice_id, restaurant_id)
    REFERENCES public.guest_folio_invoices (id, restaurant_id),
  CONSTRAINT guest_payment_invoice_allocations_reversal_property
    FOREIGN KEY (reverses_allocation_id, restaurant_id)
    REFERENCES public.guest_payment_invoice_allocations (id, restaurant_id)
);

CREATE INDEX guest_payment_invoice_allocations_folio_idx
  ON public.guest_payment_invoice_allocations (guest_folio_id);
CREATE INDEX guest_payment_invoice_allocations_payment_idx
  ON public.guest_payment_invoice_allocations (payment_transaction_id);
CREATE INDEX guest_payment_invoice_allocations_invoice_idx
  ON public.guest_payment_invoice_allocations (invoice_id);
CREATE INDEX guest_payment_invoice_allocations_operation_idx
  ON public.guest_payment_invoice_allocations (operation_id);
CREATE UNIQUE INDEX guest_payment_invoice_allocations_idempotency
  ON public.guest_payment_invoice_allocations (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.guest_payment_invoice_allocations IS
  'Classifies a posted guest payment against issued charge-group invoices. Does not move the folio ledger.';

CREATE OR REPLACE FUNCTION public.guest_payment_invoice_allocations_immutable()
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

DROP TRIGGER IF EXISTS guest_payment_invoice_allocations_no_mutation
  ON public.guest_payment_invoice_allocations;
CREATE TRIGGER guest_payment_invoice_allocations_no_mutation
  BEFORE UPDATE OR DELETE ON public.guest_payment_invoice_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guest_payment_invoice_allocations_immutable();

ALTER TABLE public.guest_payment_invoice_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cashiering staff read guest payment allocations"
  ON public.guest_payment_invoice_allocations;
CREATE POLICY "Cashiering staff read guest payment allocations"
  ON public.guest_payment_invoice_allocations FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

GRANT SELECT ON public.guest_payment_invoice_allocations TO authenticated;
GRANT ALL ON public.guest_payment_invoice_allocations TO service_role;


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
    outstanding := round(effective_net - inv_allocated, 2);
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
    outstanding := round(effective_net - inv_allocated, 2);
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


CREATE OR REPLACE FUNCTION public.reverse_guest_payment_invoice_allocation(
  _restaurant_id uuid,
  _allocation_id uuid,
  _reason text,
  _idempotency_key text,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  original public.guest_payment_invoice_allocations%ROWTYPE;
  anchor public.guest_payment_invoice_allocations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  inv public.guest_folio_invoices%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  reversed numeric(12,2);
  remaining numeric(12,2);
  op_id uuid;
  created public.guest_payment_invoice_allocations%ROWTYPE;
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  SELECT * INTO anchor FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF anchor.amount < 0 AND anchor.reverses_allocation_id = _allocation_id THEN
      RETURN jsonb_build_object(
        'replayed', true, 'id', anchor.id, 'amount', anchor.amount, 'operationId', anchor.operation_id
      );
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
  END IF;

  SELECT * INTO original FROM public.guest_payment_invoice_allocations
  WHERE id = _allocation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
  IF original.amount <= 0 OR original.reverses_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_REVERSIBLE';
  END IF;

  -- Lock order: 1 guest_folios, 2 payment folio_transactions, 3 invoice.
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = original.guest_folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  PERFORM 1 FROM public.folio_transactions
  WHERE id = original.payment_transaction_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  SELECT * INTO inv FROM public.guest_folio_invoices
  WHERE id = original.invoice_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  SELECT COALESCE(round(sum(amount), 2), 0) INTO reversed
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND reverses_allocation_id = original.id;
  remaining := round(original.amount + reversed, 2);
  IF remaining <= 0.01 THEN RAISE EXCEPTION 'ALLOCATION_ALREADY_REVERSED'; END IF;

  op_id := gen_random_uuid();
  INSERT INTO public.guest_payment_invoice_allocations (
    restaurant_id, guest_folio_id, payment_transaction_id, invoice_id, amount,
    reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
  ) VALUES (
    _restaurant_id, original.guest_folio_id, original.payment_transaction_id, original.invoice_id,
    -remaining, original.id, op_id, clean_key, clean_reason, _membership_id
  ) RETURNING * INTO created;
  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, original.guest_folio_id, 'guest_payment_allocation_reversed', _membership_id,
    'Allocation reversed for ' || inv.issued_number,
    jsonb_build_object(
      'payment_transaction_id', original.payment_transaction_id,
      'invoice_id', inv.id,
      'invoice_number', inv.issued_number,
      'amount', created.amount,
      'allocation_id', original.id,
      'reason', clean_reason,
      'operation_id', op_id
    )
  );
  RETURN jsonb_build_object(
    'replayed', false, 'id', created.id, 'amount', created.amount, 'operationId', created.operation_id
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO anchor FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND AND anchor.amount < 0 AND anchor.reverses_allocation_id = _allocation_id THEN
      RETURN jsonb_build_object(
        'replayed', true, 'id', anchor.id, 'amount', anchor.amount, 'operationId', anchor.operation_id
      );
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_guest_payment_invoice_allocation(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_guest_payment_invoice_allocation(uuid, uuid, text, text, uuid) TO service_role;

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

CREATE OR REPLACE FUNCTION public.issue_invoice_credit_note_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid,
  _idempotency_key text DEFAULT NULL
) RETURNS public.invoice_credit_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  existing public.invoice_credit_notes%ROWTYPE;
  note public.invoice_credit_notes%ROWTYPE;
  guest public.guest_folio_invoices%ROWTYPE;
  acct_invoice public.financial_account_invoices%ROWTYPE;
  requested jsonb;
  plan jsonb;
  line jsonb;
  txn public.folio_transactions%ROWTYPE;
  ledger_id uuid;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  draft_found boolean := false;
  next_seq integer;
  issued_num text;
  snap jsonb;
  issuer_name text;
  currency text;
  bill_to text;
  original_total numeric;
  previous numeric;
  prior_debits numeric := 0;
  keyed boolean := false;
  folio_for_history uuid;
  account_for_history uuid;
BEGIN
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  draft_found := FOUND;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF existing.note_type IS DISTINCT FROM 'credit'
        OR (
          draft_found AND (
            existing.guest_invoice_id IS DISTINCT FROM draft.guest_invoice_id
            OR existing.account_invoice_id IS DISTINCT FROM draft.account_invoice_id
          )
        )
      THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN existing;
    END IF;
  END IF;

  IF NOT draft_found THEN
    RAISE EXCEPTION 'CREDIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  IF draft.note_type IS DISTINCT FROM 'credit' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_DRAFT_NOT_FOUND';
  END IF;

  IF draft.guest_invoice_id IS NOT NULL THEN
    SELECT * INTO guest FROM public.guest_folio_invoices
    WHERE id = draft.guest_invoice_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND';
    END IF;
    IF guest.issued_number IS NULL THEN
      RAISE EXCEPTION 'INVOICE_NOT_ISSUED';
    END IF;
    folio_for_history := guest.folio_id;
  ELSE
    SELECT * INTO acct_invoice FROM public.financial_account_invoices
    WHERE id = draft.account_invoice_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND';
    END IF;
    IF acct_invoice.issued_number IS NULL THEN
      RAISE EXCEPTION 'INVOICE_NOT_ISSUED';
    END IF;
    account_for_history := acct_invoice.financial_account_id;
  END IF;

  PERFORM 1 FROM public.invoice_credit_notes notes
  WHERE notes.restaurant_id = _restaurant_id
    AND notes.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND notes.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id
  FOR UPDATE;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sourceGroupId', draft_items.source_group_id,
    'gross', draft_items.requested_gross
  ) ORDER BY draft_items.created_at), '[]'::jsonb)
  INTO requested
  FROM public.invoice_credit_note_draft_items draft_items
  WHERE draft_items.draft_id = draft.id;
  IF requested IS NULL OR jsonb_array_length(requested) = 0 THEN
    RAISE EXCEPTION 'CREDIT_NOTE_DRAFT_EMPTY';
  END IF;

  plan := public.plan_invoice_credit(
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, requested
  );
  IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(plan->>'code', 'INVOICE_ITEM_NOT_CREDITABLE');
  END IF;

  INSERT INTO public.pms_credit_note_counters (restaurant_id, last_sequence)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;
  SELECT last_sequence INTO next_seq FROM public.pms_credit_note_counters
  WHERE restaurant_id = _restaurant_id
  FOR UPDATE;
  next_seq := next_seq + 1;
  UPDATE public.pms_credit_note_counters
  SET last_sequence = next_seq, updated_at = now()
  WHERE restaurant_id = _restaurant_id;
  issued_num := 'CN-' || lpad(next_seq::text, 6, '0');

  SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
  INTO issuer_name
  FROM public.restaurant_users ru
  LEFT JOIN public.profiles p ON p.id = ru.user_id
  WHERE ru.id = _membership_id;

  IF draft.guest_invoice_id IS NOT NULL THEN
    currency := COALESCE(guest.snapshot->'property'->>'currencyCode', guest.snapshot->'folio'->>'currency', 'ETB');
    bill_to := COALESCE(guest.snapshot->'folio'->>'guestName', 'Guest');
    original_total := round(COALESCE(
      (guest.snapshot->'totals'->>'invoiceTotal')::numeric,
      (guest.snapshot->'totals'->>'balance')::numeric,
      0
    ), 2);
  ELSE
    currency := COALESCE(acct_invoice.snapshot->'property'->>'currencyCode', acct_invoice.snapshot->'account'->>'currency', 'ETB');
    bill_to := COALESCE(acct_invoice.snapshot->'billTo'->>'name', 'Account');
    original_total := round(COALESCE(
      (acct_invoice.snapshot->'totals'->>'invoiceTotal')::numeric,
      (acct_invoice.snapshot->'totals'->>'balance')::numeric,
      0
    ), 2);
  END IF;
  SELECT COALESCE(round(sum(lines.credited_amount), 2), 0) INTO previous
  FROM public.invoice_credit_note_lines lines
  JOIN public.invoice_credit_notes prior ON prior.id = lines.credit_note_id
  WHERE prior.restaurant_id = _restaurant_id
    AND prior.note_type = 'credit'
    AND prior.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND prior.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id;
  SELECT COALESCE(round(sum(prior.total_delta), 2), 0) INTO prior_debits
  FROM public.invoice_credit_notes prior
  WHERE prior.restaurant_id = _restaurant_id
    AND prior.note_type = 'debit'
    AND prior.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND prior.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id;


  IF account_for_history IS NOT NULL THEN
    DECLARE
      active_alloc numeric;
      projected_net numeric;
      credit_total numeric;
      existing_note_delta numeric;
    BEGIN
      credit_total := round((plan->>'total')::numeric, 2);
      SELECT COALESCE(round(sum(prior.total_delta), 2), 0) INTO existing_note_delta
      FROM public.invoice_credit_notes prior
      WHERE prior.restaurant_id = _restaurant_id
        AND prior.account_invoice_id = acct_invoice.id;
      projected_net := round(original_total + existing_note_delta - credit_total, 2);
      SELECT COALESCE(round(sum(alloc.amount), 2), 0) INTO active_alloc
      FROM public.financial_account_payment_allocations alloc
      WHERE alloc.restaurant_id = _restaurant_id
        AND alloc.invoice_id = acct_invoice.id;
      IF projected_net < active_alloc - 0.01 THEN
        RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE_NET:%:%:%',
          currency,
          to_char(active_alloc, 'FM999999990.00'),
          to_char(round(active_alloc - projected_net, 2), 'FM999999990.00');
      END IF;
    END;
  END IF;

  IF draft.guest_invoice_id IS NOT NULL THEN
    DECLARE
      guest_active_alloc numeric;
      guest_projected_net numeric;
      guest_credit_total numeric;
      guest_note_delta numeric;
    BEGIN
      guest_credit_total := round((plan->>'total')::numeric, 2);
      SELECT COALESCE(round(sum(prior.total_delta), 2), 0) INTO guest_note_delta
      FROM public.invoice_credit_notes prior
      WHERE prior.restaurant_id = _restaurant_id
        AND prior.guest_invoice_id = guest.id;
      guest_projected_net := round(original_total + guest_note_delta - guest_credit_total, 2);
      SELECT COALESCE(round(sum(alloc.amount), 2), 0) INTO guest_active_alloc
      FROM public.guest_payment_invoice_allocations alloc
      WHERE alloc.restaurant_id = _restaurant_id
        AND alloc.invoice_id = guest.id;
      IF guest_projected_net < guest_active_alloc - 0.01 THEN
        RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE_NET:%:%:%',
          currency,
          to_char(guest_active_alloc, 'FM999999990.00'),
          to_char(round(guest_active_alloc - guest_projected_net, 2), 'FM999999990.00');
      END IF;
    END;
  END IF;

  snap := jsonb_build_object(
    'version', 1,
    'noteType', 'credit',
    'target', CASE WHEN draft.guest_invoice_id IS NOT NULL THEN 'guest_folio_invoice' ELSE 'financial_account_invoice' END,
    'issuedAt', now(),
    'document', jsonb_build_object(
      'noteNumber', issued_num,
      'sequenceNumber', next_seq,
      'reason', draft.reason,
      'issuedByName', issuer_name,
      'originalInvoiceNumber', COALESCE(guest.issued_number, acct_invoice.issued_number),
      'currency', currency
    ),
    'billTo', jsonb_build_object('name', bill_to),
    'groups', plan->'groups',
    'lines', plan->'lines',
    'totals', jsonb_build_object(
      'subtotal', plan->'subtotal',
      'tax', plan->'tax',
      'serviceCharge', plan->'serviceCharge',
      'totalCredit', plan->'total',
      'originalInvoice', original_total,
      'previousCredits', previous,
      'previousDebits', prior_debits,
      'netInvoice', round(original_total - previous + prior_debits - (plan->>'total')::numeric, 2)
    )
  );

  INSERT INTO public.invoice_credit_notes (
    restaurant_id, guest_invoice_id, account_invoice_id, folio_id, financial_account_id,
    note_number, sequence_number, currency, reason,
    subtotal_delta, tax_delta, service_charge_delta, total_delta,
    snapshot, issued_by_membership_id, idempotency_key
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id,
    folio_for_history, account_for_history,
    issued_num, next_seq, currency, draft.reason,
    -round((plan->>'subtotal')::numeric, 2),
    -round((plan->>'tax')::numeric, 2),
    -round((plan->>'serviceCharge')::numeric, 2),
    -round((plan->>'total')::numeric, 2),
    snap, _membership_id, clean_key
  ) RETURNING * INTO note;

  FOR line IN SELECT value FROM jsonb_array_elements(plan->'lines') LOOP
    IF round(COALESCE((line->>'credited')::numeric, 0), 2) <= 0 THEN
      CONTINUE;
    END IF;
    SELECT * INTO txn FROM public.folio_transactions
    WHERE id = (line->>'componentTransactionId')::uuid AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_ITEM_NOT_CREDITABLE';
    END IF;
    IF txn.folio_id IS NOT NULL THEN
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id, folio_window_id
      ) VALUES (
        _restaurant_id, txn.folio_id, 'adjustment', 'adjustment',
        'Credit note ' || issued_num,
        -round((line->>'credited')::numeric, 2),
        'invoice_credit_note', note.id, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        txn.id, txn.folio_window_id
      ) RETURNING id INTO ledger_id;
    ELSIF txn.financial_account_id IS NOT NULL THEN
      INSERT INTO public.folio_transactions (
        restaurant_id, financial_account_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id
      ) VALUES (
        _restaurant_id, txn.financial_account_id, 'adjustment', 'adjustment',
        'Credit note ' || issued_num,
        -round((line->>'credited')::numeric, 2),
        'invoice_credit_note', note.id, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        txn.id
      ) RETURNING id INTO ledger_id;
    ELSE
      RAISE EXCEPTION 'INVOICE_ITEM_NOT_CREDITABLE';
    END IF;
    keyed := true;
    INSERT INTO public.invoice_credit_note_lines (
      restaurant_id, credit_note_id, source_group_id, component_transaction_id,
      component_kind, original_amount, credited_amount, description, snapshot, ledger_transaction_id
    ) VALUES (
      _restaurant_id, note.id, (line->>'sourceGroupId')::uuid, txn.id,
      line->>'kind', (line->>'original')::numeric, (line->>'credited')::numeric,
      COALESCE(line->>'description', 'Charge'), COALESCE(line->'snapshot', '{}'::jsonb), ledger_id
    );
  END LOOP;

  IF folio_for_history IS NOT NULL THEN
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, folio_for_history, 'credit_note_issued', _membership_id, draft.reason,
      jsonb_build_object(
        'credit_note_id', note.id,
        'note_number', note.note_number,
        'total_delta', note.total_delta,
        'invoice_id', draft.guest_invoice_id
      )
    );
  END IF;
  IF account_for_history IS NOT NULL THEN
    INSERT INTO public.financial_account_invoice_events (
      restaurant_id, financial_account_id, invoice_id, event_type, actor_membership_id, new_values
    ) VALUES (
      _restaurant_id, account_for_history, draft.account_invoice_id, 'credit_note_issued', _membership_id,
      jsonb_build_object(
        'credit_note_id', note.id,
        'note_number', note.note_number,
        'total_delta', note.total_delta
      )
    );
  END IF;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, credit_note_id,
    folio_id, financial_account_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, note.id,
    folio_for_history, account_for_history, 'credit_note_issued', _membership_id,
    jsonb_build_object('credit_note_id', note.id, 'note_number', note.note_number, 'total_delta', note.total_delta)
  );

  DELETE FROM public.invoice_credit_note_drafts WHERE id = draft.id;
  RETURN note;
EXCEPTION
  WHEN unique_violation THEN
    IF clean_key IS NOT NULL AND SQLERRM ILIKE '%idempotency%' THEN
      SELECT * INTO existing FROM public.invoice_credit_notes
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF FOUND AND existing.note_type = 'credit' THEN
        RETURN existing;
      END IF;
      IF FOUND THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
    END IF;
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_invoice_credit_note_draft(uuid, uuid, uuid, text) TO service_role;
