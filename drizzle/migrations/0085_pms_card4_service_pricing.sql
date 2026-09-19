-- PMS Property Setup Card 4 — Guest & Services, Guest Service Types Phase 3:
-- Service Pricing.
-- Sequential after 0084. Dual-lane copies live in
--   supabase/migrations/0085_pms_card4_service_pricing.sql
--   drizzle/migrations/0085_pms_card4_service_pricing.sql
--
-- Configuration only. Does not create operational guest-service charges,
-- tax rules, department assignments, SLA rules, or availability schedules.

ALTER TABLE public.pms_guest_service_types
  ADD CONSTRAINT pms_guest_service_types_id_restaurant_unique
  UNIQUE (id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.pms_guest_service_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency_code text NOT NULL,
  pricing_unit text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT pms_guest_service_pricing_service_type_unique UNIQUE (service_type_id),
  CONSTRAINT pms_guest_service_pricing_service_type_tenant_fk
    FOREIGN KEY (service_type_id, restaurant_id)
    REFERENCES public.pms_guest_service_types(id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_guest_service_pricing_amount_nonnegative CHECK (amount >= 0),
  CONSTRAINT pms_guest_service_pricing_currency_format CHECK (
    currency_code = upper(currency_code) AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT pms_guest_service_pricing_unit_check CHECK (
    pricing_unit IN ('per_service', 'per_person', 'per_room', 'per_night', 'per_item')
  )
);

CREATE INDEX IF NOT EXISTS pms_guest_service_pricing_restaurant_idx
  ON public.pms_guest_service_pricing(restaurant_id, active, service_type_id);

COMMENT ON TABLE public.pms_guest_service_pricing IS
  'Card 4 pricing for configured guest service types. Not operational charges or invoices.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_guest_service_pricing TO authenticated;
GRANT ALL ON public.pms_guest_service_pricing TO service_role;
ALTER TABLE public.pms_guest_service_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read service pricing" ON public.pms_guest_service_pricing;
CREATE POLICY "Members read service pricing" ON public.pms_guest_service_pricing
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert service pricing" ON public.pms_guest_service_pricing;
CREATE POLICY "Managers insert service pricing" ON public.pms_guest_service_pricing
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update service pricing" ON public.pms_guest_service_pricing;
CREATE POLICY "Managers update service pricing" ON public.pms_guest_service_pricing
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete service pricing" ON public.pms_guest_service_pricing;
CREATE POLICY "Managers delete service pricing" ON public.pms_guest_service_pricing
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR
    public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_guest_service_pricing_updated_at
  ON public.pms_guest_service_pricing;
CREATE TRIGGER set_pms_guest_service_pricing_updated_at
  BEFORE UPDATE ON public.pms_guest_service_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
