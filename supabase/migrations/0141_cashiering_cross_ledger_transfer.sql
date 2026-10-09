-- Cross-ledger transfer between a guest folio and a company or group financial account.
-- Guest-to-guest stays on post_folio_transfer. Account-to-account is rejected.
-- Original posted rows are not updated.

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
    'cross_ledger_transfer_out','cross_ledger_transfer_in'
  ])
);

CREATE OR REPLACE FUNCTION public.post_cross_ledger_transfer(
  _restaurant_id uuid,
  _source_type text,
  _source_id uuid,
  _source_transaction_id uuid,
  _destination_type text,
  _destination_id uuid,
  _amount numeric,
  _description text,
  _membership_id uuid,
  _idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source_folio public.guest_folios%ROWTYPE;
  dest_folio public.guest_folios%ROWTYPE;
  source_account public.financial_accounts%ROWTYPE;
  dest_account public.financial_accounts%ROWTYPE;
  source_line public.folio_transactions%ROWTYPE;
  component public.folio_transactions%ROWTYPE;
  dest_window public.guest_folio_windows%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  transfer uuid := gen_random_uuid();
  components jsonb := '[]'::jsonb;
  shares jsonb;
  share jsonb;
  share_row record;
  line_remaining numeric(12,2);
  gross numeric(12,2);
  keyed boolean := false;
  existing public.folio_transactions%ROWTYPE;
  in_txn public.folio_transactions%ROWTYPE;
  credit_limit numeric(12,2);
  dest_balance numeric(12,2);
  source_folio_id uuid;
  dest_folio_id uuid;
BEGIN
  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF _source_type NOT IN ('guest_folio', 'financial_account')
    OR _destination_type NOT IN ('guest_folio', 'financial_account') THEN
    RAISE EXCEPTION 'INVALID_TRANSFER_TARGET';
  END IF;
  IF _source_type = 'guest_folio' AND _destination_type = 'guest_folio' THEN
    RAISE EXCEPTION 'TRANSFER_FOLIO_PAIR';
  END IF;
  IF _source_type = 'financial_account' AND _destination_type = 'financial_account' THEN
    RAISE EXCEPTION 'TRANSFER_ACCOUNT_TO_ACCOUNT';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
    LIMIT 1;
    IF FOUND THEN
      IF existing.transaction_type <> 'transfer_out'
        OR existing.reference_type IS DISTINCT FROM 'folio_transfer'
        OR (
          _source_type = 'guest_folio'
          AND existing.folio_id IS DISTINCT FROM _source_id
        )
        OR (
          _source_type = 'financial_account'
          AND existing.financial_account_id IS DISTINCT FROM _source_id
        ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      SELECT * INTO in_txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND transfer_id = existing.transfer_id
        AND transfer_direction = 'in'
      ORDER BY posted_at, id
      LIMIT 1;
      RETURN jsonb_build_object(
        'transfer_id', existing.transfer_id,
        'transfer_out_id', existing.id,
        'transfer_in_id', in_txn.id
      );
    END IF;
  END IF;

  IF _source_type = 'guest_folio' THEN
    SELECT * INTO source_folio FROM public.guest_folios
    WHERE id = _source_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
    IF source_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.guest_folio_invoices
      WHERE restaurant_id = _restaurant_id AND folio_id = source_folio.id
    ) THEN
      RAISE EXCEPTION 'TRANSFER_INVOICED';
    END IF;
  ELSE
    SELECT * INTO source_account FROM public.financial_accounts
    WHERE id = _source_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
    IF source_account.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
    IF source_account.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;
  END IF;

  IF _destination_type = 'guest_folio' THEN
    SELECT * INTO dest_folio FROM public.guest_folios
    WHERE id = _destination_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
    IF dest_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  ELSE
    SELECT * INTO dest_account FROM public.financial_accounts
    WHERE id = _destination_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
    IF dest_account.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
    IF dest_account.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;
  END IF;

  IF (_source_type = 'guest_folio' AND source_folio.currency IS DISTINCT FROM dest_account.currency)
    OR (_source_type = 'financial_account' AND source_account.currency IS DISTINCT FROM dest_folio.currency) THEN
    RAISE EXCEPTION 'TRANSFER_CURRENCY_MISMATCH';
  END IF;

  IF _source_type = 'guest_folio' THEN
    SELECT * INTO source_line FROM public.folio_transactions
    WHERE id = _source_transaction_id
      AND restaurant_id = _restaurant_id
      AND folio_id = source_folio.id;
  ELSE
    SELECT * INTO source_line FROM public.folio_transactions
    WHERE id = _source_transaction_id
      AND restaurant_id = _restaurant_id
      AND financial_account_id = source_account.id;
  END IF;
  IF NOT FOUND OR source_line.transaction_type <> 'charge' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;
  IF source_line.category IN ('tax', 'service_charge') THEN
    RAISE EXCEPTION 'TRANSFER_CHILD_NOT_ALLOWED';
  END IF;

  line_remaining := public.transferable_charge_remainder(_restaurant_id, source_line.id);
  IF line_remaining IS NOT NULL AND line_remaining > 0 THEN
    components := components || jsonb_build_array(
      jsonb_build_object('id', source_line.id, 'remaining', line_remaining)
    );
  END IF;

  IF _source_type = 'guest_folio' THEN
    FOR component IN
      SELECT * FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND folio_id = source_folio.id
        AND original_transaction_id = source_line.id
        AND transaction_type = 'charge'
        AND category IN ('tax', 'service_charge')
      ORDER BY posted_at, id
    LOOP
      line_remaining := public.transferable_charge_remainder(_restaurant_id, component.id);
      IF line_remaining IS NOT NULL AND line_remaining > 0 THEN
        components := components || jsonb_build_array(
          jsonb_build_object('id', component.id, 'remaining', line_remaining)
        );
      END IF;
    END LOOP;
  ELSE
    FOR component IN
      SELECT * FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND financial_account_id = source_account.id
        AND original_transaction_id = source_line.id
        AND transaction_type = 'charge'
        AND category IN ('tax', 'service_charge')
      ORDER BY posted_at, id
    LOOP
      line_remaining := public.transferable_charge_remainder(_restaurant_id, component.id);
      IF line_remaining IS NOT NULL AND line_remaining > 0 THEN
        components := components || jsonb_build_array(
          jsonb_build_object('id', component.id, 'remaining', line_remaining)
        );
      END IF;
    END LOOP;
  END IF;

  shares := public.allocate_transfer_shares(components, round(_amount, 2));
  gross := 0;
  FOR share_row IN SELECT value FROM jsonb_array_elements(shares) LOOP
    gross := gross + (share_row.value ->> 'share')::numeric;
  END LOOP;
  IF round(gross, 2) IS DISTINCT FROM round(_amount, 2) THEN
    RAISE EXCEPTION 'TRANSFER_ALLOCATION_MISMATCH';
  END IF;

  IF _destination_type = 'financial_account' AND dest_account.account_kind = 'company' THEN
    SELECT credit_limit_amount INTO credit_limit
    FROM public.guest_account_masters
    WHERE id = dest_account.master_id AND restaurant_id = _restaurant_id;
    IF credit_limit IS NOT NULL THEN
      dest_balance := public.financial_account_balance(_restaurant_id, dest_account.id);
      IF round(dest_balance + round(_amount, 2), 2) > credit_limit THEN
        RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED';
      END IF;
    END IF;
  END IF;

  IF _destination_type = 'guest_folio' THEN
    PERFORM public.ensure_primary_folio_window(_restaurant_id, dest_folio.id);
    SELECT * INTO dest_window FROM public.guest_folio_windows
    WHERE restaurant_id = _restaurant_id
      AND folio_id = dest_folio.id
      AND is_primary = true
    ORDER BY window_number, id
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TARGET_WINDOW_NOT_FOUND';
    END IF;
  ELSE
    PERFORM public.ensure_primary_folio_window(_restaurant_id, source_folio.id);
  END IF;

  FOR share_row IN SELECT value FROM jsonb_array_elements(shares) LOOP
    share := share_row.value;
    SELECT * INTO component FROM public.folio_transactions
    WHERE id = (share ->> 'id')::uuid AND restaurant_id = _restaurant_id;

    IF _source_type = 'guest_folio' THEN
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id, folio_window_id, transfer_id, transfer_direction
      ) VALUES (
        _restaurant_id, source_folio.id, 'transfer_out', 'transfer', clean_desc,
        -round((share ->> 'share')::numeric, 2),
        'folio_transfer', transfer, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        component.id, component.folio_window_id, transfer, 'out'
      );
    ELSE
      INSERT INTO public.folio_transactions (
        restaurant_id, financial_account_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id, transfer_id, transfer_direction
      ) VALUES (
        _restaurant_id, source_account.id, 'transfer_out', 'transfer', clean_desc,
        -round((share ->> 'share')::numeric, 2),
        'folio_transfer', transfer, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        component.id, transfer, 'out'
      );
    END IF;
    keyed := true;

    IF _destination_type = 'guest_folio' THEN
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id,
        original_transaction_id, folio_window_id, transfer_id, transfer_direction
      ) VALUES (
        _restaurant_id, dest_folio.id, 'transfer_in', 'transfer', clean_desc,
        round((share ->> 'share')::numeric, 2),
        'folio_transfer', transfer, _membership_id,
        component.id, dest_window.id, transfer, 'in'
      );
    ELSE
      INSERT INTO public.folio_transactions (
        restaurant_id, financial_account_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id,
        original_transaction_id, transfer_id, transfer_direction
      ) VALUES (
        _restaurant_id, dest_account.id, 'transfer_in', 'transfer', clean_desc,
        round((share ->> 'share')::numeric, 2),
        'folio_transfer', transfer, _membership_id,
        component.id, transfer, 'in'
      );
    END IF;
  END LOOP;

  source_folio_id := CASE WHEN _source_type = 'guest_folio' THEN source_folio.id ELSE NULL END;
  dest_folio_id := CASE WHEN _destination_type = 'guest_folio' THEN dest_folio.id ELSE NULL END;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, source_folio_id, 'cross_ledger_transfer_out', _membership_id, clean_desc,
    jsonb_build_object(
      'transfer_id', transfer,
      'amount', round(_amount, 2),
      'source_type', _source_type,
      'source_id', _source_id,
      'destination_type', _destination_type,
      'destination_id', _destination_id,
      'source_transaction_id', source_line.id
    )
  );
  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, dest_folio_id, 'cross_ledger_transfer_in', _membership_id, clean_desc,
    jsonb_build_object(
      'transfer_id', transfer,
      'amount', round(_amount, 2),
      'source_type', _source_type,
      'source_id', _source_id,
      'destination_type', _destination_type,
      'destination_id', _destination_id,
      'source_transaction_id', source_line.id
    )
  );

  RETURN jsonb_build_object(
    'transfer_id', transfer,
    'transfer_out_id', (
      SELECT id FROM public.folio_transactions
      WHERE transfer_id = transfer AND transfer_direction = 'out'
      ORDER BY posted_at, id
      LIMIT 1
    ),
    'transfer_in_id', (
      SELECT id FROM public.folio_transactions
      WHERE transfer_id = transfer AND transfer_direction = 'in'
      ORDER BY posted_at, id
      LIMIT 1
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_cross_ledger_transfer(uuid, text, uuid, uuid, text, uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_cross_ledger_transfer(uuid, text, uuid, uuid, text, uuid, numeric, text, uuid, text) TO service_role;
