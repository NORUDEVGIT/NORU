-- Guest Profile Identity Documents workspace — per-document metadata on
-- existing guest_documents. Types stay on pms_guest_id_types. Storage stays
-- on property-images. Dual-lane with drizzle/migrations/0087_pms_guest_identity_documents.sql.
-- Additive only. No second document table. Policies stay table-owner RLS.

ALTER TABLE public.guest_documents
  ADD COLUMN IF NOT EXISTS id_type_id uuid REFERENCES public.pms_guest_id_types(id),
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS issuing_country text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS issuing_authority text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS back_storage_path text,
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN mime_type DROP NOT NULL,
  ALTER COLUMN size_bytes DROP NOT NULL;

ALTER TABLE public.guest_documents
  DROP CONSTRAINT IF EXISTS guest_documents_size_check;
ALTER TABLE public.guest_documents
  ADD CONSTRAINT guest_documents_size_check CHECK (
    size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 8388608)
  );

ALTER TABLE public.guest_documents
  DROP CONSTRAINT IF EXISTS guest_documents_kind_check;

ALTER TABLE public.guest_documents
  ALTER COLUMN kind SET DEFAULT 'other';

COMMENT ON COLUMN public.guest_documents.id_type_id IS
  'Settings document type from pms_guest_id_types. Null on Wave 2 legacy file rows.';
COMMENT ON COLUMN public.guest_documents.back_storage_path IS
  'Optional reverse-side scan. Front remains storage_path. Same property-images bucket.';
COMMENT ON COLUMN public.guest_documents.document_number IS
  'Per-document identity number. List APIs return a mask; full value is guest-manager get/save only.';

CREATE INDEX IF NOT EXISTS guest_documents_id_type_idx
  ON public.guest_documents(restaurant_id, id_type_id);

GRANT DELETE ON public.guest_documents TO authenticated;

DROP POLICY IF EXISTS "Front office read guest documents" ON public.guest_documents;
CREATE POLICY "Front office read guest documents" ON public.guest_documents
  FOR SELECT TO authenticated USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );
DROP POLICY IF EXISTS "Front office insert guest documents" ON public.guest_documents;
CREATE POLICY "Front office insert guest documents" ON public.guest_documents
  FOR INSERT TO authenticated WITH CHECK (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );
DROP POLICY IF EXISTS "Front office update guest documents" ON public.guest_documents;
CREATE POLICY "Front office update guest documents" ON public.guest_documents
  FOR UPDATE TO authenticated USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );
DROP POLICY IF EXISTS "Managers delete guest documents" ON public.guest_documents;
CREATE POLICY "Managers delete guest documents" ON public.guest_documents
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Front office delete guest documents" ON public.guest_documents;
CREATE POLICY "Front office delete guest documents" ON public.guest_documents
  FOR DELETE TO authenticated USING (
    public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist'])
  );

ALTER TABLE public.guest_profile_history
  DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
ALTER TABLE public.guest_profile_history
  ADD CONSTRAINT guest_profile_history_event_check CHECK (
    event_type IN (
      'created',
      'profile_updated',
      'vip_changed',
      'status_changed',
      'preference_updated',
      'note_added',
      'document_uploaded',
      'document_verified',
      'document_rejected',
      'document_updated',
      'document_deleted',
      'merged_from',
      'merged_into',
      'consent_updated',
      'relationship_linked',
      'relationship_unlinked',
      'comms_logged',
      'comms_sent',
      'exported',
      'anonymised',
      'unmerged',
      'unmerge_blocked',
      'restriction_set',
      'restriction_cleared',
      'restriction_lifted',
      'photo_updated'
    )
  );
