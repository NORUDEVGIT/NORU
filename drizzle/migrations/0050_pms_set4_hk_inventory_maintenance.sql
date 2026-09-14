-- PMS-SET4 — Housekeeping, room-inventory and maintenance rules (Issue #74).
--
-- Sequential after 0049. Dual-lane with
--   supabase/migrations/0050_pms_set4_hk_inventory_maintenance.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No sample work orders. RLS on new tables matches rooms: members read;
-- owner/manager write.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0050_pms_set4_hk_inventory_maintenance.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS pms_hk_status_rules,
--     DROP COLUMN IF EXISTS pms_hk_cleaning_posture,
--     DROP COLUMN IF EXISTS pms_ooo_oos_posture,
--     DROP COLUMN IF EXISTS pms_maintenance_sla;
--   DROP TABLE IF EXISTS public.pms_maintenance_type_tags;
--   DROP TABLE IF EXISTS public.pms_maintenance_priorities;
--   DROP TABLE IF EXISTS public.pms_maintenance_categories;
--   DROP TABLE IF EXISTS public.pms_restriction_reasons;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pms_hk_status_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_hk_cleaning_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_ooo_oos_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_maintenance_sla jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurants.pms_hk_status_rules IS
  'PMS-SET4 HK status labels and active flags (dirty/clean/inspected/pickup). Draft until savedAt.';
COMMENT ON COLUMN public.restaurants.pms_hk_cleaning_posture IS
  'PMS-SET4 cleaning types (optional turn-down), priorities, inspection gate and thin service timing.';
COMMENT ON COLUMN public.restaurants.pms_ooo_oos_posture IS
  'PMS-SET4 OOO versus OOS meaning, reasonRequired and expectedReturnRequired. Draft until savedAt.';
COMMENT ON COLUMN public.restaurants.pms_maintenance_sla IS
  'PMS-SET4 thin acknowledge/resolve guidance. Empty is a Warning, not a go-live block.';

GRANT SELECT (pms_hk_status_rules, pms_hk_cleaning_posture, pms_ooo_oos_posture, pms_maintenance_sla) ON public.restaurants TO authenticated;

CREATE TABLE IF NOT EXISTS public.pms_restriction_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_restriction_reasons_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_restriction_reasons_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_restriction_reasons_restaurant_idx
  ON public.pms_restriction_reasons(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_restriction_reasons TO authenticated;
GRANT ALL ON public.pms_restriction_reasons TO service_role;
ALTER TABLE public.pms_restriction_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read restriction reasons" ON public.pms_restriction_reasons;
CREATE POLICY "Members read restriction reasons" ON public.pms_restriction_reasons
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert restriction reasons" ON public.pms_restriction_reasons;
CREATE POLICY "Managers insert restriction reasons" ON public.pms_restriction_reasons
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update restriction reasons" ON public.pms_restriction_reasons;
CREATE POLICY "Managers update restriction reasons" ON public.pms_restriction_reasons
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete restriction reasons" ON public.pms_restriction_reasons;
CREATE POLICY "Managers delete restriction reasons" ON public.pms_restriction_reasons
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_restriction_reasons_updated_at ON public.pms_restriction_reasons;
CREATE TRIGGER set_pms_restriction_reasons_updated_at BEFORE UPDATE ON public.pms_restriction_reasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_maintenance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_maintenance_categories_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_maintenance_categories_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_maintenance_categories_restaurant_idx
  ON public.pms_maintenance_categories(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_maintenance_categories TO authenticated;
GRANT ALL ON public.pms_maintenance_categories TO service_role;
ALTER TABLE public.pms_maintenance_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read maintenance categories" ON public.pms_maintenance_categories;
CREATE POLICY "Members read maintenance categories" ON public.pms_maintenance_categories
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert maintenance categories" ON public.pms_maintenance_categories;
CREATE POLICY "Managers insert maintenance categories" ON public.pms_maintenance_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update maintenance categories" ON public.pms_maintenance_categories;
CREATE POLICY "Managers update maintenance categories" ON public.pms_maintenance_categories
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete maintenance categories" ON public.pms_maintenance_categories;
CREATE POLICY "Managers delete maintenance categories" ON public.pms_maintenance_categories
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_maintenance_categories_updated_at ON public.pms_maintenance_categories;
CREATE TRIGGER set_pms_maintenance_categories_updated_at BEFORE UPDATE ON public.pms_maintenance_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_maintenance_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_maintenance_priorities_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_maintenance_priorities_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_maintenance_priorities_restaurant_idx
  ON public.pms_maintenance_priorities(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_maintenance_priorities TO authenticated;
GRANT ALL ON public.pms_maintenance_priorities TO service_role;
ALTER TABLE public.pms_maintenance_priorities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read maintenance priorities" ON public.pms_maintenance_priorities;
CREATE POLICY "Members read maintenance priorities" ON public.pms_maintenance_priorities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert maintenance priorities" ON public.pms_maintenance_priorities;
CREATE POLICY "Managers insert maintenance priorities" ON public.pms_maintenance_priorities
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update maintenance priorities" ON public.pms_maintenance_priorities;
CREATE POLICY "Managers update maintenance priorities" ON public.pms_maintenance_priorities
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete maintenance priorities" ON public.pms_maintenance_priorities;
CREATE POLICY "Managers delete maintenance priorities" ON public.pms_maintenance_priorities
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_maintenance_priorities_updated_at ON public.pms_maintenance_priorities;
CREATE TRIGGER set_pms_maintenance_priorities_updated_at BEFORE UPDATE ON public.pms_maintenance_priorities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_maintenance_type_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_maintenance_type_tags_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_maintenance_type_tags_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_maintenance_type_tags_restaurant_idx
  ON public.pms_maintenance_type_tags(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_maintenance_type_tags TO authenticated;
GRANT ALL ON public.pms_maintenance_type_tags TO service_role;
ALTER TABLE public.pms_maintenance_type_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read maintenance type tags" ON public.pms_maintenance_type_tags;
CREATE POLICY "Members read maintenance type tags" ON public.pms_maintenance_type_tags
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert maintenance type tags" ON public.pms_maintenance_type_tags;
CREATE POLICY "Managers insert maintenance type tags" ON public.pms_maintenance_type_tags
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update maintenance type tags" ON public.pms_maintenance_type_tags;
CREATE POLICY "Managers update maintenance type tags" ON public.pms_maintenance_type_tags
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete maintenance type tags" ON public.pms_maintenance_type_tags;
CREATE POLICY "Managers delete maintenance type tags" ON public.pms_maintenance_type_tags
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_maintenance_type_tags_updated_at ON public.pms_maintenance_type_tags;
CREATE TRIGGER set_pms_maintenance_type_tags_updated_at BEFORE UPDATE ON public.pms_maintenance_type_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_restriction_reasons IS
  'PMS-SET4 restriction-reason catalogue. Empty is a Warning, not a go-live block.';
COMMENT ON TABLE public.pms_maintenance_categories IS
  'PMS-SET4 maintenance-category catalogue. Baseline codes are property-editable. Empty is a Warning.';
COMMENT ON TABLE public.pms_maintenance_priorities IS
  'PMS-SET4 maintenance-priority catalogue (normal/high/urgent). Empty is a Warning.';
COMMENT ON TABLE public.pms_maintenance_type_tags IS
  'PMS-SET4 maintenance type-tag catalogue (preventive/corrective/emergency/inspection). Empty is a Warning.';
