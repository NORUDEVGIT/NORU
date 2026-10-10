-- Credit notes for issued guest and financial-account invoices.
-- The issued invoice snapshot is never updated. The credit note is the ledger correction.
-- note_type is credit-only in this phase so a later debit note can share the table.
-- Dual-lane with drizzle/migrations/0146_cashiering_credit_notes.sql.

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
    'credit_note_issued'
  ])
);

ALTER TABLE public.financial_account_invoice_events
  DROP CONSTRAINT IF EXISTS financial_account_invoice_events_type_check;
ALTER TABLE public.financial_account_invoice_events
  ADD CONSTRAINT financial_account_invoice_events_type_check CHECK (
    event_type IN (
      'invoice_draft_created',
      'invoice_draft_updated',
      'invoice_draft_deleted',
      'invoice_issued',
      'invoice_reprinted',
      'credit_note_issued'
    )
  );

CREATE TABLE IF NOT EXISTS public.pms_credit_note_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_credit_note_counters_seq_check CHECK (last_sequence >= 0)
);

CREATE TABLE IF NOT EXISTS public.invoice_credit_note_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_invoice_id uuid,
  account_invoice_id uuid,
  credit_note_id uuid,
  folio_id uuid,
  financial_account_id uuid,
  event_type text NOT NULL,
  actor_membership_id uuid,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_note_events_type_check CHECK (
    event_type IN (
      'credit_note_draft_created',
      'credit_note_draft_updated',
      'credit_note_draft_deleted',
      'credit_note_issued'
    )
  )
);

CREATE INDEX IF NOT EXISTS invoice_credit_note_events_guest_idx
  ON public.invoice_credit_note_events (guest_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoice_credit_note_events_account_idx
  ON public.invoice_credit_note_events (account_invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  note_type text NOT NULL DEFAULT 'credit',
  guest_invoice_id uuid REFERENCES public.guest_folio_invoices(id),
  account_invoice_id uuid REFERENCES public.financial_account_invoices(id),
  folio_id uuid,
  financial_account_id uuid,
  note_number text NOT NULL,
  sequence_number integer NOT NULL,
  currency text NOT NULL,
  reason text NOT NULL,
  subtotal_delta numeric(12,2) NOT NULL,
  tax_delta numeric(12,2) NOT NULL,
  service_charge_delta numeric(12,2) NOT NULL,
  total_delta numeric(12,2) NOT NULL,
  snapshot jsonb NOT NULL,
  issued_by_membership_id uuid NOT NULL,
  idempotency_key text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  reprint_count integer NOT NULL DEFAULT 0,
  last_reprinted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_notes_type_check CHECK (note_type IN ('credit')),
  CONSTRAINT invoice_credit_notes_target_check CHECK (
    num_nonnulls(guest_invoice_id, account_invoice_id) = 1
  ),
  CONSTRAINT invoice_credit_notes_reason_check CHECK (
    char_length(btrim(reason)) BETWEEN 1 AND 500
  ),
  CONSTRAINT invoice_credit_notes_number_unique UNIQUE (restaurant_id, note_number),
  CONSTRAINT invoice_credit_notes_reprint_check CHECK (reprint_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_credit_notes_idempotency_unique
  ON public.invoice_credit_notes (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_credit_notes_guest_idx
  ON public.invoice_credit_notes (guest_invoice_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS invoice_credit_notes_account_idx
  ON public.invoice_credit_notes (account_invoice_id, issued_at DESC);

COMMENT ON TABLE public.invoice_credit_notes IS
  'Immutable issued credit notes. note_type accepts only credit until debit notes are built. Debit notes can reuse this table later.';

CREATE TABLE IF NOT EXISTS public.invoice_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  credit_note_id uuid NOT NULL REFERENCES public.invoice_credit_notes(id),
  source_group_id uuid NOT NULL,
  component_transaction_id uuid NOT NULL REFERENCES public.folio_transactions(id),
  component_kind text NOT NULL,
  original_amount numeric(12,2) NOT NULL,
  credited_amount numeric(12,2) NOT NULL,
  description text NOT NULL,
  snapshot jsonb NOT NULL,
  ledger_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_note_lines_kind_check CHECK (
    component_kind IN ('parent', 'tax', 'service_charge')
  ),
  CONSTRAINT invoice_credit_note_lines_amount_check CHECK (credited_amount > 0),
  CONSTRAINT invoice_credit_note_lines_component_unique UNIQUE (credit_note_id, component_transaction_id)
);

CREATE INDEX IF NOT EXISTS invoice_credit_note_lines_component_idx
  ON public.invoice_credit_note_lines (restaurant_id, component_transaction_id);

CREATE TABLE IF NOT EXISTS public.invoice_credit_note_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  note_type text NOT NULL DEFAULT 'credit',
  guest_invoice_id uuid REFERENCES public.guest_folio_invoices(id) ON DELETE CASCADE,
  account_invoice_id uuid REFERENCES public.financial_account_invoices(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_note_drafts_type_check CHECK (note_type IN ('credit')),
  CONSTRAINT invoice_credit_note_drafts_target_check CHECK (
    num_nonnulls(guest_invoice_id, account_invoice_id) = 1
  ),
  CONSTRAINT invoice_credit_note_drafts_reason_check CHECK (
    char_length(btrim(reason)) BETWEEN 1 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_credit_note_drafts_guest_unique
  ON public.invoice_credit_note_drafts (restaurant_id, guest_invoice_id)
  WHERE guest_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_credit_note_drafts_account_unique
  ON public.invoice_credit_note_drafts (restaurant_id, account_invoice_id)
  WHERE account_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoice_credit_note_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.invoice_credit_note_drafts(id) ON DELETE CASCADE,
  source_group_id uuid NOT NULL REFERENCES public.folio_transactions(id),
  requested_gross numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_note_draft_items_amount_check CHECK (requested_gross > 0),
  CONSTRAINT invoice_credit_note_draft_items_unique UNIQUE (draft_id, source_group_id)
);

CREATE OR REPLACE FUNCTION public.invoice_credit_notes_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.note_number IS DISTINCT FROM OLD.note_number
    OR NEW.guest_invoice_id IS DISTINCT FROM OLD.guest_invoice_id
    OR NEW.account_invoice_id IS DISTINCT FROM OLD.account_invoice_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.subtotal_delta IS DISTINCT FROM OLD.subtotal_delta
    OR NEW.tax_delta IS DISTINCT FROM OLD.tax_delta
    OR NEW.service_charge_delta IS DISTINCT FROM OLD.service_charge_delta
    OR NEW.total_delta IS DISTINCT FROM OLD.total_delta
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
    OR NEW.note_type IS DISTINCT FROM OLD.note_type
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.issued_by_membership_id IS DISTINCT FROM OLD.issued_by_membership_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_credit_notes_immutable_trg ON public.invoice_credit_notes;
CREATE TRIGGER invoice_credit_notes_immutable_trg
  BEFORE UPDATE OR DELETE ON public.invoice_credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_notes_immutable();

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
  THEN
    RAISE EXCEPTION 'INVOICE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_credit_note_lines_immutable_trg ON public.invoice_credit_note_lines;
CREATE TRIGGER invoice_credit_note_lines_immutable_trg
  BEFORE UPDATE OR DELETE ON public.invoice_credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_note_lines_immutable();

CREATE OR REPLACE FUNCTION public.invoice_credit_lines_within_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  original numeric;
  credited numeric;
BEGIN
  SELECT amount INTO original
  FROM public.guest_folio_invoice_lines
  WHERE restaurant_id = NEW.restaurant_id
    AND component_transaction_id = NEW.component_transaction_id;
  IF NOT FOUND THEN
    SELECT amount INTO original
    FROM public.financial_account_invoice_lines
    WHERE restaurant_id = NEW.restaurant_id
      AND component_transaction_id = NEW.component_transaction_id;
  END IF;
  IF original IS NULL THEN
    RAISE EXCEPTION 'INVOICE_ITEM_NOT_CREDITABLE';
  END IF;
  SELECT COALESCE(sum(credited_amount), 0) INTO credited
  FROM public.invoice_credit_note_lines
  WHERE restaurant_id = NEW.restaurant_id
    AND component_transaction_id = NEW.component_transaction_id;
  IF credited > original + 0.009 THEN
    RAISE EXCEPTION 'CREDIT_EXCEEDS_REMAINDER';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_credit_lines_within_invoice_trg ON public.invoice_credit_note_lines;
CREATE TRIGGER invoice_credit_lines_within_invoice_trg
  AFTER INSERT ON public.invoice_credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_lines_within_invoice();

ALTER TABLE public.pms_credit_note_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_note_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_note_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_note_draft_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cashiering staff read credit notes" ON public.invoice_credit_notes;
CREATE POLICY "Cashiering staff read credit notes"
  ON public.invoice_credit_notes FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read credit note lines" ON public.invoice_credit_note_lines;
CREATE POLICY "Cashiering staff read credit note lines"
  ON public.invoice_credit_note_lines FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read credit note drafts" ON public.invoice_credit_note_drafts;
CREATE POLICY "Cashiering staff read credit note drafts"
  ON public.invoice_credit_note_drafts FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read credit note draft items" ON public.invoice_credit_note_draft_items;
CREATE POLICY "Cashiering staff read credit note draft items"
  ON public.invoice_credit_note_draft_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoice_credit_note_drafts d
      WHERE d.id = draft_id
        AND public.has_any_restaurant_role(d.restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office'])
    )
  );

DROP POLICY IF EXISTS "Cashiering staff read credit note events" ON public.invoice_credit_note_events;
CREATE POLICY "Cashiering staff read credit note events"
  ON public.invoice_credit_note_events FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

GRANT SELECT ON public.invoice_credit_notes TO authenticated;
GRANT SELECT ON public.invoice_credit_note_lines TO authenticated;
GRANT SELECT ON public.invoice_credit_note_drafts TO authenticated;
GRANT SELECT ON public.invoice_credit_note_draft_items TO authenticated;
GRANT SELECT ON public.invoice_credit_note_events TO authenticated;
GRANT ALL ON public.pms_credit_note_counters TO service_role;
GRANT ALL ON public.invoice_credit_notes TO service_role;
GRANT ALL ON public.invoice_credit_note_lines TO service_role;
GRANT ALL ON public.invoice_credit_note_drafts TO service_role;
GRANT ALL ON public.invoice_credit_note_draft_items TO service_role;
GRANT ALL ON public.invoice_credit_note_events TO service_role;

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
  snapshot jsonb
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
      lines.snapshot
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
      lines.snapshot
    FROM public.financial_account_invoice_lines lines
    WHERE lines.restaurant_id = _restaurant_id
      AND lines.invoice_id = _account_invoice_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_invoice_credit(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item jsonb;
  gid uuid;
  gross numeric;
  seen uuid[] := ARRAY[]::uuid[];
  comp record;
  alloc_input jsonb;
  shares jsonb;
  share jsonb;
  parent_credit numeric;
  tax_credit numeric;
  service_credit numeric;
  remaining_gross numeric;
  group_components jsonb;
  all_groups jsonb := '[]'::jsonb;
  all_lines jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  tax_total numeric := 0;
  service_total numeric := 0;
  parent_snap jsonb;
  credited numeric;
  found_invoice boolean;
BEGIN
  IF (_guest_invoice_id IS NULL) = (_account_invoice_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_INVOICE_TARGET');
  END IF;
  IF _guest_invoice_id IS NOT NULL THEN
    SELECT true INTO found_invoice FROM public.guest_folio_invoices
    WHERE id = _guest_invoice_id AND restaurant_id = _restaurant_id AND issued_number IS NOT NULL;
  ELSE
    SELECT true INTO found_invoice FROM public.financial_account_invoices
    WHERE id = _account_invoice_id AND restaurant_id = _restaurant_id AND issued_number IS NOT NULL;
  END IF;
  IF NOT COALESCE(found_invoice, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_NOT_FOUND');
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CREDIT_NOTE_DRAFT_EMPTY');
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    gid := (item->>'sourceGroupId')::uuid;
    gross := round(COALESCE((item->>'gross')::numeric, 0), 2);
    IF gid IS NULL OR gid = ANY(seen) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_ITEM_NOT_CREDITABLE', 'sourceGroupId', gid);
    END IF;
    seen := seen || gid;
    IF gross <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'sourceGroupId', gid);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
      WHERE rows.source_group_id = gid
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_ITEM_NOT_CREDITABLE', 'sourceGroupId', gid);
    END IF;

    alloc_input := '[]'::jsonb;
    remaining_gross := 0;
    parent_credit := 0;
    tax_credit := 0;
    service_credit := 0;
    group_components := '[]'::jsonb;
    SELECT rows.snapshot INTO parent_snap
    FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
    WHERE rows.source_group_id = gid AND rows.component_kind = 'parent'
    LIMIT 1;

    FOR comp IN
      SELECT * FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
      WHERE rows.source_group_id = gid
    LOOP
      IF round(comp.original_amount - comp.credited_amount, 2) > 0.009 THEN
        remaining_gross := remaining_gross + round(comp.original_amount - comp.credited_amount, 2);
        alloc_input := alloc_input || jsonb_build_array(jsonb_build_object(
          'id', comp.component_transaction_id,
          'remaining', round(comp.original_amount - comp.credited_amount, 2)
        ));
      END IF;
    END LOOP;
    remaining_gross := round(remaining_gross, 2);
    IF gross > remaining_gross + 0.009 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CREDIT_EXCEEDS_REMAINDER', 'sourceGroupId', gid);
    END IF;

    shares := public.allocate_transfer_shares(alloc_input, gross);
    FOR share IN SELECT value FROM jsonb_array_elements(shares) LOOP
      SELECT * INTO comp
      FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
      WHERE rows.component_transaction_id = (share->>'id')::uuid
        AND rows.source_group_id = gid;
      credited := round((share->>'share')::numeric, 2);
      IF credited <= 0 THEN
        CONTINUE;
      END IF;
      IF comp.component_kind = 'parent' THEN
        parent_credit := parent_credit + credited;
      ELSIF comp.component_kind = 'tax' THEN
        tax_credit := tax_credit + credited;
      ELSE
        service_credit := service_credit + credited;
      END IF;
      group_components := group_components || jsonb_build_array(jsonb_build_object(
        'id', comp.component_transaction_id,
        'kind', comp.component_kind,
        'description', comp.description,
        'original', comp.original_amount,
        'credited', credited
      ));
      all_lines := all_lines || jsonb_build_array(jsonb_build_object(
        'sourceGroupId', gid,
        'componentTransactionId', comp.component_transaction_id,
        'kind', comp.component_kind,
        'description', comp.description,
        'original', comp.original_amount,
        'credited', credited,
        'snapshot', comp.snapshot
      ));
    END LOOP;

    subtotal := subtotal + parent_credit;
    tax_total := tax_total + tax_credit;
    service_total := service_total + service_credit;
    all_groups := all_groups || jsonb_build_array(jsonb_build_object(
      'sourceGroupId', gid,
      'description', COALESCE(parent_snap->>'description', 'Charge'),
      'sourceGuest', parent_snap->>'sourceGuest',
      'sourceFolioNumber', parent_snap->>'sourceFolioNumber',
      'sourceRoomNumber', parent_snap->>'sourceRoomNumber',
      'originalGross', (
        SELECT round(sum(rows.original_amount), 2)
        FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
        WHERE rows.source_group_id = gid
      ),
      'previouslyCredited', round((
        SELECT COALESCE(sum(rows.credited_amount), 0)
        FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows
        WHERE rows.source_group_id = gid
      ), 2),
      'creditGross', gross,
      'subtotal', round(parent_credit, 2),
      'tax', round(tax_credit, 2),
      'serviceCharge', round(service_credit, 2),
      'components', group_components
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'subtotal', round(subtotal, 2),
    'tax', round(tax_total, 2),
    'serviceCharge', round(service_total, 2),
    'total', round(subtotal + tax_total + service_total, 2),
    'groups', all_groups,
    'lines', all_lines
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

  SELECT COALESCE(round(sum(rows.original_amount), 2), 0),
         COALESCE(round(sum(rows.credited_amount), 2), 0)
  INTO original_total, previous
  FROM public.invoice_credit_component_rows(_restaurant_id, _guest_invoice_id, _account_invoice_id) rows;
  IF original_total = 0 THEN
    original_total := round(COALESCE((snap->'totals'->>'invoiceTotal')::numeric, (snap->'totals'->>'balance')::numeric, 0), 2);
  END IF;
  remaining := round(original_total - previous, 2);
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
  ) ORDER BY issued_note.issued_at), '[]'::jsonb)
  INTO notes
  FROM public.invoice_credit_notes issued_note
  WHERE issued_note.restaurant_id = _restaurant_id
    AND issued_note.guest_invoice_id IS NOT DISTINCT FROM _guest_invoice_id
    AND issued_note.account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;

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
    'remaining', remaining,
    'netInvoice', remaining,
    'creditState', credit_state,
    'balance', balance,
    'groups', groups,
    'draft', draft,
    'notes', notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_invoice_credit_note(
  _restaurant_id uuid,
  _guest_invoice_id uuid,
  _account_invoice_id uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan jsonb;
  board jsonb;
  projected numeric;
BEGIN
  plan := public.plan_invoice_credit(_restaurant_id, _guest_invoice_id, _account_invoice_id, _items);
  IF COALESCE((plan->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN plan;
  END IF;
  board := public.list_invoice_credit_board(_restaurant_id, _guest_invoice_id, _account_invoice_id);
  projected := round(COALESCE((board->>'balance')::numeric, 0) - COALESCE((plan->>'total')::numeric, 0), 2);
  RETURN plan || jsonb_build_object(
    'originalTotal', board->'originalTotal',
    'previousCredits', board->'previousCredits',
    'netAfter', round(COALESCE((board->>'remaining')::numeric, 0) - COALESCE((plan->>'total')::numeric, 0), 2),
    'projectedBalance', projected,
    'creditBalance', CASE WHEN projected < -0.009 THEN round(abs(projected), 2) ELSE NULL END,
    'currency', board->'currency',
    'billToName', board->'billToName',
    'invoiceNumber', board->'invoiceNumber'
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
    AND account_invoice_id IS NOT DISTINCT FROM _account_invoice_id;
  IF FOUND THEN
    RETURN draft;
  END IF;
  INSERT INTO public.invoice_credit_note_drafts (
    restaurant_id, guest_invoice_id, account_invoice_id, reason,
    created_by_membership_id, updated_by_membership_id
  ) VALUES (
    _restaurant_id, _guest_invoice_id, _account_invoice_id, clean_reason,
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
  IF NOT FOUND THEN
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
  IF NOT FOUND THEN
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
      IF draft_found AND (
        existing.guest_invoice_id IS DISTINCT FROM draft.guest_invoice_id
        OR existing.account_invoice_id IS DISTINCT FROM draft.account_invoice_id
      ) THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN existing;
    END IF;
  END IF;

  IF NOT draft_found THEN
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
      'netInvoice', round(original_total - previous - (plan->>'total')::numeric, 2)
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
      IF FOUND THEN
        RETURN existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprint_invoice_credit_note(
  _restaurant_id uuid,
  _note_id uuid,
  _membership_id uuid
) RETURNS public.invoice_credit_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  note public.invoice_credit_notes%ROWTYPE;
BEGIN
  SELECT * INTO note FROM public.invoice_credit_notes
  WHERE id = _note_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_NOTE_NOT_FOUND';
  END IF;
  UPDATE public.invoice_credit_notes
  SET reprint_count = reprint_count + 1,
      last_reprinted_at = now()
  WHERE id = note.id
  RETURNING * INTO note;
  RETURN note;
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_credit_notes_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credit_note_lines_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credit_lines_within_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credit_component_rows(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_invoice_credit(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_invoice_credit_board(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_invoice_credit_note(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_invoice_credit_note_draft(uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_invoice_credit_note_draft(uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_invoice_credit_note_draft(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invoice_credit_note_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprint_invoice_credit_note(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.invoice_credit_notes_immutable() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_credit_note_lines_immutable() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_credit_lines_within_invoice() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_credit_component_rows(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_invoice_credit(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_invoice_credit_board(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_invoice_credit_note(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invoice_credit_note_draft(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_invoice_credit_note_draft(uuid, uuid, text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_credit_note_draft(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_invoice_credit_note_draft(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprint_invoice_credit_note(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.issue_invoice_credit_note_draft(uuid, uuid, uuid, text) IS
  'Issue one immutable credit note and append the ledger adjustment once. Does not change the issued invoice.';
