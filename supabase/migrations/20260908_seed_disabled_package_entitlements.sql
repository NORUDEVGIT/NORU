-- New restaurants always receive four explicit disabled commercial packages.
-- Legacy properties with zero entitlement rows are not backfilled.

CREATE OR REPLACE FUNCTION public.seed_restaurant_package_entitlements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.restaurant_package_entitlements (restaurant_id, package_key, enabled)
  VALUES
    (NEW.id, 'restaurant_management', false),
    (NEW.id, 'pms', false),
    (NEW.id, 'pos', false),
    (NEW.id, 'back_office', false)
  ON CONFLICT (restaurant_id, package_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM anon;
REVOKE ALL ON FUNCTION public.seed_restaurant_package_entitlements() FROM authenticated;

DROP TRIGGER IF EXISTS seed_restaurant_package_entitlements_ins ON public.restaurants;
CREATE TRIGGER seed_restaurant_package_entitlements_ins
  AFTER INSERT ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_restaurant_package_entitlements();
