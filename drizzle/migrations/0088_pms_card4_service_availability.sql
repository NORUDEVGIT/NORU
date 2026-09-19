-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 6:
-- Service Availability.
-- Sequential after 0087. Dual-lane copies live in
--   supabase/migrations/0088_pms_card4_service_availability.sql
--   drizzle/migrations/0088_pms_card4_service_availability.sql
--
-- Configuration only. Weekly windows use property-local HH:mm clock values.
-- Does not create operational requests, pricing, SLA, escalation, or notifications.

CREATE TABLE IF NOT EXISTS public.pms_guest_service_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL,
  weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_service_availability_type_unique UNIQUE (service_type_id),
  CONSTRAINT pms_guest_service_availability_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_guest_service_availability_type_tenant_fk
    FOREIGN KEY (service_type_id, restaurant_id)
    REFERENCES public.pms_guest_service_types(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_guest_service_availability_schedule_object
    CHECK (jsonb_typeof(weekly_schedule) = 'object')
);

CREATE INDEX IF NOT EXISTS pms_guest_service_availability_restaurant_idx
  ON public.pms_guest_service_availability(restaurant_id, active, service_type_id);

COMMENT ON TABLE public.pms_guest_service_availability IS
  'Card 4 weekly availability windows for configured guest service types, interpreted in the property timezone.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_service_availability TO authenticated;
GRANT ALL ON public.pms_guest_service_availability TO service_role;
ALTER TABLE public.pms_guest_service_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service availability" ON public.pms_guest_service_availability;
CREATE POLICY "Members read service availability" ON public.pms_guest_service_availability
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service availability" ON public.pms_guest_service_availability;
CREATE POLICY "Managers insert service availability" ON public.pms_guest_service_availability
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service availability" ON public.pms_guest_service_availability;
CREATE POLICY "Managers update service availability" ON public.pms_guest_service_availability
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service availability" ON public.pms_guest_service_availability;
CREATE POLICY "Managers delete service availability" ON public.pms_guest_service_availability
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_availability_updated_at
  ON public.pms_guest_service_availability;
CREATE TRIGGER set_pms_guest_service_availability_updated_at
  BEFORE UPDATE ON public.pms_guest_service_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
