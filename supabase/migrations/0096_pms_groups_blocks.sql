-- PMS Groups & Blocks — operational group, allotment, rooming list, history.
-- Dual-lane: drizzle/migrations and supabase/migrations copies must match.

CREATE TABLE IF NOT EXISTS public.pms_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  confirmation_number text NOT NULL,
  name text NOT NULL,
  code text,
  group_type text NOT NULL DEFAULT 'leisure',
  status text NOT NULL DEFAULT 'tentative',
  company_master_id uuid,
  travel_agent_master_id uuid,
  group_account_master_id uuid,
  leader_guest_id uuid,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  cutoff_date date,
  external_reference text,
  notes text,
  source text,
  market_segment text,
  rate_plan_id uuid,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_groups_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_groups_confirmation_unique UNIQUE (restaurant_id, confirmation_number),
  CONSTRAINT pms_groups_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT pms_groups_type_check CHECK (
    group_type IN ('leisure', 'corporate', 'association', 'tour', 'other')
  ),
  CONSTRAINT pms_groups_status_check CHECK (
    status IN ('tentative', 'definite', 'cancelled', 'completed')
  ),
  CONSTRAINT pms_groups_dates_check CHECK (departure_date > arrival_date)
);

CREATE INDEX IF NOT EXISTS pms_groups_restaurant_dates_idx
  ON public.pms_groups (restaurant_id, arrival_date, status);

COMMENT ON TABLE public.pms_groups IS
  'Operational Groups & Blocks header. Not guest_account_masters group accounts.';

ALTER TABLE public.pms_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read pms groups" ON public.pms_groups;
CREATE POLICY "Managers read pms groups" ON public.pms_groups
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write pms groups" ON public.pms_groups;
CREATE POLICY "Managers write pms groups" ON public.pms_groups
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE ON public.pms_groups TO authenticated;
GRANT ALL ON public.pms_groups TO service_role;

DROP TRIGGER IF EXISTS set_pms_groups_updated_at ON public.pms_groups;
CREATE TRIGGER set_pms_groups_updated_at
  BEFORE UPDATE ON public.pms_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pms_groups
  DROP CONSTRAINT IF EXISTS pms_groups_company_same_property;
ALTER TABLE public.pms_groups
  ADD CONSTRAINT pms_groups_company_same_property
  FOREIGN KEY (company_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

ALTER TABLE public.pms_groups
  DROP CONSTRAINT IF EXISTS pms_groups_ta_same_property;
ALTER TABLE public.pms_groups
  ADD CONSTRAINT pms_groups_ta_same_property
  FOREIGN KEY (travel_agent_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

ALTER TABLE public.pms_groups
  DROP CONSTRAINT IF EXISTS pms_groups_account_same_property;
ALTER TABLE public.pms_groups
  ADD CONSTRAINT pms_groups_account_same_property
  FOREIGN KEY (group_account_master_id, restaurant_id)
  REFERENCES public.guest_account_masters(id, restaurant_id);

CREATE TABLE IF NOT EXISTS public.pms_group_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  allotted integer NOT NULL,
  cutoff_date date,
  status text NOT NULL DEFAULT 'active',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_blocks_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_group_blocks_group_same_property
    FOREIGN KEY (group_id, restaurant_id)
    REFERENCES public.pms_groups(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_group_blocks_type_fk
    FOREIGN KEY (room_type_id)
    REFERENCES public.room_types(id),
  CONSTRAINT pms_group_blocks_status_check CHECK (
    status IN ('active', 'released', 'cancelled')
  ),
  CONSTRAINT pms_group_blocks_allotted_check CHECK (allotted >= 0),
  CONSTRAINT pms_group_blocks_dates_check CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS pms_group_blocks_group_idx
  ON public.pms_group_blocks (restaurant_id, group_id, status);

COMMENT ON TABLE public.pms_group_blocks IS
  'Group room-type allotment. Pickup is derived from linked hotel_reservations.';

ALTER TABLE public.pms_group_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read pms group blocks" ON public.pms_group_blocks;
CREATE POLICY "Managers read pms group blocks" ON public.pms_group_blocks
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write pms group blocks" ON public.pms_group_blocks;
CREATE POLICY "Managers write pms group blocks" ON public.pms_group_blocks
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_blocks TO authenticated;
GRANT ALL ON public.pms_group_blocks TO service_role;

ALTER TABLE public.pms_group_blocks
  DROP CONSTRAINT IF EXISTS pms_group_blocks_allotted_check;
ALTER TABLE public.pms_group_blocks
  ADD CONSTRAINT pms_group_blocks_allotted_check CHECK (allotted >= 0);

DROP TRIGGER IF EXISTS set_pms_group_blocks_updated_at ON public.pms_group_blocks;
CREATE TRIGGER set_pms_group_blocks_updated_at
  BEFORE UPDATE ON public.pms_group_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_group_allotment_nights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_block_id uuid NOT NULL,
  night date NOT NULL,
  allotted integer NOT NULL,
  inventory_block_id uuid,
  CONSTRAINT pms_group_allotment_nights_unique UNIQUE (group_block_id, night),
  CONSTRAINT pms_group_allotment_nights_block_same_property
    FOREIGN KEY (group_block_id, restaurant_id)
    REFERENCES public.pms_group_blocks(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_group_allotment_nights_allotted_check CHECK (allotted >= 0)
);

CREATE INDEX IF NOT EXISTS pms_group_allotment_nights_block_idx
  ON public.pms_group_allotment_nights (restaurant_id, group_block_id, night);

ALTER TABLE public.pms_group_allotment_nights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read allotment nights" ON public.pms_group_allotment_nights;
CREATE POLICY "Managers read allotment nights" ON public.pms_group_allotment_nights
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write allotment nights" ON public.pms_group_allotment_nights;
CREATE POLICY "Managers write allotment nights" ON public.pms_group_allotment_nights
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_allotment_nights TO authenticated;
GRANT ALL ON public.pms_group_allotment_nights TO service_role;

CREATE TABLE IF NOT EXISTS public.pms_group_rooming_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  group_block_id uuid,
  guest_id uuid,
  guest_name text NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  room_type_id uuid,
  special_requests text,
  reservation_id uuid,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_rooming_rows_group_same_property
    FOREIGN KEY (group_id, restaurant_id)
    REFERENCES public.pms_groups(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_group_rooming_rows_status_check CHECK (
    status IN ('draft', 'created', 'error')
  ),
  CONSTRAINT pms_group_rooming_rows_name_check CHECK (btrim(guest_name) <> ''),
  CONSTRAINT pms_group_rooming_rows_occupancy_check CHECK (adults >= 1 AND children >= 0)
);

ALTER TABLE public.pms_group_rooming_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read rooming rows" ON public.pms_group_rooming_rows;
CREATE POLICY "Managers read rooming rows" ON public.pms_group_rooming_rows
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers write rooming rows" ON public.pms_group_rooming_rows;
CREATE POLICY "Managers write rooming rows" ON public.pms_group_rooming_rows
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_group_rooming_rows TO authenticated;
GRANT ALL ON public.pms_group_rooming_rows TO service_role;

CREATE TABLE IF NOT EXISTS public.pms_group_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_group_history_group_same_property
    FOREIGN KEY (group_id, restaurant_id)
    REFERENCES public.pms_groups(id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_group_history_group_idx
  ON public.pms_group_history (restaurant_id, group_id, created_at DESC);

ALTER TABLE public.pms_group_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read group history" ON public.pms_group_history;
CREATE POLICY "Managers read group history" ON public.pms_group_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );
DROP POLICY IF EXISTS "Managers insert group history" ON public.pms_group_history;
CREATE POLICY "Managers insert group history" ON public.pms_group_history
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT, INSERT ON public.pms_group_history TO authenticated;
GRANT ALL ON public.pms_group_history TO service_role;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS pms_group_id uuid,
  ADD COLUMN IF NOT EXISTS pms_group_block_id uuid;

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_pms_group_same_property;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_pms_group_same_property
  FOREIGN KEY (pms_group_id, restaurant_id)
  REFERENCES public.pms_groups(id, restaurant_id);

ALTER TABLE public.hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_pms_group_block_same_property;
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_pms_group_block_same_property
  FOREIGN KEY (pms_group_block_id, restaurant_id)
  REFERENCES public.pms_group_blocks(id, restaurant_id);

CREATE INDEX IF NOT EXISTS hotel_reservations_pms_group_idx
  ON public.hotel_reservations (restaurant_id, pms_group_id)
  WHERE pms_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_reservations_pms_group_block_idx
  ON public.hotel_reservations (restaurant_id, pms_group_block_id)
  WHERE pms_group_block_id IS NOT NULL;
