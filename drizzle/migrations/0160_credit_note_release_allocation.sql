-- A credit note on a paid invoice releases only the allocation that would
-- otherwise sit above the reduced invoice net. The payment ledger row stays.
-- Debit notes increase the invoice and do not release allocations.
-- Dual-lane with drizzle/migrations/0160_credit_note_release_allocation.sql.

CREATE OR REPLACE FUNCTION public.release_excess_guest_invoice_allocation(
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
  alloc public.guest_payment_invoice_allocations%ROWTYPE;
  reversed numeric(12,2);
  remaining numeric(12,2);
  take numeric(12,2);
  reason text;
  op_id uuid;
  release_key text;
BEGIN
  SELECT COALESCE(round(sum(amount), 2), 0) INTO active
  FROM public.guest_payment_invoice_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = _invoice_id;
  needed := round(active - COALESCE(_projected_net, 0), 2);
  IF needed <= 0.01 THEN RETURN 0; END IF;

  FOR alloc IN
    SELECT *
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id
      AND invoice_id = _invoice_id
      AND amount > 0
      AND reverses_allocation_id IS NULL
    ORDER BY created_at DESC, id
    FOR UPDATE
  LOOP
    EXIT WHEN needed <= 0.01;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO reversed
    FROM public.guest_payment_invoice_allocations
    WHERE restaurant_id = _restaurant_id AND reverses_allocation_id = alloc.id;
    remaining := round(alloc.amount + reversed, 2);
    IF remaining <= 0.01 THEN CONTINUE; END IF;
    take := LEAST(remaining, needed);
    PERFORM 1 FROM public.guest_folios
    WHERE id = alloc.guest_folio_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    PERFORM 1 FROM public.folio_transactions
    WHERE id = alloc.payment_transaction_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    reason := left('Released for credit note ' || COALESCE(_note_number, ''), 500);
    op_id := gen_random_uuid();
    release_key := CASE
      WHEN _idempotency_key IS NULL THEN NULL
      ELSE left('cnrel-g:' || alloc.id::text || ':' || _idempotency_key, 80)
    END;
    INSERT INTO public.guest_payment_invoice_allocations (
      restaurant_id, guest_folio_id, payment_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, alloc.guest_folio_id, alloc.payment_transaction_id, alloc.invoice_id,
      -take, alloc.id, op_id, release_key, reason, _membership_id
    );
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
    ) VALUES (
      _restaurant_id, alloc.guest_folio_id, 'guest_payment_allocation_reversed', _membership_id,
      reason,
      jsonb_build_object(
        'payment_transaction_id', alloc.payment_transaction_id,
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

REVOKE ALL ON FUNCTION public.release_excess_guest_invoice_allocation(uuid, uuid, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_excess_guest_invoice_allocation(uuid, uuid, numeric, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.release_excess_account_invoice_allocation(
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
  alloc public.financial_account_payment_allocations%ROWTYPE;
  reversed numeric(12,2);
  remaining numeric(12,2);
  take numeric(12,2);
  reason text;
  op_id uuid;
  release_key text;
BEGIN
  SELECT COALESCE(round(sum(amount), 2), 0) INTO active
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = _invoice_id;
  needed := round(active - COALESCE(_projected_net, 0), 2);
  IF needed <= 0.01 THEN RETURN 0; END IF;

  FOR alloc IN
    SELECT *
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id
      AND invoice_id = _invoice_id
      AND amount > 0
      AND reverses_allocation_id IS NULL
    ORDER BY created_at DESC, id
    FOR UPDATE
  LOOP
    EXIT WHEN needed <= 0.01;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO reversed
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND reverses_allocation_id = alloc.id;
    remaining := round(alloc.amount + reversed, 2);
    IF remaining <= 0.01 THEN CONTINUE; END IF;
    take := LEAST(remaining, needed);
    PERFORM 1 FROM public.financial_accounts
    WHERE id = alloc.financial_account_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    PERFORM 1 FROM public.folio_transactions
    WHERE id = alloc.payment_transaction_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    reason := left('Released for credit note ' || COALESCE(_note_number, ''), 500);
    op_id := gen_random_uuid();
    release_key := CASE
      WHEN _idempotency_key IS NULL THEN NULL
      ELSE left('cnrel-a:' || alloc.id::text || ':' || _idempotency_key, 80)
    END;
    INSERT INTO public.financial_account_payment_allocations (
      restaurant_id, financial_account_id, payment_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, alloc.financial_account_id, alloc.payment_transaction_id, alloc.invoice_id,
      -take, alloc.id, op_id, release_key, reason, _membership_id
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

REVOKE ALL ON FUNCTION public.release_excess_account_invoice_allocation(uuid, uuid, numeric, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_excess_account_invoice_allocation(uuid, uuid, numeric, text, uuid, text) TO service_role;

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
        PERFORM public.release_excess_account_invoice_allocation(
          _restaurant_id,
          acct_invoice.id,
          projected_net,
          issued_num,
          _membership_id,
          clean_key
        );
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
        PERFORM public.release_excess_guest_invoice_allocation(
          _restaurant_id,
          guest.id,
          guest_projected_net,
          issued_num,
          _membership_id,
          clean_key
        );
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
