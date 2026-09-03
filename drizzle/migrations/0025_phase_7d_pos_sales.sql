-- Phase 7D — POS counter sales (additive only)

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_source_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check
  CHECK (order_source = ANY (ARRAY['customer_qr'::text, 'waiter_assisted'::text, 'pos_counter'::text]));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_attribution_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_source_attribution_check
  CHECK (
    (order_source = 'customer_qr' AND created_by_staff_membership_id IS NULL)
    OR (order_source IN ('waiter_assisted', 'pos_counter') AND created_by_staff_membership_id IS NOT NULL)
  );

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IS NULL OR order_type = ANY (ARRAY['counter'::text, 'takeaway'::text, 'dine_in'::text]));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cashier_shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method = ANY (ARRAY['cash'::text, 'card'::text])),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  tendered_amount numeric(10,2),
  change_amount numeric(10,2) NOT NULL DEFAULT 0,
  reference text,
  membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_payments_restaurant_idx ON public.order_payments(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_payments_order_idx ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS order_payments_shift_idx ON public.order_payments(cashier_shift_id);

GRANT SELECT, INSERT ON public.order_payments TO authenticated;
GRANT ALL ON public.order_payments TO service_role;

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cash-handling staff read order payments" ON public.order_payments;
CREATE POLICY "Cash-handling staff read order payments"
  ON public.order_payments FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

DROP TRIGGER IF EXISTS order_payments_set_updated_at ON public.order_payments;
CREATE TRIGGER order_payments_set_updated_at
  BEFORE UPDATE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Records a POS payment against an order and settles it. All validation is
-- server-side: tenant, order ownership, open shift and amount.
CREATE OR REPLACE FUNCTION public.record_pos_order_payment(
  _restaurant_id uuid,
  _order_id uuid,
  _shift_id uuid,
  _method text,
  _amount numeric,
  _tendered numeric,
  _reference text,
  _membership_id uuid
) RETURNS public.order_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _shift public.cashier_shifts%ROWTYPE;
  _change numeric(10,2) := 0;
  _row public.order_payments%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.paid_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_ALREADY_PAID'; END IF;
  IF _order.billing_method = 'room_charge' THEN RAISE EXCEPTION 'ORDER_ALREADY_PAID'; END IF;
  IF _method NOT IN ('cash','card') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO _shift FROM public.cashier_shifts
    WHERE id = _shift_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  IF _shift.status <> 'open' THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;

  IF _method = 'cash' THEN
    IF _tendered IS NULL OR _tendered < _amount THEN RAISE EXCEPTION 'INSUFFICIENT_TENDER'; END IF;
    _change := round(_tendered - _amount, 2);
  END IF;

  INSERT INTO public.order_payments (
    restaurant_id, order_id, cashier_shift_id, method, amount,
    tendered_amount, change_amount, reference, membership_id
  ) VALUES (
    _restaurant_id, _order_id, _shift_id, _method, round(_amount, 2),
    CASE WHEN _method = 'cash' THEN round(_tendered, 2) ELSE NULL END,
    _change, nullif(btrim(coalesce(_reference, '')), ''), _membership_id
  ) RETURNING * INTO _row;

  UPDATE public.orders
    SET paid_at = now(),
        billing_method = 'direct',
        cashier_shift_id = _shift_id,
        updated_at = now()
    WHERE id = _order_id;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid) TO service_role;
