-- Read-only preview of a manual folio charge.
-- Mirrors append_folio_tax_and_service_lines for tax basis "folio"
-- (the basis post_folio_transaction uses for category "manual").
-- No ledger writes.

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
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  entered := round(_amount, 2);

  SELECT EXISTS (
    SELECT 1 FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL) t
    WHERE t.calculation = 'inclusive'
  ) INTO has_inclusive;

  remaining := entered;
  parent_base := entered;

  IF has_inclusive THEN
    FOR tax_row IN
      SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL) t
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
        'amount', line_amt
      ));
      tax_total := tax_total + line_amt;
    END LOOP;
    parent_base := remaining;
  END IF;

  FOR tax_row IN
    SELECT * FROM public.resolve_folio_tax_rows(_restaurant_id, 'folio', NULL) t
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
      'amount', line_amt
    ));
    tax_total := tax_total + line_amt;
  END LOOP;

  FOR svc_row IN
    SELECT * FROM public.resolve_folio_service_charge_rows(_restaurant_id, 'folio')
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

REVOKE ALL ON FUNCTION public.preview_folio_charge(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_folio_charge(uuid, uuid, numeric) TO service_role;

COMMENT ON FUNCTION public.preview_folio_charge(uuid, uuid, numeric) IS
  'Read-only manual-charge preview. Uses the same folio-basis tax and service functions as posting. Performs no ledger write.';
