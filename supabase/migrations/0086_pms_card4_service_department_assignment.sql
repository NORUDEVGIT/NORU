-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 4:
-- Department Assignment.
-- Sequential after 0085. Dual-lane copies live in
--   supabase/migrations/0086_pms_card4_service_department_assignment.sql
--   drizzle/migrations/0086_pms_card4_service_department_assignment.sql
--
-- Configuration only. Reuses existing pms_departments.
-- Does not create departments, SLA rules, availability, or operational requests.

CREATE TABLE IF NOT EXISTS public.pms_guest_service_department_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL,
  department_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_service_dept_assign_pair_unique UNIQUE (service_type_id, department_id),
  CONSTRAINT pms_guest_service_dept_assign_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_guest_service_dept_assign_type_tenant_fk
    FOREIGN KEY (service_type_id, restaurant_id)
    REFERENCES public.pms_guest_service_types(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_guest_service_dept_assign_dept_tenant_fk
    FOREIGN KEY (department_id, restaurant_id)
    REFERENCES public.pms_departments(id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_guest_service_dept_assign_restaurant_idx
  ON public.pms_guest_service_department_assignments(
    restaurant_id,
    active,
    service_type_id,
    department_id
  );

COMMENT ON TABLE public.pms_guest_service_department_assignments IS
  'Card 4 department responsibility for configured guest service types. Not SET5 request types or operational routing.';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pms_guest_service_department_assignments TO authenticated;
GRANT ALL ON public.pms_guest_service_department_assignments TO service_role;
ALTER TABLE public.pms_guest_service_department_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service department assignments"
  ON public.pms_guest_service_department_assignments;
CREATE POLICY "Members read service department assignments"
  ON public.pms_guest_service_department_assignments
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service department assignments"
  ON public.pms_guest_service_department_assignments;
CREATE POLICY "Managers insert service department assignments"
  ON public.pms_guest_service_department_assignments
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service department assignments"
  ON public.pms_guest_service_department_assignments;
CREATE POLICY "Managers update service department assignments"
  ON public.pms_guest_service_department_assignments
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service department assignments"
  ON public.pms_guest_service_department_assignments;
CREATE POLICY "Managers delete service department assignments"
  ON public.pms_guest_service_department_assignments
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_dept_assign_updated_at
  ON public.pms_guest_service_department_assignments;
CREATE TRIGGER set_pms_guest_service_dept_assign_updated_at
  BEFORE UPDATE ON public.pms_guest_service_department_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
