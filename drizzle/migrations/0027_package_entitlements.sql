CREATE TABLE public.restaurant_package_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_package_entitlements_unique UNIQUE (restaurant_id, package_key),
  CONSTRAINT restaurant_package_entitlements_key_check CHECK (
    package_key = ANY (ARRAY[
      'restaurant_management'::text,
      'pms'::text,
      'pos'::text,
      'back_office'::text
    ])
  )
);

CREATE INDEX restaurant_package_entitlements_restaurant_idx
  ON public.restaurant_package_entitlements (restaurant_id);

GRANT SELECT ON public.restaurant_package_entitlements TO authenticated;
GRANT ALL ON public.restaurant_package_entitlements TO service_role;

ALTER TABLE public.restaurant_package_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own property package entitlements"
ON public.restaurant_package_entitlements
FOR SELECT
TO authenticated
USING (public.is_restaurant_member(restaurant_id));