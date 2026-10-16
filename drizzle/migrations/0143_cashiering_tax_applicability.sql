-- Card 3 tax and service-charge applicability.
-- Rules stack. A narrower scope does not replace a broader one.
-- The default room tax group still narrows room-charge taxes only.

ALTER TABLE public.pms_taxes
  ADD COLUMN IF NOT EXISTS applicability_scope text;

ALTER TABLE public.pms_service_charges
  ADD COLUMN IF NOT EXISTS applicability_scope text;

UPDATE public.pms_taxes
SET applicability_scope = CASE basis
  WHEN 'room' THEN 'rate_plans'
  WHEN 'fnb' THEN 'services'
  WHEN 'folio' THEN 'folio'
  ELSE 'all'
END
WHERE applicability_scope IS NULL;

UPDATE public.pms_service_charges
SET applicability_scope = CASE basis
  WHEN 'room' THEN 'rate_plans'
  WHEN 'fnb' THEN 'services'
  WHEN 'folio' THEN 'folio'
  ELSE 'all'
END
WHERE applicability_scope IS NULL;

ALTER TABLE public.pms_taxes
  ALTER COLUMN applicability_scope SET DEFAULT 'all';
ALTER TABLE public.pms_service_charges
  ALTER COLUMN applicability_scope SET DEFAULT 'all';

UPDATE public.pms_taxes SET applicability_scope = 'all' WHERE applicability_scope IS NULL;
UPDATE public.pms_service_charges SET applicability_scope = 'all' WHERE applicability_scope IS NULL;

ALTER TABLE public.pms_taxes
  ALTER COLUMN applicability_scope SET NOT NULL;
ALTER TABLE public.pms_service_charges
  ALTER COLUMN applicability_scope SET NOT NULL;

ALTER TABLE public.pms_taxes
  DROP CONSTRAINT IF EXISTS pms_taxes_applicability_scope_check;
ALTER TABLE public.pms_taxes
  ADD CONSTRAINT pms_taxes_applicability_scope_check CHECK (
    applicability_scope IN ('all', 'rate_plans', 'services', 'departments', 'folio')
  );

ALTER TABLE public.pms_service_charges
  DROP CONSTRAINT IF EXISTS pms_service_charges_applicability_scope_check;
ALTER TABLE public.pms_service_charges
  ADD CONSTRAINT pms_service_charges_applicability_scope_check CHECK (
    applicability_scope IN ('all', 'rate_plans', 'services', 'departments', 'folio')
  );

ALTER TABLE public.pms_service_charges
  DROP CONSTRAINT IF EXISTS pms_service_charges_id_restaurant_unique;
ALTER TABLE public.pms_service_charges
  ADD CONSTRAINT pms_service_charges_id_restaurant_unique UNIQUE (id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.pms_tax_department_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  tax_id uuid NOT NULL,
  department_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_tax_department_targets_unique UNIQUE (tax_id, department_id),
  CONSTRAINT pms_tax_department_targets_tax_fk
    FOREIGN KEY (tax_id, restaurant_id) REFERENCES public.pms_taxes (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pms_tax_department_targets_department_fk
    FOREIGN KEY (department_id, restaurant_id) REFERENCES public.pms_departments (id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.pms_service_charge_department_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_charge_id uuid NOT NULL,
  department_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_service_charge_department_targets_unique UNIQUE (service_charge_id, department_id),
  CONSTRAINT pms_service_charge_department_targets_rule_fk
    FOREIGN KEY (service_charge_id, restaurant_id)
    REFERENCES public.pms_service_charges (id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pms_service_charge_department_targets_department_fk
    FOREIGN KEY (department_id, restaurant_id) REFERENCES public.pms_departments (id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_tax_department_targets_restaurant_idx
  ON public.pms_tax_department_targets (restaurant_id, department_id);
CREATE INDEX IF NOT EXISTS pms_service_charge_department_targets_restaurant_idx
  ON public.pms_service_charge_department_targets (restaurant_id, department_id);

ALTER TABLE public.pms_tax_department_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_service_charge_department_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms tax department targets" ON public.pms_tax_department_targets;
CREATE POLICY "Members read pms tax department targets" ON public.pms_tax_department_targets
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms tax department targets" ON public.pms_tax_department_targets;
CREATE POLICY "Managers insert pms tax department targets" ON public.pms_tax_department_targets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms tax department targets" ON public.pms_tax_department_targets;
CREATE POLICY "Managers update pms tax department targets" ON public.pms_tax_department_targets
  FOR UPDATE TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'))
  WITH CHECK (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));
DROP POLICY IF EXISTS "Managers delete pms tax department targets" ON public.pms_tax_department_targets;
CREATE POLICY "Managers delete pms tax department targets" ON public.pms_tax_department_targets
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms service department targets" ON public.pms_service_charge_department_targets;
CREATE POLICY "Members read pms service department targets" ON public.pms_service_charge_department_targets
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms service department targets" ON public.pms_service_charge_department_targets;
CREATE POLICY "Managers insert pms service department targets" ON public.pms_service_charge_department_targets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms service department targets" ON public.pms_service_charge_department_targets;
CREATE POLICY "Managers update pms service department targets" ON public.pms_service_charge_department_targets
  FOR UPDATE TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'))
  WITH CHECK (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));
DROP POLICY IF EXISTS "Managers delete pms service department targets" ON public.pms_service_charge_department_targets;
CREATE POLICY "Managers delete pms service department targets" ON public.pms_service_charge_department_targets
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_tax_department_targets,
  public.pms_service_charge_department_targets
  TO authenticated;
GRANT ALL ON
  public.pms_tax_department_targets,
  public.pms_service_charge_department_targets
  TO service_role;

CREATE OR REPLACE FUNCTION public.folio_tax_scope_matches(
  _scope text,
  _charge_source text,
  _department_id uuid,
  _restaurant_id uuid,
  _tax_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _scope = 'all' THEN true
    WHEN _scope = 'rate_plans' THEN _charge_source = 'room'
    WHEN _scope = 'services' THEN _charge_source = 'service'
    WHEN _scope = 'departments' THEN
      _charge_source = 'service'
      AND _department_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pms_tax_department_targets td
        WHERE td.restaurant_id = _restaurant_id
          AND td.tax_id = _tax_id
          AND td.department_id = _department_id
      )
    WHEN _scope = 'folio' THEN _charge_source IN ('manual', 'service')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.folio_service_scope_matches(
  _scope text,
  _charge_source text,
  _department_id uuid,
  _restaurant_id uuid,
  _service_charge_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _scope = 'all' THEN true
    WHEN _scope = 'rate_plans' THEN _charge_source = 'room'
    WHEN _scope = 'services' THEN _charge_source = 'service'
    WHEN _scope = 'departments' THEN
      _charge_source = 'service'
      AND _department_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pms_service_charge_department_targets td
        WHERE td.restaurant_id = _restaurant_id
          AND td.service_charge_id = _service_charge_id
          AND td.department_id = _department_id
      )
    WHEN _scope = 'folio' THEN _charge_source IN ('manual', 'service')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_folio_tax_rows(
  _restaurant_id uuid,
  _tax_basis text,
  _default_tax_group_id uuid,
  _charge_source text,
  _department_id uuid
) RETURNS TABLE (
  tax_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text,
  calculation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tax_basis NOT IN ('room', 'folio') THEN
    RAISE EXCEPTION 'INVALID_TAX_BASIS';
  END IF;
  IF _charge_source NOT IN ('room', 'manual', 'service') THEN
    RAISE EXCEPTION 'INVALID_CHARGE_SOURCE';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.code,
    t.name,
    t.charge_type,
    t.amount,
    t.applicability_scope,
    t.calculation
  FROM public.pms_taxes t
  WHERE t.restaurant_id = _restaurant_id
    AND t.active = true
    AND public.folio_tax_scope_matches(
      t.applicability_scope, _charge_source, _department_id, t.restaurant_id, t.id
    )
    AND (
      _default_tax_group_id IS NULL
      OR _charge_source IS DISTINCT FROM 'room'
      OR EXISTS (
        SELECT 1
        FROM public.pms_tax_group_taxes gt
        INNER JOIN public.pms_tax_groups g
          ON g.id = gt.tax_group_id AND g.restaurant_id = t.restaurant_id
        WHERE gt.tax_id = t.id
          AND gt.restaurant_id = t.restaurant_id
          AND g.id = _default_tax_group_id
          AND g.active = true
      )
    )
  ORDER BY
    CASE WHEN t.calculation = 'inclusive' THEN 0 ELSE 1 END,
    CASE WHEN t.charge_type = 'fixed' THEN 0 ELSE 1 END,
    t.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_folio_tax_rows(
  _restaurant_id uuid,
  _tax_basis text,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS TABLE (
  tax_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text,
  calculation text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source_text text := NULLIF(current_setting('noru.charge_source', true), '');
  department_text text := NULLIF(current_setting('noru.department_id', true), '');
  source_name text;
  department_id uuid;
BEGIN
  source_name := COALESCE(
    source_text,
    CASE WHEN _tax_basis = 'room' THEN 'room' ELSE 'manual' END
  );
  IF department_text ~ '^[0-9a-fA-F-]{36}$' THEN
    department_id := department_text::uuid;
  END IF;
  RETURN QUERY
  SELECT *
  FROM public.resolve_folio_tax_rows(
    _restaurant_id, _tax_basis, _default_tax_group_id, source_name, department_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_folio_service_charge_rows(
  _restaurant_id uuid,
  _tax_basis text,
  _charge_source text,
  _department_id uuid
) RETURNS TABLE (
  service_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _charge_source NOT IN ('room', 'manual', 'service') THEN
    RAISE EXCEPTION 'INVALID_CHARGE_SOURCE';
  END IF;
  RETURN QUERY
  SELECT
    s.id,
    s.code,
    s.name,
    s.charge_type,
    s.amount,
    s.applicability_scope
  FROM public.pms_service_charges s
  WHERE s.restaurant_id = _restaurant_id
    AND s.active = true
    AND public.folio_service_scope_matches(
      s.applicability_scope, _charge_source, _department_id, s.restaurant_id, s.id
    )
  ORDER BY
    CASE WHEN s.charge_type = 'fixed' THEN 0 ELSE 1 END,
    s.code;
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_folio_service_charge_rows(uuid, text);

CREATE FUNCTION public.resolve_folio_service_charge_rows(
  _restaurant_id uuid,
  _tax_basis text
) RETURNS TABLE (
  service_id uuid,
  code text,
  name text,
  charge_type text,
  amount numeric,
  basis text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  source_text text := NULLIF(current_setting('noru.charge_source', true), '');
  department_text text := NULLIF(current_setting('noru.department_id', true), '');
  source_name text;
  department_id uuid;
BEGIN
  source_name := COALESCE(
    source_text,
    CASE WHEN _tax_basis = 'room' THEN 'room' ELSE 'manual' END
  );
  IF department_text ~ '^[0-9a-fA-F-]{36}$' THEN
    department_id := department_text::uuid;
  END IF;
  RETURN QUERY
  SELECT *
  FROM public.resolve_folio_service_charge_rows(
    _restaurant_id, _tax_basis, source_name, department_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.append_folio_tax_and_service_lines(
  _restaurant_id uuid,
  _folio_id uuid,
  _parent_id uuid,
  _entered_amount numeric,
  _tax_basis text,
  _membership_id uuid,
  _folio_window_id uuid DEFAULT NULL,
  _default_tax_group_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tax_row record;
  svc_row record;
  remaining numeric(12,2);
  parent_base numeric(12,2);
  line_amt numeric(12,2);
  has_inclusive boolean := false;
  snap jsonb;
  source_text text := COALESCE(NULLIF(current_setting('noru.charge_source', true), ''), CASE WHEN _tax_basis = 'room' THEN 'room' ELSE 'manual' END);
  department_text text := NULLIF(current_setting('noru.department_id', true), '');
BEGIN
  IF _entered_amount IS NULL OR _entered_amount <= 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = _folio_id
      AND original_transaction_id = _parent_id
      AND category IN ('tax', 'service_charge')
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  remaining := round(_entered_amount, 2);
  parent_base := remaining;

  IF has_inclusive THEN
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
      WHERE t.calculation = 'inclusive'
    LOOP
      line_amt := public.compute_folio_tax_component_amount(
        remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
      );
      IF line_amt <= 0 THEN
        CONTINUE;
      END IF;
      remaining := round(remaining - line_amt, 2);
      snap := jsonb_build_object(
        'taxId', tax_row.tax_id,
        'code', tax_row.code,
        'name', tax_row.name,
        'chargeType', tax_row.charge_type,
        'amount', tax_row.amount,
        'basis', tax_row.basis,
        'applicabilityScope', tax_row.basis,
        'chargeSource', source_text,
        'departmentId', department_text,
        'calculation', tax_row.calculation,
        'lineAmount', line_amt
      );
      INSERT INTO public.folio_transactions (
        restaurant_id, folio_id, transaction_type, category, description, amount,
        posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
      ) VALUES (
        _restaurant_id, _folio_id, 'charge', 'tax',
        tax_row.name || ' (' || tax_row.code || ')', line_amt,
        _membership_id, _parent_id, _folio_window_id, snap
      );
    END LOOP;
    parent_base := remaining;
  ELSE
    parent_base := round(_entered_amount, 2);
  END IF;

  UPDATE public.folio_transactions
  SET amount = parent_base
  WHERE id = _parent_id
    AND restaurant_id = _restaurant_id
    AND category IN ('room', 'manual')
    AND amount IS DISTINCT FROM parent_base;

  FOR tax_row IN
    SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, _tax_basis, _default_tax_group_id) t
    WHERE t.calculation = 'exclusive'
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, tax_row.charge_type, tax_row.amount, tax_row.calculation
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    snap := jsonb_build_object(
      'taxId', tax_row.tax_id,
      'code', tax_row.code,
      'name', tax_row.name,
      'chargeType', tax_row.charge_type,
      'amount', tax_row.amount,
      'basis', tax_row.basis,
      'applicabilityScope', tax_row.basis,
      'chargeSource', source_text,
      'departmentId', department_text,
      'calculation', tax_row.calculation,
      'lineAmount', line_amt
    );
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
    ) VALUES (
      _restaurant_id, _folio_id, 'charge', 'tax',
      tax_row.name || ' (' || tax_row.code || ')', line_amt,
      _membership_id, _parent_id, _folio_window_id, snap
    );
  END LOOP;

  FOR svc_row IN
    SELECT * FROM public.resolve_folio_service_charge_rows(_restaurant_id, _tax_basis)
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, svc_row.charge_type, svc_row.amount, 'exclusive'
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    snap := jsonb_build_object(
      'serviceChargeId', svc_row.service_id,
      'code', svc_row.code,
      'name', svc_row.name,
      'chargeType', svc_row.charge_type,
      'amount', svc_row.amount,
      'basis', svc_row.basis,
      'applicabilityScope', svc_row.basis,
      'chargeSource', source_text,
      'departmentId', department_text,
      'lineAmount', line_amt
    );
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      posted_by_membership_id, original_transaction_id, folio_window_id, tax_snapshot
    ) VALUES (
      _restaurant_id, _folio_id, 'charge', 'service_charge',
      svc_row.name || ' (' || svc_row.code || ')', line_amt,
      _membership_id, _parent_id, _folio_window_id, snap
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_folio_charge_scoped(
  _restaurant_id uuid,
  _folio_id uuid,
  _amount numeric,
  _charge_source text,
  _department_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  tax_row record;
  svc_row record;
  remaining numeric(12,2);
  parent_base numeric(12,2);
  line_amt numeric(12,2);
  has_inclusive boolean := false;
  tax_lines jsonb := '[]'::jsonb;
  service_lines jsonb := '[]'::jsonb;
  tax_total numeric(12,2) := 0;
  service_total numeric(12,2) := 0;
  entered numeric(12,2);
  tax_basis text := CASE WHEN _charge_source = 'room' THEN 'room' ELSE 'folio' END;
  default_group uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF _charge_source NOT IN ('room', 'manual', 'service') THEN
    RAISE EXCEPTION 'INVALID_CHARGE_SOURCE';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF _charge_source = 'room' THEN
    SELECT default_room_tax_group_id INTO default_group
    FROM public.restaurants WHERE id = _restaurant_id;
  END IF;

  entered := round(_amount, 2);
  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(
      _restaurant_id, tax_basis, default_group, _charge_source, _department_id
    ) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  remaining := entered;
  parent_base := entered;

  IF has_inclusive THEN
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(
        _restaurant_id, tax_basis, default_group, _charge_source, _department_id
      ) t
      WHERE t.calculation = 'inclusive'
    LOOP
      line_amt := public.compute_folio_tax_component_amount(
        remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
      );
      IF line_amt <= 0 THEN
        CONTINUE;
      END IF;
      remaining := round(remaining - line_amt, 2);
      tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
        'name', tax_row.name,
        'code', tax_row.code,
        'chargeType', tax_row.charge_type,
        'rate', tax_row.amount,
        'calculation', tax_row.calculation,
        'applicabilityScope', tax_row.basis,
        'amount', line_amt
      ));
      tax_total := tax_total + line_amt;
    END LOOP;
    parent_base := remaining;
  END IF;

  FOR tax_row IN
    SELECT * FROM public.resolve_folio_tax_rows(
      _restaurant_id, tax_basis, default_group, _charge_source, _department_id
    ) t
    WHERE t.calculation = 'exclusive'
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, tax_row.charge_type, tax_row.amount, tax_row.calculation
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
      'name', tax_row.name,
      'code', tax_row.code,
      'chargeType', tax_row.charge_type,
      'rate', tax_row.amount,
      'calculation', tax_row.calculation,
      'applicabilityScope', tax_row.basis,
      'amount', line_amt
    ));
    tax_total := tax_total + line_amt;
  END LOOP;

  FOR svc_row IN
    SELECT * FROM public.resolve_folio_service_charge_rows(
      _restaurant_id, tax_basis, _charge_source, _department_id
    )
  LOOP
    line_amt := public.compute_folio_tax_component_amount(
      parent_base, svc_row.charge_type, svc_row.amount, 'exclusive'
    );
    IF line_amt <= 0 THEN
      CONTINUE;
    END IF;
    service_lines := service_lines || jsonb_build_array(jsonb_build_object(
      'name', svc_row.name,
      'code', svc_row.code,
      'chargeType', svc_row.charge_type,
      'rate', svc_row.amount,
      'applicabilityScope', svc_row.basis,
      'amount', line_amt
    ));
    service_total := service_total + line_amt;
  END LOOP;

  RETURN jsonb_build_object(
    'currency', folio.currency,
    'enteredAmount', entered,
    'netAmount', parent_base,
    'taxLines', tax_lines,
    'serviceLines', service_lines,
    'total', round(parent_base + tax_total + service_total, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_folio_charge(
  _restaurant_id uuid,
  _folio_id uuid,
  _amount numeric
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.preview_folio_charge_scoped(
    _restaurant_id, _folio_id, _amount, 'manual', NULL
  );
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
  department_id uuid;
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
  IF (resolved->>'departmentId') ~ '^[0-9a-fA-F-]{36}$' THEN
    department_id := (resolved->>'departmentId')::uuid;
  END IF;
  tax := public.preview_folio_charge_scoped(
    _restaurant_id,
    _folio_id,
    (resolved->>'enteredAmount')::numeric,
    'service',
    department_id
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

REVOKE ALL ON FUNCTION public.folio_tax_scope_matches(text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.folio_service_scope_matches(text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_folio_charge_scoped(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_folio_charge(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_folio_service_charge(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.folio_tax_scope_matches(text, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.folio_service_scope_matches(text, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_folio_tax_rows(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_folio_service_charge_rows(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_folio_charge_scoped(uuid, uuid, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_folio_charge(uuid, uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_folio_service_charge(uuid, uuid, uuid, integer) TO service_role;
