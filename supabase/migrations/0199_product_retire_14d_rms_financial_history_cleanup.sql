-- PRODUCT-RETIRE-14D — remove exported RMS financial / order / menu cluster.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0199_product_retire_14d_rms_financial_history_cleanup.sql
--   drizzle/migrations/0199_product_retire_14d_rms_financial_history_cleanup.sql
--
-- Prerequisite: PRODUCT-RETIRE-14B archive verified; PRODUCT-RETIRE-14C
-- removed folio_history_shift_same_property.
--
-- In scope (tables):
--   order_refund_lines, order_refunds, order_receipts, order_status_history,
--   order_adjustments, order_payments, order_items, orders,
--   menu_items, menu_categories, cashier_shifts
--
-- In scope (RMS-only functions / triggers):
--   log_order_status_insert, log_order_status_update, log_order_status
--   record_pos_order_payment, open_cashier_shift, close_cashier_shift,
--   refund_restaurant_order, apply_rm_order_discount, clear_rm_order_discount,
--   apply_rm_order_comp, complete_comped_order, freeze_order_receipt,
--   record_order_receipt_reprint, post_order_room_charge,
--   reverse_order_room_charge, has_kitchen_access
--
-- Out of scope (must remain):
--   restaurant_tables, staff_table_assignments, staff_shifts, staff_attendance
--   guest_profiles, guest_folios, folio_transactions, folio_history
--   hotel_reservations, hotel_rooms, hotel_cashier_shifts
--   open_hotel_cashier_shift, close_hotel_cashier_shift,
--   post_folio_manual_charge, post_folio_service_charge,
--   post_folio_charge_correction, set_updated_at
--   inventory / procurement / assets, profiles, auth.users
--   package/module/role keys, restaurants tax columns, menu-images

-- ---------------------------------------------------------------------------
-- 0. Fail closed if the 14C FK decoupling is missing.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'folio_history_shift_same_property'
  ) THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14D: folio_history_shift_same_property still exists; 14C required';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Revoke leftover PUBLIC / anon / authenticated table grants (hygiene).
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.order_refund_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_refunds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_status_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_adjustments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.menu_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.menu_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cashier_shifts FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RMS-only order status triggers, then the trigger function.
--    set_updated_at() is shared and is not dropped.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS log_order_status_insert ON public.orders;
DROP TRIGGER IF EXISTS log_order_status_update ON public.orders;

REVOKE ALL ON FUNCTION public.log_order_status() FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.log_order_status();

-- ---------------------------------------------------------------------------
-- 3. RMS-only functions. Drop before tables: several RETURN table rowtypes.
--    Hotel cashier / folio charge RPCs are not in this list.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid);

REVOKE ALL ON FUNCTION public.open_cashier_shift(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.open_cashier_shift(uuid, uuid, numeric, text);

REVOKE ALL ON FUNCTION public.close_cashier_shift(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.close_cashier_shift(uuid, uuid, numeric, text, uuid);

REVOKE ALL ON FUNCTION public.refund_restaurant_order(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.refund_restaurant_order(uuid, uuid, uuid, numeric, text, uuid, uuid, jsonb);

REVOKE ALL ON FUNCTION public.apply_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.apply_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, text, numeric, numeric, numeric, numeric);

REVOKE ALL ON FUNCTION public.clear_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.clear_rm_order_discount(uuid, uuid, uuid, text, numeric, numeric, numeric, numeric);

REVOKE ALL ON FUNCTION public.apply_rm_order_comp(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.apply_rm_order_comp(uuid, uuid, uuid, text, jsonb, numeric, numeric, text, numeric, text, numeric, numeric, numeric);

REVOKE ALL ON FUNCTION public.complete_comped_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.complete_comped_order(uuid, uuid, uuid);

REVOKE ALL ON FUNCTION public.freeze_order_receipt(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.freeze_order_receipt(uuid, uuid, jsonb);

REVOKE ALL ON FUNCTION public.record_order_receipt_reprint(uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.record_order_receipt_reprint(uuid, uuid);

REVOKE ALL ON FUNCTION public.post_order_room_charge(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.post_order_room_charge(uuid, uuid, uuid, uuid);

REVOKE ALL ON FUNCTION public.reverse_order_room_charge(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.reverse_order_room_charge(uuid, uuid, text, uuid);

REVOKE ALL ON FUNCTION public.has_kitchen_access(uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.has_kitchen_access(uuid);

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
        'post_order_room_charge',
        'reverse_order_room_charge',
        'log_order_status',
        'has_kitchen_access'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s;', fn.sig);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. Child tables first (deployed FK order), then menu, then cashier_shifts.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.order_refund_lines;
DROP TABLE IF EXISTS public.order_refunds;
DROP TABLE IF EXISTS public.order_receipts;
DROP TABLE IF EXISTS public.order_status_history;
DROP TABLE IF EXISTS public.order_adjustments;
DROP TABLE IF EXISTS public.order_payments;
DROP TABLE IF EXISTS public.order_items;
DROP TABLE IF EXISTS public.orders;
DROP TABLE IF EXISTS public.menu_items;
DROP TABLE IF EXISTS public.menu_categories;
DROP TABLE IF EXISTS public.cashier_shifts;

-- ---------------------------------------------------------------------------
-- 5. Assert RMS cluster is gone and PMS / staff / folio audit remain.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
     OR to_regclass('public.order_items') IS NOT NULL
     OR to_regclass('public.order_status_history') IS NOT NULL
     OR to_regclass('public.order_payments') IS NOT NULL
     OR to_regclass('public.order_adjustments') IS NOT NULL
     OR to_regclass('public.order_receipts') IS NOT NULL
     OR to_regclass('public.order_refunds') IS NOT NULL
     OR to_regclass('public.order_refund_lines') IS NOT NULL
     OR to_regclass('public.menu_items') IS NOT NULL
     OR to_regclass('public.menu_categories') IS NOT NULL
     OR to_regclass('public.cashier_shifts') IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: an approved RMS table is still present';
  END IF;

  IF to_regprocedure('public.open_cashier_shift(uuid, uuid, numeric, text)') IS NOT NULL
     OR to_regprocedure('public.close_cashier_shift(uuid, uuid, numeric, text, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: RMS cashier function still present';
  END IF;

  IF to_regclass('public.hotel_cashier_shifts') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: hotel_cashier_shifts missing';
  END IF;

  IF to_regprocedure('public.open_hotel_cashier_shift(uuid, uuid, numeric, text)') IS NULL
     OR to_regprocedure('public.close_hotel_cashier_shift(uuid, uuid, numeric, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: hotel cashier RPC missing';
  END IF;

  IF to_regprocedure('public.post_folio_manual_charge(uuid, uuid, text, numeric, uuid, text, text)') IS NULL
     OR to_regprocedure('public.post_folio_service_charge(uuid, uuid, uuid, integer, text, uuid, text)') IS NULL
     OR to_regprocedure('public.post_folio_charge_correction(uuid, uuid, text, numeric, text, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: PMS folio charge RPC missing';
  END IF;

  IF to_regclass('public.restaurant_tables') IS NULL
     OR to_regclass('public.staff_table_assignments') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: staff table objects missing';
  END IF;

  IF to_regclass('public.folio_history') IS NULL
     OR to_regclass('public.guest_folios') IS NULL
     OR to_regclass('public.folio_transactions') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: PMS folio objects missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'folio_history'
      AND column_name IN (
        'cashier_shift_id',
        'legacy_cashier_shift_id',
        'legacy_cashier_shift_status',
        'legacy_cashier_shift_opened_at',
        'legacy_cashier_shift_closed_at'
      )
    GROUP BY table_name
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14D: folio_history snapshot/legacy columns missing';
  END IF;
END
$$;
