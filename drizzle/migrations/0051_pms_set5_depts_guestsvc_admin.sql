-- PMS-SET5 — Departments, guest request types, notifications, admin and security (Issue #77).
--
-- Sequential after 0050. Dual-lane with
--   supabase/migrations/0051_pms_set5_depts_guestsvc_admin.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No sample departments, request types, templates or connectors.
-- RLS on new tables matches rooms: members read; owner/manager write.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0051_pms_set5_depts_guestsvc_admin.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS pms_routing_defaults,
--     DROP COLUMN IF EXISTS pms_notification_channels,
--     DROP COLUMN IF EXISTS pms_notification_event_rules,
--     DROP COLUMN IF EXISTS pms_admin_controls,
--     DROP COLUMN IF EXISTS pms_session_access_posture,
--     DROP COLUMN IF EXISTS pms_audit_retention_posture;
--   DROP TABLE IF EXISTS public.pms_notification_templates;
--   DROP TABLE IF EXISTS public.pms_guest_request_types;
--   DROP TABLE IF EXISTS public.pms_work_centers;
--   DROP TABLE IF EXISTS public.pms_departments;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pms_routing_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_notification_channels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_notification_event_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_admin_controls jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_session_access_posture jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_audit_retention_posture jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.restaurants.pms_routing_defaults IS
  'PMS-SET5 default department routing for posting. Empty is a Warning, not a go-live block.';
COMMENT ON COLUMN public.restaurants.pms_notification_channels IS
  'PMS-SET5 email/SMS/in-app channel posture. WhatsApp stays future/disabled. Draft until savedAt.';
COMMENT ON COLUMN public.restaurants.pms_notification_event_rules IS
  'PMS-SET5 thin event-to-channel rules. Not an ESP and not a send queue.';
COMMENT ON COLUMN public.restaurants.pms_admin_controls IS
  'PMS-SET5 thin numbering, approvals and override. Not a second StaffManager.';
COMMENT ON COLUMN public.restaurants.pms_session_access_posture IS
  'PMS-SET5 session idle and re-auth posture. Not IAM.';
COMMENT ON COLUMN public.restaurants.pms_audit_retention_posture IS
  'PMS-SET5 audit retention and thin sensitive-data flags aligned with SET3 guest ID. Not a Guest Profile rebuild.';

GRANT SELECT (
  pms_routing_defaults,
  pms_notification_channels,
  pms_notification_event_rules,
  pms_admin_controls,
  pms_session_access_posture,
  pms_audit_retention_posture
) ON public.restaurants TO authenticated;

CREATE TABLE IF NOT EXISTS public.pms_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_departments_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_departments_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_departments_restaurant_idx
  ON public.pms_departments(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_departments TO authenticated;
GRANT ALL ON public.pms_departments TO service_role;
ALTER TABLE public.pms_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read departments" ON public.pms_departments;
CREATE POLICY "Members read departments" ON public.pms_departments
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert departments" ON public.pms_departments;
CREATE POLICY "Managers insert departments" ON public.pms_departments
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update departments" ON public.pms_departments;
CREATE POLICY "Managers update departments" ON public.pms_departments
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete departments" ON public.pms_departments;
CREATE POLICY "Managers delete departments" ON public.pms_departments
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_departments_updated_at ON public.pms_departments;
CREATE TRIGGER set_pms_departments_updated_at BEFORE UPDATE ON public.pms_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_work_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.pms_departments(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_work_centers_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_work_centers_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_work_centers_restaurant_idx
  ON public.pms_work_centers(restaurant_id);
CREATE INDEX IF NOT EXISTS pms_work_centers_department_idx
  ON public.pms_work_centers(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_work_centers TO authenticated;
GRANT ALL ON public.pms_work_centers TO service_role;
ALTER TABLE public.pms_work_centers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read work centres" ON public.pms_work_centers;
CREATE POLICY "Members read work centres" ON public.pms_work_centers
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert work centres" ON public.pms_work_centers;
CREATE POLICY "Managers insert work centres" ON public.pms_work_centers
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update work centres" ON public.pms_work_centers;
CREATE POLICY "Managers update work centres" ON public.pms_work_centers
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete work centres" ON public.pms_work_centers;
CREATE POLICY "Managers delete work centres" ON public.pms_work_centers
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_work_centers_updated_at ON public.pms_work_centers;
CREATE TRIGGER set_pms_work_centers_updated_at BEFORE UPDATE ON public.pms_work_centers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_guest_request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.pms_departments(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_guest_request_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_guest_request_types_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_guest_request_types_restaurant_idx
  ON public.pms_guest_request_types(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_request_types TO authenticated;
GRANT ALL ON public.pms_guest_request_types TO service_role;
ALTER TABLE public.pms_guest_request_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read guest request types" ON public.pms_guest_request_types;
CREATE POLICY "Members read guest request types" ON public.pms_guest_request_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert guest request types" ON public.pms_guest_request_types;
CREATE POLICY "Managers insert guest request types" ON public.pms_guest_request_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest request types" ON public.pms_guest_request_types;
CREATE POLICY "Managers update guest request types" ON public.pms_guest_request_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest request types" ON public.pms_guest_request_types;
CREATE POLICY "Managers delete guest request types" ON public.pms_guest_request_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_request_types_updated_at ON public.pms_guest_request_types;
CREATE TRIGGER set_pms_guest_request_types_updated_at BEFORE UPDATE ON public.pms_guest_request_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  channel text NOT NULL,
  body text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_notification_templates_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_notification_templates_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_notification_templates_channel_check CHECK (channel IN ('email', 'sms', 'in_app'))
);

CREATE INDEX IF NOT EXISTS pms_notification_templates_restaurant_idx
  ON public.pms_notification_templates(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_notification_templates TO authenticated;
GRANT ALL ON public.pms_notification_templates TO service_role;
ALTER TABLE public.pms_notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read notification templates" ON public.pms_notification_templates;
CREATE POLICY "Members read notification templates" ON public.pms_notification_templates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert notification templates" ON public.pms_notification_templates;
CREATE POLICY "Managers insert notification templates" ON public.pms_notification_templates
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update notification templates" ON public.pms_notification_templates;
CREATE POLICY "Managers update notification templates" ON public.pms_notification_templates
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete notification templates" ON public.pms_notification_templates;
CREATE POLICY "Managers delete notification templates" ON public.pms_notification_templates
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_notification_templates_updated_at ON public.pms_notification_templates;
CREATE TRIGGER set_pms_notification_templates_updated_at BEFORE UPDATE ON public.pms_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_departments IS
  'PMS-SET5 department catalogue. Empty is a Warning, not a go-live block. No sample seed.';
COMMENT ON TABLE public.pms_work_centers IS
  'PMS-SET5 work-centre catalogue under a department. Empty is a Warning.';
COMMENT ON TABLE public.pms_guest_request_types IS
  'PMS-SET5 guest-services request-type catalogue only. Empty is a Warning.';
COMMENT ON TABLE public.pms_notification_templates IS
  'PMS-SET5 email/SMS/in-app templates. Not an ESP. WhatsApp is not a live channel.';
