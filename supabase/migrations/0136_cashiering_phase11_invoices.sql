-- Cashiering Phase 11 — issued folio invoices (counter + immutable snapshot + reprint).
-- Dual-lane with supabase/migrations/0136_cashiering_phase11_invoices.sql.
-- pms_invoice_settings.prefix/padding seed the live counter; starting_number is not reused as next number.

CREATE TABLE IF NOT EXISTS public.pms_issued_invoice_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_sequence integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_issued_invoice_counters_last_sequence_check CHECK (last_sequence >= 0)
);

COMMENT ON TABLE public.pms_issued_invoice_counters IS
  'Monotonic issued-invoice sequence per property. Seeded from pms_invoice_settings.starting_number on first issue.';

CREATE TABLE IF NOT EXISTS public.guest_folio_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid NOT NULL,
  issued_number text NOT NULL,
  sequence_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  reprint_count integer NOT NULL DEFAULT 0,
  last_reprinted_at timestamptz,
  issued_by_membership_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  CONSTRAINT guest_folio_invoices_folio_fk
    FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT guest_folio_invoices_folio_unique UNIQUE (restaurant_id, folio_id),
  CONSTRAINT guest_folio_invoices_number_unique UNIQUE (restaurant_id, issued_number),
  CONSTRAINT guest_folio_invoices_reprint_count_check CHECK (reprint_count >= 0),
  CONSTRAINT guest_folio_invoices_idempotency_unique UNIQUE (restaurant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS guest_folio_invoices_restaurant_idx
  ON public.guest_folio_invoices (restaurant_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS guest_folio_invoices_folio_idx
  ON public.guest_folio_invoices (folio_id);

COMMENT ON TABLE public.guest_folio_invoices IS
  'Immutable issued invoice snapshot for a guest folio. One issued document per folio. Reprint does not change the number or snapshot.';
COMMENT ON COLUMN public.guest_folio_invoices.snapshot IS
  'Frozen folio ledger + property/guest header at issue time. Tax lines use posted tax_snapshot values.';

GRANT SELECT ON public.guest_folio_invoices TO authenticated;
GRANT ALL ON public.guest_folio_invoices TO service_role;
GRANT ALL ON public.pms_issued_invoice_counters TO service_role;

ALTER TABLE public.guest_folio_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cashiering staff read folio invoices" ON public.guest_folio_invoices;
CREATE POLICY "Cashiering staff read folio invoices"
  ON public.guest_folio_invoices FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

CREATE OR REPLACE FUNCTION public.format_issued_invoice_number(
  _prefix text,
  _sequence integer,
  _padding smallint
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _prefix || lpad(_sequence::text, _padding, '0');
$$;

CREATE OR REPLACE FUNCTION public.build_guest_folio_invoice_snapshot(
  _restaurant_id uuid,
  _folio_id uuid,
  _membership_id uuid,
  _issued_number text,
  _sequence_number integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  settings public.pms_invoice_settings%ROWTYPE;
  prop record;
  guest record;
  res record;
  lines jsonb;
  charge_total numeric(12,2);
  credit_total numeric(12,2);
  balance numeric(12,2);
  tax_total numeric(12,2);
BEGIN
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  SELECT * INTO settings FROM public.pms_invoice_settings
  WHERE restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_SETTINGS_REQUIRED';
  END IF;

  SELECT
    r.currency_code,
    r.legal_entity_name,
    r.legal_name,
    r.brand_name,
    r.trading_name,
    r.vat_number,
    r.vat_registered
  INTO prop
  FROM public.restaurants r
  WHERE r.id = _restaurant_id;

  SELECT gp.first_name, gp.last_name, gp.email, gp.phone
  INTO guest
  FROM public.guest_profiles gp
  WHERE gp.id = folio.guest_id AND gp.restaurant_id = _restaurant_id;

  SELECT hr.confirmation_number, hr.arrival_date, hr.departure_date, hr.status
  INTO res
  FROM public.hotel_reservations hr
  WHERE hr.id = folio.reservation_id AND hr.restaurant_id = _restaurant_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'transactionType', t.transaction_type,
      'category', t.category,
      'description', t.description,
      'amount', round(t.amount, 2),
      'postedAt', t.posted_at,
      'paymentMethod', t.payment_method,
      'taxSnapshot', t.tax_snapshot,
      'originalTransactionId', t.original_transaction_id
    ) ORDER BY t.posted_at, t.created_at
  ), '[]'::jsonb)
  INTO lines
  FROM public.folio_transactions t
  WHERE t.restaurant_id = _restaurant_id AND t.folio_id = folio.id;

  SELECT
    COALESCE(sum(CASE WHEN amount >= 0 THEN amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0),
    COALESCE(sum(amount), 0),
    COALESCE(sum(CASE WHEN category = 'tax' THEN amount ELSE 0 END), 0)
  INTO charge_total, credit_total, balance, tax_total
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = folio.id;

  RETURN jsonb_build_object(
    'version', 1,
    'issuedAt', now(),
    'issuerMembershipId', _membership_id,
    'document', jsonb_build_object(
      'issuedNumber', _issued_number,
      'sequenceNumber', _sequence_number,
      'prefix', settings.prefix,
      'numberPadding', settings.number_padding,
      'taxDisplay', settings.tax_display,
      'invoiceFormat', settings.invoice_format
    ),
    'property', jsonb_build_object(
      'currencyCode', COALESCE(folio.currency, prop.currency_code, 'GBP'),
      'legalEntityName', prop.legal_entity_name,
      'legalName', prop.legal_name,
      'brandName', prop.brand_name,
      'tradingName', prop.trading_name,
      'vatNumber', prop.vat_number,
      'vatRegistered', prop.vat_registered
    ),
    'folio', jsonb_build_object(
      'id', folio.id,
      'folioNumber', folio.folio_number,
      'status', folio.status,
      'currency', folio.currency,
      'guestName', trim(both ' ' from concat(COALESCE(guest.first_name, ''), ' ', COALESCE(guest.last_name, ''))),
      'guestEmail', guest.email,
      'guestPhone', guest.phone,
      'confirmationNumber', res.confirmation_number,
      'arrivalDate', res.arrival_date,
      'departureDate', res.departure_date,
      'reservationStatus', res.status
    ),
    'lines', lines,
    'totals', jsonb_build_object(
      'charges', round(charge_total, 2),
      'credits', round(credit_total, 2),
      'balance', round(balance, 2),
      'tax', round(tax_total, 2)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_guest_folio_invoice(
  _restaurant_id uuid,
  _folio_id uuid,
  _membership_id uuid,
  _idempotency_key text DEFAULT NULL
) RETURNS public.guest_folio_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  settings public.pms_invoice_settings%ROWTYPE;
  existing public.guest_folio_invoices%ROWTYPE;
  invoice public.guest_folio_invoices%ROWTYPE;
  next_seq integer;
  issued_num text;
  snap jsonb;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  line_count integer;
BEGIN
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF existing.folio_id IS DISTINCT FROM _folio_id THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN existing;
    END IF;
  END IF;

  SELECT * INTO existing FROM public.guest_folio_invoices
  WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id;
  IF FOUND THEN
    RAISE EXCEPTION 'INVOICE_ALREADY_ISSUED';
  END IF;

  SELECT count(*) INTO line_count FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id;
  IF line_count = 0 THEN
    RAISE EXCEPTION 'INVOICE_FOLIO_EMPTY';
  END IF;

  SELECT * INTO settings FROM public.pms_invoice_settings
  WHERE restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_SETTINGS_REQUIRED';
  END IF;

  INSERT INTO public.pms_issued_invoice_counters (restaurant_id, last_sequence)
  VALUES (_restaurant_id, settings.starting_number - 1)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT last_sequence INTO next_seq FROM public.pms_issued_invoice_counters
  WHERE restaurant_id = _restaurant_id
  FOR UPDATE;

  next_seq := next_seq + 1;
  UPDATE public.pms_issued_invoice_counters
  SET last_sequence = next_seq, updated_at = now()
  WHERE restaurant_id = _restaurant_id;

  issued_num := public.format_issued_invoice_number(settings.prefix, next_seq, settings.number_padding);
  snap := public.build_guest_folio_invoice_snapshot(
    _restaurant_id, _folio_id, _membership_id, issued_num, next_seq
  );

  INSERT INTO public.guest_folio_invoices (
    restaurant_id, folio_id, issued_number, sequence_number, snapshot,
    issued_by_membership_id, idempotency_key
  ) VALUES (
    _restaurant_id, _folio_id, issued_num, next_seq, snap,
    _membership_id, clean_key
  ) RETURNING * INTO invoice;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, _folio_id, 'invoice_issued',
    jsonb_build_object(
      'invoice_id', invoice.id,
      'issued_number', invoice.issued_number,
      'sequence_number', invoice.sequence_number
    ),
    _membership_id
  );

  RETURN invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprint_guest_folio_invoice(
  _restaurant_id uuid,
  _invoice_id uuid,
  _membership_id uuid
) RETURNS public.guest_folio_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invoice public.guest_folio_invoices%ROWTYPE;
BEGIN
  UPDATE public.guest_folio_invoices
  SET reprint_count = reprint_count + 1,
      last_reprinted_at = now()
  WHERE id = _invoice_id AND restaurant_id = _restaurant_id
  RETURNING * INTO invoice;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, invoice.folio_id, 'invoice_reprinted',
    jsonb_build_object(
      'invoice_id', invoice.id,
      'issued_number', invoice.issued_number,
      'reprint_count', invoice.reprint_count
    ),
    _membership_id
  );

  RETURN invoice;
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
    'invoice_issued','invoice_reprinted'
  ])
);

REVOKE ALL ON FUNCTION public.format_issued_invoice_number(text, integer, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_guest_folio_invoice_snapshot(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_guest_folio_invoice(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprint_guest_folio_invoice(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.format_issued_invoice_number(text, integer, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_guest_folio_invoice_snapshot(uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_guest_folio_invoice(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprint_guest_folio_invoice(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.issue_guest_folio_invoice(uuid, uuid, uuid, text) IS
  'Issue one immutable invoice snapshot for a guest folio. Allocates the next number from pms_issued_invoice_counters. Duplicate folio issue fails; idempotency key replays the same row.';
COMMENT ON FUNCTION public.reprint_guest_folio_invoice(uuid, uuid, uuid) IS
  'Audit reprint of an issued folio invoice. Does not change issued_number or snapshot.';
