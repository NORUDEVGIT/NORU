-- Issue #18 — Restaurant Management permissioned refunds on restaurant sales.
--
-- Additive only. Lives on the orders / order_payments domain.
-- Does NOT create, alter, or write Standalone POS pos_* tables.
-- Does NOT change package entitlements or tenant approval.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0036_rm_order_refunds.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.refund_restaurant_order(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb);
--   DROP POLICY IF EXISTS "Cash-handling staff read order refund lines" ON public.order_refund_lines;
--   DROP POLICY IF EXISTS "Cash-handling staff read order refunds" ON public.order_refunds;
--   DROP POLICY IF EXISTS "Staff read their own action grants" ON public.staff_action_grants;
--   DROP POLICY IF EXISTS "Owners and managers read action grants" ON public.staff_action_grants;
--   REVOKE ALL ON TABLE public.order_refund_lines FROM authenticated, service_role;
--   REVOKE ALL ON TABLE public.order_refunds FROM authenticated, service_role;
--   REVOKE ALL ON TABLE public.staff_action_grants FROM authenticated, service_role;
--   DROP TABLE IF EXISTS public.order_refund_lines;
--   DROP TABLE IF EXISTS public.order_refunds;
--   DROP TABLE IF EXISTS public.staff_action_grants;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS refunded_amount;
--   ALTER TABLE public.cashier_shifts DROP COLUMN IF EXISTS expected_cash;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_refunded_amount_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_refunded_amount_check CHECK (refunded_amount >= 0);

ALTER TABLE public.cashier_shifts
  ADD COLUMN IF NOT EXISTS expected_cash numeric(12,2);

-- Explicit action grants. Cashiers may refund only when rm_refund is enabled.
CREATE TABLE IF NOT EXISTS public.staff_action_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_action_grants_unique UNIQUE (restaurant_id, membership_id, action_key),
  CONSTRAINT staff_action_grants_action_key_check CHECK (action_key = ANY (ARRAY['rm_refund'::text]))
);

CREATE INDEX IF NOT EXISTS staff_action_grants_membership_idx
  ON public.staff_action_grants (restaurant_id, membership_id);

GRANT SELECT ON public.staff_action_grants TO authenticated;
GRANT ALL ON public.staff_action_grants TO service_role;

ALTER TABLE public.staff_action_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and managers read action grants" ON public.staff_action_grants;
CREATE POLICY "Owners and managers read action grants"
  ON public.staff_action_grants FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Staff read their own action grants" ON public.staff_action_grants;
CREATE POLICY "Staff read their own action grants"
  ON public.staff_action_grants FOR SELECT TO authenticated
  USING (
    membership_id IN (
      SELECT ru.id FROM public.restaurant_users ru
      WHERE ru.user_id = auth.uid()
        AND ru.restaurant_id = staff_action_grants.restaurant_id
        AND ru.active
    )
  );

DROP TRIGGER IF EXISTS staff_action_grants_set_updated_at ON public.staff_action_grants;
CREATE TRIGGER staff_action_grants_set_updated_at
  BEFORE UPDATE ON public.staff_action_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.order_payments(id) ON DELETE RESTRICT,
  cashier_shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  method text NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  no_open_shift boolean NOT NULL DEFAULT false,
  authorized_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  processed_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_refunds_amount_check CHECK (amount > 0),
  CONSTRAINT order_refunds_method_check CHECK (method = ANY (ARRAY['cash'::text, 'card'::text])),
  CONSTRAINT order_refunds_reason_check CHECK (char_length(btrim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS order_refunds_restaurant_idx ON public.order_refunds (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_refunds_order_idx ON public.order_refunds (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_refunds_payment_idx ON public.order_refunds (payment_id);
CREATE INDEX IF NOT EXISTS order_refunds_shift_idx ON public.order_refunds (cashier_shift_id);

GRANT SELECT ON public.order_refunds TO authenticated;
GRANT ALL ON public.order_refunds TO service_role;

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash-handling staff read order refunds" ON public.order_refunds;
CREATE POLICY "Cash-handling staff read order refunds"
  ON public.order_refunds FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

CREATE TABLE IF NOT EXISTS public.order_refund_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL REFERENCES public.order_refunds(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity numeric(10,2) NOT NULL,
  amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_refund_lines_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_refund_lines_amount_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS order_refund_lines_refund_idx ON public.order_refund_lines (refund_id);
CREATE INDEX IF NOT EXISTS order_refund_lines_item_idx ON public.order_refund_lines (order_item_id);

GRANT SELECT ON public.order_refund_lines TO authenticated;
GRANT ALL ON public.order_refund_lines TO service_role;

ALTER TABLE public.order_refund_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash-handling staff read order refund lines" ON public.order_refund_lines;
CREATE POLICY "Cash-handling staff read order refund lines"
  ON public.order_refund_lines FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

-- Records a cash/card refund against a paid restaurant sale. Room charges are
-- reversed only by public.reverse_order_room_charge — this function rejects them.
CREATE OR REPLACE FUNCTION public.refund_restaurant_order(
  _restaurant_id uuid,
  _order_id uuid,
  _payment_id uuid,
  _amount numeric,
  _reason text,
  _shift_id uuid,
  _membership_id uuid,
  _lines jsonb
) RETURNS public.order_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _payment public.order_payments%ROWTYPE;
  _shift public.cashier_shifts%ROWTYPE;
  _row public.order_refunds%ROWTYPE;
  _clean_reason text := nullif(btrim(coalesce(_reason, '')), '');
  _sale_refunded numeric(10,2);
  _payment_refunded numeric(10,2);
  _sale_remaining numeric(10,2);
  _payment_remaining numeric(10,2);
  _line jsonb;
  _item public.order_items%ROWTYPE;
  _line_qty numeric(10,2);
  _line_amount numeric(10,2);
  _item_refunded_qty numeric(10,2);
  _item_refunded_amt numeric(10,2);
  _line_sum numeric(10,2) := 0;
  _use_shift uuid := NULL;
  _no_open_shift boolean := false;
  _cash_in numeric(12,2);
  _cash_out numeric(12,2);
BEGIN
  IF _clean_reason IS NULL OR char_length(_clean_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 1 THEN
    RAISE EXCEPTION 'REFUND_LINES_REQUIRED';
  END IF;

  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.billing_method = 'room_charge' OR _order.room_charge_folio_id IS NOT NULL THEN
    RAISE EXCEPTION 'ROOM_CHARGE_USE_REVERSE';
  END IF;
  IF _order.paid_at IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_PAID'; END IF;

  SELECT * INTO _payment FROM public.order_payments
    WHERE id = _payment_id AND order_id = _order_id AND restaurant_id = _restaurant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF _payment.method NOT IN ('cash', 'card') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;

  SELECT coalesce(sum(amount), 0) INTO _sale_refunded
    FROM public.order_refunds
    WHERE order_id = _order_id AND restaurant_id = _restaurant_id;
  SELECT coalesce(sum(amount), 0) INTO _payment_refunded
    FROM public.order_refunds
    WHERE payment_id = _payment_id AND restaurant_id = _restaurant_id;

  _sale_remaining := round(_order.total - _sale_refunded, 2);
  _payment_remaining := round(_payment.amount - _payment_refunded, 2);

  IF _sale_remaining <= 0 THEN RAISE EXCEPTION 'DOUBLE_REFUND'; END IF;
  IF round(_amount, 2) > _sale_remaining + 0.001 THEN RAISE EXCEPTION 'OVER_REFUND'; END IF;
  IF round(_amount, 2) > _payment_remaining + 0.001 THEN RAISE EXCEPTION 'TENDER_OVER'; END IF;

  IF _payment.method = 'cash' THEN
    IF _shift_id IS NOT NULL THEN
      SELECT * INTO _shift FROM public.cashier_shifts
        WHERE id = _shift_id AND restaurant_id = _restaurant_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
      IF _shift.status <> 'open' THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;
      _use_shift := _shift.id;
      _no_open_shift := false;
    ELSE
      _no_open_shift := true;
    END IF;
  ELSE
    _use_shift := NULL;
    _no_open_shift := false;
  END IF;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    _line_qty := round(coalesce((_line->>'quantity')::numeric, 0), 2);
    _line_amount := round(coalesce((_line->>'amount')::numeric, 0), 2);
    IF _line_qty <= 0 OR _line_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

    SELECT * INTO _item FROM public.order_items
      WHERE id = (_line->>'orderItemId')::uuid AND order_id = _order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_LINE_NOT_FOUND'; END IF;

    SELECT coalesce(sum(quantity), 0), coalesce(sum(amount), 0)
      INTO _item_refunded_qty, _item_refunded_amt
      FROM public.order_refund_lines
      WHERE order_item_id = _item.id AND restaurant_id = _restaurant_id;

    IF _line_qty > (_item.quantity - _item_refunded_qty) + 0.001 THEN
      RAISE EXCEPTION 'LINE_OVER';
    END IF;
    IF _line_amount > (coalesce(_item.line_total, _item.price * _item.quantity) - _item_refunded_amt) + 0.001 THEN
      RAISE EXCEPTION 'LINE_OVER';
    END IF;
    _line_sum := round(_line_sum + _line_amount, 2);
  END LOOP;

  IF abs(_line_sum - round(_amount, 2)) > 0.001 THEN RAISE EXCEPTION 'AMOUNT_MISMATCH'; END IF;

  INSERT INTO public.order_refunds (
    restaurant_id, order_id, payment_id, cashier_shift_id, method, amount,
    reason, no_open_shift, authorized_by_membership_id, processed_by_membership_id
  ) VALUES (
    _restaurant_id, _order_id, _payment_id, _use_shift, _payment.method, round(_amount, 2),
    _clean_reason, _no_open_shift, _membership_id, _membership_id
  ) RETURNING * INTO _row;

  FOR _line IN SELECT value FROM jsonb_array_elements(_lines)
  LOOP
    INSERT INTO public.order_refund_lines (
      restaurant_id, refund_id, order_id, order_item_id, quantity, amount
    ) VALUES (
      _restaurant_id,
      _row.id,
      _order_id,
      (_line->>'orderItemId')::uuid,
      round((_line->>'quantity')::numeric, 2),
      round((_line->>'amount')::numeric, 2)
    );
  END LOOP;

  UPDATE public.orders
    SET refunded_amount = round(_sale_refunded + _amount, 2),
        updated_at = now()
    WHERE id = _order_id AND restaurant_id = _restaurant_id;

  IF _payment.method = 'cash' AND _use_shift IS NOT NULL THEN
    SELECT coalesce(sum(amount), 0) INTO _cash_in
      FROM public.order_payments
      WHERE cashier_shift_id = _use_shift AND restaurant_id = _restaurant_id AND method = 'cash';
    SELECT coalesce(sum(amount), 0) INTO _cash_out
      FROM public.order_refunds
      WHERE cashier_shift_id = _use_shift AND restaurant_id = _restaurant_id AND method = 'cash';
    UPDATE public.cashier_shifts
      SET expected_cash = round(coalesce(opening_cash, 0) + _cash_in - _cash_out, 2)
      WHERE id = _use_shift AND restaurant_id = _restaurant_id;
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_restaurant_order(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_restaurant_order(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb)
  TO service_role;
