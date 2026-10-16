-- Charge-group correction. Original posted rows are not updated.
-- Adjustment, discount, and full remaining reversal append one line per frozen component.
-- Guest-to-guest transfer and post_folio_transaction stay as they are.

CREATE OR REPLACE FUNCTION public.correctable_charge_remainder(
  _restaurant_id uuid,
  _charge_id uuid
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  charge public.folio_transactions%ROWTYPE;
  moved numeric(12,2);
BEGIN
  SELECT * INTO charge FROM public.folio_transactions
  WHERE id = _charge_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR charge.transaction_type <> 'charge' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(sum(
    CASE
      WHEN transaction_type = 'transfer_out' THEN abs(amount)
      WHEN transaction_type = 'discount' THEN abs(amount)
      WHEN transaction_type = 'adjustment' AND amount < 0 THEN -amount
      ELSE 0
    END
  ), 0) INTO moved
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND original_transaction_id = charge.id;
  RETURN round(GREATEST(charge.amount - moved, 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.build_folio_charge_correction(
  _restaurant_id uuid,
  _source_transaction_id uuid,
  _mode text,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parent public.folio_transactions%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  component public.folio_transactions%ROWTYPE;
  share_row record;
  components jsonb := '[]'::jsonb;
  child_components jsonb := '[]'::jsonb;
  shares jsonb := '[]'::jsonb;
  child_shares jsonb := '[]'::jsonb;
  category_name text;
  line_remaining numeric(12,2);
  parent_remaining numeric(12,2);
  tax_remaining numeric(12,2) := 0;
  service_remaining numeric(12,2) := 0;
  remaining_gross numeric(12,2);
  original_gross numeric(12,2);
  gross numeric(12,2);
  child_gross numeric(12,2);
  new_qty integer;
  net_reduction numeric(12,2);
  parent_share numeric(12,2) := 0;
  tax_share numeric(12,2) := 0;
  service_share numeric(12,2) := 0;
  txn_type text;
  ref_type text;
BEGIN
  IF _mode NOT IN ('adjust_amount', 'correct_quantity', 'discount', 'reverse_remaining') THEN
    RAISE EXCEPTION 'INVALID_CORRECTION_MODE';
  END IF;

  SELECT * INTO parent FROM public.folio_transactions
  WHERE id = _source_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR parent.transaction_type <> 'charge' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;
  IF parent.category IN ('tax', 'service_charge') THEN
    RAISE EXCEPTION 'CORRECTION_CHILD_NOT_ALLOWED';
  END IF;

  IF parent.folio_id IS NOT NULL THEN
    SELECT * INTO folio FROM public.guest_folios
    WHERE id = parent.folio_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
    IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.guest_folio_invoices
      WHERE restaurant_id = _restaurant_id AND folio_id = folio.id
    ) THEN
      RAISE EXCEPTION 'CORRECTION_INVOICED';
    END IF;
  ELSIF parent.financial_account_id IS NOT NULL THEN
    SELECT * INTO acct FROM public.financial_accounts
    WHERE id = parent.financial_account_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
    IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
    IF acct.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;
  ELSE
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;

  parent_remaining := public.correctable_charge_remainder(_restaurant_id, parent.id);
  IF parent_remaining IS NOT NULL AND parent_remaining > 0 THEN
    components := components || jsonb_build_array(
      jsonb_build_object('id', parent.id, 'remaining', parent_remaining, 'category', parent.category)
    );
  END IF;

  FOR component IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND original_transaction_id = parent.id
      AND transaction_type = 'charge'
      AND category IN ('tax', 'service_charge')
      AND (
        (parent.folio_id IS NOT NULL AND folio_id = parent.folio_id)
        OR (
          parent.folio_id IS NULL
          AND financial_account_id = parent.financial_account_id
        )
      )
    ORDER BY posted_at, id
  LOOP
    line_remaining := public.correctable_charge_remainder(_restaurant_id, component.id);
    IF line_remaining IS NOT NULL AND line_remaining > 0 THEN
      components := components || jsonb_build_array(
        jsonb_build_object('id', component.id, 'remaining', line_remaining, 'category', component.category)
      );
      IF component.category = 'tax' THEN
        tax_remaining := tax_remaining + line_remaining;
      ELSE
        service_remaining := service_remaining + line_remaining;
      END IF;
    END IF;
  END LOOP;

  remaining_gross := round(COALESCE(parent_remaining, 0) + tax_remaining + service_remaining, 2);
  SELECT round(COALESCE(sum(amount), 0), 2) INTO original_gross
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND (
      id = parent.id
      OR (
        original_transaction_id = parent.id
        AND transaction_type = 'charge'
        AND category IN ('tax', 'service_charge')
        AND (
          (parent.folio_id IS NOT NULL AND folio_id = parent.folio_id)
          OR (parent.folio_id IS NULL AND financial_account_id = parent.financial_account_id)
        )
      )
    );

  IF remaining_gross <= 0 THEN
    RAISE EXCEPTION 'CORRECTION_EXCEEDS_REMAINDER';
  END IF;

  IF _mode = 'reverse_remaining' THEN
    gross := remaining_gross;
    shares := public.allocate_transfer_shares(components, gross);
  ELSIF _mode IN ('adjust_amount', 'discount') THEN
    IF _amount IS NULL OR round(_amount, 2) <= 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT';
    END IF;
    IF round(_amount, 2) > remaining_gross THEN
      RAISE EXCEPTION 'CORRECTION_EXCEEDS_REMAINDER';
    END IF;
    gross := round(_amount, 2);
    shares := public.allocate_transfer_shares(components, gross);
  ELSIF _mode = 'correct_quantity' THEN
    IF parent.quantity IS NULL OR parent.unit_amount IS NULL THEN
      RAISE EXCEPTION 'QUANTITY_NOT_AVAILABLE';
    END IF;
    IF _amount IS NULL OR _amount <> trunc(_amount) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
    new_qty := trunc(_amount)::integer;
    IF new_qty < 1 OR new_qty >= parent.quantity THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
    net_reduction := round((parent.quantity - new_qty) * parent.unit_amount, 2);
    IF net_reduction <= 0 OR parent_remaining IS NULL OR net_reduction > parent_remaining THEN
      RAISE EXCEPTION 'CORRECTION_EXCEEDS_REMAINDER';
    END IF;
    child_gross := round((tax_remaining + service_remaining) * net_reduction / parent_remaining, 2);
    IF child_gross > round(tax_remaining + service_remaining, 2) THEN
      child_gross := round(tax_remaining + service_remaining, 2);
    END IF;
    shares := jsonb_build_array(
      jsonb_build_object('id', parent.id, 'share', net_reduction)
    );
    IF child_gross > 0 THEN
      FOR share_row IN SELECT value FROM jsonb_array_elements(components) LOOP
        IF (share_row.value ->> 'id')::uuid IS DISTINCT FROM parent.id THEN
          child_components := child_components || jsonb_build_array(share_row.value);
        END IF;
      END LOOP;
      child_shares := public.allocate_transfer_shares(child_components, child_gross);
      shares := shares || child_shares;
    END IF;
    gross := net_reduction + COALESCE(child_gross, 0);
  ELSE
    RAISE EXCEPTION 'INVALID_CORRECTION_MODE';
  END IF;

  parent_share := 0;
  tax_share := 0;
  service_share := 0;
  FOR share_row IN SELECT value FROM jsonb_array_elements(shares) LOOP
    IF (share_row.value ->> 'id')::uuid = parent.id THEN
      parent_share := parent_share + (share_row.value ->> 'share')::numeric;
    ELSE
      SELECT item.category INTO category_name
      FROM jsonb_to_recordset(components) AS item(id uuid, category text)
      WHERE item.id = (share_row.value ->> 'id')::uuid;
      IF category_name = 'tax' THEN
        tax_share := tax_share + (share_row.value ->> 'share')::numeric;
      ELSIF category_name = 'service_charge' THEN
        service_share := service_share + (share_row.value ->> 'share')::numeric;
      END IF;
    END IF;
  END LOOP;

  txn_type := CASE WHEN _mode = 'discount' THEN 'discount' ELSE 'adjustment' END;
  ref_type := CASE _mode
    WHEN 'discount' THEN 'charge_discount'
    WHEN 'reverse_remaining' THEN 'charge_reversal'
    WHEN 'correct_quantity' THEN 'charge_quantity'
    ELSE 'charge_adjustment'
  END;

  RETURN jsonb_build_object(
    'mode', _mode,
    'transaction_type', txn_type,
    'reference_type', ref_type,
    'source_transaction_id', parent.id,
    'folio_id', parent.folio_id,
    'financial_account_id', parent.financial_account_id,
    'quantity', parent.quantity,
    'unit_amount', parent.unit_amount,
    'original_gross', original_gross,
    'remaining_gross', remaining_gross,
    'parent_remaining', COALESCE(parent_remaining, 0),
    'tax_remaining', round(tax_remaining, 2),
    'service_remaining', round(service_remaining, 2),
    'net_correction', -round(parent_share, 2),
    'tax_correction', -round(tax_share, 2),
    'service_correction', -round(service_share, 2),
    'gross_correction', -round(gross, 2),
    'new_effective_gross', round(remaining_gross - gross, 2),
    'shares', shares
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_folio_charge_correction(
  _restaurant_id uuid,
  _source_transaction_id uuid,
  _mode text,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.build_folio_charge_correction(
    _restaurant_id, _source_transaction_id, _mode, _amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_charge_correction(
  _restaurant_id uuid,
  _source_transaction_id uuid,
  _mode text,
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
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  existing public.folio_transactions%ROWTYPE;
  hist jsonb;
  plan jsonb;
  share_row record;
  component public.folio_transactions%ROWTYPE;
  source_folio public.guest_folios%ROWTYPE;
  source_account public.financial_accounts%ROWTYPE;
  group_id uuid := gen_random_uuid();
  ids jsonb := '[]'::jsonb;
  keyed boolean := false;
  inserted uuid;
  gross numeric(12,2);
BEGIN
  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _mode NOT IN ('adjust_amount', 'correct_quantity', 'discount', 'reverse_remaining') THEN
    RAISE EXCEPTION 'INVALID_CORRECTION_MODE';
  END IF;

  SELECT * INTO existing FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
  LIMIT 1;
  IF FOUND THEN
    SELECT new_values INTO hist FROM public.folio_history
    WHERE restaurant_id = _restaurant_id
      AND new_values ->> 'idempotency_key' = clean_key
    ORDER BY created_at, id
    LIMIT 1;
    IF hist IS NULL
      OR hist ->> 'mode' IS DISTINCT FROM _mode
      OR (hist ->> 'source_transaction_id')::uuid IS DISTINCT FROM _source_transaction_id
      OR (
        _mode IN ('adjust_amount', 'discount', 'reverse_remaining')
        AND round(COALESCE(_amount, 0), 2) IS DISTINCT FROM round((hist ->> 'amount')::numeric, 2)
      )
      OR (
        _mode = 'correct_quantity'
        AND round(COALESCE(_amount, 0), 2) IS DISTINCT FROM round(COALESCE((hist ->> 'requested_quantity')::numeric, -1), 2)
      ) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN jsonb_build_object(
      'correction_id', hist -> 'transaction_ids' ->> 0,
      'mode', _mode,
      'gross', (hist ->> 'amount')::numeric,
      'transaction_ids', hist -> 'transaction_ids'
    );
  END IF;

  SELECT * INTO existing FROM public.folio_transactions
  WHERE id = _source_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;
  IF existing.folio_id IS NOT NULL THEN
    SELECT * INTO source_folio FROM public.guest_folios
    WHERE id = existing.folio_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  ELSIF existing.financial_account_id IS NOT NULL THEN
    SELECT * INTO source_account FROM public.financial_accounts
    WHERE id = existing.financial_account_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  END IF;

  plan := public.build_folio_charge_correction(
    _restaurant_id, _source_transaction_id, _mode, _amount
  );
  gross := -round((plan ->> 'gross_correction')::numeric, 2);
  IF _mode IN ('adjust_amount', 'discount', 'reverse_remaining')
    AND round(COALESCE(_amount, gross), 2) IS DISTINCT FROM gross THEN
    RAISE EXCEPTION 'CORRECTION_AMOUNT_CHANGED';
  END IF;

  FOR share_row IN SELECT value FROM jsonb_array_elements(plan -> 'shares') LOOP
    SELECT * INTO component FROM public.folio_transactions
    WHERE id = (share_row.value ->> 'id')::uuid AND restaurant_id = _restaurant_id;
    IF component.folio_id IS NOT NULL THEN
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id, folio_window_id
      ) VALUES (
        _restaurant_id, component.folio_id, plan ->> 'transaction_type',
        plan ->> 'transaction_type', clean_desc,
        -round((share_row.value ->> 'share')::numeric, 2),
        plan ->> 'reference_type', group_id, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        component.id, component.folio_window_id
      ) RETURNING id INTO inserted;
    ELSE
      INSERT INTO public.folio_transactions (
        restaurant_id, financial_account_id, transaction_type, category, description, amount,
        reference_type, reference_id, posted_by_membership_id, idempotency_key,
        original_transaction_id
      ) VALUES (
        _restaurant_id, component.financial_account_id, plan ->> 'transaction_type',
        plan ->> 'transaction_type', clean_desc,
        -round((share_row.value ->> 'share')::numeric, 2),
        plan ->> 'reference_type', group_id, _membership_id,
        CASE WHEN NOT keyed THEN clean_key ELSE NULL END,
        component.id
      ) RETURNING id INTO inserted;
    END IF;
    keyed := true;
    ids := ids || jsonb_build_array(inserted);
  END LOOP;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id,
    CASE WHEN plan ->> 'folio_id' IS NULL THEN NULL ELSE (plan ->> 'folio_id')::uuid END,
    CASE WHEN _mode = 'discount' THEN 'discount_posted' ELSE 'adjustment_posted' END,
    _membership_id,
    clean_desc,
    jsonb_build_object(
      'mode', _mode,
      'amount', gross,
      'requested_quantity', CASE WHEN _mode = 'correct_quantity' THEN _amount ELSE NULL END,
      'source_transaction_id', _source_transaction_id,
      'financial_account_id', plan -> 'financial_account_id',
      'idempotency_key', clean_key,
      'transaction_ids', ids
    )
  );

  RETURN jsonb_build_object(
    'correction_id', ids ->> 0,
    'mode', _mode,
    'gross', gross,
    'transaction_ids', ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correctable_charge_remainder(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_folio_charge_correction(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_folio_charge_correction(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_folio_charge_correction(uuid, uuid, text, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correctable_charge_remainder(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_folio_charge_correction(uuid, uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_folio_charge_correction(uuid, uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_charge_correction(uuid, uuid, text, numeric, text, uuid, text) TO service_role;
