-- Company Profile Phase 1 — documents + agreement metadata + history events.
-- Dual-lane with supabase/migrations/0094_pms_company_profile_phase1.sql.
-- No second reservation, folio, guest, or AR ledger.

CREATE TABLE IF NOT EXISTS public.pms_company_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_company_document_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_company_document_types_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,19}$'
  ),
  CONSTRAINT pms_company_document_types_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS pms_company_document_types_restaurant_idx
  ON public.pms_company_document_types(restaurant_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_company_document_types TO authenticated;
GRANT ALL ON public.pms_company_document_types TO service_role;
ALTER TABLE public.pms_company_document_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read company document types" ON public.pms_company_document_types;
CREATE POLICY "Members read company document types" ON public.pms_company_document_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write company document types" ON public.pms_company_document_types;
CREATE POLICY "Managers write company document types" ON public.pms_company_document_types
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_company_document_types_updated_at ON public.pms_company_document_types;
CREATE TRIGGER set_pms_company_document_types_updated_at
  BEFORE UPDATE ON public.pms_company_document_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  company_master_id uuid NOT NULL,
  document_type_id uuid NOT NULL REFERENCES public.pms_company_document_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  reference_number text,
  issue_date date,
  expiry_date date,
  review_status text NOT NULL DEFAULT 'pending',
  storage_path text,
  uploaded_by_membership_id uuid,
  reviewed_by_membership_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_company_documents_company_same_property FOREIGN KEY (company_master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id),
  CONSTRAINT guest_company_documents_status_check CHECK (review_status IN ('pending', 'verified', 'rejected')),
  CONSTRAINT guest_company_documents_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS guest_company_documents_company_idx
  ON public.guest_company_documents(restaurant_id, company_master_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_company_documents TO authenticated;
GRANT ALL ON public.guest_company_documents TO service_role;
ALTER TABLE public.guest_company_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read company documents" ON public.guest_company_documents;
CREATE POLICY "Managers read company documents" ON public.guest_company_documents
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write company documents" ON public.guest_company_documents;
CREATE POLICY "Managers write company documents" ON public.guest_company_documents
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_guest_company_documents_updated_at ON public.guest_company_documents;
CREATE TRIGGER set_guest_company_documents_updated_at
  BEFORE UPDATE ON public.guest_company_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS notice_period_days integer;
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS signed_at date;
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS signed_by text;
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS file_storage_path text;

ALTER TABLE public.guest_account_history DROP CONSTRAINT IF EXISTS guest_account_history_event_check;
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
      'imported',
      'note_added',
      'note_updated',
      'note_archived',
      'contact_created',
      'contact_updated',
      'primary_contact_changed',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_replaced',
      'agreement_created',
      'agreement_updated'
    )
  );
