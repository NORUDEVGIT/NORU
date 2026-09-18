-- PMS Property Setup Card 6 — Connectivity & Distribution, Phase 1: Integrations.
-- Sequential after 0068. Dual-lane: byte-identical copies live in
--   supabase/migrations/0069_pms_card6_integrations.sql
--   drizzle/migrations/0069_pms_card6_integrations.sql
--
-- Metadata only. NORU has no vault and no per-property secret store, so API
-- keys, client secrets, webhook secrets and passwords are never written here.
-- The config check constraint below is the last line of defence if a future
-- change forgets that rule.
--
-- Deliberately separate from distribution_channels and the room/rate mapping
-- tables. Those stay the operational Direct/OTA distribution model (Phase 2).

-- Check constraints cannot hold subqueries, so the key scan lives in an
-- immutable helper that the constraint calls.
CREATE OR REPLACE FUNCTION public.pms_integration_config_is_safe(_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _config IS NULL THEN true
    WHEN jsonb_typeof(_config) <> 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(_config) AS key
      WHERE key ~* '(secret|password|passwd|api[_-]?key|token|private|credential|passphrase)'
    )
  END
$$;

COMMENT ON FUNCTION public.pms_integration_config_is_safe(jsonb) IS
  'Rejects credential-shaped keys in pms_integrations.config. Phase 1 stores metadata only.';

CREATE TABLE IF NOT EXISTS public.pms_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'not_configured',
  enabled boolean NOT NULL DEFAULT true,
  description text,
  auth_method text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  events text[] NOT NULL DEFAULT ARRAY[]::text[],
  webhook_path text,
  last_test_at timestamptz,
  last_test_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_integrations_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT pms_integrations_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_integrations_description_check CHECK (
    description IS NULL OR length(description) <= 400
  ),
  CONSTRAINT pms_integrations_category_check CHECK (
    category IN ('payments','sms','email','accounting','hospitality','government','other')
  ),
  CONSTRAINT pms_integrations_provider_check CHECK (provider ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT pms_integrations_environment_check CHECK (environment IN ('sandbox','production')),
  CONSTRAINT pms_integrations_status_check CHECK (
    status IN ('connected','pending','not_configured','error','disabled')
  ),
  CONSTRAINT pms_integrations_auth_method_check CHECK (
    auth_method IS NULL OR
    auth_method IN ('api_key','oauth2','basic','bearer_token','certificate','none')
  ),
  CONSTRAINT pms_integrations_test_result_check CHECK (
    last_test_result IS NULL OR last_test_result IN ('passed','failed')
  ),
  CONSTRAINT pms_integrations_config_object_check CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT pms_integrations_config_no_secret_check CHECK (
    public.pms_integration_config_is_safe(config)
  )
);

CREATE INDEX IF NOT EXISTS pms_integrations_restaurant_idx
  ON public.pms_integrations(restaurant_id, category, name);

CREATE TABLE IF NOT EXISTS public.pms_integration_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.pms_integrations(id) ON DELETE SET NULL,
  integration_name text NOT NULL,
  event text NOT NULL,
  detail text,
  simulated boolean NOT NULL DEFAULT false,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_integration_activity_event_check CHECK (
    event IN ('created','updated','enabled','disabled','deleted','test_passed','test_failed')
  ),
  CONSTRAINT pms_integration_activity_detail_check CHECK (
    detail IS NULL OR length(detail) <= 400
  )
);

CREATE INDEX IF NOT EXISTS pms_integration_activity_restaurant_idx
  ON public.pms_integration_activity(restaurant_id, created_at DESC);

COMMENT ON TABLE public.pms_integrations IS
  'Card 6 Phase 1 connector metadata. Credentials are never stored; connection tests are simulated.';
COMMENT ON COLUMN public.pms_integrations.config IS
  'Non-secret field values only, guarded by pms_integrations_config_no_secret_check.';
COMMENT ON COLUMN public.pms_integrations.status IS
  'connected is reserved for a future phase with real handshakes. Phase 1 code never sets it.';
COMMENT ON TABLE public.pms_integration_activity IS
  'Integration history. integration_name is denormalised so the feed survives deletion.';

DROP TRIGGER IF EXISTS set_pms_integrations_updated_at ON public.pms_integrations;
CREATE TRIGGER set_pms_integrations_updated_at
  BEFORE UPDATE ON public.pms_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.pms_integrations, public.pms_integration_activity TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pms_integrations TO authenticated;
GRANT INSERT ON public.pms_integration_activity TO authenticated;
GRANT ALL ON public.pms_integrations, public.pms_integration_activity TO service_role;

ALTER TABLE public.pms_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_integration_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read integrations" ON public.pms_integrations
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write integrations" ON public.pms_integrations
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read integration activity" ON public.pms_integration_activity
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
CREATE POLICY "Managers write integration activity" ON public.pms_integration_activity
  FOR ALL TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
