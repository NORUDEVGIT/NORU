-- Package charges use the same tax engine as other folio charges.
-- Scope "packages" matches a package charge. Scope "all" already matches every source.
-- Dual-lane with drizzle/migrations/0188_package_tax_applicability.sql.

ALTER TABLE public.pms_taxes
  DROP CONSTRAINT IF EXISTS pms_taxes_applicability_scope_check;
ALTER TABLE public.pms_taxes
  ADD CONSTRAINT pms_taxes_applicability_scope_check CHECK (
    applicability_scope IN ('all', 'rate_plans', 'services', 'departments', 'folio', 'packages')
  );

ALTER TABLE public.pms_service_charges
  DROP CONSTRAINT IF EXISTS pms_service_charges_applicability_scope_check;
ALTER TABLE public.pms_service_charges
  ADD CONSTRAINT pms_service_charges_applicability_scope_check CHECK (
    applicability_scope IN ('all', 'rate_plans', 'services', 'departments', 'folio', 'packages')
  );

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
    WHEN _scope = 'packages' THEN _charge_source = 'package'
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
    WHEN _scope = 'packages' THEN _charge_source = 'package'
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
  IF _charge_source NOT IN ('room', 'manual', 'service', 'package') THEN
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
  IF _charge_source NOT IN ('room', 'manual', 'service', 'package') THEN
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
  IF _charge_source NOT IN ('room', 'manual', 'service', 'package') THEN
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

CREATE OR REPLACE FUNCTION public.post_reservation_package_charge(
  _restaurant_id uuid,
  _package_row_id uuid,
  _membership_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  reservation public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  existing public.folio_transactions%ROWTYPE;
  posted public.folio_transactions%ROWTYPE;
  actor uuid;
  previous_room text;
  charge_key text;
  entered numeric(12,2);
  parent_amount numeric(12,2);
  remaining numeric(12,2);
  has_inclusive boolean := false;
  tax_row record;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR package_row.applied_amount IS NULL OR package_row.applied_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO existing
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND reference_type = 'reservation_package_charge'
    AND reference_id = package_row.id
    AND transaction_type = 'charge'
  LIMIT 1;
  IF FOUND THEN
    RETURN existing.id;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = package_row.reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = package_row.reservation_id
    AND restaurant_id = _restaurant_id;
  IF reservation.currency IS NOT NULL
     AND folio.currency IS NOT NULL
     AND reservation.currency IS DISTINCT FROM folio.currency THEN
    RAISE EXCEPTION 'PACKAGE_CURRENCY_MISMATCH';
  END IF;

  actor := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('noru.package_actor_membership_id', true), '')), '')::uuid,
    NULLIF(btrim(COALESCE(package_row.snapshot ->> 'appliedByMembershipId', '')), '')::uuid,
    _membership_id
  );
  charge_key := 'pkgchg' || replace(package_row.id::text, '-', '');
  previous_room := current_setting('noru.reservation_room_id', true);
  PERFORM set_config(
    'noru.reservation_room_id',
    COALESCE(package_row.reservation_room_id::text, ''),
    true
  );
  PERFORM set_config('noru.charge_source', 'package', true);

  entered := round(package_row.applied_amount, 2);
  parent_amount := entered;
  SELECT EXISTS (
    SELECT 1
    FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL, 'package', NULL) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;
  IF has_inclusive THEN
    remaining := parent_amount;
    FOR tax_row IN
      SELECT *
      FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL, 'package', NULL) t
      WHERE t.calculation = 'inclusive'
    LOOP
      remaining := round(
        remaining - public.compute_folio_tax_component_amount(
          remaining, tax_row.charge_type, tax_row.amount, tax_row.calculation
        ),
        2
      );
    END LOOP;
    IF remaining > 0 THEN
      parent_amount := remaining;
    END IF;
  END IF;

  BEGIN
    posted := public.post_folio_transaction(
      _restaurant_id,
      folio.id,
      'charge',
      'package',
      COALESCE(NULLIF(btrim(package_row.package_name), ''), 'Package') || ' package',
      parent_amount,
      'reservation_package_charge',
      package_row.id,
      actor,
      NULL,
      charge_key,
      NULL
    );
    PERFORM public.append_folio_tax_and_service_lines(
      _restaurant_id,
      folio.id,
      posted.id,
      entered,
      'folio',
      actor,
      NULL,
      NULL
    );
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
      SELECT * INTO existing
      FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND reference_type = 'reservation_package_charge'
        AND reference_id = package_row.id
        AND transaction_type = 'charge'
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      RETURN existing.id;
    WHEN OTHERS THEN
      PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
      RAISE;
  END;

  RETURN posted.id;
END;
$$;
