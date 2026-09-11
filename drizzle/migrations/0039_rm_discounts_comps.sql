-- Issue #24 — Restaurant Management permissioned discounts & comps on unpaid checks.
--
-- Additive only. Lives on the orders / order_items / order_adjustments domain.
-- Does NOT create, alter, or write Standalone POS pos_* tables.
-- Does NOT change package entitlements or tenant approval.
-- Does NOT add tips, promo codes, post-pay discount, or un-comp undo.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0039_rm_discounts_comps.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.complete_comped_order(uuid, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.apply_rm_order_comp(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, numeric, numeric, numeric);
--   DROP FUNCTION IF EXISTS public.clear_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric);
--   DROP FUNCTION IF EXISTS public.apply_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, text, numeric, numeric, numeric, numeric);
--   DROP POLICY IF EXISTS "Cash-handling staff read order adjustments" ON public.order_adjustments;
--   REVOKE ALL ON TABLE public.order_adjustments FROM authenticated, service_role;
--   DROP TABLE IF EXISTS public.order_adjustments;
--   ALTER TABLE public.order_items
--     DROP COLUMN IF EXISTS comped,
--     DROP COLUMN IF EXISTS comp_amount,
--     DROP COLUMN IF EXISTS comp_reason,
--     DROP COLUMN IF EXISTS comped_by_membership_id,
--     DROP COLUMN IF EXISTS comped_at;
--   ALTER TABLE public.orders
--     DROP COLUMN IF EXISTS discount_type,
--     DROP COLUMN IF EXISTS discount_value,
--     DROP COLUMN IF EXISTS discount_amount,
--     DROP COLUMN IF EXISTS discount_reason,
--     DROP COLUMN IF EXISTS discount_applied_by_membership_id,
--     DROP COLUMN IF EXISTS discount_applied_at,
--     DROP COLUMN IF EXISTS comp_amount,
--     DROP COLUMN IF EXISTS check_comped;
--   ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_billing_method_check;
--   ALTER TABLE public.orders ADD CONSTRAINT orders_billing_method_check
--     CHECK (billing_method IS NULL OR billing_method IN ('direct','room_charge'));
--   ALTER TABLE public.staff_action_grants DROP CONSTRAINT IF EXISTS staff_action_grants_action_key_check;
--   ALTER TABLE public.staff_action_grants ADD CONSTRAINT staff_action_grants_action_key_check
--     CHECK (action_key = ANY (ARRAY['rm_refund'::text]));

ALTER TABLE public.staff_action_grants
  DROP CONSTRAINT IF EXISTS staff_action_grants_action_key_check;
ALTER TABLE public.staff_action_grants
  ADD CONSTRAINT staff_action_grants_action_key_check
  CHECK (action_key = ANY (ARRAY['rm_refund'::text, 'rm_discount'::text, 'rm_comp'::text]));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_billing_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_billing_method_check
  CHECK (billing_method IS NULL OR billing_method IN ('direct', 'room_charge', 'comp'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS discount_applied_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS comp_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS check_comped boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_discount_type_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('percent', 'amount'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_discount_amount_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_amount_check CHECK (discount_amount >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_comp_amount_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_comp_amount_check CHECK (comp_amount >= 0);

COMMENT ON COLUMN public.orders.discount_amount IS
  'Order-level discount applied to merchandise before tax/service. One active; replace, not stack.';
COMMENT ON COLUMN public.orders.comp_amount IS
  'Sum of line and/or check comps. Reduces merchandise before tax/service.';
COMMENT ON COLUMN public.orders.total IS
  'Payable after merchandise → discount/comp → tax → service.';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS comped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comp_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comp_reason text,
  ADD COLUMN IF NOT EXISTS comped_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comped_at timestamptz;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_comp_amount_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_comp_amount_check CHECK (comp_amount >= 0);

CREATE TABLE IF NOT EXISTS public.order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  payable_was numeric(10,2),
  payable_now numeric(10,2),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_adjustments_kind_check CHECK (
    kind = ANY (ARRAY[
      'discount'::text,
      'discount_clear'::text,
      'comp_line'::text,
      'comp_check'::text,
      'complete_comped'::text
    ])
  ),
  CONSTRAINT order_adjustments_reason_check CHECK (char_length(btrim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS order_adjustments_restaurant_idx
  ON public.order_adjustments (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_adjustments_order_idx
  ON public.order_adjustments (order_id, created_at DESC);

GRANT SELECT ON public.order_adjustments TO authenticated;
GRANT ALL ON public.order_adjustments TO service_role;

ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash-handling staff read order adjustments" ON public.order_adjustments;
CREATE POLICY "Cash-handling staff read order adjustments"
  ON public.order_adjustments FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

-- Replaces the single order-level discount and writes the server-computed snapshot.
-- Unpaid-only. No pos_* writes. No cash tender.
CREATE OR REPLACE FUNCTION public.apply_rm_order_discount(
  _restaurant_id uuid,
  _order_id uuid,
  _membership_id uuid,
  _discount_type text,
  _discount_value numeric,
  _discount_amount numeric,
  _reason text,
  _tax_amount numeric,
  _service_amount numeric,
  _total numeric,
  _comp_amount numeric
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _clean_reason text := nullif(btrim(coalesce(_reason, '')), '');
  _was numeric(10,2);
BEGIN
  IF _clean_reason IS NULL OR char_length(_clean_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF _discount_type NOT IN ('percent', 'amount') THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF _discount_amount IS NULL OR _discount_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF _order.paid_at IS NOT NULL
     OR _order.billing_method IS NOT NULL
     OR _order.room_charge_folio_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_PAID';
  END IF;

  _was := _order.total;

  UPDATE public.orders SET
    discount_type = _discount_type,
    discount_value = round(_discount_value, 2),
    discount_amount = round(_discount_amount, 2),
    discount_reason = _clean_reason,
    discount_applied_by_membership_id = _membership_id,
    discount_applied_at = now(),
    comp_amount = round(coalesce(_comp_amount, _order.comp_amount), 2),
    tax_amount = round(_tax_amount, 2),
    service_amount = round(_service_amount, 2),
    total = round(_total, 2),
    updated_at = now()
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  RETURNING * INTO _order;

  INSERT INTO public.order_adjustments (
    restaurant_id, order_id, kind, amount, reason, payable_was, payable_now, payload, actor_membership_id
  ) VALUES (
    _restaurant_id, _order_id, 'discount', round(_discount_amount, 2), _clean_reason, _was, round(_total, 2),
    jsonb_build_object('type', _discount_type, 'value', round(_discount_value, 2)),
    _membership_id
  );

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, text, numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, text, numeric, numeric, numeric, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.clear_rm_order_discount(
  _restaurant_id uuid,
  _order_id uuid,
  _membership_id uuid,
  _reason text,
  _tax_amount numeric,
  _service_amount numeric,
  _total numeric,
  _comp_amount numeric
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _clean_reason text := nullif(btrim(coalesce(_reason, '')), '');
  _was numeric(10,2);
  _cleared numeric(10,2);
BEGIN
  IF _clean_reason IS NULL OR char_length(_clean_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF _order.paid_at IS NOT NULL
     OR _order.billing_method IS NOT NULL
     OR _order.room_charge_folio_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_PAID';
  END IF;

  _was := _order.total;
  _cleared := coalesce(_order.discount_amount, 0);

  UPDATE public.orders SET
    discount_type = NULL,
    discount_value = NULL,
    discount_amount = 0,
    discount_reason = NULL,
    discount_applied_by_membership_id = NULL,
    discount_applied_at = NULL,
    comp_amount = round(coalesce(_comp_amount, _order.comp_amount), 2),
    tax_amount = round(_tax_amount, 2),
    service_amount = round(_service_amount, 2),
    total = round(_total, 2),
    updated_at = now()
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  RETURNING * INTO _order;

  INSERT INTO public.order_adjustments (
    restaurant_id, order_id, kind, amount, reason, payable_was, payable_now, payload, actor_membership_id
  ) VALUES (
    _restaurant_id, _order_id, 'discount_clear', _cleared, _clean_reason, _was, round(_total, 2),
    '{}'::jsonb, _membership_id
  );

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric)
  TO service_role;

-- Line or entire-check comps. Does not undo earlier comps. Recalc snapshot is server-owned.
CREATE OR REPLACE FUNCTION public.apply_rm_order_comp(
  _restaurant_id uuid,
  _order_id uuid,
  _membership_id uuid,
  _scope text,
  _lines jsonb,
  _comp_amount numeric,
  _discount_amount numeric,
  _discount_type text,
  _discount_value numeric,
  _reason text,
  _tax_amount numeric,
  _service_amount numeric,
  _total numeric
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _clean_reason text := nullif(btrim(coalesce(_reason, '')), '');
  _was numeric(10,2);
  _line jsonb;
  _item public.order_items%ROWTYPE;
  _kind text;
BEGIN
  IF _clean_reason IS NULL OR char_length(_clean_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF _scope NOT IN ('lines', 'check') THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF _comp_amount IS NULL OR _comp_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF _order.paid_at IS NOT NULL
     OR _order.billing_method IS NOT NULL
     OR _order.room_charge_folio_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_PAID';
  END IF;

  _was := _order.total;

  IF _scope = 'check' THEN
    UPDATE public.order_items SET
      comped = true,
      comp_amount = coalesce(line_total, price * quantity),
      comp_reason = _clean_reason,
      comped_by_membership_id = _membership_id,
      comped_at = now()
    WHERE order_id = _order_id;
    _kind := 'comp_check';
  ELSE
    IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 1 THEN
      RAISE EXCEPTION 'COMP_LINES_REQUIRED';
    END IF;
    FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
    LOOP
      SELECT * INTO _item FROM public.order_items
        WHERE id = (_line->>'orderItemId')::uuid AND order_id = _order_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'COMP_LINE_NOT_FOUND'; END IF;
      UPDATE public.order_items SET
        comped = true,
        comp_amount = round(coalesce((_line->>'amount')::numeric, coalesce(line_total, price * quantity)), 2),
        comp_reason = _clean_reason,
        comped_by_membership_id = _membership_id,
        comped_at = now()
      WHERE id = _item.id;
    END LOOP;
    _kind := 'comp_line';
  END IF;

  UPDATE public.orders SET
    comp_amount = round(_comp_amount, 2),
    check_comped = (_scope = 'check' OR _order.check_comped),
    discount_type = _discount_type,
    discount_value = CASE WHEN _discount_type IS NULL THEN NULL ELSE round(_discount_value, 2) END,
    discount_amount = round(coalesce(_discount_amount, 0), 2),
    tax_amount = round(_tax_amount, 2),
    service_amount = round(_service_amount, 2),
    total = round(_total, 2),
    updated_at = now()
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  RETURNING * INTO _order;

  INSERT INTO public.order_adjustments (
    restaurant_id, order_id, kind, amount, reason, payable_was, payable_now, payload, actor_membership_id
  ) VALUES (
    _restaurant_id, _order_id, _kind, round(_comp_amount, 2), _clean_reason, _was, round(_total, 2),
    jsonb_build_object('scope', _scope), _membership_id
  );

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_rm_order_comp(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, text, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_rm_order_comp(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, text, numeric, numeric, numeric)
  TO service_role;

-- Marks a zero-payable unpaid check settled without a cash/card tender or PosPaymentDialog.
CREATE OR REPLACE FUNCTION public.complete_comped_order(
  _restaurant_id uuid,
  _order_id uuid,
  _membership_id uuid
) RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _was numeric(10,2);
BEGIN
  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF _order.paid_at IS NOT NULL
     OR _order.billing_method IS NOT NULL
     OR _order.room_charge_folio_id IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_PAID';
  END IF;
  IF round(coalesce(_order.total, 0), 2) > 0.001 THEN
    RAISE EXCEPTION 'PAYABLE_NOT_ZERO';
  END IF;

  _was := _order.total;

  UPDATE public.orders SET
    paid_at = now(),
    billing_method = 'comp',
    total = 0,
    updated_at = now()
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  RETURNING * INTO _order;

  INSERT INTO public.order_adjustments (
    restaurant_id, order_id, kind, amount, reason, payable_was, payable_now, payload, actor_membership_id
  ) VALUES (
    _restaurant_id, _order_id, 'complete_comped', 0, 'Completed (comped)', _was, 0,
    '{}'::jsonb, _membership_id
  );

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_comped_order(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_comped_order(uuid, uuid, uuid)
  TO service_role;
