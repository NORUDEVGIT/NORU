-- Package cover image path on the existing package master.
--
-- Sequential after 0123. Dual-lane: byte-identical copies live in
--   supabase/migrations/0124_pms_package_cover_image.sql
--   drizzle/migrations/0124_pms_package_cover_image.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Stores a property-images object path only. Signed URLs are minted on read.
-- No image table. No trigger.
--
-- Rollback:
--   ALTER TABLE public.pms_packages DROP COLUMN IF EXISTS cover_image_path;

ALTER TABLE public.pms_packages
  ADD COLUMN IF NOT EXISTS cover_image_path text;

COMMENT ON COLUMN public.pms_packages.cover_image_path IS
  'Object path in the private property-images bucket. Not a signed URL.';
