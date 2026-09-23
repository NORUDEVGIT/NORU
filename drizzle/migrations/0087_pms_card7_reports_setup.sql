-- PMS Property Setup Card 7 — Reports & Analytics setup schema (Phase 3).
--
-- Sequential after 0086. Dual-lane: byte-identical copies live in
--   supabase/migrations/0087_pms_card7_reports_setup.sql
--   drizzle/migrations/0087_pms_card7_reports_setup.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0087_pms_card7_reports_setup.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_report_permissions;
--   DROP TABLE IF EXISTS public.pms_report_definition_settings;
--   DROP TABLE IF EXISTS public.pms_metric_definition_settings;
--   DROP TABLE IF EXISTS public.pms_report_policies;
--   DROP TABLE IF EXISTS public.pms_report_definitions;
--   DROP TABLE IF EXISTS public.pms_metric_definitions;
--   DROP TABLE IF EXISTS public.pms_report_categories;
--   DELETE FROM public.pms_permissions
--     WHERE code IN (
--       'reports.pms.export',
--       'reports.pms.print',
--       'configuration.reports.configure'
--     );
--
-- Scope fence — this migration explicitly does NOT touch:
--   getRevenueOverview / getBookingsDashboard / live Reports workspace
--   hotel_reservations / hotel_rooms query engines
--   restaurants.pms_reports_catalogue_posture (not dropped)
--   restaurants.pms_reports_schedule_access_posture (not dropped)
--   pms_financial_settings fiscal_year_start_month / fiscal_year_start_day
--   restaurant_users.role / STAFF_ROLES / hotel_role_id
--   public.has_restaurant_role / public.is_restaurant_member
--   staff_module_access
--   report_run / scheduler / cron / email tables (none invented)
--   data-import tables
--   types.ts
--
-- Setup/governance only. Live report execution stays in Reports & Analytics.
-- Occupancy range and in-house stay two metric codes. No formula merge.
-- No types.ts regen. No privileged functions. No scheduler.

-- 0. Catalogue keys for export/configure. Not live authz.
INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
)
VALUES
  ('reports.pms.export', 'reports', 'pms', 'export', 'Export PMS reports', 'Intent to export report packs. Not a CSV/PDF engine.', false, true),
  ('reports.pms.print', 'reports', 'pms', 'print', 'Print PMS reports', 'Intent to print report packs. Not a print pipeline.', false, true),
  ('configuration.reports.configure', 'configuration', 'reports', 'configure', 'Configure reports', 'Save Card 7 report catalogue, metrics and export/schedule defaults.', false, true)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = EXCLUDED.active;

-- 1. Global report categories (SET6 packs).
CREATE TABLE IF NOT EXISTS public.pms_report_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_categories_code_unique UNIQUE (code),
  CONSTRAINT pms_report_categories_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_report_categories_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_report_categories_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

COMMENT ON TABLE public.pms_report_categories IS
  'Card 7 global report packs. Aligns with SET6 REPORT_PACKS. Not a BI cube.';

GRANT SELECT ON public.pms_report_categories TO authenticated;
GRANT ALL ON public.pms_report_categories TO service_role;
ALTER TABLE public.pms_report_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read report categories" ON public.pms_report_categories;
CREATE POLICY "Authenticated read report categories" ON public.pms_report_categories
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_report_categories_updated_at ON public.pms_report_categories;
CREATE TRIGGER set_pms_report_categories_updated_at
  BEFORE UPDATE ON public.pms_report_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_report_categories (code, name, description, active)
VALUES
  ('operational', 'Operational', 'Arrivals, in-house and housekeeping snapshot.', true),
  ('financial', 'Financial', 'Cashiering and folio snapshot.', true),
  ('occupancy', 'Occupancy', 'Point-in-time occupancy from the bookings dashboard.', true),
  ('revenue', 'Revenue', 'Range occupancy, ADR and RevPAR.', true),
  ('management', 'Management', 'Night-audit and management snapshot.', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  active = EXCLUDED.active;

-- 2. Global report definitions (opaque query_key, no SQL payload).
CREATE TABLE IF NOT EXISTS public.pms_report_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.pms_report_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  query_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_definitions_code_unique UNIQUE (code),
  CONSTRAINT pms_report_definitions_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_report_definitions_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_report_definitions_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_report_definitions_query_key_check CHECK (
    query_key IN (
      'getBookingsDashboard',
      'getHousekeepingDashboard',
      'getCashieringDashboard',
      'getRevenueOverview',
      'listNightAuditRuns'
    )
  )
);

COMMENT ON TABLE public.pms_report_definitions IS
  'Card 7 global report registry. query_key names an existing Reports-module function. Not a second query engine.';
COMMENT ON COLUMN public.pms_report_definitions.query_key IS
  'Opaque pointer to an existing server function. Do not store SQL here.';

GRANT SELECT ON public.pms_report_definitions TO authenticated;
GRANT ALL ON public.pms_report_definitions TO service_role;
ALTER TABLE public.pms_report_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read report definitions" ON public.pms_report_definitions;
CREATE POLICY "Authenticated read report definitions" ON public.pms_report_definitions
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_report_definitions_updated_at ON public.pms_report_definitions;
CREATE TRIGGER set_pms_report_definitions_updated_at
  BEFORE UPDATE ON public.pms_report_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_report_definitions (code, category_id, name, description, query_key, active)
SELECT v.code, c.id, v.name, v.description, v.query_key, true
FROM (
  VALUES
    ('operational', 'operational', 'Operational pack', 'Live operational tab.', 'getBookingsDashboard'),
    ('financial', 'financial', 'Financial pack', 'Live financial tab.', 'getCashieringDashboard'),
    ('occupancy', 'occupancy', 'Occupancy pack', 'Live occupancy tab (in-house occupancy).', 'getBookingsDashboard'),
    ('revenue', 'revenue', 'Revenue pack', 'Live revenue tab (range occupancy, ADR, RevPAR).', 'getRevenueOverview'),
    ('management', 'management', 'Management pack', 'Live management tab.', 'listNightAuditRuns')
) AS v(code, category_code, name, description, query_key)
JOIN public.pms_report_categories c ON c.code = v.category_code
ON CONFLICT (code) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  query_key = EXCLUDED.query_key,
  active = EXCLUDED.active;

-- 3. Global metric definitions. Two occupancy codes on purpose.
CREATE TABLE IF NOT EXISTS public.pms_metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  formula_notes text,
  unit text NOT NULL,
  query_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_metric_definitions_code_unique UNIQUE (code),
  CONSTRAINT pms_metric_definitions_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_metric_definitions_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_metric_definitions_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_metric_definitions_formula_notes_check CHECK (
    formula_notes IS NULL OR length(btrim(formula_notes)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_metric_definitions_unit_check CHECK (
    unit IN ('percent', 'amount', 'count')
  ),
  CONSTRAINT pms_metric_definitions_query_key_check CHECK (
    query_key IN (
      'getBookingsDashboard',
      'getHousekeepingDashboard',
      'getCashieringDashboard',
      'getRevenueOverview',
      'listNightAuditRuns'
    )
  )
);

COMMENT ON TABLE public.pms_metric_definitions IS
  'Card 7 global KPI registry. One row per code. occupancy_range and occupancy_in_house stay distinct.';
COMMENT ON COLUMN public.pms_metric_definitions.formula_notes IS
  'Documentation of the live formula. Not executable SQL and not a second engine.';

GRANT SELECT ON public.pms_metric_definitions TO authenticated;
GRANT ALL ON public.pms_metric_definitions TO service_role;
ALTER TABLE public.pms_metric_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read metric definitions" ON public.pms_metric_definitions;
CREATE POLICY "Authenticated read metric definitions" ON public.pms_metric_definitions
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_metric_definitions_updated_at ON public.pms_metric_definitions;
CREATE TRIGGER set_pms_metric_definitions_updated_at
  BEFORE UPDATE ON public.pms_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_metric_definitions (
  code, name, description, formula_notes, unit, query_key, active
)
VALUES
  (
    'occupancy_range',
    'Occupancy (range)',
    'Sold room nights divided by available room nights.',
    'soldNights / availableRoomNights from getRevenueOverview. Do not merge with occupancy_in_house.',
    'percent',
    'getRevenueOverview',
    true
  ),
  (
    'occupancy_in_house',
    'Occupancy (in house)',
    'Stays tonight divided by sellable rooms.',
    'stayingToday / sellableRooms from getBookingsDashboard. Do not merge with occupancy_range.',
    'percent',
    'getBookingsDashboard',
    true
  ),
  (
    'adr',
    'ADR',
    'Average daily rate.',
    'roomRevenue / soldNights from getRevenueOverview.',
    'amount',
    'getRevenueOverview',
    true
  ),
  (
    'revpar',
    'RevPAR',
    'Revenue per available room.',
    'roomRevenue / availableRoomNights from getRevenueOverview.',
    'amount',
    'getRevenueOverview',
    true
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  formula_notes = EXCLUDED.formula_notes,
  unit = EXCLUDED.unit,
  query_key = EXCLUDED.query_key,
  active = EXCLUDED.active;

-- 4. Tenant report definition enablement.
CREATE TABLE IF NOT EXISTS public.pms_report_definition_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.pms_report_definitions(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_definition_settings_unique UNIQUE (restaurant_id, definition_id),
  CONSTRAINT pms_report_definition_settings_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_report_definition_settings_restaurant_idx
  ON public.pms_report_definition_settings(restaurant_id, definition_id);

COMMENT ON TABLE public.pms_report_definition_settings IS
  'Card 7 tenant enablement of global report definitions. Does not hide live Reports tabs in 0087.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_report_definition_settings TO authenticated;
GRANT ALL ON public.pms_report_definition_settings TO service_role;
ALTER TABLE public.pms_report_definition_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read report definition settings" ON public.pms_report_definition_settings;
CREATE POLICY "Members read report definition settings" ON public.pms_report_definition_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert report definition settings" ON public.pms_report_definition_settings;
CREATE POLICY "Managers insert report definition settings" ON public.pms_report_definition_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update report definition settings" ON public.pms_report_definition_settings;
CREATE POLICY "Managers update report definition settings" ON public.pms_report_definition_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete report definition settings" ON public.pms_report_definition_settings;
CREATE POLICY "Managers delete report definition settings" ON public.pms_report_definition_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_report_definition_settings_updated_at ON public.pms_report_definition_settings;
CREATE TRIGGER set_pms_report_definition_settings_updated_at
  BEFORE UPDATE ON public.pms_report_definition_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_report_definition_settings (restaurant_id, definition_id, enabled)
SELECT
  r.id,
  d.id,
  CASE
    WHEN jsonb_typeof(
      COALESCE(r.pms_reports_catalogue_posture, '{}'::jsonb) -> 'packs' -> d.code
    ) = 'boolean'
      THEN (r.pms_reports_catalogue_posture -> 'packs' ->> d.code)::boolean
    ELSE true
  END
FROM public.restaurants r
CROSS JOIN public.pms_report_definitions d
ON CONFLICT (restaurant_id, definition_id) DO NOTHING;

-- 5. Tenant metric enablement / label. No alternate formula.
CREATE TABLE IF NOT EXISTS public.pms_metric_definition_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  metric_id uuid NOT NULL REFERENCES public.pms_metric_definitions(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_metric_definition_settings_unique UNIQUE (restaurant_id, metric_id),
  CONSTRAINT pms_metric_definition_settings_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_metric_definition_settings_display_name_check CHECK (
    display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS pms_metric_definition_settings_restaurant_idx
  ON public.pms_metric_definition_settings(restaurant_id, metric_id);

COMMENT ON TABLE public.pms_metric_definition_settings IS
  'Card 7 tenant metric enablement. display_name is a label. Formula stays on pms_metric_definitions.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_metric_definition_settings TO authenticated;
GRANT ALL ON public.pms_metric_definition_settings TO service_role;
ALTER TABLE public.pms_metric_definition_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read metric definition settings" ON public.pms_metric_definition_settings;
CREATE POLICY "Members read metric definition settings" ON public.pms_metric_definition_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert metric definition settings" ON public.pms_metric_definition_settings;
CREATE POLICY "Managers insert metric definition settings" ON public.pms_metric_definition_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update metric definition settings" ON public.pms_metric_definition_settings;
CREATE POLICY "Managers update metric definition settings" ON public.pms_metric_definition_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete metric definition settings" ON public.pms_metric_definition_settings;
CREATE POLICY "Managers delete metric definition settings" ON public.pms_metric_definition_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_metric_definition_settings_updated_at ON public.pms_metric_definition_settings;
CREATE TRIGGER set_pms_metric_definition_settings_updated_at
  BEFORE UPDATE ON public.pms_metric_definition_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Tenant report-to-permission mappings (configuration, not live authz).
CREATE TABLE IF NOT EXISTS public.pms_report_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.pms_report_definitions(id) ON DELETE RESTRICT,
  permission_id uuid NOT NULL REFERENCES public.pms_permissions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_permissions_unique UNIQUE (restaurant_id, definition_id, permission_id),
  CONSTRAINT pms_report_permissions_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_report_permissions_restaurant_idx
  ON public.pms_report_permissions(restaurant_id, definition_id);

COMMENT ON TABLE public.pms_report_permissions IS
  'Card 7 mapping of report definitions to pms_permissions. Not STAFF_ROLES and not live RLS.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_report_permissions TO authenticated;
GRANT ALL ON public.pms_report_permissions TO service_role;
ALTER TABLE public.pms_report_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read report permissions" ON public.pms_report_permissions;
CREATE POLICY "Members read report permissions" ON public.pms_report_permissions
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert report permissions" ON public.pms_report_permissions;
CREATE POLICY "Managers insert report permissions" ON public.pms_report_permissions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update report permissions" ON public.pms_report_permissions;
CREATE POLICY "Managers update report permissions" ON public.pms_report_permissions
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete report permissions" ON public.pms_report_permissions;
CREATE POLICY "Managers delete report permissions" ON public.pms_report_permissions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_report_permissions_updated_at ON public.pms_report_permissions;
CREATE TRIGGER set_pms_report_permissions_updated_at
  BEFORE UPDATE ON public.pms_report_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Tenant export / filter / schedule defaults. Not a runner.
CREATE TABLE IF NOT EXISTS public.pms_report_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  export_allowed boolean NOT NULL DEFAULT false,
  export_csv boolean NOT NULL DEFAULT false,
  export_pdf boolean NOT NULL DEFAULT false,
  mask_guest_names boolean NOT NULL DEFAULT true,
  owner_manager_export_only boolean NOT NULL DEFAULT true,
  default_date_range_days integer NOT NULL DEFAULT 30,
  schedule_intent_enabled boolean NOT NULL DEFAULT false,
  schedule_cadence text,
  period_basis text NOT NULL DEFAULT 'business_date',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_report_policies_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_report_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_report_policies_range_check CHECK (
    default_date_range_days BETWEEN 1 AND 365
  ),
  CONSTRAINT pms_report_policies_cadence_check CHECK (
    schedule_cadence IS NULL OR schedule_cadence IN ('daily', 'weekly', 'monthly')
  ),
  CONSTRAINT pms_report_policies_period_check CHECK (
    period_basis IN ('business_date', 'fiscal_year')
  )
);

CREATE INDEX IF NOT EXISTS pms_report_policies_restaurant_idx
  ON public.pms_report_policies(restaurant_id);

COMMENT ON TABLE public.pms_report_policies IS
  'Card 7 tenant report defaults. Not a CSV generator, scheduler, or fiscal-year table. SET6 JSON is not dropped.';
COMMENT ON COLUMN public.pms_report_policies.schedule_intent_enabled IS
  'SET6 scheduleEnabled carry. Does not enqueue email or cron.';
COMMENT ON COLUMN public.pms_report_policies.period_basis IS
  'business_date uses Card 1 calendar; fiscal_year references Card 3 pms_financial_settings. Live queries are unchanged in 0087.';
COMMENT ON COLUMN public.pms_report_policies.owner_manager_export_only IS
  'SET6 ownerManagerAccessOnly carry. Not enforced on getRevenueOverview in 0087.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_report_policies TO authenticated;
GRANT ALL ON public.pms_report_policies TO service_role;
ALTER TABLE public.pms_report_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read report policies" ON public.pms_report_policies;
CREATE POLICY "Members read report policies" ON public.pms_report_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert report policies" ON public.pms_report_policies;
CREATE POLICY "Managers insert report policies" ON public.pms_report_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update report policies" ON public.pms_report_policies;
CREATE POLICY "Managers update report policies" ON public.pms_report_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete report policies" ON public.pms_report_policies;
CREATE POLICY "Managers delete report policies" ON public.pms_report_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_report_policies_updated_at ON public.pms_report_policies;
CREATE TRIGGER set_pms_report_policies_updated_at
  BEFORE UPDATE ON public.pms_report_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_report_policies (
  restaurant_id,
  export_allowed,
  export_csv,
  export_pdf,
  mask_guest_names,
  owner_manager_export_only,
  default_date_range_days,
  schedule_intent_enabled,
  period_basis,
  active
)
SELECT
  r.id,
  false,
  false,
  false,
  true,
  COALESCE(
    (r.pms_reports_schedule_access_posture ->> 'ownerManagerAccessOnly')::boolean,
    true
  ),
  30,
  COALESCE(
    (r.pms_reports_schedule_access_posture ->> 'scheduleEnabled')::boolean,
    false
  ),
  'business_date',
  true
FROM public.restaurants r
ON CONFLICT (restaurant_id) DO NOTHING;
