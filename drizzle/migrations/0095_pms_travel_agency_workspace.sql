-- Travel Agency workspace — settings, commission, allotment ceiling, notification prefs.
-- Dual-lane with drizzle/migrations/0095_pms_travel_agency_workspace.sql.
-- Standalone guest_account_masters.account_type = travel_agent remains the entity.
-- No second travel-agency table, reservation table, folio, or AR ledger.
-- Allotment is an agency booking ceiling. It does not subtract from general inventory.

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS preferred_currency text;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS market_segment_id uuid;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS booking_access text NOT NULL DEFAULT 'open';
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS max_advance_booking_days integer;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS min_stay_nights integer;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS max_stay_nights integer;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS group_bookings_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS credit_limit_amount numeric(12, 2);

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_booking_access_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_booking_access_check
  CHECK (booking_access IN ('open', 'restricted'));

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_preferred_currency_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_preferred_currency_check
  CHECK (preferred_currency IS NULL OR preferred_currency ~ '^[A-Z]{3}$');

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_stay_rules_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_stay_rules_check
  CHECK (
    (max_advance_booking_days IS NULL OR max_advance_booking_days >= 0)
    AND (min_stay_nights IS NULL OR min_stay_nights >= 1)
    AND (max_stay_nights IS NULL OR max_stay_nights >= 1)
    AND (
      min_stay_nights IS NULL
      OR max_stay_nights IS NULL
      OR max_stay_nights >= min_stay_nights
    )
  );

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_market_segment_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_market_segment_fk
  FOREIGN KEY (market_segment_id, restaurant_id)
  REFERENCES public.pms_market_segments (id, restaurant_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pms_agency_commission_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  commission_type text NOT NULL,
  rate_value numeric(12, 4) NOT NULL,
  currency text NOT NULL,
  effective_on date NOT NULL,
  expires_on date,
  agreement_id uuid,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_agency_commission_plans_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_commission_plans_type_check
    CHECK (commission_type IN ('percent', 'fixed')),
  CONSTRAINT pms_agency_commission_plans_rate_check
    CHECK (rate_value >= 0),
  CONSTRAINT pms_agency_commission_plans_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT pms_agency_commission_plans_dates_check
    CHECK (expires_on IS NULL OR expires_on >= effective_on)
);

CREATE INDEX IF NOT EXISTS pms_agency_commission_plans_agency_idx
  ON public.pms_agency_commission_plans(restaurant_id, agency_master_id, active, effective_on);

CREATE TABLE IF NOT EXISTS public.pms_agency_commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  plan_id uuid,
  basis_amount numeric(12, 2) NOT NULL DEFAULT 0,
  amount numeric(12, 2) NOT NULL DEFAULT 0,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'calculated',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_agency_commission_entries_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_commission_entries_reservation_fk
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_commission_entries_plan_fk
    FOREIGN KEY (plan_id)
    REFERENCES public.pms_agency_commission_plans (id)
    ON DELETE SET NULL,
  CONSTRAINT pms_agency_commission_entries_status_check
    CHECK (status IN ('calculated', 'pending', 'approved', 'settled', 'void')),
  CONSTRAINT pms_agency_commission_entries_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT pms_agency_commission_entries_unique
    UNIQUE (restaurant_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS pms_agency_commission_entries_agency_idx
  ON public.pms_agency_commission_entries(restaurant_id, agency_master_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pms_agency_allotments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  allocated_qty integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  release_days integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_agency_allotments_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_allotments_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_agency_allotments_qty_check CHECK (allocated_qty >= 0),
  CONSTRAINT pms_agency_allotments_dates_check CHECK (end_date >= start_date),
  CONSTRAINT pms_agency_allotments_release_check CHECK (release_days >= 0),
  CONSTRAINT pms_agency_allotments_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS pms_agency_allotments_agency_idx
  ON public.pms_agency_allotments(restaurant_id, agency_master_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.pms_agency_allowed_room_types (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, agency_master_id, room_type_id),
  CONSTRAINT pms_agency_allowed_room_types_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_allowed_room_types_room_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.pms_agency_notification_prefs (
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  event_key text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, agency_master_id, event_key, channel),
  CONSTRAINT pms_agency_notification_prefs_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_notification_prefs_event_check
    CHECK (event_key IN ('booking_confirmation', 'booking_cancellation', 'booking_modification')),
  CONSTRAINT pms_agency_notification_prefs_channel_check
    CHECK (channel IN ('email'))
);

INSERT INTO public.pms_agency_commission_plans (
  restaurant_id,
  agency_master_id,
  commission_type,
  rate_value,
  currency,
  effective_on,
  active,
  notes
)
SELECT
  m.restaurant_id,
  m.id,
  'percent',
  (regexp_match(btrim(m.commission_label), '^([0-9]+(?:\\.[0-9]+)?)'))[1]::numeric,
  'ETB',
  CURRENT_DATE,
  true,
  'Backfilled from commission_label'
FROM public.guest_account_masters m
WHERE m.account_type = 'travel_agent'
  AND m.commission_type = 'percent'
  AND m.commission_label ~ '^[0-9]+(\\.[0-9]+)?'
  AND NOT EXISTS (
    SELECT 1
    FROM public.pms_agency_commission_plans p
    WHERE p.restaurant_id = m.restaurant_id
      AND p.agency_master_id = m.id
  );

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
      'settings_changed'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_commission_plans TO authenticated;
GRANT ALL ON public.pms_agency_commission_plans TO service_role;
ALTER TABLE public.pms_agency_commission_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read agency commission plans" ON public.pms_agency_commission_plans;
CREATE POLICY "Members read agency commission plans" ON public.pms_agency_commission_plans
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write agency commission plans" ON public.pms_agency_commission_plans;
CREATE POLICY "Managers write agency commission plans" ON public.pms_agency_commission_plans
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_commission_entries TO authenticated;
GRANT ALL ON public.pms_agency_commission_entries TO service_role;
ALTER TABLE public.pms_agency_commission_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read agency commission entries" ON public.pms_agency_commission_entries;
CREATE POLICY "Members read agency commission entries" ON public.pms_agency_commission_entries
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write agency commission entries" ON public.pms_agency_commission_entries;
CREATE POLICY "Managers write agency commission entries" ON public.pms_agency_commission_entries
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_allotments TO authenticated;
GRANT ALL ON public.pms_agency_allotments TO service_role;
ALTER TABLE public.pms_agency_allotments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read agency allotments" ON public.pms_agency_allotments;
CREATE POLICY "Members read agency allotments" ON public.pms_agency_allotments
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write agency allotments" ON public.pms_agency_allotments;
CREATE POLICY "Managers write agency allotments" ON public.pms_agency_allotments
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_allowed_room_types TO authenticated;
GRANT ALL ON public.pms_agency_allowed_room_types TO service_role;
ALTER TABLE public.pms_agency_allowed_room_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read agency allowed room types" ON public.pms_agency_allowed_room_types;
CREATE POLICY "Members read agency allowed room types" ON public.pms_agency_allowed_room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write agency allowed room types" ON public.pms_agency_allowed_room_types;
CREATE POLICY "Managers write agency allowed room types" ON public.pms_agency_allowed_room_types
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_notification_prefs TO authenticated;
GRANT ALL ON public.pms_agency_notification_prefs TO service_role;
ALTER TABLE public.pms_agency_notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read agency notification prefs" ON public.pms_agency_notification_prefs;
CREATE POLICY "Members read agency notification prefs" ON public.pms_agency_notification_prefs
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers write agency notification prefs" ON public.pms_agency_notification_prefs;
CREATE POLICY "Managers write agency notification prefs" ON public.pms_agency_notification_prefs
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_agency_commission_plans_updated_at ON public.pms_agency_commission_plans;
CREATE TRIGGER set_pms_agency_commission_plans_updated_at
  BEFORE UPDATE ON public.pms_agency_commission_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_agency_commission_entries_updated_at ON public.pms_agency_commission_entries;
CREATE TRIGGER set_pms_agency_commission_entries_updated_at
  BEFORE UPDATE ON public.pms_agency_commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_agency_allotments_updated_at ON public.pms_agency_allotments;
CREATE TRIGGER set_pms_agency_allotments_updated_at
  BEFORE UPDATE ON public.pms_agency_allotments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_agency_notification_prefs_updated_at ON public.pms_agency_notification_prefs;
CREATE TRIGGER set_pms_agency_notification_prefs_updated_at
  BEFORE UPDATE ON public.pms_agency_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
