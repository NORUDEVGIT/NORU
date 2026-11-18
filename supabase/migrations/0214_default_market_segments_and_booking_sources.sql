-- Default market segments and booking sources for every property.
-- Missing codes are inserted active. Existing rows, including inactive ones, are left unchanged.

CREATE OR REPLACE FUNCTION public.seed_default_commercial_catalogues(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pms_market_segments (restaurant_id, code, name, active)
  VALUES
    (p_restaurant_id, 'INDIVIDUAL', 'Individual / Transient', true),
    (p_restaurant_id, 'CORPORATE', 'Corporate', true),
    (p_restaurant_id, 'GROUP', 'Group', true),
    (p_restaurant_id, 'GOVERNMENT', 'Government', true),
    (p_restaurant_id, 'NGO', 'NGO / International Organization', true),
    (p_restaurant_id, 'LEISURE', 'Leisure', true),
    (p_restaurant_id, 'OTHER', 'Other', true)
  ON CONFLICT (restaurant_id, code) DO NOTHING;

  INSERT INTO public.pms_source_codes (restaurant_id, code, name, active)
  VALUES
    (p_restaurant_id, 'WALK_IN', 'Walk-In', true),
    (p_restaurant_id, 'PHONE', 'Phone', true),
    (p_restaurant_id, 'EMAIL', 'Email', true),
    (p_restaurant_id, 'WEBSITE', 'Hotel Website', true),
    (p_restaurant_id, 'OTA', 'Online Travel Agency', true),
    (p_restaurant_id, 'TRAVEL_AGENT', 'Travel Agency / Tour Operator', true),
    (p_restaurant_id, 'CORPORATE', 'Company / Corporate', true),
    (p_restaurant_id, 'REFERRAL', 'Referral', true),
    (p_restaurant_id, 'OTHER', 'Other', true)
  ON CONFLICT (restaurant_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM authenticated;

CREATE OR REPLACE FUNCTION public.seed_default_commercial_catalogues_on_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.seed_default_commercial_catalogues(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues_on_restaurant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues_on_restaurant() FROM anon;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues_on_restaurant() FROM authenticated;

DROP TRIGGER IF EXISTS seed_default_commercial_catalogues_ins ON public.restaurants;
CREATE TRIGGER seed_default_commercial_catalogues_ins
  AFTER INSERT ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_commercial_catalogues_on_restaurant();

SELECT public.seed_default_commercial_catalogues(id)
FROM public.restaurants;
