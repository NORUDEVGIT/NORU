-- Phase 7C: hotel staff roles + per-staff module access

ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;
ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_role_check CHECK (
  role = ANY (ARRAY[
    'owner'::text,
    'manager'::text,
    'kitchen'::text,
    'waiter'::text,
    'housekeeping'::text,
    'receptionist'::text,
    'housekeeper'::text,
    'housekeeping_supervisor'::text,
    'cashier'::text,
    'storekeeper'::text,
    'accountant'::text,
    'maintenance'::text
  ])
);

CREATE TABLE public.staff_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_membership_id UUID REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_module_access_unique UNIQUE (restaurant_id, membership_id, module_key),
  CONSTRAINT staff_module_access_module_key_check CHECK (
    module_key = ANY (ARRAY[
      'food_and_beverage'::text,
      'front_office'::text,
      'housekeeping'::text,
      'pos'::text,
      'inventory'::text,
      'procurement'::text,
      'human_resources'::text,
      'accounting_finance'::text,
      'reports_analytics'::text,
      'configuration'::text,
      'property_settings'::text
    ])
  )
);

CREATE INDEX staff_module_access_membership_idx ON public.staff_module_access (restaurant_id, membership_id);

GRANT SELECT ON public.staff_module_access TO authenticated;
GRANT ALL ON public.staff_module_access TO service_role;

ALTER TABLE public.staff_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers read module access"
ON public.staff_module_access
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_role(restaurant_id, 'owner')
  OR public.has_restaurant_role(restaurant_id, 'manager')
);

CREATE POLICY "Staff read their own module access"
ON public.staff_module_access
FOR SELECT
TO authenticated
USING (
  membership_id IN (
    SELECT ru.id FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid() AND ru.restaurant_id = staff_module_access.restaurant_id AND ru.active
  )
);

CREATE TRIGGER staff_module_access_set_updated_at
BEFORE UPDATE ON public.staff_module_access
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();