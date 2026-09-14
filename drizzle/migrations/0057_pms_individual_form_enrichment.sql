-- PMS Guest Profile gap-edit #2 — Individual form enrichment + blacklist/restricted
-- (Issue #109). Linking reuses Wave 4 guest_account_links — no new link table.
--
-- Sequential after 0056 (Polish Wave 1 took 0056; TIP named 0056 as next-after-0055).
-- Dual-lane with
--   supabase/migrations/0057_pms_individual_form_enrichment.sql
-- Additive guest_profiles columns + normalized guest_emergency_contacts.
-- History event check expands for restriction set/clear/lift.
-- No privileged functions. No seed hotel sample data.
-- No second document store. No folio routing. No guest↔guest family graph.
--
-- Additive RLS on guest_emergency_contacts matching guest tables
-- (owner/manager + receptionist residual PRESERVED). Entitlement model is
-- not changed. No SECURITY DEFINER.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0057_pms_individual_form_enrichment.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.guest_profile_history
--     DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
--   ALTER TABLE public.guest_profile_history ADD CONSTRAINT guest_profile_history_event_check CHECK (
--     event_type IN (
--       'created','profile_updated','vip_changed','status_changed','preference_updated','note_added',
--       'document_uploaded','document_verified','document_rejected','merged_from','merged_into',
--       'consent_updated','relationship_linked','relationship_unlinked','comms_logged','comms_sent',
--       'exported','anonymised','unmerged','unmerge_blocked'
--     )
--   );
--   DROP TABLE IF EXISTS public.guest_emergency_contacts;
--   ALTER TABLE public.guest_profiles
--     DROP CONSTRAINT IF EXISTS guest_profiles_gender_check,
--     DROP CONSTRAINT IF EXISTS guest_profiles_restriction_severity_check,
--     DROP CONSTRAINT IF EXISTS guest_profiles_restriction_reason_check;
--   ALTER TABLE public.guest_profiles
--     DROP COLUMN IF EXISTS title,
--     DROP COLUMN IF EXISTS middle_name,
--     DROP COLUMN IF EXISTS preferred_name,
--     DROP COLUMN IF EXISTS gender,
--     DROP COLUMN IF EXISTS phone_alt,
--     DROP COLUMN IF EXISTS email_alt,
--     DROP COLUMN IF EXISTS employment_position,
--     DROP COLUMN IF EXISTS department,
--     DROP COLUMN IF EXISTS source_of_business,
--     DROP COLUMN IF EXISTS restricted,
--     DROP COLUMN IF EXISTS blacklisted,
--     DROP COLUMN IF EXISTS restriction_severity,
--     DROP COLUMN IF EXISTS restriction_reason,
--     DROP COLUMN IF EXISTS restriction_set_by_membership_id,
--     DROP COLUMN IF EXISTS restriction_set_at,
--     DROP COLUMN IF EXISTS restriction_until;

-- ---------------------------------------------------------------------------
-- Individual enrichment — additive columns on guest_profiles
-- Position / Department live here (not on Company masters).
-- ---------------------------------------------------------------------------

ALTER TABLE public.guest_profiles
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS preferred_name text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS phone_alt text,
  ADD COLUMN IF NOT EXISTS email_alt text,
  ADD COLUMN IF NOT EXISTS employment_position text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS source_of_business text,
  ADD COLUMN IF NOT EXISTS restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blacklisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restriction_severity text,
  ADD COLUMN IF NOT EXISTS restriction_reason text,
  ADD COLUMN IF NOT EXISTS restriction_set_by_membership_id uuid REFERENCES public.restaurant_users(id),
  ADD COLUMN IF NOT EXISTS restriction_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_until date;

COMMENT ON COLUMN public.guest_profiles.employment_position IS
  'Individual employment position. Not stored on Company masters.';
COMMENT ON COLUMN public.guest_profiles.department IS
  'Individual employment department. Not stored on Company masters.';
COMMENT ON COLUMN public.guest_profiles.restricted IS
  'Staff restricted flag. Stay paths warn; they do not hard-block Reservations or Front Office.';
COMMENT ON COLUMN public.guest_profiles.blacklisted IS
  'Staff blacklisted flag. Stay paths warn; they do not hard-block Reservations or Front Office.';

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_title_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_title_check CHECK (
    title IS NULL OR title IN ('mr','mrs','ms','miss','dr','prof','mx')
  );

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_gender_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_gender_check CHECK (
    gender IS NULL OR gender IN ('female','male','other','unspecified')
  );

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_restriction_severity_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_restriction_severity_check CHECK (
    restriction_severity IS NULL OR restriction_severity IN ('watch','elevated','severe')
  );

ALTER TABLE public.guest_profiles
  DROP CONSTRAINT IF EXISTS guest_profiles_restriction_reason_check;
ALTER TABLE public.guest_profiles
  ADD CONSTRAINT guest_profiles_restriction_reason_check CHECK (
    (NOT restricted AND NOT blacklisted)
    OR btrim(coalesce(restriction_reason, '')) <> ''
  );

CREATE INDEX IF NOT EXISTS guest_profiles_restriction_idx
  ON public.guest_profiles(restaurant_id)
  WHERE restricted OR blacklisted;

-- ---------------------------------------------------------------------------
-- guest_emergency_contacts — normalized multi-contact table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  name text NOT NULL,
  relationship text,
  phone text,
  email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_emergency_contacts_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT guest_emergency_contacts_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS guest_emergency_contacts_guest_idx
  ON public.guest_emergency_contacts(restaurant_id, guest_id, sort_order);

COMMENT ON TABLE public.guest_emergency_contacts IS
  'Gap-edit #2 Individual emergency contacts. Cascades with the guest. Not a family graph.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_emergency_contacts TO authenticated;
GRANT ALL ON public.guest_emergency_contacts TO service_role;
ALTER TABLE public.guest_emergency_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Managers read guest emergency contacts" ON public.guest_emergency_contacts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Managers insert guest emergency contacts" ON public.guest_emergency_contacts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Managers update guest emergency contacts" ON public.guest_emergency_contacts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Managers delete guest emergency contacts" ON public.guest_emergency_contacts
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Front office read guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Front office read guest emergency contacts" ON public.guest_emergency_contacts
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier']));
DROP POLICY IF EXISTS "Front office insert guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Front office insert guest emergency contacts" ON public.guest_emergency_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office update guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Front office update guest emergency contacts" ON public.guest_emergency_contacts
  FOR UPDATE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));
DROP POLICY IF EXISTS "Front office delete guest emergency contacts" ON public.guest_emergency_contacts;
CREATE POLICY "Front office delete guest emergency contacts" ON public.guest_emergency_contacts
  FOR DELETE TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

DROP TRIGGER IF EXISTS set_guest_emergency_contacts_updated_at ON public.guest_emergency_contacts;
CREATE TRIGGER set_guest_emergency_contacts_updated_at BEFORE UPDATE ON public.guest_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- History event types — restriction set / clear / lift
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
      'restriction_lifted'
    )
  );
