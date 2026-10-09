-- Guest invoice drafts, charge-group coverage, and selected-line issue.
-- Existing issued rows stay readable. They are marked legacy_folio and keep their snapshot.
-- Dual-lane with drizzle/migrations/0144_cashiering_guest_invoice_drafts.sql.

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
    'invoice_draft_created','invoice_draft_updated','invoice_draft_deleted'
  ])
);

ALTER TABLE public.guest_folio_invoices
  ADD COLUMN IF NOT EXISTS coverage_scope text;

UPDATE public.guest_folio_invoices
SET coverage_scope = 'legacy_folio'
WHERE coverage_scope IS NULL;

ALTER TABLE public.guest_folio_invoices
  ALTER COLUMN coverage_scope SET DEFAULT 'charge_groups';

ALTER TABLE public.guest_folio_invoices
  ALTER COLUMN coverage_scope SET NOT NULL;

ALTER TABLE public.guest_folio_invoices
  DROP CONSTRAINT IF EXISTS guest_folio_invoices_coverage_scope_check;

ALTER TABLE public.guest_folio_invoices
  ADD CONSTRAINT guest_folio_invoices_coverage_scope_check
  CHECK (coverage_scope IN ('legacy_folio', 'charge_groups'));

ALTER TABLE public.guest_folio_invoices
  DROP CONSTRAINT IF EXISTS guest_folio_invoices_folio_unique;

CREATE UNIQUE INDEX IF NOT EXISTS guest_folio_invoices_legacy_folio_unique
  ON public.guest_folio_invoices (restaurant_id, folio_id)
  WHERE coverage_scope = 'legacy_folio';

COMMENT ON COLUMN public.guest_folio_invoices.coverage_scope IS
  'legacy_folio freezes the historical whole-folio snapshot and blocks another invoice on that folio. charge_groups covers only the rows in guest_folio_invoice_lines.';

CREATE OR REPLACE FUNCTION public.guest_folio_invoices_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  -- reprint_count and last_reprinted_at stay writable for the reprint writer.
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.issued_number IS DISTINCT FROM OLD.issued_number
    OR NEW.folio_id IS DISTINCT FROM OLD.folio_id
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.coverage_scope IS DISTINCT FROM OLD.coverage_scope
    OR NEW.issued_by_membership_id IS DISTINCT FROM OLD.issued_by_membership_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guest_folio_invoices_immutable_trg ON public.guest_folio_invoices;
CREATE TRIGGER guest_folio_invoices_immutable_trg
  BEFORE UPDATE OR DELETE ON public.guest_folio_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_folio_invoices_immutable();

CREATE TABLE IF NOT EXISTS public.guest_folio_invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid NOT NULL,
  notes text,
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folio_invoice_drafts_folio_fk
    FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT guest_folio_invoice_drafts_one_per_folio UNIQUE (restaurant_id, folio_id),
  CONSTRAINT guest_folio_invoice_drafts_notes_check CHECK (
    notes IS NULL OR char_length(notes) <= 500
  )
);

CREATE TABLE IF NOT EXISTS public.guest_folio_invoice_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.guest_folio_invoice_drafts(id) ON DELETE CASCADE,
  source_transaction_id uuid NOT NULL REFERENCES public.folio_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folio_invoice_draft_items_unique UNIQUE (draft_id, source_transaction_id)
);

CREATE INDEX IF NOT EXISTS guest_folio_invoice_draft_items_source_idx
  ON public.guest_folio_invoice_draft_items (source_transaction_id);

CREATE TABLE IF NOT EXISTS public.guest_folio_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.guest_folio_invoices(id),
  folio_id uuid NOT NULL,
  source_transaction_id uuid NOT NULL,
  component_transaction_id uuid NOT NULL,
  component_kind text NOT NULL,
  amount numeric(12,2) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folio_invoice_lines_kind_check CHECK (
    component_kind IN ('parent', 'tax', 'service_charge')
  ),
  CONSTRAINT guest_folio_invoice_lines_component_unique UNIQUE (restaurant_id, component_transaction_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_folio_invoice_lines_parent_unique
  ON public.guest_folio_invoice_lines (restaurant_id, source_transaction_id)
  WHERE component_kind = 'parent';

CREATE INDEX IF NOT EXISTS guest_folio_invoice_lines_invoice_idx
  ON public.guest_folio_invoice_lines (invoice_id);

COMMENT ON TABLE public.guest_folio_invoice_lines IS
  'Frozen charge-group components covered by one issued guest invoice. A component can belong to one invoice.';

ALTER TABLE public.guest_folio_invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_folio_invoice_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_folio_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cashiering staff read invoice drafts" ON public.guest_folio_invoice_drafts;
CREATE POLICY "Cashiering staff read invoice drafts"
  ON public.guest_folio_invoice_drafts FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read invoice draft items" ON public.guest_folio_invoice_draft_items;
CREATE POLICY "Cashiering staff read invoice draft items"
  ON public.guest_folio_invoice_draft_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guest_folio_invoice_drafts d
      WHERE d.id = draft_id
        AND public.has_any_restaurant_role(d.restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office'])
    )
  );

DROP POLICY IF EXISTS "Cashiering staff read invoice lines" ON public.guest_folio_invoice_lines;
CREATE POLICY "Cashiering staff read invoice lines"
  ON public.guest_folio_invoice_lines FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

GRANT SELECT ON public.guest_folio_invoice_drafts TO authenticated;
GRANT SELECT ON public.guest_folio_invoice_draft_items TO authenticated;
GRANT SELECT ON public.guest_folio_invoice_lines TO authenticated;
GRANT ALL ON public.guest_folio_invoice_drafts TO service_role;
GRANT ALL ON public.guest_folio_invoice_draft_items TO service_role;
GRANT ALL ON public.guest_folio_invoice_lines TO service_role;

CREATE OR REPLACE FUNCTION public.assert_guest_charge_not_invoiced(
  _restaurant_id uuid,
  _folio_id uuid,
  _source_transaction_id uuid,
  _error_code text
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id
      AND folio_id = _folio_id
      AND coverage_scope = 'legacy_folio'
  ) THEN
    IF _error_code = 'TRANSFER_INVOICED' THEN
      RAISE EXCEPTION 'TRANSFER_INVOICED';
    END IF;
    RAISE EXCEPTION 'CORRECTION_INVOICED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guest_folio_invoice_lines
    WHERE restaurant_id = _restaurant_id
      AND source_transaction_id = _source_transaction_id
      AND component_kind = 'parent'
  ) THEN
    IF _error_code = 'TRANSFER_INVOICED' THEN
      RAISE EXCEPTION 'TRANSFER_INVOICED';
    END IF;
    RAISE EXCEPTION 'CORRECTION_INVOICED';
  END IF;
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

  IF EXISTS (
    SELECT 1 FROM public.guest_folio_invoice_lines
    WHERE restaurant_id = _restaurant_id
      AND source_transaction_id = parent.id
      AND component_kind = 'parent'
  ) THEN
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

CREATE OR REPLACE FUNCTION public.guest_folio_has_legacy_invoice(
  _restaurant_id uuid,
  _folio_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id
      AND folio_id = _folio_id
      AND coverage_scope = 'legacy_folio'
  );
$$;

CREATE OR REPLACE FUNCTION public.create_guest_folio_invoice_draft(
  _restaurant_id uuid,
  _folio_id uuid,
  _notes text,
  _membership_id uuid
) RETURNS public.guest_folio_invoice_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.guest_folio_invoice_drafts%ROWTYPE;
  clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.guest_folios
    WHERE id = _folio_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF public.guest_folio_has_legacy_invoice(_restaurant_id, _folio_id) THEN
    RAISE EXCEPTION 'LEGACY_FOLIO_ALREADY_INVOICED';
  END IF;

  SELECT * INTO draft FROM public.guest_folio_invoice_drafts
  WHERE restaurant_id = _restaurant_id AND folio_id = _folio_id;
  IF FOUND THEN
    RETURN draft;
  END IF;

  INSERT INTO public.guest_folio_invoice_drafts (
    restaurant_id, folio_id, notes, created_by_membership_id, updated_by_membership_id
  ) VALUES (
    _restaurant_id, _folio_id, clean_notes, _membership_id, _membership_id
  ) RETURNING * INTO draft;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, _folio_id, 'invoice_draft_created', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_guest_folio_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _notes text,
  _source_ids uuid[],
  _membership_id uuid
) RETURNS public.guest_folio_invoice_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.guest_folio_invoice_drafts%ROWTYPE;
  source_id uuid;
  resolved jsonb;
  clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  SELECT * INTO draft FROM public.guest_folio_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_DRAFT_NOT_FOUND';
  END IF;
  IF public.guest_folio_has_legacy_invoice(_restaurant_id, draft.folio_id) THEN
    RAISE EXCEPTION 'LEGACY_FOLIO_ALREADY_INVOICED';
  END IF;

  FOREACH source_id IN ARRAY COALESCE(_source_ids, ARRAY[]::uuid[]) LOOP
    resolved := public.resolve_guest_invoice_charge_group(_restaurant_id, draft.folio_id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(resolved->>'code', 'CHARGE_NOT_INVOICEABLE');
    END IF;
  END LOOP;

  UPDATE public.guest_folio_invoice_drafts
  SET notes = clean_notes,
      updated_by_membership_id = _membership_id,
      updated_at = now()
  WHERE id = draft.id
  RETURNING * INTO draft;

  DELETE FROM public.guest_folio_invoice_draft_items WHERE draft_id = draft.id;
  INSERT INTO public.guest_folio_invoice_draft_items (draft_id, source_transaction_id)
  SELECT draft.id, source_id
  FROM unnest(COALESCE(_source_ids, ARRAY[]::uuid[])) AS source_id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.folio_id, 'invoice_draft_updated', _membership_id,
    jsonb_build_object('draft_id', draft.id, 'source_count', COALESCE(array_length(_source_ids, 1), 0))
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_guest_folio_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.guest_folio_invoice_drafts%ROWTYPE;
BEGIN
  SELECT * INTO draft FROM public.guest_folio_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_DRAFT_NOT_FOUND';
  END IF;
  DELETE FROM public.guest_folio_invoice_drafts WHERE id = draft.id;
  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.folio_id, 'invoice_draft_deleted', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_guest_folio_invoice_selection(
  _restaurant_id uuid,
  _folio_id uuid,
  _source_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source_id uuid;
  resolved jsonb;
  groups jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  subtotal numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  service_total numeric(12,2) := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.guest_folios
    WHERE id = _folio_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  FOREACH source_id IN ARRAY COALESCE(_source_ids, ARRAY[]::uuid[]) LOOP
    resolved := public.resolve_guest_invoice_charge_group(_restaurant_id, _folio_id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS TRUE THEN
      groups := groups || jsonb_build_array(resolved);
      subtotal := subtotal + COALESCE((resolved->>'subtotal')::numeric, 0);
      tax_total := tax_total + COALESCE((resolved->>'taxTotal')::numeric, 0);
      service_total := service_total + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0);
    ELSE
      warnings := warnings || jsonb_build_array(jsonb_build_object(
        'parentTransactionId', source_id,
        'code', COALESCE(resolved->>'code', 'CHARGE_NOT_INVOICEABLE')
      ));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'groups', groups,
    'warnings', warnings,
    'subtotal', round(subtotal, 2),
    'tax', round(tax_total, 2),
    'serviceCharge', round(service_total, 2),
    'total', round(subtotal + tax_total + service_total, 2),
    'legacyFolio', public.guest_folio_has_legacy_invoice(_restaurant_id, _folio_id)
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

    IF covered_invoice_id IS NOT NULL THEN
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
        'subtotal', COALESCE((SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'parent'), 0),
        'taxTotal', COALESCE((SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'tax'), 0),
        'serviceChargeTotal', COALESCE((SELECT sum(amount) FROM public.guest_folio_invoice_lines WHERE invoice_id = covered_invoice_id AND source_transaction_id = parent.id AND component_kind = 'service_charge'), 0),
        'invoiceState', 'invoiced',
        'coveredInvoiceId', covered_invoice_id,
        'coveredInvoiceNumber', covered_number
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

CREATE OR REPLACE FUNCTION public.issue_guest_folio_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid,
  _idempotency_key text DEFAULT NULL
) RETURNS public.guest_folio_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.guest_folio_invoice_drafts%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  settings public.pms_invoice_settings%ROWTYPE;
  existing public.guest_folio_invoices%ROWTYPE;
  invoice public.guest_folio_invoices%ROWTYPE;
  source_id uuid;
  resolved jsonb;
  groups jsonb := '[]'::jsonb;
  lines jsonb := '[]'::jsonb;
  coverage jsonb := '[]'::jsonb;
  component jsonb;
  subtotal numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  service_total numeric(12,2) := 0;
  next_seq integer;
  issued_num text;
  snap jsonb;
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  source_ids uuid[];
  prop record;
  guest record;
  res record;
  room_number text;
  confirmation_number text;
  arrival_date date;
  departure_date date;
  reservation_status text;
  draft_found boolean := false;
BEGIN
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO draft FROM public.guest_folio_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  draft_found := FOUND;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF draft_found AND existing.folio_id IS DISTINCT FROM draft.folio_id THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      IF NOT draft_found OR existing.folio_id = draft.folio_id THEN
        RETURN existing;
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.financial_account_invoices
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
    ) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
  END IF;

  IF NOT draft_found THEN
    RAISE EXCEPTION 'INVOICE_DRAFT_NOT_FOUND';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = draft.folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF public.guest_folio_has_legacy_invoice(_restaurant_id, folio.id) THEN
    RAISE EXCEPTION 'LEGACY_FOLIO_ALREADY_INVOICED';
  END IF;

  SELECT array_agg(source_transaction_id ORDER BY created_at) INTO source_ids
  FROM public.guest_folio_invoice_draft_items
  WHERE draft_id = draft.id;
  IF source_ids IS NULL OR array_length(source_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'INVOICE_DRAFT_EMPTY';
  END IF;

  SELECT * INTO settings FROM public.pms_invoice_settings
  WHERE restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_SETTINGS_REQUIRED';
  END IF;

  FOREACH source_id IN ARRAY source_ids LOOP
    PERFORM 1 FROM public.folio_transactions
    WHERE id = source_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
    resolved := public.resolve_guest_invoice_charge_group(_restaurant_id, folio.id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(resolved->>'code', 'CHARGE_NOT_INVOICEABLE');
    END IF;
    groups := groups || jsonb_build_array(resolved);
    subtotal := subtotal + COALESCE((resolved->>'subtotal')::numeric, 0);
    tax_total := tax_total + COALESCE((resolved->>'taxTotal')::numeric, 0);
    service_total := service_total + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0);
    lines := lines || jsonb_build_array(jsonb_build_object(
      'id', resolved->>'parentTransactionId',
      'transactionType', 'charge',
      'category', resolved->>'category',
      'description', resolved->>'description',
      'amount', (resolved->>'subtotal')::numeric,
      'postedAt', resolved->>'postedAt',
      'paymentMethod', NULL,
      'taxSnapshot', NULL,
      'originalTransactionId', NULL,
      'chargeSource', resolved->>'chargeSource',
      'quantity', resolved->'quantity',
      'unitAmount', resolved->'unitAmount',
      'chargeSnapshot', resolved->'chargeSnapshot'
    ));
    coverage := coverage || jsonb_build_array(jsonb_build_object(
      'sourceTransactionId', resolved->>'parentTransactionId',
      'componentTransactionId', resolved->>'parentTransactionId',
      'componentKind', 'parent',
      'amount', (resolved->>'subtotal')::numeric,
      'snapshot', resolved
    ));
    FOR component IN SELECT * FROM jsonb_array_elements(COALESCE(resolved->'taxLines', '[]'::jsonb)) LOOP
      lines := lines || jsonb_build_array(jsonb_build_object(
        'id', component->>'id',
        'transactionType', 'charge',
        'category', 'tax',
        'description', component->>'description',
        'amount', (component->>'amount')::numeric,
        'postedAt', resolved->>'postedAt',
        'paymentMethod', NULL,
        'taxSnapshot', component->'taxSnapshot',
        'originalTransactionId', resolved->>'parentTransactionId',
        'chargeSource', NULL,
        'quantity', NULL,
        'unitAmount', NULL,
        'chargeSnapshot', NULL
      ));
      coverage := coverage || jsonb_build_array(jsonb_build_object(
        'sourceTransactionId', resolved->>'parentTransactionId',
        'componentTransactionId', component->>'id',
        'componentKind', 'tax',
        'amount', (component->>'amount')::numeric,
        'snapshot', component
      ));
    END LOOP;
    FOR component IN SELECT * FROM jsonb_array_elements(COALESCE(resolved->'serviceLines', '[]'::jsonb)) LOOP
      lines := lines || jsonb_build_array(jsonb_build_object(
        'id', component->>'id',
        'transactionType', 'charge',
        'category', 'service_charge',
        'description', component->>'description',
        'amount', (component->>'amount')::numeric,
        'postedAt', resolved->>'postedAt',
        'paymentMethod', NULL,
        'taxSnapshot', component->'taxSnapshot',
        'originalTransactionId', resolved->>'parentTransactionId',
        'chargeSource', NULL,
        'quantity', NULL,
        'unitAmount', NULL,
        'chargeSnapshot', NULL
      ));
      coverage := coverage || jsonb_build_array(jsonb_build_object(
        'sourceTransactionId', resolved->>'parentTransactionId',
        'componentTransactionId', component->>'id',
        'componentKind', 'service_charge',
        'amount', (component->>'amount')::numeric,
        'snapshot', component
      ));
    END LOOP;
  END LOOP;

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

  SELECT
    r.currency_code, r.legal_entity_name, r.legal_name, r.brand_name,
    r.trading_name, r.vat_number, r.vat_registered, r.tin_number, r.full_address, r.phone
  INTO prop
  FROM public.restaurants r
  WHERE r.id = _restaurant_id;

  SELECT gp.first_name, gp.last_name, gp.email, gp.phone
  INTO guest
  FROM public.guest_profiles gp
  WHERE gp.id = folio.guest_id AND gp.restaurant_id = _restaurant_id;

  SELECT hr.confirmation_number, hr.arrival_date, hr.departure_date, hr.status, rooms.room_number
  INTO res
  FROM public.hotel_reservations hr
  LEFT JOIN public.hotel_rooms rooms
    ON rooms.id = hr.room_id AND rooms.restaurant_id = hr.restaurant_id
  WHERE hr.id = folio.reservation_id AND hr.restaurant_id = _restaurant_id;
  IF FOUND THEN
    room_number := res.room_number;
    confirmation_number := res.confirmation_number;
    arrival_date := res.arrival_date;
    departure_date := res.departure_date;
    reservation_status := res.status;
  END IF;

  snap := jsonb_build_object(
    'version', 2,
    'issuedAt', now(),
    'issuerMembershipId', _membership_id,
    'document', jsonb_build_object(
      'issuedNumber', issued_num,
      'sequenceNumber', next_seq,
      'prefix', settings.prefix,
      'numberPadding', settings.number_padding,
      'taxDisplay', settings.tax_display,
      'invoiceFormat', settings.invoice_format,
      'notes', draft.notes
    ),
    'property', jsonb_build_object(
      'currencyCode', COALESCE(folio.currency, prop.currency_code, 'GBP'),
      'legalEntityName', prop.legal_entity_name,
      'legalName', prop.legal_name,
      'brandName', prop.brand_name,
      'tradingName', prop.trading_name,
      'vatNumber', prop.vat_number,
      'vatRegistered', prop.vat_registered,
      'tinNumber', prop.tin_number,
      'fullAddress', prop.full_address,
      'phone', prop.phone
    ),
    'folio', jsonb_build_object(
      'id', folio.id,
      'folioNumber', folio.folio_number,
      'status', folio.status,
      'currency', folio.currency,
      'guestName', trim(both ' ' from concat(COALESCE(guest.first_name, ''), ' ', COALESCE(guest.last_name, ''))),
      'guestEmail', guest.email,
      'guestPhone', guest.phone,
      'confirmationNumber', confirmation_number,
      'arrivalDate', arrival_date,
      'departureDate', departure_date,
      'reservationStatus', reservation_status,
      'roomNumber', room_number
    ),
    'lines', lines,
    'groups', groups,
    'totals', jsonb_build_object(
      'charges', round(subtotal + tax_total + service_total, 2),
      'credits', 0,
      'balance', round(subtotal + tax_total + service_total, 2),
      'tax', round(tax_total, 2),
      'subtotal', round(subtotal, 2),
      'serviceCharge', round(service_total, 2),
      'invoiceTotal', round(subtotal + tax_total + service_total, 2)
    )
  );

  INSERT INTO public.guest_folio_invoices (
    restaurant_id, folio_id, issued_number, sequence_number, snapshot,
    issued_by_membership_id, idempotency_key, coverage_scope
  ) VALUES (
    _restaurant_id, folio.id, issued_num, next_seq, snap,
    _membership_id, clean_key, 'charge_groups'
  ) RETURNING * INTO invoice;

  INSERT INTO public.guest_folio_invoice_lines (
    restaurant_id, invoice_id, folio_id, source_transaction_id,
    component_transaction_id, component_kind, amount, snapshot
  )
  SELECT
    _restaurant_id,
    invoice.id,
    folio.id,
    (row->>'sourceTransactionId')::uuid,
    (row->>'componentTransactionId')::uuid,
    row->>'componentKind',
    (row->>'amount')::numeric,
    row->'snapshot'
  FROM jsonb_array_elements(coverage) AS row;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'invoice_issued',
    jsonb_build_object(
      'invoice_id', invoice.id,
      'issued_number', invoice.issued_number,
      'sequence_number', invoice.sequence_number,
      'draft_id', draft.id,
      'coverage_scope', 'charge_groups'
    ),
    _membership_id
  );

  DELETE FROM public.guest_folio_invoice_drafts WHERE id = draft.id;
  RETURN invoice;
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%guest_folio_invoice_lines%' THEN
      RAISE EXCEPTION 'CHARGE_ALREADY_INVOICED';
    END IF;
    IF clean_key IS NOT NULL AND SQLERRM ILIKE '%idempotency%' THEN
      SELECT * INTO existing FROM public.guest_folio_invoices
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF FOUND THEN
        RETURN existing;
      END IF;
    END IF;
    RAISE;
END;
$$;


-- Charge correction and cross-ledger transfer block covered groups, and still block a legacy whole-folio invoice.

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
    PERFORM public.assert_guest_charge_not_invoiced(
      _restaurant_id, folio.id, parent.id, 'CORRECTION_INVOICED'
    );
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
    PERFORM public.assert_guest_charge_not_invoiced(
      _restaurant_id, source_folio.id, _source_transaction_id, 'TRANSFER_INVOICED'
    );
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

-- Whole-folio issue remains available and is stored as legacy coverage.

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
    issued_by_membership_id, idempotency_key, coverage_scope
  ) VALUES (
    _restaurant_id, _folio_id, issued_num, next_seq, snap,
    _membership_id, clean_key, 'legacy_folio'
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

REVOKE ALL ON FUNCTION public.guest_folio_invoices_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_folio_invoices_immutable() TO service_role;
REVOKE ALL ON FUNCTION public.assert_guest_charge_not_invoiced(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_guest_invoice_charge_group(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guest_folio_has_legacy_invoice(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_guest_folio_invoice_draft(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_guest_folio_invoice_draft(uuid, uuid, text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_guest_folio_invoice_draft(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_guest_folio_invoice_selection(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_guest_folio_invoice_groups(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_guest_folio_invoice_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.assert_guest_charge_not_invoiced(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_guest_invoice_charge_group(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guest_folio_has_legacy_invoice(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_guest_folio_invoice_draft(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_guest_folio_invoice_draft(uuid, uuid, text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_guest_folio_invoice_draft(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_guest_folio_invoice_selection(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_guest_folio_invoice_groups(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_guest_folio_invoice_draft(uuid, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.issue_guest_folio_invoice_draft(uuid, uuid, uuid, text) IS
  'Issue one immutable guest invoice for the draft charge groups. Does not invoice payments, deposits, or refunds. Replays the same idempotency key.';

