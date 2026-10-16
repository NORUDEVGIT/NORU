-- Package charge basis on the package master (setup only).
--
-- Sequential after 0124. Dual-lane: byte-identical copies live in
--   supabase/migrations/0125_pms_package_charge_basis.sql
--   drizzle/migrations/0125_pms_package_charge_basis.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Operational commercial execution remains per_stay only (0104/0106).
-- This column configures Package Master; it does not widen activation checks.
--
-- Rollback:
--   ALTER TABLE public.pms_packages DROP CONSTRAINT IF EXISTS pms_packages_charge_basis_check;
--   ALTER TABLE public.pms_packages DROP COLUMN IF EXISTS charge_basis;

ALTER TABLE public.pms_packages
  ADD COLUMN IF NOT EXISTS charge_basis text NOT NULL DEFAULT 'per_stay';

ALTER TABLE public.pms_packages
  DROP CONSTRAINT IF EXISTS pms_packages_charge_basis_check;

ALTER TABLE public.pms_packages
  ADD CONSTRAINT pms_packages_charge_basis_check CHECK (
    charge_basis IN ('per_stay', 'per_night', 'per_person', 'per_room', 'per_unit')
  );

COMMENT ON COLUMN public.pms_packages.charge_basis IS
  'Package Master charge basis. Commercial Engine V1 still executes per_stay only.';
