-- PMS Property Setup Card 2 — Room Types & Rooms schema (Phase 1).
--
-- Sequential after 0063. Dual-lane with
--   supabase/migrations/0064_pms_card2_room_types_rooms.sql
-- Additive columns + two new tables. No operational status rewrite.
-- No pms_card1_live. No SECURITY DEFINER. No sample seed.
-- Backfill copies existing type/room rows only.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — Abel authorized schema proposal 2026-09-18.
-- Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0064_pms_card2_room_types_rooms.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.hotel_room_links;
--   DROP TABLE IF EXISTS public.room_type_beds;
--   ALTER TABLE public.hotel_rooms
--     DROP COLUMN IF EXISTS room_code,
--     DROP COLUMN IF EXISTS maintenance_status,
--     DROP COLUMN IF EXISTS sellable,
--     DROP COLUMN IF EXISTS room_features;
--   ALTER TABLE public.room_types
--     DROP COLUMN IF EXISTS short_name,
--     DROP COLUMN IF EXISTS display_name,
--     DROP COLUMN IF EXISTS category,
--     DROP COLUMN IF EXISTS class,
--     DROP COLUMN IF EXISTS standard_occupancy,
--     DROP COLUMN IF EXISTS infant_capacity,
--     DROP COLUMN IF EXISTS extra_guest_allowed,
--     DROP COLUMN IF EXISTS extra_bed_allowed,
--     DROP COLUMN IF EXISTS connecting_eligible,
--     DROP COLUMN IF EXISTS accessible_eligible,
--     DROP COLUMN IF EXISTS smoking_policy,
--     DROP COLUMN IF EXISTS default_building_id,
--     DROP COLUMN IF EXISTS default_wing_id,
--     DROP COLUMN IF EXISTS preferred_floor_id;
--   Do not drop hotel_rooms.status or housekeeping_status.

-- 1. Composite unique for same-tenant room FKs (0013 already adds this on some lanes).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotel_rooms_id_restaurant_unique'
  ) THEN
    ALTER TABLE public.hotel_rooms
      ADD CONSTRAINT hotel_rooms_id_restaurant_unique UNIQUE (id, restaurant_id);
  END IF;
END $$;

-- 2. Room type preference + occupancy fields.
ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS short_name text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS class text,
  ADD COLUMN IF NOT EXISTS standard_occupancy integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS infant_capacity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_guest_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_bed_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS connecting_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accessible_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smoking_policy text NOT NULL DEFAULT 'non_smoking',
  ADD COLUMN IF NOT EXISTS default_building_id uuid,
  ADD COLUMN IF NOT EXISTS default_wing_id uuid,
  ADD COLUMN IF NOT EXISTS preferred_floor_id uuid;

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_smoking_policy_check;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_smoking_policy_check
  CHECK (smoking_policy IN ('smoking', 'non_smoking', 'either'));

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_default_building_fk;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_default_building_fk
  FOREIGN KEY (default_building_id, restaurant_id)
  REFERENCES public.hotel_buildings(id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_default_wing_fk;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_default_wing_fk
  FOREIGN KEY (default_wing_id, restaurant_id)
  REFERENCES public.hotel_wings(id, restaurant_id)
  ON DELETE SET NULL;

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_preferred_floor_fk;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_preferred_floor_fk
  FOREIGN KEY (preferred_floor_id, restaurant_id)
  REFERENCES public.hotel_floors(id, restaurant_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS room_types_default_building_idx
  ON public.room_types(default_building_id);
CREATE INDEX IF NOT EXISTS room_types_default_wing_idx
  ON public.room_types(default_wing_id);
CREATE INDEX IF NOT EXISTS room_types_preferred_floor_idx
  ON public.room_types(preferred_floor_id);

COMMENT ON COLUMN public.room_types.default_building_id IS
  'Nullable default/preference only. Physical placement is hotel_rooms.building_id.';
COMMENT ON COLUMN public.room_types.default_wing_id IS
  'Nullable default/preference only. Physical placement is hotel_rooms.wing_id.';
COMMENT ON COLUMN public.room_types.preferred_floor_id IS
  'Nullable floor preference only. Physical placement is hotel_rooms.floor_id.';

-- 3. Backfill type display / occupancy so tighter CHECKs can apply.
UPDATE public.room_types
SET
  display_name = COALESCE(NULLIF(btrim(display_name), ''), name),
  max_occupancy = GREATEST(max_occupancy, adult_capacity + child_capacity, 1),
  standard_occupancy = LEAST(
    GREATEST(max_occupancy, adult_capacity + child_capacity, 1),
    GREATEST(1, COALESCE(NULLIF(standard_occupancy, 0), adult_capacity, max_occupancy, 1))
  ),
  infant_capacity = GREATEST(infant_capacity, 0);

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_capacity_check;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_capacity_check
  CHECK (
    max_occupancy > 0
    AND adult_capacity >= 0
    AND child_capacity >= 0
    AND infant_capacity >= 0
    AND standard_occupancy >= 1
    AND standard_occupancy <= max_occupancy
    AND adult_capacity + child_capacity <= max_occupancy
  );

-- 4. Multi-row bed configuration.
CREATE TABLE IF NOT EXISTS public.room_type_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  bed_type text NOT NULL,
  bed_size text,
  bed_count integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_type_beds_count_check CHECK (bed_count > 0),
  CONSTRAINT room_type_beds_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT room_type_beds_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS room_type_beds_type_idx
  ON public.room_type_beds(restaurant_id, room_type_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_beds TO authenticated;
GRANT ALL ON public.room_type_beds TO service_role;
ALTER TABLE public.room_type_beds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read room type beds" ON public.room_type_beds;
CREATE POLICY "Members read room type beds" ON public.room_type_beds
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert room type beds" ON public.room_type_beds;
CREATE POLICY "Managers insert room type beds" ON public.room_type_beds
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update room type beds" ON public.room_type_beds;
CREATE POLICY "Managers update room type beds" ON public.room_type_beds
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete room type beds" ON public.room_type_beds;
CREATE POLICY "Managers delete room type beds" ON public.room_type_beds
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_room_type_beds_updated_at ON public.room_type_beds;
CREATE TRIGGER set_room_type_beds_updated_at BEFORE UPDATE ON public.room_type_beds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.room_type_beds (
  restaurant_id, room_type_id, bed_type, bed_count, sort_order
)
SELECT
  rt.restaurant_id,
  rt.id,
  btrim(rt.bed_type),
  GREATEST(rt.bed_count, 1),
  0
FROM public.room_types rt
WHERE rt.bed_type IS NOT NULL
  AND btrim(rt.bed_type) <> ''
  AND rt.bed_count IS NOT NULL
  AND rt.bed_count > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.room_type_beds b
    WHERE b.room_type_id = rt.id
      AND b.restaurant_id = rt.restaurant_id
  );

-- 5. Physical room dimensions (operational status vocabulary unchanged).
ALTER TABLE public.hotel_rooms
  ADD COLUMN IF NOT EXISTS room_code text,
  ADD COLUMN IF NOT EXISTS maintenance_status text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS sellable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS room_features text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.hotel_rooms
  DROP CONSTRAINT IF EXISTS hotel_rooms_maintenance_status_check;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_maintenance_status_check
  CHECK (
    maintenance_status IN (
      'normal',
      'maintenance_required',
      'in_progress',
      'out_of_service',
      'out_of_order',
      'inspection'
    )
  );

UPDATE public.hotel_rooms
SET room_code = room_number
WHERE room_code IS NULL OR btrim(room_code) = '';

ALTER TABLE public.hotel_rooms
  DROP CONSTRAINT IF EXISTS hotel_rooms_code_unique;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_code_unique UNIQUE (restaurant_id, room_code);

CREATE INDEX IF NOT EXISTS hotel_rooms_maintenance_status_idx
  ON public.hotel_rooms(restaurant_id, maintenance_status);
CREATE INDEX IF NOT EXISTS hotel_rooms_sellable_idx
  ON public.hotel_rooms(restaurant_id, sellable);

COMMENT ON COLUMN public.hotel_rooms.room_code IS
  'Unique per property. Distinct from room_number.';
COMMENT ON COLUMN public.hotel_rooms.maintenance_status IS
  'Independent of hotel_rooms.status (operational). Overlapping out_of_order/out_of_service labels are intentional.';
COMMENT ON COLUMN public.hotel_rooms.sellable IS
  'Stored sellable dimension. Assignment availability is derived from operational + housekeeping + maintenance + sellable.';
COMMENT ON COLUMN public.hotel_rooms.room_features IS
  'Lightweight room-specific tags. Not the amenities catalogue (Card 2 Phase 2).';
COMMENT ON COLUMN public.hotel_rooms.status IS
  'Operational status only: available | out_of_order | out_of_service. Unchanged by 0064.';

-- 6. Connecting / adjacent links.
CREATE TABLE IF NOT EXISTS public.hotel_room_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  other_room_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_room_links_kind_check CHECK (kind IN ('connecting', 'adjacent')),
  CONSTRAINT hotel_room_links_distinct_check CHECK (room_id <> other_room_id),
  CONSTRAINT hotel_room_links_pair_unique UNIQUE (room_id, other_room_id, kind),
  CONSTRAINT hotel_room_links_room_fk FOREIGN KEY (room_id, restaurant_id)
    REFERENCES public.hotel_rooms(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT hotel_room_links_other_fk FOREIGN KEY (other_room_id, restaurant_id)
    REFERENCES public.hotel_rooms(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hotel_room_links_restaurant_idx
  ON public.hotel_room_links(restaurant_id);
CREATE INDEX IF NOT EXISTS hotel_room_links_other_idx
  ON public.hotel_room_links(other_room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_room_links TO authenticated;
GRANT ALL ON public.hotel_room_links TO service_role;
ALTER TABLE public.hotel_room_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read room links" ON public.hotel_room_links;
CREATE POLICY "Members read room links" ON public.hotel_room_links
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert room links" ON public.hotel_room_links;
CREATE POLICY "Managers insert room links" ON public.hotel_room_links
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update room links" ON public.hotel_room_links;
CREATE POLICY "Managers update room links" ON public.hotel_room_links
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete room links" ON public.hotel_room_links;
CREATE POLICY "Managers delete room links" ON public.hotel_room_links
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

COMMENT ON TABLE public.hotel_room_links IS
  'Connecting and adjacent physical-room pairs. Same-restaurant FKs only.';
COMMENT ON TABLE public.room_type_beds IS
  'Multi-row bed configuration per room type. Source of truth over room_types.bed_type/bed_count.';
