-- Closed folio invoice allocation.
-- Linking an existing payment or deposit does not post a folio transaction.
-- Receiving a payment, refunding, and reversing an allocation stay blocked on a closed folio.

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
  -- Closed folios may link an existing payment or deposit. This posts no ledger line.

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
  -- Closed folios may link an existing payment or deposit. This posts no ledger line.

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
