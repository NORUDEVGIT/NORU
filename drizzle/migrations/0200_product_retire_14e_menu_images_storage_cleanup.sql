-- PRODUCT-RETIRE-14E — remove retired menu-images storage policies.
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0200_product_retire_14e_menu_images_storage_cleanup.sql
--   drizzle/migrations/0200_product_retire_14e_menu_images_storage_cleanup.sql
--
-- Object bytes were archived to noru-exports/product-retire-14e/.
-- Objects and the menu-images bucket are deleted via the Storage API.
-- Direct SQL deletion of storage catalog rows is rejected by
-- storage.protect_delete(). This migration only drops the four policies
-- that exclusively targeted bucket_id = 'menu-images'.
--
-- KEEP:
--   property-images bucket and its four manager policies
--   marketing-media bucket
--   public.can_manage_restaurant_storage(text)

-- ---------------------------------------------------------------------------
-- 0. Fail closed if menu-images objects still exist (archive/delete first).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'menu-images'
  ) THEN
    RAISE EXCEPTION
      'PRODUCT-RETIRE-14E: menu-images objects still present; archive and Storage API delete required';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Drop policies that exist solely for menu-images.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Managers can delete their menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can read their menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can update their menu images" ON storage.objects;
DROP POLICY IF EXISTS "Managers can upload their menu images" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Assert PMS/marketing storage and the shared helper remain.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname IN (
        'Managers can delete their menu images',
        'Managers can read their menu images',
        'Managers can update their menu images',
        'Managers can upload their menu images'
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14E: a menu-images policy is still present';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'property-images') THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14E: property-images bucket missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'marketing-media') THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14E: marketing-media bucket missing';
  END IF;

  IF to_regprocedure('public.can_manage_restaurant_storage(text)') IS NULL THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14E: can_manage_restaurant_storage missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND policyname IN (
        'Managers delete their property images',
        'Managers read their property images',
        'Managers update their property images',
        'Managers upload their property images'
      )
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'PRODUCT-RETIRE-14E: property-images policies missing';
  END IF;
END
$$;
