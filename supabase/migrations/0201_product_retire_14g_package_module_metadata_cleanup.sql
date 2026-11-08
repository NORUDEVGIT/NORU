-- PRODUCT-RETIRE-14G — package and module metadata cleanup.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0201_product_retire_14g_package_module_metadata_cleanup.sql
--   drizzle/migrations/0201_product_retire_14g_package_module_metadata_cleanup.sql
--
-- Removes retired restaurant_package_entitlements rows
-- (restaurant_management, pos, back_office) after archive.
-- Tightens package_key CHECK to pms only.
-- Seeds new properties with PMS only.
-- Removes retired staff_module_access CHECK keys
-- (food_and_beverage, pos, standalone_pos). Those keys had 0 rows.
-- Does NOT delete kitchen or waiter roles.
-- Does NOT touch guest, reservation, folio, tax, or cashier_shift columns.

DO $$
DECLARE
  rm_n int;
  pos_n int;
  bo_n int;
  pms_n int;
  retired_mod int;
  deleted_n int;
  leftover int;
  pms_after int;
  role_def text;
BEGIN
  SELECT count(*) INTO rm_n
    FROM public.restaurant_package_entitlements
   WHERE package_key = 'restaurant_management';
  SELECT count(*) INTO pos_n
    FROM public.restaurant_package_entitlements
   WHERE package_key = 'pos';
  SELECT count(*) INTO bo_n
    FROM public.restaurant_package_entitlements
   WHERE package_key = 'back_office';
  SELECT count(*) INTO pms_n
    FROM public.restaurant_package_entitlements
   WHERE package_key = 'pms';
  SELECT count(*) INTO retired_mod
    FROM public.staff_module_access
   WHERE module_key IN ('food_and_beverage', 'pos', 'standalone_pos');

  IF rm_n <> 11 OR pos_n <> 11 OR bo_n <> 11 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14G: unexpected retired entitlement counts rm=% pos=% bo=%',
      rm_n, pos_n, bo_n;
  END IF;
  IF pms_n <> 11 THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14G: unexpected pms entitlement count %', pms_n;
  END IF;
  IF retired_mod <> 0 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14G: unexpected retired staff_module_access rows %',
      retired_mod;
  END IF;

  DELETE FROM public.restaurant_package_entitlements
   WHERE package_key IN ('restaurant_management', 'pos', 'back_office');
  GET DIAGNOSTICS deleted_n = ROW_COUNT;
  IF deleted_n <> 33 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14G: deleted % retired entitlement rows, expected 33',
      deleted_n;
  END IF;

  SELECT count(*) INTO leftover
    FROM public.restaurant_package_entitlements
   WHERE package_key IN ('restaurant_management', 'pos', 'back_office');
  SELECT count(*) INTO pms_after
    FROM public.restaurant_package_entitlements
   WHERE package_key = 'pms';
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14G: leftover retired entitlements %', leftover;
  END IF;
  IF pms_after <> 11 THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14G: pms rows missing after delete %', pms_after;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO role_def
    FROM pg_constraint
   WHERE conname = 'restaurant_users_role_check'
     AND conrelid = 'public.restaurant_users'::regclass;
  IF role_def IS NULL
     OR position('kitchen' in role_def) = 0
     OR position('waiter' in role_def) = 0 THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14G: kitchen/waiter must remain in restaurant_users_role_check: %',
      role_def;
  END IF;
END
$$;

ALTER TABLE public.restaurant_package_entitlements
  DROP CONSTRAINT restaurant_package_entitlements_key_check;

ALTER TABLE public.restaurant_package_entitlements
  ADD CONSTRAINT restaurant_package_entitlements_key_check
  CHECK (package_key = 'pms');

CREATE OR REPLACE FUNCTION public.seed_restaurant_package_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.restaurant_package_entitlements (restaurant_id, package_key, enabled)
  VALUES (NEW.id, 'pms', false)
  ON CONFLICT (restaurant_id, package_key) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.seed_restaurant_package_entitlements() IS
  'PRODUCT-RETIRE-14G: new properties receive one explicit PMS row, seeded disabled. Application enables PMS separately. Retired restaurant_management, pos, and back_office keys are no longer inserted.';

REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM anon;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM authenticated;

ALTER TABLE public.staff_module_access
  DROP CONSTRAINT staff_module_access_module_key_check;

ALTER TABLE public.staff_module_access
  ADD CONSTRAINT staff_module_access_module_key_check
  CHECK (module_key = ANY (ARRAY[
    'front_office'::text,
    'housekeeping'::text,
    'inventory'::text,
    'procurement'::text,
    'human_resources'::text,
    'accounting_finance'::text,
    'reports_analytics'::text,
    'configuration'::text,
    'property_settings'::text
  ]));
