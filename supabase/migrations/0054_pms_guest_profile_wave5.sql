-- PMS Guest Profile Wave 5 — Notes / Comms / Activity hub + Privacy finish
-- (Issue #98).
--
-- Sequential after 0053. Dual-lane with
--   drizzle/migrations/0054_pms_guest_profile_wave5.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No marketing cloud. No OTA / night-audit / gateway product.
--
-- guest_merge_ledger / anonymise columns RLS matches existing guests:
-- owner or manager only (receptionist residual PRESERVED on guest manage;
-- privacy writes are owner/manager in application code — do not expand RLS).
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0054_pms_guest_profile_wave5.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.guest_profile_history
--     DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
--   ALTER TABLE public.guest_profile_history ADD CONSTRAINT guest_profile_history_event_check CHECK (
--     event_type IN (
--       'created','profile_updated','vip_changed','status_changed','preference_updated','note_added',
--       'document_uploaded','document_verified','document_rejected','merged_from','merged_into',
--       'consent_updated','relationship_linked','relationship_unlinked'
--     )
--   );
--   ALTER TABLE public.guest_account_history
--     DROP CONSTRAINT IF EXISTS guest_account_history_event_check;
--   ALTER TABLE public.guest_account_history ADD CONSTRAINT guest_account_history_event_check CHECK (
--     event_type IN ('created','profile_updated','relationship_linked','relationship_unlinked')
--   );
--   DROP TABLE IF EXISTS public.guest_merge_ledger;
--   ALTER TABLE public.guest_profiles
--     DROP COLUMN IF EXISTS anonymised_at,
--     DROP COLUMN IF EXISTS anonymised_by_membership_id;
--   ALTER TABLE public.guest_account_masters
--     DROP COLUMN IF EXISTS anonymised_at,
--     DROP COLUMN IF EXISTS anonymised_by_membership_id;

-- ---------------------------------------------------------------------------
-- Anonymise markers — Directory / search hide live PII; stay/folio FKs remain
-- ---------------------------------------------------------------------------

ALTER TABLE public.guest_profiles
  ADD COLUMN IF NOT EXISTS anonymised_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymised_by_membership_id uuid REFERENCES public.restaurant_users(id);

COMMENT ON COLUMN public.guest_profiles.anonymised_at IS
  'Wave 5 irreversible anonymise. When set, Directory must not show live PII. Reservations and folios stay linked.';

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS anonymised_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymised_by_membership_id uuid REFERENCES public.restaurant_users(id);

COMMENT ON COLUMN public.guest_account_masters.anonymised_at IS
  'Wave 5 irreversible anonymise of master contact PII. Relationships remain by id.';

-- ---------------------------------------------------------------------------
-- guest_merge_ledger — reversible Wave 2 merge snapshot (unmerge or exception)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_merge_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  survivor_id uuid NOT NULL,
  retired_id uuid NOT NULL,
  payload jsonb NOT NULL,
  reverted_at timestamptz,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_merge_ledger_survivor_same_property FOREIGN KEY (survivor_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT guest_merge_ledger_retired_same_property FOREIGN KEY (retired_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS guest_merge_ledger_survivor_idx
  ON public.guest_merge_ledger(restaurant_id, survivor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_merge_ledger_retired_idx
  ON public.guest_merge_ledger(restaurant_id, retired_id, created_at DESC);

COMMENT ON TABLE public.guest_merge_ledger IS
  'Wave 5 merge snapshot for unmerge. Merges without a ledger cannot be silently undone — record an exception instead.';

GRANT SELECT ON public.guest_merge_ledger TO authenticated;
GRANT ALL ON public.guest_merge_ledger TO service_role;
ALTER TABLE public.guest_merge_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest merge ledger" ON public.guest_merge_ledger;
CREATE POLICY "Managers read guest merge ledger" ON public.guest_merge_ledger
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

-- ---------------------------------------------------------------------------
-- History event types — comms + privacy audit (AC-W5-1, AC-W5-6)
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
      'unmerge_blocked'
    )
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
      'anonymised'
    )
  );
