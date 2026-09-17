-- PMS Property Setup Card 1 — Fidelity redesign (Issue #162).
--
-- Sequential after 0062 (already live). Dual-lane with
--   supabase/migrations/0063_pms_property_setup_card1_fidelity.sql
-- Additive columns only for Spec PATCH v1.2 designed-field gaps.
-- Reuses Live SET1–SET2 / 0062 masters. Extends business_date_config
-- jsonb in the application for Calendar display Dual + Approval required
-- (no conflicting first-class columns).
-- No second conflicting masters. No pms_card1_live. Single Activate
-- remains pms_set1_live. No SECURITY DEFINER. No sample seed.
--
-- APPLY AFTER MERGE — Abel authorized APPLY with merge 2026-09-17.
-- Afrobel applies live after merge. IN THE PR ONLY — do not apply to production from an agent.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0063_pms_property_setup_card1_fidelity.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS opening_date,
--     DROP COLUMN IF EXISTS cover_image_url,
--     DROP COLUMN IF EXISTS primary_brand_colour,
--     DROP COLUMN IF EXISTS secondary_brand_colour,
--     DROP COLUMN IF EXISTS website_url,
--     DROP COLUMN IF EXISTS brand_affiliation,
--     DROP COLUMN IF EXISTS business_type,
--     DROP COLUMN IF EXISTS emergency_contacts,
--     DROP COLUMN IF EXISTS property_areas,
--     DROP COLUMN IF EXISTS location_extras,
--     DROP COLUMN IF EXISTS checkin_ops,
--     DROP COLUMN IF EXISTS legal_extras;
--   ALTER TABLE public.hotel_buildings
--     DROP COLUMN IF EXISTS floor_count,
--     DROP COLUMN IF EXISTS building_type,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS location,
--     DROP COLUMN IF EXISTS status;
--   ALTER TABLE public.hotel_wings
--     DROP COLUMN IF EXISTS code,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS status;
--   ALTER TABLE public.hotel_floors
--     DROP COLUMN IF EXISTS floor_number,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS wing_id;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS primary_brand_colour text,
  ADD COLUMN IF NOT EXISTS secondary_brand_colour text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS brand_affiliation text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS emergency_contacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS property_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checkin_ops jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_extras jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_brand_affiliation_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_brand_affiliation_check
  CHECK (
    brand_affiliation IS NULL
    OR brand_affiliation IN ('marriott', 'hilton', 'sheraton', 'ihg', 'none', 'other')
  );

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_business_type_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_business_type_check
  CHECK (
    business_type IS NULL
    OR business_type IN ('independent', 'boutique', 'chain_corporate', 'franchise')
  );

ALTER TABLE public.hotel_buildings
  ADD COLUMN IF NOT EXISTS floor_count int,
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.hotel_wings
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.hotel_floors
  ADD COLUMN IF NOT EXISTS floor_number int,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS wing_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hotel_floors_wing_fk'
  ) THEN
    ALTER TABLE public.hotel_floors
      ADD CONSTRAINT hotel_floors_wing_fk
      FOREIGN KEY (wing_id)
      REFERENCES public.hotel_wings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.restaurants.opening_date IS
  'PMS Card 1 Step 1 Opening Date. Required for Identity Complete. D6 overturn.';
COMMENT ON COLUMN public.restaurants.cover_image_url IS
  'PMS Card 1 Branding cover image URL.';
COMMENT ON COLUMN public.restaurants.primary_brand_colour IS
  'PMS Card 1 primary brand colour hex. Accents only.';
COMMENT ON COLUMN public.restaurants.secondary_brand_colour IS
  'PMS Card 1 secondary brand colour hex. Accents only.';
COMMENT ON COLUMN public.restaurants.website_url IS
  'PMS Card 1 Company Website. Single SoT on Branding Step 1 — not duplicated on Contacts.';
COMMENT ON COLUMN public.restaurants.brand_affiliation IS
  'PMS Card 1 Brand / Chain affiliation enum.';
COMMENT ON COLUMN public.restaurants.business_type IS
  'PMS Card 1 Business Type: independent, boutique, chain_corporate, franchise.';
COMMENT ON COLUMN public.restaurants.emergency_contacts IS
  'PMS Card 1 emergency contact jsonb {name,phone,notes}. Required for Contacts Complete.';
COMMENT ON COLUMN public.restaurants.property_areas IS
  'PMS Card 1 Property Areas chips jsonb string[].';
COMMENT ON COLUMN public.restaurants.location_extras IS
  'PMS Card 1 Address extras: maps link, landmark, pin visibility.';
COMMENT ON COLUMN public.restaurants.checkin_ops IS
  'PMS Card 1 Check-in extras: lead time, day use, 24h desk, policies.';
COMMENT ON COLUMN public.restaurants.legal_extras IS
  'PMS Card 1 Legal extras: ownership type, incorporation date.';
COMMENT ON COLUMN public.hotel_buildings.floor_count IS
  'PMS Card 1 Building Number of Floors. Capacity floors stay derived.';
COMMENT ON COLUMN public.hotel_buildings.building_type IS
  'PMS Card 1 building type.';
COMMENT ON COLUMN public.hotel_buildings.description IS
  'PMS Card 1 building description.';
COMMENT ON COLUMN public.hotel_buildings.location IS
  'PMS Card 1 building location.';
COMMENT ON COLUMN public.hotel_buildings.status IS
  'PMS Card 1 building status. Complements active.';
COMMENT ON COLUMN public.hotel_wings.code IS
  'PMS Card 1 wing code.';
COMMENT ON COLUMN public.hotel_wings.description IS
  'PMS Card 1 wing description.';
COMMENT ON COLUMN public.hotel_wings.status IS
  'PMS Card 1 wing status. Complements active.';
COMMENT ON COLUMN public.hotel_floors.floor_number IS
  'PMS Card 1 floor number.';
COMMENT ON COLUMN public.hotel_floors.description IS
  'PMS Card 1 floor description.';
COMMENT ON COLUMN public.hotel_floors.status IS
  'PMS Card 1 floor status. Complements active.';
COMMENT ON COLUMN public.hotel_floors.wing_id IS
  'PMS Card 1 optional wing parent for a floor.';

GRANT SELECT (
  opening_date,
  cover_image_url,
  primary_brand_colour,
  secondary_brand_colour,
  website_url,
  brand_affiliation,
  business_type,
  emergency_contacts,
  property_areas,
  location_extras,
  checkin_ops,
  legal_extras
) ON public.restaurants TO authenticated;

GRANT SELECT (
  floor_count,
  building_type,
  description,
  location,
  status
) ON public.hotel_buildings TO authenticated;

GRANT SELECT (
  code,
  description,
  status
) ON public.hotel_wings TO authenticated;

GRANT SELECT (
  floor_number,
  description,
  status,
  wing_id
) ON public.hotel_floors TO authenticated;
