-- PMS Property Setup Card 4 — Guest & Services,
-- Notifications & Communication Phase 2: Communication Templates.
-- Sequential after 0089. Dual-lane copies live in
--   supabase/migrations/0090_pms_card4_communication_templates.sql
--   drizzle/migrations/0090_pms_card4_communication_templates.sql
--
-- Template configuration only. SET5 notification catalogues stay untouched.

CREATE TABLE IF NOT EXISTS public.pms_communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  category text NOT NULL,
  event_trigger text NOT NULL,
  channel_type text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  subject text NOT NULL,
  message text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  allow_manual_sending boolean NOT NULL DEFAULT false,
  attach_pdf boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_communication_templates_code_unique
    UNIQUE (restaurant_id, code),
  CONSTRAINT pms_communication_templates_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_communication_templates_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_communication_templates_code_check CHECK (
    code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'
  ),
  CONSTRAINT pms_communication_templates_category_check CHECK (
    category IN ('reservation', 'pre_arrival', 'stay', 'departure', 'internal')
  ),
  CONSTRAINT pms_communication_templates_event_check CHECK (
    event_trigger ~ '^[a-z][a-z0-9_]*$' AND length(event_trigger) <= 40
  ),
  CONSTRAINT pms_communication_templates_channel_check CHECK (
    channel_type IN ('email', 'sms', 'whatsapp', 'guest_portal', 'pms_in_app')
  ),
  CONSTRAINT pms_communication_templates_language_check CHECK (
    language ~ '^[a-z]{2}(-[A-Z]{2})?$' AND length(language) <= 8
  ),
  CONSTRAINT pms_communication_templates_subject_check CHECK (
    length(btrim(subject)) BETWEEN 1 AND 200
  ),
  CONSTRAINT pms_communication_templates_message_check CHECK (
    length(btrim(message)) BETWEEN 1 AND 5000
  )
);

CREATE INDEX IF NOT EXISTS pms_communication_templates_restaurant_idx
  ON public.pms_communication_templates(restaurant_id, category, active);

COMMENT ON TABLE public.pms_communication_templates IS
  'Card 4 property communication templates. Not a delivery engine or SET5 catalogue.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_communication_templates TO authenticated;
GRANT ALL ON public.pms_communication_templates TO service_role;
ALTER TABLE public.pms_communication_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read communication templates"
  ON public.pms_communication_templates;
CREATE POLICY "Members read communication templates"
  ON public.pms_communication_templates
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers insert communication templates"
  ON public.pms_communication_templates;
CREATE POLICY "Managers insert communication templates"
  ON public.pms_communication_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers update communication templates"
  ON public.pms_communication_templates;
CREATE POLICY "Managers update communication templates"
  ON public.pms_communication_templates
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Managers delete communication templates"
  ON public.pms_communication_templates;
CREATE POLICY "Managers delete communication templates"
  ON public.pms_communication_templates
  FOR DELETE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_communication_templates_updated_at
  ON public.pms_communication_templates;
CREATE TRIGGER set_pms_communication_templates_updated_at
  BEFORE UPDATE ON public.pms_communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
