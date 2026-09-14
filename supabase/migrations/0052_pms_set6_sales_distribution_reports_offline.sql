-- PMS-SET6 — Sales catalogues, distribution / reports / offline posture (Issue #80).
--
-- Sequential after 0051. Dual-lane with
--   supabase/migrations/0052_pms_set6_sales_distribution_reports_offline.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No sample market segments, source codes, event types or connectors.
-- RLS on new tables matches rooms: members read; owner/manager write.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — Abel authorized 2026-09-14. Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0052_pms_set6_sales_distribution_reports_offline.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS pms_distribution_channel_posture,
--     DROP COLUMN IF EXISTS pms_distribution_mapping_posture,
--     DROP COLUMN IF EXISTS pms_reports_catalogue_posture,
--     DROP COLUMN IF EXISTS pms_reports_schedule_access_posture,
--     DROP COLUMN IF EXISTS pms_offline_enablement_posture,
--     DROP COLUMN IF EXISTS pms_offline_sync_posture;
--   DROP TABLE IF EXISTS public.pms_function_space_labels;
--   DROP TABLE IF EXISTS public.pms_event_types;
--   DROP TABLE IF EXISTS public.pms_account_type_labels;
--   DROP TABLE IF EXISTS public.pms_sales_channel_labels;
--   DROP TABLE IF EXISTS public.pms_source_codes;
--   DROP TABLE IF EXISTS public.pms_market_segments;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pms_distribution_channel_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_distribution_mapping_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_reports_catalogue_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_reports_schedule_access_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_offline_enablement_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_offline_sync_posture jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurants.pms_distribution_channel_posture IS
  'PMS-SET6 thin channel-class open/close/stop-sell posture. Direct is Live honesty; OTA is never fake Connected. Draft until savedAt.';
COMMENT ON COLUMN public.restaurants.pms_distribution_mapping_posture IS
  'PMS-SET6 mapping-completeness expectations only. Not a live channel-manager or OTA sync.';
COMMENT ON COLUMN public.restaurants.pms_reports_catalogue_posture IS
  'PMS-SET6 report-pack catalogue aligned with Live Operational / Financial / Occupancy / Revenue / Management tabs. Not a BI rebuild. Draft until savedAt.';
COMMENT ON COLUMN public.restaurants.pms_reports_schedule_access_posture IS
  'PMS-SET6 schedule and access posture only. Not a report runner or BI scheduler.';
COMMENT ON COLUMN public.restaurants.pms_offline_enablement_posture IS
  'PMS-SET6 FO/PMS offline intent flags only. Saving does not ship a runtime and must never read Offline Ready.';
COMMENT ON COLUMN public.restaurants.pms_offline_sync_posture IS
  'PMS-SET6 sync / conflict-label posture. Text only — not an offline/PWA stack.';

GRANT SELECT (
  pms_distribution_channel_posture,
  pms_distribution_mapping_posture,
  pms_reports_catalogue_posture,
  pms_reports_schedule_access_posture,
  pms_offline_enablement_posture,
  pms_offline_sync_posture
) ON public.restaurants TO authenticated;

CREATE TABLE IF NOT EXISTS public.pms_market_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_market_segments_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_market_segments_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_market_segments_restaurant_idx
  ON public.pms_market_segments(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_market_segments TO authenticated;
GRANT ALL ON public.pms_market_segments TO service_role;
ALTER TABLE public.pms_market_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read market segments" ON public.pms_market_segments;
CREATE POLICY "Members read market segments" ON public.pms_market_segments
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert market segments" ON public.pms_market_segments;
CREATE POLICY "Managers insert market segments" ON public.pms_market_segments
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update market segments" ON public.pms_market_segments;
CREATE POLICY "Managers update market segments" ON public.pms_market_segments
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete market segments" ON public.pms_market_segments;
CREATE POLICY "Managers delete market segments" ON public.pms_market_segments
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_market_segments_updated_at ON public.pms_market_segments;
CREATE TRIGGER set_pms_market_segments_updated_at BEFORE UPDATE ON public.pms_market_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_market_segments IS
  'PMS-SET6 market-segment catalogue. Empty is a Warning, not a go-live block. No sample seed.';

CREATE TABLE IF NOT EXISTS public.pms_source_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_source_codes_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_source_codes_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_source_codes_restaurant_idx
  ON public.pms_source_codes(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_source_codes TO authenticated;
GRANT ALL ON public.pms_source_codes TO service_role;
ALTER TABLE public.pms_source_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read source codes" ON public.pms_source_codes;
CREATE POLICY "Members read source codes" ON public.pms_source_codes
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert source codes" ON public.pms_source_codes;
CREATE POLICY "Managers insert source codes" ON public.pms_source_codes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update source codes" ON public.pms_source_codes;
CREATE POLICY "Managers update source codes" ON public.pms_source_codes
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete source codes" ON public.pms_source_codes;
CREATE POLICY "Managers delete source codes" ON public.pms_source_codes
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_source_codes_updated_at ON public.pms_source_codes;
CREATE TRIGGER set_pms_source_codes_updated_at BEFORE UPDATE ON public.pms_source_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_source_codes IS
  'PMS-SET6 source-code catalogue. Empty is a Warning, not a go-live block. No sample seed.';

CREATE TABLE IF NOT EXISTS public.pms_sales_channel_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_sales_channel_labels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_sales_channel_labels_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_sales_channel_labels_restaurant_idx
  ON public.pms_sales_channel_labels(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_sales_channel_labels TO authenticated;
GRANT ALL ON public.pms_sales_channel_labels TO service_role;
ALTER TABLE public.pms_sales_channel_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read sales channel labels" ON public.pms_sales_channel_labels;
CREATE POLICY "Members read sales channel labels" ON public.pms_sales_channel_labels
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert sales channel labels" ON public.pms_sales_channel_labels;
CREATE POLICY "Managers insert sales channel labels" ON public.pms_sales_channel_labels
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update sales channel labels" ON public.pms_sales_channel_labels;
CREATE POLICY "Managers update sales channel labels" ON public.pms_sales_channel_labels
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete sales channel labels" ON public.pms_sales_channel_labels;
CREATE POLICY "Managers delete sales channel labels" ON public.pms_sales_channel_labels
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_sales_channel_labels_updated_at ON public.pms_sales_channel_labels;
CREATE TRIGGER set_pms_sales_channel_labels_updated_at BEFORE UPDATE ON public.pms_sales_channel_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_sales_channel_labels IS
  'PMS-SET6 optional sales-channel labels. Empty is a Warning.';

CREATE TABLE IF NOT EXISTS public.pms_account_type_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_account_type_labels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_account_type_labels_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_account_type_labels_restaurant_idx
  ON public.pms_account_type_labels(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_account_type_labels TO authenticated;
GRANT ALL ON public.pms_account_type_labels TO service_role;
ALTER TABLE public.pms_account_type_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read account type labels" ON public.pms_account_type_labels;
CREATE POLICY "Members read account type labels" ON public.pms_account_type_labels
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert account type labels" ON public.pms_account_type_labels;
CREATE POLICY "Managers insert account type labels" ON public.pms_account_type_labels
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update account type labels" ON public.pms_account_type_labels;
CREATE POLICY "Managers update account type labels" ON public.pms_account_type_labels
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete account type labels" ON public.pms_account_type_labels;
CREATE POLICY "Managers delete account type labels" ON public.pms_account_type_labels
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_account_type_labels_updated_at ON public.pms_account_type_labels;
CREATE TRIGGER set_pms_account_type_labels_updated_at BEFORE UPDATE ON public.pms_account_type_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_account_type_labels IS
  'PMS-SET6 optional account-type labels. Empty is a Warning. Not a sales CRM.';

CREATE TABLE IF NOT EXISTS public.pms_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_event_types_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_event_types_restaurant_idx
  ON public.pms_event_types(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_event_types TO authenticated;
GRANT ALL ON public.pms_event_types TO service_role;
ALTER TABLE public.pms_event_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read event types" ON public.pms_event_types;
CREATE POLICY "Members read event types" ON public.pms_event_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event types" ON public.pms_event_types;
CREATE POLICY "Managers insert event types" ON public.pms_event_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event types" ON public.pms_event_types;
CREATE POLICY "Managers update event types" ON public.pms_event_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event types" ON public.pms_event_types;
CREATE POLICY "Managers delete event types" ON public.pms_event_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_event_types_updated_at ON public.pms_event_types;
CREATE TRIGGER set_pms_event_types_updated_at BEFORE UPDATE ON public.pms_event_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_event_types IS
  'PMS-SET6 event-type catalogue. Empty is a Warning, not a go-live block. No sample seed.';

CREATE TABLE IF NOT EXISTS public.pms_function_space_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_function_space_labels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_function_space_labels_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_function_space_labels_restaurant_idx
  ON public.pms_function_space_labels(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_function_space_labels TO authenticated;
GRANT ALL ON public.pms_function_space_labels TO service_role;
ALTER TABLE public.pms_function_space_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read function space labels" ON public.pms_function_space_labels;
CREATE POLICY "Members read function space labels" ON public.pms_function_space_labels
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert function space labels" ON public.pms_function_space_labels;
CREATE POLICY "Managers insert function space labels" ON public.pms_function_space_labels
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update function space labels" ON public.pms_function_space_labels;
CREATE POLICY "Managers update function space labels" ON public.pms_function_space_labels
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete function space labels" ON public.pms_function_space_labels;
CREATE POLICY "Managers delete function space labels" ON public.pms_function_space_labels
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_function_space_labels_updated_at ON public.pms_function_space_labels;
CREATE TRIGGER set_pms_function_space_labels_updated_at BEFORE UPDATE ON public.pms_function_space_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_function_space_labels IS
  'PMS-SET6 optional function-space labels. Empty is a Warning.';
