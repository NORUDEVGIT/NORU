-- Mark the default market segments and booking sources as system catalogue rows.
-- Existing names, active flags, and other attrs keys stay as they are.

CREATE OR REPLACE FUNCTION public.seed_default_commercial_catalogues(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.pms_market_segments (restaurant_id, code, name, active, attrs)
  VALUES
    (p_restaurant_id, 'INDIVIDUAL', 'Individual / Transient', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'CORPORATE', 'Corporate', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'GROUP', 'Group', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'GOVERNMENT', 'Government', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'NGO', 'NGO / International Organization', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'LEISURE', 'Leisure', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'OTHER', 'Other', true, '{"system": true}'::jsonb)
  ON CONFLICT (restaurant_id, code) DO NOTHING;

  INSERT INTO public.pms_source_codes (restaurant_id, code, name, active, attrs)
  VALUES
    (p_restaurant_id, 'WALK_IN', 'Walk-In', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'PHONE', 'Phone', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'EMAIL', 'Email', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'WEBSITE', 'Hotel Website', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'OTA', 'Online Travel Agency', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'TRAVEL_AGENT', 'Travel Agency / Tour Operator', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'CORPORATE', 'Company / Corporate', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'REFERRAL', 'Referral', true, '{"system": true}'::jsonb),
    (p_restaurant_id, 'OTHER', 'Other', true, '{"system": true}'::jsonb)
  ON CONFLICT (restaurant_id, code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_default_commercial_catalogues(uuid) FROM authenticated;

UPDATE public.pms_market_segments
SET attrs = COALESCE(attrs, '{}'::jsonb) || '{"system": true}'::jsonb
WHERE code IN ('INDIVIDUAL', 'CORPORATE', 'GROUP', 'GOVERNMENT', 'NGO', 'LEISURE', 'OTHER');

UPDATE public.pms_source_codes
SET attrs = COALESCE(attrs, '{}'::jsonb) || '{"system": true}'::jsonb
WHERE code IN (
  'WALK_IN',
  'PHONE',
  'EMAIL',
  'WEBSITE',
  'OTA',
  'TRAVEL_AGENT',
  'CORPORATE',
  'REFERRAL',
  'OTHER'
);
