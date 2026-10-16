-- Group workspace — group types catalogue + group master operational columns.
-- Dual-lane with drizzle/migrations/0096_pms_group_workspace.sql.
-- Standalone guest_account_masters.account_type = group remains the entity.
-- No second group table, reservation table, folio, rooming-list table, or AR ledger.
-- Rooming list / itinerary / financials are derived from members + reservations + folios.

CREATE TABLE IF NOT EXISTS public.pms_group_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_group_types_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_group_types_code_check CHECK (btrim(code) <> ''),
  CONSTRAINT pms_group_types_name_check CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS pms_group_types_restaurant_idx
  ON public.pms_group_types(restaurant_id, active, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_types TO authenticated;
GRANT ALL ON public.pms_group_types TO service_role;
ALTER TABLE public.pms_group_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read group types" ON public.pms_group_types;
CREATE POLICY "Members read group types" ON public.pms_group_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert group types" ON public.pms_group_types;
CREATE POLICY "Managers insert group types" ON public.pms_group_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update group types" ON public.pms_group_types;
CREATE POLICY "Managers update group types" ON public.pms_group_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete group types" ON public.pms_group_types;
CREATE POLICY "Managers delete group types" ON public.pms_group_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_group_types_updated_at ON public.pms_group_types;
CREATE TRIGGER set_pms_group_types_updated_at BEFORE UPDATE ON public.pms_group_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_group_types IS
  'Property-scoped Group Type catalogue. Group UI loads these values; types are not hardcoded.';

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS group_type_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS source_code_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS company_master_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS travel_agent_master_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS primary_contact_guest_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS arrival_date date;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS departure_date date;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS expected_pax integer;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS expected_rooms integer;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS special_requests text;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS updated_by_staff_membership_id uuid;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_group_type_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_group_type_fk
  FOREIGN KEY (group_type_id, restaurant_id)
  REFERENCES public.pms_group_types (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_source_code_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_source_code_fk
  FOREIGN KEY (source_code_id, restaurant_id)
  REFERENCES public.pms_source_codes (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_company_master_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_company_master_fk
  FOREIGN KEY (company_master_id, restaurant_id)
  REFERENCES public.guest_account_masters (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_travel_agent_master_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_travel_agent_master_fk
  FOREIGN KEY (travel_agent_master_id, restaurant_id)
  REFERENCES public.guest_account_masters (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_primary_contact_guest_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_primary_contact_guest_fk
  FOREIGN KEY (primary_contact_guest_id, restaurant_id)
  REFERENCES public.guest_profiles (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_updated_by_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_updated_by_fk
  FOREIGN KEY (updated_by_staff_membership_id)
  REFERENCES public.restaurant_users (id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_group_dates_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_group_dates_check
  CHECK (arrival_date IS NULL OR departure_date IS NULL OR departure_date > arrival_date);

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_group_counts_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_group_counts_check
  CHECK (
    (expected_pax IS NULL OR expected_pax >= 0)
    AND (expected_rooms IS NULL OR expected_rooms >= 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS guest_account_masters_group_code_unique
  ON public.guest_account_masters (restaurant_id, lower(code))
  WHERE account_type = 'group' AND code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS guest_account_masters_group_type_idx
  ON public.guest_account_masters(restaurant_id, group_type_id)
  WHERE account_type = 'group';

ALTER TABLE public.guest_account_links
  ADD COLUMN IF NOT EXISTS reservation_id uuid;
ALTER TABLE public.guest_account_links
  ADD COLUMN IF NOT EXISTS member_status text;
ALTER TABLE public.guest_account_links
  ADD COLUMN IF NOT EXISTS special_requests text;

ALTER TABLE public.guest_account_links
  DROP CONSTRAINT IF EXISTS guest_account_links_reservation_fk;
ALTER TABLE public.guest_account_links
  ADD CONSTRAINT guest_account_links_reservation_fk
  FOREIGN KEY (reservation_id, restaurant_id)
  REFERENCES public.hotel_reservations (id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_links
  DROP CONSTRAINT IF EXISTS guest_account_links_member_status_check;
ALTER TABLE public.guest_account_links
  ADD CONSTRAINT guest_account_links_member_status_check
  CHECK (member_status IS NULL OR member_status IN ('expected', 'confirmed', 'cancelled'));

CREATE INDEX IF NOT EXISTS guest_account_links_reservation_idx
  ON public.guest_account_links(restaurant_id, reservation_id)
  WHERE reservation_id IS NOT NULL;

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
      'agreement_updated',
      'commission_configured',
      'commission_calculated',
      'commission_updated',
      'allotment_changed',
      'settings_changed',
      'member_imported',
      'reservation_linked',
      'reservation_unlinked',
      'room_assigned',
      'room_changed',
      'room_unassigned',
      'auto_assignment_failed',
      'document_generated'
    )
  );

COMMENT ON COLUMN public.guest_account_masters.group_type_id IS
  'Group Type from pms_group_types. Used only when account_type = group.';
COMMENT ON COLUMN public.guest_account_links.reservation_id IS
  'Optional reservation bound to a group_member link. Room assignment stays on hotel_reservations.room_id.';
