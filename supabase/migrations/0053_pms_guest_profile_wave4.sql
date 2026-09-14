-- PMS Guest Profile Wave 4 — Company / Group / Travel Agent masters,
-- relationships, reservation master IDs (Issue #95).
--
-- Sequential after 0052. Dual-lane with
--   drizzle/migrations/0053_pms_guest_profile_wave4.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- No Sales & Events group blocks. No folio-split routing.
--
-- guest_account_masters / guest_account_links RLS matches existing guests:
-- owner or manager only (receptionist residual PRESERVED — do not expand).
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY HELD until Abel/PM approval after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0053_pms_guest_profile_wave4.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.hotel_reservations
--     DROP CONSTRAINT IF EXISTS hotel_reservations_company_master_same_property,
--     DROP CONSTRAINT IF EXISTS hotel_reservations_group_account_master_same_property,
--     DROP CONSTRAINT IF EXISTS hotel_reservations_travel_agent_master_same_property,
--     DROP COLUMN IF EXISTS company_master_id,
--     DROP COLUMN IF EXISTS group_account_master_id,
--     DROP COLUMN IF EXISTS travel_agent_master_id;
--   ALTER TABLE public.guest_profile_history
--     DROP CONSTRAINT IF EXISTS guest_profile_history_event_check;
--   ALTER TABLE public.guest_profile_history ADD CONSTRAINT guest_profile_history_event_check CHECK (
--     event_type IN (
--       'created','profile_updated','vip_changed','status_changed','preference_updated','note_added',
--       'document_uploaded','document_verified','document_rejected','merged_from','merged_into','consent_updated'
--     )
--   );
--   DROP TABLE IF EXISTS public.guest_account_history;
--   DROP TABLE IF EXISTS public.guest_account_links;
--   DROP TABLE IF EXISTS public.guest_account_masters;

-- ---------------------------------------------------------------------------
-- guest_account_masters — Guest-owned Company / Group / TA registers
-- Group account ≠ Sales & Events group block / allotment / rooming list.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_account_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  account_type text NOT NULL,
  name text NOT NULL,
  code text,
  email text,
  phone text,
  address_line1 text,
  city text,
  country text,
  notes text,
  account_status text NOT NULL DEFAULT 'active',
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_account_masters_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_account_masters_type_check CHECK (
    account_type IN ('company','group','travel_agent')
  ),
  CONSTRAINT guest_account_masters_status_check CHECK (
    account_status IN ('active','inactive')
  ),
  CONSTRAINT guest_account_masters_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS guest_account_masters_restaurant_type_idx
  ON public.guest_account_masters(restaurant_id, account_type, name);

CREATE INDEX IF NOT EXISTS guest_account_masters_search_idx
  ON public.guest_account_masters(restaurant_id, email, phone);

COMMENT ON TABLE public.guest_account_masters IS
  'Wave 4 Guest-owned Company / Group account / Travel Agent masters. Group account is not a Sales & Events group block.';

GRANT SELECT, INSERT, UPDATE ON public.guest_account_masters TO authenticated;
GRANT ALL ON public.guest_account_masters TO service_role;
ALTER TABLE public.guest_account_masters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest account masters" ON public.guest_account_masters;
CREATE POLICY "Managers read guest account masters" ON public.guest_account_masters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert guest account masters" ON public.guest_account_masters;
CREATE POLICY "Managers insert guest account masters" ON public.guest_account_masters
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest account masters" ON public.guest_account_masters;
CREATE POLICY "Managers update guest account masters" ON public.guest_account_masters
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_guest_account_masters_updated_at ON public.guest_account_masters;
CREATE TRIGGER set_guest_account_masters_updated_at BEFORE UPDATE ON public.guest_account_masters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- guest_account_links — individual ↔ master roles
-- Unlink deletes the link row only (AC-W4-4). No ON DELETE of parties.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_account_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  master_id uuid NOT NULL,
  role text NOT NULL,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_account_links_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT guest_account_links_master_same_property FOREIGN KEY (master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id),
  CONSTRAINT guest_account_links_role_check CHECK (
    role IN ('employer','bill_to','booker_ta','group_member')
  ),
  CONSTRAINT guest_account_links_unique UNIQUE (restaurant_id, guest_id, master_id, role)
);

CREATE INDEX IF NOT EXISTS guest_account_links_guest_idx
  ON public.guest_account_links(restaurant_id, guest_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guest_account_links_master_idx
  ON public.guest_account_links(restaurant_id, master_id, created_at DESC);

COMMENT ON TABLE public.guest_account_links IS
  'Wave 4 individual-to-master roles. Unlink does not delete the guest or the master. Bill-to is an association, not folio split routing.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_account_links TO authenticated;
GRANT ALL ON public.guest_account_links TO service_role;
ALTER TABLE public.guest_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest account links" ON public.guest_account_links;
CREATE POLICY "Managers read guest account links" ON public.guest_account_links
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers insert guest account links" ON public.guest_account_links;
CREATE POLICY "Managers insert guest account links" ON public.guest_account_links
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update guest account links" ON public.guest_account_links;
CREATE POLICY "Managers update guest account links" ON public.guest_account_links
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete guest account links" ON public.guest_account_links;
CREATE POLICY "Managers delete guest account links" ON public.guest_account_links
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

-- ---------------------------------------------------------------------------
-- History events for relationship link / unlink
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
      'relationship_unlinked'
    )
  );

-- ---------------------------------------------------------------------------
-- hotel_reservations consume Guest master IDs (AC-W4-5)
-- Typed company_name / group_name from 0046 remain search labels, not masters.
-- ---------------------------------------------------------------------------

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS company_master_id uuid,
  ADD COLUMN IF NOT EXISTS group_account_master_id uuid,
  ADD COLUMN IF NOT EXISTS travel_agent_master_id uuid;

COMMENT ON COLUMN public.hotel_reservations.company_master_id IS
  'Wave 4 Guest Company master id. Not the FO-SEARCH1 typed company_name label.';
COMMENT ON COLUMN public.hotel_reservations.group_account_master_id IS
  'Wave 4 Guest Group account master id. Not a Sales & Events group block.';
COMMENT ON COLUMN public.hotel_reservations.travel_agent_master_id IS
  'Wave 4 Guest Travel Agent master id.';

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_company_master_same_property;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_company_master_same_property
  FOREIGN KEY (company_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_group_account_master_same_property;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_group_account_master_same_property
  FOREIGN KEY (group_account_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_travel_agent_master_same_property;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_travel_agent_master_same_property
  FOREIGN KEY (travel_agent_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

CREATE INDEX IF NOT EXISTS hotel_reservations_company_master_idx
  ON public.hotel_reservations(restaurant_id, company_master_id)
  WHERE company_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hotel_reservations_group_account_master_idx
  ON public.hotel_reservations(restaurant_id, group_account_master_id)
  WHERE group_account_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hotel_reservations_travel_agent_master_idx
  ON public.hotel_reservations(restaurant_id, travel_agent_master_id)
  WHERE travel_agent_master_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- guest_account_history — append-only master / relationship events (AC-W4-20)
-- Matches guest_profile_history: SELECT for owner/manager; INSERT via service role.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.guest_account_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  master_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_account_history_master_same_property FOREIGN KEY (master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id),
  CONSTRAINT guest_account_history_event_check CHECK (
    event_type IN ('created','profile_updated','relationship_linked','relationship_unlinked')
  )
);

CREATE INDEX IF NOT EXISTS guest_account_history_master_idx
  ON public.guest_account_history(restaurant_id, master_id, created_at DESC);

COMMENT ON TABLE public.guest_account_history IS
  'Wave 4 append-only history for Guest account masters. Not the Wave 5 Comms card.';

GRANT SELECT ON public.guest_account_history TO authenticated;
GRANT ALL ON public.guest_account_history TO service_role;
ALTER TABLE public.guest_account_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read guest account history" ON public.guest_account_history;
CREATE POLICY "Managers read guest account history" ON public.guest_account_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
