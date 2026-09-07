-- Phase 8H2 — Standalone POS backend foundation.
-- Independent of Restaurant Management: no shared catalog, sales, payments or shifts.

-- 1. New module key for staff access (existing 'pos' keeps its RM meaning).
ALTER TABLE public.staff_module_access DROP CONSTRAINT IF EXISTS staff_module_access_module_key_check;
ALTER TABLE public.staff_module_access ADD CONSTRAINT staff_module_access_module_key_check CHECK (
  module_key = ANY (ARRAY[
    'food_and_beverage'::text,
    'front_office'::text,
    'housekeeping'::text,
    'pos'::text,
    'standalone_pos'::text,
    'inventory'::text,
    'procurement'::text,
    'human_resources'::text,
    'accounting_finance'::text,
    'reports_analytics'::text,
    'configuration'::text,
    'property_settings'::text
  ])
);

-- 2. POS-owned settings (tax defaults). Never reads restaurant menu logic.
CREATE TABLE public.pos_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_inclusive boolean NOT NULL DEFAULT false,
  receipt_header text,
  receipt_footer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_settings_tax_rate_check CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100)
);
GRANT SELECT ON public.pos_settings TO authenticated;
GRANT ALL ON public.pos_settings TO service_role;
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read pos settings" ON public.pos_settings
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_settings_set_updated_at BEFORE UPDATE ON public.pos_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Registers.
CREATE TABLE public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_label text,
  active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_registers_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_registers_name_unique UNIQUE (restaurant_id, name)
);
CREATE INDEX pos_registers_active_idx ON public.pos_registers (restaurant_id, active);
GRANT SELECT ON public.pos_registers TO authenticated;
GRANT ALL ON public.pos_registers TO service_role;
ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read registers" ON public.pos_registers
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_registers_set_updated_at BEFORE UPDATE ON public.pos_registers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Catalog: categories.
CREATE TABLE public.pos_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_categories_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_categories_name_unique UNIQUE (restaurant_id, name)
);
CREATE INDEX pos_categories_active_idx ON public.pos_categories (restaurant_id, active);
GRANT SELECT ON public.pos_categories TO authenticated;
GRANT ALL ON public.pos_categories TO service_role;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read categories" ON public.pos_categories
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_categories_set_updated_at BEFORE UPDATE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Catalog: products. Price lives on the product; no price table, no variants.
CREATE TABLE public.pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL,
  sku text,
  barcode text,
  description text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2),
  cost_price numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_products_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_products_price_check CHECK (unit_price >= 0),
  CONSTRAINT pos_products_tax_rate_check CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  CONSTRAINT pos_products_category_same_property FOREIGN KEY (category_id, restaurant_id)
    REFERENCES public.pos_categories(id, restaurant_id) ON DELETE SET NULL
);
CREATE INDEX pos_products_active_idx ON public.pos_products (restaurant_id, active);
CREATE INDEX pos_products_category_idx ON public.pos_products (restaurant_id, category_id);
CREATE UNIQUE INDEX pos_products_sku_unique ON public.pos_products (restaurant_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX pos_products_barcode_unique ON public.pos_products (restaurant_id, barcode) WHERE barcode IS NOT NULL;
GRANT SELECT ON public.pos_products TO authenticated;
GRANT ALL ON public.pos_products TO service_role;
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read products" ON public.pos_products
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_products_set_updated_at BEFORE UPDATE ON public.pos_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Cashier shifts (independent of RM cashier_shifts).
CREATE TABLE public.pos_cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opening_float numeric(12,2) NOT NULL DEFAULT 0,
  opened_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by_membership_id uuid REFERENCES public.restaurant_users(id),
  closed_at timestamptz,
  closing_cash numeric(12,2),
  expected_cash numeric(12,2),
  variance numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shifts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_shifts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT pos_shifts_register_same_property FOREIGN KEY (register_id, restaurant_id)
    REFERENCES public.pos_registers(id, restaurant_id)
);
CREATE UNIQUE INDEX pos_shifts_one_open_per_register
  ON public.pos_cashier_shifts (restaurant_id, register_id) WHERE status = 'open';
CREATE INDEX pos_shifts_business_date_idx ON public.pos_cashier_shifts (restaurant_id, business_date);
GRANT SELECT ON public.pos_cashier_shifts TO authenticated;
GRANT ALL ON public.pos_cashier_shifts TO service_role;
ALTER TABLE public.pos_cashier_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read shifts" ON public.pos_cashier_shifts
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_shifts_set_updated_at BEFORE UPDATE ON public.pos_cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Receipt numbering counter, isolated from reservation numbering.
CREATE TABLE public.pos_sale_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_sale_counters TO authenticated;
GRANT ALL ON public.pos_sale_counters TO service_role;
ALTER TABLE public.pos_sale_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS managers read sale counters" ON public.pos_sale_counters
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager']));

-- 8. Sales.
CREATE TABLE public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL,
  shift_id uuid,
  sale_number bigint,
  sale_reference text,
  status text NOT NULL DEFAULT 'open',
  business_date date NOT NULL,
  currency_code text NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_reason text,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  customer_reference text,
  note text,
  opened_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  completed_by_membership_id uuid REFERENCES public.restaurant_users(id),
  cashier_name_snapshot text,
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sales_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_sales_status_check CHECK (status IN ('open','completed','voided','partially_refunded','refunded')),
  CONSTRAINT pos_sales_number_unique UNIQUE (restaurant_id, sale_number),
  CONSTRAINT pos_sales_register_same_property FOREIGN KEY (register_id, restaurant_id)
    REFERENCES public.pos_registers(id, restaurant_id),
  CONSTRAINT pos_sales_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);
CREATE INDEX pos_sales_status_idx ON public.pos_sales (restaurant_id, status);
CREATE INDEX pos_sales_business_date_idx ON public.pos_sales (restaurant_id, business_date);
CREATE INDEX pos_sales_register_idx ON public.pos_sales (restaurant_id, register_id);
CREATE INDEX pos_sales_shift_idx ON public.pos_sales (shift_id);
GRANT SELECT ON public.pos_sales TO authenticated;
GRANT ALL ON public.pos_sales TO service_role;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read sales" ON public.pos_sales
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));
CREATE TRIGGER pos_sales_set_updated_at BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. Sale items — immutable snapshots.
CREATE TABLE public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name_snapshot text NOT NULL,
  sku_snapshot text,
  quantity numeric(10,3) NOT NULL,
  unit_price_snapshot numeric(12,2) NOT NULL,
  tax_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT pos_sale_items_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pos_sale_items_product_same_property FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.pos_products(id, restaurant_id) ON DELETE SET NULL
);
CREATE INDEX pos_sale_items_sale_idx ON public.pos_sale_items (sale_id);
CREATE INDEX pos_sale_items_product_idx ON public.pos_sale_items (restaurant_id, product_id);
GRANT SELECT ON public.pos_sale_items TO authenticated;
GRANT ALL ON public.pos_sale_items TO service_role;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read sale items" ON public.pos_sale_items
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

-- 10. Payments — append-only, split tender supported.
CREATE TABLE public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  shift_id uuid,
  payment_method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  tendered_amount numeric(12,2),
  change_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'captured',
  reference text,
  received_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_payments_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_payments_amount_check CHECK (amount > 0),
  CONSTRAINT pos_payments_method_check CHECK (payment_method IN ('cash','card','voucher','other')),
  CONSTRAINT pos_payments_status_check CHECK (status IN ('captured','voided')),
  CONSTRAINT pos_payments_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id),
  CONSTRAINT pos_payments_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);
CREATE INDEX pos_payments_sale_idx ON public.pos_payments (sale_id);
CREATE INDEX pos_payments_shift_idx ON public.pos_payments (shift_id);
GRANT SELECT ON public.pos_payments TO authenticated;
GRANT ALL ON public.pos_payments TO service_role;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read payments" ON public.pos_payments
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

-- 11. Refunds — append-only against completed sales.
CREATE TABLE public.pos_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  payment_id uuid,
  shift_id uuid,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL,
  reason text,
  line_detail jsonb,
  authorized_by_membership_id uuid REFERENCES public.restaurant_users(id),
  processed_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_refunds_amount_check CHECK (amount > 0),
  CONSTRAINT pos_refunds_method_check CHECK (method IN ('cash','card','voucher','other')),
  CONSTRAINT pos_refunds_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id),
  CONSTRAINT pos_refunds_payment_same_property FOREIGN KEY (payment_id, restaurant_id)
    REFERENCES public.pos_payments(id, restaurant_id),
  CONSTRAINT pos_refunds_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);
CREATE INDEX pos_refunds_sale_idx ON public.pos_refunds (sale_id);
GRANT SELECT ON public.pos_refunds TO authenticated;
GRANT ALL ON public.pos_refunds TO service_role;
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS staff read refunds" ON public.pos_refunds
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

-- 12. Immutability guard: a completed sale may only change refund state.
CREATE OR REPLACE FUNCTION public.pos_protect_completed_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('completed','partially_refunded','refunded') THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('completed','partially_refunded','refunded') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.register_id IS DISTINCT FROM OLD.register_id
      OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
      OR NEW.sale_number IS DISTINCT FROM OLD.sale_number
      OR NEW.business_date IS DISTINCT FROM OLD.business_date
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.completed_by_membership_id IS DISTINCT FROM OLD.completed_by_membership_id
    THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
    IF NEW.status NOT IN ('completed','partially_refunded','refunded') THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pos_sales_protect_completed
BEFORE UPDATE OR DELETE ON public.pos_sales
FOR EACH ROW EXECUTE FUNCTION public.pos_protect_completed_sale();

CREATE OR REPLACE FUNCTION public.pos_protect_completed_sale_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _status text;
  _sale uuid;
BEGIN
  _sale := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT status INTO _status FROM public.pos_sales WHERE id = _sale;
  IF _status IS NOT NULL AND _status IN ('completed','partially_refunded','refunded') THEN
    RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER pos_sale_items_protect_completed
BEFORE INSERT OR UPDATE OR DELETE ON public.pos_sale_items
FOR EACH ROW EXECUTE FUNCTION public.pos_protect_completed_sale_items();

-- 13. Atomic sale completion with concurrency-safe tenant-local numbering.
CREATE OR REPLACE FUNCTION public.pos_complete_sale(
  _restaurant_id uuid,
  _sale_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _subtotal numeric(12,2);
  _tax numeric(12,2);
  _discount numeric(12,2);
  _total numeric(12,2);
  _paid numeric(12,2);
  _number bigint;
  _name text;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status <> 'open' THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;
  IF _sale.shift_id IS NULL THEN RAISE EXCEPTION 'POS_SHIFT_REQUIRED'; END IF;

  PERFORM 1 FROM public.pos_cashier_shifts
    WHERE id = _sale.shift_id AND restaurant_id = _restaurant_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SHIFT_NOT_OPEN'; END IF;

  SELECT COALESCE(SUM(line_subtotal), 0), COALESCE(SUM(tax_amount), 0), COALESCE(SUM(discount_amount), 0),
         COALESCE(SUM(line_total), 0)
    INTO _subtotal, _tax, _discount, _total
    FROM public.pos_sale_items WHERE sale_id = _sale_id;

  IF _total <= 0 THEN RAISE EXCEPTION 'POS_SALE_EMPTY'; END IF;

  _discount := _discount + COALESCE(_sale.discount_amount, 0) * 0;
  _total := round(_total - 0, 2);

  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.pos_payments
    WHERE sale_id = _sale_id AND status = 'captured';
  IF _paid + 0.001 < _total THEN RAISE EXCEPTION 'POS_PAYMENT_INSUFFICIENT'; END IF;

  INSERT INTO public.pos_sale_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 1)
    ON CONFLICT (restaurant_id) DO UPDATE
      SET last_number = public.pos_sale_counters.last_number + 1, updated_at = now()
    RETURNING last_number INTO _number;

  SELECT COALESCE(p.full_name, p.email) INTO _name
    FROM public.restaurant_users ru
    LEFT JOIN public.profiles p ON p.id = ru.user_id
    WHERE ru.id = _membership_id;

  UPDATE public.pos_sales SET
    status = 'completed',
    subtotal = _subtotal,
    tax_amount = _tax,
    total = _total,
    sale_number = _number,
    sale_reference = 'POS-' || lpad(_number::text, 6, '0'),
    completed_at = now(),
    completed_by_membership_id = _membership_id,
    cashier_name_snapshot = COALESCE(_sale.cashier_name_snapshot, _name)
  WHERE id = _sale_id AND restaurant_id = _restaurant_id AND status = 'open'
  RETURNING * INTO _sale;

  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;

  UPDATE public.pos_payments SET shift_id = COALESCE(shift_id, _sale.shift_id)
    WHERE sale_id = _sale_id AND restaurant_id = _restaurant_id;

  RETURN _sale;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) TO service_role;

-- 14. Refund against a completed sale, capped at the remaining refundable amount.
CREATE OR REPLACE FUNCTION public.pos_refund_sale(
  _restaurant_id uuid,
  _sale_id uuid,
  _amount numeric,
  _method text,
  _reason text,
  _payment_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _remaining numeric(12,2);
  _new_refunded numeric(12,2);
  _status text;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status NOT IN ('completed','partially_refunded') THEN RAISE EXCEPTION 'POS_SALE_NOT_REFUNDABLE'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'POS_INVALID_AMOUNT'; END IF;

  _remaining := _sale.total - _sale.refunded_amount;
  IF _amount > _remaining + 0.001 THEN RAISE EXCEPTION 'POS_REFUND_EXCEEDS_REMAINING'; END IF;

  INSERT INTO public.pos_refunds (
    restaurant_id, sale_id, payment_id, shift_id, amount, method, reason, processed_by_membership_id
  ) VALUES (
    _restaurant_id, _sale_id, _payment_id, _sale.shift_id, round(_amount, 2), _method, _reason, _membership_id
  );

  _new_refunded := round(_sale.refunded_amount + _amount, 2);
  _status := CASE WHEN _new_refunded + 0.001 >= _sale.total THEN 'refunded' ELSE 'partially_refunded' END;

  UPDATE public.pos_sales SET refunded_amount = _new_refunded, status = _status
    WHERE id = _sale_id AND restaurant_id = _restaurant_id
    RETURNING * INTO _sale;

  RETURN _sale;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_refund_sale(uuid, uuid, numeric, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_refund_sale(uuid, uuid, numeric, text, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pos_protect_completed_sale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_protect_completed_sale_items() FROM PUBLIC, anon, authenticated;
