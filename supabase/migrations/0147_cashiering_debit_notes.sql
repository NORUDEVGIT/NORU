-- Debit notes reuse the issued credit-note tables. note_type debit documents
-- existing uninvoiced ledger charges. Issuing a debit note does not post another charge.
-- Dual-lane with drizzle/migrations/0147_cashiering_debit_notes.sql.

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
    'credit_note_issued','debit_note_issued'
  ])
);

ALTER TABLE public.financial_account_invoice_events
  DROP CONSTRAINT IF EXISTS financial_account_invoice_events_type_check;
ALTER TABLE public.financial_account_invoice_events
  ADD CONSTRAINT financial_account_invoice_events_type_check CHECK (
    event_type IN (
      'invoice_draft_created','invoice_draft_updated','invoice_draft_deleted',
      'invoice_issued','invoice_reprinted','credit_note_issued','debit_note_issued'
    )
  );

ALTER TABLE public.invoice_credit_note_events
  DROP CONSTRAINT IF EXISTS invoice_credit_note_events_type_check;
ALTER TABLE public.invoice_credit_note_events
  ADD CONSTRAINT invoice_credit_note_events_type_check CHECK (
    event_type IN (
      'credit_note_draft_created','credit_note_draft_updated','credit_note_draft_deleted','credit_note_issued',
      'debit_note_draft_created','debit_note_draft_updated','debit_note_draft_deleted','debit_note_issued'
    )
  );

ALTER TABLE public.invoice_credit_notes DROP CONSTRAINT IF EXISTS invoice_credit_notes_type_check;
ALTER TABLE public.invoice_credit_notes
  ADD CONSTRAINT invoice_credit_notes_type_check CHECK (note_type IN ('credit', 'debit'));

ALTER TABLE public.invoice_credit_note_drafts DROP CONSTRAINT IF EXISTS invoice_credit_note_drafts_type_check;
ALTER TABLE public.invoice_credit_note_drafts
  ADD CONSTRAINT invoice_credit_note_drafts_type_check CHECK (note_type IN ('credit', 'debit'));

ALTER TABLE public.invoice_credit_note_lines
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'credit';
ALTER TABLE public.invoice_credit_note_lines DROP CONSTRAINT IF EXISTS invoice_credit_note_lines_type_check;
ALTER TABLE public.invoice_credit_note_lines
  ADD CONSTRAINT invoice_credit_note_lines_type_check CHECK (note_type IN ('credit', 'debit'));

CREATE UNIQUE INDEX IF NOT EXISTS invoice_debit_component_unique
  ON public.invoice_credit_note_lines (restaurant_id, component_transaction_id)
  WHERE note_type = 'debit';

DROP INDEX IF EXISTS public.invoice_credit_note_drafts_guest_unique;
DROP INDEX IF EXISTS public.invoice_credit_note_drafts_account_unique;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_credit_note_drafts_guest_type_unique
  ON public.invoice_credit_note_drafts (restaurant_id, guest_invoice_id, note_type)
  WHERE guest_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_credit_note_drafts_account_type_unique
  ON public.invoice_credit_note_drafts (restaurant_id, account_invoice_id, note_type)
  WHERE account_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pms_debit_note_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_debit_note_counters_seq_check CHECK (last_sequence >= 0)
);
ALTER TABLE public.pms_debit_note_counters ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pms_debit_note_counters TO service_role;

COMMENT ON TABLE public.invoice_credit_notes IS
  'Immutable issued credit and debit notes. Credit notes reduce the ledger once. Debit notes only document charges already on the ledger.';

CREATE OR REPLACE FUNCTION public.component_is_billed(_restaurant_id uuid, _component_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guest_folio_invoice_lines
    WHERE restaurant_id = _restaurant_id AND component_transaction_id = _component_id
  ) OR EXISTS (
    SELECT 1 FROM public.financial_account_invoice_lines
    WHERE restaurant_id = _restaurant_id AND component_transaction_id = _component_id
  ) OR EXISTS (
    SELECT 1 FROM public.invoice_credit_note_lines lines
    JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
    WHERE lines.restaurant_id = _restaurant_id
      AND lines.component_transaction_id = _component_id
      AND notes.note_type = 'debit'
  );
$$;

CREATE OR REPLACE FUNCTION public.group_is_billed(_restaurant_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guest_folio_invoice_lines
    WHERE restaurant_id = _restaurant_id AND source_transaction_id = _group_id AND component_kind = 'parent'
  ) OR EXISTS (
    SELECT 1 FROM public.financial_account_invoice_lines
    WHERE restaurant_id = _restaurant_id AND source_group_id = _group_id AND component_kind = 'parent'
  ) OR EXISTS (
    SELECT 1 FROM public.invoice_credit_note_lines lines
    JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
    WHERE lines.restaurant_id = _restaurant_id
      AND lines.source_group_id = _group_id
      AND lines.component_kind = 'parent'
      AND notes.note_type = 'debit'
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_guest_charge_not_invoiced(
  _restaurant_id uuid, _folio_id uuid, _source_transaction_id uuid, _error_code text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id AND coverage_scope = 'legacy_folio'
  ) OR public.group_is_billed(_restaurant_id, _source_transaction_id) THEN
    IF _error_code = 'TRANSFER_INVOICED' THEN
      RAISE EXCEPTION 'TRANSFER_INVOICED';
    END IF;
    RAISE EXCEPTION 'CORRECTION_INVOICED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_account_charge_not_invoiced(
  _restaurant_id uuid, _account_id uuid, _source_transaction_id uuid, _error_code text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.financial_account_invoice_lines
    WHERE restaurant_id = _restaurant_id AND financial_account_id = _account_id
      AND (component_transaction_id = _source_transaction_id OR source_group_id = _source_transaction_id)
  ) OR EXISTS (
    SELECT 1 FROM public.invoice_credit_note_lines lines
    JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
    WHERE lines.restaurant_id = _restaurant_id AND notes.note_type = 'debit'
      AND notes.financial_account_id = _account_id
      AND (lines.component_transaction_id = _source_transaction_id OR lines.source_group_id = _source_transaction_id)
  ) THEN
    IF _error_code = 'CORRECTION_INVOICED' THEN
      RAISE EXCEPTION 'CORRECTION_INVOICED';
    END IF;
    RAISE EXCEPTION 'TRANSFER_INVOICED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_credit_lines_within_invoice()
RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  kind text;
  original numeric;
  credited numeric;
BEGIN
  SELECT note_type INTO kind FROM public.invoice_credit_notes WHERE id = NEW.credit_note_id;
  IF kind = 'debit' THEN
    IF EXISTS (
      SELECT 1 FROM public.guest_folio_invoice_lines
      WHERE restaurant_id = NEW.restaurant_id AND component_transaction_id = NEW.component_transaction_id
    ) OR EXISTS (
      SELECT 1 FROM public.financial_account_invoice_lines
      WHERE restaurant_id = NEW.restaurant_id AND component_transaction_id = NEW.component_transaction_id
    ) OR EXISTS (
      SELECT 1 FROM public.invoice_credit_note_lines lines
      WHERE lines.restaurant_id = NEW.restaurant_id
        AND lines.component_transaction_id = NEW.component_transaction_id
        AND lines.note_type = 'debit'
        AND lines.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'DEBIT_SOURCE_ALREADY_COVERED';
    END IF;
    RETURN NEW;
  END IF;
  SELECT amount INTO original FROM public.guest_folio_invoice_lines
  WHERE restaurant_id = NEW.restaurant_id AND component_transaction_id = NEW.component_transaction_id;
  IF NOT FOUND THEN
    SELECT amount INTO original FROM public.financial_account_invoice_lines
    WHERE restaurant_id = NEW.restaurant_id AND component_transaction_id = NEW.component_transaction_id;
  END IF;
  IF original IS NULL THEN
    SELECT lines.original_amount INTO original
    FROM public.invoice_credit_note_lines lines
    JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
    WHERE lines.restaurant_id = NEW.restaurant_id
      AND lines.component_transaction_id = NEW.component_transaction_id
      AND notes.note_type = 'debit'
    LIMIT 1;
  END IF;
  IF original IS NULL THEN
    RAISE EXCEPTION 'INVOICE_ITEM_NOT_CREDITABLE';
  END IF;
  SELECT COALESCE(sum(lines.credited_amount), 0) INTO credited
  FROM public.invoice_credit_note_lines lines
  JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
  WHERE lines.restaurant_id = NEW.restaurant_id
    AND lines.component_transaction_id = NEW.component_transaction_id
    AND notes.note_type = 'credit';
  IF credited > original + 0.009 THEN
    RAISE EXCEPTION 'CREDIT_EXCEEDS_REMAINDER';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.resolve_guest_invoice_charge_group(
  _restaurant_id uuid,
  _folio_id uuid,
  _source_transaction_id uuid
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
  child_remaining numeric(12,2);
  tax_total numeric(12,2) := 0;
  service_total numeric(12,2) := 0;
  tax_lines jsonb := '[]'::jsonb;
  service_lines jsonb := '[]'::jsonb;
  department_name text;
BEGIN
  SELECT * INTO parent FROM public.folio_transactions
  WHERE id = _source_transaction_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND
    OR parent.folio_id IS DISTINCT FROM _folio_id
    OR parent.transaction_type <> 'charge'
    OR parent.category IN ('tax', 'service_charge')
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHARGE_NOT_INVOICEABLE', 'parentTransactionId', _source_transaction_id);
  END IF;

  IF public.group_is_billed(_restaurant_id, parent.id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHARGE_ALREADY_INVOICED', 'parentTransactionId', parent.id);
  END IF;

  parent_remaining := public.correctable_charge_remainder(_restaurant_id, parent.id);
  IF parent_remaining IS NULL OR parent_remaining <= 0.009 THEN
    IF EXISTS (
      SELECT 1 FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND original_transaction_id = parent.id
        AND transaction_type = 'transfer_out'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHARGE_TRANSFERRED', 'parentTransactionId', parent.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'CHARGE_NOT_INVOICEABLE', 'parentTransactionId', parent.id);
  END IF;

  FOR child IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND original_transaction_id = parent.id
      AND transaction_type = 'charge'
      AND category IN ('tax', 'service_charge')
    ORDER BY posted_at, created_at
  LOOP
    IF child.folio_id IS DISTINCT FROM parent.folio_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHARGE_GROUP_INCOMPLETE', 'parentTransactionId', parent.id);
    END IF;
    child_remaining := COALESCE(public.correctable_charge_remainder(_restaurant_id, child.id), 0);
    IF child.category = 'tax' THEN
      tax_total := tax_total + child_remaining;
      tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
        'id', child.id,
        'description', child.description,
        'amount', round(child_remaining, 2),
        'name', COALESCE(child.tax_snapshot->>'name', child.description),
        'code', child.tax_snapshot->>'code',
        'basis', child.tax_snapshot->>'basis',
        'calculation', child.tax_snapshot->>'calculation',
        'taxSnapshot', child.tax_snapshot
      ));
    ELSE
      service_total := service_total + child_remaining;
      service_lines := service_lines || jsonb_build_array(jsonb_build_object(
        'id', child.id,
        'description', child.description,
        'amount', round(child_remaining, 2),
        'name', COALESCE(child.tax_snapshot->>'name', child.description),
        'code', child.tax_snapshot->>'code',
        'basis', child.tax_snapshot->>'basis',
        'taxSnapshot', child.tax_snapshot
      ));
    END IF;
  END LOOP;

  department_name := NULLIF(parent.charge_snapshot->>'departmentName', '');
  IF department_name IS NULL AND (parent.category = 'room' OR parent.charge_source = 'room') THEN
    department_name := 'Room';
  ELSIF department_name IS NULL AND (parent.category = 'manual' OR parent.charge_source = 'manual') THEN
    department_name := 'Manual';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'parentTransactionId', parent.id,
    'postedAt', parent.posted_at,
    'description', parent.description,
    'category', parent.category,
    'departmentName', department_name,
    'chargeSource', parent.charge_source,
    'quantity', parent.quantity,
    'unitAmount', parent.unit_amount,
    'subtotal', round(parent_remaining, 2),
    'taxTotal', round(tax_total, 2),
    'serviceChargeTotal', round(service_total, 2),
    'grossTotal', round(parent_remaining + tax_total + service_total, 2),
    'chargeSnapshot', parent.charge_snapshot,
    'taxLines', tax_lines,
    'serviceLines', service_lines
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.resolve_account_invoice_group(
  _restaurant_id uuid,
  _account_id uuid,
  _source_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  direct public.folio_transactions%ROWTYPE;
  original public.folio_transactions%ROWTYPE;
  tin public.folio_transactions%ROWTYPE;
  child public.folio_transactions%ROWTYPE;
  orig public.folio_transactions%ROWTYPE;
  parent_total numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  service_total numeric(12,2) := 0;
  components jsonb := '[]'::jsonb;
  owned numeric(12,2);
  saw_rows boolean := false;
  saw_covered boolean := false;
  origin text;
  description text;
  department_name text;
  quantity numeric;
  unit_amount numeric;
  posted_at timestamptz;
  guest_name text;
  folio_number text;
  room_number text;
  confirmation_number text;
  direct_found boolean := false;
BEGIN
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_NOT_FOUND', 'sourceGroupId', _source_group_id);
  END IF;
  IF acct.account_kind NOT IN ('company', 'group') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_KIND_NOT_INVOICEABLE', 'sourceGroupId', _source_group_id);
  END IF;

  SELECT * INTO direct FROM public.folio_transactions
  WHERE id = _source_group_id
    AND restaurant_id = _restaurant_id
    AND financial_account_id = acct.id
    AND transaction_type = 'charge'
    AND category NOT IN ('tax', 'service_charge');
  direct_found := FOUND;

  IF direct_found THEN
    origin := 'direct';
    description := direct.description;
    posted_at := direct.posted_at;
    department_name := NULLIF(direct.charge_snapshot->>'departmentName', '');
    IF department_name IS NULL AND (direct.category = 'room' OR direct.charge_source = 'room') THEN
      department_name := 'Room';
    ELSIF department_name IS NULL AND (direct.category = 'manual' OR direct.charge_source = 'manual') THEN
      department_name := 'Manual';
    END IF;
    quantity := direct.quantity;
    unit_amount := direct.unit_amount;

    IF public.component_is_billed(_restaurant_id, direct.id) THEN
      saw_covered := true;
    ELSE
      owned := COALESCE(public.correctable_charge_remainder(_restaurant_id, direct.id), 0);
      IF owned > 0.009 THEN
        parent_total := owned;
        IF owned + 0.009 < direct.amount THEN
          quantity := NULL;
          unit_amount := NULL;
        END IF;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', direct.id, 'kind', 'parent', 'amount', round(owned, 2), 'description', direct.description
        ));
      END IF;
    END IF;

    FOR child IN
      SELECT * FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND financial_account_id = acct.id
        AND original_transaction_id = direct.id
        AND transaction_type = 'charge'
        AND category IN ('tax', 'service_charge')
      ORDER BY posted_at, id
    LOOP
      IF public.component_is_billed(_restaurant_id, child.id) THEN
        saw_covered := true;
        CONTINUE;
      END IF;
      owned := COALESCE(public.correctable_charge_remainder(_restaurant_id, child.id), 0);
      IF owned <= 0.009 THEN
        CONTINUE;
      END IF;
      IF child.category = 'tax' THEN
        tax_total := tax_total + owned;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', child.id, 'kind', 'tax', 'amount', round(owned, 2), 'description', child.description
        ));
      ELSE
        service_total := service_total + owned;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', child.id, 'kind', 'service_charge', 'amount', round(owned, 2), 'description', child.description
        ));
      END IF;
    END LOOP;
  ELSE
    SELECT * INTO original FROM public.folio_transactions
    WHERE id = _source_group_id
      AND restaurant_id = _restaurant_id
      AND transaction_type = 'charge'
      AND category NOT IN ('tax', 'service_charge');
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE', 'sourceGroupId', _source_group_id);
    END IF;
    origin := 'transferred';
    description := original.description;
    department_name := NULLIF(original.charge_snapshot->>'departmentName', '');
    IF department_name IS NULL AND (original.category = 'room' OR original.charge_source = 'room') THEN
      department_name := 'Room';
    ELSIF department_name IS NULL AND (original.category = 'manual' OR original.charge_source = 'manual') THEN
      department_name := 'Manual';
    END IF;
    quantity := original.quantity;
    unit_amount := original.unit_amount;

    SELECT
      NULLIF(btrim(concat_ws(' ', gp.first_name, gp.last_name)), ''),
      gf.folio_number,
      rooms.room_number,
      hr.confirmation_number
    INTO guest_name, folio_number, room_number, confirmation_number
    FROM public.guest_folios gf
    LEFT JOIN public.guest_profiles gp ON gp.id = gf.guest_id AND gp.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_reservations hr ON hr.id = gf.reservation_id AND hr.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_rooms rooms ON rooms.id = hr.room_id AND rooms.restaurant_id = hr.restaurant_id
    WHERE gf.id = original.folio_id AND gf.restaurant_id = _restaurant_id;

    FOR tin IN
      SELECT t.*
      FROM public.folio_transactions t
      JOIN public.folio_transactions orig_row
        ON orig_row.id = t.original_transaction_id
       AND orig_row.restaurant_id = t.restaurant_id
      WHERE t.restaurant_id = _restaurant_id
        AND t.financial_account_id = acct.id
        AND t.transaction_type = 'transfer_in'
        AND (
          orig_row.id = original.id
          OR (
            orig_row.category IN ('tax', 'service_charge')
            AND orig_row.original_transaction_id = original.id
          )
        )
      ORDER BY t.posted_at, t.id
    LOOP
      saw_rows := true;
      IF posted_at IS NULL THEN
        posted_at := tin.posted_at;
      END IF;
      IF public.component_is_billed(_restaurant_id, tin.id) THEN
        saw_covered := true;
        CONTINUE;
      END IF;
      owned := COALESCE(public.account_invoice_row_owned(_restaurant_id, acct.id, tin.id), 0);
      IF owned <= 0.009 THEN
        CONTINUE;
      END IF;
      SELECT * INTO orig FROM public.folio_transactions
      WHERE id = tin.original_transaction_id AND restaurant_id = _restaurant_id;
      IF orig.category = 'tax' THEN
        tax_total := tax_total + owned;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', tin.id, 'kind', 'tax', 'amount', round(owned, 2), 'description', COALESCE(orig.description, tin.description)
        ));
      ELSIF orig.category = 'service_charge' THEN
        service_total := service_total + owned;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', tin.id, 'kind', 'service_charge', 'amount', round(owned, 2), 'description', COALESCE(orig.description, tin.description)
        ));
      ELSE
        parent_total := parent_total + owned;
        components := components || jsonb_build_array(jsonb_build_object(
          'id', tin.id, 'kind', 'parent', 'amount', round(owned, 2), 'description', COALESCE(orig.description, description)
        ));
      END IF;
    END LOOP;

    IF NOT saw_rows THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE', 'sourceGroupId', _source_group_id);
    END IF;
    IF parent_total + 0.009 < COALESCE(original.amount, 0) THEN
      quantity := NULL;
      unit_amount := NULL;
    END IF;
  END IF;

  IF round(parent_total + tax_total + service_total, 2) <= 0.009 THEN
    IF saw_covered THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_CHARGE_ALREADY_INVOICED', 'sourceGroupId', _source_group_id);
    END IF;
    IF origin = 'transferred' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_CHARGE_NO_LONGER_OWNED', 'sourceGroupId', _source_group_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE', 'sourceGroupId', _source_group_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sourceGroupId', _source_group_id,
    'origin', origin,
    'postedAt', posted_at,
    'description', description,
    'departmentName', department_name,
    'quantity', quantity,
    'unitAmount', unit_amount,
    'subtotal', round(parent_total, 2),
    'taxTotal', round(tax_total, 2),
    'serviceChargeTotal', round(service_total, 2),
    'grossTotal', round(parent_total + tax_total + service_total, 2),
    'sourceGuest', guest_name,
    'sourceFolioNumber', folio_number,
    'sourceRoomNumber', room_number,
    'sourceConfirmation', confirmation_number,
    'components', components
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.list_guest_folio_invoice_groups(
  _restaurant_id uuid,
  _folio_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  parent public.folio_transactions%ROWTYPE;
  resolved jsonb;
  groups jsonb := '[]'::jsonb;
  invoiceable numeric(12,2) := 0;
  covered_invoice_id uuid;
  covered_number text;
  debit_number text;
  current_draft_id uuid;
  draft_row public.guest_folio_invoice_drafts%ROWTYPE;
  selected_ids jsonb := '[]'::jsonb;
  state text;
BEGIN
  SELECT * INTO draft_row FROM public.guest_folio_invoice_drafts
  WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id;
  IF FOUND THEN
    current_draft_id := draft_row.id;
    SELECT COALESCE(jsonb_agg(source_transaction_id ORDER BY created_at), '[]'::jsonb)
      INTO selected_ids
    FROM public.guest_folio_invoice_draft_items items
    WHERE items.draft_id = draft_row.id;
  END IF;

  FOR parent IN
    SELECT * FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = _folio_id
      AND transaction_type = 'charge'
      AND category NOT IN ('tax', 'service_charge')
    ORDER BY posted_at, created_at
  LOOP
    SELECT l.invoice_id, i.issued_number
      INTO covered_invoice_id, covered_number
    FROM public.guest_folio_invoice_lines l
    JOIN public.guest_folio_invoices i ON i.id = l.invoice_id
    WHERE l.restaurant_id = _restaurant_id
      AND l.source_transaction_id = parent.id
      AND l.component_kind = 'parent';

    debit_number := NULL;
    IF covered_invoice_id IS NULL THEN
      SELECT notes.note_number INTO debit_number
      FROM public.invoice_credit_note_lines lines
      JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
      WHERE lines.restaurant_id = _restaurant_id
        AND lines.source_group_id = parent.id
        AND lines.component_kind = 'parent'
        AND notes.note_type = 'debit'
      LIMIT 1;
    END IF;

    IF covered_invoice_id IS NOT NULL OR debit_number IS NOT NULL THEN
      state := 'invoiced';
      resolved := jsonb_build_object(
        'ok', true,
        'parentTransactionId', parent.id,
        'postedAt', parent.posted_at,
        'description', parent.description,
        'category', parent.category,
        'departmentName', COALESCE(NULLIF(parent.charge_snapshot->>'departmentName', ''), CASE WHEN parent.category = 'room' OR parent.charge_source = 'room' THEN 'Room' WHEN parent.category = 'manual' OR parent.charge_source = 'manual' THEN 'Manual' ELSE NULL END),
        'chargeSource', parent.charge_source,
        'quantity', parent.quantity,
        'unitAmount', parent.unit_amount,
        'subtotal', COALESCE(NULLIF((SELECT sum(lines.original_amount) FROM public.invoice_credit_note_lines lines JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id WHERE notes.note_type = 'debit' AND lines.restaurant_id = _restaurant_id AND lines.source_group_id = parent.id AND lines.component_kind = 'parent'), 0), (SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'parent'), 0),
        'taxTotal', COALESCE(NULLIF((SELECT sum(lines.original_amount) FROM public.invoice_credit_note_lines lines JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id WHERE notes.note_type = 'debit' AND lines.restaurant_id = _restaurant_id AND lines.source_group_id = parent.id AND lines.component_kind = 'tax'), 0), (SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'tax'), 0),
        'serviceChargeTotal', COALESCE(NULLIF((SELECT sum(lines.original_amount) FROM public.invoice_credit_note_lines lines JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id WHERE notes.note_type = 'debit' AND lines.restaurant_id = _restaurant_id AND lines.source_group_id = parent.id AND lines.component_kind = 'service_charge'), 0), (SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'service_charge'), 0),
        'invoiceState', 'invoiced',
        'coveredInvoiceId', covered_invoice_id,
        'coveredInvoiceNumber', COALESCE(debit_number, covered_number)
      );
      resolved := jsonb_set(resolved, '{grossTotal}', to_jsonb(round(
        COALESCE((resolved->>'subtotal')::numeric, 0)
        + COALESCE((resolved->>'taxTotal')::numeric, 0)
        + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0)
      , 2)));
      groups := groups || jsonb_build_array(resolved);
    ELSE
      resolved := public.resolve_guest_invoice_charge_group(_restaurant_id, _folio_id, parent.id);
      IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
        CONTINUE;
      END IF;
      invoiceable := invoiceable + COALESCE((resolved->>'grossTotal')::numeric, 0);
      IF current_draft_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.guest_folio_invoice_draft_items items
        WHERE items.draft_id = current_draft_id AND items.source_transaction_id = parent.id
      ) THEN
        state := 'in_draft';
      ELSE
        state := 'uninvoiced';
      END IF;
      resolved := resolved || jsonb_build_object(
        'invoiceState', state,
        'coveredInvoiceId', NULL,
        'coveredInvoiceNumber', NULL
      );
      groups := groups || jsonb_build_array(resolved);
    END IF;
    covered_invoice_id := NULL;
    covered_number := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'legacyFolio', public.guest_folio_has_legacy_invoice(_restaurant_id, _folio_id),
    'invoiceableAmount', round(invoiceable, 2),
    'groups', groups,
    'draft', CASE WHEN current_draft_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', draft_row.id,
      'notes', draft_row.notes,
      'updatedAt', draft_row.updated_at,
      'createdByMembershipId', draft_row.created_by_membership_id,
      'selectedIds', selected_ids
    ) END
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.list_financial_account_invoice_groups(
  _restaurant_id uuid,
  _account_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  master public.guest_account_masters%ROWTYPE;
  group_id uuid;
  resolved jsonb;
  groups jsonb := '[]'::jsonb;
  invoiceable numeric(12,2) := 0;
  current_draft_id uuid;
  draft_row public.financial_account_invoice_drafts%ROWTYPE;
  selected_ids jsonb := '[]'::jsonb;
  state text;
  covered_invoice_id uuid;
  covered_number text;
  frozen_subtotal numeric(12,2);
  frozen_tax numeric(12,2);
  frozen_service numeric(12,2);
  snap jsonb;
  balance numeric(12,2);
  bill_to jsonb;
BEGIN
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;
  IF acct.account_kind NOT IN ('company', 'group') THEN
    RAISE EXCEPTION 'ACCOUNT_KIND_NOT_INVOICEABLE';
  END IF;

  SELECT * INTO master FROM public.guest_account_masters
  WHERE id = acct.master_id AND restaurant_id = _restaurant_id;

  SELECT * INTO draft_row FROM public.financial_account_invoice_drafts
  WHERE restaurant_id = _restaurant_id AND financial_account_id = acct.id;
  IF FOUND THEN
    current_draft_id := draft_row.id;
    SELECT COALESCE(jsonb_agg(items.source_group_id ORDER BY items.created_at), '[]'::jsonb)
      INTO selected_ids
    FROM public.financial_account_invoice_draft_items items
    WHERE items.draft_id = draft_row.id;
  END IF;

  FOR group_id IN
    SELECT source_id FROM (
      SELECT source_id, min(posted_at) AS posted_at
      FROM (
        SELECT t.id AS source_id, t.posted_at
        FROM public.folio_transactions t
        WHERE t.restaurant_id = _restaurant_id
          AND t.financial_account_id = acct.id
          AND t.transaction_type = 'charge'
          AND t.category NOT IN ('tax', 'service_charge')
        UNION ALL
        SELECT
          CASE
            WHEN orig.category IN ('tax', 'service_charge') THEN orig.original_transaction_id
            ELSE orig.id
          END AS source_id,
          t.posted_at
        FROM public.folio_transactions t
        JOIN public.folio_transactions orig
          ON orig.id = t.original_transaction_id
         AND orig.restaurant_id = t.restaurant_id
        WHERE t.restaurant_id = _restaurant_id
          AND t.financial_account_id = acct.id
          AND t.transaction_type = 'transfer_in'
          AND orig.transaction_type = 'charge'
      ) raw
      WHERE source_id IS NOT NULL
      GROUP BY source_id
    ) sources
    ORDER BY posted_at, source_id
  LOOP
    resolved := public.resolve_account_invoice_group(_restaurant_id, acct.id, group_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS TRUE THEN
      invoiceable := invoiceable + COALESCE((resolved->>'grossTotal')::numeric, 0);
      IF current_draft_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.financial_account_invoice_draft_items items
        WHERE items.draft_id = current_draft_id AND items.source_group_id = group_id
      ) THEN
        state := 'in_draft';
      ELSE
        state := 'uninvoiced';
      END IF;
      resolved := resolved || jsonb_build_object(
        'invoiceState', state,
        'coveredInvoiceId', NULL,
        'coveredInvoiceNumber', NULL
      );
      groups := groups || jsonb_build_array(resolved);
    ELSIF resolved->>'code' = 'ACCOUNT_CHARGE_ALREADY_INVOICED' THEN
      SELECT l.invoice_id, i.issued_number, l.snapshot
        INTO covered_invoice_id, covered_number, snap
      FROM public.financial_account_invoice_lines l
      JOIN public.financial_account_invoices i ON i.id = l.invoice_id
      WHERE l.restaurant_id = _restaurant_id
        AND l.source_group_id = group_id
        AND l.component_kind = 'parent'
      ORDER BY i.issued_at DESC
      LIMIT 1;
      IF covered_number IS NULL THEN
        SELECT notes.note_number, lines.snapshot
          INTO covered_number, snap
        FROM public.invoice_credit_note_lines lines
        JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
        WHERE lines.restaurant_id = _restaurant_id
          AND lines.source_group_id = group_id
          AND lines.component_kind = 'parent'
          AND notes.note_type = 'debit'
        LIMIT 1;
        SELECT
          COALESCE(sum(lines.original_amount) FILTER (WHERE lines.component_kind = 'parent'), 0),
          COALESCE(sum(lines.original_amount) FILTER (WHERE lines.component_kind = 'tax'), 0),
          COALESCE(sum(lines.original_amount) FILTER (WHERE lines.component_kind = 'service_charge'), 0)
        INTO frozen_subtotal, frozen_tax, frozen_service
        FROM public.invoice_credit_note_lines lines
        JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
        WHERE lines.restaurant_id = _restaurant_id
          AND lines.source_group_id = group_id
          AND notes.note_type = 'debit';
      ELSE
      SELECT
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'parent'), 0),
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'tax'), 0),
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'service_charge'), 0)
      INTO frozen_subtotal, frozen_tax, frozen_service
      FROM public.financial_account_invoice_lines
      WHERE restaurant_id = _restaurant_id AND source_group_id = group_id;
      END IF;
      groups := groups || jsonb_build_array(jsonb_build_object(
        'ok', true,
        'sourceGroupId', group_id,
        'origin', COALESCE(snap->>'origin', 'transferred'),
        'postedAt', snap->>'postedAt',
        'description', COALESCE(snap->>'description', 'Charge'),
        'departmentName', snap->>'departmentName',
        'quantity', snap->'quantity',
        'unitAmount', snap->'unitAmount',
        'subtotal', round(frozen_subtotal, 2),
        'taxTotal', round(frozen_tax, 2),
        'serviceChargeTotal', round(frozen_service, 2),
        'grossTotal', round(frozen_subtotal + frozen_tax + frozen_service, 2),
        'sourceGuest', snap->>'sourceGuest',
        'sourceFolioNumber', snap->>'sourceFolioNumber',
        'sourceRoomNumber', snap->>'sourceRoomNumber',
        'sourceConfirmation', snap->>'sourceConfirmation',
        'invoiceState', 'invoiced',
        'coveredInvoiceId', covered_invoice_id,
        'coveredInvoiceNumber', covered_number,
        'ledgerIds', COALESCE((
          SELECT jsonb_agg(covered.component_transaction_id)
          FROM public.financial_account_invoice_lines covered
          WHERE covered.restaurant_id = _restaurant_id
            AND covered.source_group_id = group_id
        ), '[]'::jsonb)
      ));
    END IF;
    covered_invoice_id := NULL;
    covered_number := NULL;
    snap := NULL;
  END LOOP;

  balance := public.financial_account_balance(_restaurant_id, acct.id);
  IF acct.account_kind = 'company' THEN
    bill_to := jsonb_build_object(
      'name', master.name,
      'code', master.code,
      'taxId', master.tax_id,
      'phone', master.phone,
      'email', master.email,
      'paymentTerms', master.payment_terms,
      'creditDays', master.credit_days,
      'address', NULLIF(concat_ws(', ',
        NULLIF(btrim(master.address_line1), ''),
        NULLIF(btrim(master.address_line2), ''),
        NULLIF(btrim(master.city), ''),
        NULLIF(btrim(master.region), ''),
        NULLIF(btrim(master.postal_code), ''),
        NULLIF(btrim(master.country), '')
      ), '')
    );
  ELSE
    bill_to := jsonb_strip_nulls(jsonb_build_object(
      'name', master.name,
      'code', NULLIF(btrim(master.code), ''),
      'phone', NULLIF(btrim(master.phone), ''),
      'email', NULLIF(btrim(master.email), '')
    ));
  END IF;

  RETURN jsonb_build_object(
    'account', jsonb_build_object(
      'id', acct.id,
      'accountNumber', acct.account_number,
      'accountKind', acct.account_kind,
      'status', acct.status,
      'currency', acct.currency,
      'balance', round(balance, 2),
      'creditLimitAmount', CASE WHEN acct.account_kind = 'company' THEN master.credit_limit_amount ELSE NULL END
    ),
    'billTo', bill_to,
    'invoiceableAmount', round(invoiceable, 2),
    'groups', groups,
    'draft', CASE WHEN current_draft_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', draft_row.id,
      'notes', draft_row.notes,
      'updatedAt', draft_row.updated_at,
      'createdByMembershipId', draft_row.created_by_membership_id,
      'selectedIds', selected_ids
    ) END
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.list_invoice_credit_board(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  guest public.guest_folio_invoices%ROWTYPE;
  acct_invoice public.financial_account_invoices%ROWTYPE;
  snap jsonb;
  original_total numeric := 0;
  previous numeric := 0;
  debits numeric := 0;
  remaining numeric := 0;
  gid uuid;
  parent_snap jsonb;
  groups jsonb := '[]'::jsonb;
  components jsonb;
  draft jsonb;
  notes jsonb;
  balance numeric := 0;
  currency text;
  bill_to text;
  credit_state text;
BEGIN
  IF (_guest_invoice_id IS NULL) = (_account_invoice_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_INVOICE_TARGET');
  END IF;
  IF _guest_invoice_id IS NOT NULL THEN
    SELECT * INTO guest FROM public.guest_folio_invoices
    WHERE id = _guest_invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_FOUND');
    END IF;
    IF guest.issued_number IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_ISSUED');
    END IF;
    snap := guest.snapshot;
    bill_to := COALESCE(snap->'folio'->>'guestName', 'Guest');
    currency := COALESCE(snap->'property'->>'currencyCode', snap->'folio'->>'currency', 'ETB');
    balance := public.folio_balance(guest.folio_id);
  ELSE
    SELECT * INTO acct_invoice FROM public.financial_account_invoices
    WHERE id = _account_invoice_id AND restaurant_id = _restaurant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_FOUND');
    END IF;
    IF acct_invoice.issued_number IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_ISSUED');
    END IF;
    snap := acct_invoice.snapshot;
    bill_to := COALESCE(snap->'billTo'->>'name', 'Account');
    currency := COALESCE(snap->'property'->>'currencyCode', snap->'account'->>'currency', 'ETB');
    balance := public.financial_account_balance(_restaurant_id, acct_invoice.financial_account_id);
  END IF;

  SELECT COALESCE(round(sum(rows.original_amount) FILTER (WHERE rows.billed_via = 'invoice'), 2), 0),
         COALESCE(round(sum(rows.credited_amount), 2), 0),
         COALESCE(round(sum(rows.original_amount - rows.credited_amount), 2), 0)
  INTO original_total, previous, remaining
  FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows;
  IF original_total = 0 THEN
    original_total := round(COALESCE((snap->'totals'->>'invoiceTotal')::numeric, (snap->'totals'->>'balance')::numeric, 0), 2);
  END IF;
  SELECT COALESCE(round(sum(issued_note.total_delta), 2), 0) INTO debits
  FROM public.invoice_credit_notes issued_note
  WHERE issued_note.restaurant_id = _restaurant_id
    AND issued_note.note_type = 'debit'
    AND issued_note.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND issued_note.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
  IF original_total = 0 AND remaining = 0 THEN
    remaining := round(original_total - previous, 2);
  END IF;
  IF previous <= 0.009 THEN
    credit_state := 'None';
  ELSIF remaining <= 0.009 THEN
    credit_state := 'Fully Credited';
  ELSE
    credit_state := 'Partially Credited';
  END IF;

  FOR gid IN
    SELECT DISTINCT rows.source_group_id
    FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
  LOOP
    SELECT rows.snapshot INTO parent_snap
    FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
    WHERE rows.source_group_id = gid AND rows.component_kind = 'parent'
    LIMIT 1;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', rows.component_transaction_id,
      'kind', rows.component_kind,
      'description', rows.description,
      'original', rows.original_amount,
      'credited', rows.credited_amount,
      'remaining', round(rows.original_amount - rows.credited_amount, 2)
    )), '[]'::jsonb)
    INTO components
    FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
    WHERE rows.source_group_id = gid;
    groups := groups || jsonb_build_array(jsonb_build_object(
      'sourceGroupId', gid,
      'description', COALESCE(parent_snap->>'description', 'Charge'),
      'sourceGuest', parent_snap->>'sourceGuest',
      'sourceFolioNumber', parent_snap->>'sourceFolioNumber',
      'sourceRoomNumber', parent_snap->>'sourceRoomNumber',
      'originalGross', (SELECT round(sum(rows.original_amount), 2) FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows WHERE rows.source_group_id = gid),
      'previouslyCredited', (SELECT round(sum(rows.credited_amount), 2) FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows WHERE rows.source_group_id = gid),
      'remaining', (SELECT round(sum(rows.original_amount - rows.credited_amount), 2) FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows WHERE rows.source_group_id = gid),
      'components', components
    ));
  END LOOP;

  SELECT jsonb_build_object(
    'id', drafts.id,
    'reason', drafts.reason,
    'updatedAt', drafts.updated_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('sourceGroupId', items.source_group_id, 'gross', items.requested_gross) ORDER BY items.created_at)
      FROM public.invoice_credit_note_draft_items items
      WHERE items.draft_id = drafts.id
    ), '[]'::jsonb)
  )
  INTO draft
  FROM public.invoice_credit_note_drafts drafts
  WHERE drafts.restaurant_id = _restaurant_id
    AND drafts.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND drafts.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id
    AND drafts.note_type = 'credit';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', issued_note.id,
    'noteNumber', issued_note.note_number,
    'issuedAt', issued_note.issued_at,
    'reason', issued_note.reason,
    'total', issued_note.total_delta,
    'issuedByName', issued_note.snapshot->'document'->>'issuedByName',
    'reprintCount', issued_note.reprint_count,
    'snapshot', issued_note.snapshot
  ) ORDER BY issued_note.issued_at), '[]'::jsonb)
  INTO notes
  FROM public.invoice_credit_notes issued_note
  WHERE issued_note.restaurant_id = _restaurant_id
    AND issued_note.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND issued_note.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id
    AND issued_note.note_type = 'credit';

  RETURN jsonb_build_object(
    'ok', true,
    'targetType', CASE WHEN _guest_invoice_id IS NOT NULL THEN 'guest_folio_invoice' ELSE 'financial_account_invoice' END,
    'invoiceId', COALESCE(_guest_invoice_id, _account_invoice_id),
    'invoiceNumber', COALESCE(guest.issued_number, acct_invoice.issued_number),
    'issuedAt', COALESCE(guest.issued_at, acct_invoice.issued_at),
    'currency', currency,
    'billToName', bill_to,
    'originalTotal', original_total,
    'previousCredits', previous,
    'previousDebits', debits,
    'remaining', remaining,
    'netInvoice', round(original_total - previous + debits, 2),
    'creditState', credit_state,
    'balance', balance,
    'groups', groups,
    'draft', draft,
    'notes', notes
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.create_invoice_credit_note_draft(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid,
  _reason text,
  _membership_id uuid
) RETURNS public.invoice_credit_note_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  board jsonb;
BEGIN
  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  board := public.list_invoice_credit_board(_restaurant_id, _guest_invoice_id, _account_invoice_id);
  IF COALESCE((board->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(board->>'code', 'INVOICE_NOT_FOUND');
  END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE restaurant_id = _restaurant_id
    AND guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND account_invoice_id IS NOT DISTINCT FROM _account_invoice_id
    AND note_type = 'credit';
  IF FOUND THEN
    RETURN draft;
  END IF;
  INSERT INTO public.invoice_credit_note_drafts (
    restaurant_id, note_type, guest_invoice_id, account_invoice_id, reason,
    created_by_membership_id, updated_by_membership_id
  ) VALUES (
    _restaurant_id, 'credit', _guest_invoice_id, _account_invoice_id, clean_reason,
    _membership_id, _membership_id
  ) RETURNING * INTO draft;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, _guest_invoice_id, _account_invoice_id, 'credit_note_draft_created', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
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
DROP FUNCTION IF EXISTS public.invoice_credit_component_rows(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.invoice_credit_component_rows(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid
) RETURNS TABLE (
  source_group_id uuid,
  component_transaction_id uuid,
  component_kind text,
  original_amount numeric,
  credited_amount numeric,
  description text,
  snapshot jsonb,
  billed_via text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (_guest_invoice_id IS NULL) = (_account_invoice_id IS NULL) THEN
    RETURN;
  END IF;
  IF _guest_invoice_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      lines.source_transaction_id,
      lines.component_transaction_id,
      lines.component_kind,
      lines.amount,
      COALESCE((
        SELECT round(sum(credited.credited_amount), 2)
        FROM public.invoice_credit_note_lines credited
        JOIN public.invoice_credit_notes notes ON notes.id = credited.credit_note_id
        WHERE credited.restaurant_id = lines.restaurant_id
          AND credited.component_transaction_id = lines.component_transaction_id
          AND notes.note_type = 'credit'
      ), 0),
      COALESCE(
        (
          SELECT elem->>'description'
          FROM jsonb_array_elements(COALESCE(lines.snapshot->'components', '[]'::jsonb)) elem
          WHERE elem->>'id' = lines.component_transaction_id::text
          LIMIT 1
        ),
        lines.snapshot->>'description',
        'Charge'
      ),
      lines.snapshot,
      'invoice'::text
    FROM public.guest_folio_invoice_lines lines
    WHERE lines.restaurant_id = _restaurant_id
      AND lines.invoice_id = _guest_invoice_id;
  ELSE
    RETURN QUERY
    SELECT
      lines.source_group_id,
      lines.component_transaction_id,
      lines.component_kind,
      lines.amount,
      COALESCE((
        SELECT round(sum(credited.credited_amount), 2)
        FROM public.invoice_credit_note_lines credited
        JOIN public.invoice_credit_notes notes ON notes.id = credited.credit_note_id
        WHERE credited.restaurant_id = lines.restaurant_id
          AND credited.component_transaction_id = lines.component_transaction_id
          AND notes.note_type = 'credit'
      ), 0),
      COALESCE(
        (
          SELECT elem->>'description'
          FROM jsonb_array_elements(COALESCE(lines.snapshot->'components', '[]'::jsonb)) elem
          WHERE elem->>'id' = lines.component_transaction_id::text
          LIMIT 1
        ),
        lines.snapshot->>'description',
        'Charge'
      ),
      lines.snapshot,
      'invoice'::text
    FROM public.financial_account_invoice_lines lines
    WHERE lines.restaurant_id = _restaurant_id
      AND lines.invoice_id = _account_invoice_id;
  END IF;

  RETURN QUERY
  SELECT
    lines.source_group_id,
    lines.component_transaction_id,
    lines.component_kind,
    lines.original_amount,
    COALESCE((
      SELECT round(sum(credited.credited_amount), 2)
      FROM public.invoice_credit_note_lines credited
      JOIN public.invoice_credit_notes notes ON notes.id = credited.credit_note_id
      WHERE credited.restaurant_id = lines.restaurant_id
        AND credited.component_transaction_id = lines.component_transaction_id
        AND notes.note_type = 'credit'
    ), 0),
    lines.description,
    lines.snapshot,
    'debit'::text
  FROM public.invoice_credit_note_lines lines
  JOIN public.invoice_credit_notes notes ON notes.id = lines.credit_note_id
  WHERE lines.restaurant_id = _restaurant_id
    AND notes.note_type = 'debit'
    AND notes.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND notes.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_invoice_debit(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid,
  _source_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  guest public.guest_folio_invoices%ROWTYPE;
  acct_invoice public.financial_account_invoices%ROWTYPE;
  gid uuid;
  resolved jsonb;
  component jsonb;
  groups jsonb := '[]'::jsonb;
  lines jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  tax_total numeric := 0;
  service_total numeric := 0;
  owner uuid;
BEGIN
  IF (_guest_invoice_id IS NULL) = (_account_invoice_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_INVOICE_TARGET');
  END IF;
  IF _source_ids IS NULL OR array_length(_source_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DEBIT_NOTE_DRAFT_EMPTY');
  END IF;
  IF _guest_invoice_id IS NOT NULL THEN
    SELECT * INTO guest FROM public.guest_folio_invoices
    WHERE id = _guest_invoice_id AND restaurant_id = _restaurant_id AND issued_number IS NOT NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_ISSUED');
    END IF;
    IF guest.coverage_scope = 'legacy_folio' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_INVOICE_TARGET');
    END IF;
  ELSE
    SELECT * INTO acct_invoice FROM public.financial_account_invoices
    WHERE id = _account_invoice_id AND restaurant_id = _restaurant_id AND issued_number IS NOT NULL;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_ISSUED');
    END IF;
  END IF;

  FOREACH gid IN ARRAY _source_ids LOOP
    SELECT folio_id INTO owner FROM public.folio_transactions
    WHERE id = gid AND restaurant_id = _restaurant_id;
    IF _guest_invoice_id IS NOT NULL THEN
      IF owner IS NULL OR owner IS DISTINCT FROM guest.folio_id THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DEBIT_SOURCE_WRONG_TARGET', 'sourceGroupId', gid);
      END IF;
      resolved := public.resolve_guest_invoice_charge_group(_restaurant_id, guest.folio_id, gid);
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.folio_transactions t
        WHERE t.restaurant_id = _restaurant_id
          AND t.financial_account_id = acct_invoice.financial_account_id
          AND (
            t.id = gid
            OR t.original_transaction_id = gid
            OR EXISTS (
              SELECT 1 FROM public.folio_transactions orig
              WHERE orig.id = t.original_transaction_id
                AND orig.original_transaction_id = gid
            )
          )
      ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DEBIT_SOURCE_WRONG_TARGET', 'sourceGroupId', gid);
      END IF;
      resolved := public.resolve_account_invoice_group(_restaurant_id, acct_invoice.financial_account_id, gid);
    END IF;
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      IF resolved->>'code' IN ('CHARGE_ALREADY_INVOICED', 'ACCOUNT_CHARGE_ALREADY_INVOICED') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'DEBIT_SOURCE_ALREADY_COVERED', 'sourceGroupId', gid);
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'DEBIT_SOURCE_NOT_ELIGIBLE', 'sourceGroupId', gid);
    END IF;
    subtotal := subtotal + COALESCE((resolved->>'subtotal')::numeric, 0);
    tax_total := tax_total + COALESCE((resolved->>'taxTotal')::numeric, 0);
    service_total := service_total + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0);
    groups := groups || jsonb_build_array(jsonb_build_object(
      'sourceGroupId', gid,
      'description', COALESCE(resolved->>'description', 'Charge'),
      'postedAt', resolved->>'postedAt',
      'departmentName', resolved->>'departmentName',
      'quantity', resolved->'quantity',
      'unitAmount', resolved->'unitAmount',
      'sourceGuest', resolved->>'sourceGuest',
      'sourceFolioNumber', resolved->>'sourceFolioNumber',
      'sourceRoomNumber', resolved->>'sourceRoomNumber',
      'subtotal', resolved->'subtotal',
      'tax', resolved->'taxTotal',
      'serviceCharge', resolved->'serviceChargeTotal',
      'gross', resolved->'grossTotal'
    ));
    IF resolved ? 'components' AND jsonb_typeof(resolved->'components') = 'array' THEN
      FOR component IN SELECT value FROM jsonb_array_elements(resolved->'components') LOOP
        IF COALESCE((component->>'amount')::numeric, 0) <= 0 THEN CONTINUE; END IF;
        lines := lines || jsonb_build_array(jsonb_build_object(
          'sourceGroupId', gid,
          'componentTransactionId', component->>'id',
          'kind', component->>'kind',
          'amount', component->>'amount',
          'description', COALESCE(component->>'description', resolved->>'description', 'Charge'),
          'snapshot', resolved
        ));
      END LOOP;
    ELSE
      IF COALESCE((resolved->>'subtotal')::numeric, 0) > 0 THEN
        lines := lines || jsonb_build_array(jsonb_build_object(
          'sourceGroupId', gid, 'componentTransactionId', gid, 'kind', 'parent',
          'amount', resolved->>'subtotal', 'description', COALESCE(resolved->>'description', 'Charge'),
          'snapshot', resolved
        ));
      END IF;
      FOR component IN SELECT value FROM jsonb_array_elements(COALESCE(resolved->'taxLines', '[]'::jsonb)) LOOP
        IF COALESCE((component->>'amount')::numeric, 0) <= 0 THEN CONTINUE; END IF;
        lines := lines || jsonb_build_array(jsonb_build_object(
          'sourceGroupId', gid, 'componentTransactionId', component->>'id', 'kind', 'tax',
          'amount', component->>'amount', 'description', COALESCE(component->>'description', 'Tax'),
          'snapshot', component
        ));
      END LOOP;
      FOR component IN SELECT value FROM jsonb_array_elements(COALESCE(resolved->'serviceLines', '[]'::jsonb)) LOOP
        IF COALESCE((component->>'amount')::numeric, 0) <= 0 THEN CONTINUE; END IF;
        lines := lines || jsonb_build_array(jsonb_build_object(
          'sourceGroupId', gid, 'componentTransactionId', component->>'id', 'kind', 'service_charge',
          'amount', component->>'amount', 'description', COALESCE(component->>'description', 'Service charge'),
          'snapshot', component
        ));
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'subtotal', round(subtotal, 2),
    'tax', round(tax_total, 2),
    'serviceCharge', round(service_total, 2),
    'total', round(subtotal + tax_total + service_total, 2),
    'groups', groups,
    'lines', lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_invoice_debit_board(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_board jsonb;
  guest public.guest_folio_invoices%ROWTYPE;
  acct_invoice public.financial_account_invoices%ROWTYPE;
  source_board jsonb;
  group_row jsonb;
  eligible jsonb := '[]'::jsonb;
  draft jsonb;
  notes jsonb;
BEGIN
  credit_board := public.list_invoice_credit_board(_restaurant_id, _guest_invoice_id, _account_invoice_id);
  IF COALESCE((credit_board->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN credit_board;
  END IF;
  IF _guest_invoice_id IS NOT NULL THEN
    SELECT * INTO guest FROM public.guest_folio_invoices WHERE id = _guest_invoice_id;
    source_board := public.list_guest_folio_invoice_groups(_restaurant_id, guest.folio_id);
  ELSE
    SELECT * INTO acct_invoice FROM public.financial_account_invoices WHERE id = _account_invoice_id;
    source_board := public.list_financial_account_invoice_groups(_restaurant_id, acct_invoice.financial_account_id);
  END IF;
  FOR group_row IN SELECT value FROM jsonb_array_elements(COALESCE(source_board->'groups', '[]'::jsonb)) LOOP
    IF group_row->>'invoiceState' = 'uninvoiced' AND COALESCE((group_row->>'ok')::boolean, true) IS TRUE THEN
      eligible := eligible || jsonb_build_array(
        group_row || jsonb_build_object(
          'sourceGroupId', COALESCE(group_row->>'sourceGroupId', group_row->>'parentTransactionId')
        )
      );
    END IF;
  END LOOP;
  SELECT jsonb_build_object(
    'id', drafts.id, 'reason', drafts.reason, 'updatedAt', drafts.updated_at,
    'sourceIds', COALESCE((
      SELECT jsonb_agg(items.source_group_id ORDER BY items.created_at)
      FROM public.invoice_credit_note_draft_items items WHERE items.draft_id = drafts.id
    ), '[]'::jsonb)
  ) INTO draft
  FROM public.invoice_credit_note_drafts drafts
  WHERE drafts.restaurant_id = _restaurant_id
    AND drafts.note_type = 'debit'
    AND drafts.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND drafts.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', issued_note.id,
    'noteNumber', issued_note.note_number,
    'issuedAt', issued_note.issued_at,
    'reason', issued_note.reason,
    'total', issued_note.total_delta,
    'issuedByName', issued_note.snapshot->'document'->>'issuedByName',
    'reprintCount', issued_note.reprint_count,
    'snapshot', issued_note.snapshot
  ) ORDER BY issued_note.issued_at), '[]'::jsonb) INTO notes
  FROM public.invoice_credit_notes issued_note
  WHERE issued_note.restaurant_id = _restaurant_id
    AND issued_note.note_type = 'debit'
    AND issued_note.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND issued_note.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
  RETURN credit_board || jsonb_build_object('eligibleGroups', eligible, 'draft', draft, 'notes', notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_invoice_debit_note(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid,
  _source_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan jsonb;
  board jsonb;
BEGIN
  plan := public.plan_invoice_debit(_restaurant_id, _guest_invoice_id, _account_invoice_id, _source_ids);
  IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN plan;
  END IF;
  board := public.list_invoice_credit_board(_restaurant_id, _guest_invoice_id, _account_invoice_id);
  RETURN plan || jsonb_build_object(
    'originalInvoice', board->'originalTotal',
    'previousCredits', board->'previousCredits',
    'previousDebits', board->'previousDebits',
    'netAfter', round(
      COALESCE((board->>'originalTotal')::numeric, 0)
      - COALESCE((board->>'previousCredits')::numeric, 0)
      + COALESCE((board->>'previousDebits')::numeric, 0)
      + COALESCE((plan->>'total')::numeric, 0)
    , 2),
    'balance', board->'balance'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_debit_note_draft(
  _restaurant_id uuid, _guest_invoice_id uuid, _account_invoice_id uuid, _reason text, _membership_id uuid
) RETURNS public.invoice_credit_note_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  board jsonb;
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(clean_reason) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;
  board := public.list_invoice_credit_board(_restaurant_id, _guest_invoice_id, _account_invoice_id);
  IF COALESCE((board->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(board->>'code', 'INVOICE_NOT_FOUND');
  END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE restaurant_id = _restaurant_id AND note_type = 'debit'
    AND guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
  IF FOUND THEN RETURN draft; END IF;
  INSERT INTO public.invoice_credit_note_drafts (
    restaurant_id, note_type, guest_invoice_id, account_invoice_id, reason,
    created_by_membership_id, updated_by_membership_id
  ) VALUES (
    _restaurant_id, 'debit', _guest_invoice_id, _account_invoice_id, clean_reason, _membership_id, _membership_id
  ) RETURNING * INTO draft;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, _guest_invoice_id, _account_invoice_id, 'debit_note_draft_created', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_invoice_debit_note_draft(
  _restaurant_id uuid, _draft_id uuid, _reason text, _source_ids uuid[], _membership_id uuid
) RETURNS public.invoice_credit_note_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  plan jsonb;
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF char_length(clean_reason) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND OR draft.note_type IS DISTINCT FROM 'debit' THEN
    RAISE EXCEPTION 'DEBIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  IF _source_ids IS NOT NULL AND array_length(_source_ids, 1) IS NOT NULL THEN
    plan := public.plan_invoice_debit(_restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, _source_ids);
    IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(plan->>'code', 'DEBIT_SOURCE_NOT_ELIGIBLE');
    END IF;
  END IF;
  UPDATE public.invoice_credit_note_drafts
  SET reason = clean_reason, updated_by_membership_id = _membership_id, updated_at = now()
  WHERE id = draft.id RETURNING * INTO draft;
  DELETE FROM public.invoice_credit_note_draft_items WHERE draft_id = draft.id;
  IF plan IS NOT NULL THEN
    INSERT INTO public.invoice_credit_note_draft_items (draft_id, source_group_id, requested_gross)
    SELECT draft.id, (item->>'sourceGroupId')::uuid, round((item->>'gross')::numeric, 2)
    FROM jsonb_array_elements(plan->'groups') item;
  END IF;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, 'debit_note_draft_updated', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice_debit_note_draft(
  _restaurant_id uuid, _draft_id uuid, _membership_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
BEGIN
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF NOT FOUND OR draft.note_type IS DISTINCT FROM 'debit' THEN
    RAISE EXCEPTION 'DEBIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, 'debit_note_draft_deleted', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  DELETE FROM public.invoice_credit_note_drafts WHERE id = draft.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_invoice_debit_note_draft(
  _restaurant_id uuid, _draft_id uuid, _membership_id uuid, _idempotency_key text DEFAULT NULL
) RETURNS public.invoice_credit_notes
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  existing public.invoice_credit_notes%ROWTYPE;
  note public.invoice_credit_notes%ROWTYPE;
  guest public.guest_folio_invoices%ROWTYPE;
  acct_invoice public.financial_account_invoices%ROWTYPE;
  source_ids uuid[];
  plan jsonb;
  line jsonb;
  txn public.folio_transactions%ROWTYPE;
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
  prior_debits numeric;
  folio_for_history uuid;
  account_for_history uuid;
BEGIN
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id FOR UPDATE;
  draft_found := FOUND;
  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF existing.note_type IS DISTINCT FROM 'debit'
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
  IF NOT draft_found OR draft.note_type IS DISTINCT FROM 'debit' THEN
    RAISE EXCEPTION 'DEBIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  IF draft.guest_invoice_id IS NOT NULL THEN
    SELECT * INTO guest FROM public.guest_folio_invoices
    WHERE id = draft.guest_invoice_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF guest.issued_number IS NULL THEN RAISE EXCEPTION 'INVOICE_NOT_ISSUED'; END IF;
    folio_for_history := guest.folio_id;
  ELSE
    SELECT * INTO acct_invoice FROM public.financial_account_invoices
    WHERE id = draft.account_invoice_id AND restaurant_id = _restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
    IF acct_invoice.issued_number IS NULL THEN RAISE EXCEPTION 'INVOICE_NOT_ISSUED'; END IF;
    account_for_history := acct_invoice.financial_account_id;
  END IF;
  PERFORM 1 FROM public.invoice_credit_notes notes
  WHERE notes.restaurant_id = _restaurant_id AND notes.note_type = 'debit'
    AND notes.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND notes.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id
  FOR UPDATE;
  SELECT COALESCE(array_agg(items.source_group_id ORDER BY items.created_at), ARRAY[]::uuid[])
  INTO source_ids
  FROM public.invoice_credit_note_draft_items items
  WHERE items.draft_id = draft.id;
  plan := public.plan_invoice_debit(_restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, source_ids);
  IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(plan->>'code', 'DEBIT_SOURCE_NOT_ELIGIBLE');
  END IF;
  INSERT INTO public.pms_debit_note_counters (restaurant_id, last_sequence)
  VALUES (_restaurant_id, 0) ON CONFLICT (restaurant_id) DO NOTHING;
  SELECT last_sequence INTO next_seq FROM public.pms_debit_note_counters
  WHERE restaurant_id = _restaurant_id FOR UPDATE;
  next_seq := next_seq + 1;
  UPDATE public.pms_debit_note_counters SET last_sequence = next_seq, updated_at = now()
  WHERE restaurant_id = _restaurant_id;
  issued_num := 'DN-' || lpad(next_seq::text, 6, '0');
  SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '') INTO issuer_name
  FROM public.restaurant_users ru LEFT JOIN public.profiles p ON p.id = ru.user_id
  WHERE ru.id = _membership_id;
  IF draft.guest_invoice_id IS NOT NULL THEN
    currency := COALESCE(guest.snapshot->'property'->>'currencyCode', guest.snapshot->'folio'->>'currency', 'ETB');
    bill_to := COALESCE(guest.snapshot->'folio'->>'guestName', 'Guest');
    original_total := round(COALESCE((guest.snapshot->'totals'->>'invoiceTotal')::numeric, (guest.snapshot->'totals'->>'balance')::numeric, 0), 2);
  ELSE
    currency := COALESCE(acct_invoice.snapshot->'property'->>'currencyCode', acct_invoice.snapshot->'account'->>'currency', 'ETB');
    bill_to := COALESCE(acct_invoice.snapshot->'billTo'->>'name', 'Account');
    original_total := round(COALESCE((acct_invoice.snapshot->'totals'->>'invoiceTotal')::numeric, (acct_invoice.snapshot->'totals'->>'balance')::numeric, 0), 2);
  END IF;
  SELECT COALESCE(round(sum(lines.credited_amount), 2), 0) INTO previous
  FROM public.invoice_credit_note_lines lines
  JOIN public.invoice_credit_notes prior ON prior.id = lines.credit_note_id
  WHERE prior.restaurant_id = _restaurant_id AND prior.note_type = 'credit'
    AND prior.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND prior.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id;
  SELECT COALESCE(round(sum(prior.total_delta), 2), 0) INTO prior_debits
  FROM public.invoice_credit_notes prior
  WHERE prior.restaurant_id = _restaurant_id AND prior.note_type = 'debit'
    AND prior.guest_invoice_id IS NOT DISTINCT FROM draft.guest_invoice_id
    AND prior.account_invoice_id IS NOT DISTINCT FROM draft.account_invoice_id;
  snap := jsonb_build_object(
    'version', 1, 'noteType', 'debit',
    'target', CASE WHEN draft.guest_invoice_id IS NOT NULL THEN 'guest_folio_invoice' ELSE 'financial_account_invoice' END,
    'issuedAt', now(),
    'document', jsonb_build_object(
      'noteNumber', issued_num, 'sequenceNumber', next_seq, 'reason', draft.reason,
      'issuedByName', issuer_name, 'originalInvoiceNumber', COALESCE(guest.issued_number, acct_invoice.issued_number),
      'currency', currency
    ),
    'billTo', jsonb_build_object('name', bill_to),
    'groups', plan->'groups', 'lines', plan->'lines',
    'totals', jsonb_build_object(
      'subtotal', plan->'subtotal', 'tax', plan->'tax', 'serviceCharge', plan->'serviceCharge',
      'debitTotal', plan->'total', 'originalInvoice', original_total, 'previousCredits', previous,
      'previousDebits', prior_debits,
      'netInvoice', round(original_total - previous + prior_debits + (plan->>'total')::numeric, 2)
    )
  );
  INSERT INTO public.invoice_credit_notes (
    restaurant_id, note_type, guest_invoice_id, account_invoice_id, folio_id, financial_account_id,
    note_number, sequence_number, currency, reason,
    subtotal_delta, tax_delta, service_charge_delta, total_delta,
    snapshot, issued_by_membership_id, idempotency_key
  ) VALUES (
    _restaurant_id, 'debit', draft.guest_invoice_id, draft.account_invoice_id, folio_for_history, account_for_history,
    issued_num, next_seq, currency, draft.reason,
    round((plan->>'subtotal')::numeric, 2), round((plan->>'tax')::numeric, 2),
    round((plan->>'serviceCharge')::numeric, 2), round((plan->>'total')::numeric, 2),
    snap, _membership_id, clean_key
  ) RETURNING * INTO note;
  FOR line IN SELECT value FROM jsonb_array_elements(plan->'lines') LOOP
    SELECT * INTO txn FROM public.folio_transactions
    WHERE id = (line->>'componentTransactionId')::uuid AND restaurant_id = _restaurant_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEBIT_SOURCE_NOT_ELIGIBLE'; END IF;
    IF folio_for_history IS NOT NULL AND txn.folio_id IS DISTINCT FROM folio_for_history THEN
      RAISE EXCEPTION 'DEBIT_SOURCE_WRONG_TARGET';
    END IF;
    IF account_for_history IS NOT NULL AND txn.financial_account_id IS DISTINCT FROM account_for_history THEN
      RAISE EXCEPTION 'DEBIT_SOURCE_WRONG_TARGET';
    END IF;
    INSERT INTO public.invoice_credit_note_lines (
      restaurant_id, credit_note_id, note_type, source_group_id, component_transaction_id,
      component_kind, original_amount, credited_amount, description, snapshot
    ) VALUES (
      _restaurant_id, note.id, 'debit', (line->>'sourceGroupId')::uuid, txn.id,
      line->>'kind', (line->>'amount')::numeric, (line->>'amount')::numeric,
      COALESCE(line->>'description', 'Charge'), COALESCE(line->'snapshot', '{}'::jsonb)
    );
  END LOOP;
  IF folio_for_history IS NOT NULL THEN
    INSERT INTO public.folio_history (restaurant_id, folio_id, event_type, actor_membership_id, notes, new_values)
    VALUES (
      _restaurant_id, folio_for_history, 'debit_note_issued', _membership_id, draft.reason,
      jsonb_build_object('debit_note_id', note.id, 'note_number', note.note_number, 'total_delta', note.total_delta, 'invoice_id', draft.guest_invoice_id)
    );
  END IF;
  IF account_for_history IS NOT NULL THEN
    INSERT INTO public.financial_account_invoice_events (
      restaurant_id, financial_account_id, invoice_id, event_type, actor_membership_id, new_values
    ) VALUES (
      _restaurant_id, account_for_history, draft.account_invoice_id, 'debit_note_issued', _membership_id,
      jsonb_build_object('debit_note_id', note.id, 'note_number', note.note_number, 'total_delta', note.total_delta)
    );
  END IF;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, credit_note_id, folio_id, financial_account_id,
    event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, note.id, folio_for_history, account_for_history,
    'debit_note_issued', _membership_id,
    jsonb_build_object('debit_note_id', note.id, 'note_number', note.note_number, 'total_delta', note.total_delta)
  );
  DELETE FROM public.invoice_credit_note_drafts WHERE id = draft.id;
  RETURN note;
EXCEPTION WHEN unique_violation THEN
  IF clean_key IS NOT NULL AND SQLERRM ILIKE '%idempotency%' THEN
    SELECT * INTO existing FROM public.invoice_credit_notes
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND AND existing.note_type = 'debit' THEN RETURN existing; END IF;
    IF FOUND THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED'; END IF;
  END IF;
  IF SQLERRM ILIKE '%invoice_debit_component%' THEN
    RAISE EXCEPTION 'DEBIT_SOURCE_ALREADY_COVERED';
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.component_is_billed(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.group_is_billed(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_invoice_debit(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_invoice_debit_board(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_invoice_debit_note(uuid, uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_invoice_debit_note_draft(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_invoice_debit_note_draft(uuid, uuid, text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_invoice_debit_note_draft(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invoice_debit_note_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.component_is_billed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.group_is_billed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_invoice_debit(uuid, uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_invoice_debit_board(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_invoice_debit_note(uuid, uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invoice_debit_note_draft(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_invoice_debit_note_draft(uuid, uuid, text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_debit_note_draft(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice_debit_note_draft(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.issue_invoice_debit_note_draft(uuid, uuid, uuid, text) IS
  'Issue one immutable debit note covering existing uninvoiced charges. Does not post another ledger charge and does not change the issued invoice.';

CREATE OR REPLACE FUNCTION public.invoice_credit_note_lines_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  IF NEW.credited_amount IS DISTINCT FROM OLD.credited_amount
    OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
    OR NEW.component_transaction_id IS DISTINCT FROM OLD.component_transaction_id
    OR NEW.source_group_id IS DISTINCT FROM OLD.source_group_id
    OR NEW.credit_note_id IS DISTINCT FROM OLD.credit_note_id
    OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.component_kind IS DISTINCT FROM OLD.component_kind
    OR NEW.note_type IS DISTINCT FROM OLD.note_type
    OR NEW.ledger_transaction_id IS DISTINCT FROM OLD.ledger_transaction_id
  THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_invoice_credit_note_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _reason text,
  _items jsonb,
  _membership_id uuid
) RETURNS public.invoice_credit_note_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
  issued public.invoice_credit_notes%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  plan jsonb;
BEGIN
  SELECT * INTO issued FROM public.invoice_credit_notes
  WHERE id = _draft_id AND restaurant_id = _restaurant_id;
  IF FOUND THEN
    RAISE EXCEPTION 'CREDIT_NOTE_ALREADY_ISSUED';
  END IF;
  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR draft.note_type IS DISTINCT FROM 'credit' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  IF _items IS NOT NULL AND jsonb_typeof(_items) = 'array' AND jsonb_array_length(_items) > 0 THEN
    plan := public.plan_invoice_credit(
      _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, _items
    );
    IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(plan->>'code', 'INVOICE_ITEM_NOT_CREDITABLE');
    END IF;
  END IF;
  UPDATE public.invoice_credit_note_drafts
  SET reason = clean_reason, updated_by_membership_id = _membership_id, updated_at = now()
  WHERE id = draft.id
  RETURNING * INTO draft;
  DELETE FROM public.invoice_credit_note_draft_items WHERE draft_id = draft.id;
  INSERT INTO public.invoice_credit_note_draft_items (draft_id, source_group_id, requested_gross)
  SELECT draft.id, (item->>'sourceGroupId')::uuid, round((item->>'gross')::numeric, 2)
  FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) item
  WHERE round(COALESCE((item->>'gross')::numeric, 0), 2) > 0;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, 'credit_note_draft_updated', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice_credit_note_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.invoice_credit_note_drafts%ROWTYPE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoice_credit_notes
    WHERE id = _draft_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_ALREADY_ISSUED';
  END IF;
  SELECT * INTO draft FROM public.invoice_credit_note_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR draft.note_type IS DISTINCT FROM 'credit' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_DRAFT_NOT_FOUND';
  END IF;
  DELETE FROM public.invoice_credit_note_drafts WHERE id = draft.id;
  INSERT INTO public.invoice_credit_note_events (
    restaurant_id, guest_invoice_id, account_invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.guest_invoice_id, draft.account_invoice_id, 'credit_note_draft_deleted', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
END;
$$;
