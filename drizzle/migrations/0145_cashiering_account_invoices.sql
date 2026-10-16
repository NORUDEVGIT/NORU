-- Company and group financial-account invoices.
-- Sibling of guest folio invoices. Does not rewrite guest snapshots or guest coverage.
-- One property invoice sequence (pms_issued_invoice_counters) is shared.

CREATE TABLE IF NOT EXISTS public.financial_account_invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL,
  invoice_id uuid,
  event_type text NOT NULL,
  actor_membership_id uuid,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_invoice_events_type_check CHECK (
    event_type IN (
      'invoice_draft_created',
      'invoice_draft_updated',
      'invoice_draft_deleted',
      'invoice_issued',
      'invoice_reprinted'
    )
  ),
  CONSTRAINT financial_account_invoice_events_account_fk
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS financial_account_invoice_events_account_idx
  ON public.financial_account_invoice_events (financial_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_account_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL,
  issued_number text NOT NULL,
  sequence_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  issued_by_membership_id uuid NOT NULL,
  idempotency_key text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  reprint_count integer NOT NULL DEFAULT 0,
  last_reprinted_at timestamptz,
  CONSTRAINT financial_account_invoices_account_fk
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts (id, restaurant_id),
  CONSTRAINT financial_account_invoices_number_unique UNIQUE (restaurant_id, issued_number),
  CONSTRAINT financial_account_invoices_reprint_check CHECK (reprint_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS financial_account_invoices_idempotency_unique
  ON public.financial_account_invoices (restaurant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS financial_account_invoices_account_idx
  ON public.financial_account_invoices (financial_account_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.financial_account_invoices_immutable()
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
    OR NEW.financial_account_id IS DISTINCT FROM OLD.financial_account_id
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
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

DROP TRIGGER IF EXISTS financial_account_invoices_immutable_trg ON public.financial_account_invoices;
CREATE TRIGGER financial_account_invoices_immutable_trg
  BEFORE UPDATE OR DELETE ON public.financial_account_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.financial_account_invoices_immutable();

CREATE TABLE IF NOT EXISTS public.financial_account_invoice_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL,
  notes text,
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_invoice_drafts_account_fk
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT financial_account_invoice_drafts_one_per_account UNIQUE (restaurant_id, financial_account_id),
  CONSTRAINT financial_account_invoice_drafts_notes_check CHECK (
    notes IS NULL OR char_length(notes) <= 500
  )
);

CREATE TABLE IF NOT EXISTS public.financial_account_invoice_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.financial_account_invoice_drafts(id) ON DELETE CASCADE,
  source_group_id uuid NOT NULL REFERENCES public.folio_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_invoice_draft_items_unique UNIQUE (draft_id, source_group_id)
);

CREATE TABLE IF NOT EXISTS public.financial_account_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.financial_account_invoices(id),
  financial_account_id uuid NOT NULL,
  source_group_id uuid NOT NULL,
  component_transaction_id uuid NOT NULL REFERENCES public.folio_transactions(id),
  component_kind text NOT NULL,
  amount numeric(12,2) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_invoice_lines_kind_check CHECK (
    component_kind IN ('parent', 'tax', 'service_charge')
  ),
  CONSTRAINT financial_account_invoice_lines_component_unique UNIQUE (restaurant_id, component_transaction_id),
  CONSTRAINT financial_account_invoice_lines_account_fk
    FOREIGN KEY (financial_account_id, restaurant_id)
    REFERENCES public.financial_accounts (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS financial_account_invoice_lines_group_idx
  ON public.financial_account_invoice_lines (restaurant_id, source_group_id);

CREATE INDEX IF NOT EXISTS financial_account_invoice_lines_invoice_idx
  ON public.financial_account_invoice_lines (invoice_id);

ALTER TABLE public.financial_account_invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_invoice_draft_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_account_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cashiering staff read account invoice events" ON public.financial_account_invoice_events;
CREATE POLICY "Cashiering staff read account invoice events"
  ON public.financial_account_invoice_events FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read account invoices" ON public.financial_account_invoices;
CREATE POLICY "Cashiering staff read account invoices"
  ON public.financial_account_invoices FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read account invoice drafts" ON public.financial_account_invoice_drafts;
CREATE POLICY "Cashiering staff read account invoice drafts"
  ON public.financial_account_invoice_drafts FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

DROP POLICY IF EXISTS "Cashiering staff read account invoice draft items" ON public.financial_account_invoice_draft_items;
CREATE POLICY "Cashiering staff read account invoice draft items"
  ON public.financial_account_invoice_draft_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.financial_account_invoice_drafts d
      WHERE d.id = draft_id
        AND public.has_any_restaurant_role(d.restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office'])
    )
  );

DROP POLICY IF EXISTS "Cashiering staff read account invoice lines" ON public.financial_account_invoice_lines;
CREATE POLICY "Cashiering staff read account invoice lines"
  ON public.financial_account_invoice_lines FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','front_office']));

GRANT SELECT ON public.financial_account_invoice_events TO authenticated;
GRANT SELECT ON public.financial_account_invoices TO authenticated;
GRANT SELECT ON public.financial_account_invoice_drafts TO authenticated;
GRANT SELECT ON public.financial_account_invoice_draft_items TO authenticated;
GRANT SELECT ON public.financial_account_invoice_lines TO authenticated;
GRANT ALL ON public.financial_account_invoice_events TO service_role;
GRANT ALL ON public.financial_account_invoices TO service_role;
GRANT ALL ON public.financial_account_invoice_drafts TO service_role;
GRANT ALL ON public.financial_account_invoice_draft_items TO service_role;
GRANT ALL ON public.financial_account_invoice_lines TO service_role;

CREATE OR REPLACE FUNCTION public.assert_account_charge_not_invoiced(
  _restaurant_id uuid,
  _account_id uuid,
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
    SELECT 1 FROM public.financial_account_invoice_lines
    WHERE restaurant_id = _restaurant_id
      AND financial_account_id = _account_id
      AND (
        component_transaction_id = _source_transaction_id
        OR source_group_id = _source_transaction_id
      )
  ) THEN
    IF _error_code = 'CORRECTION_INVOICED' THEN
      RAISE EXCEPTION 'CORRECTION_INVOICED';
    END IF;
    RAISE EXCEPTION 'TRANSFER_INVOICED';
  END IF;
END;
$$;

-- Owned amount of one account-side row: posted amount minus later transfer-out of that same row.
-- Covered rows are excluded by the caller. A partial guest transfer is already the transfer_in amount,
-- not the original guest gross. Example: laundry 540 with 300 transferred invoices 300.
CREATE OR REPLACE FUNCTION public.account_invoice_row_owned(
  _restaurant_id uuid,
  _account_id uuid,
  _transaction_id uuid
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT round(GREATEST(
    t.amount - COALESCE((
      SELECT sum(abs(moved.amount))
      FROM public.folio_transactions moved
      WHERE moved.restaurant_id = _restaurant_id
        AND moved.financial_account_id = _account_id
        AND moved.transaction_type = 'transfer_out'
        AND moved.original_transaction_id = t.id
    ), 0),
    0
  ), 2)
  FROM public.folio_transactions t
  WHERE t.id = _transaction_id
    AND t.restaurant_id = _restaurant_id
    AND t.financial_account_id = _account_id;
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

    IF EXISTS (
      SELECT 1 FROM public.financial_account_invoice_lines
      WHERE restaurant_id = _restaurant_id AND component_transaction_id = direct.id
    ) THEN
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
      IF EXISTS (
        SELECT 1 FROM public.financial_account_invoice_lines
        WHERE restaurant_id = _restaurant_id AND component_transaction_id = child.id
      ) THEN
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
      IF EXISTS (
        SELECT 1 FROM public.financial_account_invoice_lines
        WHERE restaurant_id = _restaurant_id AND component_transaction_id = tin.id
      ) THEN
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
      SELECT
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'parent'), 0),
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'tax'), 0),
        COALESCE(sum(amount) FILTER (WHERE component_kind = 'service_charge'), 0)
      INTO frozen_subtotal, frozen_tax, frozen_service
      FROM public.financial_account_invoice_lines
      WHERE restaurant_id = _restaurant_id AND source_group_id = group_id;
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

CREATE OR REPLACE FUNCTION public.preview_financial_account_invoice_selection(
  _restaurant_id uuid,
  _account_id uuid,
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
    SELECT 1 FROM public.financial_accounts
    WHERE id = _account_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;
  FOREACH source_id IN ARRAY COALESCE(_source_ids, ARRAY[]::uuid[]) LOOP
    resolved := public.resolve_account_invoice_group(_restaurant_id, _account_id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS TRUE THEN
      groups := groups || jsonb_build_array(resolved);
      subtotal := subtotal + COALESCE((resolved->>'subtotal')::numeric, 0);
      tax_total := tax_total + COALESCE((resolved->>'taxTotal')::numeric, 0);
      service_total := service_total + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0);
    ELSE
      warnings := warnings || jsonb_build_array(jsonb_build_object(
        'sourceGroupId', source_id,
        'code', COALESCE(resolved->>'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE')
      ));
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'groups', groups,
    'warnings', warnings,
    'subtotal', round(subtotal, 2),
    'tax', round(tax_total, 2),
    'serviceCharge', round(service_total, 2),
    'total', round(subtotal + tax_total + service_total, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_financial_account_invoice_draft(
  _restaurant_id uuid,
  _account_id uuid,
  _notes text,
  _membership_id uuid
) RETURNS public.financial_account_invoice_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  draft public.financial_account_invoice_drafts%ROWTYPE;
  clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = _account_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;
  IF acct.status <> 'open' THEN
    RAISE EXCEPTION 'ACCOUNT_CLOSED';
  END IF;
  IF acct.account_kind NOT IN ('company', 'group') THEN
    RAISE EXCEPTION 'ACCOUNT_KIND_NOT_INVOICEABLE';
  END IF;

  SELECT * INTO draft FROM public.financial_account_invoice_drafts
  WHERE restaurant_id = _restaurant_id AND financial_account_id = acct.id;
  IF FOUND THEN
    RETURN draft;
  END IF;

  INSERT INTO public.financial_account_invoice_drafts (
    restaurant_id, financial_account_id, notes, created_by_membership_id, updated_by_membership_id
  ) VALUES (
    _restaurant_id, acct.id, clean_notes, _membership_id, _membership_id
  ) RETURNING * INTO draft;

  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, acct.id, 'invoice_draft_created', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_financial_account_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _notes text,
  _source_ids uuid[],
  _membership_id uuid
) RETURNS public.financial_account_invoice_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.financial_account_invoice_drafts%ROWTYPE;
  source_id uuid;
  resolved jsonb;
  clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  SELECT * INTO draft FROM public.financial_account_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_INVOICE_DRAFT_NOT_FOUND';
  END IF;

  FOREACH source_id IN ARRAY COALESCE(_source_ids, ARRAY[]::uuid[]) LOOP
    resolved := public.resolve_account_invoice_group(_restaurant_id, draft.financial_account_id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(resolved->>'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE');
    END IF;
  END LOOP;

  UPDATE public.financial_account_invoice_drafts
  SET notes = clean_notes,
      updated_by_membership_id = _membership_id,
      updated_at = now()
  WHERE id = draft.id
  RETURNING * INTO draft;

  DELETE FROM public.financial_account_invoice_draft_items WHERE draft_id = draft.id;
  INSERT INTO public.financial_account_invoice_draft_items (draft_id, source_group_id)
  SELECT draft.id, source_id
  FROM unnest(COALESCE(_source_ids, ARRAY[]::uuid[])) AS source_id;

  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.financial_account_id, 'invoice_draft_updated', _membership_id,
    jsonb_build_object('draft_id', draft.id, 'source_count', COALESCE(array_length(_source_ids, 1), 0))
  );
  RETURN draft;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_financial_account_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.financial_account_invoice_drafts%ROWTYPE;
BEGIN
  SELECT * INTO draft FROM public.financial_account_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_INVOICE_DRAFT_NOT_FOUND';
  END IF;
  DELETE FROM public.financial_account_invoice_drafts WHERE id = draft.id;
  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.financial_account_id, 'invoice_draft_deleted', _membership_id,
    jsonb_build_object('draft_id', draft.id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_financial_account_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _membership_id uuid,
  _idempotency_key text DEFAULT NULL
) RETURNS public.financial_account_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.financial_account_invoice_drafts%ROWTYPE;
  acct public.financial_accounts%ROWTYPE;
  master public.guest_account_masters%ROWTYPE;
  settings public.pms_invoice_settings%ROWTYPE;
  existing public.financial_account_invoices%ROWTYPE;
  invoice public.financial_account_invoices%ROWTYPE;
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
  bill_to jsonb;
  issuer_name text;
  draft_found boolean := false;
BEGIN
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO draft FROM public.financial_account_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  draft_found := FOUND;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO existing FROM public.financial_account_invoices
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF draft_found AND existing.financial_account_id IS DISTINCT FROM draft.financial_account_id THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      IF NOT draft_found OR existing.financial_account_id = draft.financial_account_id THEN
        RETURN existing;
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.guest_folio_invoices
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key
    ) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
  END IF;

  IF NOT draft_found THEN
    RAISE EXCEPTION 'ACCOUNT_INVOICE_DRAFT_NOT_FOUND';
  END IF;

  SELECT * INTO acct FROM public.financial_accounts
  WHERE id = draft.financial_account_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;
  IF acct.status <> 'open' THEN
    RAISE EXCEPTION 'ACCOUNT_CLOSED';
  END IF;
  IF acct.account_kind NOT IN ('company', 'group') THEN
    RAISE EXCEPTION 'ACCOUNT_KIND_NOT_INVOICEABLE';
  END IF;

  SELECT array_agg(items.source_group_id ORDER BY items.created_at) INTO source_ids
  FROM public.financial_account_invoice_draft_items items
  WHERE items.draft_id = draft.id;
  IF source_ids IS NULL OR array_length(source_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_INVOICE_DRAFT_EMPTY';
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
    resolved := public.resolve_account_invoice_group(_restaurant_id, acct.id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(resolved->>'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE');
    END IF;
    groups := groups || jsonb_build_array(resolved);
    subtotal := subtotal + COALESCE((resolved->>'subtotal')::numeric, 0);
    tax_total := tax_total + COALESCE((resolved->>'taxTotal')::numeric, 0);
    service_total := service_total + COALESCE((resolved->>'serviceChargeTotal')::numeric, 0);
    FOR component IN SELECT * FROM jsonb_array_elements(COALESCE(resolved->'components', '[]'::jsonb)) LOOP
      PERFORM 1 FROM public.folio_transactions
      WHERE id = (component->>'id')::uuid AND restaurant_id = _restaurant_id
      FOR UPDATE;
      lines := lines || jsonb_build_array(jsonb_build_object(
        'id', component->>'id',
        'kind', component->>'kind',
        'description', component->>'description',
        'amount', (component->>'amount')::numeric,
        'sourceGroupId', resolved->>'sourceGroupId',
        'origin', resolved->>'origin',
        'sourceGuest', resolved->>'sourceGuest',
        'sourceFolioNumber', resolved->>'sourceFolioNumber',
        'sourceRoomNumber', resolved->>'sourceRoomNumber'
      ));
      coverage := coverage || jsonb_build_array(jsonb_build_object(
        'sourceGroupId', resolved->>'sourceGroupId',
        'componentTransactionId', component->>'id',
        'componentKind', component->>'kind',
        'amount', (component->>'amount')::numeric,
        'snapshot', resolved
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

  IF EXISTS (
    SELECT 1 FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id AND issued_number = issued_num
  ) OR EXISTS (
    SELECT 1 FROM public.financial_account_invoices
    WHERE restaurant_id = _restaurant_id AND issued_number = issued_num
  ) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
  END IF;

  SELECT
    r.currency_code, r.legal_entity_name, r.legal_name, r.brand_name,
    r.trading_name, r.vat_number, r.vat_registered, r.tin_number, r.full_address, r.phone
  INTO prop
  FROM public.restaurants r
  WHERE r.id = _restaurant_id;

  SELECT * INTO master FROM public.guest_account_masters
  WHERE id = acct.master_id AND restaurant_id = _restaurant_id;

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

  SELECT NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
  INTO issuer_name
  FROM public.restaurant_users ru
  LEFT JOIN public.profiles p ON p.id = ru.user_id
  WHERE ru.id = _membership_id;

  snap := jsonb_build_object(
    'version', 1,
    'target', 'financial_account',
    'issuedAt', now(),
    'issuerMembershipId', _membership_id,
    'document', jsonb_build_object(
      'issuedNumber', issued_num,
      'sequenceNumber', next_seq,
      'prefix', settings.prefix,
      'numberPadding', settings.number_padding,
      'taxDisplay', settings.tax_display,
      'invoiceFormat', settings.invoice_format,
      'notes', draft.notes,
      'issuedByName', issuer_name
    ),
    'property', jsonb_build_object(
      'currencyCode', COALESCE(acct.currency, prop.currency_code, 'GBP'),
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
    'account', jsonb_build_object(
      'id', acct.id,
      'accountNumber', acct.account_number,
      'accountKind', acct.account_kind,
      'status', acct.status,
      'currency', acct.currency
    ),
    'billTo', bill_to,
    'lines', lines,
    'groups', groups,
    'totals', jsonb_build_object(
      'subtotal', round(subtotal, 2),
      'tax', round(tax_total, 2),
      'serviceCharge', round(service_total, 2),
      'invoiceTotal', round(subtotal + tax_total + service_total, 2)
    )
  );

  INSERT INTO public.financial_account_invoices (
    restaurant_id, financial_account_id, issued_number, sequence_number, snapshot,
    issued_by_membership_id, idempotency_key
  ) VALUES (
    _restaurant_id, acct.id, issued_num, next_seq, snap,
    _membership_id, clean_key
  ) RETURNING * INTO invoice;

  INSERT INTO public.financial_account_invoice_lines (
    restaurant_id, invoice_id, financial_account_id, source_group_id,
    component_transaction_id, component_kind, amount, snapshot
  )
  SELECT
    _restaurant_id,
    invoice.id,
    acct.id,
    (row->>'sourceGroupId')::uuid,
    (row->>'componentTransactionId')::uuid,
    row->>'componentKind',
    (row->>'amount')::numeric,
    row->'snapshot'
  FROM jsonb_array_elements(coverage) AS row;

  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, acct.id, invoice.id, 'invoice_issued', _membership_id,
    jsonb_build_object(
      'invoice_id', invoice.id,
      'issued_number', invoice.issued_number,
      'sequence_number', invoice.sequence_number,
      'draft_id', draft.id
    )
  );

  DELETE FROM public.financial_account_invoice_drafts WHERE id = draft.id;
  RETURN invoice;
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%financial_account_invoice_lines%' THEN
      RAISE EXCEPTION 'ACCOUNT_CHARGE_ALREADY_INVOICED';
    END IF;
    IF clean_key IS NOT NULL AND SQLERRM ILIKE '%idempotency%' THEN
      SELECT * INTO existing FROM public.financial_account_invoices
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF FOUND THEN
        RETURN existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprint_financial_account_invoice(
  _restaurant_id uuid,
  _invoice_id uuid,
  _membership_id uuid
) RETURNS public.financial_account_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  invoice public.financial_account_invoices%ROWTYPE;
BEGIN
  SELECT * INTO invoice FROM public.financial_account_invoices
  WHERE id = _invoice_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;
  UPDATE public.financial_account_invoices
  SET reprint_count = reprint_count + 1,
      last_reprinted_at = now()
  WHERE id = invoice.id
  RETURNING * INTO invoice;
  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, invoice_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, invoice.financial_account_id, invoice.id, 'invoice_reprinted', _membership_id,
    jsonb_build_object('invoice_id', invoice.id, 'reprint_count', invoice.reprint_count)
  );
  RETURN invoice;
END;
$$;

-- Covered account charges cannot transfer back or be corrected. Guest coverage stays on the guest guard.
DO $account_invoice_guards$
DECLARE
  def text;
  updated text;
BEGIN
  def := pg_get_functiondef('public.build_folio_charge_correction(uuid, uuid, text, numeric)'::regprocedure);
  IF position('assert_account_charge_not_invoiced' IN def) = 0 THEN
    updated := replace(
      def,
      $old$    IF acct.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;$old$,
      $new$    IF acct.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;
    PERFORM public.assert_account_charge_not_invoiced(
      _restaurant_id, parent.financial_account_id, parent.id, 'CORRECTION_INVOICED'
    );$new$
    );
    IF updated = def THEN
      RAISE EXCEPTION 'ACCOUNT_CORRECTION_GUARD_NOT_PATCHED';
    END IF;
    EXECUTE updated;
  END IF;

  def := pg_get_functiondef('public.post_cross_ledger_transfer(uuid, text, uuid, uuid, text, uuid, numeric, text, uuid, text)'::regprocedure);
  IF position('assert_account_charge_not_invoiced' IN def) = 0 THEN
    updated := replace(
      def,
      $old$    IF source_account.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;$old$,
      $new$    IF source_account.account_kind NOT IN ('company', 'group') THEN
      RAISE EXCEPTION 'ACCOUNT_KIND_NOT_TRANSFERABLE';
    END IF;
    PERFORM public.assert_account_charge_not_invoiced(
      _restaurant_id, source_account.id, _source_transaction_id, 'TRANSFER_INVOICED'
    );$new$
    );
    IF updated = def THEN
      RAISE EXCEPTION 'ACCOUNT_TRANSFER_GUARD_NOT_PATCHED';
    END IF;
    EXECUTE updated;
  END IF;
END
$account_invoice_guards$;

REVOKE ALL ON FUNCTION public.financial_account_invoices_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_account_charge_not_invoiced(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_invoice_row_owned(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_account_invoice_group(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_financial_account_invoice_groups(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_financial_account_invoice_selection(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_financial_account_invoice_draft(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_financial_account_invoice_draft(uuid, uuid, text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_financial_account_invoice_draft(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_financial_account_invoice_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprint_financial_account_invoice(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.financial_account_invoices_immutable() TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_account_charge_not_invoiced(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.account_invoice_row_owned(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_account_invoice_group(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_financial_account_invoice_groups(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_financial_account_invoice_selection(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_financial_account_invoice_draft(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_financial_account_invoice_draft(uuid, uuid, text, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_financial_account_invoice_draft(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_financial_account_invoice_draft(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprint_financial_account_invoice(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.issue_financial_account_invoice_draft(uuid, uuid, uuid, text) IS
  'Issue one immutable company or group invoice for the draft charge groups. Does not change the account balance. Shares the property invoice counter with guest invoices.';
