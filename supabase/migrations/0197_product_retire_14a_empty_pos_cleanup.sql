-- PRODUCT-RETIRE-14A — drop empty isolated retirement objects + empty Standalone POS schema.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0197_product_retire_14a_empty_pos_cleanup.sql
--   drizzle/migrations/0197_product_retire_14a_empty_pos_cleanup.sql
--
-- Scope is intentionally narrow. Every target was verified empty on the
-- deployed database before this file was authored. This migration does not
-- rewrite historical RMS/PMS/customer rows.
--
-- In scope:
--   Group 1: staff_action_grants, restaurant_opening_hours, menu_item_recipe_components
--   Standalone POS: pos_settings, pos_registers, pos_categories, pos_products,
--                   pos_cashier_shifts, pos_sale_counters, pos_sales,
--                   pos_sale_items, pos_payments, pos_refunds
--
-- Out of scope (must remain):
--   RMS financial/history: orders, order_items, order_status_history,
--     order_payments, order_adjustments, order_receipts, order_refunds,
--     order_refund_lines, cashier_shifts
--   Staff/Workforce: restaurant_tables, staff_table_assignments
--   Customer/auth: profiles, guest_profiles, auth.users
--   PMS/shared: guest_folios, folio_transactions, hotel_reservations,
--     hotel_rooms, hotel_cashier_shifts, pms_taxes, pms_service_charges,
--     inventory_items, inventory_units, inventory_stock_movements,
--     restaurant_suppliers, purchase_orders, restaurant_assets,
--     staff_shifts, staff_attendance, restaurant_users, staff_module_access
--   Entitlement/module/role keys, legacy tax/room-charge columns, menu-images
--
-- Drift: drizzle/migrations/0030_standalone_pos_foundation.sql defined
--   public.pos_refund_sale(uuid, uuid, numeric, text, text, uuid, uuid).
--   PRODUCT-RETIRE-13A confirmed that function is absent from the deployed DB.
--   The DROP FUNCTION IF EXISTS below is defensive; it does not create it.

-- ---------------------------------------------------------------------------
-- 1. Revoke leftover PUBLIC / anon / authenticated table grants (hygiene).
--    service_role / postgres grants disappear with the tables.
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.staff_action_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.restaurant_opening_hours FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.menu_item_recipe_components FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.pos_refunds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_sale_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_sales FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_cashier_shifts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_registers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_sale_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pos_settings FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. POS-specific protect triggers, then POS-only functions.
--    set_updated_at() is shared and is not dropped; table triggers vanish
--    with DROP TABLE.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS pos_sales_protect_completed ON public.pos_sales;
DROP TRIGGER IF EXISTS pos_sale_items_protect_completed ON public.pos_sale_items;

REVOKE ALL ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pos_complete_sale(uuid, uuid, uuid);

REVOKE ALL ON FUNCTION public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid);

REVOKE ALL ON FUNCTION public.pos_protect_completed_sale() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pos_protect_completed_sale();

REVOKE ALL ON FUNCTION public.pos_protect_completed_sale_items() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pos_protect_completed_sale_items();

-- Defensive: repository historically defined this; deployed DB does not.
DROP FUNCTION IF EXISTS public.pos_refund_sale(uuid, uuid, numeric, text, text, uuid, uuid);

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'pos_complete_sale',
        'pos_refund_sale',
        'pos_refund_sale_allocated',
        'pos_protect_completed_sale',
        'pos_protect_completed_sale_items'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s;', fn.sig);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Empty Standalone POS tables. Child tables first (deployed FK order).
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.pos_refunds;
DROP TABLE IF EXISTS public.pos_payments;
DROP TABLE IF EXISTS public.pos_sale_items;
DROP TABLE IF EXISTS public.pos_sales;
DROP TABLE IF EXISTS public.pos_cashier_shifts;
DROP TABLE IF EXISTS public.pos_products;
DROP TABLE IF EXISTS public.pos_categories;
DROP TABLE IF EXISTS public.pos_registers;
DROP TABLE IF EXISTS public.pos_sale_counters;
DROP TABLE IF EXISTS public.pos_settings;

-- ---------------------------------------------------------------------------
-- 4. Empty isolated Group 1 tables. No retained inbound FKs.
--    menu_item_recipe_components only references inventory/menu outbound.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.staff_action_grants;
DROP TABLE IF EXISTS public.restaurant_opening_hours;
DROP TABLE IF EXISTS public.menu_item_recipe_components;
