-- PMS Property Setup Card 7 — Audit policy schema (Phase 2).
--
-- Sequential after 0085. Dual-lane: byte-identical copies live in
--   supabase/migrations/0086_pms_card7_audit_policy.sql
--   drizzle/migrations/0086_pms_card7_audit_policy.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0086_pms_card7_audit_policy.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_audit_sensitive_coverage;
--   DROP TABLE IF EXISTS public.pms_audit_category_settings;
--   DROP TABLE IF EXISTS public.pms_audit_policies;
--   DROP TABLE IF EXISTS public.pms_audit_categories;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurant_staff_audit_log columns or RLS
--   admin_audit_log
--   hotel_reservation_history / guest_profile_history / folio_history
--   night_audit_runs / housekeeping_history
--   restaurants.pms_audit_retention_posture (not dropped)
--   restaurant_users.role / STAFF_ROLES / hotel_role_id
--   public.has_restaurant_role / public.is_restaurant_member
--   staff_module_access
--   login/logout/failed-login tables (none exist; not invented)
--   reports / data-import tables
--   no operational event/log table
--   no folio_history writers
--
-- Setup/governance only. Existing domain logs remain operational evidence.
-- No types.ts regen. No privileged functions. No purge job.

-- 1. Global audit category catalogue.
CREATE TABLE IF NOT EXISTS public.pms_audit_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  default_severity text NOT NULL DEFAULT 'info',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_audit_categories_code_unique UNIQUE (code),
  CONSTRAINT pms_audit_categories_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_audit_categories_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_audit_categories_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_audit_categories_severity_check CHECK (
    default_severity IN ('info', 'warning', 'critical')
  )
);

COMMENT ON TABLE public.pms_audit_categories IS
  'Card 7 global audit categories. No restaurant_id. Not an event log.';

GRANT SELECT ON public.pms_audit_categories TO authenticated;
GRANT ALL ON public.pms_audit_categories TO service_role;
ALTER TABLE public.pms_audit_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read audit categories" ON public.pms_audit_categories;
CREATE POLICY "Authenticated read audit categories" ON public.pms_audit_categories
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_audit_categories_updated_at ON public.pms_audit_categories;
CREATE TRIGGER set_pms_audit_categories_updated_at
  BEFORE UPDATE ON public.pms_audit_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_audit_categories (code, name, description, default_severity, active)
VALUES
  ('iam', 'Identity and access', 'Staff role and membership changes.', 'critical', true),
  ('setup', 'Property setup', 'SET and Card configuration saves.', 'info', true),
  ('front_office', 'Front office', 'Stay and reservation operational history.', 'warning', true),
  ('guest_privacy', 'Guest privacy', 'Export, anonymise, merge and restriction events.', 'critical', true),
  ('cashiering', 'Cashiering', 'Folio and money events when those trails exist.', 'critical', true),
  ('rates', 'Rates', 'Rate plan and calendar configuration.', 'warning', true),
  ('night_audit', 'Night audit', 'Night-audit runs and business-date close.', 'critical', true),
  ('distribution', 'Distribution', 'Channel and mapping configuration.', 'warning', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_severity = EXCLUDED.default_severity,
  active = EXCLUDED.active;

-- 2. Tenant audit policy (retention source of truth for Card 7).
CREATE TABLE IF NOT EXISTS public.pms_audit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  retention_days integer,
  mask_id_numbers boolean NOT NULL DEFAULT true,
  restrict_guest_export boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_audit_policies_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_audit_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_audit_policies_retention_check CHECK (
    retention_days IS NULL OR (retention_days BETWEEN 1 AND 3650)
  )
);

CREATE INDEX IF NOT EXISTS pms_audit_policies_restaurant_idx
  ON public.pms_audit_policies(restaurant_id);

COMMENT ON TABLE public.pms_audit_policies IS
  'Card 7 tenant audit policy. Not a purge job and not a second event log. SET5 pms_audit_retention_posture is not dropped.';
COMMENT ON COLUMN public.pms_audit_policies.retention_days IS
  'Configured retention in days. Nothing deletes restaurant_staff_audit_log or domain history in 0086.';
COMMENT ON COLUMN public.pms_audit_policies.enabled IS
  'Card 7 audit policy on/off. Does not enable login logging or change live authz.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_audit_policies TO authenticated;
GRANT ALL ON public.pms_audit_policies TO service_role;
ALTER TABLE public.pms_audit_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read audit policies" ON public.pms_audit_policies;
CREATE POLICY "Members read audit policies" ON public.pms_audit_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert audit policies" ON public.pms_audit_policies;
CREATE POLICY "Managers insert audit policies" ON public.pms_audit_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update audit policies" ON public.pms_audit_policies;
CREATE POLICY "Managers update audit policies" ON public.pms_audit_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete audit policies" ON public.pms_audit_policies;
CREATE POLICY "Managers delete audit policies" ON public.pms_audit_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_audit_policies_updated_at ON public.pms_audit_policies;
CREATE TRIGGER set_pms_audit_policies_updated_at
  BEFORE UPDATE ON public.pms_audit_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_audit_policies (
  restaurant_id, enabled, retention_days, mask_id_numbers, restrict_guest_export, active
)
SELECT
  r.id,
  false,
  CASE
    WHEN jsonb_typeof(COALESCE(r.pms_audit_retention_posture, '{}'::jsonb) -> 'retentionDays') = 'number'
      THEN (r.pms_audit_retention_posture ->> 'retentionDays')::integer
    ELSE NULL
  END,
  COALESCE((r.pms_audit_retention_posture ->> 'maskIdNumbers')::boolean, true),
  COALESCE((r.pms_audit_retention_posture ->> 'restrictGuestExport')::boolean, false),
  true
FROM public.restaurants r
ON CONFLICT (restaurant_id) DO NOTHING;

-- 3. Tenant category enablement / criticality.
CREATE TABLE IF NOT EXISTS public.pms_audit_category_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.pms_audit_categories(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  severity text,
  critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_audit_category_settings_unique UNIQUE (restaurant_id, category_id),
  CONSTRAINT pms_audit_category_settings_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_audit_category_settings_severity_check CHECK (
    severity IS NULL OR severity IN ('info', 'warning', 'critical')
  )
);

CREATE INDEX IF NOT EXISTS pms_audit_category_settings_restaurant_idx
  ON public.pms_audit_category_settings(restaurant_id, category_id);

COMMENT ON TABLE public.pms_audit_category_settings IS
  'Card 7 tenant audit category matrix. Maps policy onto existing logs; does not store events.';
COMMENT ON COLUMN public.pms_audit_category_settings.severity IS
  'Optional override of pms_audit_categories.default_severity. Derived at read time for a federated viewer.';
COMMENT ON COLUMN public.pms_audit_category_settings.critical IS
  'Critical-event configuration. Not an operational alert engine.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_audit_category_settings TO authenticated;
GRANT ALL ON public.pms_audit_category_settings TO service_role;
ALTER TABLE public.pms_audit_category_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read audit category settings" ON public.pms_audit_category_settings;
CREATE POLICY "Members read audit category settings" ON public.pms_audit_category_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert audit category settings" ON public.pms_audit_category_settings;
CREATE POLICY "Managers insert audit category settings" ON public.pms_audit_category_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update audit category settings" ON public.pms_audit_category_settings;
CREATE POLICY "Managers update audit category settings" ON public.pms_audit_category_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete audit category settings" ON public.pms_audit_category_settings;
CREATE POLICY "Managers delete audit category settings" ON public.pms_audit_category_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_audit_category_settings_updated_at ON public.pms_audit_category_settings;
CREATE TRIGGER set_pms_audit_category_settings_updated_at
  BEFORE UPDATE ON public.pms_audit_category_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Tenant sensitive-action coverage checklist (0085 sensitive permissions).
CREATE TABLE IF NOT EXISTS public.pms_audit_sensitive_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.pms_permissions(id) ON DELETE RESTRICT,
  coverage text NOT NULL DEFAULT 'required',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_audit_sensitive_coverage_unique UNIQUE (restaurant_id, permission_id),
  CONSTRAINT pms_audit_sensitive_coverage_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_audit_sensitive_coverage_check CHECK (
    coverage IN ('required', 'deferred', 'noted')
  ),
  CONSTRAINT pms_audit_sensitive_coverage_notes_check CHECK (
    notes IS NULL OR length(btrim(notes)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_audit_sensitive_coverage_restaurant_idx
  ON public.pms_audit_sensitive_coverage(restaurant_id, permission_id);

COMMENT ON TABLE public.pms_audit_sensitive_coverage IS
  'Card 7 checklist for 0085 sensitive permissions. Does not log refunds, activates, or module-access changes.';
COMMENT ON COLUMN public.pms_audit_sensitive_coverage.coverage IS
  'required = must be covered for readiness; deferred = known writer gap (folio_history unused, live activate, module access); noted = acknowledged.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_audit_sensitive_coverage TO authenticated;
GRANT ALL ON public.pms_audit_sensitive_coverage TO service_role;
ALTER TABLE public.pms_audit_sensitive_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read audit sensitive coverage" ON public.pms_audit_sensitive_coverage;
CREATE POLICY "Members read audit sensitive coverage" ON public.pms_audit_sensitive_coverage
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert audit sensitive coverage" ON public.pms_audit_sensitive_coverage;
CREATE POLICY "Managers insert audit sensitive coverage" ON public.pms_audit_sensitive_coverage
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update audit sensitive coverage" ON public.pms_audit_sensitive_coverage;
CREATE POLICY "Managers update audit sensitive coverage" ON public.pms_audit_sensitive_coverage
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete audit sensitive coverage" ON public.pms_audit_sensitive_coverage;
CREATE POLICY "Managers delete audit sensitive coverage" ON public.pms_audit_sensitive_coverage
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_audit_sensitive_coverage_updated_at ON public.pms_audit_sensitive_coverage;
CREATE TRIGGER set_pms_audit_sensitive_coverage_updated_at
  BEFORE UPDATE ON public.pms_audit_sensitive_coverage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
