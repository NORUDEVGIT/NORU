-- Replace a payment allocation whose fiscal sales receipt was rejected.
-- The folio or account balance does not change. The old allocation is reversed
-- and a new allocation is inserted. A scheduled retry cannot be corrected. A
-- timeout, network, auth, or HTTP failure is uncertain: it can be corrected only
-- after its retries are used up and the caller confirms the provider did not
-- register it.
-- Dual-lane with drizzle/migrations/0162_correct_failed_sales_receipt_allocation.sql.

DROP FUNCTION IF EXISTS public.correct_failed_guest_sales_receipt_allocation(uuid, uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.correct_failed_company_sales_receipt_allocation(uuid, uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.correct_failed_guest_sales_receipt_allocation(
  _restaurant_id uuid,
  _allocation_id uuid,
  _amount numeric,
  _idempotency_key text,
  _membership_id uuid,
  _provider_unregistered_confirmed boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  original public.guest_payment_invoice_allocations%ROWTYPE;
  created public.guest_payment_invoice_allocations%ROWTYPE;
  replay public.guest_payment_invoice_allocations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  inv public.guest_folio_invoices%ROWTYPE;
  reg public.fiscal_registrations%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  apply_key text;
  reverse_key text;
  proposed numeric(12,2);
  reversed numeric(12,2);
  remaining numeric(12,2);
  face numeric(12,2);
  refunded numeric(12,2);
  allocated numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  inv_allocated numeric(12,2);
  outstanding numeric(12,2);
  op_id uuid;
  reason text := 'Corrected after a failed fiscal sales receipt.';
BEGIN
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 72 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  proposed := round(COALESCE(_amount, 0), 2);
  IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
  apply_key := 'gfix:' || clean_key;
  reverse_key := 'grev:' || clean_key;

  SELECT * INTO replay FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = apply_key;
  IF FOUND THEN
    IF replay.amount <= 0 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED'; END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'allocationId', replay.id,
      'invoiceId', replay.invoice_id,
      'amount', replay.amount
    );
  END IF;

  SELECT * INTO original FROM public.guest_payment_invoice_allocations
  WHERE id = _allocation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
  IF original.amount <= 0 OR original.reverses_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_REVERSIBLE';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = original.guest_folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = original.payment_transaction_id AND restaurant_id = _restaurant_id
    AND folio_id = folio.id
  FOR UPDATE;
  IF NOT FOUND OR pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_GUEST_PAYMENT';
  END IF;
  SELECT * INTO inv FROM public.guest_folio_invoices
  WHERE id = original.invoice_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  SELECT * INTO reg FROM public.fiscal_registrations
  WHERE restaurant_id = _restaurant_id
    AND source_type = 'guest_allocation'
    AND source_id = original.id
    AND fiscal_document_type = 'SALES_RECEIPT'
    AND status <> 'CANCELLED'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECEIPT_NOT_CORRECTABLE'; END IF;
  IF reg.status = 'REGISTERED' OR reg.external_rrn IS NOT NULL OR reg.external_irn IS NOT NULL
    OR reg.registered_at IS NOT NULL THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_REGISTERED';
  END IF;
  IF reg.status = 'PENDING' OR reg.next_attempt_at IS NOT NULL THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_UNCERTAIN';
  END IF;
  IF reg.last_error_code IN (
      'FISCAL_TIMEOUT', 'FISCAL_NETWORK_ERROR', 'FISCAL_AUTH_FAILED', 'FISCAL_HTTP_ERROR'
    ) THEN
    IF NOT COALESCE(_provider_unregistered_confirmed, false) THEN
      RAISE EXCEPTION 'FISCAL_RECEIPT_CONFIRMATION_REQUIRED';
    END IF;
    reason := 'Corrected after a failed fiscal sales receipt. The user confirmed the provider did not register it.';
  END IF;
  IF reg.status NOT IN ('FAILED', 'BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_NOT_CORRECTABLE';
  END IF;

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
    _restaurant_id, folio.id, pay.id, inv.id, -remaining,
    original.id, op_id, reverse_key, reason, _membership_id
  );

  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND payment_transaction_id = pay.id;
  available := round(face - refunded - allocated, 2);
  IF proposed > available + 0.01 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_PAYMENT'; END IF;

  invoice_total := round(COALESCE((inv.snapshot->'totals'->>'invoiceTotal')::numeric, 0), 2);
  SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
  FROM public.invoice_credit_notes
  WHERE restaurant_id = _restaurant_id AND guest_invoice_id = inv.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = inv.id;
  outstanding := round(
    invoice_total + note_delta - inv_allocated - public.guest_invoice_deposit_cover(_restaurant_id, inv.id),
    2
  );
  IF proposed > outstanding + 0.01 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE'; END IF;

  INSERT INTO public.guest_payment_invoice_allocations (
    restaurant_id, guest_folio_id, payment_transaction_id, invoice_id, amount,
    reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, pay.id, inv.id, proposed,
    NULL, op_id, apply_key, NULL, _membership_id
  ) RETURNING * INTO created;

  UPDATE public.fiscal_registrations
  SET status = 'BLOCKED',
      next_attempt_at = NULL,
      last_error_code = 'FISCAL_NOT_ELIGIBLE',
      last_error_message = 'Superseded by a corrected allocation. Register the new sales receipt line.'
  WHERE id = reg.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, folio.id, 'guest_payment_allocation_reversed', _membership_id, reason,
    jsonb_build_object(
      'payment_transaction_id', pay.id,
      'invoice_id', inv.id,
      'allocation_id', original.id,
      'amount', -remaining,
      'replacement_allocation_id', created.id,
      'replacement_amount', proposed
    )
  );

  RETURN jsonb_build_object(
    'replayed', false,
    'allocationId', created.id,
    'invoiceId', inv.id,
    'amount', created.amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_failed_guest_sales_receipt_allocation(uuid, uuid, numeric, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_failed_guest_sales_receipt_allocation(uuid, uuid, numeric, text, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.correct_failed_company_sales_receipt_allocation(
  _restaurant_id uuid,
  _allocation_id uuid,
  _amount numeric,
  _idempotency_key text,
  _membership_id uuid,
  _provider_unregistered_confirmed boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  original public.financial_account_payment_allocations%ROWTYPE;
  created public.financial_account_payment_allocations%ROWTYPE;
  replay public.financial_account_payment_allocations%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  inv public.financial_account_invoices%ROWTYPE;
  reg public.fiscal_registrations%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  apply_key text;
  reverse_key text;
  proposed numeric(12,2);
  reversed numeric(12,2);
  remaining numeric(12,2);
  face numeric(12,2);
  refunded numeric(12,2);
  allocated numeric(12,2);
  available numeric(12,2);
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  inv_allocated numeric(12,2);
  outstanding numeric(12,2);
  op_id uuid;
  reason text := 'Corrected after a failed fiscal sales receipt.';
BEGIN
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 72 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  proposed := round(COALESCE(_amount, 0), 2);
  IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
  apply_key := 'cfix:' || clean_key;
  reverse_key := 'crev:' || clean_key;

  SELECT * INTO replay FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = apply_key;
  IF FOUND THEN
    IF replay.amount <= 0 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED'; END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'allocationId', replay.id,
      'invoiceId', replay.invoice_id,
      'amount', replay.amount
    );
  END IF;

  SELECT * INTO original FROM public.financial_account_payment_allocations
  WHERE id = _allocation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
  IF original.amount <= 0 OR original.reverses_allocation_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_REVERSIBLE';
  END IF;

  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = original.financial_account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = original.payment_transaction_id AND restaurant_id = _restaurant_id
    AND financial_account_id = acct.id
  FOR UPDATE;
  IF NOT FOUND OR pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_AN_ACCOUNT_PAYMENT';
  END IF;
  SELECT * INTO inv FROM public.financial_account_invoices
  WHERE id = original.invoice_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;

  SELECT * INTO reg FROM public.fiscal_registrations
  WHERE restaurant_id = _restaurant_id
    AND source_type = 'account_allocation'
    AND source_id = original.id
    AND fiscal_document_type = 'SALES_RECEIPT'
    AND status <> 'CANCELLED'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECEIPT_NOT_CORRECTABLE'; END IF;
  IF reg.status = 'REGISTERED' OR reg.external_rrn IS NOT NULL OR reg.external_irn IS NOT NULL
    OR reg.registered_at IS NOT NULL THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_REGISTERED';
  END IF;
  IF reg.status = 'PENDING' OR reg.next_attempt_at IS NOT NULL THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_UNCERTAIN';
  END IF;
  IF reg.last_error_code IN (
      'FISCAL_TIMEOUT', 'FISCAL_NETWORK_ERROR', 'FISCAL_AUTH_FAILED', 'FISCAL_HTTP_ERROR'
    ) THEN
    IF NOT COALESCE(_provider_unregistered_confirmed, false) THEN
      RAISE EXCEPTION 'FISCAL_RECEIPT_CONFIRMATION_REQUIRED';
    END IF;
    reason := 'Corrected after a failed fiscal sales receipt. The user confirmed the provider did not register it.';
  END IF;
  IF reg.status NOT IN ('FAILED', 'BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_RECEIPT_NOT_CORRECTABLE';
  END IF;

  SELECT COALESCE(round(sum(amount), 2), 0) INTO reversed
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND reverses_allocation_id = original.id;
  remaining := round(original.amount + reversed, 2);
  IF remaining <= 0.01 THEN RAISE EXCEPTION 'ALLOCATION_ALREADY_REVERSED'; END IF;

  op_id := gen_random_uuid();
  INSERT INTO public.financial_account_payment_allocations (
    restaurant_id, financial_account_id, payment_transaction_id, invoice_id, amount,
    reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, pay.id, inv.id, -remaining,
    original.id, op_id, reverse_key, reason, _membership_id
  );

  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND financial_account_id = acct.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND payment_transaction_id = pay.id;
  available := round(face - refunded - allocated, 2);
  IF proposed > available + 0.01 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_PAYMENT'; END IF;

  invoice_total := round(COALESCE(
    (inv.snapshot->'totals'->>'invoiceTotal')::numeric,
    (inv.snapshot->'totals'->>'balance')::numeric, 0), 2);
  SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
  FROM public.invoice_credit_notes
  WHERE restaurant_id = _restaurant_id AND account_invoice_id = inv.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = inv.id;
  outstanding := round(invoice_total + note_delta - inv_allocated, 2);
  IF proposed > outstanding + 0.01 THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE'; END IF;

  INSERT INTO public.financial_account_payment_allocations (
    restaurant_id, financial_account_id, payment_transaction_id, invoice_id, amount,
    reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, pay.id, inv.id, proposed,
    NULL, op_id, apply_key, NULL, _membership_id
  ) RETURNING * INTO created;

  UPDATE public.fiscal_registrations
  SET status = 'BLOCKED',
      next_attempt_at = NULL,
      last_error_code = 'FISCAL_NOT_ELIGIBLE',
      last_error_message = 'Superseded by a corrected allocation. Register the new sales receipt line.'
  WHERE id = reg.id;

  RETURN jsonb_build_object(
    'replayed', false,
    'allocationId', created.id,
    'invoiceId', inv.id,
    'amount', created.amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_failed_company_sales_receipt_allocation(uuid, uuid, numeric, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_failed_company_sales_receipt_allocation(uuid, uuid, numeric, text, uuid, boolean) TO service_role;
