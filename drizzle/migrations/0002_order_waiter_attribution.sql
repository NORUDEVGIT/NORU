ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'customer_qr',
  ADD COLUMN IF NOT EXISTS assigned_waiter_membership_id uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_staff_membership_id uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_waiter_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS created_by_staff_name_snapshot text NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_check
  CHECK (order_source IN ('customer_qr', 'waiter_assisted'));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_attribution_check
  CHECK (
    (order_source = 'customer_qr' AND created_by_staff_membership_id IS NULL)
    OR (order_source = 'waiter_assisted' AND created_by_staff_membership_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter ON public.orders (assigned_waiter_membership_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_source ON public.orders (order_source);