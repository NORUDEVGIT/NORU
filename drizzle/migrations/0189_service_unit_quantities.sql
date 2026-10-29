-- Service pricing units: every unit except per_service takes a 1-99 quantity.
-- Reservation service requests carry a priced quantity snapshot and post to the
-- folio at check-in through post_folio_service_charge (taxed as source 'service').

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

  IF price.pricing_unit = 'per_service' THEN
    IF _quantity IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;
  ELSIF price.pricing_unit IN ('per_room', 'per_item', 'per_person', 'per_night') THEN
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
          WHEN p.pricing_unit IN ('per_room', 'per_item', 'per_person', 'per_night') THEN 'editable'
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

ALTER TABLE public.guest_service_history
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS pricing_unit text,
  ADD COLUMN IF NOT EXISTS unit_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS folio_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_service_history_quantity_check'
  ) THEN
    ALTER TABLE public.guest_service_history
      ADD CONSTRAINT guest_service_history_quantity_check
      CHECK (quantity IS NULL OR (quantity >= 1 AND quantity <= 99));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_service_history_pricing_unit_check'
  ) THEN
    ALTER TABLE public.guest_service_history
      ADD CONSTRAINT guest_service_history_pricing_unit_check
      CHECK (
        pricing_unit IS NULL
        OR pricing_unit IN ('per_service', 'per_room', 'per_item', 'per_person', 'per_night')
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS guest_service_history_pending_post_idx
  ON public.guest_service_history (restaurant_id, reservation_id)
  WHERE quantity IS NOT NULL AND folio_transaction_id IS NULL;

CREATE OR REPLACE FUNCTION public.post_reservation_service_requests(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  request record;
  txn public.folio_transactions%ROWTYPE;
  posted_count integer := 0;
  skipped_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.guest_service_history h
    WHERE h.restaurant_id = _restaurant_id
      AND h.reservation_id = _reservation_id
      AND h.quantity IS NOT NULL
      AND h.folio_transaction_id IS NULL
      AND h.status <> 'cancelled'
  ) THEN
    RETURN jsonb_build_object('folioId', NULL, 'posted', 0, 'skipped', 0);
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
    AND status = 'open'
  ORDER BY created_at
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  FOR request IN
    SELECT h.id, h.service_type_id, h.quantity, h.notes, t.name
    FROM public.guest_service_history h
    INNER JOIN public.pms_guest_service_types t
      ON t.id = h.service_type_id AND t.restaurant_id = h.restaurant_id
    WHERE h.restaurant_id = _restaurant_id
      AND h.reservation_id = _reservation_id
      AND h.quantity IS NOT NULL
      AND h.folio_transaction_id IS NULL
      AND h.status <> 'cancelled'
    ORDER BY h.requested_at, h.id
    FOR UPDATE OF h
  LOOP
    BEGIN
      txn := public.post_folio_service_charge(
        _restaurant_id,
        folio.id,
        request.service_type_id,
        request.quantity,
        left(COALESCE(NULLIF(btrim(COALESCE(request.notes, '')), ''), request.name), 200),
        _membership_id,
        'svc-req-' || replace(request.id::text, '-', '')
      );
      UPDATE public.guest_service_history
      SET folio_transaction_id = txn.id,
          posted_at = now(),
          updated_at = now()
      WHERE id = request.id;
      posted_count := posted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      skipped_count := skipped_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'folioId', folio.id,
    'posted', posted_count,
    'skipped', skipped_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_chargeable_guest_service(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_chargeable_guest_services(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_reservation_service_requests(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_chargeable_guest_service(uuid, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_chargeable_guest_services(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_reservation_service_requests(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.post_reservation_service_requests(uuid, uuid, uuid) IS
  'Posts priced reservation service requests to the open folio once (idempotency key svc-req-<id>), taxed as source service.';
