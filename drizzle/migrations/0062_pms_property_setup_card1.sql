-- PMS Property Setup Card 1 — Property & Business (Issue #160).
--
-- Sequential after 0061. Dual-lane with
--   supabase/migrations/0062_pms_property_setup_card1.sql
-- Additive columns/jsonb on restaurants for Spec gaps only.
-- Reuses Live SET1 (0047) identity / CI-CO / business_date / tax and
-- Live SET2 (0048) hotel_buildings / hotel_floors / hotel_wings.
-- No second conflicting masters. No pms_card1_live. Single Activate
-- remains pms_set1_live. No SECURITY DEFINER. No sample seed.
--
-- APPLY AFTER MERGE — Abel authorized 2026-09-16. Afrobel applies live
-- after merge. IN THE PR ONLY — do not apply to production from an agent.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0062_pms_property_setup_card1.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS trading_name,
--     DROP COLUMN IF EXISTS star_rating,
--     DROP COLUMN IF EXISTS default_language,
--     DROP COLUMN IF EXISTS short_description,
--     DROP COLUMN IF EXISTS identity_toggles,
--     DROP COLUMN IF EXISTS brand_name,
--     DROP COLUMN IF EXISTS brand_code,
--     DROP COLUMN IF EXISTS chain_name,
--     DROP COLUMN IF EXISTS address_region,
--     DROP COLUMN IF EXISTS address_zone,
--     DROP COLUMN IF EXISTS address_woreda,
--     DROP COLUMN IF EXISTS address_kebele,
--     DROP COLUMN IF EXISTS address_subcity,
--     DROP COLUMN IF EXISTS address_house_no,
--     DROP COLUMN IF EXISTS latitude,
--     DROP COLUMN IF EXISTS longitude,
--     DROP COLUMN IF EXISTS full_address,
--     DROP COLUMN IF EXISTS whatsapp,
--     DROP COLUMN IF EXISTS social_contacts,
--     DROP COLUMN IF EXISTS department_contacts,
--     DROP COLUMN IF EXISTS checkin_policy_text,
--     DROP COLUMN IF EXISTS checkout_policy_text,
--     DROP COLUMN IF EXISTS early_checkin_policy_text,
--     DROP COLUMN IF EXISTS late_checkout_policy_text,
--     DROP COLUMN IF EXISTS business_date_config,
--     DROP COLUMN IF EXISTS business_date_blockers,
--     DROP COLUMN IF EXISTS legal_entity_name,
--     DROP COLUMN IF EXISTS legal_entity_type,
--     DROP COLUMN IF EXISTS registration_number,
--     DROP COLUMN IF EXISTS legal_upload_refs,
--     DROP COLUMN IF EXISTS vat_registered,
--     DROP COLUMN IF EXISTS vat_number,
--     DROP COLUMN IF EXISTS tin_number,
--     DROP COLUMN IF EXISTS licence_number,
--     DROP COLUMN IF EXISTS tax_upload_refs,
--     DROP COLUMN IF EXISTS structure_rules_posture,
--     DROP COLUMN IF EXISTS pms_property_setup_status;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS star_rating int,
  ADD COLUMN IF NOT EXISTS default_language text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS identity_toggles jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS brand_code text,
  ADD COLUMN IF NOT EXISTS chain_name text,
  ADD COLUMN IF NOT EXISTS address_region text,
  ADD COLUMN IF NOT EXISTS address_zone text,
  ADD COLUMN IF NOT EXISTS address_woreda text,
  ADD COLUMN IF NOT EXISTS address_kebele text,
  ADD COLUMN IF NOT EXISTS address_subcity text,
  ADD COLUMN IF NOT EXISTS address_house_no text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS full_address text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS social_contacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS department_contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checkin_policy_text text,
  ADD COLUMN IF NOT EXISTS checkout_policy_text text,
  ADD COLUMN IF NOT EXISTS early_checkin_policy_text text,
  ADD COLUMN IF NOT EXISTS late_checkout_policy_text text,
  ADD COLUMN IF NOT EXISTS business_date_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_date_blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_entity_name text,
  ADD COLUMN IF NOT EXISTS legal_entity_type text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS legal_upload_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS tin_number text,
  ADD COLUMN IF NOT EXISTS licence_number text,
  ADD COLUMN IF NOT EXISTS tax_upload_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS structure_rules_posture jsonb NOT NULL DEFAULT '{"buildingRequired":true,"wingOptional":true,"floorRequired":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS pms_property_setup_status jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_star_rating_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_star_rating_check
  CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5));

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_legal_entity_type_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_legal_entity_type_check
  CHECK (
    legal_entity_type IS NULL
    OR legal_entity_type IN ('plc', 'private_limited', 'sole_proprietor', 'partnership', 'other')
  );

COMMENT ON COLUMN public.restaurants.trading_name IS
  'PMS Card 1 trading / display name. Distinct from restaurants.name legal/display.';
COMMENT ON COLUMN public.restaurants.star_rating IS
  'PMS Card 1 optional 1–5 star rating. Null until stored.';
COMMENT ON COLUMN public.restaurants.default_language IS
  'PMS Card 1 default guest-facing language code.';
COMMENT ON COLUMN public.restaurants.short_description IS
  'PMS Card 1 short property description. Opening date stays out of Step 1.';
COMMENT ON COLUMN public.restaurants.identity_toggles IS
  'PMS Card 1 identity display toggles (trading name on documents, chain property).';
COMMENT ON COLUMN public.restaurants.brand_name IS
  'PMS Card 1 brand name. Null until stored.';
COMMENT ON COLUMN public.restaurants.brand_code IS
  'PMS Card 1 brand code. Null until stored.';
COMMENT ON COLUMN public.restaurants.chain_name IS
  'PMS Card 1 chain name. Null until stored.';
COMMENT ON COLUMN public.restaurants.address_region IS
  'PMS Card 1 Ethiopia region (kilil). Composed into full_address.';
COMMENT ON COLUMN public.restaurants.address_zone IS
  'PMS Card 1 Ethiopia zone. Composed into full_address.';
COMMENT ON COLUMN public.restaurants.address_woreda IS
  'PMS Card 1 Ethiopia woreda. Composed into full_address.';
COMMENT ON COLUMN public.restaurants.address_kebele IS
  'PMS Card 1 Ethiopia kebele. Composed into full_address.';
COMMENT ON COLUMN public.restaurants.address_subcity IS
  'PMS Card 1 Ethiopia sub-city (Addis). Composed into full_address.';
COMMENT ON COLUMN public.restaurants.address_house_no IS
  'PMS Card 1 house / plot number. Composed into full_address.';
COMMENT ON COLUMN public.restaurants.latitude IS
  'PMS Card 1 optional latitude. Null until stored.';
COMMENT ON COLUMN public.restaurants.longitude IS
  'PMS Card 1 optional longitude. Null until stored.';
COMMENT ON COLUMN public.restaurants.full_address IS
  'PMS Card 1 read-only auto-composed Full Address storage. Never a second editable master.';
COMMENT ON COLUMN public.restaurants.whatsapp IS
  'PMS Card 1 WhatsApp contact. Channel send stays future.';
COMMENT ON COLUMN public.restaurants.social_contacts IS
  'PMS Card 1 social / web links jsonb.';
COMMENT ON COLUMN public.restaurants.department_contacts IS
  'PMS Card 1 department contact rows jsonb.';
COMMENT ON COLUMN public.restaurants.checkin_policy_text IS
  'PMS Card 1 check-in policy copy. Times stay on SET1 check_in_time.';
COMMENT ON COLUMN public.restaurants.checkout_policy_text IS
  'PMS Card 1 check-out policy copy. Times stay on SET1 check_out_time.';
COMMENT ON COLUMN public.restaurants.early_checkin_policy_text IS
  'PMS Card 1 early check-in policy copy.';
COMMENT ON COLUMN public.restaurants.late_checkout_policy_text IS
  'PMS Card 1 late check-out policy copy.';
COMMENT ON COLUMN public.restaurants.business_date_config IS
  'PMS Card 1 business-date CONFIG only. CURRENT STATE stays restaurants.business_date; Night Audit owns the roll.';
COMMENT ON COLUMN public.restaurants.business_date_blockers IS
  'PMS Card 1 business-date blocker labels. Not a roll engine.';
COMMENT ON COLUMN public.restaurants.legal_entity_name IS
  'PMS Card 1 legal entity name. Complements restaurants.legal_name.';
COMMENT ON COLUMN public.restaurants.legal_entity_type IS
  'PMS Card 1 legal entity type. Null until stored.';
COMMENT ON COLUMN public.restaurants.registration_number IS
  'PMS Card 1 company registration number.';
COMMENT ON COLUMN public.restaurants.legal_upload_refs IS
  'PMS Card 1 legal document upload refs. Not a DMS.';
COMMENT ON COLUMN public.restaurants.vat_registered IS
  'PMS Card 1 VAT registered On/Off. VAT certificate required only when On.';
COMMENT ON COLUMN public.restaurants.vat_number IS
  'PMS Card 1 VAT number. Complements tax_identities.';
COMMENT ON COLUMN public.restaurants.tin_number IS
  'PMS Card 1 TIN.';
COMMENT ON COLUMN public.restaurants.licence_number IS
  'PMS Card 1 trade / hotel licence number.';
COMMENT ON COLUMN public.restaurants.tax_upload_refs IS
  'PMS Card 1 tax document upload refs. VAT certificate gated on vat_registered.';
COMMENT ON COLUMN public.restaurants.structure_rules_posture IS
  'PMS Card 1 D8 structure rules: building required, wing optional, floor required. Capacity stays derived. Rooms deep-link inventory.';
COMMENT ON COLUMN public.restaurants.pms_property_setup_status IS
  'PMS Card 1 card/step status jsonb. Completing Card 1 does not Activate. No pms_card1_live.';

GRANT SELECT (
  trading_name,
  star_rating,
  default_language,
  short_description,
  identity_toggles,
  brand_name,
  brand_code,
  chain_name,
  address_region,
  address_zone,
  address_woreda,
  address_kebele,
  address_subcity,
  address_house_no,
  latitude,
  longitude,
  full_address,
  whatsapp,
  social_contacts,
  department_contacts,
  checkin_policy_text,
  checkout_policy_text,
  early_checkin_policy_text,
  late_checkout_policy_text,
  business_date_config,
  business_date_blockers,
  legal_entity_name,
  legal_entity_type,
  registration_number,
  legal_upload_refs,
  vat_registered,
  vat_number,
  tin_number,
  licence_number,
  tax_upload_refs,
  structure_rules_posture,
  pms_property_setup_status
) ON public.restaurants TO authenticated;
