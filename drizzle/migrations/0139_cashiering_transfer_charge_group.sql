-- Transfer Charge moves the remaining gross of a parent charge group.
-- Parent, posted tax, and posted service-charge children are appended as
-- paired transfer lines. Original rows are not updated. Dual-lane with drizzle.

CREATE OR REPLACE FUNCTION public.allocate_transfer_shares(
  _components jsonb,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  n int;
  i int;
  gross_cents bigint := 0;
  amount_cents bigint;
  rem_cents bigint[];
  base_cents bigint[];
  frac numeric[];
  ids uuid[];
  used boolean[];
  leftover bigint;
  best int;
  best_frac numeric;
  total bigint := 0;
  result jsonb := '[]'::jsonb;
BEGIN
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  n := COALESCE(jsonb_array_length(_components), 0);
  IF n = 0 THEN
    RAISE EXCEPTION 'TRANSFER_EXCEEDS_REMAINDER';
  END IF;

  FOR i IN 0..n - 1 LOOP
    ids[i + 1] := (_components -> i ->> 'id')::uuid;
    rem_cents[i + 1] := round(((_components -> i ->> 'remaining')::numeric) * 100)::bigint;
    IF rem_cents[i + 1] <= 0 THEN
      RAISE EXCEPTION 'TRANSFER_EXCEEDS_REMAINDER';
    END IF;
    gross_cents := gross_cents + rem_cents[i + 1];
  END LOOP;

  amount_cents := round(_amount * 100)::bigint;
  IF amount_cents > gross_cents THEN
    RAISE EXCEPTION 'TRANSFER_EXCEEDS_REMAINDER';
  END IF;

  IF amount_cents = gross_cents THEN
    FOR i IN 1..n LOOP
      result := result || jsonb_build_array(
        jsonb_build_object('id', ids[i], 'share', round(rem_cents[i]::numeric / 100, 2))
      );
    END LOOP;
    RETURN result;
  END IF;

  leftover := amount_cents;
  FOR i IN 1..n LOOP
    base_cents[i] := floor((rem_cents[i]::numeric * amount_cents) / gross_cents)::bigint;
    frac[i] := (rem_cents[i]::numeric * amount_cents) / gross_cents - base_cents[i];
    used[i] := false;
    leftover := leftover - base_cents[i];
  END LOOP;

  WHILE leftover > 0 LOOP
    best := 0;
    best_frac := -1;
    FOR i IN 1..n LOOP
      IF NOT used[i] AND base_cents[i] < rem_cents[i] AND frac[i] > best_frac THEN
        best := i;
        best_frac := frac[i];
      END IF;
    END LOOP;
    IF best = 0 THEN
      RAISE EXCEPTION 'TRANSFER_ALLOCATION_MISMATCH';
    END IF;
    base_cents[best] := base_cents[best] + 1;
    used[best] := true;
    leftover := leftover - 1;
  END LOOP;

  FOR i IN 1..n LOOP
    total := total + base_cents[i];
    IF base_cents[i] > rem_cents[i] THEN
      RAISE EXCEPTION 'TRANSFER_ALLOCATION_MISMATCH';
    END IF;
    IF base_cents[i] > 0 THEN
      result := result || jsonb_build_array(
        jsonb_build_object('id', ids[i], 'share', round(base_cents[i]::numeric / 100, 2))
      );
    END IF;
  END LOOP;

  IF total <> amount_cents THEN
    RAISE EXCEPTION 'TRANSFER_ALLOCATION_MISMATCH';
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.transferable_charge_group_remainder(
  _restaurant_id uuid,
  _parent_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parent public.folio_transactions%ROWTYPE;
  child public.folio_transactions%ROWTYPE;
  parent_remaining numeric(12,2);
  tax_remaining numeric(12,2) := 0;
  service_remaining numeric(12,2) := 0;
  line_remaining numeric(12,2);
BEGIN
  SELECT * INTO parent FROM public.folio_transactions
  WHERE id = _parent_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND
    OR parent.transaction_type <> 'charge'
    OR parent.category IN ('tax', 'service_charge') THEN
    RETURN jsonb_build_object(
      'parentRemaining', 0,
      'taxRemaining', 0,
      'serviceRemaining', 0,
      'grossRemaining', 0
    );
  END IF;

  parent_remaining := public.transferable_charge_remainder(_restaurant_id, parent.id);
  IF parent_remaining IS NULL OR parent_remaining < 0 THEN
    parent_remaining := 0;
  END IF;

  FOR child IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = parent.folio_id
      AND original_transaction_id = parent.id
      AND transaction_type = 'charge'
      AND category IN ('tax', 'service_charge')
    ORDER BY posted_at, id
  LOOP
    line_remaining := public.transferable_charge_remainder(_restaurant_id, child.id);
    IF line_remaining IS NULL OR line_remaining < 0 THEN
      line_remaining := 0;
    END IF;
    IF child.category = 'tax' THEN
      tax_remaining := tax_remaining + line_remaining;
    ELSE
      service_remaining := service_remaining + line_remaining;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'parentRemaining', round(parent_remaining, 2),
    'taxRemaining', round(tax_remaining, 2),
    'serviceRemaining', round(service_remaining, 2),
    'grossRemaining', round(parent_remaining + tax_remaining + service_remaining, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_transfer(
  _restaurant_id uuid,
  _source_folio_id uuid,
  _target_folio_id uuid,
  _source_transaction_id uuid,
  _target_window_id uuid,
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
  target_folio public.guest_folios%ROWTYPE;
  source_line public.folio_transactions%ROWTYPE;
  target_window public.guest_folio_windows%ROWTYPE;
  component public.folio_transactions%ROWTYPE;
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
  IF _source_folio_id = _target_folio_id THEN
    RAISE EXCEPTION 'TRANSFER_SAME_FOLIO';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
    LIMIT 1;
    IF FOUND THEN
      IF existing.transaction_type <> 'transfer_out' OR existing.folio_id IS DISTINCT FROM _source_folio_id THEN
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

  SELECT * INTO source_folio FROM public.guest_folios
  WHERE id = _source_folio_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF source_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  SELECT * INTO target_folio FROM public.guest_folios
  WHERE id = _target_folio_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF target_folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  IF source_folio.currency IS DISTINCT FROM target_folio.currency THEN
    RAISE EXCEPTION 'TRANSFER_CURRENCY_MISMATCH';
  END IF;

  SELECT * INTO source_line FROM public.folio_transactions
  WHERE id = _source_transaction_id
    AND restaurant_id = _restaurant_id
    AND folio_id = source_folio.id;
  IF NOT FOUND OR source_line.transaction_type <> 'charge' THEN
    RAISE EXCEPTION 'SOURCE_NOT_A_CHARGE';
  END IF;
  IF source_line.category IN ('tax', 'service_charge') THEN
    RAISE EXCEPTION 'TRANSFER_CHILD_NOT_ALLOWED';
  END IF;

  SELECT * INTO target_window FROM public.guest_folio_windows
  WHERE id = _target_window_id AND restaurant_id = _restaurant_id AND folio_id = target_folio.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TARGET_WINDOW_NOT_FOUND';
  END IF;

  line_remaining := public.transferable_charge_remainder(_restaurant_id, source_line.id);
  IF line_remaining IS NOT NULL AND line_remaining > 0 THEN
    components := components || jsonb_build_array(
      jsonb_build_object('id', source_line.id, 'remaining', line_remaining)
    );
  END IF;

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

  shares := public.allocate_transfer_shares(components, round(_amount, 2));
  gross := 0;
  FOR share_row IN SELECT value FROM jsonb_array_elements(shares) LOOP
    gross := gross + (share_row.value ->> 'share')::numeric;
  END LOOP;
  IF round(gross, 2) IS DISTINCT FROM round(_amount, 2) THEN
    RAISE EXCEPTION 'TRANSFER_ALLOCATION_MISMATCH';
  END IF;

  PERFORM public.ensure_primary_folio_window(_restaurant_id, source_folio.id);

  FOR share_row IN SELECT value FROM jsonb_array_elements(shares) LOOP
    share := share_row.value;
    SELECT * INTO component FROM public.folio_transactions
    WHERE id = (share ->> 'id')::uuid AND restaurant_id = _restaurant_id;

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
    keyed := true;

    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id,
      original_transaction_id, folio_window_id, transfer_id, transfer_direction
    ) VALUES (
      _restaurant_id, target_folio.id, 'transfer_in', 'transfer', clean_desc,
      round((share ->> 'share')::numeric, 2),
      'folio_transfer', transfer, _membership_id,
      component.id, target_window.id, transfer, 'in'
    );
  END LOOP;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, source_folio.id, 'folio_transfer_out', _membership_id, clean_desc,
    jsonb_build_object(
      'transfer_id', transfer,
      'amount', round(_amount, 2),
      'target_folio_id', target_folio.id,
      'source_transaction_id', source_line.id
    )
  );
  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values
  ) VALUES (
    _restaurant_id, target_folio.id, 'folio_transfer_in', _membership_id, clean_desc,
    jsonb_build_object(
      'transfer_id', transfer,
      'amount', round(_amount, 2),
      'source_folio_id', source_folio.id,
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

GRANT EXECUTE ON FUNCTION public.allocate_transfer_shares(jsonb, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.transferable_charge_group_remainder(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_transfer(uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.allocate_transfer_shares(jsonb, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transferable_charge_group_remainder(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_folio_transfer(uuid, uuid, uuid, uuid, uuid, numeric, text, uuid, text) FROM PUBLIC, anon, authenticated;
