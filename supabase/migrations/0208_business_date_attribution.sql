-- Business Date attribution. Additive only.
--
-- restaurants.business_date is the hotel day. Every financial row below now
-- carries the hotel day it belongs to, stamped by the database on insert.
-- A client value is always overwritten. Physical timestamps (posted_at,
-- opened_at, issued_at, created_at) are unchanged.
--
-- Historical rows are backfilled from their physical timestamp converted to
-- the property-local calendar date. That value is derived, not recorded: a
-- row posted after midnight but before that night's close was really part of
-- the previous hotel day. New rows are exact.
--
-- Locking: the stamp reads restaurants.business_date with FOR SHARE.
-- close_business_date and adjust_business_date take FOR UPDATE on the same
-- row, so a post commits entirely before or entirely after a close. Two rows
-- written in one transaction (a transfer pair) always share a date.

-- 1. Canonical resolver ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_property_business_date(_restaurant_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stored date;
  _timezone text;
BEGIN
  IF _restaurant_id IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_DATE_UNRESOLVED';
  END IF;

  SELECT business_date, timezone INTO _stored, _timezone
    FROM public.restaurants
   WHERE id = _restaurant_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUSINESS_DATE_UNRESOLVED';
  END IF;

  IF _stored IS NOT NULL THEN
    RETURN _stored;
  END IF;

  -- Never closed yet: property-local today, the same rule the app and
  -- adjust_business_date already use. A missing or invalid zone fails.
  IF _timezone IS NULL OR btrim(_timezone) = '' THEN
    RAISE EXCEPTION 'BUSINESS_DATE_UNRESOLVED';
  END IF;
  BEGIN
    RETURN (now() AT TIME ZONE _timezone)::date;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'BUSINESS_DATE_UNRESOLVED';
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.current_property_business_date(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_property_business_date(uuid) TO service_role;

COMMENT ON FUNCTION public.current_property_business_date(uuid) IS
  'Current hotel day for a property. Takes FOR SHARE on the restaurants row so it cannot interleave with close_business_date.';

-- 2. Columns ---------------------------------------------------------------

ALTER TABLE public.folio_transactions ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.hotel_cashier_shifts ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.hotel_drawer_movements ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.guest_folio_invoices ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.financial_account_invoices ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.invoice_credit_notes ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.guest_payment_invoice_allocations ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.guest_deposit_invoice_allocations ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.folio_deposit_allocations ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.financial_account_payment_allocations ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.withholding_certificates ADD COLUMN IF NOT EXISTS business_date date;
ALTER TABLE public.fiscal_registrations ADD COLUMN IF NOT EXISTS business_date date;

-- 3. Backfill (derived) ----------------------------------------------------
-- Append-only guards reject any UPDATE on most of these tables, so user
-- triggers are paused for the backfill only. An unknown zone falls back to UTC
-- here so the migration cannot fail on one bad property row.

ALTER TABLE public.folio_transactions DISABLE TRIGGER USER;
UPDATE public.folio_transactions t
   SET business_date = (t.posted_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = t.restaurant_id
   AND t.business_date IS NULL;
ALTER TABLE public.folio_transactions ENABLE TRIGGER USER;

ALTER TABLE public.hotel_cashier_shifts DISABLE TRIGGER USER;
UPDATE public.hotel_cashier_shifts s
   SET business_date = (s.opened_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = s.restaurant_id
   AND s.business_date IS NULL;
ALTER TABLE public.hotel_cashier_shifts ENABLE TRIGGER USER;

ALTER TABLE public.hotel_drawer_movements DISABLE TRIGGER USER;
UPDATE public.hotel_drawer_movements m
   SET business_date = s.business_date
  FROM public.hotel_cashier_shifts s
 WHERE s.id = m.hotel_cashier_shift_id
   AND s.restaurant_id = m.restaurant_id
   AND m.business_date IS NULL;
ALTER TABLE public.hotel_drawer_movements ENABLE TRIGGER USER;

ALTER TABLE public.guest_folio_invoices DISABLE TRIGGER USER;
UPDATE public.guest_folio_invoices i
   SET business_date = (i.issued_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = i.restaurant_id
   AND i.business_date IS NULL;
ALTER TABLE public.guest_folio_invoices ENABLE TRIGGER USER;

ALTER TABLE public.financial_account_invoices DISABLE TRIGGER USER;
UPDATE public.financial_account_invoices i
   SET business_date = (i.issued_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = i.restaurant_id
   AND i.business_date IS NULL;
ALTER TABLE public.financial_account_invoices ENABLE TRIGGER USER;

ALTER TABLE public.invoice_credit_notes DISABLE TRIGGER USER;
UPDATE public.invoice_credit_notes n
   SET business_date = (n.issued_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = n.restaurant_id
   AND n.business_date IS NULL;
ALTER TABLE public.invoice_credit_notes ENABLE TRIGGER USER;

ALTER TABLE public.guest_payment_invoice_allocations DISABLE TRIGGER USER;
UPDATE public.guest_payment_invoice_allocations a
   SET business_date = (a.created_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = a.restaurant_id
   AND a.business_date IS NULL;
ALTER TABLE public.guest_payment_invoice_allocations ENABLE TRIGGER USER;

ALTER TABLE public.guest_deposit_invoice_allocations DISABLE TRIGGER USER;
UPDATE public.guest_deposit_invoice_allocations a
   SET business_date = (a.created_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = a.restaurant_id
   AND a.business_date IS NULL;
ALTER TABLE public.guest_deposit_invoice_allocations ENABLE TRIGGER USER;

ALTER TABLE public.folio_deposit_allocations DISABLE TRIGGER USER;
UPDATE public.folio_deposit_allocations a
   SET business_date = (a.created_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = a.restaurant_id
   AND a.business_date IS NULL;
ALTER TABLE public.folio_deposit_allocations ENABLE TRIGGER USER;

ALTER TABLE public.financial_account_payment_allocations DISABLE TRIGGER USER;
UPDATE public.financial_account_payment_allocations a
   SET business_date = (a.created_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = a.restaurant_id
   AND a.business_date IS NULL;
ALTER TABLE public.financial_account_payment_allocations ENABLE TRIGGER USER;

ALTER TABLE public.withholding_certificates DISABLE TRIGGER USER;
UPDATE public.withholding_certificates c
   SET business_date = (c.created_at AT TIME ZONE z.tz)::date
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = c.restaurant_id
   AND c.business_date IS NULL;
ALTER TABLE public.withholding_certificates ENABLE TRIGGER USER;

-- 4. Fiscal source attribution ---------------------------------------------
-- A registration belongs to its source document's hotel day, not to the day
-- it happened to be sent or retried.

CREATE OR REPLACE FUNCTION public.fiscal_source_business_date(
  _restaurant_id uuid,
  _source_type text,
  _source_id uuid
) RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _date date;
BEGIN
  IF _source_type = 'guest_invoice' THEN
    SELECT business_date INTO _date FROM public.guest_folio_invoices
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
  ELSIF _source_type = 'account_invoice' THEN
    SELECT business_date INTO _date FROM public.financial_account_invoices
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
  ELSIF _source_type IN ('credit_note', 'debit_note') THEN
    SELECT business_date INTO _date FROM public.invoice_credit_notes
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
  ELSIF _source_type = 'guest_allocation' THEN
    SELECT business_date INTO _date FROM public.guest_payment_invoice_allocations
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
    IF _date IS NULL THEN
      SELECT business_date INTO _date FROM public.guest_deposit_invoice_allocations
       WHERE id = _source_id AND restaurant_id = _restaurant_id;
    END IF;
  ELSIF _source_type = 'account_allocation' THEN
    SELECT business_date INTO _date FROM public.financial_account_payment_allocations
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
  ELSIF _source_type = 'withholding' THEN
    SELECT business_date INTO _date FROM public.withholding_certificates
     WHERE id = _source_id AND restaurant_id = _restaurant_id;
  END IF;
  RETURN _date;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_source_business_date(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_source_business_date(uuid, text, uuid) TO service_role;

ALTER TABLE public.fiscal_registrations DISABLE TRIGGER USER;
UPDATE public.fiscal_registrations f
   SET business_date = COALESCE(
         public.fiscal_source_business_date(f.restaurant_id, f.source_type, f.source_id),
         (f.created_at AT TIME ZONE z.tz)::date
       )
  FROM (
    SELECT r.id,
           CASE WHEN r.timezone IN (SELECT name FROM pg_timezone_names) THEN r.timezone ELSE 'UTC' END AS tz
      FROM public.restaurants r
  ) z
 WHERE z.id = f.restaurant_id
   AND f.business_date IS NULL;
ALTER TABLE public.fiscal_registrations ENABLE TRIGGER USER;

-- 5. Insert stamps ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.business_date_stamp_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.business_date := public.current_property_business_date(NEW.restaurant_id);
  RETURN NEW;
END;
$$;

-- Cash on a hotel drawer belongs to the drawer's hotel day. Everything else
-- belongs to the current property hotel day. The property row is always
-- locked first so a post cannot interleave with a close.
CREATE OR REPLACE FUNCTION public.folio_transactions_business_date_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current date;
  _shift_date date;
BEGIN
  _current := public.current_property_business_date(NEW.restaurant_id);
  IF NEW.hotel_cashier_shift_id IS NOT NULL THEN
    SELECT business_date INTO _shift_date
      FROM public.hotel_cashier_shifts
     WHERE id = NEW.hotel_cashier_shift_id
       AND restaurant_id = NEW.restaurant_id;
  END IF;
  NEW.business_date := COALESCE(_shift_date, _current);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_drawer_movements_business_date_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shift_date date;
BEGIN
  SELECT business_date INTO _shift_date
    FROM public.hotel_cashier_shifts
   WHERE id = NEW.hotel_cashier_shift_id
     AND restaurant_id = NEW.restaurant_id;
  NEW.business_date := COALESCE(_shift_date, public.current_property_business_date(NEW.restaurant_id));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_registrations_business_date_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.business_date := COALESCE(
    public.fiscal_source_business_date(NEW.restaurant_id, NEW.source_type, NEW.source_id),
    public.current_property_business_date(NEW.restaurant_id)
  );
  RETURN NEW;
END;
$$;

-- Once set, the hotel day of a row never moves. A correction is a new row on
-- the day it is made; the original keeps its date.
CREATE OR REPLACE FUNCTION public.business_date_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.business_date IS NOT NULL AND NEW.business_date IS DISTINCT FROM OLD.business_date THEN
    RAISE EXCEPTION 'BUSINESS_DATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.business_date_stamp_property() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.folio_transactions_business_date_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hotel_drawer_movements_business_date_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiscal_registrations_business_date_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_date_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS folio_transactions_business_date_stamp ON public.folio_transactions;
CREATE TRIGGER folio_transactions_business_date_stamp
  BEFORE INSERT ON public.folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.folio_transactions_business_date_stamp();

DROP TRIGGER IF EXISTS hotel_drawer_movements_business_date_stamp ON public.hotel_drawer_movements;
CREATE TRIGGER hotel_drawer_movements_business_date_stamp
  BEFORE INSERT ON public.hotel_drawer_movements
  FOR EACH ROW EXECUTE FUNCTION public.hotel_drawer_movements_business_date_stamp();

DROP TRIGGER IF EXISTS fiscal_registrations_business_date_stamp ON public.fiscal_registrations;
CREATE TRIGGER fiscal_registrations_business_date_stamp
  BEFORE INSERT ON public.fiscal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_registrations_business_date_stamp();

DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'hotel_cashier_shifts',
    'guest_folio_invoices',
    'financial_account_invoices',
    'invoice_credit_notes',
    'guest_payment_invoice_allocations',
    'guest_deposit_invoice_allocations',
    'folio_deposit_allocations',
    'financial_account_payment_allocations',
    'withholding_certificates'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', _table || '_business_date_stamp', _table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.business_date_stamp_property()',
      _table || '_business_date_stamp',
      _table
    );
  END LOOP;

  FOREACH _table IN ARRAY ARRAY[
    'folio_transactions',
    'hotel_cashier_shifts',
    'hotel_drawer_movements',
    'guest_folio_invoices',
    'financial_account_invoices',
    'invoice_credit_notes',
    'guest_payment_invoice_allocations',
    'guest_deposit_invoice_allocations',
    'folio_deposit_allocations',
    'financial_account_payment_allocations',
    'withholding_certificates',
    'fiscal_registrations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', _table || '_business_date_immutable', _table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.business_date_immutable()',
      _table || '_business_date_immutable',
      _table
    );
  END LOOP;
END;
$$;

-- 6. Indexes ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS folio_transactions_business_date_idx
  ON public.folio_transactions (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS hotel_cashier_shifts_business_date_idx
  ON public.hotel_cashier_shifts (restaurant_id, business_date, status);
CREATE INDEX IF NOT EXISTS hotel_drawer_movements_business_date_idx
  ON public.hotel_drawer_movements (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS guest_folio_invoices_business_date_idx
  ON public.guest_folio_invoices (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS financial_account_invoices_business_date_idx
  ON public.financial_account_invoices (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS invoice_credit_notes_business_date_idx
  ON public.invoice_credit_notes (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS guest_payment_invoice_allocations_business_date_idx
  ON public.guest_payment_invoice_allocations (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS guest_deposit_invoice_allocations_business_date_idx
  ON public.guest_deposit_invoice_allocations (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS folio_deposit_allocations_business_date_idx
  ON public.folio_deposit_allocations (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS financial_account_payment_allocations_business_date_idx
  ON public.financial_account_payment_allocations (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS withholding_certificates_business_date_idx
  ON public.withholding_certificates (restaurant_id, business_date);
CREATE INDEX IF NOT EXISTS fiscal_registrations_business_date_idx
  ON public.fiscal_registrations (restaurant_id, business_date);
-- Night Audit anti-join: "does this source have any registration?"
CREATE INDEX IF NOT EXISTS fiscal_registrations_source_lookup_idx
  ON public.fiscal_registrations (restaurant_id, source_type, source_id);

-- 7. Drawer list carries the shift's hotel day ------------------------------

CREATE OR REPLACE FUNCTION public.list_hotel_drawers(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.opened_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      s.id,
      s.membership_id,
      s.status,
      s.opened_at,
      s.closed_at,
      s.business_date,
      s.notes,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'opening')::numeric AS opening,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'cash_in')::numeric AS cash_in,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'cash_out')::numeric AS cash_out,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'hotel_cash')::numeric AS hotel_cash,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'expected')::numeric AS expected,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'closing_count')::numeric AS closing_count,
      (public.hotel_drawer_figures(_restaurant_id, s.id) ->> 'variance')::numeric AS variance
    FROM public.hotel_cashier_shifts s
    WHERE s.restaurant_id = _restaurant_id
    ORDER BY s.opened_at DESC
    LIMIT 100
  ) x;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_hotel_drawers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_hotel_drawers(uuid) TO service_role;

-- 8. Documentation ---------------------------------------------------------

COMMENT ON COLUMN public.folio_transactions.business_date IS
  'Hotel day (restaurants.business_date) stamped by the database on insert. Cash on a hotel drawer takes the drawer''s day. Rows before 0208 are derived from posted_at in the property zone.';
COMMENT ON COLUMN public.hotel_cashier_shifts.business_date IS
  'Hotel day the drawer was opened on. Immutable. Rows before 0208 are derived from opened_at.';
COMMENT ON COLUMN public.hotel_drawer_movements.business_date IS
  'Hotel day of the parent drawer.';
COMMENT ON COLUMN public.guest_folio_invoices.business_date IS
  'Hotel day the invoice was issued on. Rows before 0208 are derived from issued_at.';
COMMENT ON COLUMN public.financial_account_invoices.business_date IS
  'Hotel day the invoice was issued on. Rows before 0208 are derived from issued_at.';
COMMENT ON COLUMN public.invoice_credit_notes.business_date IS
  'Hotel day the credit or debit note was issued on. Rows before 0208 are derived from issued_at.';
COMMENT ON COLUMN public.guest_payment_invoice_allocations.business_date IS
  'Hotel day of the allocation. Rows before 0208 are derived from created_at.';
COMMENT ON COLUMN public.guest_deposit_invoice_allocations.business_date IS
  'Hotel day of the allocation. Rows before 0208 are derived from created_at.';
COMMENT ON COLUMN public.folio_deposit_allocations.business_date IS
  'Hotel day of the allocation. Rows before 0208 are derived from created_at.';
COMMENT ON COLUMN public.financial_account_payment_allocations.business_date IS
  'Hotel day of the allocation. Rows before 0208 are derived from created_at.';
COMMENT ON COLUMN public.withholding_certificates.business_date IS
  'Hotel day the certificate was recorded on. Rows before 0208 are derived from created_at.';
COMMENT ON COLUMN public.fiscal_registrations.business_date IS
  'Hotel day of the source document, not of the send or retry.';
