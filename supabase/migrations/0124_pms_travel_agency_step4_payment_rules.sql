-- PMS Step 4 — Travel Agency Payment, Credit, Reservation Rules & Documents
-- Dual-lane with drizzle/migrations/0124_pms_travel_agency_step4_payment_rules.sql
-- Forward-additive schema additions to public.guest_account_masters and public.pms_company_document_types.
-- Reuses existing Card 3 billing rules, payment methods, policies, and guest_company_documents.

-- 1. Add reservation policy defaults and operational booking notes to guest_account_masters
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS default_deposit_policy_id uuid,
  ADD COLUMN IF NOT EXISTS default_cancellation_policy_id uuid,
  ADD COLUMN IF NOT EXISTS default_no_show_policy_id uuid,
  ADD COLUMN IF NOT EXISTS booking_notes text;

-- Foreign Keys (ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_account_masters_default_deposit_policy_fk'
  ) THEN
    ALTER TABLE public.guest_account_masters
      ADD CONSTRAINT guest_account_masters_default_deposit_policy_fk
      FOREIGN KEY (default_deposit_policy_id)
      REFERENCES public.pms_deposit_policies(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_account_masters_default_cancellation_policy_fk'
  ) THEN
    ALTER TABLE public.guest_account_masters
      ADD CONSTRAINT guest_account_masters_default_cancellation_policy_fk
      FOREIGN KEY (default_cancellation_policy_id)
      REFERENCES public.pms_cancellation_policies(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'guest_account_masters_default_no_show_policy_fk'
  ) THEN
    ALTER TABLE public.guest_account_masters
      ADD CONSTRAINT guest_account_masters_default_no_show_policy_fk
      FOREIGN KEY (default_no_show_policy_id)
      REFERENCES public.pms_no_show_policies(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

-- Indexes on guest_account_masters policy FKs
CREATE INDEX IF NOT EXISTS guest_account_masters_default_deposit_policy_idx
  ON public.guest_account_masters(restaurant_id, default_deposit_policy_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_default_cancellation_policy_idx
  ON public.guest_account_masters(restaurant_id, default_cancellation_policy_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_default_no_show_policy_idx
  ON public.guest_account_masters(restaurant_id, default_no_show_policy_id);

-- Documentation on guest_account_masters columns
COMMENT ON COLUMN public.guest_account_masters.default_deposit_policy_id IS
  'Travel agency default guarantee/deposit policy reference (Card 3 pms_deposit_policies).';
COMMENT ON COLUMN public.guest_account_masters.default_cancellation_policy_id IS
  'Travel agency default cancellation policy reference (Card 3 pms_cancellation_policies).';
COMMENT ON COLUMN public.guest_account_masters.default_no_show_policy_id IS
  'Travel agency default no-show policy reference (Card 3 pms_no_show_policies).';
COMMENT ON COLUMN public.guest_account_masters.booking_notes IS
  'Operational reservation instructions for Front Desk. Distinct from Step 3 commercial notes and CRM notes.';

-- 2. Add Travel Agency applicability flag to pms_company_document_types
ALTER TABLE public.pms_company_document_types
  ADD COLUMN IF NOT EXISTS applies_to_travel_agency boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pms_company_document_types_ta_idx
  ON public.pms_company_document_types(restaurant_id, active, applies_to_travel_agency, display_order);

COMMENT ON COLUMN public.pms_company_document_types.applies_to_travel_agency IS
  'True if document type applies to Travel Agency registration and profile management in Card 4.';

-- 3. Idempotently update standard travel agency document types for existing properties
UPDATE public.pms_company_document_types
SET applies_to_travel_agency = true
WHERE code IN ('AGENCY_AGREEMENT', 'BUSINESS_LICENSE', 'TIN_CERTIFICATE', 'IATA_CERTIFICATE', 'RATE_AGREEMENT', 'OTHER');

-- Seed common Travel Agency document types if property has none marked for travel agencies
INSERT INTO public.pms_company_document_types (
  restaurant_id,
  code,
  name,
  description,
  required,
  applies_to_contract,
  applies_to_company,
  applies_to_travel_agency,
  display_order,
  active
)
SELECT
  r.id,
  d.code,
  d.name,
  d.description,
  d.required,
  d.applies_to_contract,
  d.applies_to_company,
  true,
  d.display_order,
  true
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('AGENCY_AGREEMENT', 'Travel Agency Agreement', 'Signed corporate or wholesale travel agency agreement.', false, true, false, 10),
    ('BUSINESS_LICENSE', 'Business License / Commercial Registration', 'Official government business license or trade certificate.', false, false, true, 20),
    ('TIN_CERTIFICATE', 'TIN Registration Certificate', 'Taxpayer Identification Number certificate.', false, false, true, 30),
    ('IATA_CERTIFICATE', 'IATA / Tourism Accreditation', 'International Air Transport Association or national tourism license.', false, false, false, 40),
    ('RATE_AGREEMENT', 'Rate Addendum / Confidential Wholesale Annex', 'Signed annex of approved contracted or net rate pricing.', false, true, false, 50),
    ('OTHER', 'Other Documentation', 'Supplementary accreditation or verification documents.', false, false, true, 60)
) AS d(code, name, description, required, applies_to_contract, applies_to_company, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_company_document_types ex
  WHERE ex.restaurant_id = r.id AND ex.code = d.code
);
