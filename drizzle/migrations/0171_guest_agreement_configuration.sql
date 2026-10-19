-- Guest Agreement configuration on the existing registration agreement version.
-- A draft has published_at null. Publishing resolves Property Setup times into that row.
-- A version referenced by a check-in instance stays immutable. active may still change.
-- Default drafts are inserted only for properties with no agreement version.
-- Dual-lane with drizzle/migrations/0171_guest_agreement_configuration.sql.
-- Do not apply from an agent.

ALTER TABLE public.pms_registration_agreement_versions
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS intro text,
  ADD COLUMN IF NOT EXISTS lead_in text,
  ADD COLUMN IF NOT EXISTS acknowledgement_title text,
  ADD COLUMN IF NOT EXISTS acknowledgement_intro text,
  ADD COLUMN IF NOT EXISTS agreement_sections jsonb,
  ADD COLUMN IF NOT EXISTS acknowledgements jsonb,
  ADD COLUMN IF NOT EXISTS resolved_check_in_time text,
  ADD COLUMN IF NOT EXISTS resolved_check_out_time text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid;

UPDATE public.pms_registration_agreement_versions
SET published_at = created_at
WHERE published_at IS NULL
  AND agreement_sections IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pms_registration_agreement_versions_one_draft
  ON public.pms_registration_agreement_versions (restaurant_id)
  WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION public.pms_registration_agreement_versions_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.fo_checkin_agreement_instances
    WHERE agreement_version_id = OLD.id
      AND restaurant_id = OLD.restaurant_id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AGREEMENT_VERSION_IMMUTABLE';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.version_label IS DISTINCT FROM OLD.version_label
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.intro IS DISTINCT FROM OLD.intro
    OR NEW.lead_in IS DISTINCT FROM OLD.lead_in
    OR NEW.acknowledgement_title IS DISTINCT FROM OLD.acknowledgement_title
    OR NEW.acknowledgement_intro IS DISTINCT FROM OLD.acknowledgement_intro
    OR NEW.agreement_sections IS DISTINCT FROM OLD.agreement_sections
    OR NEW.acknowledgements IS DISTINCT FROM OLD.acknowledgements
    OR NEW.resolved_check_in_time IS DISTINCT FROM OLD.resolved_check_in_time
    OR NEW.resolved_check_out_time IS DISTINCT FROM OLD.resolved_check_out_time
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
  THEN
    RAISE EXCEPTION 'AGREEMENT_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.pms_registration_agreement_versions (
  restaurant_id,
  version_label,
  body,
  active,
  title,
  intro,
  lead_in,
  acknowledgement_title,
  acknowledgement_intro,
  agreement_sections,
  acknowledgements
)
SELECT
  restaurants.id,
  '1',
  'Hotel Registration Agreement',
  false,
  'Hotel Registration Agreement',
  'Please read and agree to the hotel''s terms, policies, and applicable charges.',
  'By proceeding with check-in, you acknowledge that you have read, understood, and agree to the following hotel registration terms and conditions:',
  'Guest Acknowledgement',
  'Please confirm the following statements to proceed with check-in.',
  $agreement_sections$[
    {"id":"check_in_time","title":"Check-in Time","descriptionTemplate":"Check-in time is {{check_in_time}}. Early check-in is subject to availability.","resolvedDescription":null,"enabled":true,"displayOrder":10},
    {"id":"check_out_time","title":"Check-out Time","descriptionTemplate":"Check-out time is {{check_out_time}}. Late check-out is subject to availability and may incur additional charges.","resolvedDescription":null,"enabled":true,"displayOrder":20},
    {"id":"identification","title":"Identification","descriptionTemplate":"A valid government-issued ID is required for all guests at check-in.","resolvedDescription":null,"enabled":true,"displayOrder":30},
    {"id":"guest_responsibility","title":"Guest Responsibility","descriptionTemplate":"The guest is responsible for any damages to the room or hotel property caused during their stay.","resolvedDescription":null,"enabled":true,"displayOrder":40},
    {"id":"smoking_policy","title":"Smoking Policy","descriptionTemplate":"Smoking is not allowed in rooms and indoor areas. A cleaning fee may be charged for violations.","resolvedDescription":null,"enabled":true,"displayOrder":50},
    {"id":"privacy_data_use","title":"Privacy & Data Use","descriptionTemplate":"Personal data will be used for hotel operational purposes, including registration, guest services, and legal compliance, in accordance with the hotel's Privacy Policy.","resolvedDescription":null,"enabled":true,"displayOrder":60},
    {"id":"payment_incidental","title":"Payment & Incidental Charges","descriptionTemplate":"You authorize the hotel to charge your account for room charges, applicable taxes, and any incidental charges incurred during your stay.","resolvedDescription":null,"enabled":true,"displayOrder":70}
  ]$agreement_sections$::jsonb,
  $agreement_acks$[
    {"id":"registration_information","title":"Registration Information","statement":"I confirm that the registration information provided is correct and complete.","enabled":true,"required":true,"displayOrder":10},
    {"id":"hotel_terms","title":"Hotel Terms & Conditions","statement":"I acknowledge and accept the hotel's terms and conditions, including check-in/out times, cancellation policy, and applicable charges.","enabled":true,"required":true,"displayOrder":20},
    {"id":"privacy_data_use","title":"Privacy & Data Use","statement":"I consent to the use of my personal data for hotel operations, guest services, and legal compliance.","enabled":true,"required":true,"displayOrder":30},
    {"id":"payment_authorization","title":"Payment Authorization","statement":"I authorize the hotel to charge my account for room charges, taxes, and any applicable incidental charges.","enabled":true,"required":true,"displayOrder":40}
  ]$agreement_acks$::jsonb
FROM public.restaurants
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pms_registration_agreement_versions existing
  WHERE existing.restaurant_id = restaurants.id
);

COMMENT ON COLUMN public.pms_registration_agreement_versions.agreement_sections IS
  'Frozen section snapshot once this version is referenced. Draft rows keep description templates unresolved.';

COMMENT ON COLUMN public.pms_registration_agreement_versions.acknowledgements IS
  'Frozen acknowledgement definitions once this version is referenced. Not guest profile consent.';
