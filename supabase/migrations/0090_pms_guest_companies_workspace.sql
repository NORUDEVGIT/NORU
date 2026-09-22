-- Guest Profile Companies workspace — operational wiring to Card 4 business types.
-- Dual-lane with drizzle/migrations/0090_pms_guest_companies_workspace.sql.
-- No second company table. Credit remains a flag + terms notes, not AR.

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS business_profile_type_id uuid
    REFERENCES public.pms_business_profile_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_storage_path text,
  ADD COLUMN IF NOT EXISTS email_normalized text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS credit_account_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_contact_title text;

CREATE INDEX IF NOT EXISTS guest_account_masters_business_type_idx
  ON public.guest_account_masters (restaurant_id, business_profile_type_id);
CREATE INDEX IF NOT EXISTS guest_account_masters_email_norm_idx
  ON public.guest_account_masters (restaurant_id, email_normalized);
CREATE INDEX IF NOT EXISTS guest_account_masters_phone_norm_idx
  ON public.guest_account_masters (restaurant_id, phone_normalized);
CREATE INDEX IF NOT EXISTS guest_account_masters_tax_id_idx
  ON public.guest_account_masters (restaurant_id, tax_id);
CREATE INDEX IF NOT EXISTS guest_account_masters_reg_idx
  ON public.guest_account_masters (restaurant_id, business_registration_number);

COMMENT ON COLUMN public.guest_account_masters.business_profile_type_id IS
  'Card 4 pms_business_profile_types. Distinct from legal company_type and Wave 4 account_type.';
COMMENT ON COLUMN public.guest_account_masters.credit_account_enabled IS
  'Operational credit-account flag. Gated by type.credit_account_allowed. Not a ledger.';
COMMENT ON COLUMN public.guest_account_masters.primary_contact_title IS
  'Job title for the company contact person. Not individual employment Position/Department.';

UPDATE public.guest_account_masters
SET
  email_normalized = NULLIF(lower(trim(email)), ''),
  phone_normalized = NULLIF(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
WHERE email IS NOT NULL OR phone IS NOT NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_account_status_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_account_status_check CHECK (
    account_status IN ('active', 'inactive', 'pending')
  );

ALTER TABLE public.guest_account_history
  DROP CONSTRAINT IF EXISTS guest_account_history_event_check;
ALTER TABLE public.guest_account_history
  ADD CONSTRAINT guest_account_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'status_changed',
      'logo_updated',
      'credit_account_changed',
      'imported'
    )
  );
