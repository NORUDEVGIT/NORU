-- PRODUCT-RETIRE-13 — non-destructive database deprecation / lock-down.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0196_product_retire_13_non_destructive_deprecation.sql
--   drizzle/migrations/0196_product_retire_13_non_destructive_deprecation.sql
--
-- Closes obsolete QR / consumer / RMS / Standalone POS runtime access.
-- Does NOT drop historical tables or columns.
-- Does NOT delete orders, profiles, POS rows, menu rows, or auth.users.
-- Does NOT rewrite folio / receipt / tax history.
-- Does NOT remove package-key CHECK values.
-- PMS policies, hotel cashier RPCs, inventory, procurement, and staff
-- operational grants are intentionally untouched.

-- ---------------------------------------------------------------------------
-- 1. Package entitlement seed: never enable retired packages for new properties.
--    Historical rows (including historically enabled RMS/POS/BO) stay as-is.
--    PMS continues to seed disabled; application enables PMS separately.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_restaurant_package_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.restaurant_package_entitlements (restaurant_id, package_key, enabled)
  VALUES
    (NEW.id, 'restaurant_management', false),
    (NEW.id, 'pms', false),
    (NEW.id, 'pos', false),
    (NEW.id, 'back_office', false)
  ON CONFLICT (restaurant_id, package_key) DO NOTHING;

  -- Only the newly inserted property. Never rewrite historical restaurants.
  UPDATE public.restaurant_package_entitlements
     SET enabled = false
   WHERE restaurant_id = NEW.id
     AND package_key IN ('restaurant_management', 'pos', 'back_office')
     AND enabled IS DISTINCT FROM false;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_restaurant_package_entitlements() IS
  'PRODUCT-RETIRE-13: new properties receive four explicit rows. PMS seeds disabled (app enables later). restaurant_management, pos, and back_office cannot be seeded enabled. Historical entitlement rows are not backfilled or rewritten.';

REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM anon;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Consumer diner RLS (profiles.account_type = customer via customer_id).
--    Staff / member SELECT policies remain for historical export.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can view their own order items" ON public.order_items;
DROP POLICY IF EXISTS "Customers can view their own order history" ON public.order_status_history;

-- ---------------------------------------------------------------------------
-- 3. Public QR / anonymous menu + leftover Anyone-* order write/view policies.
--    Names taken from 20260813184557, 20260814003113, 20260814103630,
--    20260814233716, and 20260908_noru_greenfield_schema.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can view active categories of live restaurants" ON public.menu_categories;
DROP POLICY IF EXISTS "Public can view items of live restaurants" ON public.menu_items;
DROP POLICY IF EXISTS "Anyone can view available menu items" ON public.menu_items;

DROP POLICY IF EXISTS "Anyone can create an order" ON public.orders;
DROP POLICY IF EXISTS "Anyone can view orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can update order status" ON public.orders;
DROP POLICY IF EXISTS "Kitchen staff can update their restaurant orders" ON public.orders;

DROP POLICY IF EXISTS "Anyone can add order items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can view order items" ON public.order_items;

-- QR restaurant hours. Replace public+member policy with member-only read.
DROP POLICY IF EXISTS "opening hours are publicly readable" ON public.restaurant_opening_hours;
DROP POLICY IF EXISTS "Members can view restaurant opening hours" ON public.restaurant_opening_hours;
CREATE POLICY "Members can view restaurant opening hours"
ON public.restaurant_opening_hours
FOR SELECT
TO authenticated
USING (public.is_restaurant_member(restaurant_id));

-- ---------------------------------------------------------------------------
-- 4. Table grants: close anon/customer write and public catalog SELECT.
--    Authenticated staff keep SELECT for historical export.
--    service_role keeps ALL (existing grants) for maintenance.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
GRANT SELECT ON public.orders TO authenticated;

REVOKE ALL ON public.order_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;
GRANT SELECT ON public.order_items TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.order_payments FROM authenticated;
GRANT SELECT ON public.order_payments TO authenticated;

REVOKE SELECT ON public.menu_items FROM anon;
REVOKE SELECT ON public.menu_categories FROM anon;
REVOKE SELECT ON public.restaurant_opening_hours FROM anon;

-- 0038 public QR / till preview of legacy RMS tax columns.
REVOKE SELECT (tax_rate, tax_inclusive, service_enabled, service_rate)
  ON public.restaurants FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Retired RMS / POS / room-charge RPCs: revoke app-facing EXECUTE.
--    Function bodies stay for later destructive cleanup and service-role export.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn record;
  retired text[] := ARRAY[
    'record_pos_order_payment',
    'open_cashier_shift',
    'close_cashier_shift',
    'refund_restaurant_order',
    'apply_rm_order_discount',
    'clear_rm_order_discount',
    'apply_rm_order_comp',
    'complete_comped_order',
    'freeze_order_receipt',
    'record_order_receipt_reprint',
    'has_kitchen_access',
    'post_order_room_charge',
    'reverse_order_room_charge',
    'pos_complete_sale',
    'pos_refund_sale',
    'pos_refund_sale_allocated'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (retired)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.sig);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. Realtime: remove RMS order feed. No PMS tables are in this publication.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'order_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.order_items;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. Deprecated column comments. Columns and values stay.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.restaurants.tax_rate IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS tax rate. Unused by application. PMS tax owner is pms_taxes.';
COMMENT ON COLUMN public.restaurants.tax_inclusive IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS tax-inclusive flag. Unused by application.';
COMMENT ON COLUMN public.restaurants.service_enabled IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS service-charge flag. Unused by application.';
COMMENT ON COLUMN public.restaurants.service_rate IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS service-charge rate. Unused by application.';
COMMENT ON COLUMN public.restaurants.tax_name IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS/SET1 tax display name. Unused by application. PMS tax owner is pms_taxes.';

COMMENT ON COLUMN public.orders.room_charge_folio_id IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS→PMS room-charge folio link. Preserved. No new writes.';
COMMENT ON COLUMN public.orders.room_charge_reservation_id IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS→PMS room-charge reservation link. Preserved. No new writes.';
COMMENT ON COLUMN public.orders.room_charge_posted_at IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS→PMS room-charge timestamp. Preserved. No new writes.';
COMMENT ON COLUMN public.orders.room_charge_posted_by_membership_id IS
  'DEPRECATED PRODUCT-RETIRE-13: historical RMS→PMS room-charge actor. Preserved. No new writes.';
