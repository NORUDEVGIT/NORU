-- Company withholding certificates.
-- A certificate is a non-cash settlement. It inserts one immutable ledger
-- adjustment and one immutable certificate row. It is not a payment, deposit,
-- refund, discount, write-off, credit note, or debit note.
-- Outstanding stays derived: invoice effective net minus payment allocations
-- minus active withholding. No invoice balance column is added.
-- Active withholding is a positive certificate that has not been reversed.
-- Reversal is a new certificate and a positive ledger row. Full reversal only.

CREATE TABLE public.withholding_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  financial_account_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  ledger_transaction_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  pretax_base numeric(12,2) NOT NULL,
  currency text NOT NULL,
  certificate_date date NOT NULL,
  reference text,
  reason text,
  reverses_certificate_id uuid,
  idempotency_key text,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT withholding_certificates_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT withholding_certificates_amount_positive CHECK (amount > 0),
  CONSTRAINT withholding_certificates_pretax_positive CHECK (pretax_base > 0),
  CONSTRAINT withholding_certificates_currency_etb CHECK (currency = 'ETB'),
  CONSTRAINT withholding_certificates_reference_length CHECK (
    reference IS NULL OR char_length(reference) <= 80
  ),
  CONSTRAINT withholding_certificates_reason_length CHECK (
    reason IS NULL OR char_length(reason) <= 500
  ),
  CONSTRAINT withholding_certificates_key_length CHECK (
    idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 80
  ),
  CONSTRAINT withholding_certificates_reversal_reason CHECK (
    reverses_certificate_id IS NULL
    OR NULLIF(btrim(COALESCE(reason, '')), '') IS NOT NULL
  ),
  CONSTRAINT withholding_certificates_account_property
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts (id, restaurant_id),
  CONSTRAINT withholding_certificates_invoice_property
    FOREIGN KEY (invoice_id, restaurant_id)
    REFERENCES public.financial_account_invoices (id, restaurant_id),
  CONSTRAINT withholding_certificates_ledger_property
    FOREIGN KEY (ledger_transaction_id, restaurant_id)
    REFERENCES public.folio_transactions (id, restaurant_id),
  CONSTRAINT withholding_certificates_reversal_property
    FOREIGN KEY (reverses_certificate_id, restaurant_id)
    REFERENCES public.withholding_certificates (id, restaurant_id)
);

CREATE INDEX withholding_certificates_invoice_idx
  ON public.withholding_certificates (invoice_id);
CREATE INDEX withholding_certificates_account_idx
  ON public.withholding_certificates (financial_account_id);
CREATE UNIQUE INDEX withholding_certificates_idempotency
  ON public.withholding_certificates (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX withholding_certificates_one_reversal
  ON public.withholding_certificates (reverses_certificate_id)
  WHERE reverses_certificate_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.withholding_certificates_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WITHHOLDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withholding_certificates_no_mutation
  ON public.withholding_certificates;
CREATE TRIGGER withholding_certificates_no_mutation
  BEFORE UPDATE OR DELETE ON public.withholding_certificates
  FOR EACH ROW EXECUTE FUNCTION public.withholding_certificates_immutable();

ALTER TABLE public.withholding_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cashiering staff read withholding certificates"
  ON public.withholding_certificates;
CREATE POLICY "Cashiering staff read withholding certificates"
  ON public.withholding_certificates FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

GRANT SELECT ON public.withholding_certificates TO authenticated;
GRANT ALL ON public.withholding_certificates TO service_role;

CREATE OR REPLACE FUNCTION public.withholding_certificates_ledger_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  ledger public.folio_transactions%ROWTYPE;
  expected numeric(12,2);
BEGIN
  SELECT * INTO ledger FROM public.folio_transactions
  WHERE id = NEW.ledger_transaction_id AND restaurant_id = NEW.restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WITHHOLDING_LEDGER_INVALID'; END IF;
  expected := CASE
    WHEN NEW.reverses_certificate_id IS NULL THEN round(-NEW.amount, 2)
    ELSE round(NEW.amount, 2)
  END;
  IF ledger.financial_account_id IS DISTINCT FROM NEW.financial_account_id
    OR ledger.folio_id IS NOT NULL
    OR ledger.transaction_type IS DISTINCT FROM 'adjustment'
    OR ledger.category IS DISTINCT FROM 'adjustment'
    OR ledger.reference_type IS DISTINCT FROM 'withholding_certificate'
    OR ledger.payment_method IS NOT NULL
    OR ledger.hotel_cashier_shift_id IS NOT NULL
    OR ledger.amount IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'WITHHOLDING_LEDGER_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withholding_certificates_ledger_check
  ON public.withholding_certificates;
CREATE TRIGGER withholding_certificates_ledger_check
  BEFORE INSERT ON public.withholding_certificates
  FOR EACH ROW EXECUTE FUNCTION public.withholding_certificates_ledger_check();

CREATE OR REPLACE FUNCTION public.account_invoice_active_withholding(
  _restaurant_id uuid,
  _invoice_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(round(sum(certificate.amount), 2), 0)
  FROM public.withholding_certificates certificate
  WHERE certificate.restaurant_id = _restaurant_id
    AND certificate.invoice_id = _invoice_id
    AND certificate.reverses_certificate_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.withholding_certificates reversal
      WHERE reversal.reverses_certificate_id = certificate.id
    );
$$;

REVOKE ALL ON FUNCTION public.account_invoice_active_withholding(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_invoice_active_withholding(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_withholding_certificate(
  _restaurant_id uuid,
  _invoice_id uuid,
  _amount numeric,
  _pretax_base numeric,
  _certificate_date date,
  _reference text,
  _reason text,
  _idempotency_key text,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv public.financial_account_invoices%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  existing public.withholding_certificates%ROWTYPE;
  ledger public.folio_transactions%ROWTYPE;
  created public.withholding_certificates%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_reference text := NULLIF(btrim(COALESCE(_reference, '')), '');
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  invoice_total numeric(12,2);
  note_delta numeric(12,2);
  allocated numeric(12,2);
  withheld numeric(12,2);
  available numeric(12,2);
  inv_currency text;
BEGIN
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN RAISE EXCEPTION 'WITHHOLDING_AMOUNT_INVALID'; END IF;
  IF _pretax_base IS NULL OR round(_pretax_base, 2) <= 0 THEN RAISE EXCEPTION 'WITHHOLDING_PRETAX_INVALID'; END IF;
  IF _certificate_date IS NULL THEN RAISE EXCEPTION 'WITHHOLDING_DATE_REQUIRED'; END IF;

  SELECT * INTO existing FROM public.withholding_certificates
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF existing.invoice_id IS DISTINCT FROM _invoice_id
      OR existing.amount IS DISTINCT FROM round(_amount, 2)
      OR existing.reverses_certificate_id IS NOT NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'id', existing.id, 'ledgerTransactionId', existing.ledger_transaction_id);
  END IF;

  SELECT * INTO inv FROM public.financial_account_invoices
  WHERE id = _invoice_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR inv.issued_number IS NULL OR inv.snapshot IS NULL THEN
    RAISE EXCEPTION 'WITHHOLDING_NOT_ISSUED';
  END IF;
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = inv.financial_account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.account_kind IS DISTINCT FROM 'company' THEN RAISE EXCEPTION 'WITHHOLDING_NOT_COMPANY'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;
  inv_currency := COALESCE(NULLIF(inv.snapshot->'account'->>'currency', ''), acct.currency);
  IF inv_currency IS DISTINCT FROM 'ETB' OR acct.currency IS DISTINCT FROM 'ETB' THEN
    RAISE EXCEPTION 'WITHHOLDING_CURRENCY_UNSUPPORTED';
  END IF;

  invoice_total := round(COALESCE(
    (inv.snapshot->'totals'->>'invoiceTotal')::numeric,
    (inv.snapshot->'totals'->>'balance')::numeric, 0), 2);
  SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
  FROM public.invoice_credit_notes
  WHERE restaurant_id = _restaurant_id AND account_invoice_id = inv.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND invoice_id = inv.id;
  withheld := public.account_invoice_active_withholding(_restaurant_id, inv.id);
  available := round(invoice_total + note_delta - allocated - withheld, 2);
  IF round(_amount, 2) > available + 0.01 THEN
    RAISE EXCEPTION 'WITHHOLDING_EXCEEDS_OUTSTANDING';
  END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, financial_account_id, transaction_type, category, description, amount,
    reference_type, posted_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, 'adjustment', 'adjustment',
    'Withholding certificate', round(-_amount, 2),
    'withholding_certificate', _membership_id
  ) RETURNING * INTO ledger;

  INSERT INTO public.withholding_certificates (
    restaurant_id, financial_account_id, invoice_id, ledger_transaction_id,
    amount, pretax_base, currency, certificate_date, reference, reason,
    idempotency_key, created_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, inv.id, ledger.id,
    round(_amount, 2), round(_pretax_base, 2), 'ETB', _certificate_date,
    clean_reference, clean_reason, clean_key, _membership_id
  ) RETURNING * INTO created;

  RETURN jsonb_build_object(
    'replayed', false,
    'id', created.id,
    'ledgerTransactionId', ledger.id,
    'amount', created.amount,
    'outstanding', round(available - created.amount, 2)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.withholding_certificates
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND AND existing.reverses_certificate_id IS NULL THEN
      RETURN jsonb_build_object('replayed', true, 'id', existing.id, 'ledgerTransactionId', existing.ledger_transaction_id);
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_withholding_certificate(uuid, uuid, numeric, numeric, date, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_withholding_certificate(uuid, uuid, numeric, numeric, date, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_withholding_certificate(
  _restaurant_id uuid,
  _certificate_id uuid,
  _reason text,
  _idempotency_key text,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  original public.withholding_certificates%ROWTYPE;
  existing public.withholding_certificates%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  ledger public.folio_transactions%ROWTYPE;
  created public.withholding_certificates%ROWTYPE;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF clean_key IS NULL OR char_length(clean_key) < 8 OR char_length(clean_key) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  SELECT * INTO existing FROM public.withholding_certificates
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF existing.reverses_certificate_id IS DISTINCT FROM _certificate_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'id', existing.id, 'ledgerTransactionId', existing.ledger_transaction_id);
  END IF;

  SELECT * INTO original FROM public.withholding_certificates
  WHERE id = _certificate_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR original.reverses_certificate_id IS NOT NULL THEN
    RAISE EXCEPTION 'WITHHOLDING_NOT_REVERSIBLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.withholding_certificates reversal
    WHERE reversal.reverses_certificate_id = original.id
  ) THEN
    RAISE EXCEPTION 'WITHHOLDING_ALREADY_REVERSED';
  END IF;
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = original.financial_account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, financial_account_id, transaction_type, category, description, amount,
    reference_type, posted_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, 'adjustment', 'adjustment',
    'Withholding reversal', round(original.amount, 2),
    'withholding_certificate', _membership_id
  ) RETURNING * INTO ledger;

  INSERT INTO public.withholding_certificates (
    restaurant_id, financial_account_id, invoice_id, ledger_transaction_id,
    amount, pretax_base, currency, certificate_date, reference, reason,
    reverses_certificate_id, idempotency_key, created_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, original.invoice_id, ledger.id,
    original.amount, original.pretax_base, original.currency, original.certificate_date,
    original.reference, clean_reason, original.id, clean_key, _membership_id
  ) RETURNING * INTO created;

  RETURN jsonb_build_object(
    'replayed', false,
    'id', created.id,
    'ledgerTransactionId', ledger.id,
    'amount', created.amount
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.withholding_certificates
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND AND existing.reverses_certificate_id = _certificate_id THEN
      RETURN jsonb_build_object('replayed', true, 'id', existing.id, 'ledgerTransactionId', existing.ledger_transaction_id);
    END IF;
    RAISE EXCEPTION 'WITHHOLDING_ALREADY_REVERSED';
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_withholding_certificate(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_withholding_certificate(uuid, uuid, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.invoice_credit_notes_withholding_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  inv public.financial_account_invoices%ROWTYPE;
  invoice_total numeric(12,2);
  existing_delta numeric(12,2);
  allocated numeric(12,2);
  withheld numeric(12,2);
  projected numeric(12,2);
  settled numeric(12,2);
BEGIN
  IF NEW.account_invoice_id IS NULL
    OR NEW.note_type IS DISTINCT FROM 'credit'
    OR COALESCE(NEW.total_delta, 0) >= 0 THEN
    RETURN NEW;
  END IF;
  SELECT * INTO inv FROM public.financial_account_invoices
  WHERE id = NEW.account_invoice_id AND restaurant_id = NEW.restaurant_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  invoice_total := round(COALESCE(
    (inv.snapshot->'totals'->>'invoiceTotal')::numeric,
    (inv.snapshot->'totals'->>'balance')::numeric, 0), 2);
  SELECT COALESCE(round(sum(prior.total_delta), 2), 0) INTO existing_delta
  FROM public.invoice_credit_notes prior
  WHERE prior.restaurant_id = NEW.restaurant_id
    AND prior.account_invoice_id = NEW.account_invoice_id
    AND prior.id IS DISTINCT FROM NEW.id;
  projected := round(invoice_total + existing_delta + NEW.total_delta, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = NEW.restaurant_id AND invoice_id = NEW.account_invoice_id;
  withheld := public.account_invoice_active_withholding(NEW.restaurant_id, NEW.account_invoice_id);
  settled := round(allocated + withheld, 2);
  IF projected < settled - 0.01 THEN
    RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE_NET:%:%:%',
      COALESCE(NEW.currency, 'ETB'),
      to_char(settled, 'FM999999990.00'),
      to_char(round(settled - projected, 2), 'FM999999990.00');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_credit_notes_withholding_guard
  ON public.invoice_credit_notes;
CREATE TRIGGER invoice_credit_notes_withholding_guard
  BEFORE INSERT ON public.invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.invoice_credit_notes_withholding_guard();

CREATE OR REPLACE FUNCTION public.preview_financial_account_payment_allocation(
  _restaurant_id uuid,
  _account_id uuid,
  _payment_id uuid,
  _targets jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  item jsonb;
  inv public.financial_account_invoices%ROWTYPE;
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
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = _payment_id AND restaurant_id = _restaurant_id AND financial_account_id = acct.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_ACCOUNT'; END IF;
  IF pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_PAYMENT';
  END IF;
  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND financial_account_id = acct.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND payment_transaction_id = pay.id;
  available := round(face - refunded - allocated, 2);
  FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    proposed := round(COALESCE((item->>'amount')::numeric, 0), 2);
    IF proposed <= 0 THEN RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID'; END IF;
    invoice_id := (item->>'invoiceId')::uuid;
    IF invoice_id = ANY(seen) THEN RAISE EXCEPTION 'ALLOCATION_DUPLICATE_TARGET'; END IF;
    seen := array_append(seen, invoice_id);
    SELECT * INTO inv FROM public.financial_account_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.financial_account_id IS DISTINCT FROM acct.id THEN
      RAISE EXCEPTION 'ALLOCATION_ACCOUNT_MISMATCH';
    END IF;
    IF inv.issued_number IS NULL OR inv.snapshot IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(NULLIF(inv.snapshot->'account'->>'currency', ''), acct.currency);
    IF inv_currency IS DISTINCT FROM acct.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round(COALESCE(
      (inv.snapshot->'totals'->>'invoiceTotal')::numeric,
      (inv.snapshot->'totals'->>'balance')::numeric, 0), 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND account_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(effective_net - inv_allocated - public.account_invoice_active_withholding(_restaurant_id, inv.id), 2);
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
      'available', available, 'currency', acct.currency
    ),
    'targets', lines,
    'operationTotal', operation_total,
    'remainingAvailable', round(available - operation_total, 2)
  );
END;
$$;


REVOKE ALL ON FUNCTION public.preview_financial_account_payment_allocation(uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_financial_account_payment_allocation(uuid, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_financial_account_payment_allocations(
  _restaurant_id uuid,
  _account_id uuid,
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
  acct public.financial_accounts%ROWTYPE;
  pay public.folio_transactions%ROWTYPE;
  anchor public.financial_account_payment_allocations%ROWTYPE;
  inv public.financial_account_invoices%ROWTYPE;
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

  SELECT * INTO anchor FROM public.financial_account_payment_allocations
  WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
  IF FOUND THEN
    IF anchor.amount < 0
      OR anchor.financial_account_id IS DISTINCT FROM _account_id
      OR anchor.payment_transaction_id IS DISTINCT FROM _payment_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT count(*) INTO matched
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND operation_id = anchor.operation_id;
    IF matched IS DISTINCT FROM jsonb_array_length(_targets) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.financial_account_payment_allocations existing
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
        FROM public.financial_account_payment_allocations row
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

  -- Lock order: 1 financial_accounts, 2 payment folio_transactions, 3 invoices by id.
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF acct.status <> 'open' THEN RAISE EXCEPTION 'ACCOUNT_CLOSED'; END IF;

  SELECT * INTO pay FROM public.folio_transactions
  WHERE id = _payment_id AND restaurant_id = _restaurant_id AND financial_account_id = acct.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOURCE_NOT_ON_ACCOUNT'; END IF;
  IF pay.transaction_type IS DISTINCT FROM 'payment' OR pay.amount >= 0 THEN
    RAISE EXCEPTION 'ALLOCATION_NOT_A_PAYMENT';
  END IF;

  PERFORM inv_lock.id FROM public.financial_account_invoices inv_lock
  WHERE inv_lock.restaurant_id = _restaurant_id AND inv_lock.id = ANY(invoice_ids)
  ORDER BY inv_lock.id
  FOR UPDATE;

  face := round(-pay.amount, 2);
  SELECT COALESCE(round(sum(amount), 2), 0) INTO refunded
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND financial_account_id = acct.id
    AND transaction_type = 'refund' AND original_transaction_id = pay.id;
  SELECT COALESCE(round(sum(amount), 2), 0) INTO allocated
  FROM public.financial_account_payment_allocations
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
    SELECT * INTO inv FROM public.financial_account_invoices
    WHERE id = invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF inv.financial_account_id IS DISTINCT FROM acct.id THEN
      RAISE EXCEPTION 'ALLOCATION_ACCOUNT_MISMATCH';
    END IF;
    IF inv.issued_number IS NULL OR inv.snapshot IS NULL THEN
      RAISE EXCEPTION 'ALLOCATION_NOT_ISSUED';
    END IF;
    inv_currency := COALESCE(NULLIF(inv.snapshot->'account'->>'currency', ''), acct.currency);
    IF inv_currency IS DISTINCT FROM acct.currency THEN
      RAISE EXCEPTION 'ALLOCATION_CURRENCY_MISMATCH';
    END IF;
    invoice_total := round(COALESCE(
      (inv.snapshot->'totals'->>'invoiceTotal')::numeric,
      (inv.snapshot->'totals'->>'balance')::numeric, 0), 2);
    SELECT COALESCE(round(sum(total_delta), 2), 0) INTO note_delta
    FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND account_invoice_id = inv.id;
    SELECT COALESCE(round(sum(amount), 2), 0) INTO inv_allocated
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND invoice_id = inv.id;
    effective_net := round(invoice_total + note_delta, 2);
    outstanding := round(effective_net - inv_allocated - public.account_invoice_active_withholding(_restaurant_id, inv.id), 2);
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
    INSERT INTO public.financial_account_payment_allocations (
      restaurant_id, financial_account_id, payment_transaction_id, invoice_id, amount,
      reverses_allocation_id, operation_id, idempotency_key, reason, created_by_membership_id
    ) VALUES (
      _restaurant_id, acct.id, pay.id, invoice_id, proposed,
      NULL, op_id,
      CASE WHEN invoice_id = invoice_ids[1] THEN clean_key ELSE NULL END,
      NULL, _membership_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'replayed', false,
    'operationId', op_id,
    'rows', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', row.id, 'invoiceId', row.invoice_id, 'amount', row.amount, 'operationId', row.operation_id
      ) ORDER BY row.invoice_id), '[]'::jsonb)
      FROM public.financial_account_payment_allocations row
      WHERE row.operation_id = op_id
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO anchor FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF NOT FOUND OR anchor.amount < 0
      OR anchor.financial_account_id IS DISTINCT FROM _account_id
      OR anchor.payment_transaction_id IS DISTINCT FROM _payment_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT count(*) INTO matched
    FROM public.financial_account_payment_allocations
    WHERE restaurant_id = _restaurant_id AND operation_id = anchor.operation_id;
    IF matched IS DISTINCT FROM jsonb_array_length(_targets) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(_targets) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.financial_account_payment_allocations existing
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
        FROM public.financial_account_payment_allocations row
        WHERE row.restaurant_id = _restaurant_id AND row.operation_id = anchor.operation_id
      )
    );
END;
$$;


REVOKE ALL ON FUNCTION public.apply_financial_account_payment_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_financial_account_payment_allocations(uuid, uuid, uuid, jsonb, numeric, text, uuid) TO service_role;
