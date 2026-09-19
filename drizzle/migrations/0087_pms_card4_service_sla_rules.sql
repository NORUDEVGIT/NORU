-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 5:
-- SLA Rules.
-- Sequential after 0086. Dual-lane copies live in
--   supabase/migrations/0087_pms_card4_service_sla_rules.sql
--   drizzle/migrations/0087_pms_card4_service_sla_rules.sql
--
-- Configuration only. Durations are integer minutes, not timestamps.
-- Does not create availability, escalation, notification, or operational tracking.

CREATE TABLE IF NOT EXISTS public.pms_guest_service_sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL,
  response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_service_sla_service_type_unique UNIQUE (service_type_id),
  CONSTRAINT pms_guest_service_sla_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_guest_service_sla_type_tenant_fk
    FOREIGN KEY (service_type_id, restaurant_id)
    REFERENCES public.pms_guest_service_types(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_guest_service_sla_response_positive CHECK (response_minutes >= 1),
  CONSTRAINT pms_guest_service_sla_resolution_positive CHECK (resolution_minutes >= 1)
);

CREATE INDEX IF NOT EXISTS pms_guest_service_sla_restaurant_idx
  ON public.pms_guest_service_sla_rules(restaurant_id, active, service_type_id);

COMMENT ON TABLE public.pms_guest_service_sla_rules IS
  'Card 4 response and resolution targets for configured guest service types. Durations are integer minutes.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_service_sla_rules TO authenticated;
GRANT ALL ON public.pms_guest_service_sla_rules TO service_role;
ALTER TABLE public.pms_guest_service_sla_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service SLA rules" ON public.pms_guest_service_sla_rules;
CREATE POLICY "Members read service SLA rules" ON public.pms_guest_service_sla_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service SLA rules" ON public.pms_guest_service_sla_rules;
CREATE POLICY "Managers insert service SLA rules" ON public.pms_guest_service_sla_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service SLA rules" ON public.pms_guest_service_sla_rules;
CREATE POLICY "Managers update service SLA rules" ON public.pms_guest_service_sla_rules
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service SLA rules" ON public.pms_guest_service_sla_rules;
CREATE POLICY "Managers delete service SLA rules" ON public.pms_guest_service_sla_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_sla_updated_at
  ON public.pms_guest_service_sla_rules;
CREATE TRIGGER set_pms_guest_service_sla_updated_at
  BEFORE UPDATE ON public.pms_guest_service_sla_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
