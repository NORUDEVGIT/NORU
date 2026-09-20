-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 4: Automation Rules.
-- Sequential after 0091. Dual-lane copies live in
--   supabase/migrations/0092_pms_card4_automation_rules.sql
--   drizzle/migrations/0092_pms_card4_automation_rules.sql
--
-- Rule configuration only. SET5 catalogues and delivery stay untouched.

CREATE TABLE IF NOT EXISTS public.pms_communication_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_id uuid NOT NULL,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  channel_type text NOT NULL DEFAULT 'email',
  template_id uuid,
  schedule jsonb NOT NULL DEFAULT '{"mode":"immediate"}'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_communication_automation_rules_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_automation_rules_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_communication_automation_rules_channel_check CHECK (
    channel_type IN ('email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app')
  ),
  CONSTRAINT pms_communication_automation_rules_conditions_check CHECK (
    jsonb_typeof(conditions) = 'array'
  ),
  CONSTRAINT pms_communication_automation_rules_recipients_check CHECK (
    jsonb_typeof(recipients) = 'array'
  ),
  CONSTRAINT pms_communication_automation_rules_schedule_check CHECK (
    jsonb_typeof(schedule) = 'object'
  ),
  CONSTRAINT pms_communication_automation_rules_event_tenant_fk
    FOREIGN KEY (event_id, restaurant_id)
    REFERENCES public.pms_communication_notification_events(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_communication_automation_rules_template_tenant_fk
    FOREIGN KEY (template_id, restaurant_id)
    REFERENCES public.pms_communication_templates(id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_communication_automation_rules_restaurant_idx
  ON public.pms_communication_automation_rules(restaurant_id, event_id, active);

COMMENT ON TABLE public.pms_communication_automation_rules IS
  'Card 4 property automation-rule configuration. Not a delivery engine or SET5 catalogue.';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pms_communication_automation_rules TO authenticated;
GRANT ALL ON public.pms_communication_automation_rules TO service_role;
ALTER TABLE public.pms_communication_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication automation rules"
  ON public.pms_communication_automation_rules;
CREATE POLICY "Members read communication automation rules"
  ON public.pms_communication_automation_rules
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication automation rules"
  ON public.pms_communication_automation_rules;
CREATE POLICY "Managers insert communication automation rules"
  ON public.pms_communication_automation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication automation rules"
  ON public.pms_communication_automation_rules;
CREATE POLICY "Managers update communication automation rules"
  ON public.pms_communication_automation_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication automation rules"
  ON public.pms_communication_automation_rules;
CREATE POLICY "Managers delete communication automation rules"
  ON public.pms_communication_automation_rules
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_automation_rules_updated_at
  ON public.pms_communication_automation_rules;
CREATE TRIGGER set_pms_communication_automation_rules_updated_at
  BEFORE UPDATE ON public.pms_communication_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
