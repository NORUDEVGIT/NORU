-- PMS Guest Profile Wave 2 — Identity documents, merge, consent, preference options (Issue #72).
--
-- Sequential after 0050. Dual-lane with
--   drizzle/migrations/0051_pms_guest_profile_wave2.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No fake global preference enums. Meal plans are NOT food preferences.
--
-- guest_documents / guest_profiles consent+merge RLS matches existing guests:
-- owner or manager only (receptionist residual PRESERVED — do not expand).
-- pms_preference_options RLS matches Setup catalogues: members read;
-- owner/manager write.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0051_pms_guest_profile_wave2.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.guest_profiles
--     DROP CONSTRAINT IF EXISTS guest_profiles_merged_same_property,
--     DROP CONSTRAINT IF EXISTS guest_profiles_merged_not_self,
--     DROP CONSTRAINT IF EXISTS guest_profiles_data_consent_check,
--     DROP CONSTRAINT IF EXISTS guest_profiles_marketing_consent_check,
--     DROP COLUMN IF EXISTS merged_into_guest_id,
--     DROP COLUMN IF EXISTS data_processing_consent,
--     DROP COLUMN IF EXISTS data_processing_consent_recorded_at,
--     DROP COLUMN IF EXISTS data_processing_consent_recorded_by,
--     DROP COLUMN IF EXISTS marketing_consent,
--     DROP COLUMN IF EXISTS marketing_consent_recorded_at,
--     DROP COLUMN IF EXISTS marketing_consent_recorded_by;
--   ALTER TABLE public.guest_profile_history
--     DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
--   ALTER TABLE public.guest_profile_history ADD CONSTRAINT guest_profile_history_event_check CHECK (
--     event_type IN ('created','profile_updated','vip_changed','status_changed','preference_updated','note_added')
--   );
--   DROP TABLE IF EXISTS public.guest_documents;
--   DROP TABLE IF EXISTS public.pms_preference_options;

-- ---------------------------------------------------------------------------
-- guest_profiles: merge pointer + recorded consent (not Wave 5 privacy suite)
-- ---------------------------------------------------------------------------

ALTER TABLE public.guest_profiles
  ADD COLUMN IF NOT EXISTS merged_into_guest_id uuid,
  ADD COLUMN IF NOT EXISTS data_processing_consent text NOT NULL DEFAULT 'not_asked',
  ADD COLUMN IF NOT EXISTS data_processing_consent_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_processing_consent_recorded_by uuid REFERENCES public.restaurant_users(id),
  ADD COLUMN IF NOT EXISTS marketing_consent text NOT NULL DEFAULT 'not_asked',
  ADD COLUMN IF NOT EXISTS marketing_consent_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_consent_recorded_by uuid REFERENCES public.restaurant_users(id);

COMMENT ON COLUMN public.guest_profiles.merged_into_guest_id IS
  'Wave 2 soft-retire pointer. Retired profiles stay inactive and are excluded from the default Directory.';
COMMENT ON COLUMN public.guest_profiles.data_processing_consent IS
  'Wave 2 recorded consent: granted | refused | not_asked. SET3 consentDefaults are guidance only until recorded.';
COMMENT ON COLUMN public.guest_profiles.marketing_consent IS
  'Wave 2 recorded marketing consent: granted | refused | not_asked. Defaults are not recorded consent.';

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_merged_same_property;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_merged_same_property
  FOREIGN KEY (merged_into_guest_id, restaurant_id)
  REFERENCES public.guest_profiles(id, restaurant_id);

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_merged_not_self;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_merged_not_self
  CHECK (merged_into_guest_id IS NULL OR merged_into_guest_id <> id);

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_data_consent_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_data_consent_check
  CHECK (data_processing_consent IN ('granted','refused','not_asked'));

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_marketing_consent_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_marketing_consent_check
  CHECK (marketing_consent IN ('granted','refused','not_asked'));

CREATE INDEX IF NOT EXISTS guest_profiles_merged_idx
  ON public.guest_profiles(restaurant_id, merged_into_guest_id)
  WHERE merged_into_guest_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- History events for documents, merge, consent
-- ---------------------------------------------------------------------------

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
      'merged_from',
      'merged_into',
      'consent_updated'
    )
  );

-- ---------------------------------------------------------------------------
-- guest_documents — staff upload / mask / verify (not government KYC)
-- Storage lives under existing property-images:
--   {restaurantId}/guests/{guestId}/{uuid}.{ext}
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  kind text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_by_membership_id uuid REFERENCES public.restaurant_users(id),
  verified_at timestamptz,
  rejection_reason text,
  uploaded_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_documents_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT guest_documents_kind_check CHECK (
    kind IN ('passport','national_id','driving_licence','visa','supporting','other')
  ),
  CONSTRAINT guest_documents_status_check CHECK (
    verification_status IN ('unverified','verified','rejected')
  ),
  CONSTRAINT guest_documents_size_check CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  CONSTRAINT guest_documents_path_unique UNIQUE (restaurant_id, storage_path)
);

CREATE INDEX IF NOT EXISTS guest_documents_guest_idx
  ON public.guest_documents(restaurant_id, guest_id, created_at DESC);

COMMENT ON TABLE public.guest_documents IS
  'Wave 2 guest ID / supporting document metadata. Staff verify is not government KYC.';

GRANT SELECT, INSERT, UPDATE ON public.guest_documents TO authenticated;
GRANT ALL ON public.guest_documents TO service_role;
ALTER TABLE public.guest_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest documents" ON public.guest_documents;
CREATE POLICY "Managers read guest documents" ON public.guest_documents
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert guest documents" ON public.guest_documents;
CREATE POLICY "Managers insert guest documents" ON public.guest_documents
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest documents" ON public.guest_documents;
CREATE POLICY "Managers update guest documents" ON public.guest_documents
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_guest_documents_updated_at ON public.guest_documents;
CREATE TRIGGER set_guest_documents_updated_at BEFORE UPDATE ON public.guest_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pms_preference_options — Setup-owned bed / view / food / communication
-- Room types and hotel floors are consumed from existing SET2 tables.
-- Do not seed rows. Do not reuse pms_meal_plans as food preferences.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pms_preference_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_preference_options_category_check CHECK (
    category IN ('bed','view','food','communication')
  ),
  CONSTRAINT pms_preference_options_code_unique UNIQUE (restaurant_id, category, code),
  CONSTRAINT pms_preference_options_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_preference_options_restaurant_idx
  ON public.pms_preference_options(restaurant_id, category, sort_order);

COMMENT ON TABLE public.pms_preference_options IS
  'Wave 2 Setup-owned preference options for one property. Not a global enum. Meal plans are not food prefs.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_preference_options TO authenticated;
GRANT ALL ON public.pms_preference_options TO service_role;
ALTER TABLE public.pms_preference_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read preference options" ON public.pms_preference_options;
CREATE POLICY "Members read preference options" ON public.pms_preference_options
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert preference options" ON public.pms_preference_options;
CREATE POLICY "Managers insert preference options" ON public.pms_preference_options
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update preference options" ON public.pms_preference_options;
CREATE POLICY "Managers update preference options" ON public.pms_preference_options
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete preference options" ON public.pms_preference_options;
CREATE POLICY "Managers delete preference options" ON public.pms_preference_options
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_preference_options_updated_at ON public.pms_preference_options;
CREATE TRIGGER set_pms_preference_options_updated_at BEFORE UPDATE ON public.pms_preference_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
