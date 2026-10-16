-- Structured guest-service folio charges.
-- Settings owns chargeable_to_folio and one billing department.
-- Folio rows freeze quantity, unit amount, and a name snapshot at post time.
-- Dual-lane with drizzle/migrations/0138_cashiering_service_charges.sql.

ALTER TABLE public.pms_guest_service_types
  ADD COLUMN IF NOT EXISTS chargeable_to_folio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pms_guest_service_types.chargeable_to_folio IS
  'When true, an active priced service with one billing department can be posted from Cashiering. Price alone does not make a service chargeable.';

ALTER TABLE public.pms_guest_service_department_assignments
  ADD COLUMN IF NOT EXISTS is_billing_department boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS pms_guest_service_billing_dept_unique
  ON public.pms_guest_service_department_assignments (service_type_id)
  WHERE is_billing_department;

COMMENT ON COLUMN public.pms_guest_service_department_assignments.is_billing_department IS
  'Exactly one assignment per service type may be the billing department used by Cashiering. Operational assignments may still exist.';

ALTER TABLE public.folio_transactions
  ADD COLUMN IF NOT EXISTS charge_source text,
  ADD COLUMN IF NOT EXISTS service_type_id uuid,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS unit_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS charge_snapshot jsonb;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_charge_source_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_charge_source_check CHECK (
    charge_source IS NULL OR charge_source IN (
      'service', 'manual', 'room', 'pos', 'package', 'transfer', 'system'
    )
  );

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_quantity_check;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_quantity_check CHECK (
    quantity IS NULL OR (quantity >= 1 AND quantity <= 99)
  );

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_service_type_fk;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_service_type_fk
  FOREIGN KEY (service_type_id, restaurant_id)
  REFERENCES public.pms_guest_service_types (id, restaurant_id);

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_department_fk;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_department_fk
  FOREIGN KEY (department_id, restaurant_id)
  REFERENCES public.pms_departments (id, restaurant_id);

COMMENT ON COLUMN public.folio_transactions.charge_snapshot IS
  'Frozen service name, department, unit, and entered amount at post time. Settings edits must not rewrite posted lines.';

CREATE OR REPLACE FUNCTION public.folio_transactions_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.folio_id IS DISTINCT FROM OLD.folio_id
      OR NEW.financial_account_id IS DISTINCT FROM OLD.financial_account_id
      OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
      OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
      OR NEW.posted_by_membership_id IS DISTINCT FROM OLD.posted_by_membership_id
      OR NEW.posted_at IS DISTINCT FROM OLD.posted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
      OR NEW.original_transaction_id IS DISTINCT FROM OLD.original_transaction_id
      OR NEW.hotel_cashier_shift_id IS DISTINCT FROM OLD.hotel_cashier_shift_id
      OR NEW.folio_window_id IS DISTINCT FROM OLD.folio_window_id
      OR NEW.transfer_id IS DISTINCT FROM OLD.transfer_id
      OR NEW.transfer_direction IS DISTINCT FROM OLD.transfer_direction
      OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
      OR NEW.charge_source IS DISTINCT FROM OLD.charge_source
      OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id
      OR NEW.department_id IS DISTINCT FROM OLD.department_id
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW.unit_amount IS DISTINCT FROM OLD.unit_amount
      OR NEW.charge_snapshot IS DISTINCT FROM OLD.charge_snapshot
    THEN
      RAISE EXCEPTION 'FOLIO_TRANSACTION_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Same signature as 0135. New manual and room posts record charge_source on insert.
-- A service post sets transaction-local noru.charge_* values before calling this function.
CREATE OR REPLACE FUNCTION public.post_folio_charge_with_tax(
  _restaurant_id uuid,
  _folio_id uuid,
  _category text,
  _description text,
  _amount numeric,
  _tax_basis text,
  _reference_type text,
  _reference_id uuid,
  _membership_id uuid,
  _folio_window_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  txn public.folio_transactions%ROWTYPE;
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
  clean_key text := NULLIF(btrim(COALESCE(_idempotency_key, '')), '');
  default_group uuid;
  parent_amount numeric(12,2);
  has_inclusive boolean := false;
  tax_row record;
  remaining numeric(12,2);
  source_text text := NULLIF(current_setting('noru.charge_source', true), '');
  service_text text := NULLIF(current_setting('noru.service_type_id', true), '');
  department_text text := NULLIF(current_setting('noru.department_id', true), '');
  quantity_text text := NULLIF(current_setting('noru.quantity', true), '');
  unit_text text := NULLIF(current_setting('noru.unit_amount', true), '');
  snapshot_text text := NULLIF(current_setting('noru.charge_snapshot', true), '');
BEGIN
  IF _category NOT IN ('room', 'manual') THEN
    RAISE EXCEPTION 'INVALID_CHARGE_CATEGORY';
  END IF;
  IF _tax_basis NOT IN ('room', 'folio') THEN
    RAISE EXCEPTION 'INVALID_TAX_BASIS';
  END IF;
  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF clean_key IS NOT NULL AND (char_length(clean_key) < 8 OR char_length(clean_key) > 80) THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF clean_key IS NOT NULL THEN
    SELECT * INTO txn FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
    IF FOUND THEN
      IF txn.folio_id IS DISTINCT FROM folio.id OR txn.transaction_type IS DISTINCT FROM 'charge' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
      END IF;
      RETURN txn;
    END IF;
  END IF;

  default_group := _default_tax_group_id;
  IF default_group IS NULL AND _tax_basis = 'room' THEN
    SELECT default_room_tax_group_id INTO default_group
    FROM public.restaurants WHERE id = _restaurant_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, default_group) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  parent_amount := round(_amount, 2);
  IF has_inclusive THEN
    remaining := parent_amount;
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, default_group) t
      WHERE t.calculation = 'inclusive'
    LOOP
      remaining := round(
        remaining - public.compute_folio_tax_component_amount(
          remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
        ),
        2
      );
    END LOOP;
    parent_amount := remaining;
  END IF;

  BEGIN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id, idempotency_key, folio_window_id,
      charge_source, service_type_id, department_id, quantity, unit_amount, charge_snapshot
    ) VALUES (
      _restaurant_id, folio.id, 'charge', _category, clean_desc, parent_amount,
      _reference_type, _reference_id, _membership_id, clean_key, _folio_window_id,
      COALESCE(source_text, CASE _category WHEN 'room' THEN 'room' WHEN 'manual' THEN 'manual' ELSE NULL END),
      service_text::uuid,
      department_text::uuid,
      quantity_text::integer,
      unit_text::numeric,
      snapshot_text::jsonb
    ) RETURNING * INTO txn;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO txn FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id AND idempotency_key = clean_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      RETURN txn;
  END;

  PERFORM public.append_folio_tax_and_service_lines(
    _restaurant_id, folio.id, txn.id, _amount, _tax_basis, _membership_id,
    _folio_window_id, default_group
  );

  SELECT * INTO txn FROM public.folio_transactions WHERE id = txn.id;
  RETURN txn;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_chargeable_guest_service(
  _restaurant_id uuid,
  _service_type_id uuid,
  _quantity integer,
  _folio_currency text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  svc record;
  price record;
  billing_count integer;
  dept record;
  entered numeric(12,2);
BEGIN
  SELECT t.id, t.name, t.code, t.active, t.chargeable_to_folio,
         c.id AS category_id, c.name AS category_name, c.code AS category_code, c.active AS category_active
  INTO svc
  FROM public.pms_guest_service_types t
  INNER JOIN public.pms_guest_service_categories c
    ON c.id = t.category_id AND c.restaurant_id = t.restaurant_id
  WHERE t.id = _service_type_id AND t.restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;
  IF svc.active IS NOT TRUE OR svc.category_active IS NOT TRUE THEN
    RAISE EXCEPTION 'SERVICE_INACTIVE';
  END IF;
  IF svc.chargeable_to_folio IS NOT TRUE THEN
    RAISE EXCEPTION 'SERVICE_NOT_CHARGEABLE';
  END IF;

  SELECT p.id, p.amount, p.currency_code, p.pricing_unit, p.active
  INTO price
  FROM public.pms_guest_service_pricing p
  WHERE p.service_type_id = svc.id AND p.restaurant_id = _restaurant_id;
  IF NOT FOUND OR price.active IS NOT TRUE OR price.amount IS NULL OR price.amount <= 0 THEN
    RAISE EXCEPTION 'SERVICE_PRICE_MISSING';
  END IF;
  IF upper(price.currency_code) IS DISTINCT FROM upper(COALESCE(_folio_currency, '')) THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH';
  END IF;

  IF price.pricing_unit IN ('per_service', 'per_room') THEN
    IF _quantity IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
  ELSIF price.pricing_unit IN ('per_item', 'per_person', 'per_night') THEN
    IF _quantity IS NULL OR _quantity < 1 OR _quantity > 99 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  SELECT count(*) INTO billing_count
  FROM public.pms_guest_service_department_assignments a
  INNER JOIN public.pms_departments d
    ON d.id = a.department_id AND d.restaurant_id = a.restaurant_id
  WHERE a.restaurant_id = _restaurant_id
    AND a.service_type_id = svc.id
    AND a.active = true
    AND a.is_billing_department = true
    AND d.active = true;
  IF billing_count = 0 THEN
    RAISE EXCEPTION 'BILLING_DEPARTMENT_REQUIRED';
  END IF;
  IF billing_count > 1 THEN
    RAISE EXCEPTION 'BILLING_DEPARTMENT_AMBIGUOUS';
  END IF;

  SELECT d.id, d.code, d.name, a.id AS assignment_id
  INTO dept
  FROM public.pms_guest_service_department_assignments a
  INNER JOIN public.pms_departments d
    ON d.id = a.department_id AND d.restaurant_id = a.restaurant_id
  WHERE a.restaurant_id = _restaurant_id
    AND a.service_type_id = svc.id
    AND a.active = true
    AND a.is_billing_department = true
    AND d.active = true;

  entered := round(price.amount * _quantity, 2);
  IF entered <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  RETURN jsonb_build_object(
    'serviceTypeId', svc.id,
    'code', svc.code,
    'name', svc.name,
    'categoryId', svc.category_id,
    'categoryCode', svc.category_code,
    'categoryName', svc.category_name,
    'departmentId', dept.id,
    'departmentCode', dept.code,
    'departmentName', dept.name,
    'pricingId', price.id,
    'pricingUnit', price.pricing_unit,
    'currency', price.currency_code,
    'unitAmount', price.amount,
    'quantity', _quantity,
    'enteredAmount', entered
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_chargeable_guest_services(
  _restaurant_id uuid,
  _folio_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  items jsonb;
BEGIN
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  SELECT COALESCE(jsonb_agg(payload ORDER BY sort_key), '[]'::jsonb)
  INTO items
  FROM (
    SELECT
      jsonb_build_object(
        'serviceTypeId', t.id,
        'code', t.code,
        'name', t.name,
        'categoryId', c.id,
        'categoryCode', c.code,
        'categoryName', c.name,
        'departmentId', d.id,
        'departmentCode', d.code,
        'departmentName', d.name,
        'pricingUnit', p.pricing_unit,
        'currency', p.currency_code,
        'unitAmount', CASE WHEN p.active IS TRUE AND p.amount > 0 THEN p.amount ELSE NULL END,
        'quantityMode', CASE
          WHEN p.pricing_unit IN ('per_item', 'per_person', 'per_night') THEN 'editable'
          ELSE 'fixed'
        END,
        'chargeable', t.chargeable_to_folio,
        'priced', (p.id IS NOT NULL AND p.active IS TRUE AND p.amount > 0),
        'currencyMatches', (
          p.id IS NOT NULL
          AND p.active IS TRUE
          AND p.amount > 0
          AND upper(p.currency_code) = upper(folio.currency)
        )
      ) AS payload,
      lower(d.name) || lpad(c.display_order::text, 8, '0') || lpad(t.display_order::text, 8, '0') || lower(t.name) AS sort_key
    FROM public.pms_guest_service_types t
    INNER JOIN public.pms_guest_service_categories c
      ON c.id = t.category_id AND c.restaurant_id = t.restaurant_id
    INNER JOIN public.pms_guest_service_department_assignments a
      ON a.service_type_id = t.id
     AND a.restaurant_id = t.restaurant_id
     AND a.active = true
     AND a.is_billing_department = true
    INNER JOIN public.pms_departments d
      ON d.id = a.department_id AND d.restaurant_id = a.restaurant_id AND d.active = true
    LEFT JOIN public.pms_guest_service_pricing p
      ON p.service_type_id = t.id AND p.restaurant_id = t.restaurant_id
    WHERE t.restaurant_id = _restaurant_id
      AND t.active = true
      AND c.active = true
      AND (
        SELECT count(*)
        FROM public.pms_guest_service_department_assignments a2
        INNER JOIN public.pms_departments d2
          ON d2.id = a2.department_id AND d2.restaurant_id = a2.restaurant_id
        WHERE a2.restaurant_id = _restaurant_id
          AND a2.service_type_id = t.id
          AND a2.active = true
          AND a2.is_billing_department = true
          AND d2.active = true
      ) = 1
  ) listed;

  RETURN items;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_folio_service_charge(
  _restaurant_id uuid,
  _folio_id uuid,
  _service_type_id uuid,
  _quantity integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  resolved jsonb;
  tax jsonb;
BEGIN
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  resolved := public.resolve_chargeable_guest_service(
    _restaurant_id, _service_type_id, _quantity, folio.currency
  );
  tax := public.preview_folio_charge(
    _restaurant_id, _folio_id, (resolved->>'enteredAmount')::numeric
  );
  RETURN tax || jsonb_build_object(
    'serviceTypeId', resolved->>'serviceTypeId',
    'code', resolved->>'code',
    'name', resolved->>'name',
    'categoryName', resolved->>'categoryName',
    'departmentId', resolved->>'departmentId',
    'departmentName', resolved->>'departmentName',
    'pricingUnit', resolved->>'pricingUnit',
    'unitAmount', (resolved->>'unitAmount')::numeric,
    'quantity', (resolved->>'quantity')::integer,
    'enteredAmount', (resolved->>'enteredAmount')::numeric,
    'snapshot', resolved
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_service_charge(
  _restaurant_id uuid,
  _folio_id uuid,
  _service_type_id uuid,
  _quantity integer,
  _description text,
  _membership_id uuid,
  _idempotency_key text
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  resolved jsonb;
  clean_desc text;
  txn public.folio_transactions%ROWTYPE;
BEGIN
  IF _idempotency_key IS NULL
     OR char_length(btrim(_idempotency_key)) < 8
     OR char_length(btrim(_idempotency_key)) > 80 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  SELECT * INTO txn FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND idempotency_key = btrim(_idempotency_key);
  IF FOUND THEN
    IF txn.folio_id IS DISTINCT FROM folio.id OR txn.transaction_type IS DISTINCT FROM 'charge' THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    RETURN txn;
  END IF;

  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  resolved := public.resolve_chargeable_guest_service(
    _restaurant_id, _service_type_id, _quantity, folio.currency
  );
  clean_desc := NULLIF(btrim(COALESCE(_description, '')), '');
  IF clean_desc IS NULL THEN
    clean_desc := resolved->>'name';
  END IF;
  IF clean_desc IS NULL OR char_length(clean_desc) > 200 THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  PERFORM set_config('noru.charge_source', 'service', true);
  PERFORM set_config('noru.service_type_id', resolved->>'serviceTypeId', true);
  PERFORM set_config('noru.department_id', resolved->>'departmentId', true);
  PERFORM set_config('noru.quantity', resolved->>'quantity', true);
  PERFORM set_config('noru.unit_amount', resolved->>'unitAmount', true);
  PERFORM set_config('noru.charge_snapshot', resolved::text, true);

  BEGIN
    txn := public.post_folio_charge_with_tax(
      _restaurant_id,
      _folio_id,
      'manual',
      clean_desc,
      (resolved->>'enteredAmount')::numeric,
      'folio',
      NULL,
      NULL,
      _membership_id,
      NULL,
      btrim(_idempotency_key),
      NULL
    );
    PERFORM set_config('noru.charge_source', '', true);
    PERFORM set_config('noru.service_type_id', '', true);
    PERFORM set_config('noru.department_id', '', true);
    PERFORM set_config('noru.quantity', '', true);
    PERFORM set_config('noru.unit_amount', '', true);
    PERFORM set_config('noru.charge_snapshot', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('noru.charge_source', '', true);
    PERFORM set_config('noru.service_type_id', '', true);
    PERFORM set_config('noru.department_id', '', true);
    PERFORM set_config('noru.quantity', '', true);
    PERFORM set_config('noru.unit_amount', '', true);
    PERFORM set_config('noru.charge_snapshot', '', true);
    RAISE;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.folio_history
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND event_type = 'manual_charge_posted'
      AND new_values->>'transaction_id' = txn.id::text
  ) THEN
    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'manual_charge_posted',
      jsonb_build_object(
        'transaction_id', txn.id,
        'charge_source', 'service',
        'service_type_id', resolved->>'serviceTypeId',
        'quantity', (resolved->>'quantity')::integer,
        'unit_amount', (resolved->>'unitAmount')::numeric,
        'entered_amount', (resolved->>'enteredAmount')::numeric
      ),
      clean_desc, _membership_id
    );
  END IF;

  RETURN txn;
END;
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
    r.currency_code, r.legal_entity_name, r.legal_name, r.brand_name,
    r.trading_name, r.vat_number, r.vat_registered
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
      'originalTransactionId', t.original_transaction_id,
      'chargeSource', t.charge_source,
      'quantity', t.quantity,
      'unitAmount', t.unit_amount,
      'chargeSnapshot', t.charge_snapshot
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

REVOKE ALL ON FUNCTION public.resolve_chargeable_guest_service(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_chargeable_guest_services(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_folio_service_charge(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_folio_service_charge(uuid, uuid, uuid, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_chargeable_guest_service(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_chargeable_guest_services(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_folio_service_charge(uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_folio_service_charge(uuid, uuid, uuid, integer, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.list_chargeable_guest_services(uuid, uuid) IS
  'Active guest services with exactly one billing department. Includes chargeable and price gaps so Cashiering can show the link. Performs no ledger write.';
COMMENT ON FUNCTION public.preview_folio_service_charge(uuid, uuid, uuid, integer) IS
  'Read-only service charge preview. Re-derives price and calls preview_folio_charge. Performs no ledger write.';
COMMENT ON FUNCTION public.post_folio_service_charge(uuid, uuid, uuid, integer, text, uuid, text) IS
  'Posts a chargeable guest service through post_folio_charge_with_tax. Price, department, and tax are derived on the server.';
